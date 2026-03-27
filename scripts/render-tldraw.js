#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildFixedSizeSvg,
  buildTldrawImportUrl,
  DEFAULT_TLDRAW_HEIGHT,
  DEFAULT_TLDRAW_OUTPUT,
  DEFAULT_TLDRAW_PADDING,
  DEFAULT_TLDRAW_WIDTH,
  getTldrawUsage,
  loadTldrawInput,
  main,
  normalizeTldrawSnapshot,
  parseTldrawCliArgs,
  renderTldrawFile,
  renderTldrawSnapshot,
} from '../src/tldraw/render.js';

export {
  buildFixedSizeSvg,
  buildTldrawImportUrl,
  DEFAULT_TLDRAW_HEIGHT,
  DEFAULT_TLDRAW_OUTPUT,
  DEFAULT_TLDRAW_PADDING,
  DEFAULT_TLDRAW_WIDTH,
  getTldrawUsage,
  loadTldrawInput,
  normalizeTldrawSnapshot,
  parseTldrawCliArgs,
  renderTldrawFile,
  renderTldrawSnapshot,
};

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(`[slides-grab] ${error.message}`);
    process.exit(1);
  });
}
