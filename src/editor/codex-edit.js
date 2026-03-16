import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

import { getPackageRoot } from '../resolve.js';

export const SLIDE_SIZE = { width: 960, height: 540 };

const PPT_DESIGN_SKILL_PATH = join(getPackageRoot(), 'skills', 'slides-grab-design', 'SKILL.md');
const DETAILED_DESIGN_SKILL_PATH = join(getPackageRoot(), '.claude', 'skills', 'design-skill', 'SKILL.md');
const DETAILED_DESIGN_SECTION_HEADINGS = [
  '## Base Settings',
  '### 4. Image Usage Rules (Local Asset / Data URL / Remote URL / Placeholder)',
  '## Text Usage Rules',
  '## Workflow (Stage 2: Design + Human Review)',
  '## Important Notes',
];
const DETAILED_DESIGN_SKILL_FALLBACK = [
  '## Base Settings',
  '',
  '### Slide Size (16:9 default)',
  '- Keep slide body at 720pt x 405pt.',
  '- Use Pretendard as the default font stack.',
  '- Include the Pretendard webfont CDN link when needed.',
  '',
  '### 4. Image Usage Rules (Local Asset / Data URL / Remote URL / Placeholder)',
  '- Always include alt on img tags.',
  '- Use ./assets/<file> as the default image contract for slide HTML.',
  '- Keep slide assets in <slides-dir>/assets/.',
  '- data: URLs are allowed for fully self-contained slides.',
  '- Remote https:// URLs are allowed but non-deterministic and fallback only.',
  '- Do not use absolute filesystem paths in slide HTML.',
  '- Do not use non-body background-image for content imagery; use <img> instead.',
  '- Use data-image-placeholder to reserve space when no image is available yet.',
  '',
  '## Text Usage Rules',
  '- All text must be inside <p>, <h1>-<h6>, <ul>, <ol>, or <li>.',
  '- Never place text directly in <div> or <span>.',
  '',
  '## Workflow (Stage 2: Design + Human Review)',
  '- After slide generation or edits, run node scripts/build-viewer.js --slides-dir <path>.',
  '- Edit only the relevant HTML file during revision loops.',
  '- Never start PPTX conversion without explicit approval.',
  '- Never forget to rebuild the viewer after slide changes.',
  '',
  '## Important Notes',
  '- CSS gradients are not supported in PowerPoint conversion; replace them with background images.',
  '- Always include the Pretendard CDN link.',
  '- Use ./assets/<file> from each slide-XX.html and avoid absolute filesystem paths.',
  '- Always include # prefix in CSS colors.',
  '- Never place text directly in div/span.',
].join('\n');

let cachedPptDesignSkillPrompt = null;
let cachedDetailedDesignSkillPrompt = null;

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

export function getPptDesignSkillPrompt() {
  if (cachedPptDesignSkillPrompt !== null) {
    return cachedPptDesignSkillPrompt;
  }

  try {
    cachedPptDesignSkillPrompt = readFileSync(PPT_DESIGN_SKILL_PATH, 'utf8').trim();
  } catch {
    cachedPptDesignSkillPrompt = '';
  }

  return cachedPptDesignSkillPrompt;
}

function extractMarkdownSection(markdown, heading) {
  const lines = markdown.split('\n');
  const startIndex = lines.findIndex((line) => line.trim() === heading.trim());
  if (startIndex === -1) {
    return '';
  }

  const levelMatch = heading.match(/^(#+)\s/);
  const headingLevel = levelMatch ? levelMatch[1].length : null;
  if (!headingLevel) {
    return '';
  }

  const extracted = [lines[startIndex]];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const nextHeadingMatch = line.match(/^(#+)\s/);
    if (nextHeadingMatch && nextHeadingMatch[1].length <= headingLevel) {
      break;
    }
    extracted.push(line);
  }

  return extracted.join('\n').trim();
}

export function getDetailedDesignSkillPrompt() {
  if (cachedDetailedDesignSkillPrompt !== null) {
    return cachedDetailedDesignSkillPrompt;
  }

  try {
    const markdown = readFileSync(DETAILED_DESIGN_SKILL_PATH, 'utf8');
    const sections = DETAILED_DESIGN_SECTION_HEADINGS
      .map((heading) => extractMarkdownSection(markdown, heading))
      .filter(Boolean);

    cachedDetailedDesignSkillPrompt = sections.length > 0
      ? sections.join('\n\n')
      : DETAILED_DESIGN_SKILL_FALLBACK;
  } catch {
    cachedDetailedDesignSkillPrompt = DETAILED_DESIGN_SKILL_FALLBACK;
  }

  return cachedDetailedDesignSkillPrompt;
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

  const pptDesignSkillPrompt = getPptDesignSkillPrompt();
  const skillLines = pptDesignSkillPrompt
    ? [
        'Project skill guidance (follow strictly):',
        `Source: ${PPT_DESIGN_SKILL_PATH}`,
        pptDesignSkillPrompt,
        '',
      ]
    : [];
  const detailedDesignSkillPrompt = getDetailedDesignSkillPrompt();
  const detailedSkillLines = detailedDesignSkillPrompt
    ? [
        'Detailed design/export guardrails (selected from the full design system):',
        `Primary source: ${DETAILED_DESIGN_SKILL_PATH}`,
        detailedDesignSkillPrompt,
        '',
      ]
    : [];

  return [
    `Edit ${normalizedSlidePath} only.`,
    '',
    ...skillLines,
    ...detailedSkillLines,
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
    '- Keep local assets under ./assets/ and preserve portable relative paths.',
    '- Do not persist runtime-only editor/viewer injections such as <base>, debug scripts, or viewer wrapper markup into the slide file.',
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
