import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import sharp from 'sharp';
import { chromium } from 'playwright';

import { renderSlideToPdf } from '../../scripts/html2pdf.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OFFSET_FRAME_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'offset-frame');

function runPdfExport(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(REPO_ROOT, 'scripts', 'html2pdf.js'), ...args], {
      cwd,
      env: {
        ...process.env,
        PPT_AGENT_PACKAGE_ROOT: REPO_ROOT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`pdf export failed (${code})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

function canExtractPdfText() {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  return probe.status === 0 || probe.stderr.includes('pdftotext');
}

function canRasterizePdfPages() {
  const probe = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' });
  return probe.status === 0 || probe.stderr.includes('pdftoppm');
}

function extractPdfText(pdfPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftotext', [pdfPath, '-'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`pdftotext failed (${code})\n${stderr}`));
    });
  });
}

function rasterizePdfPage(pdfPath, outputPrefix, page = 1) {
  return new Promise((resolve, reject) => {
    const child = spawn('pdftoppm', ['-png', '-f', String(page), '-singlefile', pdfPath, outputPrefix], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(`${outputPrefix}.png`);
        return;
      }
      reject(new Error(`pdftoppm failed (${code})\n${stderr}`));
    });
  });
}

async function readPixel(pngPath, x, y) {
  const image = sharp(pngPath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const channels = metadata.channels ?? 0;
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const index = (y * width + x) * channels;
  return {
    width,
    height,
    pixel: Array.from(data.slice(index, index + channels)),
  };
}

async function readRelativePixel(pngPath, relativeX, relativeY) {
  const image = sharp(pngPath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const x = Math.min(width - 1, Math.max(0, Math.floor(width * relativeX)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(height * relativeY)));
  return readPixel(pngPath, x, y);
}

async function writeFixtureDeck(workspace) {
  const slidesDir = join(workspace, 'slides');
  await mkdir(slidesDir, { recursive: true });

  const baseHead = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { font-family: Helvetica, Arial, sans-serif; }
    p, h1 { margin: 0; }
  </style>
</head>`;

  const normalSlide = `${baseHead}
<body style="width: 960px; height: 540px; overflow: hidden;">
  <div style="width: 960px; height: 540px; background: #E8F1FF; padding: 48px; box-sizing: border-box;">
    <h1 style="font-size: 48px;">Searchable Text Slide</h1>
    <p style="margin-top: 24px; font-size: 28px;">Capture default should preserve layout.</p>
  </div>
</body>
</html>`;

  const bleedRegressionSlide = `${baseHead}
<body>
  <div id="frame" style="position: relative; width: 960px; height: 540px; overflow: hidden; background: #F8F5EC;">
    <div style="position: absolute; inset: 0; padding: 40px; box-sizing: border-box;">
      <h1 style="font-size: 44px;">Bleed Regression</h1>
      <p style="margin-top: 24px; font-size: 26px;">The PDF page should still be 960x540.</p>
    </div>
  </div>
  <div style="position: absolute; top: 0; left: 1080px; width: 220px; height: 540px; background: #FF0000;"></div>
</body>
</html>`;

  await writeFile(join(slidesDir, 'slide-01.html'), normalSlide, 'utf8');
  await writeFile(join(slidesDir, 'slide-02.html'), bleedRegressionSlide, 'utf8');

  return slidesDir;
}

async function copyOffsetFrameFixture(workspace) {
  const slidesDir = join(workspace, 'slides');
  await cp(OFFSET_FRAME_FIXTURE_DIR, slidesDir, { recursive: true });
  return slidesDir;
}

function getPageSize(page) {
  const { width, height } = page.getSize();
  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

test('capture mode is the default and produces image-backed pages', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-capture-'));

  try {
    await writeFixtureDeck(workspace);
    const outputPath = join(workspace, 'capture-default.pdf');

    const result = await runPdfExport(['--slides-dir', 'slides', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(capture mode\)/);

    const bytes = await readFile(outputPath);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);

    const firstPageSize = getPageSize(pdf.getPages()[0]);
    const secondPageSize = getPageSize(pdf.getPages()[1]);
    assert.deepEqual(firstPageSize, { width: 720, height: 405 });
    assert.deepEqual(secondPageSize, { width: 720, height: 405 });

    const rawPdf = Buffer.from(bytes).toString('latin1');
    assert.match(rawPdf, /\/Subtype\s*\/Image/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode keeps searchable browser text flow and normalizes the bleed regression slide size', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canExtractPdfText()) {
    t.skip('pdftotext is required for searchable-text verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-print-'));

  try {
    await writeFixtureDeck(workspace);
    const outputPath = join(workspace, 'print.pdf');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const bytes = await readFile(outputPath);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);

    const firstPageSize = getPageSize(pdf.getPages()[0]);
    const secondPageSize = getPageSize(pdf.getPages()[1]);
    assert.deepEqual(firstPageSize, { width: 720, height: 405 });
    assert.deepEqual(secondPageSize, { width: 720, height: 405 });

    const rawPdf = Buffer.from(bytes).toString('latin1');
    assert.doesNotMatch(rawPdf, /\/Subtype\s*\/Image/);

    const extractedText = await extractPdfText(outputPath);
    assert.match(extractedText, /Searchable Text Slide/);
    assert.match(extractedText, /Bleed Regression/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode clips off-canvas bleed fixtures instead of leaving a right gutter', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canRasterizePdfPages()) {
    t.skip('pdftoppm is required for rendered-image verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-raster-'));

  try {
    await writeFixtureDeck(workspace);
    const outputPath = join(workspace, 'print-raster.pdf');
    const rasterPrefix = join(workspace, 'print-raster-page-2');

    await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 2);

    const edgeSample = await readRelativePixel(pngPath, 0.993, 0.5);
    assert.deepEqual(edgeSample.pixel.slice(0, 3), [248, 245, 236]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('offset-frame fixture keeps capture crops aligned to the detected frame origin', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-offset-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await copyOffsetFrameFixture(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });
    const pixel = await sharp(result.pngBytes)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assert.deepEqual(Array.from(pixel), [255, 0, 0]);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('offset-frame fixture keeps print exports cropped to the detected frame origin', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canExtractPdfText()) {
    t.skip('pdftotext is required for searchable-text verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-offset-print-'));

  try {
    await copyOffsetFrameFixture(workspace);
    const outputPath = join(workspace, 'offset-frame.pdf');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const bytes = await readFile(outputPath);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual(getPageSize(pdf.getPages()[0]), { width: 720, height: 405 });

    const extractedText = await extractPdfText(outputPath);
    assert.match(extractedText, /Offset Frame Regression/);
    assert.match(extractedText, /EDGE/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
