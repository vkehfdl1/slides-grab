import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

import { getPackageRoot } from '../resolve.js';

export const SLIDE_SIZE = { width: 960, height: 540 };

const PPT_DESIGN_SKILL_PATH = join(getPackageRoot(), 'skills', 'slides-grab-design', 'SKILL.md');
const DETAILED_DESIGN_SKILL_PATH = join(getPackageRoot(), 'skills', 'slides-grab-design', 'references', 'detailed-design-rules.md');
const BEAUTIFUL_SLIDE_DEFAULTS_PATH = join(getPackageRoot(), 'skills', 'slides-grab-design', 'references', 'beautiful-slide-defaults.md');
const EDITOR_PPT_DESIGN_SECTION_HEADINGS = [
  '## Workflow',
  '## Rules',
];
const DETAILED_DESIGN_SECTION_HEADINGS = [
  '## Base Settings',
  '## Text Usage Rules',
  '## Workflow (Stage 2: Design + Human Review)',
  '## Important Notes',
];
const BEAUTIFUL_SLIDE_DEFAULTS_SECTION_HEADINGS = [
  '## Working Model',
  '## Beautiful Defaults for Slides',
  '## Narrative Sequence for Decks',
  '## Review Litmus',
];
const EDITOR_PPT_DESIGN_DUPLICATE_PATTERNS = [
  /visual thesis/i,
  /content plan/i,
  /dominant visual anchor/i,
  /cardless layouts/i,
  /whitespace, alignment, scale, cropping, and contrast/i,
  /opening slides and section dividers like posters/i,
];
const EDITOR_PPT_DESIGN_SKILL_FALLBACK = [
  '## Workflow',
  '1. Read approved `slide-outline.md` or the existing slide before editing.',
  '2. When a slide needs bespoke imagery, prefer `slides-grab image --prompt "<prompt>" --slides-dir <path>` so Nano Banana Pro saves a local asset under `<slides-dir>/assets/`.',
  '3. Run `slides-grab validate --slides-dir <path>` after generation or edits.',
  '4. If validation fails, automatically fix the source slide HTML/CSS and re-run validation until it passes.',
  '5. Run `slides-grab build-viewer --slides-dir <path>` only after validation passes.',
  '6. Run the slide litmus check from `references/beautiful-slide-defaults.md` before presenting the deck for review.',
  '7. Iterate on user feedback by editing only requested slide files, then re-run validation and rebuild the viewer.',
  '8. Keep revising until user approves conversion stage.',
  '',
  '## Rules',
  '- Keep slide size 720pt x 405pt.',
  '- Keep semantic text tags (`p`, `h1-h6`, `ul`, `ol`, `li`).',
  '- Put local images under `<slides-dir>/assets/` and reference them as `./assets/<file>`.',
  '- Allow `data:` URLs when the slide must be fully self-contained.',
  '- Do not leave remote `http(s)://` image URLs in saved slide HTML; download source images into `<slides-dir>/assets/` and reference them as `./assets/<file>`.',
  '- Prefer `slides-grab image` with Nano Banana Pro for bespoke imagery when it improves the slide.',
  '- If `GOOGLE_API_KEY` or `GEMINI_API_KEY` is unavailable, or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into `<slides-dir>/assets/`.',
  '- Prefer `<img>` for slide imagery and `data-image-placeholder` when no final asset exists.',
  '- Do not present slides for review until `slides-grab validate --slides-dir <path>` passes.',
  '- Do not start conversion before approval.',
  '- Use the packaged CLI and bundled references only; do not depend on unpublished agent-specific files.',
].join('\n');
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
  '- Use `slides-grab image --prompt "<prompt>" --slides-dir <path>` with Nano Banana Pro when the slide needs bespoke imagery.',
  '- data: URLs are allowed for fully self-contained slides.',
  '- Do not leave remote http(s):// image URLs in saved slide HTML; download source images into <slides-dir>/assets/ and reference them as ./assets/<file>.',
  '- If GOOGLE_API_KEY or GEMINI_API_KEY is unavailable, or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into <slides-dir>/assets/.',
  '- Do not use absolute filesystem paths in slide HTML.',
  '- Do not use non-body background-image for content imagery; use <img> instead.',
  '- Use data-image-placeholder to reserve space when no image is available yet.',
  '',
  '## Text Usage Rules',
  '- All text must be inside <p>, <h1>-<h6>, <ul>, <ol>, or <li>.',
  '- Never place text directly in <div> or <span>.',
  '',
  '## Workflow (Stage 2: Design + Human Review)',
  '- After slide generation or edits, run slides-grab build-viewer --slides-dir <path>.',
  '- Edit only the relevant HTML file during revision loops.',
  '- Prefer slides-grab image before remote image sourcing when a slide explicitly needs bespoke imagery.',
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
const BEAUTIFUL_SLIDE_DEFAULTS_FALLBACK = [
  '## Working Model',
  '',
  'Before building the deck, write two things:',
  '- **visual thesis** — one sentence describing the mood, material, energy, and imagery treatment.',
  '- **content plan** — opener → support/proof → detail/story → close/CTA or decision.',
  '- Define design tokens early: background, surface, primary text, muted text, accent, plus display/headline/body/caption roles.',
  '',
  '## Beautiful Defaults for Slides',
  '- Start with composition, not components.',
  '- Treat the opening slide like a poster and make the title or brand the loudest text.',
  '- Give each slide one job, one primary takeaway, and one dominant visual anchor.',
  '- Keep copy short enough to scan in seconds.',
  '- Use whitespace, alignment, scale, cropping, and contrast before adding chrome.',
  '- Limit the system by default: two typefaces max and one accent color.',
  '- Default to cardless layouts unless a card improves structure or understanding.',
  '',
  '## Narrative Sequence for Decks',
  '- Opener → support/proof → detail/story → close/CTA or decision.',
  '- Section dividers should reset the visual tempo.',
  '',
  '## Review Litmus',
  '- Can the audience grasp the main point of each slide in 3–5 seconds?',
  '- Does the slide have one dominant idea instead of competing blocks?',
  '- Is there one real visual anchor, not just decoration?',
  '- Would this still feel premium without shadows, cards, or extra chrome?',
].join('\n');

let cachedPptDesignSkillPrompt = null;
let cachedEditorPptDesignSkillPrompt = null;
let cachedStructuralDesignSkillPrompt = null;
let cachedSlideArtDirectionPrompt = null;

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

function getEditorPptDesignSkillPrompt() {
  if (cachedEditorPptDesignSkillPrompt !== null) {
    return cachedEditorPptDesignSkillPrompt;
  }

  const prompt = loadMarkdownSections(
    PPT_DESIGN_SKILL_PATH,
    EDITOR_PPT_DESIGN_SECTION_HEADINGS,
    EDITOR_PPT_DESIGN_SKILL_FALLBACK,
  );

  cachedEditorPptDesignSkillPrompt = pruneDuplicateLines(
    prompt,
    EDITOR_PPT_DESIGN_DUPLICATE_PATTERNS,
  );

  return cachedEditorPptDesignSkillPrompt;
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

function pruneDuplicateLines(markdown, patterns) {
  const lines = markdown.split('\n');
  const filtered = [];

  for (const line of lines) {
    if (patterns.some((pattern) => pattern.test(line))) {
      continue;
    }

    const previousLine = filtered.at(-1) ?? '';
    if (line.trim() === '' && previousLine.trim() === '') {
      continue;
    }

    filtered.push(line);
  }

  return filtered.join('\n').trim();
}

function loadMarkdownSections(markdownPath, headings, fallback) {
  try {
    const markdown = readFileSync(markdownPath, 'utf8');
    const sections = headings
      .map((heading) => extractMarkdownSection(markdown, heading))
      .filter(Boolean);

    return sections.length > 0
      ? sections.join('\n\n')
      : fallback;
  } catch {
    return fallback;
  }
}

function getStructuralDesignSkillPrompt() {
  if (cachedStructuralDesignSkillPrompt !== null) {
    return cachedStructuralDesignSkillPrompt;
  }

  cachedStructuralDesignSkillPrompt = loadMarkdownSections(
    DETAILED_DESIGN_SKILL_PATH,
    DETAILED_DESIGN_SECTION_HEADINGS,
    DETAILED_DESIGN_SKILL_FALLBACK,
  );

  return cachedStructuralDesignSkillPrompt;
}

function getSlideArtDirectionPrompt() {
  if (cachedSlideArtDirectionPrompt !== null) {
    return cachedSlideArtDirectionPrompt;
  }

  cachedSlideArtDirectionPrompt = loadMarkdownSections(
    BEAUTIFUL_SLIDE_DEFAULTS_PATH,
    BEAUTIFUL_SLIDE_DEFAULTS_SECTION_HEADINGS,
    BEAUTIFUL_SLIDE_DEFAULTS_FALLBACK,
  );

  return cachedSlideArtDirectionPrompt;
}

export function getDetailedDesignSkillPrompt() {
  return [
    getStructuralDesignSkillPrompt(),
    getSlideArtDirectionPrompt(),
  ].filter(Boolean).join('\n\n');
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

  const pptDesignSkillPrompt = getEditorPptDesignSkillPrompt();
  const skillLines = pptDesignSkillPrompt
    ? [
        'Project skill guidance (follow strictly):',
        `Source: ${PPT_DESIGN_SKILL_PATH}`,
        pptDesignSkillPrompt,
        '',
      ]
    : [];
  const detailedDesignSkillPrompt = getStructuralDesignSkillPrompt();
  const detailedSkillLines = detailedDesignSkillPrompt
    ? [
        'Detailed design/export guardrails (selected from the full design system):',
        `Primary source: ${DETAILED_DESIGN_SKILL_PATH}`,
        detailedDesignSkillPrompt,
        '',
      ]
    : [];
  const slideArtDirectionPrompt = getSlideArtDirectionPrompt();
  const slideArtDirectionLines = slideArtDirectionPrompt
    ? [
        'Slide art direction defaults (packaged guidance for beautiful HTML slides):',
        `Primary source: ${BEAUTIFUL_SLIDE_DEFAULTS_PATH}`,
        slideArtDirectionPrompt,
        '',
      ]
    : [];

  return [
    `Edit ${normalizedSlidePath} only.`,
    '',
    ...skillLines,
    ...detailedSkillLines,
    ...slideArtDirectionLines,
    'User edit request:',
    sanitizedPrompt,
    '',
    'Selected regions on slide (960x540 coordinate space):',
    ...selectionLines,
    'Rules:',
    '- Edit only the requested slide HTML file among slide-*.html files.',
    '- Do not modify any other slide HTML files unless explicitly requested.',
    '- Keep existing structure/content unless the request requires a change.',
    '- Keep slide dimensions at 720pt x 405pt.',
    '- Keep text in semantic tags (<p>, <h1>-<h6>, <ul>, <ol>, <li>).',
    '- You may add or update supporting files required for the requested slide, including local assets under <slides-dir>/assets/ and tldraw source/export files used to generate those assets.',
    '- When the request needs bespoke imagery, prefer `slides-grab image --prompt "<prompt>" --slides-dir <path>` so Nano Banana Pro saves the asset under <slides-dir>/assets/.',
    '- If GOOGLE_API_KEY or GEMINI_API_KEY is unavailable, or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into <slides-dir>/assets/.',
    '- If you create or update a supporting asset, store it under <slides-dir>/assets/ and reference it from the requested slide as ./assets/<file>.',
    '- Keep local assets under ./assets/ and preserve portable relative paths.',
    '- Do not modify unrelated assets, shared resources, or generated files that are not required for the requested slide.',
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
