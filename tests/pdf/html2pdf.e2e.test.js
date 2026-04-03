import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { chromium } from 'playwright';

import { renderSlideToPdf } from '../../scripts/html2pdf.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OFFSET_FRAME_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'offset-frame');
const RUNTIME_DIRECT_CHILD_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'runtime-direct-child');
const RUNTIME_DIRECT_CHILD_FRAME_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'runtime-direct-child-frame');
const OVERLAPPING_FRAME_SIBLINGS_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'overlapping-frame-siblings');
const SAME_FRAME_SIBLINGS_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'same-frame-siblings');
const TRANSFORMED_FRAME_FIXTURE_DIR = join(REPO_ROOT, 'tests', 'pdf', 'fixtures', 'transformed-frame');

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
  if (probe.error?.code === 'ENOENT') {
    return false;
  }
  return probe.status === 0 || probe.status === 1;
}

function canRasterizePdfPages() {
  const probe = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    return false;
  }
  return probe.status === 0 || probe.status === 1;
}

function canEncodeVideoFixtures() {
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    return false;
  }
  return probe.status === 0;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg failed (${code})\n${stderr}`));
    });
  });
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
    const child = spawn(
      'pdftoppm',
      ['-png', '-f', String(page), '-l', String(page), '-singlefile', pdfPath, outputPrefix],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

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

function assertPixelApproximately(actual, expected, tolerance = 8) {
  assert.equal(actual.length >= 3, true, `expected at least 3 channels, got ${actual.length}`);

  for (let index = 0; index < 3; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `expected RGB ${expected.join(',')} within ±${tolerance}, got ${actual.slice(0, 3).join(',')}`,
    );
  }
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

async function copyRuntimeDirectChildFixture(workspace) {
  const slidesDir = join(workspace, 'slides');
  await cp(RUNTIME_DIRECT_CHILD_FIXTURE_DIR, slidesDir, { recursive: true });
  return slidesDir;
}

async function copyRuntimeDirectChildFrameFixture(workspace) {
  const slidesDir = join(workspace, 'slides');
  await cp(RUNTIME_DIRECT_CHILD_FRAME_FIXTURE_DIR, slidesDir, { recursive: true });
  return slidesDir;
}

async function copyOverlappingFrameSiblingsFixture(workspace) {
  const slidesDir = join(workspace, 'slides');
  await cp(OVERLAPPING_FRAME_SIBLINGS_FIXTURE_DIR, slidesDir, { recursive: true });
  return slidesDir;
}

async function copySameFrameSiblingsFixture(workspace) {
  const slidesDir = join(workspace, 'slides');
  await cp(SAME_FRAME_SIBLINGS_FIXTURE_DIR, slidesDir, { recursive: true });
  return slidesDir;
}

async function copyTransformedFrameFixture(workspace) {
  const slidesDir = join(workspace, 'slides');
  await cp(TRANSFORMED_FRAME_FIXTURE_DIR, slidesDir, { recursive: true });
  return slidesDir;
}

async function writeAutoplayVideoPosterDeck(workspace) {
  const slidesDir = join(workspace, 'slides');
  const assetsDir = join(slidesDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=160x90:d=1',
    '-pix_fmt',
    'yuv420p',
    join(assetsDir, 'hero.mp4'),
  ]);

  await sharp({
    create: {
      width: 160,
      height: 90,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .png()
    .toFile(join(assetsDir, 'hero-poster.png'));

  const slideHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; padding: 0; background: #101820; }
    body {
      width: 960px;
      height: 540px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    video {
      width: 480px;
      height: 270px;
      display: block;
      background: #000;
    }
  </style>
</head>
<body>
  <video
    autoplay
    muted
    loop
    playsinline
    poster="./assets/hero-poster.png"
    src="./assets/hero.mp4"
  ></video>
</body>
</html>`;

  await writeFile(join(slidesDir, 'slide-01.html'), slideHtml, 'utf8');
  return slidesDir;
}

async function writeClippedVideoPosterDeck(workspace) {
  const slidesDir = join(workspace, 'slides');
  const assetsDir = join(slidesDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=160x90:d=1',
    '-pix_fmt',
    'yuv420p',
    join(assetsDir, 'clipped.mp4'),
  ]);

  await sharp({
    create: {
      width: 160,
      height: 90,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .png()
    .toFile(join(assetsDir, 'clipped-poster.png'));

  const slideHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body {
      width: 960px;
      height: 540px;
      overflow: hidden;
      position: relative;
      font-family: Helvetica, Arial, sans-serif;
    }
    .frame {
      position: absolute;
      top: 160px;
      left: 220px;
      width: 200px;
      height: 100px;
      overflow: hidden;
      background: #ffffff;
      border: 2px solid #111111;
    }
    video {
      position: absolute;
      top: 0;
      left: -80px;
      width: 320px;
      height: 100px;
      display: block;
      object-fit: cover;
      object-position: center;
      background: #000000;
    }
  </style>
</head>
<body>
  <div class="frame">
    <video
      autoplay
      muted
      loop
      playsinline
      poster="./assets/clipped-poster.png"
      src="./assets/clipped.mp4"
    ></video>
  </div>
</body>
</html>`;

  await writeFile(join(slidesDir, 'slide-01.html'), slideHtml, 'utf8');
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
    return t.skip('pdftotext is required for searchable-text verification');
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
    return t.skip('pdftoppm is required for rendered-image verification');
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

test('print mode preserves body padding used as slide margin', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canRasterizePdfPages()) {
    return t.skip('pdftoppm is required for rendered-image verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-body-padding-print-'));

  try {
    const slidesDir = join(workspace, 'slides');
    await mkdir(slidesDir, { recursive: true });

    const slideHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 960px;
      height: 540px;
      overflow: hidden;
      padding: 48px 64px;
      background: #102030;
      font-family: Helvetica, Arial, sans-serif;
    }
    .panel {
      width: 100%;
      height: 100%;
      background: #F4EBD0;
    }
  </style>
</head>
<body>
  <div class="panel"></div>
</body>
</html>`;

    await writeFile(join(slidesDir, 'slide-01.html'), slideHtml, 'utf8');

    const outputPath = join(workspace, 'body-padding.pdf');
    const rasterPrefix = join(workspace, 'body-padding-page-1');

    await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);

    const edgeSample = await readRelativePixel(pngPath, 0.02, 0.5);
    const innerSample = await readRelativePixel(pngPath, 0.12, 0.5);

    assertPixelApproximately(edgeSample.pixel.slice(0, 3), [16, 32, 48]);
    assertPixelApproximately(innerSample.pixel.slice(0, 3), [244, 235, 208]);
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
    const cornerPixel = await sharp(result.pngBytes)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const edgePixel = await sharp(result.pngBytes)
      .extract({ left: result.width - 1, top: Math.floor(result.height / 2), width: 1, height: 1 })
      .raw()
      .toBuffer();

    assert.deepEqual(Array.from(cornerPixel), [255, 0, 0]);
    assert.deepEqual(Array.from(edgePixel), [0, 71, 255]);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('offset-frame fixture keeps print exports cropped to the detected frame origin', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canExtractPdfText() || !canRasterizePdfPages()) {
    return t.skip('pdftotext and pdftoppm are required for searchable-text and raster verification');
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

    const rasterPrefix = join(workspace, 'offset-frame-page-1');
    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);
    const edgeSample = await readRelativePixel(pngPath, 0.993, 0.5);
    assert.deepEqual(edgeSample.pixel.slice(0, 3), [0, 71, 255]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode preserves JS-painted direct-child canvas frames', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-runtime-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await copyRuntimeDirectChildFixture(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });

    const leftPixel = await sharp(result.pngBytes)
      .extract({ left: 32, top: 32, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const rightPixel = await sharp(result.pngBytes)
      .extract({ left: result.width - 32, top: 32, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(leftPixel), [230, 80, 0]);
    assertPixelApproximately(Array.from(rightPixel), [0, 71, 255]);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode preserves JS-painted direct-child canvas frames', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canRasterizePdfPages()) {
    return t.skip('pdftoppm is required for rendered-image verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-runtime-print-'));

  try {
    await copyRuntimeDirectChildFixture(workspace);
    const outputPath = join(workspace, 'runtime-direct-child.pdf');
    const rasterPrefix = join(workspace, 'runtime-direct-child-page-1');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const bytes = await readFile(outputPath);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual(getPageSize(pdf.getPages()[0]), { width: 720, height: 405 });

    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);
    const leftSample = await readRelativePixel(pngPath, 0.035, 0.06);
    const rightSample = await readRelativePixel(pngPath, 0.965, 0.06);

    assertPixelApproximately(leftSample.pixel, [230, 80, 0], 12);
    assertPixelApproximately(rightSample.pixel, [0, 71, 255], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode uses a video poster thumbnail instead of the live autoplay frame', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canEncodeVideoFixtures()) {
    return t.skip('ffmpeg is required for video fixture generation');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-video-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await writeAutoplayVideoPosterDeck(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });
    const centerPixel = await sharp(result.pngBytes)
      .extract({ left: Math.floor(result.width / 2), top: Math.floor(result.height / 2), width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(centerPixel), [0, 0, 255], 12);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode uses a video poster thumbnail instead of the live autoplay frame', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canEncodeVideoFixtures() || !canRasterizePdfPages()) {
    return t.skip('ffmpeg and pdftoppm are required for rendered video-poster verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-video-print-'));

  try {
    await writeAutoplayVideoPosterDeck(workspace);
    const outputPath = join(workspace, 'video-poster.pdf');
    const rasterPrefix = join(workspace, 'video-poster-page-1');

    await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);

    const centerPixel = await readRelativePixel(pngPath, 0.5, 0.5);
    assertPixelApproximately(centerPixel.pixel, [0, 0, 255], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode keeps video poster thumbnails clipped by ancestor overflow', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canEncodeVideoFixtures()) {
    return t.skip('ffmpeg is required for video fixture generation');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-video-clip-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await writeClippedVideoPosterDeck(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });
    const outsidePixel = await sharp(result.pngBytes)
      .extract({ left: 195, top: 210, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const insidePixel = await sharp(result.pngBytes)
      .extract({ left: 240, top: 210, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(outsidePixel), [255, 255, 255], 12);
    assertPixelApproximately(Array.from(insidePixel), [0, 0, 255], 12);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode keeps video poster thumbnails clipped by ancestor overflow', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canEncodeVideoFixtures() || !canRasterizePdfPages()) {
    return t.skip('ffmpeg and pdftoppm are required for rendered video clipping verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-video-clip-print-'));

  try {
    await writeClippedVideoPosterDeck(workspace);
    const outputPath = join(workspace, 'video-clipped.pdf');
    const rasterPrefix = join(workspace, 'video-clipped-page-1');

    await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);

    const outsidePixel = await readRelativePixel(pngPath, 195 / 960, 210 / 540);
    const insidePixel = await readRelativePixel(pngPath, 240 / 960, 210 / 540);

    assertPixelApproximately(outsidePixel.pixel, [255, 255, 255], 12);
    assertPixelApproximately(insidePixel.pixel, [0, 0, 255], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode preserves runtime-painted direct-child frame roots during isolation', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-runtime-frame-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await copyRuntimeDirectChildFrameFixture(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });

    const leftPixel = await sharp(result.pngBytes)
      .extract({ left: 32, top: 32, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const rightPixel = await sharp(result.pngBytes)
      .extract({ left: result.width - 32, top: 32, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(leftPixel), [230, 80, 0]);
    assertPixelApproximately(Array.from(rightPixel), [0, 71, 255]);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode preserves runtime-painted direct-child frame roots during isolation', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canRasterizePdfPages()) {
    return t.skip('pdftoppm is required for rendered-image verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-runtime-frame-print-'));

  try {
    await copyRuntimeDirectChildFrameFixture(workspace);
    const outputPath = join(workspace, 'runtime-direct-child-frame.pdf');
    const rasterPrefix = join(workspace, 'runtime-direct-child-frame-page-1');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const bytes = await readFile(outputPath);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.deepEqual(getPageSize(pdf.getPages()[0]), { width: 720, height: 405 });

    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);
    const leftSample = await readRelativePixel(pngPath, 0.035, 0.06);
    const rightSample = await readRelativePixel(pngPath, 0.965, 0.06);

    assertPixelApproximately(leftSample.pixel, [230, 80, 0], 12);
    assertPixelApproximately(rightSample.pixel, [0, 71, 255], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode preserves original overlap order for same-frame body siblings', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-overlap-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await copyOverlappingFrameSiblingsFixture(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });

    const overlapPixel = await sharp(result.pngBytes)
      .extract({ left: 32, top: 32, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(overlapPixel), [230, 80, 0], 12);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode preserves original overlap order for same-frame body siblings', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canRasterizePdfPages()) {
    return t.skip('pdftoppm is required for rendered-image verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-overlap-print-'));

  try {
    await copyOverlappingFrameSiblingsFixture(workspace);
    const outputPath = join(workspace, 'overlapping-frame-siblings.pdf');
    const rasterPrefix = join(workspace, 'overlapping-frame-siblings-page-1');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);
    const overlapSample = await readRelativePixel(pngPath, 0.035, 0.06);

    assertPixelApproximately(overlapSample.pixel, [230, 80, 0], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode keeps same-frame top-level siblings inside the selected slide frame', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-sibling-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await copySameFrameSiblingsFixture(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });

    const overlayPixel = await sharp(result.pngBytes)
      .extract({ left: 820, top: 90, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(overlayPixel), [0, 71, 255], 12);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode keeps same-frame top-level siblings inside the selected slide frame', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canExtractPdfText() || !canRasterizePdfPages()) {
    return t.skip('pdftotext and pdftoppm are required for sibling verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-sibling-print-'));

  try {
    await copySameFrameSiblingsFixture(workspace);
    const outputPath = join(workspace, 'same-frame-siblings.pdf');
    const rasterPrefix = join(workspace, 'same-frame-siblings-page-1');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const extractedText = await extractPdfText(outputPath);
    assert.match(extractedText, /Overlay Text/);

    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);
    const overlaySample = await readRelativePixel(pngPath, 0.855, 0.17);
    assertPixelApproximately(overlaySample.pixel, [0, 71, 255], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('capture mode preserves transformed slide roots during normalization', { concurrency: false, timeout: 120000 }, async () => {
  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-transform-capture-'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 960, height: 540 },
  });

  try {
    const slidesDir = await copyTransformedFrameFixture(workspace);
    const result = await renderSlideToPdf(page, 'slide-01.html', slidesDir, { mode: 'capture' });

    const cornerPixel = await sharp(result.pngBytes)
      .extract({ left: 16, top: 16, width: 1, height: 1 })
      .raw()
      .toBuffer();

    assertPixelApproximately(Array.from(cornerPixel), [230, 80, 0], 12);
  } finally {
    await browser.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('print mode preserves transformed slide roots during normalization', { concurrency: false, timeout: 120000 }, async (t) => {
  if (!canRasterizePdfPages()) {
    return t.skip('pdftoppm is required for transform verification');
  }

  const workspace = await mkdtemp(join(os.tmpdir(), 'html2pdf-e2e-transform-print-'));

  try {
    await copyTransformedFrameFixture(workspace);
    const outputPath = join(workspace, 'transformed-frame.pdf');
    const rasterPrefix = join(workspace, 'transformed-frame-page-1');

    const result = await runPdfExport(['--slides-dir', 'slides', '--mode', 'print', '--output', outputPath], workspace);
    assert.match(result.stdout, /Generated PDF \(print mode\)/);

    const pngPath = await rasterizePdfPage(outputPath, rasterPrefix, 1);
    const cornerSample = await readRelativePixel(pngPath, 0.02, 0.03);
    assertPixelApproximately(cornerSample.pixel, [230, 80, 0], 12);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
