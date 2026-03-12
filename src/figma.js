import { basename, dirname, extname, join, resolve } from 'node:path';

export const DEFAULT_FIGMA_SUFFIX = '-figma.pptx';
export const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;

export function buildDefaultFigmaOutput(slidesDir) {
  const absoluteSlidesDir = resolve(slidesDir);
  const deckName = basename(absoluteSlidesDir);
  const parentDir = dirname(absoluteSlidesDir);
  return join(parentDir, `${deckName}${DEFAULT_FIGMA_SUFFIX}`);
}

export function normalizeFigmaOutput(slidesDir, output) {
  if (typeof output === 'string' && output.trim() !== '') {
    const trimmed = output.trim();
    return extname(trimmed).toLowerCase() === '.pptx' ? trimmed : `${trimmed}.pptx`;
  }

  return buildDefaultFigmaOutput(slidesDir);
}

export function getFigmaImportCaveats() {
  return [
    'Figma imports PPTX best-effort. Complex layouts, shadows, and grouped elements can shift or flatten.',
    'Fonts are resolved inside Figma. If Pretendard is unavailable there, expect substitution and reflow.',
    'Import is one-way. Re-importing creates a new Figma Slides file instead of updating the existing one.',
    'Review every imported slide, especially chart-heavy slides and text near slide edges.',
  ];
}

function toSlideOrder(fileName) {
  const match = fileName.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

export function sortFigmaSlideFiles(a, b) {
  const orderA = toSlideOrder(a);
  const orderB = toSlideOrder(b);
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b);
}
