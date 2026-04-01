/**
 * Logo overlay module.
 *
 * Handles deck.json loading, logo config resolution, and logo application
 * for PPTX (PptxGenJS) and PDF (pdf-lib) exports.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

import { SLIDE_IN } from './slide-dimensions.js';

// ---------------------------------------------------------------------------
// Position presets
// ---------------------------------------------------------------------------

const MARGIN_X = 0.2;
const MARGIN_Y = 0.15;
const DEFAULT_WIDTH = 1.1;
const DEFAULT_HEIGHT = 0.5;

const POSITION_PRESETS = {
  'top-right': (w, h) => ({
    x: SLIDE_IN.width - w - MARGIN_X,
    y: MARGIN_Y,
  }),
  'top-left': (_w, _h) => ({
    x: MARGIN_X,
    y: MARGIN_Y,
  }),
  'bottom-right': (w, h) => ({
    x: SLIDE_IN.width - w - MARGIN_X,
    y: SLIDE_IN.height - h - MARGIN_Y,
  }),
  'bottom-left': (_w, h) => ({
    x: MARGIN_X,
    y: SLIDE_IN.height - h - MARGIN_Y,
  }),
};

// ---------------------------------------------------------------------------
// deck.json loading
// ---------------------------------------------------------------------------

/**
 * Load deck.json from a slides directory. Returns null if not found.
 * @param {string} slidesDir - Absolute or relative path to the deck directory
 * @returns {object|null}
 */
export async function loadDeckConfig(slidesDir) {
  const configPath = join(resolve(slidesDir), 'deck.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Synchronous variant for CJS callers.
 */
export function loadDeckConfigSync(slidesDir) {
  const configPath = join(resolve(slidesDir), 'deck.json');
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write (or update) deck.json in the slides directory.
 * Merges the given partial config into the existing file.
 */
export async function writeDeckConfig(slidesDir, partial) {
  const configPath = join(resolve(slidesDir), 'deck.json');
  let existing = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(await readFile(configPath, 'utf-8'));
    } catch {
      // overwrite corrupt file
    }
  }
  const merged = { ...existing, ...partial };
  await writeFile(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return merged;
}

// ---------------------------------------------------------------------------
// Logo config resolution
// ---------------------------------------------------------------------------

/**
 * Resolve and validate a logo config object.
 * Returns a normalized config ready for use, or null if no logo is configured.
 *
 * @param {object} deckConfig - Full deck.json content (or null)
 * @param {string} slidesDir - Absolute path to the deck directory
 * @param {object} [cliOverrides] - CLI flag overrides (path, position, width, height, exclude)
 * @returns {object|null} Resolved logo config with { resolvedPath, x, y, width, height, slides, exclude }
 */
export function resolveLogoConfig(deckConfig, slidesDir, cliOverrides) {
  const logoSection = cliOverrides?.path
    ? { ...deckConfig?.logo, ...stripUndefined(cliOverrides) }
    : deckConfig?.logo;

  if (!logoSection?.path) return null;

  const width = Number(logoSection.width) || DEFAULT_WIDTH;
  const height = Number(logoSection.height) || DEFAULT_HEIGHT;

  // Resolve position
  let x, y;
  if (logoSection.x != null && logoSection.y != null) {
    x = Number(logoSection.x);
    y = Number(logoSection.y);
  } else {
    const preset = POSITION_PRESETS[logoSection.position || 'top-right'];
    if (!preset) {
      throw new Error(
        `Unknown logo position preset: "${logoSection.position}". Use one of: ${Object.keys(POSITION_PRESETS).join(', ')}`,
      );
    }
    const coords = preset(width, height);
    x = coords.x;
    y = coords.y;
  }

  // Resolve image path
  const imgPath = logoSection.path;
  let resolvedPath;
  if (imgPath.startsWith('data:') || imgPath.startsWith('https://') || imgPath.startsWith('http://')) {
    resolvedPath = imgPath;
  } else {
    resolvedPath = resolve(slidesDir, imgPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Logo file not found: ${imgPath} (resolved to ${resolvedPath})`);
    }
  }

  return {
    resolvedPath,
    x,
    y,
    width,
    height,
    opacity: logoSection.opacity != null ? Number(logoSection.opacity) : 1.0,
    slides: logoSection.slides || 'all',
    exclude: Array.isArray(logoSection.exclude) ? logoSection.exclude : [],
  };
}

// ---------------------------------------------------------------------------
// Slide applicability
// ---------------------------------------------------------------------------

/**
 * Check whether the logo should be applied to a given slide.
 * @param {number} slideIndex - 0-based slide index
 * @param {object} logoConfig - Resolved logo config
 * @returns {boolean}
 */
export function shouldApplyLogo(slideIndex, logoConfig) {
  if (!logoConfig) return false;

  const slideNumber = slideIndex + 1; // 1-based

  if (Array.isArray(logoConfig.slides)) {
    return logoConfig.slides.includes(slideNumber);
  }

  // slides === 'all': apply unless excluded
  if (logoConfig.exclude.includes(slideNumber)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Logo image loading (cached)
// ---------------------------------------------------------------------------

let _cachedImagePath = null;
let _cachedImageData = null;

/**
 * Load logo image data. Caches the result for repeated calls with the same path.
 * @param {string} resolvedPath - Absolute file path or data URL
 * @returns {Promise<{data: string|Buffer, mimeType: string}>}
 */
export async function loadLogoImage(resolvedPath) {
  if (_cachedImagePath === resolvedPath && _cachedImageData) {
    return _cachedImageData;
  }

  let data;
  let mimeType;

  if (resolvedPath.startsWith('data:')) {
    // data:image/png;base64,...
    data = resolvedPath;
    const match = resolvedPath.match(/^data:(image\/[^;]+)/);
    mimeType = match ? match[1] : 'image/png';
  } else if (resolvedPath.startsWith('https://') || resolvedPath.startsWith('http://')) {
    const response = await fetch(resolvedPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch logo from ${resolvedPath}: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    mimeType = response.headers.get('content-type') || guessMimeType(resolvedPath);
    data = `${mimeType};base64,${buffer.toString('base64')}`;
  } else {
    const buffer = await readFile(resolvedPath);
    mimeType = guessMimeType(resolvedPath);
    data = { buffer, mimeType, path: resolvedPath };
  }

  _cachedImagePath = resolvedPath;
  _cachedImageData = { data, mimeType };
  return _cachedImageData;
}

/**
 * Synchronous variant for CJS callers.
 */
export function loadLogoImageSync(resolvedPath) {
  if (_cachedImagePath === resolvedPath && _cachedImageData) {
    return _cachedImageData;
  }

  if (resolvedPath.startsWith('data:') || resolvedPath.startsWith('https://') || resolvedPath.startsWith('http://')) {
    throw new Error('Sync logo loading only supports local file paths');
  }

  const buffer = readFileSync(resolvedPath);
  const mimeType = guessMimeType(resolvedPath);
  const data = { buffer, mimeType, path: resolvedPath };

  _cachedImagePath = resolvedPath;
  _cachedImageData = { data, mimeType };
  return _cachedImageData;
}

/** Reset the image cache (useful for tests). */
export function clearLogoCache() {
  _cachedImagePath = null;
  _cachedImageData = null;
}

// ---------------------------------------------------------------------------
// HTML injection (render-time logo overlay)
// ---------------------------------------------------------------------------

const PT_PER_IN = 72;

/**
 * Inject a logo <img> element into slide HTML string.
 * Inserts an absolute-positioned image just before </body>.
 *
 * @param {string} html - Original slide HTML
 * @param {object} logoConfig - Resolved logo config from resolveLogoConfig()
 * @param {number} slideIndex - 0-based slide index
 * @param {object} [options]
 * @param {string} [options.srcOverride] - Override image src (e.g. /api/logo/image for server)
 * @returns {string} HTML with logo injected (or unchanged if not applicable)
 */
export function injectLogoIntoHtml(html, logoConfig, slideIndex, options) {
  if (!logoConfig || !shouldApplyLogo(slideIndex, logoConfig)) return html;

  const leftPt = logoConfig.x * PT_PER_IN;
  const topPt = logoConfig.y * PT_PER_IN;
  const widthPt = logoConfig.width * PT_PER_IN;
  const heightPt = logoConfig.height * PT_PER_IN;
  const src = options?.srcOverride || logoConfig.resolvedPath;

  const imgTag = `<img src="${escapeHtmlAttr(src)}" style="position:absolute;left:${leftPt.toFixed(1)}pt;top:${topPt.toFixed(1)}pt;width:${widthPt.toFixed(1)}pt;height:${heightPt.toFixed(1)}pt;pointer-events:none;z-index:9999;opacity:${logoConfig.opacity};" data-logo-overlay="true" />`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${imgTag}\n</body>`);
  }
  // No </body> tag — append
  return html + imgTag;
}

/**
 * Inject logo into a Playwright page via page.evaluate().
 * Use after page.goto() for CLI (file://) rendering.
 *
 * @param {import('playwright').Page} page - Playwright page
 * @param {object} logoConfig - Resolved logo config
 * @param {number} slideIndex - 0-based slide index
 */
export async function injectLogoIntoPage(page, logoConfig, slideIndex) {
  if (!logoConfig || !shouldApplyLogo(slideIndex, logoConfig)) return;

  const leftPt = logoConfig.x * PT_PER_IN;
  const topPt = logoConfig.y * PT_PER_IN;
  const widthPt = logoConfig.width * PT_PER_IN;
  const heightPt = logoConfig.height * PT_PER_IN;

  await page.evaluate(({ src, left, top, w, h, opacity }) => {
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = `position:absolute;left:${left}pt;top:${top}pt;width:${w}pt;height:${h}pt;pointer-events:none;z-index:9999;opacity:${opacity};`;
    img.dataset.logoOverlay = 'true';
    document.body.appendChild(img);
    return new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve; // don't block on load failure
      setTimeout(resolve, 3000); // safety timeout
    });
  }, {
    src: logoConfig.resolvedPath.startsWith('data:')
      ? logoConfig.resolvedPath
      : `file://${logoConfig.resolvedPath}`,
    left: leftPt.toFixed(1),
    top: topPt.toFixed(1),
    w: widthPt.toFixed(1),
    h: heightPt.toFixed(1),
    opacity: logoConfig.opacity,
  });
}

/**
 * Extract 0-based slide index from a slide filename.
 * "slide-01.html" → 0, "slide-03-title.html" → 2
 */
export function extractSlideIndex(filename) {
  const match = filename.match(/\d+/);
  return match ? Math.max(0, parseInt(match[0], 10) - 1) : 0;
}

// ---------------------------------------------------------------------------
// PPTX application
// ---------------------------------------------------------------------------

/**
 * Add the logo image to a PptxGenJS slide.
 * @param {object} slide - PptxGenJS slide object
 * @param {object} logoConfig - Resolved logo config
 * @param {object} imageData - Result from loadLogoImage
 */
export function applyLogoToPptxSlide(slide, logoConfig, imageData) {
  const imgOpts = {
    x: logoConfig.x,
    y: logoConfig.y,
    w: logoConfig.width,
    h: logoConfig.height,
  };

  if (typeof imageData.data === 'string') {
    // data URL or base64 string
    const dataStr = imageData.data.startsWith('data:')
      ? imageData.data.replace(/^data:/, '')
      : imageData.data;
    imgOpts.data = dataStr;
  } else if (imageData.data?.path) {
    imgOpts.path = imageData.data.path;
  }

  slide.addImage(imgOpts);
}

// ---------------------------------------------------------------------------
// PDF application
// ---------------------------------------------------------------------------

/**
 * Draw the logo on a pdf-lib page.
 * @param {import('pdf-lib').PDFDocument} pdfDoc - The PDF document (for embedding)
 * @param {import('pdf-lib').PDFPage} page - The page to draw on
 * @param {object} logoConfig - Resolved logo config
 * @param {object} imageData - Result from loadLogoImage
 * @param {number} pageWidth - Page width in PDF points
 * @param {number} pageHeight - Page height in PDF points
 */
export async function applyLogoToPdfPage(pdfDoc, page, logoConfig, imageData, pageWidth, pageHeight) {
  // Convert inches to PDF points (72 pt/in)
  const PDF_POINTS_PER_INCH = 72;
  const pdfX = logoConfig.x * PDF_POINTS_PER_INCH;
  const pdfW = logoConfig.width * PDF_POINTS_PER_INCH;
  const pdfH = logoConfig.height * PDF_POINTS_PER_INCH;
  // pdf-lib Y is from bottom
  const pdfY = pageHeight - (logoConfig.y * PDF_POINTS_PER_INCH) - pdfH;

  let embeddedImage;
  if (imageData.data?.buffer) {
    const buf = imageData.data.buffer;
    embeddedImage = imageData.mimeType.includes('png')
      ? await pdfDoc.embedPng(buf)
      : await pdfDoc.embedJpg(buf);
  } else if (typeof imageData.data === 'string') {
    // base64 data URL
    const base64Match = imageData.data.match(/base64,(.*)/);
    if (base64Match) {
      const buf = Buffer.from(base64Match[1], 'base64');
      embeddedImage = imageData.mimeType.includes('png')
        ? await pdfDoc.embedPng(buf)
        : await pdfDoc.embedJpg(buf);
    }
  }

  if (!embeddedImage) {
    throw new Error('Could not embed logo image in PDF');
  }

  page.drawImage(embeddedImage, {
    x: pdfX,
    y: pdfY,
    width: pdfW,
    height: pdfH,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function escapeHtmlAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripUndefined(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
}
