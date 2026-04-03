/**
 * Source document parsers for the import pipeline.
 * Converts PDF, URL, and text sources to plain text for AI outline generation.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import { renderPdfPages } from './pdf-vision.js';

/**
 * Detect source type from input string.
 * @param {string} input - File path or URL
 * @returns {'pdf' | 'url' | 'markdown'}
 */
export function detectSourceType(input) {
  if (/^https?:\/\//i.test(input)) return 'url';
  const ext = extname(input).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  return 'markdown';
}

/**
 * Extract text from a PDF file.
 * @param {string|Buffer} source - File path or Buffer
 * @returns {Promise<{text: string, pages: number}>}
 */
export async function parsePdf(source) {
  const { PDFParse } = await import('pdf-parse');
  const raw = Buffer.isBuffer(source) ? source : await readFile(source);
  const uint8 = new Uint8Array(raw);
  const parser = new PDFParse(uint8, {});
  try {
    await parser.load();
    const result = await parser.getText();
    const text = typeof result === 'string' ? result : (result?.text ?? '');
    const pages = typeof result === 'object' ? (result?.total ?? 0) : 0;
    return { text: text.trim(), pages };
  } finally {
    parser.destroy();
  }
}

/**
 * Extract article content from a URL.
 * Strips nav, footer, scripts, ads — keeps main content.
 * @param {string} url
 * @returns {Promise<{text: string, title: string}>}
 */
export async function parseUrl(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; slides-grab/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: HTTP ${res.status}`);
  }

  const html = await res.text();
  const { load } = await import('cheerio');
  const $ = load(html);

  // Remove non-content elements
  $('script, style, nav, footer, header, aside, iframe, noscript, .ad, .ads, .advertisement, [role="banner"], [role="navigation"], [role="complementary"]').remove();

  const title = $('title').first().text().trim()
    || $('h1').first().text().trim()
    || '';

  // Try <article> or <main> first, fall back to <body>
  let content = '';
  const mainEl = $('article, main, [role="main"]').first();
  if (mainEl.length) {
    content = mainEl.text();
  } else {
    content = $('body').text();
  }

  // Normalize whitespace
  const text = content
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, title };
}

/**
 * Read a text/markdown file.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function parseText(filePath) {
  let text = await readFile(filePath, 'utf-8');
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text.trim();
}

/**
 * Extract text + render page images from a PDF.
 * Combines parsePdf (text) with renderPdfPages (vision).
 * @param {string|Buffer} source - File path or Buffer
 * @param {string} outputDir - Directory for page-NN.png files
 * @param {object} [options] - Options passed to renderPdfPages
 * @returns {Promise<{text: string, pages: number, pageImages: string[], totalPages: number, renderedPages: number}>}
 */
export async function parsePdfWithVision(source, outputDir, options = {}) {
  const buf = Buffer.isBuffer(source) ? source : await readFile(source);
  // Each function gets its own Buffer copy — pdfjs-dist's LoopbackPort transfers
  // (detaches) the underlying ArrayBuffer via structuredClone, so sharing is unsafe
  const [{ text, pages }, { pageImages, totalPages, renderedPages }] = await Promise.all([
    parsePdf(Buffer.from(buf)),
    renderPdfPages(Buffer.from(buf), outputDir, options),
  ]);
  return { text, pages, pageImages, totalPages, renderedPages };
}

/**
 * Unified parser: auto-detect type and extract text.
 * @param {string} input - File path or URL
 * @param {Buffer} [buffer] - Optional pre-read buffer (for uploaded files)
 * @param {object} [opts] - Additional options
 * @param {boolean} [opts.vision] - Enable vision (PDF page images)
 * @param {string} [opts.visionOutputDir] - Directory for page images
 * @returns {Promise<{text: string, sourceType: string, meta: object}>}
 */
export async function parseSource(input, buffer, { vision = false, visionOutputDir = '' } = {}) {
  const sourceType = detectSourceType(input);

  switch (sourceType) {
    case 'pdf': {
      if (vision && visionOutputDir) {
        const result = buffer
          ? await parsePdfWithVision(buffer, visionOutputDir)
          : await parsePdfWithVision(input, visionOutputDir);
        return {
          text: result.text,
          sourceType,
          meta: {
            pages: result.pages,
            originalPath: input,
            pageImages: result.pageImages,
            totalPages: result.totalPages,
            renderedPages: result.renderedPages,
          },
        };
      }
      const { text, pages } = buffer
        ? await parsePdf(buffer)
        : await parsePdf(input);
      return { text, sourceType, meta: { pages, originalPath: input } };
    }
    case 'url': {
      const { text, title } = await parseUrl(input);
      return { text, sourceType, meta: { title, originalUrl: input } };
    }
    case 'markdown':
    default: {
      const text = buffer
        ? buffer.toString('utf-8').trim()
        : await parseText(input);
      return { text, sourceType, meta: { originalPath: input } };
    }
  }
}
