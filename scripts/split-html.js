#!/usr/bin/env node

/**
 * split-html.js
 *
 * Split a single multi-slide HTML file into individual slide-*.html files
 * compatible with slides-grab format (720pt × 405pt).
 *
 * Handles arbitrary source dimensions by applying CSS transform scaling.
 * Extracts shared <style> and <link> tags, then wraps each .slide div
 * in a standalone HTML document.
 *
 * Usage:
 *   node scripts/split-html.js --input deck.html --slides-dir decks/my-deck
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, basename } from 'path';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_SLIDES_DIR = 'slides';

// slides-grab standard size
const TARGET_W_PT = 720;
const TARGET_H_PT = 405;

/* ------------------------------------------------------------------ */
/*  CLI helpers                                                       */
/* ------------------------------------------------------------------ */

function printUsage() {
  process.stdout.write(
    [
      'Usage: slides-grab split [options]',
      '',
      'Split a multi-slide HTML file into individual slide-*.html files.',
      '',
      'Options:',
      '  --input <path>       Source HTML file containing multiple slides (required)',
      `  --slides-dir <path>  Output directory (default: ${DEFAULT_SLIDES_DIR})`,
      '  --selector <sel>     CSS selector for slide elements (default: .slide)',
      '  --source-width <px>  Source slide width in px (auto-detected from CSS vars)',
      '  --source-height <px> Source slide height in px (auto-detected from CSS vars)',
      '  --no-scale           Skip scaling, just split (use when source is already 720pt×405pt)',
      '  -h, --help           Show this help message',
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

function parseCliArgs(args) {
  const options = {
    input: null,
    slidesDir: DEFAULT_SLIDES_DIR,
    selector: '.slide',
    sourceWidth: null,
    sourceHeight: null,
    noScale: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') { options.help = true; continue; }
    if (arg === '--input')         { options.input = readOptionValue(args, i, '--input'); i++; continue; }
    if (arg === '--slides-dir')    { options.slidesDir = readOptionValue(args, i, '--slides-dir'); i++; continue; }
    if (arg === '--selector')      { options.selector = readOptionValue(args, i, '--selector'); i++; continue; }
    if (arg === '--source-width')  { options.sourceWidth = Number(readOptionValue(args, i, '--source-width')); i++; continue; }
    if (arg === '--source-height') { options.sourceHeight = Number(readOptionValue(args, i, '--source-height')); i++; continue; }
    if (arg === '--no-scale')      { options.noScale = true; continue; }

    // Handle --key=value style
    if (arg.startsWith('--input='))         { options.input = arg.slice('--input='.length); continue; }
    if (arg.startsWith('--slides-dir='))    { options.slidesDir = arg.slice('--slides-dir='.length); continue; }
    if (arg.startsWith('--selector='))      { options.selector = arg.slice('--selector='.length); continue; }
    if (arg.startsWith('--source-width='))  { options.sourceWidth = Number(arg.slice('--source-width='.length)); continue; }
    if (arg.startsWith('--source-height=')) { options.sourceHeight = Number(arg.slice('--source-height='.length)); continue; }
  }

  return options;
}

/* ------------------------------------------------------------------ */
/*  HTML parsing helpers (lightweight, no external deps)              */
/* ------------------------------------------------------------------ */

/**
 * Extract all <link> and <style> tags from the <head> section.
 */
function extractHeadAssets(html) {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return { links: [], styles: [] };

  const headContent = headMatch[1];

  // Extract <link> tags (self-closing)
  const links = [];
  const linkRegex = /<link[^>]*>/gi;
  let m;
  while ((m = linkRegex.exec(headContent)) !== null) {
    // Only keep stylesheet links
    if (/rel\s*=\s*["']stylesheet["']/i.test(m[0]) || /\.css/i.test(m[0])) {
      links.push(m[0]);
    }
  }

  // Extract <style> blocks
  const styles = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  while ((m = styleRegex.exec(headContent)) !== null) {
    styles.push(m[1]);
  }

  return { links, styles };
}

/**
 * Try to detect source dimensions from CSS variables or body styles.
 */
function detectSourceDimensions(styleText) {
  let width = null;
  let height = null;

  // Check for --slide-w / --slide-h CSS variables
  const wVarMatch = styleText.match(/--slide-w\s*:\s*(\d+)px/);
  const hVarMatch = styleText.match(/--slide-h\s*:\s*(\d+)px/);
  if (wVarMatch) width = Number(wVarMatch[1]);
  if (hVarMatch) height = Number(hVarMatch[1]);

  // Fallback: check body width/height
  if (!width) {
    const bodyWMatch = styleText.match(/body\s*\{[^}]*width\s*:\s*(\d+)px/);
    if (bodyWMatch) width = Number(bodyWMatch[1]);
  }
  if (!height) {
    const bodyHMatch = styleText.match(/body\s*\{[^}]*height\s*:\s*(\d+)px/);
    if (bodyHMatch) height = Number(bodyHMatch[1]);
  }

  // Also check pt-based dimensions
  if (!width) {
    const bodyWPt = styleText.match(/body\s*\{[^}]*width\s*:\s*(\d+)pt/);
    if (bodyWPt) width = Number(bodyWPt[1]) * (96 / 72); // pt to px
  }
  if (!height) {
    const bodyHPt = styleText.match(/body\s*\{[^}]*height\s*:\s*(\d+)pt/);
    if (bodyHPt) height = Number(bodyHPt[1]) * (96 / 72); // pt to px
  }

  return { width, height };
}

/**
 * Extract slide elements by splitting on the selector pattern.
 * Returns array of { index, comment, content } objects.
 */
function extractSlides(html, selector) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!bodyMatch) {
    throw new Error('No <body> tag found in input HTML.');
  }
  const bodyContent = bodyMatch[1];

  // Build regex to find slide divs
  // For ".slide" selector, match <div class="slide ..."> but NOT <div class="slide-content">
  // Use (?:^|\\s) and (?:\\s|$) inside the class value to match whole-word class tokens
  const className = selector.replace(/^\./, '');
  // Match each slide div with its full content using a stack-based approach
  const slides = [];
  const slideStartRegex = new RegExp(
    `(<!--(?:[^-]|-(?!->))*-->\\s*)?<div\\s[^>]*class\\s*=\\s*"(?:[^"]*\\s)?${className}(?:\\s[^"]*|)"[^>]*>`,
    'gi',
  );

  let match;
  const starts = [];
  while ((match = slideStartRegex.exec(bodyContent)) !== null) {
    starts.push({
      fullMatch: match[0],
      comment: (match[1] || '').trim(),
      index: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    // Find the matching closing </div> by counting nesting
    let depth = 1;
    let pos = start.contentStart;
    while (depth > 0 && pos < bodyContent.length) {
      const openIdx = bodyContent.indexOf('<div', pos);
      const closeIdx = bodyContent.indexOf('</div>', pos);

      if (closeIdx === -1) break;

      if (openIdx !== -1 && openIdx < closeIdx) {
        // Check it's actually a <div> tag (not <divider> etc.)
        const afterOpen = bodyContent[openIdx + 4];
        if (afterOpen === ' ' || afterOpen === '>' || afterOpen === '\n' || afterOpen === '\r' || afterOpen === '\t') {
          depth++;
        }
        pos = openIdx + 4;
      } else {
        depth--;
        if (depth === 0) {
          const innerContent = bodyContent.slice(start.contentStart, closeIdx);
          const fullSlideHtml = start.fullMatch + innerContent + '</div>';
          slides.push({
            index: i + 1,
            comment: start.comment,
            content: fullSlideHtml,
          });
        }
        pos = closeIdx + 6;
      }
    }
  }

  return slides;
}

/**
 * Try to extract a meaningful label from the slide comment or content.
 */
function extractSlideLabel(slide) {
  // Try comment first: <!-- ===== SLIDE 01: TITLE ===== -->
  if (slide.comment) {
    const labelMatch = slide.comment.match(/SLIDE\s*\d+\s*:\s*(.+?)(?:\s*=+\s*-->|-->)/i);
    if (labelMatch) {
      return labelMatch[1]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
  }

  // Try <h1> or <h2> content
  const hMatch = slide.content.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  if (hMatch) {
    const text = hMatch[1].replace(/<[^>]+>/g, '').trim();
    if (text && text.length < 40) {
      // Transliterate Korean to a short slug or just use numbers
      const ascii = text.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      if (ascii.length > 2) {
        return ascii.toLowerCase().replace(/\s+/g, '-').slice(0, 30);
      }
    }
  }

  return '';
}

/* ------------------------------------------------------------------ */
/*  Slide HTML generation                                             */
/* ------------------------------------------------------------------ */

function buildSlideHtml({ links, sharedStyles, slideContent, sourceWidth, sourceHeight, noScale }) {
  const targetWPx = TARGET_W_PT * (96 / 72); // 960px
  const targetHPx = TARGET_H_PT * (96 / 72); // 540px

  const needsScale = !noScale && sourceWidth && sourceHeight;
  const scaleX = needsScale ? targetWPx / sourceWidth : 1;
  const scaleY = needsScale ? targetHPx / sourceHeight : 1;
  const scale = Math.min(scaleX, scaleY);

  const linkTags = links.join('\n  ');

  // Remove body-level layout properties from shared styles (we'll set our own)
  let cleanedStyles = sharedStyles
    .replace(/body\s*\{[^}]*\}/g, (match) => {
      return match
        .replace(/width\s*:\s*[^;]+;?/g, '')
        .replace(/height\s*:\s*[^;]+;?/g, '')
        .replace(/display\s*:\s*[^;]+;?/g, '')
        .replace(/flex-direction\s*:\s*[^;]+;?/g, '')
        .replace(/align-items\s*:\s*[^;]+;?/g, '')
        .replace(/justify-content\s*:\s*[^;]+;?/g, '')
        .replace(/overflow\s*:\s*[^;]+;?/g, '')
        .replace(/gap\s*:\s*[^;]+;?/g, '')
        .replace(/padding\s*:\s*[^;]+;?/g, '');
    })
    // Remove .presentation wrapper styles (not needed for single slide)
    .replace(/\.presentation\s*\{[^}]*\}/g, '')
    // Remove .nav, .progress-bar, .kbd-hint (navigation elements)
    .replace(/\.nav\s*\{[^}]*\}/g, '')
    .replace(/\.nav\s+[^{]*\{[^}]*\}/g, '')
    .replace(/\.progress-bar\s*\{[^}]*\}/g, '')
    .replace(/\.kbd-hint\s*\{[^}]*\}/g, '')
    .replace(/\.kbd-hint\s+[^{]*\{[^}]*\}/g, '')
    // Remove @media queries (single slide doesn't need responsive)
    .replace(/@media\s*\([^)]*\)\s*\{[^}]*\}/g, '');

  const scaleStyle = needsScale
    ? `
    .slide-wrapper {
      width: ${sourceWidth}px;
      height: ${sourceHeight}px;
      transform: scale(${scale.toFixed(6)});
      transform-origin: top left;
    }`
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
  ${linkTags}
<style>
:root {
  --slide-w: ${TARGET_W_PT}pt;
  --slide-h: ${TARGET_H_PT}pt;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: ${TARGET_W_PT}pt;
  height: ${TARGET_H_PT}pt;
  font-family: 'Pretendard', -apple-system, sans-serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}
${scaleStyle}

/* --- Original shared styles --- */
${cleanedStyles}

/* Ensure .slide fills the wrapper */
.slide {
  width: 100%;
  height: 100%;
  min-height: 100%;
}
</style>
</head>
<body>${needsScale ? `
<div class="slide-wrapper">` : ''}
${slideContent}${needsScale ? `
</div>` : ''}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

function main() {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.input) {
    console.error('[split] Error: --input is required.\n');
    printUsage();
    process.exitCode = 1;
    return;
  }

  const inputPath = resolve(options.input);
  if (!existsSync(inputPath)) {
    console.error(`[split] Error: File not found: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  const html = readFileSync(inputPath, 'utf-8');

  // 1. Extract head assets
  const { links, styles } = extractHeadAssets(html);
  const sharedStyles = styles.join('\n');

  // 2. Detect source dimensions
  let { sourceWidth, sourceHeight } = options;
  if (!sourceWidth || !sourceHeight) {
    const detected = detectSourceDimensions(sharedStyles);
    sourceWidth = sourceWidth || detected.width || 1280;
    sourceHeight = sourceHeight || detected.height || 720;
  }

  console.log(`[split] Source dimensions: ${sourceWidth}px × ${sourceHeight}px`);
  console.log(`[split] Target dimensions: ${TARGET_W_PT}pt × ${TARGET_H_PT}pt`);

  if (!options.noScale) {
    const targetWPx = TARGET_W_PT * (96 / 72);
    const scale = targetWPx / sourceWidth;
    console.log(`[split] Scale factor: ${scale.toFixed(4)}`);
  }

  // 3. Extract slides
  const slides = extractSlides(html, options.selector);

  if (slides.length === 0) {
    console.error(`[split] Error: No slides found with selector "${options.selector}".`);
    process.exitCode = 1;
    return;
  }

  console.log(`[split] Found ${slides.length} slides.`);

  // 4. Create output directory
  const outDir = resolve(options.slidesDir);
  mkdirSync(outDir, { recursive: true });

  // 5. Write individual slide files
  const written = [];
  for (const slide of slides) {
    const num = String(slide.index).padStart(2, '0');
    const label = extractSlideLabel(slide);
    const fileName = label
      ? `slide-${num}-${label}.html`
      : `slide-${num}.html`;

    const slideHtml = buildSlideHtml({
      links,
      sharedStyles,
      slideContent: slide.content,
      sourceWidth,
      sourceHeight,
      noScale: options.noScale,
    });

    const outPath = join(outDir, fileName);
    writeFileSync(outPath, slideHtml, 'utf-8');
    written.push(fileName);
    console.log(`  ✓ ${fileName}`);
  }

  console.log(`\n[split] Done! ${written.length} slides written to ${outDir}`);
  console.log(`[split] Next steps:`);
  console.log(`  slides-grab edit --slides-dir ${options.slidesDir}`);
  console.log(`  slides-grab validate --slides-dir ${options.slidesDir}`);
}

main();
