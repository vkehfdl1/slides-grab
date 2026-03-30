import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

import { SLIDE_PX } from '../slide-dimensions.js';

export const SLIDE_SIZE = SLIDE_PX;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function normalizeSelection(rawSelection, slideSize = SLIDE_SIZE) {
  if (!rawSelection || typeof rawSelection !== 'object') {
    throw new Error('Selection is required.');
  }

  const maxWidth = slideSize.width;
  const maxHeight = slideSize.height;

  const x1 = clamp(Math.round(toFiniteNumber(rawSelection.x, 0)), 0, maxWidth);
  const y1 = clamp(Math.round(toFiniteNumber(rawSelection.y, 0)), 0, maxHeight);
  const w = Math.max(1, Math.round(toFiniteNumber(rawSelection.width, 1)));
  const h = Math.max(1, Math.round(toFiniteNumber(rawSelection.height, 1)));

  const x2 = clamp(x1 + w, 0, maxWidth);
  const y2 = clamp(y1 + h, 0, maxHeight);

  return {
    x: x1,
    y: y1,
    width: Math.max(1, x2 - x1),
    height: Math.max(1, y2 - y1),
  };
}

export function scaleSelectionToScreenshot(selection, sourceSize, targetSize) {
  const sourceWidth = sourceSize?.width ?? SLIDE_SIZE.width;
  const sourceHeight = sourceSize?.height ?? SLIDE_SIZE.height;
  const targetWidth = targetSize?.width;
  const targetHeight = targetSize?.height;

  if (!Number.isFinite(targetWidth) || !Number.isFinite(targetHeight)) {
    throw new Error('Target size must include width and height.');
  }

  const sx = targetWidth / sourceWidth;
  const sy = targetHeight / sourceHeight;

  return {
    x: Math.max(0, Math.round(selection.x * sx)),
    y: Math.max(0, Math.round(selection.y * sy)),
    width: Math.max(1, Math.round(selection.width * sx)),
    height: Math.max(1, Math.round(selection.height * sy)),
  };
}

function formatTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return ['  - (No XPath targets were detected for this region.)'];
  }

  return targets.slice(0, 12).flatMap((target, index) => {
    const text = typeof target.text === 'string' && target.text.trim() !== ''
      ? target.text.trim().replace(/\s+/g, ' ').slice(0, 140)
      : '(no text)';
    return [
      `  - Target ${index + 1}`,
      `    - XPath: ${target.xpath}`,
      `    - Tag: ${target.tag || 'unknown'}`,
      `    - Text: ${text}`,
    ];
  });
}

export function buildCodexEditPrompt({ slideFile, slidePath, userPrompt, selections = [] }) {
  const sanitizedPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  if (!sanitizedPrompt) {
    throw new Error('Prompt must be a non-empty string.');
  }

  const normalizedSlidePath = typeof slidePath === 'string' && slidePath.trim() !== ''
    ? slidePath.trim()
    : (typeof slideFile === 'string' && slideFile.trim() !== '' ? `slides/${slideFile.trim()}` : '');
  if (!normalizedSlidePath) throw new Error('Slide path is required.');

  if (!Array.isArray(selections) || selections.length === 0) {
    throw new Error('At least one selection is required.');
  }

  const selectionLines = selections.flatMap((selection, index) => {
    const bbox = selection.bbox ?? selection;
    return [
      `Region ${index + 1}`,
      `- Bounding box: x=${bbox.x}, y=${bbox.y}, width=${bbox.width}, height=${bbox.height}`,
      '- XPath targets:',
      ...formatTargets(selection.targets),
      '',
    ];
  });

  return [
    `Edit ${normalizedSlidePath} only.`,
    '',
    'User edit request:',
    sanitizedPrompt,
    '',
    'Selected regions on slide (960x540 coordinate space):',
    ...selectionLines,
    'Rules:',
    '- Modify only the requested slide file.',
    '- Keep existing structure/content unless the request requires a change.',
    '- Keep slide dimensions at 720pt x 405pt.',
    '- Keep text in semantic tags (<p>, <h1>-<h6>, <ul>, <ol>, <li>).',
    '- Return after applying the change.',
  ].join('\n');
}

export function buildCodexExecArgs({ prompt, imagePath, model }) {
  const args = [
    '--dangerously-bypass-approvals-and-sandbox',
    'exec',
    '--color',
    'never',
  ];

  if (typeof model === 'string' && model.trim() !== '') {
    args.push('--model', model.trim());
  }

  if (typeof imagePath === 'string' && imagePath.trim() !== '') {
    args.push('--image', imagePath.trim());
  }

  args.push('--', prompt);
  return args;
}

export const CLAUDE_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6'];

export function isClaudeModel(model) {
  return typeof model === 'string' && CLAUDE_MODELS.includes(model.trim());
}

export function buildClaudeExecArgs({ prompt, imagePath, model }) {
  const args = [
    '-p',
    '--dangerously-skip-permissions',
    '--model', model.trim(),
    '--max-turns', '30',
    '--verbose',
  ];

  let fullPrompt = prompt;
  if (typeof imagePath === 'string' && imagePath.trim() !== '') {
    fullPrompt = `First, read the annotated screenshot at "${imagePath.trim()}" to see the visual context of the bbox regions highlighted on the slide.\n\n${prompt}`;
  }

  args.push(fullPrompt);
  return args;
}

function buildAnnotationSvg(width, height, bbox) {
  const boxes = Array.isArray(bbox) ? bbox : [bbox];

  const overlayItems = boxes.flatMap((item, index) => {
    const x = item.x;
    const y = item.y;
    const w = item.width;
    const h = item.height;
    const labelY = Math.max(18, y - 6);
    return [
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(239,68,68,0.12)"/>`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#EF4444" stroke-width="4" filter="url(#shadow)"/>`,
      `<rect x="${x}" y="${Math.max(0, labelY - 16)}" width="22" height="18" fill="#EF4444"/>`,
      `<text x="${x + 11}" y="${labelY - 3}" text-anchor="middle" font-size="12" font-family="Arial, sans-serif" fill="#FFFFFF">${index + 1}</text>`,
    ];
  });

  return [
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    '<filter id="shadow"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-opacity="0.8"/></filter>',
    '</defs>',
    ...overlayItems,
    '</svg>',
  ].join('');
}

export async function writeAnnotatedScreenshot(inputImagePath, outputImagePath, bbox) {
  await mkdir(dirname(outputImagePath), { recursive: true });

  const image = sharp(inputImagePath);
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error('Could not read screenshot dimensions.');
  }

  const svg = buildAnnotationSvg(width, height, bbox);
  const svgBuffer = Buffer.from(svg, 'utf8');

  await image
    .composite([{ input: svgBuffer, top: 0, left: 0 }])
    .png()
    .toFile(outputImagePath);
}
