import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
