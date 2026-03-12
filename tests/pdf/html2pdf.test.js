import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { chromium } from 'playwright';

import {
  buildPdfOptions,
  findSlideFiles,
  mergePdfBuffers,
  parseCliArgs,
  renderSlideToPdf,
  sortSlideFiles,
} from '../../scripts/html2pdf.js';

test('parseCliArgs applies defaults for output and help', () => {
  const parsed = parseCliArgs([]);

  assert.deepEqual(parsed, {
    output: 'slides.pdf',
    slidesDir: 'slides',
    help: false,
  });
});

test('parseCliArgs reads --output option', () => {
  assert.equal(parseCliArgs(['--output', 'dist/custom.pdf']).output, 'dist/custom.pdf');
  assert.equal(parseCliArgs(['--output=deck.pdf']).output, 'deck.pdf');
  assert.equal(parseCliArgs(['--slides-dir', 'decks/product-a']).slidesDir, 'decks/product-a');
  assert.equal(parseCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
});

test('parseCliArgs rejects missing output value', () => {
  assert.throws(() => parseCliArgs(['--output']), /missing value/i);
  assert.throws(() => parseCliArgs(['--slides-dir']), /missing value/i);
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

test('buildPdfOptions preserves backgrounds for PDF rendering', () => {
  const options = buildPdfOptions(960, 540);

  assert.equal(options.printBackground, true);
  assert.equal(options.pageRanges, '1');
  assert.equal(options.width, '960px');
  assert.equal(options.height, '540px');
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
    const pdfBytes = await renderSlideToPdf(page, 'slide-missing-body-dimensions.html', fixturesDir);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const [pdfPage] = pdfDoc.getPages();
    const { width, height } = pdfPage.getSize();

    assert.equal(Math.round(width), 720);
    assert.equal(Math.round(height), 405);
  } finally {
    await browser.close();
  }
});
