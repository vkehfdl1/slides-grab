import { mkdir } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

export const DEFAULT_FIGMA_SUFFIX = '-figma.pptx';
export const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
export const FIGMA_EXPORT_LAYOUT_NAME = 'SLIDES_GRAB_STANDARD';
export const SLIDE_WIDTH_INCHES = 10;
export const SLIDE_HEIGHT_INCHES = 5.625;

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
    'Figma export is experimental / unstable. Figma imports PPTX best-effort, and complex layouts, shadows, and grouped elements can shift or flatten.',
    'Fonts are resolved inside Figma. If Pretendard is unavailable there, expect substitution and reflow.',
    'Import is one-way. Re-importing creates a new Figma Slides file instead of updating the existing one.',
    'Review every imported slide, especially chart-heavy slides and text near slide edges.',
  ];
}

export function getFigmaManualImportInstructions() {
  return 'Figma Slides -> Import -> select the generated .pptx file.';
}

export function configureFigmaExportPresentation(pres) {
  pres.defineLayout({
    name: FIGMA_EXPORT_LAYOUT_NAME,
    width: SLIDE_WIDTH_INCHES,
    height: SLIDE_HEIGHT_INCHES,
  });
  pres.layout = FIGMA_EXPORT_LAYOUT_NAME;
  return pres;
}

export async function ensureOutputDirectory(outputFile) {
  await mkdir(dirname(resolve(outputFile)), { recursive: true });
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
