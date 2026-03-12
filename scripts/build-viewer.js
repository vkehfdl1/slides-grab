#!/usr/bin/env node

/**
 * build-viewer.js
 *
 * Builds a single viewer.html from slide-*.html files in selected --slides-dir.
 * Works with file:// protocol — each slide is embedded via <iframe srcdoc="...">
 * for perfect CSS isolation (no regex scoping needed).
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, resolve } from 'path';

import { buildSlideRuntimeHtml } from '../src/image-contract.js';

const DEFAULT_SLIDES_DIR = 'slides';

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/build-viewer.js [options]',
      '',
      'Options:',
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
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

export function parseCliArgs(args) {
  const options = {
    slidesDir: DEFAULT_SLIDES_DIR,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
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

    throw new Error(`Unknown option: ${arg}`);
  }

  if (typeof options.slidesDir !== 'string' || options.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }

  options.slidesDir = options.slidesDir.trim();
  return options;
}

export function findSlideFiles(slidesDir) {
  return readdirSync(slidesDir)
    .filter((file) => /^slide-\d+\.html$/i.test(file))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0], 10);
      const numB = parseInt(b.match(/\d+/)[0], 10);
      return numA - numB || a.localeCompare(b);
    });
}

/**
 * Escape HTML for safe embedding inside srcdoc="..." attribute.
 * Must escape &, ", < so the srcdoc attribute value is valid.
 */
export function escapeForSrcdoc(html) {
  return html
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

export function loadSlides(slidesDir) {
  return findSlideFiles(slidesDir).map((file) => {
    const html = readFileSync(join(slidesDir, file), 'utf-8');
    return {
      file,
      html: buildSlideRuntimeHtml(html, {
        baseHref: './',
        slideFile: file,
      }),
    };
  });
}

export function buildViewerHtml(slides) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #111;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .viewer-container {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Navigation bar */
    .nav-bar {
      height: 48px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex-shrink: 0;
      z-index: 100;
    }

    .nav-bar button {
      background: #333;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px 16px;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s;
    }

    .nav-bar button:hover {
      background: #555;
    }

    .nav-bar button:disabled {
      opacity: 0.3;
      cursor: default;
    }

    .slide-counter {
      color: #aaa;
      font-size: 14px;
      font-weight: 500;
      min-width: 60px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .btn-fullscreen {
      position: absolute;
      right: 16px;
      background: transparent !important;
      font-size: 18px;
      padding: 6px 10px !important;
    }

    /* Slide viewport */
    .slide-viewport {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
    }

    .slide-scaler {
      width: 720pt;
      height: 405pt;
      position: relative;
      transform-origin: center center;
    }

    /* Slide frames (iframes) */
    .slide-frame {
      position: absolute;
      inset: 0;
      width: 720pt;
      height: 405pt;
      border: none;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }

    .slide-frame.active {
      opacity: 1;
      pointer-events: auto;
    }
  </style>
</head>
<body>
  <div class="viewer-container">
    <!-- Navigation -->
    <div class="nav-bar">
      <button id="btn-prev" title="Previous (\\u2190)">Prev</button>
      <span class="slide-counter" id="counter">1 / ${slides.length}</span>
      <button id="btn-next" title="Next (\\u2192)">Next</button>
      <button class="btn-fullscreen" id="btn-fs" title="Fullscreen (F)">&#x26F6;</button>
    </div>

    <!-- Slide viewport -->
    <div class="slide-viewport" id="viewport">
      <div class="slide-scaler" id="scaler">
${slides.map((s, i) => `        <iframe class="slide-frame${i === 0 ? ' active' : ''}" data-slide="${i + 1}" srcdoc="${escapeForSrcdoc(s.html)}" sandbox="allow-same-origin"></iframe>`).join('\n')}
      </div>
    </div>
  </div>

  <script>
    const TOTAL = ${slides.length};
    let current = 1;

    const frames = document.querySelectorAll('.slide-frame');
    const counter = document.getElementById('counter');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    const scaler = document.getElementById('scaler');
    const viewport = document.getElementById('viewport');

    function goTo(n) {
      n = Math.max(1, Math.min(TOTAL, n));
      if (n === current) return;
      frames[current - 1].classList.remove('active');
      current = n;
      frames[current - 1].classList.add('active');
      counter.textContent = current + ' / ' + TOTAL;
      btnPrev.disabled = current === 1;
      btnNext.disabled = current === TOTAL;
    }

    function next() { goTo(current + 1); }
    function prev() { goTo(current - 1); }

    btnPrev.addEventListener('click', prev);
    btnNext.addEventListener('click', next);
    btnPrev.disabled = true;

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') { e.preventDefault(); goTo(1); }
      else if (e.key === 'End') { e.preventDefault(); goTo(TOTAL); }
      else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    // Fullscreen
    function toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen();
      }
    }
    document.getElementById('btn-fs').addEventListener('click', toggleFullscreen);

    // Auto-scale to fit viewport (95% fit)
    function rescale() {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const slideW = scaler.offsetWidth;
      const slideH = scaler.offsetHeight;
      const scale = Math.min(vw / slideW, vh / slideH) * 0.95;
      scaler.style.transform = 'scale(' + scale + ')';
    }

    window.addEventListener('resize', rescale);
    document.addEventListener('fullscreenchange', () => setTimeout(rescale, 100));
    rescale();
  </script>
</body>
</html>`;
}

export function main(args = process.argv.slice(2)) {
  const options = parseCliArgs(args);
  if (options.help) {
    printUsage();
    return null;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const output = join(slidesDir, 'viewer.html');

  let slides;
  try {
    slides = loadSlides(slidesDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to read slide directory: ${slidesDir}\n${message}\n`);
    process.exitCode = 1;
    return null;
  }

  if (slides.length === 0) {
    console.error(`No slide-*.html files found in: ${slidesDir}`);
    process.exitCode = 1;
    return null;
  }

  console.log(`Found ${slides.length} slides`);
  writeFileSync(output, buildViewerHtml(slides), 'utf-8');
  console.log(`Built viewer: ${output}`);
  return { slidesDir, output, slides };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
