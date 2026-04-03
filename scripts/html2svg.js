#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from 'playwright';
import { findSlideFiles } from './html2pdf.js';
import { SLIDE_PX } from '../src/slide-dimensions.js';

const DEFAULT_OUTPUT_DIR = 'output';
const DEFAULT_SLIDES_DIR = 'slides';
const DEFAULT_FORMAT = 'svg';
const SUPPORTED_FORMATS = ['svg', 'png'];
const FALLBACK_SLIDE_SIZE = SLIDE_PX;

const DEFAULT_SCALE = 2;

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/html2svg.js [options]',
      '',
      'Options:',
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
      `  --output <path>      Output directory (default: ${DEFAULT_OUTPUT_DIR})`,
      `  --format <type>      Output format: svg or png (default: ${DEFAULT_FORMAT})`,
      `  --scale <number>     Scale factor for output size (default: ${DEFAULT_SCALE})`,
      '  -h, --help           Show this help message',
      '',
      'Examples:',
      '  node scripts/html2svg.js',
      '  node scripts/html2svg.js --slides-dir decks/my-deck --output dist/svgs',
      '  node scripts/html2svg.js --scale 2 --output dist/svgs',
      '  node scripts/html2svg.js --format png --output dist/pngs',
    ].join('\n'),
  );
  process.stdout.write('\n');
}

function readOptionValue(args, index, optionName) {
  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return next;
}

export function parseCliArgs(args) {
  const options = {
    output: DEFAULT_OUTPUT_DIR,
    slidesDir: DEFAULT_SLIDES_DIR,
    format: DEFAULT_FORMAT,
    scale: DEFAULT_SCALE,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--output') {
      options.output = readOptionValue(args, i, '--output');
      i += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--slides-dir') {
      options.slidesDir = readOptionValue(args, i, '--slides-dir');
      i += 1;
      continue;
    }
    if (arg.startsWith('--slides-dir=')) {
      options.slidesDir = arg.slice('--slides-dir='.length);
      continue;
    }

    if (arg === '--format') {
      options.format = readOptionValue(args, i, '--format');
      i += 1;
      continue;
    }
    if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length);
      continue;
    }

    if (arg === '--scale') {
      options.scale = Number(readOptionValue(args, i, '--scale'));
      i += 1;
      continue;
    }
    if (arg.startsWith('--scale=')) {
      options.scale = Number(arg.slice('--scale='.length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (typeof options.output !== 'string' || options.output.trim() === '') {
    throw new Error('--output must be a non-empty string.');
  }
  if (typeof options.slidesDir !== 'string' || options.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }
  if (!SUPPORTED_FORMATS.includes(options.format)) {
    throw new Error(`--format must be one of: ${SUPPORTED_FORMATS.join(', ')}`);
  }
  if (!Number.isFinite(options.scale) || options.scale <= 0) {
    throw new Error('--scale must be a positive number.');
  }

  options.output = options.output.trim();
  options.slidesDir = options.slidesDir.trim();

  return options;
}

export function getOutputFileName(slideFile, format = 'svg') {
  const base = basename(slideFile, extname(slideFile));
  return `${base}.${format}`;
}

/**
 * Ensure the SVG has a viewBox attribute so that resizing width/height
 * actually scales the content instead of just expanding the canvas.
 */
function ensureViewBox(svgString) {
  if (/(<svg\b[^>]*?)\sviewBox\s*=/.test(svgString)) return svgString;

  const wMatch = svgString.match(/<svg\b[^>]*?\s+width\s*=\s*"([\d.]+)"/);
  const hMatch = svgString.match(/<svg\b[^>]*?\s+height\s*=\s*"([\d.]+)"/);
  if (!wMatch || !hMatch) return svgString;

  return svgString.replace(
    /(<svg\b)/,
    `$1 viewBox="0 0 ${wMatch[1]} ${hMatch[1]}"`,
  );
}

export function scaleSvg(svgString, scale) {
  if (scale === 1) return svgString;

  const withVB = ensureViewBox(svgString);

  return withVB.replace(
    /(<svg\b[^>]*?)(\s*width\s*=\s*")([\d.]+)(")/,
    (_, before, wAttr, w, after) => {
      const origW = Number(w);
      return `${before}${wAttr}${Math.round(origW * scale)}${after}`;
    },
  ).replace(
    /(<svg\b[^>]*?)(\s*height\s*=\s*")([\d.]+)(")/,
    (_, before, hAttr, h, after) => {
      const origH = Number(h);
      return `${before}${hAttr}${Math.round(origH * scale)}${after}`;
    },
  );
}

/**
 * Resize the SVG to the given target dimensions.
 * Adds a viewBox (preserving the original coordinate system) so the
 * content is scaled to fit the new width/height.
 */
export function resizeSvg(svgString, targetWidth, targetHeight) {
  const wMatch = svgString.match(/<svg\b[^>]*?\s+width\s*=\s*"([\d.]+)"/);
  const hMatch = svgString.match(/<svg\b[^>]*?\s+height\s*=\s*"([\d.]+)"/);
  if (!wMatch || !hMatch) return svgString;

  const origW = Number(wMatch[1]);
  const origH = Number(hMatch[1]);
  if (origW === targetWidth && origH === targetHeight) return svgString;

  let result = ensureViewBox(svgString);

  result = result.replace(
    /(<svg\b[^>]*?\s+width\s*=\s*")([\d.]+)(")/,
    `$1${Math.round(targetWidth)}$3`,
  );
  result = result.replace(
    /(<svg\b[^>]*?\s+height\s*=\s*")([\d.]+)(")/,
    `$1${Math.round(targetHeight)}$3`,
  );

  return result;
}

/**
 * Bundle dom-to-svg + dependencies into a browser-compatible IIFE.
 * Caches the result in the OS temp directory.
 */
export function getDomToSvgBundle() {
  const cachePath = join(tmpdir(), 'dom-to-svg-bundle.js');
  if (existsSync(cachePath)) {
    return cachePath;
  }

  const result = buildSync({
    stdin: {
      contents: `
        import { elementToSVG, inlineResources } from 'dom-to-svg';
        window.__domToSvg = { elementToSVG, inlineResources };
      `,
      resolveDir: resolve(
        process.env.PPT_AGENT_PACKAGE_ROOT || process.cwd(),
      ),
    },
    bundle: true,
    write: true,
    outfile: cachePath,
    format: 'iife',
    platform: 'browser',
  });

  if (result.errors.length > 0) {
    throw new Error(`Failed to bundle dom-to-svg: ${result.errors[0].text}`);
  }

  return cachePath;
}

/**
 * Bundle opentype.js into a browser-compatible IIFE.
 * Caches the result in the OS temp directory.
 */
export function getOpentypeBundle() {
  const cachePath = join(tmpdir(), 'opentype-bundle.js');
  if (existsSync(cachePath)) {
    return cachePath;
  }

  const result = buildSync({
    stdin: {
      contents: `
        import opentype from 'opentype.js';
        window.__opentype = opentype;
      `,
      resolveDir: resolve(
        process.env.PPT_AGENT_PACKAGE_ROOT || process.cwd(),
      ),
    },
    bundle: true,
    write: true,
    outfile: cachePath,
    format: 'iife',
    platform: 'browser',
  });

  if (result.errors.length > 0) {
    throw new Error(`Failed to bundle opentype.js: ${result.errors[0].text}`);
  }

  return cachePath;
}

/**
 * Convert all <text> elements in an SVG to <path> outlines using opentype.js.
 * The page must have the opentype.js bundle injected beforehand.
 *
 * @param {import('playwright').Page} page - Playwright page with opentype.js injected
 * @param {string} svgString - SVG markup produced by dom-to-svg
 * @returns {Promise<string>} SVG markup with <text> replaced by <path>
 */
export async function convertTextToOutlines(page, svgString) {
  return page.evaluate(async (svg) => {
    const opentype = window.__opentype;

    // --- 1. Build font-face map: { "family|weight" -> absoluteUrl } ---
    const fontFaceMap = new Map();

    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (!link.href) continue;
      try {
        const res = await fetch(link.href);
        if (!res.ok) continue;
        const css = await res.text();
        const baseUrl = link.href.replace(/[^/]+$/, '');

        // Parse @font-face blocks
        const faceRe = /@font-face\s*\{([^}]+)\}/g;
        let m;
        while ((m = faceRe.exec(css)) !== null) {
          const block = m[1];
          const familyMatch = block.match(/font-family\s*:\s*['"]?([^;'"]+)/);
          const weightMatch = block.match(/font-weight\s*:\s*(\d+)/);
          if (!familyMatch) continue;

          // Prefer .woff (opentype.js parses natively) over .woff2 (needs Brotli)
          const woffMatch = block.match(/url\(\s*['"]?([^)'"]+\.woff)['"]?\s*\)\s*format\(\s*['"]woff['"]\s*\)/);
          const woff2Match = block.match(/url\(\s*['"]?([^)'"]+\.woff2)['"]?\s*\)/);
          const srcMatch = woffMatch || woff2Match;
          if (!srcMatch) continue;

          const family = familyMatch[1].trim();
          const weight = weightMatch ? weightMatch[1] : '400';
          let url = srcMatch[1];
          if (!url.startsWith('http')) {
            url = new URL(url, baseUrl).href;
          }
          fontFaceMap.set(`${family}|${weight}`, url);
        }
      } catch { /* skip */ }
    }

    // --- 2. Font cache ---
    const fontCache = new Map();

    async function getFont(family, weight) {
      // Try exact match, then closest weight, then any weight of the family
      const w = String(Math.round(Number(weight) || 400));
      for (const tryWeight of [w, '400', '700']) {
        const key = `${family}|${tryWeight}`;
        if (fontCache.has(key)) return fontCache.get(key);
        const url = fontFaceMap.get(key);
        if (!url) continue;
        try {
          const res = await fetch(url);
          const buf = await res.arrayBuffer();
          const font = opentype.parse(buf);
          fontCache.set(key, font);
          return font;
        } catch { /* skip */ }
      }
      return null;
    }

    // --- 3. Parse SVG and convert <text> to <path> ---
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const NS = 'http://www.w3.org/2000/svg';

    // Helper: read a style property from element or its parent <text>
    function attr(el, textEl, prop, cssProp) {
      return el.style?.[cssProp || prop]
        || el.getAttribute(prop)
        || textEl.style?.[cssProp || prop]
        || textEl.getAttribute(prop)
        || '';
    }

    for (const textEl of [...doc.querySelectorAll('text')]) {
      if (!textEl.textContent?.trim()) { textEl.remove(); continue; }

      const dominantBaseline = textEl.getAttribute('dominant-baseline') || 'auto';
      const textTransform = textEl.getAttribute('transform');
      const textFill = textEl.style?.fill || textEl.getAttribute('fill') || '#000000';

      // Collect renderable spans: either <tspan> children, or the <text> itself
      const tspans = textEl.querySelectorAll('tspan');
      const spans = tspans.length > 0 ? [...tspans] : [textEl];

      const group = doc.createElementNS(NS, 'g');
      if (textTransform) group.setAttribute('transform', textTransform);

      for (const span of spans) {
        const text = span.textContent || '';
        if (!text.trim()) continue;

        const x = parseFloat(span.getAttribute('x') ?? textEl.getAttribute('x')) || 0;
        let y = parseFloat(span.getAttribute('y') ?? textEl.getAttribute('y')) || 0;

        const fontSize = parseFloat(attr(span, textEl, 'font-size', 'fontSize')) || 16;
        const fontFamily = (attr(span, textEl, 'font-family', 'fontFamily') || 'Pretendard')
          .split(',')[0].trim().replace(/['"]/g, '');
        const fontWeight = attr(span, textEl, 'font-weight', 'fontWeight') || '400';
        const fill = span.style?.fill || span.getAttribute('fill') || textFill;
        const desiredWidth = parseFloat(span.getAttribute('textLength'));

        const font = await getFont(fontFamily, fontWeight);
        if (!font) continue;

        // --- y-coordinate adjustment ---
        // dom-to-svg sets dominant-baseline="text-after-edge" and y = bottom of text box.
        // opentype.js getPath() expects y = baseline.
        // baseline = text-after-edge_y + (descender / unitsPerEm * fontSize)
        // (descender is negative, so this moves y upward)
        if (dominantBaseline === 'text-after-edge') {
          y += (font.descender / font.unitsPerEm) * fontSize;
        } else if (dominantBaseline === 'central') {
          // For input elements: y = center, baseline = center + (ascender+descender)/2/upm * size
          y += ((font.ascender + font.descender) / 2 / font.unitsPerEm) * fontSize;
        }

        // Generate path at x=0 so we can measure and scale
        const path = font.getPath(text, 0, 0, fontSize);
        const pathData = path.toPathData(2);
        if (!pathData) continue;

        const pathEl = doc.createElementNS(NS, 'path');
        pathEl.setAttribute('d', pathData);
        pathEl.setAttribute('fill', fill);

        // Opacity
        const opacity = span.style?.opacity || span.getAttribute('opacity')
          || textEl.style?.opacity || textEl.getAttribute('opacity');
        if (opacity && opacity !== '1') pathEl.setAttribute('opacity', opacity);

        // --- Handle textLength stretching + positioning ---
        // dom-to-svg sets textLength + lengthAdjust="spacingAndGlyphs" to match exact width.
        // We compute horizontal scale and apply with translate.
        // Include letter-spacing in the natural width calculation so that
        // text with letter-spacing is not squished by the scale factor.
        const lsRaw = attr(span, textEl, 'letter-spacing', 'letterSpacing');
        const letterSpacing = (lsRaw === 'normal' || !lsRaw) ? 0 : parseFloat(lsRaw) || 0;
        const charCount = [...text].length;
        const naturalWidth = font.getAdvanceWidth(text, fontSize)
          + (letterSpacing > 0 ? letterSpacing * charCount : 0);
        let tx = `translate(${x.toFixed(2)}, ${y.toFixed(2)})`;

        if (desiredWidth && naturalWidth > 0 && Math.abs(desiredWidth - naturalWidth) > 0.5) {
          const sx = desiredWidth / naturalWidth;
          tx = `translate(${x.toFixed(2)}, ${y.toFixed(2)}) scale(${sx.toFixed(4)}, 1)`;
        }

        pathEl.setAttribute('transform', tx);
        group.appendChild(pathEl);
      }

      // Only replace if at least one path was generated; otherwise keep original <text>
      if (group.childNodes.length > 0) {
        textEl.parentNode.replaceChild(group, textEl);
      }
    }

    return new XMLSerializer().serializeToString(doc);
  }, svgString);
}

/**
 * Sanitize SVG text elements for Figma compatibility.
 * dom-to-svg produces verbose <text> elements with attributes that Figma
 * cannot parse, causing all text to be imported as "VECTOR" (paths).
 *
 * This function:
 *  - Recalculates y-coordinates from text-after-edge to alphabetic baseline
 *  - Removes dominant-baseline attribute
 *  - Strips non-essential attributes (color, font-size-adjust, unicode-bidi, …)
 *  - Removes textLength / lengthAdjust from <tspan>
 *  - Flattens single-<tspan> text elements to direct text content
 *  - Simplifies font-family to the primary font name
 *  - Strips "px" suffix from font-size (SVG unitless = px)
 *
 * @param {import('playwright').Page} page – Playwright page (fonts must be loaded)
 * @param {string} svgString – raw SVG produced by dom-to-svg
 * @returns {Promise<string>} cleaned SVG string
 */
export async function sanitizeSvgForFigma(page, svgString) {
  return page.evaluate((svg) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');

    /* ── font-metrics helper (canvas) ────────────────────────────── */
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const metricsCache = new Map();

    function getMetrics(fontFamily, fontWeight, fontSize) {
      const key = `${fontFamily}|${fontWeight}|${fontSize}`;
      if (metricsCache.has(key)) return metricsCache.get(key);
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const m = ctx.measureText('Hg|ÁŚgy');
      const result = {
        ascent: m.fontBoundingBoxAscent ?? (fontSize * 0.8),
        descent: m.fontBoundingBoxDescent ?? (fontSize * 0.2),
      };
      metricsCache.set(key, result);
      return result;
    }

    /**
     * Measure natural text width using canvas, including letter-spacing.
     * Returns the width the SVG renderer would produce without textLength.
     */
    function measureTextWidth(text, fontFamily, fontWeight, fontSize, letterSpacing) {
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.letterSpacing = (letterSpacing && letterSpacing !== 'normal')
        ? `${letterSpacing}px` : '0px';
      return ctx.measureText(text).width;
    }

    /* ── allow-lists ─────────────────────────────────────────────── */
    const TEXT_KEEP = new Set([
      'x', 'y', 'font-family', 'font-size', 'font-weight',
      'fill', 'opacity', 'letter-spacing', 'text-anchor',
      'transform', 'id', 'class', 'font-style',
      'textLength',
    ]);

    const TSPAN_KEEP = new Set([
      'x', 'y', 'dx', 'dy', 'fill', 'font-size', 'font-weight',
      'font-family', 'letter-spacing', 'opacity', 'font-style',
      'textLength',
    ]);

    /* ── process each <text> ─────────────────────────────────────── */
    for (const textEl of [...doc.querySelectorAll('text')]) {
      if (!textEl.textContent?.trim()) { textEl.remove(); continue; }

      const baseline = textEl.getAttribute('dominant-baseline') || 'auto';
      const fontFamily = textEl.getAttribute('font-family') || 'sans-serif';
      const fontSize = parseFloat(textEl.getAttribute('font-size')) || 16;
      const fontWeight = textEl.getAttribute('font-weight') || '400';

      /* baseline → alphabetic y adjustment */
      const metrics = getMetrics(fontFamily, fontWeight, fontSize);
      let yAdjust = 0;
      if (baseline === 'text-after-edge') {
        // text-after-edge y = bottom of em box → baseline = y − descent
        yAdjust = -metrics.descent;
      } else if (baseline === 'central') {
        // central y = center of em box → baseline = y + (ascent − descent)/2
        yAdjust = (metrics.ascent - metrics.descent) / 2;
      }

      /* ── tspan processing ──────────────────────────────────────── */
      const tspans = [...textEl.querySelectorAll('tspan')];

      for (const tspan of tspans) {
        if (yAdjust !== 0) {
          const y = parseFloat(tspan.getAttribute('y'));
          if (!isNaN(y)) tspan.setAttribute('y', (y + yAdjust).toFixed(2));
        }

        /* Keep textLength for cross-renderer width consistency,
         * but remove lengthAdjust (default "spacing" is less aggressive
         * than "spacingAndGlyphs" and more likely to be handled as text). */
        tspan.removeAttribute('lengthAdjust');

        for (const attr of [...tspan.attributes]) {
          if (!TSPAN_KEEP.has(attr.name) && !attr.name.startsWith('xml:')) {
            tspan.removeAttribute(attr.name);
          }
        }
      }

      /* ── flatten single-tspan ──────────────────────────────────── */
      if (tspans.length === 1) {
        const tspan = tspans[0];
        const tx = tspan.getAttribute('x');
        const ty = tspan.getAttribute('y');
        if (tx) textEl.setAttribute('x', tx);
        if (ty) textEl.setAttribute('y', ty);

        for (const name of TSPAN_KEEP) {
          if (name !== 'x' && name !== 'y' && tspan.hasAttribute(name)
              && !textEl.hasAttribute(name)) {
            textEl.setAttribute(name, tspan.getAttribute(name));
          }
        }
        textEl.textContent = tspan.textContent;
      }

      /* ── clean <text> attributes ───────────────────────────────── */
      textEl.removeAttribute('dominant-baseline');

      for (const attr of [...textEl.attributes]) {
        if (!TEXT_KEEP.has(attr.name)) {
          textEl.removeAttribute(attr.name);
        }
      }

      /* simplify font-family to primary name */
      const ff = textEl.getAttribute('font-family');
      if (ff) {
        textEl.setAttribute('font-family',
          ff.split(',')[0].trim().replace(/['"]/g, ''));
      }

      /* strip "px" from font-size (SVG unitless ≡ px) */
      const fs = textEl.getAttribute('font-size');
      if (fs?.endsWith('px')) {
        textEl.setAttribute('font-size', parseFloat(fs).toString());
      }
    }

    /* ══════════════════════════════════════════════════════════════
     * Structural cleanup — remove masks, clips, metadata, and
     * flatten unnecessary <g> nesting so Figma can parse text.
     * ══════════════════════════════════════════════════════════════ */

    /* ── remove <mask>/<clipPath> definitions & references ──────── */
    for (const el of [...doc.querySelectorAll('mask, clipPath')]) {
      el.remove();
    }
    for (const el of [...doc.querySelectorAll('[mask], [clip-path]')]) {
      el.removeAttribute('mask');
      el.removeAttribute('clip-path');
    }

    /* ── strip data-*, aria-*, role from <g> and <svg> ──────────── */
    for (const el of [...doc.querySelectorAll('g, svg')]) {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')
            || attr.name === 'role') {
          el.removeAttribute(attr.name);
        }
      }
    }

    /* ── remove empty <g> elements (stacking-layer placeholders) ── */
    let swept;
    do {
      swept = false;
      for (const g of [...doc.querySelectorAll('g')]) {
        if (g.children.length === 0 && !g.textContent?.trim()) {
          g.remove();
          swept = true;
        }
      }
    } while (swept);

    /* ── collapse single-child <g> wrappers (reduce nesting) ───── */
    do {
      swept = false;
      for (const g of [...doc.querySelectorAll('g')]) {
        // Skip if <g> has meaningful attributes (id, class, transform, fill, …)
        const dominated = g.children.length === 1 && !g.textContent?.trim()
          || (g.children.length >= 1
              && [...g.childNodes].every(n =>
                n.nodeType === 1 || (n.nodeType === 3 && !n.textContent.trim())));

        const hasMeaningful = [...g.attributes].some(a =>
          a.name === 'transform' || a.name === 'fill' || a.name === 'opacity'
          || a.name === 'filter' || a.name === 'style');

        if (!hasMeaningful && g.children.length === 1
            && g.children[0].tagName === 'g' && !g.children[0].hasAttribute('transform')) {
          // Unwrap: move inner <g>'s children to outer <g>
          const inner = g.children[0];
          while (inner.firstChild) {
            g.insertBefore(inner.firstChild, inner);
          }
          inner.remove();
          swept = true;
        }
      }
    } while (swept);

    /* ── remove empty <style/> tag ─────────────────────────────── */
    for (const style of [...doc.querySelectorAll('style')]) {
      if (!style.textContent?.trim()) style.remove();
    }

    return new XMLSerializer().serializeToString(doc);
  }, svgString);
}

function normalizeDimension(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round(value));
}

export async function getSlideSize(page) {
  const size = await page.evaluate(() => {
    const body = document.body;
    const rect = body.getBoundingClientRect();
    const style = window.getComputedStyle(body);
    return {
      width: Number.parseFloat(style.width) || rect.width || 0,
      height: Number.parseFloat(style.height) || rect.height || 0,
    };
  });
  return {
    width: normalizeDimension(size.width, FALLBACK_SLIDE_SIZE.width),
    height: normalizeDimension(size.height, FALLBACK_SLIDE_SIZE.height),
  };
}

export async function renderSlideToSvg(page, slideFile, slidesDir, bundlePath, options = {}) {
  const slideUrl = options.baseUrl
    ? `${options.baseUrl}/${slideFile}`
    : pathToFileURL(join(slidesDir, slideFile)).href;

  await page.goto(slideUrl, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  // --- Pre-process DOM to work around dom-to-svg limitations ---
  await page.evaluate(() => {
    // 1. Remove CSS transform on .slide-wrapper and resize body to the
    //    wrapper's natural dimensions so dom-to-svg captures at 1:1 scale.
    const wrapper = document.querySelector('.slide-wrapper');
    if (wrapper) {
      const wrapperCs = window.getComputedStyle(wrapper);
      if (wrapperCs.transform && wrapperCs.transform !== 'none') {
        const naturalW = wrapperCs.width;   // e.g. "1280px"
        const naturalH = wrapperCs.height;  // e.g. "720px"
        wrapper.style.transform = 'none';
        document.body.style.width = naturalW;
        document.body.style.height = naturalH;
        document.body.style.overflow = 'hidden';
      }
    }

    // 1b. Handle .slide element (pack templates without .slide-wrapper).
    //     Body may be flex-centered with min-height:100vh, causing dom-to-svg
    //     to capture the full viewport instead of just the slide content.
    if (!wrapper) {
      const slide = document.querySelector('.slide');
      if (slide) {
        const cs = window.getComputedStyle(slide);
        const slideW = cs.width;
        const slideH = cs.height;
        if (parseFloat(slideW) > 0 && parseFloat(slideH) > 0) {
          document.body.style.width = slideW;
          document.body.style.height = slideH;
          document.body.style.minWidth = slideW;
          document.body.style.minHeight = slideH;
          document.body.style.maxWidth = slideW;
          document.body.style.maxHeight = slideH;
          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.body.style.overflow = 'hidden';
          document.body.style.display = 'block';
        }
      }
    }

    // 1c. Move logo overlay inside the slide container so it is positioned
    //     relative to the slide (position:relative) instead of the viewport.
    const logoImg = document.querySelector('img[data-logo-overlay]');
    const slideContainer = wrapper || document.querySelector('.slide');
    if (logoImg && slideContainer && logoImg.parentElement !== slideContainer) {
      slideContainer.appendChild(logoImg);
    }

    // 2. Convert flexbox `gap` to explicit margins on children.
    //    dom-to-svg does not read the CSS gap property, so flex children
    //    appear collapsed together without this fixup.
    for (const el of document.querySelectorAll('*')) {
      const cs = window.getComputedStyle(el);
      if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;

      const rowGap = parseFloat(cs.rowGap) || 0;
      const colGap = parseFloat(cs.columnGap) || 0;
      if (rowGap === 0 && colGap === 0) continue;

      const isRow = cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse';
      let isFirst = true;

      for (const child of el.children) {
        if (window.getComputedStyle(child).display === 'none') continue;
        if (isFirst) { isFirst = false; continue; }

        if (isRow) {
          const cur = parseFloat(window.getComputedStyle(child).marginLeft) || 0;
          child.style.marginLeft = `${cur + colGap}px`;
        } else {
          const cur = parseFloat(window.getComputedStyle(child).marginTop) || 0;
          child.style.marginTop = `${cur + rowGap}px`;
        }
      }

      el.style.gap = '0px';
      el.style.rowGap = '0px';
      el.style.columnGap = '0px';
    }

    // 3. Replace emoji / icon characters with canvas-rendered <img> elements.
    //    dom-to-svg cannot handle color emoji fonts (COLR/CPAL, CBDT, etc.)
    //    and also drops or misrenders symbols whose glyph is missing from
    //    the document's primary font.  Two-pass approach:
    //      Pass A — regex catches known emoji patterns (fast, no canvas).
    //      Pass B — canvas font-probe catches remaining symbols whose glyph
    //               is NOT in the element's computed font (e.g. ◉, ⑂).
    const emojiRe = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F))*/gu;

    function renderCharToDataUri(ch, fontSize, fontSpec) {
      const scale = 2; // render at 2x for crisp output
      const size = Math.ceil(fontSize * 1.2 * scale);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = `${fontSize * scale}px ${fontSpec}`;
      ctx.fillText(ch, size / 2, size / 2);
      return canvas.toDataURL('image/png');
    }

    const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

    // Unicode ranges where dom-to-svg drops or misrenders characters.
    // These are symbol/icon blocks that standard text fonts may lack
    // and dom-to-svg's SVG serialisation cannot reliably reproduce.
    function isSymbolChar(cp) {
      return (cp >= 0x2300 && cp <= 0x23FF)      // Misc Technical (⌘ etc.)
        || (cp >= 0x2400 && cp <= 0x245F)        // Control Pictures / OCR (⑂)
        || (cp >= 0x2460 && cp <= 0x24FF)        // Enclosed Alphanumerics (①②③)
        || (cp >= 0x25A0 && cp <= 0x25FF)        // Geometric Shapes (◉ □ ▶ ▦)
        || (cp >= 0x2700 && cp <= 0x27BF)        // Dingbats (✓ ✗ ✍ ✂)
        || (cp >= 0x2B00 && cp <= 0x2BFF);       // Misc Symbols & Arrows
    }

    // ---- Pass A: emoji regex replacement ----
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      const text = node.textContent;
      if (!emojiRe.test(text)) continue;
      emojiRe.lastIndex = 0;

      const parent = node.parentElement;
      if (!parent) continue;
      const cs = window.getComputedStyle(parent);
      const fontSize = parseFloat(cs.fontSize) || 16;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let match;
      while ((match = emojiRe.exec(text)) !== null) {
        if (match.index > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
        }
        const emoji = match[0];
        const dataUri = renderCharToDataUri(emoji, fontSize, EMOJI_FONT);
        const img = document.createElement('img');
        img.src = dataUri;
        const imgSize = Math.ceil(fontSize * 1.2);
        img.style.width = `${imgSize}px`;
        img.style.height = `${imgSize}px`;
        img.style.verticalAlign = 'middle';
        img.style.display = 'inline';
        frag.appendChild(img);
        lastIdx = match.index + emoji.length;
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      }
      parent.replaceChild(frag, node);
    }

    // ---- Pass B: rasterize symbol characters in known-problematic ranges ----
    // dom-to-svg drops or misrenders characters in Dingbats, Geometric Shapes,
    // OCR, and similar blocks.  We rasterize them before dom-to-svg sees them.
    const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const textNodes2 = [];
    while (walker2.nextNode()) textNodes2.push(walker2.currentNode);

    for (const node of textNodes2) {
      const text = node.textContent;
      let hasSymbol = false;
      for (const ch of text) {
        if (isSymbolChar(ch.codePointAt(0))) { hasSymbol = true; break; }
      }
      if (!hasSymbol) continue;

      const parent = node.parentElement;
      if (!parent) continue;
      const cs = window.getComputedStyle(parent);
      const fontSize = parseFloat(cs.fontSize) || 16;
      const fontSpec = cs.fontFamily || 'sans-serif';

      const frag = document.createDocumentFragment();
      for (const ch of text) {
        if (isSymbolChar(ch.codePointAt(0))) {
          const dataUri = renderCharToDataUri(ch, fontSize, fontSpec);
          const img = document.createElement('img');
          img.src = dataUri;
          const imgSize = Math.ceil(fontSize * 1.2);
          img.style.width = `${imgSize}px`;
          img.style.height = `${imgSize}px`;
          img.style.verticalAlign = 'middle';
          img.style.display = 'inline';
          frag.appendChild(img);
        } else {
          frag.appendChild(document.createTextNode(ch));
        }
      }
      parent.replaceChild(frag, node);
    }
  });

  // Resize viewport to match the (possibly adjusted) body dimensions so
  // that CSS vh/vw units resolve correctly and dom-to-svg captures at 1:1.
  const bodySize = await getSlideSize(page);
  await page.setViewportSize({ width: bodySize.width, height: bodySize.height });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // Extract logo info and remove it from DOM before dom-to-svg.
  // dom-to-svg's inlineResources reads element.href.baseVal (the SVG href
  // attribute) while dom-to-svg itself sets xlink:href — this mismatch
  // causes the logo image to be silently dropped.  We bypass the issue by
  // removing the logo from the DOM and inserting it directly into the SVG.
  const logoInfo = await page.evaluate(async () => {
    const logo = document.querySelector('img[data-logo-overlay]');
    if (!logo) return null;

    const rect = logo.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { logo.remove(); return null; }

    // Fetch and convert to data URI
    let dataUri = logo.src;
    if (dataUri && !dataUri.startsWith('data:')) {
      try {
        const res = await fetch(dataUri);
        if (res.ok) {
          const blob = await res.blob();
          dataUri = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } catch { /* use original src */ }
    }

    const info = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, src: dataUri };
    logo.remove();
    return info;
  });

  // Inject the pre-bundled dom-to-svg IIFE
  await page.addScriptTag({ path: bundlePath });

  // Convert DOM to true vector SVG
  let svgString = await page.evaluate(async () => {
    const { elementToSVG, inlineResources } = window.__domToSvg;
    const svgDoc = elementToSVG(document.body);
    await inlineResources(svgDoc.documentElement);

    // Fix dom-to-svg stacking order bug: positive-z-index layers are
    // appended as early children of their parent, but non-layered siblings
    // (like background divs) are appended afterward, painting on top.
    // Move positive-z-index layers to the end so they paint last (on top).
    for (const layer of svgDoc.querySelectorAll(
      '[data-stacking-layer="childStackingContextsWithPositiveStackLevels"]'
    )) {
      const parent = layer.parentElement;
      if (parent) parent.appendChild(layer);
    }

    return new XMLSerializer().serializeToString(svgDoc);
  });

  // Sanitize text elements for Figma compatibility (also strips
  // textLength/lengthAdjust which cause letter-spacing squishing).
  try {
    svgString = await sanitizeSvgForFigma(page, svgString);
  } catch {
    // Fallback: at minimum strip textLength/lengthAdjust
    svgString = svgString
      .replace(/(<tspan\b[^>]*?)\s+textLength="[^"]*"/g, '$1')
      .replace(/(<tspan\b[^>]*?)\s+lengthAdjust="[^"]*"/g, '$1');
  }

  // Insert logo directly into the SVG as an <image> element
  if (logoInfo && logoInfo.src) {
    // Ensure xmlns:xlink is declared on the root <svg> element
    if (!svgString.includes('xmlns:xlink')) {
      svgString = svgString.replace(
        /(<svg\b)/,
        '$1 xmlns:xlink="http://www.w3.org/1999/xlink"',
      );
    }
    const logoSvg = `<image xlink:href="${logoInfo.src}" x="${logoInfo.x}" y="${logoInfo.y}" width="${logoInfo.width}" height="${logoInfo.height}" preserveAspectRatio="xMidYMid meet" />`;
    svgString = svgString.replace(/<\/svg>\s*$/, `${logoSvg}</svg>`);
  }

  return svgString;
}

/**
 * Render a slide to SVG using foreignObject.
 * Embeds the full HTML+CSS inside the SVG so the browser renders it natively,
 * preserving 100% layout fidelity (flexbox gap, transforms, pseudo-elements, etc.).
 */
export async function renderSlideToSvgForeignObject(page, slideFile, slidesDir, options = {}) {
  const slideUrl = options.baseUrl
    ? `${options.baseUrl}/${slideFile}`
    : pathToFileURL(join(slidesDir, slideFile)).href;

  await page.goto(slideUrl, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  const { width, height, xhtml } = await page.evaluate(() => {
    const body = document.body;
    const cs = window.getComputedStyle(body);
    const w = Number.parseFloat(cs.width) || body.getBoundingClientRect().width;
    const h = Number.parseFloat(cs.height) || body.getBoundingClientRect().height;

    const serializer = new XMLSerializer();
    const xhtml = serializer.serializeToString(document.documentElement);

    return { width: w, height: h, xhtml };
  });

  const w = normalizeDimension(width, FALLBACK_SLIDE_SIZE.width);
  const h = normalizeDimension(height, FALLBACK_SLIDE_SIZE.height);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<foreignObject width="${w}" height="${h}">`,
    xhtml,
    `</foreignObject>`,
    `</svg>`,
  ].join('\n');
}

export async function renderSlideToPng(page, slideFile, slidesDir, options = {}) {
  const slideUrl = options.baseUrl
    ? `${options.baseUrl}/${slideFile}`
    : pathToFileURL(join(slidesDir, slideFile)).href;

  await page.goto(slideUrl, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  const size = await getSlideSize(page);
  await page.setViewportSize({ width: size.width, height: size.height });

  return page.screenshot({ type: 'png' });
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const outputDir = resolve(process.cwd(), options.output);
  const slideFiles = await findSlideFiles(slidesDir);

  if (slideFiles.length === 0) {
    throw new Error(`No slide-*.html files found in: ${slidesDir}`);
  }

  await mkdir(outputDir, { recursive: true });

  let bundlePath;
  if (options.format === 'svg') {
    process.stdout.write('Bundling dom-to-svg for browser...\n');
    bundlePath = getDomToSvgBundle();
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    for (const slideFile of slideFiles) {
      const outName = getOutputFileName(slideFile, options.format);
      const outPath = join(outputDir, outName);

      if (options.format === 'svg') {
        const rawSvg = await renderSlideToSvg(page, slideFile, slidesDir, bundlePath);
        const svgContent = scaleSvg(rawSvg, options.scale);
        await writeFile(outPath, svgContent, 'utf-8');
      } else {
        const pngBuffer = await renderSlideToPng(page, slideFile, slidesDir);
        await writeFile(outPath, pngBuffer);
      }

      process.stdout.write(`  Exported: ${outName}\n`);
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(
    `\nGenerated ${slideFiles.length} ${options.format.toUpperCase()} files in: ${outputDir}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
