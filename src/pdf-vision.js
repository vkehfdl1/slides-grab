/**
 * PDF page → PNG image renderer for vision-based analysis.
 * Uses pdfjs-dist (legacy Node.js build) + @napi-rs/canvas.
 */

import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_MAX_PAGES = 25;
const DEFAULT_SCALE = 2.0;

// Resolve standard font path once at module load
const require_ = createRequire(import.meta.url);
const pkgDir = dirname(require_.resolve('pdfjs-dist/package.json'));
const standardFontDataUrl = pathToFileURL(join(pkgDir, 'standard_fonts') + '/').href;

/**
 * Render PDF pages as PNG images.
 * @param {Buffer|string} source - PDF buffer or file path
 * @param {string} outputDir - Directory to write page-NN.png files
 * @param {object} [options]
 * @param {number} [options.maxPages] - Max pages to render (default 25, env SLIDES_GRAB_PDF_PAGE_LIMIT)
 * @param {number} [options.scale] - Render scale factor (default 2.0)
 * @returns {Promise<{pageImages: string[], totalPages: number, renderedPages: number}>}
 */
export async function renderPdfPages(source, outputDir, options = {}) {
  const maxPages = options.maxPages
    ?? (process.env.SLIDES_GRAB_PDF_PAGE_LIMIT ? Number(process.env.SLIDES_GRAB_PDF_PAGE_LIMIT) : DEFAULT_MAX_PAGES);
  const scale = options.scale ?? DEFAULT_SCALE;

  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');

  const data = Buffer.isBuffer(source) ? source : await readFile(source);
  // Copy to dedicated ArrayBuffer — Node.js Buffer may share a pooled ArrayBuffer
  // which cannot be transferred via structuredClone in pdfjs-dist LoopbackPort
  const uint8 = new Uint8Array(data);

  const doc = await getDocument({ data: uint8, useSystemFonts: true, standardFontDataUrl }).promise;
  const totalPages = doc.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);

  const pageImages = [];

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale });

    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBuffer = canvas.toBuffer('image/png');
    const fileName = `page-${String(i).padStart(2, '0')}.png`;
    const filePath = join(outputDir, fileName);
    await writeFile(filePath, pngBuffer);

    pageImages.push(filePath);
    page.cleanup();
  }

  doc.destroy();

  return { pageImages, totalPages, renderedPages: pagesToRender };
}
