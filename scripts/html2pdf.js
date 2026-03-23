#!/usr/bin/env node

import { readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

import { ensureSlidesPassValidation } from './validate-slides.js';

const require = createRequire(import.meta.url);
const {
  getResolutionChoices,
  getResolutionSize,
  normalizeResolutionPreset,
} = require('../src/export-resolution.cjs');

const DEFAULT_OUTPUT = 'slides.pdf';
const DEFAULT_SLIDES_DIR = 'slides';
const DEFAULT_MODE = 'capture';
const DEFAULT_CAPTURE_RESOLUTION = '2160p';
const PDF_MODES = new Set(['capture', 'print']);
const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
const FALLBACK_SLIDE_SIZE = { width: 960, height: 540 };
const DEFAULT_CAPTURE_DEVICE_SCALE_FACTOR = 2;
const TARGET_ASPECT_RATIO = 16 / 9;
const RENDER_SETTLE_MS = 120;
const CSS_PIXELS_PER_INCH = 96;
const PDF_POINTS_PER_INCH = 72;

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/html2pdf.js [options]',
      '',
      'Options:',
      `  --output <path>      Output PDF path (default: ${DEFAULT_OUTPUT})`,
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
      `  --mode <mode>        PDF export mode: capture|print (default: ${DEFAULT_MODE})`,
      `  --resolution <preset> Capture raster size preset: ${getResolutionChoices().join('|')}|4k (default: ${DEFAULT_CAPTURE_RESOLUTION}; ignored in print mode)`,
      '  -h, --help           Show this help message',
      '',
      'Examples:',
      '  node scripts/html2pdf.js',
      '  node scripts/html2pdf.js --output dist/deck.pdf',
      '  node scripts/html2pdf.js --mode print --output dist/searchable.pdf',
      '  node scripts/html2pdf.js --resolution 2160p --output dist/deck-4k.pdf',
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

function toSlideOrder(fileName) {
  const match = fileName.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function normalizeDimension(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round(value));
}

function normalizeMode(value) {
  if (typeof value !== 'string') {
    throw new Error(`--mode must be one of: ${Array.from(PDF_MODES).join(', ')}`);
  }

  const mode = value.trim().toLowerCase();
  if (!PDF_MODES.has(mode)) {
    throw new Error(`Unknown PDF mode "${value}". Expected one of: ${Array.from(PDF_MODES).join(', ')}`);
  }
  return mode;
}

function cssPixelsToPdfPoints(value) {
  return Math.round((normalizeDimension(value, 0) * PDF_POINTS_PER_INCH) / CSS_PIXELS_PER_INCH);
}

async function normalizeCaptureRasterSize(pngBytes, resolution = '') {
  const targetSize = getResolutionSize(resolution);
  if (!targetSize) {
    return pngBytes;
  }

  const metadata = await sharp(pngBytes).metadata();
  const currentWidth = normalizeDimension(metadata.width, targetSize.width);
  const currentHeight = normalizeDimension(metadata.height, targetSize.height);
  if (currentWidth === targetSize.width && currentHeight === targetSize.height) {
    return pngBytes;
  }

  return sharp(pngBytes)
    .resize(targetSize.width, targetSize.height, { fit: 'fill' })
    .png()
    .toBuffer();
}

function formatDiagnosticEntry(entry) {
  const prefix = entry.slideFile ? `${entry.slideFile}: ` : '';
  return `${prefix}${entry.message}`;
}

function formatDiagnostics(slideFile, diagnostics = []) {
  const relevantDiagnostics = diagnostics.filter((entry) => entry.slideFile === slideFile);
  if (relevantDiagnostics.length === 0) {
    return '';
  }

  return relevantDiagnostics.map((entry) => `  - ${formatDiagnosticEntry(entry)}`).join('\n');
}

function decorateError(error, slideFile, diagnostics = []) {
  const baseMessage = error instanceof Error ? error.message : String(error);
  const details = formatDiagnostics(slideFile, diagnostics);
  return new Error(details ? `${slideFile}: ${baseMessage}\nDiagnostics:\n${details}` : `${slideFile}: ${baseMessage}`);
}

export function sortSlideFiles(a, b) {
  const orderA = toSlideOrder(a);
  const orderB = toSlideOrder(b);
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b);
}

export function parseCliArgs(args) {
  const options = {
    output: DEFAULT_OUTPUT,
    slidesDir: DEFAULT_SLIDES_DIR,
    mode: DEFAULT_MODE,
    resolution: DEFAULT_CAPTURE_RESOLUTION,
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

    if (arg === '--mode') {
      options.mode = normalizeMode(readOptionValue(args, i, '--mode'));
      i += 1;
      continue;
    }

    if (arg.startsWith('--mode=')) {
      options.mode = normalizeMode(arg.slice('--mode='.length));
      continue;
    }

    if (arg === '--resolution') {
      options.resolution = normalizeResolutionPreset(readOptionValue(args, i, '--resolution'));
      i += 1;
      continue;
    }

    if (arg.startsWith('--resolution=')) {
      options.resolution = normalizeResolutionPreset(arg.slice('--resolution='.length));
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

  options.output = options.output.trim();
  options.slidesDir = options.slidesDir.trim();
  options.mode = normalizeMode(options.mode);
  options.resolution = normalizeResolutionPreset(options.resolution);
  if (options.mode === 'print') {
    options.resolution = '';
  }

  return options;
}

export async function findSlideFiles(slidesDir = resolve(process.cwd(), DEFAULT_SLIDES_DIR)) {
  const entries = await readdir(slidesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(sortSlideFiles);
}

export function buildPdfOptions(widthPx, heightPx) {
  return {
    width: `${normalizeDimension(widthPx, FALLBACK_SLIDE_SIZE.width)}px`,
    height: `${normalizeDimension(heightPx, FALLBACK_SLIDE_SIZE.height)}px`,
    printBackground: true,
    pageRanges: '1',
    margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    preferCSSPageSize: false,
  };
}

export function buildPageOptions(mode = DEFAULT_MODE, resolution = '') {
  const targetResolution = normalizeMode(mode) === 'capture' ? getResolutionSize(resolution) : null;
  return {
    viewport: {
      width: FALLBACK_SLIDE_SIZE.width,
      height: FALLBACK_SLIDE_SIZE.height,
    },
    deviceScaleFactor: normalizeMode(mode) === 'capture'
      ? targetResolution
        ? targetResolution.height / FALLBACK_SLIDE_SIZE.height
        : DEFAULT_CAPTURE_DEVICE_SCALE_FACTOR
      : 1,
  };
}

function chooseSlideFrame(metrics) {
  const viewportArea = Math.max(1, metrics.viewport.width * metrics.viewport.height);
  const bodyArea = Math.max(1, metrics.body.width * metrics.body.height);
  const bodyScrollArea = Math.max(1, metrics.body.scrollWidth * metrics.body.scrollHeight);
  const documentScrollArea = Math.max(1, metrics.document.scrollWidth * metrics.document.scrollHeight);
  const bodyHasOverflowingContent =
    metrics.body.scrollWidth > metrics.body.width * 1.05 ||
    metrics.body.scrollHeight > metrics.body.height * 1.05 ||
    metrics.document.scrollWidth > metrics.body.width * 1.05 ||
    metrics.document.scrollHeight > metrics.body.height * 1.05;
  const candidates = [
    { ...metrics.body, source: 'body' },
    ...metrics.candidates.map((candidate, index) => ({ ...candidate, candidateIndex: index, source: 'body-child' })),
  ]
    .filter((candidate) => candidate.width > 0 && candidate.height > 0)
    .map((candidate) => ({
      ...candidate,
      area: candidate.width * candidate.height,
      aspectDelta: Math.abs(candidate.width / candidate.height - TARGET_ASPECT_RATIO),
      coverage: (candidate.width * candidate.height) / viewportArea,
    }))
    .sort((left, right) => right.area - left.area);

  const preferredCandidate = candidates.find((candidate) => {
    if (candidate.source !== 'body-child') return false;
    if (candidate.coverage < 0.45) return false;
    return candidate.aspectDelta < 0.2;
  });

  if (preferredCandidate && (bodyHasOverflowingContent || bodyArea > preferredCandidate.area * 1.15 || bodyScrollArea > preferredCandidate.area * 1.15 || documentScrollArea > preferredCandidate.area * 1.15)) {
    return preferredCandidate;
  }

  const bestAspectCandidate = candidates.find((candidate) => {
    if (candidate.source === 'body' && bodyHasOverflowingContent) {
      return false;
    }
    return candidate.aspectDelta < 0.12;
  });
  return bestAspectCandidate || candidates[0] || { ...metrics.body, source: 'fallback' };
}

export async function waitForSlideRenderReady(page, options = {}) {
  const settleMs = normalizeDimension(options.settleMs ?? RENDER_SETTLE_MS, RENDER_SETTLE_MS);
  const shouldRunReadySignal = options.runReadySignal !== false;

  await page.waitForLoadState('load');
  await page.evaluate(async ({ settleMs: settleDelay, runReadySignal }) => {
    if (document.fonts?.ready) {
      await document.fonts.ready.catch(() => {});
    }

    await Promise.all(
      Array.from(document.images || [], async (image) => {
        if (typeof image.decode === 'function') {
          await image.decode().catch(() => {});
          return;
        }

        if (image.complete) {
          return;
        }

        await new Promise((resolve) => {
          const done = () => resolve();
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        });
      }),
    );

    if (runReadySignal) {
      const readySignal =
        window.__slidesGrabReady ??
        window.__SLIDES_GRAB_READY ??
        window.slidesGrabReady ??
        document.documentElement?.dataset?.slidesGrabReady ??
        document.body?.dataset?.slidesGrabReady;

      if (typeof readySignal === 'function') {
        await readySignal();
      } else if (readySignal && typeof readySignal.then === 'function') {
        await readySignal.catch(() => {});
      } else if (readySignal === 'pending') {
        await new Promise((resolve) => {
          const listener = () => resolve();
          window.addEventListener('slides-grab-ready', listener, { once: true });
          setTimeout(resolve, 5000);
        });
      }
    }

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, settleDelay));
  }, { settleMs, runReadySignal: shouldRunReadySignal });
}

export async function detectSlideFrame(page) {
  const metrics = await page.evaluate(() => {
    function toBox(element) {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.max(0, rect.x),
        y: Math.max(0, rect.y),
        width: rect.width,
        height: rect.height,
      };
    }

    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    const bodyBox = toBox(body);
    const directChildren = Array.from(body.children)
      .map((element) => ({
        tagName: element.tagName.toLowerCase(),
        ...toBox(element),
      }))
      .filter((box) => box.width > 0 && box.height > 0);

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth || bodyBox.width || 0,
        scrollHeight: document.documentElement.scrollHeight || bodyBox.height || 0,
      },
      body: {
        ...bodyBox,
        width: Number.parseFloat(bodyStyle.width) || bodyBox.width || 0,
        height: Number.parseFloat(bodyStyle.height) || bodyBox.height || 0,
        scrollWidth: body.scrollWidth || bodyBox.width || 0,
        scrollHeight: body.scrollHeight || bodyBox.height || 0,
      },
      candidates: directChildren,
    };
  });

  const frame = chooseSlideFrame(metrics);
  return {
    x: normalizeDimension(frame.x, 0),
    y: normalizeDimension(frame.y, 0),
    width: normalizeDimension(frame.width, FALLBACK_SLIDE_SIZE.width),
    height: normalizeDimension(frame.height, FALLBACK_SLIDE_SIZE.height),
    candidateIndex: Number.isInteger(frame.candidateIndex) ? frame.candidateIndex : null,
    source: frame.source,
  };
}

export async function normalizeBodyToSlideFrame(page, slideFrame) {
  return page.evaluate(({ width, height }) => {
    const body = document.body;
    const documentElement = document.documentElement;

    body.style.margin = '0';
    body.style.padding = '0';
    body.style.width = `${width}px`;
    body.style.height = `${height}px`;
    body.style.minWidth = `${width}px`;
    body.style.minHeight = `${height}px`;
    body.style.overflow = 'hidden';

    documentElement.style.margin = '0';
    documentElement.style.padding = '0';
    documentElement.style.width = `${width}px`;
    documentElement.style.height = `${height}px`;
    documentElement.style.minWidth = `${width}px`;
    documentElement.style.minHeight = `${height}px`;
    documentElement.style.overflow = 'hidden';
  }, slideFrame);
}

export async function isolateSlideFrame(page, slideFrame) {
  return page.evaluate(({ x, y, width, height, source, candidateIndex }) => {
    const body = document.body;
    if (body.querySelector(':scope > [data-slides-grab-print-frame="true"]')) {
      return { x: 0, y: 0, width, height, source: 'body', candidateIndex: null };
    }

    const shouldWrapBodyChildren = source === 'body-child' || x !== 0 || y !== 0;
    if (!shouldWrapBodyChildren) {
      return { x, y, width, height, source, candidateIndex: candidateIndex ?? null };
    }

    const clipFrame = document.createElement('div');
    clipFrame.setAttribute('data-slides-grab-print-frame', 'true');
    clipFrame.style.position = 'relative';
    clipFrame.style.width = `${width}px`;
    clipFrame.style.height = `${height}px`;
    clipFrame.style.margin = '0';
    clipFrame.style.padding = '0';
    clipFrame.style.overflow = 'hidden';
    clipFrame.style.boxSizing = 'border-box';

    const translatedContent = document.createElement('div');
    translatedContent.setAttribute('data-slides-grab-print-content', 'true');
    translatedContent.style.position = 'absolute';
    translatedContent.style.left = `${-x}px`;
    translatedContent.style.top = `${-y}px`;
    translatedContent.style.width = `${Math.max(width + x, body.scrollWidth, document.documentElement.scrollWidth)}px`;
    translatedContent.style.height = `${Math.max(height + y, body.scrollHeight, document.documentElement.scrollHeight)}px`;

    // Preserve the original node order inside one translated subtree so overlap
    // paint order and live DOM state survive both capture and print exports.
    const childNodes = Array.from(body.childNodes);
    body.replaceChildren(clipFrame);
    clipFrame.append(translatedContent);
    for (const node of childNodes) {
      translatedContent.append(node);
    }

    return { x: 0, y: 0, width, height, source: 'body', candidateIndex: null };
  }, slideFrame);
}

function createSlideDiagnostics() {
  const diagnostics = [];
  let currentSlide = null;

  function push(type, message) {
    diagnostics.push({
      type,
      slideFile: currentSlide,
      message,
    });
  }

  return {
    attach(page) {
      page.on('console', (message) => {
        const type = message.type();
        if (type !== 'error' && type !== 'warning') {
          return;
        }

        const location = message.location();
        const locationLabel = location.url ? ` (${basename(location.url)}:${location.lineNumber ?? 0})` : '';
        push(`console:${type}`, `${type}${locationLabel}: ${message.text()}`);
      });

      page.on('pageerror', (error) => {
        push('pageerror', error instanceof Error ? error.message : String(error));
      });

      page.on('requestfailed', (request) => {
        const failure = request.failure();
        push(
          'requestfailed',
          `request failed: ${request.url()}${failure?.errorText ? ` (${failure.errorText})` : ''}`,
        );
      });

      page.on('response', (response) => {
        if (response.status() >= 400) {
          push('response', `HTTP ${response.status()}: ${response.url()}`);
        }
      });
    },
    beginSlide(slideFile) {
      currentSlide = slideFile;
    },
    endSlide() {
      currentSlide = null;
    },
    getSlideDiagnostics(slideFile) {
      return diagnostics.filter((entry) => entry.slideFile === slideFile);
    },
  };
}

export async function renderSlideToPdf(page, slideFile, slidesDir, options = {}) {
  const slidePath = join(slidesDir, slideFile);
  const slideUrl = pathToFileURL(slidePath).href;
  const mode = normalizeMode(options.mode ?? DEFAULT_MODE);
  const captureResolution = mode === 'capture' ? normalizeResolutionPreset(options.resolution ?? '') : '';

  await page.goto(slideUrl, { waitUntil: 'load' });
  await waitForSlideRenderReady(page, options);

  const slideFrame = await detectSlideFrame(page);
  const normalizedSlideFrame = await isolateSlideFrame(page, slideFrame);
  await normalizeBodyToSlideFrame(page, normalizedSlideFrame);
  await waitForSlideRenderReady(page, { ...options, runReadySignal: false });

  if (mode === 'capture') {
    const viewportSize = {
      width: normalizeDimension(normalizedSlideFrame.width, FALLBACK_SLIDE_SIZE.width),
      height: normalizeDimension(normalizedSlideFrame.height, FALLBACK_SLIDE_SIZE.height),
    };
    await page.setViewportSize(viewportSize);
    await waitForSlideRenderReady(page, { ...options, runReadySignal: false });
    const pngBytes = await page.screenshot({
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: viewportSize.width,
        height: viewportSize.height,
      },
    });
    const normalizedPngBytes = await normalizeCaptureRasterSize(pngBytes, captureResolution);
    return {
      mode,
      width: normalizedSlideFrame.width,
      height: normalizedSlideFrame.height,
      pngBytes: normalizedPngBytes,
    };
  }

  return {
    mode,
    width: normalizedSlideFrame.width,
    height: normalizedSlideFrame.height,
    pdfBytes: await page.pdf(buildPdfOptions(normalizedSlideFrame.width, normalizedSlideFrame.height)),
  };
}

export async function mergePdfBuffers(pdfBuffers) {
  const outputPdf = await PDFDocument.create();

  for (const pdfBuffer of pdfBuffers) {
    const sourcePdf = await PDFDocument.load(pdfBuffer);
    const pageIndices = sourcePdf.getPageIndices();
    const pages = await outputPdf.copyPages(sourcePdf, pageIndices);
    for (const page of pages) {
      outputPdf.addPage(page);
    }
  }

  return outputPdf.save();
}

export async function buildCapturePdf(slides) {
  const outputPdf = await PDFDocument.create();

  for (const slide of slides) {
    const pageWidth = cssPixelsToPdfPoints(slide.width);
    const pageHeight = cssPixelsToPdfPoints(slide.height);
    const page = outputPdf.addPage([pageWidth, pageHeight]);
    const image = await outputPdf.embedPng(slide.pngBytes);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  return outputPdf.save();
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  await ensureSlidesPassValidation(slidesDir, { exportLabel: 'PDF export' });
  const slideFiles = await findSlideFiles(slidesDir);
  if (slideFiles.length === 0) {
    throw new Error(`No slide-*.html files found in: ${slidesDir}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(buildPageOptions(options.mode, options.resolution));
  const diagnostics = createSlideDiagnostics();
  diagnostics.attach(page);
  const renderedSlides = [];

  try {
    for (const slideFile of slideFiles) {
      diagnostics.beginSlide(slideFile);
      try {
        const slideResult = await renderSlideToPdf(page, slideFile, slidesDir, {
          mode: options.mode,
          resolution: options.resolution,
        });
        renderedSlides.push(slideResult);
      } catch (error) {
        throw decorateError(error, slideFile, diagnostics.getSlideDiagnostics(slideFile));
      } finally {
        const slideDiagnostics = diagnostics.getSlideDiagnostics(slideFile);
        if (slideDiagnostics.length > 0) {
          process.stderr.write(`[slides-grab] Diagnostics for ${slideFile}:\n${formatDiagnostics(slideFile, slideDiagnostics)}\n`);
        }
        diagnostics.endSlide();
      }
    }
  } finally {
    await browser.close();
  }

  const mergedPdf =
    options.mode === 'capture'
      ? await buildCapturePdf(renderedSlides)
      : await mergePdfBuffers(renderedSlides.map((slide) => slide.pdfBytes));

  const outputPath = resolve(process.cwd(), options.output);
  await writeFile(outputPath, mergedPdf);

  process.stdout.write(`Generated PDF (${options.mode} mode): ${outputPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
