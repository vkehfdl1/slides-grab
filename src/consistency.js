/**
 * Cross-slide style consistency checker.
 *
 * Analyzes a deck for style drift between slides, checking font sizes,
 * colors, and spacing patterns for consistency.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * List slide HTML files in a deck directory, sorted numerically.
 */
async function listSlideFiles(deckDir) {
  const entries = await readdir(deckDir);
  return entries
    .filter(f => /^slide-\d+.*\.html$/i.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return numA - numB;
    });
}

/**
 * Extract font sizes from CSS declarations in HTML.
 * Returns array of { selector, size, unit } objects.
 */
function extractFontSizes(html) {
  const sizes = [];
  // Match font-size in inline styles and style blocks
  const re = /font-size\s*:\s*([\d.]+)(px|pt|rem|em)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    sizes.push({ size: parseFloat(m[1]), unit: m[2].toLowerCase() });
  }
  return sizes;
}

/**
 * Classify font sizes into title vs body based on typical thresholds.
 * Title: >= 20pt (or >= 27px), Body: < 20pt
 */
function classifyFontSize(size, unit) {
  const ptSize = unit === 'px' ? size * 0.75
    : unit === 'rem' ? size * 12
    : unit === 'em' ? size * 12
    : size; // pt
  return { ptSize, isTitle: ptSize >= 20 };
}

/**
 * Extract color values from HTML (hex, rgb, rgba).
 * Ignores colors inside comments and common framework attributes.
 */
function extractColors(html) {
  const colors = new Set();

  // Hex colors
  const hexRe = /#([0-9a-fA-F]{3,8})\b/g;
  let m;
  while ((m = hexRe.exec(html)) !== null) {
    const hex = m[1].toLowerCase();
    // Normalize 3-char to 6-char
    if (hex.length === 3) {
      colors.add(`#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`);
    } else {
      colors.add(`#${hex}`);
    }
  }

  // rgb/rgba colors
  const rgbRe = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
  while ((m = rgbRe.exec(html)) !== null) {
    const r = parseInt(m[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(m[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(m[3], 10).toString(16).padStart(2, '0');
    colors.add(`#${r}${g}${b}`);
  }

  return colors;
}

/**
 * Extract padding/margin patterns from HTML.
 */
function extractSpacing(html) {
  const patterns = [];
  const re = /(padding|margin)\s*:\s*([^;}"]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    patterns.push({ property: m[1].toLowerCase(), value: m[2].trim() });
  }
  return patterns;
}

/**
 * Compute median of a numeric array.
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Main ────────────────────────────────────────────────────────────

/**
 * Analyze a deck for cross-slide style consistency.
 * @param {string} slidesDir - Absolute path to deck directory
 * @param {object} [options]
 * @param {Set<string>} [options.themeColors] - Pack theme colors to exclude from color check
 * @returns {Promise<ConsistencyReport>}
 *
 * @typedef {object} ConsistencyReport
 * @property {ConsistencyIssue[]} issues
 * @property {object} summary
 * @property {number} summary.slideCount
 * @property {number} summary.issueCount
 * @property {boolean} summary.consistent
 *
 * @typedef {object} ConsistencyIssue
 * @property {'title-font-size'|'body-font-size'|'color-count'|'spacing'} type
 * @property {'warn'|'info'} severity
 * @property {string} message
 * @property {object} [details]
 */
export async function checkConsistency(slidesDir, options = {}) {
  const slideFiles = await listSlideFiles(slidesDir);
  const issues = [];

  if (slideFiles.length < 2) {
    return {
      issues: [],
      summary: { slideCount: slideFiles.length, issueCount: 0, consistent: true },
    };
  }

  const themeColors = options.themeColors || new Set();

  // Collect per-slide data
  const slideData = [];
  for (const file of slideFiles) {
    const html = await readFile(join(slidesDir, file), 'utf-8');
    const fontSizes = extractFontSizes(html);
    const classified = fontSizes.map(fs => ({
      ...fs,
      ...classifyFontSize(fs.size, fs.unit),
    }));
    const titleSizes = classified.filter(c => c.isTitle).map(c => c.ptSize);
    const bodySizes = classified.filter(c => !c.isTitle).map(c => c.ptSize);
    const colors = extractColors(html);
    const spacing = extractSpacing(html);

    slideData.push({
      file,
      titleSizes,
      bodySizes,
      colors,
      spacing,
    });
  }

  // 1. Check title font size consistency (flag if varies > 2pt)
  const allTitleMedians = slideData
    .map(s => s.titleSizes.length > 0 ? median(s.titleSizes) : null)
    .filter(v => v !== null);

  if (allTitleMedians.length >= 2) {
    const minTitle = Math.min(...allTitleMedians);
    const maxTitle = Math.max(...allTitleMedians);
    if (maxTitle - minTitle > 2) {
      const varying = slideData
        .filter(s => s.titleSizes.length > 0)
        .map(s => ({ file: s.file, median: median(s.titleSizes) }));
      issues.push({
        type: 'title-font-size',
        severity: 'warn',
        message: `Title font size varies by ${(maxTitle - minTitle).toFixed(1)}pt across slides (range: ${minTitle.toFixed(1)}pt - ${maxTitle.toFixed(1)}pt). Keep title sizes within 2pt for consistency.`,
        details: { min: minTitle, max: maxTitle, slides: varying },
      });
    }
  }

  // 2. Check body font size consistency (flag if varies > 1pt)
  const allBodyMedians = slideData
    .map(s => s.bodySizes.length > 0 ? median(s.bodySizes) : null)
    .filter(v => v !== null);

  if (allBodyMedians.length >= 2) {
    const minBody = Math.min(...allBodyMedians);
    const maxBody = Math.max(...allBodyMedians);
    if (maxBody - minBody > 1) {
      const varying = slideData
        .filter(s => s.bodySizes.length > 0)
        .map(s => ({ file: s.file, median: median(s.bodySizes) }));
      issues.push({
        type: 'body-font-size',
        severity: 'warn',
        message: `Body font size varies by ${(maxBody - minBody).toFixed(1)}pt across slides (range: ${minBody.toFixed(1)}pt - ${maxBody.toFixed(1)}pt). Keep body sizes within 1pt for consistency.`,
        details: { min: minBody, max: maxBody, slides: varying },
      });
    }
  }

  // 3. Check color count (flag if > 4 distinct colors excluding theme)
  const allColors = new Set();
  for (const sd of slideData) {
    for (const c of sd.colors) {
      if (!themeColors.has(c)) allColors.add(c);
    }
  }

  if (allColors.size > 4) {
    issues.push({
      type: 'color-count',
      severity: 'warn',
      message: `${allColors.size} distinct non-theme colors detected across the deck. Consider limiting to 4 or fewer for visual coherence.`,
      details: { count: allColors.size, colors: [...allColors].slice(0, 10) },
    });
  }

  // 4. Check padding/margin consistency
  const paddingValues = new Map();
  for (const sd of slideData) {
    for (const sp of sd.spacing) {
      if (sp.property === 'padding') {
        const key = sp.value;
        if (!paddingValues.has(key)) paddingValues.set(key, []);
        paddingValues.get(key).push(sd.file);
      }
    }
  }

  // Flag if more than 3 distinct padding patterns are used
  if (paddingValues.size > 3) {
    issues.push({
      type: 'spacing',
      severity: 'info',
      message: `${paddingValues.size} different padding patterns detected. Standardize padding values for a more uniform layout.`,
      details: { patterns: Object.fromEntries(paddingValues) },
    });
  }

  return {
    issues,
    summary: {
      slideCount: slideFiles.length,
      issueCount: issues.length,
      consistent: issues.length === 0,
    },
  };
}
