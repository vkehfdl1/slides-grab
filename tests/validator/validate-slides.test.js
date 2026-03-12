import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import {
  findSlideFiles,
  inspectSlide,
  parseCliArgs,
  sortSlideFiles,
  validateSlidesInPage,
} from '../../src/validator/index.js';

const fixturesDir = path.resolve('tests/fixtures/validator/deck');

let browser;
let context;
let page;

before(async () => {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  page = await context.newPage();
});

after(async () => {
  await browser?.close();
});

test('parseCliArgs applies defaults and reads slides-dir options', () => {
  assert.deepEqual(parseCliArgs([]), {
    slidesDir: 'slides',
    help: false,
  });
  assert.equal(parseCliArgs(['--slides-dir', 'decks/product-a']).slidesDir, 'decks/product-a');
  assert.equal(parseCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
});

test('parseCliArgs rejects missing or unknown options', () => {
  assert.throws(() => parseCliArgs(['--slides-dir']), /missing value/i);
  assert.throws(() => parseCliArgs(['--bogus']), /unknown option/i);
});

test('sortSlideFiles keeps numeric order before lexical order', () => {
  const sorted = ['slide-10.html', 'slide-2.html', 'slide-alpha.html', 'slide-01.html'].sort(
    sortSlideFiles,
  );
  assert.deepEqual(sorted, ['slide-01.html', 'slide-2.html', 'slide-10.html', 'slide-alpha.html']);
});

test('findSlideFiles returns validator fixtures in sorted order', async () => {
  const files = await findSlideFiles(fixturesDir);
  assert.deepEqual(files, [
    'slide-01-overflow.html',
    'slide-02-text-clipped.html',
    'slide-03-sibling-overlap.html',
    'slide-04-clean.html',
  ]);
});

test('inspectSlide reports overflow-outside-frame as a critical failure', async () => {
  const result = await inspectSlide(page, 'slide-01-overflow.html', fixturesDir);

  assert.equal(result.status, 'fail');
  assert.equal(result.summary.criticalCount, 1);
  assert.equal(result.critical[0].code, 'overflow-outside-frame');
  assert.match(result.critical[0].element, /div\.panel/);
});

test('inspectSlide reports text clipping as a critical failure', async () => {
  const result = await inspectSlide(page, 'slide-02-text-clipped.html', fixturesDir);

  assert.equal(result.status, 'fail');
  assert.equal(result.summary.criticalCount, 1);
  assert.equal(result.critical[0].code, 'text-clipped');
  assert.match(result.critical[0].element, /p\.copy/);
  assert.ok(result.critical[0].metrics.scrollHeight > result.critical[0].metrics.clientHeight);
});

test('inspectSlide reports sibling overlap as a warning without failing the slide', async () => {
  const result = await inspectSlide(page, 'slide-03-sibling-overlap.html', fixturesDir);

  assert.equal(result.status, 'pass');
  assert.equal(result.summary.criticalCount, 0);
  assert.equal(result.summary.warningCount, 1);
  assert.equal(result.warning[0].code, 'sibling-overlap');
});

test('validateSlidesInPage preserves slide status and summary semantics across fixtures', async () => {
  const report = await validateSlidesInPage(page, fixturesDir);

  assert.deepEqual(report.slides.map((slide) => [slide.slide, slide.status]), [
    ['slide-01-overflow.html', 'fail'],
    ['slide-02-text-clipped.html', 'fail'],
    ['slide-03-sibling-overlap.html', 'pass'],
    ['slide-04-clean.html', 'pass'],
  ]);
  assert.deepEqual(report.summary, {
    totalSlides: 4,
    passedSlides: 2,
    failedSlides: 2,
    criticalIssues: 2,
    warnings: 1,
  });
});
