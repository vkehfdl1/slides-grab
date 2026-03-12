import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { chromium } from 'playwright';

import { DEFAULT_SLIDES_DIR, parseValidateCliArgs } from '../../src/validation/cli.js';
import { createValidationResult, findSlideFiles, scanSlides } from '../../src/validation/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDeckDir = path.join(__dirname, 'fixtures', 'sample-deck');
const repoRoot = path.join(__dirname, '..', '..');

test('parseValidateCliArgs applies defaults and reads --slides-dir', () => {
  assert.deepEqual(parseValidateCliArgs([]), {
    slidesDir: DEFAULT_SLIDES_DIR,
    help: false,
  });

  assert.equal(parseValidateCliArgs(['--slides-dir', 'decks/demo']).slidesDir, 'decks/demo');
  assert.equal(parseValidateCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
  assert.throws(() => parseValidateCliArgs(['--slides-dir']), /missing value/i);
});

test('findSlideFiles sorts slide fixtures deterministically', async () => {
  const slideFiles = await findSlideFiles(fixtureDeckDir);
  assert.deepEqual(slideFiles, ['slide-01.html', 'slide-02.html', 'slide-03.html', 'slide-04.html']);
});

test('scanSlides returns stable issue codes for regression fixtures', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    const slideFiles = await findSlideFiles(fixtureDeckDir);
    const slides = await scanSlides(page, fixtureDeckDir, slideFiles);
    const result = createValidationResult(slides);

    assert.equal(result.summary.totalSlides, 4);
    assert.equal(result.summary.failedSlides, 2);
    assert.equal(result.summary.passedSlides, 2);
    assert.equal(result.summary.criticalIssues, 3);
    assert.ok(result.summary.warnings >= 1);

    assert.equal(slides[0].status, 'pass');
    assert.deepEqual(slides[0].critical, []);

    assert.deepEqual(
      slides[1].critical.map((issue) => issue.code),
      ['overflow-outside-frame', 'overflow-outside-frame'],
    );

    assert.deepEqual(
      slides[2].critical.map((issue) => issue.code),
      ['text-clipped'],
    );

    assert.deepEqual(
      slides[3].warning.map((issue) => issue.code),
      ['sibling-overlap'],
    );
  } finally {
    await browser.close();
  }
});

test('validate CLI preserves JSON result shape for regression fixtures', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(typeof payload.generatedAt, 'string');
  assert.deepEqual(payload.frame, {
    widthPt: 720,
    heightPt: 405,
    widthPx: 960,
    heightPx: 540,
  });
  assert.equal(payload.summary.totalSlides, 4);
  assert.equal(payload.summary.failedSlides, 2);
  assert.equal(payload.slides.length, 4);
});
