import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, cp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_ROOT = path.join(REPO_ROOT, 'tests', 'fixtures', 'image-contract');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runNodeScript(scriptPath, args = [], options = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: options.cwd ?? REPO_ROOT,
      env: {
        ...process.env,
        ...(options.env ?? {}),
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

    child.on('close', (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function waitForServerReady(port, child, outputRef) {
  const started = Date.now();
  while (Date.now() - started < 20000) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early: ${child.exitCode}\n${outputRef.value}`);
    }

    try {
      const res = await fetch(`http://localhost:${port}/api/slides`);
      if (res.ok) return;
    } catch {
      // retry
    }

    await sleep(150);
  }

  throw new Error(`server did not become ready\n${outputRef.value}`);
}

async function createWorkspaceFromFixture(fixtureName) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), `image-contract-${fixtureName}-`));
  await cp(path.join(FIXTURE_ROOT, fixtureName), path.join(workspace, 'slides'), { recursive: true });
  return workspace;
}

test('viewer preserves ./assets slide images when embedded through srcdoc', { concurrency: false }, async () => {
  const workspace = await createWorkspaceFromFixture('positive-local-asset');
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'build-viewer.js');
  let browser;

  try {
    const result = await runNodeScript(scriptPath, ['--slides-dir', path.join(workspace, 'slides')]);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const viewerHtml = await readFile(path.join(workspace, 'slides', 'viewer.html'), 'utf8');
    assert.match(viewerHtml, /<base href=&quot;\.\//);
    assert.match(viewerHtml, /\[slides-grab:image\]/);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(pathToFileURL(path.join(workspace, 'slides', 'viewer.html')).href, { waitUntil: 'load' });

    const image = page.frameLocator('iframe.slide-frame.active').locator('img');
    await image.waitFor();

    const state = await image.evaluate((element) => ({
      src: element.getAttribute('src'),
      naturalWidth: element.naturalWidth,
      complete: element.complete,
    }));

    assert.equal(state.src, './assets/example.svg');
    assert.equal(state.complete, true);
    assert.ok(state.naturalWidth > 0, `expected rendered local asset, got ${JSON.stringify(state)}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
});

test('editor serves slide-local assets from /slides/assets and renders them in slide HTML', { concurrency: false }, async () => {
  const workspace = await createWorkspaceFromFixture('positive-local-asset');
  const port = 3661;
  const outputRef = { value: '' };
  const serverScriptPath = path.join(REPO_ROOT, 'scripts', 'editor-server.js');
  const server = spawn(process.execPath, [serverScriptPath, '--port', String(port)], {
    cwd: workspace,
    env: {
      ...process.env,
      PPT_AGENT_PACKAGE_ROOT: REPO_ROOT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => {
    outputRef.value += chunk.toString();
  });
  server.stderr.on('data', (chunk) => {
    outputRef.value += chunk.toString();
  });

  let browser;
  try {
    await waitForServerReady(port, server, outputRef);

    const assetResponse = await fetch(`http://localhost:${port}/slides/assets/example.svg`);
    assert.equal(assetResponse.status, 200);
    assert.match(await assetResponse.text(), /<svg/);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://localhost:${port}/slides/slide-01.html`, { waitUntil: 'load' });

    const imageState = await page.locator('img').evaluate((element) => ({
      src: element.getAttribute('src'),
      naturalWidth: element.naturalWidth,
      complete: element.complete,
    }));

    assert.equal(imageState.src, './assets/example.svg');
    assert.equal(imageState.complete, true);
    assert.ok(imageState.naturalWidth > 0, `expected editor slide image to load, got ${JSON.stringify(imageState)}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    server.kill('SIGTERM');
    await sleep(400);
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
});

test('validate passes the positive local-asset fixture', { concurrency: false }, async () => {
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'validate-slides.js');
  const fixturePath = path.join(FIXTURE_ROOT, 'positive-local-asset');
  const result = await runNodeScript(scriptPath, ['--slides-dir', fixturePath]);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.summary.failedSlides, 0);
  assert.equal(payload.summary.criticalIssues, 0);
  assert.equal(payload.summary.warnings, 0);
});

test('validate reports missing local assets and unsupported path patterns with slide-specific diagnostics', { concurrency: false }, async () => {
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'validate-slides.js');

  const missingResult = await runNodeScript(scriptPath, ['--slides-dir', path.join(FIXTURE_ROOT, 'missing-local-asset')]);
  assert.equal(missingResult.code, 1, missingResult.stderr || missingResult.stdout);
  const missingPayload = JSON.parse(missingResult.stdout);
  assert.equal(missingPayload.summary.failedSlides, 1);
  assert.ok(
    missingPayload.slides[0].critical.some((issue) => issue.code === 'missing-local-asset' && issue.source === './assets/does-not-exist.svg'),
    JSON.stringify(missingPayload, null, 2),
  );

  const unsupportedResult = await runNodeScript(scriptPath, ['--slides-dir', path.join(FIXTURE_ROOT, 'unsupported-paths')]);
  assert.equal(unsupportedResult.code, 1, unsupportedResult.stderr || unsupportedResult.stdout);
  const unsupportedPayload = JSON.parse(unsupportedResult.stdout);
  const slide = unsupportedPayload.slides[0];
  assert.ok(slide.critical.some((issue) => issue.code === 'absolute-filesystem-image-path'));
  assert.ok(slide.critical.some((issue) => issue.code === 'unsupported-background-image'));
  assert.ok(slide.warning.some((issue) => issue.code === 'remote-image-url'));

  const bodyBackgroundResult = await runNodeScript(scriptPath, ['--slides-dir', path.join(FIXTURE_ROOT, 'body-background-missing-local-asset')]);
  assert.equal(bodyBackgroundResult.code, 1, bodyBackgroundResult.stderr || bodyBackgroundResult.stdout);
  const bodyBackgroundPayload = JSON.parse(bodyBackgroundResult.stdout);
  assert.ok(
    bodyBackgroundPayload.slides[0].critical.some((issue) => (
      issue.code === 'missing-local-background-asset' &&
      String(issue.assetPath || '').endsWith('/body-background-missing-local-asset/assets/missing-background.svg')
    )),
    JSON.stringify(bodyBackgroundPayload, null, 2),
  );

  const unsupportedRelativeResult = await runNodeScript(scriptPath, ['--slides-dir', path.join(FIXTURE_ROOT, 'unsupported-relative-path')]);
  assert.equal(unsupportedRelativeResult.code, 1, unsupportedRelativeResult.stderr || unsupportedRelativeResult.stdout);
  const unsupportedRelativePayload = JSON.parse(unsupportedRelativeResult.stdout);
  assert.ok(
    unsupportedRelativePayload.slides[0].critical.some((issue) => issue.code === 'unsupported-image-path' && issue.source === '../shared.svg'),
    JSON.stringify(unsupportedRelativePayload, null, 2),
  );
});

test('html2pdf can export the positive local-asset fixture', { concurrency: false }, async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'image-contract-pdf-'));
  const outputPath = path.join(workspace, 'deck.pdf');
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'html2pdf.js');

  try {
    const result = await runNodeScript(scriptPath, ['--slides-dir', path.join(FIXTURE_ROOT, 'positive-local-asset'), '--output', outputPath]);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    const info = await stat(outputPath);
    assert.ok(info.size > 0, `expected pdf output at ${outputPath}`);

    const pdfBytes = await readFile(outputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    assert.equal(pdfDoc.getPageCount(), 1);
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
});
