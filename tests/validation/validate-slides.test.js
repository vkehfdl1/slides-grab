import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { chromium } from 'playwright';

import {
  DEFAULT_SLIDES_DIR,
  DEFAULT_VALIDATE_FORMAT,
  parseValidateCliArgs,
} from '../../src/validation/cli.js';
import { createValidationResult, findSlideFiles, scanSlides, selectSlideFiles } from '../../src/validation/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDeckDir = path.join(__dirname, 'fixtures', 'sample-deck');
const repoRoot = path.join(__dirname, '..', '..');

test('parseValidateCliArgs applies defaults and reads --slides-dir', () => {
  assert.deepEqual(parseValidateCliArgs([]), {
    slidesDir: DEFAULT_SLIDES_DIR,
    format: DEFAULT_VALIDATE_FORMAT,
    help: false,
    slides: [],
  });

  assert.equal(parseValidateCliArgs(['--slides-dir', 'decks/demo']).slidesDir, 'decks/demo');
  assert.equal(parseValidateCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
  assert.equal(parseValidateCliArgs(['--format', 'json']).format, 'json');
  assert.deepEqual(
    parseValidateCliArgs(['--slide', 'slide-02.html', '--slide=slide-03.html']).slides,
    ['slide-02.html', 'slide-03.html'],
  );
  assert.throws(() => parseValidateCliArgs(['--slides-dir']), /missing value/i);
  assert.throws(() => parseValidateCliArgs(['--format', 'xml']), /unknown --format value/i);
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

test('selectSlideFiles narrows validation to requested slide names', async () => {
  const slideFiles = await findSlideFiles(fixtureDeckDir);
  assert.deepEqual(selectSlideFiles(slideFiles, ['slide-03.html']), ['slide-03.html']);
  assert.deepEqual(selectSlideFiles(slideFiles, ['nested/slide-04.html']), ['slide-04.html']);
  assert.throws(() => selectSlideFiles(slideFiles, ['slide-99.html'], fixtureDeckDir), /not found/i);
});

test('validate CLI defaults to concise output', () => {
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
  assert.match(command.stdout, /^slide-02\.html:error\[overflow-outside-frame\]/m);
  assert.match(command.stdout, /^slide-03\.html:error\[text-clipped\]/m);
  assert.match(command.stdout, /^slide-04\.html:warning\[sibling-overlap\]/m);
  assert.match(command.stdout, /^summary: 4 slide\(s\) checked, 2 passed, 2 failed, 3 error\(s\), 1 warning\(s\)$/m);
  assert.doesNotMatch(command.stdout, /^\s*\{/);
});

test('validate CLI json-full preserves legacy detailed result shape', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir, '--format', 'json-full'],
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

test('validate CLI json emits flattened diagnostics', () => {
  const command = spawnSync(
    process.execPath,
    ['scripts/validate-slides.js', '--slides-dir', fixtureDeckDir, '--format', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.summary.totalSlides, 4);
  assert.equal(payload.summary.errors, 3);
  assert.equal(payload.summary.warnings, 1);
  assert.equal(Array.isArray(payload.diagnostics), true);
  assert.equal(payload.diagnostics.length, 4);
  assert.equal('slides' in payload, false);
  assert.equal(payload.diagnostics[0].slide, 'slide-02.html');
  assert.equal(payload.diagnostics[0].severity, 'error');
});

test('validate CLI can target a single slide', () => {
  const command = spawnSync(
    process.execPath,
    [
      'scripts/validate-slides.js',
      '--slides-dir',
      fixtureDeckDir,
      '--slide',
      'slide-03.html',
      '--format',
      'json-full',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(payload.summary.totalSlides, 1);
  assert.equal(payload.summary.failedSlides, 1);
  assert.equal(payload.summary.criticalIssues, 1);
  assert.deepEqual(payload.slides.map((slide) => slide.slide), ['slide-03.html']);
});

test('slides-grab lint aliases validate output and exit code', () => {
  const command = spawnSync(
    process.execPath,
    ['bin/ppt-agent.js', 'lint', '--slides-dir', fixtureDeckDir, '--format', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(command.status, 1);
  assert.equal(command.stderr, '');

  const payload = JSON.parse(command.stdout);
  assert.equal(payload.summary.totalSlides, 4);
  assert.equal(payload.summary.failedSlides, 2);
  assert.equal(payload.summary.errors, 3);
});
