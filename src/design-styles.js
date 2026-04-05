import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RAW_DESIGN_STYLES } from './design-styles-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DESIGN_STYLES_SOURCE = Object.freeze({
  name: 'PPT Design Collections',
  repo: 'corazzon/pptx-design-styles',
  url: 'https://github.com/corazzon/pptx-design-styles',
  previewUrl: 'https://corazzon.github.io/pptx-design-styles/preview/modern-pptx-designs-30.html',
  references: [
    'README.md',
    'preview/modern-pptx-designs-30.html',
    'references/styles.md',
  ],
  license: 'MIT',
  citation: 'Design collections derived from corazzon/pptx-design-styles. Styles 31–35 are slides-grab originals.',
});

const DESIGN_STYLES = RAW_DESIGN_STYLES.map((style) => Object.freeze({
  ...style,
  source: DESIGN_STYLES_SOURCE,
}));

const DESIGN_STYLES_BY_ID = new Map(DESIGN_STYLES.map((style) => [style.id, style]));

export function listDesignStyles() {
  return DESIGN_STYLES;
}

export function getDesignStyle(styleId) {
  if (!styleId) {
    return null;
  }
  return DESIGN_STYLES_BY_ID.get(styleId) ?? null;
}

export function requireDesignStyle(styleId) {
  const style = getDesignStyle(styleId);
  if (!style) {
    throw new Error(`Unknown style "${styleId}". Run "slides-grab list-styles" to inspect the bundled collection.`);
  }
  return style;
}

export function getPreviewHtmlPath() {
  return resolve(__dirname, '..', 'templates', 'design-styles', 'preview.html');
}

export function buildStylePreviewHtml() {
  return readFileSync(getPreviewHtmlPath(), 'utf-8');
}
