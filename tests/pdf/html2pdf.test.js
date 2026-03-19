import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright';
import sharp from 'sharp';

import {
  buildCapturePdf,
  buildPageOptions,
  buildPdfOptions,
  findSlideFiles,
  mergePdfBuffers,
  parseCliArgs,
  renderSlideToPdf,
  sortSlideFiles,
} from '../../scripts/html2pdf.js';

test('parseCliArgs applies defaults for output, slides dir, mode, and help', () => {
  const parsed = parseCliArgs([]);

  assert.deepEqual(parsed, {
    output: 'slides.pdf',
    slidesDir: 'slides',
    mode: 'capture',
    resolution: '',
    help: false,
  });
});

test('parseCliArgs reads output, slides dir, mode, and resolution options', () => {
  assert.equal(parseCliArgs(['--output', 'dist/custom.pdf']).output, 'dist/custom.pdf');
  assert.equal(parseCliArgs(['--output=deck.pdf']).output, 'deck.pdf');
  assert.equal(parseCliArgs(['--slides-dir', 'decks/product-a']).slidesDir, 'decks/product-a');
  assert.equal(parseCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
  assert.equal(parseCliArgs(['--mode', 'print']).mode, 'print');
  assert.equal(parseCliArgs(['--mode=CAPTURE']).mode, 'capture');
  assert.equal(parseCliArgs(['--resolution', '2160p']).resolution, '2160p');
  assert.equal(parseCliArgs(['--resolution=4k']).resolution, '2160p');
});

test('parseCliArgs ignores resolution when mode is print', () => {
  const parsed = parseCliArgs(['--mode', 'print', '--resolution', '2160p']);
  assert.equal(parsed.mode, 'print');
  assert.equal(parsed.resolution, '');
});

test('parseCliArgs rejects missing and invalid option values', () => {
  assert.throws(() => parseCliArgs(['--output']), /missing value/i);
  assert.throws(() => parseCliArgs(['--slides-dir']), /missing value/i);
  assert.throws(() => parseCliArgs(['--mode']), /missing value/i);
  assert.throws(() => parseCliArgs(['--resolution']), /missing value/i);
  assert.throws(() => parseCliArgs(['--mode', 'vector']), /unknown pdf mode/i);
  assert.throws(() => parseCliArgs(['--resolution', 'retina']), /unknown resolution/i);
});

test('sortSlideFiles orders by slide number then file name', () => {
  const sorted = ['slide-10.html', 'slide-2.html', 'slide-alpha.html', 'slide-01.html'].sort(
    sortSlideFiles,
  );

  assert.deepEqual(sorted, ['slide-01.html', 'slide-2.html', 'slide-10.html', 'slide-alpha.html']);
});

test('findSlideFiles returns slide-*.html files in sorted order', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'html2pdf-slides-'));
  try {
    await Promise.all([
      writeFile(path.join(tempDir, 'slide-10.html'), ''),
      writeFile(path.join(tempDir, 'slide-2.html'), ''),
      writeFile(path.join(tempDir, 'note.txt'), ''),
      writeFile(path.join(tempDir, 'slide-01.html'), ''),
      writeFile(path.join(tempDir, 'Slide-03.HTML'), ''),
    ]);

    const files = await findSlideFiles(tempDir);
    assert.deepEqual(files, ['slide-01.html', 'slide-2.html', 'Slide-03.HTML', 'slide-10.html']);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('buildPdfOptions preserves backgrounds for print rendering', () => {
  const options = buildPdfOptions(960, 540);

  assert.equal(options.printBackground, true);
  assert.equal(options.pageRanges, '1');
  assert.equal(options.width, '960px');
  assert.equal(options.height, '540px');
  assert.equal(options.scale, 1);
});

test('buildPageOptions uses 2x device scale for capture and 1x for print', () => {
  assert.deepEqual(buildPageOptions('capture'), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 2,
  });

  assert.deepEqual(buildPageOptions('print'), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
  });
});

test('buildPageOptions honors requested capture resolution presets', () => {
  assert.deepEqual(buildPageOptions('capture', '1440p'), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1440 / 540,
  });

  assert.deepEqual(buildPageOptions('print', '2160p'), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
  });
});

test('mergePdfBuffers combines all slide pdf pages into one document', async () => {
  async function createSinglePagePdf() {
    const doc = await PDFDocument.create();
    doc.addPage([720, 405]);
    return doc.save();
  }

  const mergedBytes = await mergePdfBuffers([await createSinglePagePdf(), await createSinglePagePdf()]);
  const mergedDoc = await PDFDocument.load(mergedBytes);

  assert.equal(mergedDoc.getPageCount(), 2);
});

test('renderSlideToPdf uses inner wrapper dimensions when body has no slide size', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fixturesDir = path.resolve('tests/pdf/fixtures');

  try {
    const result = await renderSlideToPdf(page, 'slide-missing-body-dimensions.html', fixturesDir, {
      mode: 'print',
    });
    const pdfBytes = result.pdfBytes;
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const [pdfPage] = pdfDoc.getPages();
    const { width, height } = pdfPage.getSize();

    assert.equal(Math.round(width), 720);
    assert.equal(Math.round(height), 405);
  } finally {
    await browser.close();
  }
});

test('renderSlideToPdf print mode keeps original frame size even when resolution is provided', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fixturesDir = path.resolve('tests/pdf/fixtures');

  try {
    const result = await renderSlideToPdf(page, 'slide-missing-body-dimensions.html', fixturesDir, {
      mode: 'print',
      resolution: '720p',
    });
    const pdfBytes = result.pdfBytes;
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const [pdfPage] = pdfDoc.getPages();
    const { width, height } = pdfPage.getSize();

    assert.equal(Math.round(width), 720);
    assert.equal(Math.round(height), 405);
    assert.equal(result.width, 960);
    assert.equal(result.height, 540);
  } finally {
    await browser.close();
  }
});

test('renderSlideToPdf keeps explicitly sized body frame even with smaller inner content', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const fixturesDir = path.resolve('tests/pdf/fixtures');

  try {
    const result = await renderSlideToPdf(page, 'slide-explicit-body-with-inner-content.html', fixturesDir, {
      mode: 'print',
    });

    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
  } finally {
    await browser.close();
  }
});

test('renderSlideToPdf capture mode preserves body padding when body is the slide frame', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(buildPageOptions('capture'));
  const fixturesDir = path.resolve('tests/pdf/fixtures');

  try {
    const result = await renderSlideToPdf(page, 'slide-body-padding-layout.html', fixturesDir, {
      mode: 'capture',
    });
    const edgePixel = await sharp(result.pngBytes)
      .extract({ left: 8, top: 8, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assert.deepEqual(Array.from(edgePixel.slice(0, 3)), [17, 17, 17]);
  } finally {
    await browser.close();
  }
});

test('renderSlideToPdf capture mode normalizes raster size to requested resolution', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage(buildPageOptions('capture', '720p'));
  const fixturesDir = path.resolve('tests/pdf/fixtures');

  try {
    const result = await renderSlideToPdf(page, 'slide-fixed-1920x1080.html', fixturesDir, {
      mode: 'capture',
      resolution: '720p',
    });
    const metadata = await sharp(result.pngBytes).metadata();

    assert.equal(result.width, 1920);
    assert.equal(result.height, 1080);
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
  } finally {
    await browser.close();
  }
});

test('buildCapturePdf creates one image-backed page per slide', async () => {
  const pngBytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
    0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
    120, 156, 99, 248, 255, 159, 161, 30, 0, 7, 130, 2, 127, 63, 157, 167, 156,
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);

  const capturePdf = await buildCapturePdf([
    { width: 720, height: 405, pngBytes },
    { width: 960, height: 540, pngBytes },
  ]);
  const captureDoc = await PDFDocument.load(capturePdf);

  assert.equal(captureDoc.getPageCount(), 2);
  assert.match(Buffer.from(capturePdf).toString('latin1'), /\/Subtype\s*\/Image/);
});
