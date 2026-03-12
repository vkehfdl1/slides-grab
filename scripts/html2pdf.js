#!/usr/bin/env node

import { readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const DEFAULT_OUTPUT = 'slides.pdf';
const DEFAULT_SLIDES_DIR = 'slides';
const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
const FALLBACK_SLIDE_SIZE = { width: 960, height: 540 };

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/html2pdf.js [options]',
      '',
      'Options:',
      `  --output <path>  Output PDF path (default: ${DEFAULT_OUTPUT})`,
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
      '  -h, --help       Show this help message',
      '',
      'Examples:',
      '  node scripts/html2pdf.js',
      '  node scripts/html2pdf.js --output dist/deck.pdf',
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

  return options;
}

export async function findSlideFiles(slidesDir = resolve(process.cwd(), DEFAULT_SLIDES_DIR)) {
  const entries = await readdir(slidesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(sortSlideFiles);
}

function normalizeDimension(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round(value));
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

export async function normalizePageForPdf(page) {
  const size = await page.evaluate((fallbackSize) => {
    const body = document.body;
    const html = document.documentElement;
    const htmlStyle = window.getComputedStyle(html);
    const viewportWidth = window.innerWidth || html.clientWidth || 0;
    const viewportHeight = window.innerHeight || html.clientHeight || 0;

    const parsePx = (value) => Number.parseFloat(value) || 0;
    const readBox = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        width: parsePx(style.width) || rect.width || 0,
        height: parsePx(style.height) || rect.height || 0,
      };
    };
    const isCloseTo = (value, other) => Math.abs(value - other) <= 2;
    const bodySize = readBox(body);

    const elementChildren = Array.from(body.children).filter((node) => node instanceof HTMLElement);
    const childFrames = elementChildren
      .map((element) => ({ element, ...readBox(element) }))
      .filter((frame) => frame.width > 0 && frame.height > 0)
      .sort((left, right) => right.width * right.height - left.width * left.height);
    const [largestChildFrame] = childFrames;
    const bodyUsesViewportFrame =
      isCloseTo(bodySize.width, viewportWidth) || isCloseTo(bodySize.height, viewportHeight);
    const childDefinesSlideFrame =
      largestChildFrame &&
      (bodyUsesViewportFrame ||
        largestChildFrame.width < bodySize.width - 2 ||
        largestChildFrame.height < bodySize.height - 2);
    const frame = childDefinesSlideFrame ? largestChildFrame : bodySize;
    const normalizedWidth = Math.max(
      1,
      Math.round(frame.width || fallbackSize.width),
    );
    const normalizedHeight = Math.max(
      1,
      Math.round(frame.height || fallbackSize.height),
    );

    html.style.margin = '0';
    html.style.padding = '0';
    html.style.overflow = 'hidden';
    if (htmlStyle.width === 'auto' || !parsePx(htmlStyle.width)) {
      html.style.width = `${normalizedWidth}px`;
    }
    if (htmlStyle.height === 'auto' || !parsePx(htmlStyle.height)) {
      html.style.height = `${normalizedHeight}px`;
    }

    body.style.margin = '0';
    body.style.padding = '0';
    body.style.overflow = 'hidden';
    body.style.width = `${normalizedWidth}px`;
    body.style.height = `${normalizedHeight}px`;

    return { width: normalizedWidth, height: normalizedHeight };
  }, FALLBACK_SLIDE_SIZE);

  await page.setViewportSize(size);
  return size;
}

export async function renderSlideToPdf(page, slideFile, slidesDir) {
  const slidePath = join(slidesDir, slideFile);
  const slideUrl = pathToFileURL(slidePath).href;

  await page.goto(slideUrl, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });

  const size = await normalizePageForPdf(page);
  return page.pdf(buildPdfOptions(size.width, size.height));
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

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const slideFiles = await findSlideFiles(slidesDir);
  if (slideFiles.length === 0) {
    throw new Error(`No slide-*.html files found in: ${slidesDir}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const slidePdfs = [];

  try {
    for (const slideFile of slideFiles) {
      const slidePdf = await renderSlideToPdf(page, slideFile, slidesDir);
      slidePdfs.push(slidePdf);
    }
  } finally {
    await browser.close();
  }

  const mergedPdf = await mergePdfBuffers(slidePdfs);
  const outputPath = resolve(process.cwd(), options.output);
  await writeFile(outputPath, mergedPdf);

  process.stdout.write(`Generated PDF: ${outputPath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
