import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildPageOptions, getTargetRasterSize, parseArgs } = require('../../src/pptx-raster-export.cjs');

test('parseArgs applies default slides dir and output', () => {
  assert.deepEqual(parseArgs([]), {
    slidesDir: 'slides',
    output: 'output.pptx',
    resolution: '2160p',
    help: false,
  });
});

test('parseArgs reads resolution presets and normalizes aliases', () => {
  assert.equal(parseArgs(['--resolution', '1440p']).resolution, '1440p');
  assert.equal(parseArgs(['--resolution=4k']).resolution, '2160p');
  assert.throws(() => parseArgs(['--resolution']), /missing value/i);
  assert.throws(() => parseArgs(['--resolution', 'retina']), /unknown resolution/i);
});

test('buildPageOptions uses a 2x capture device scale factor by default', () => {
  assert.deepEqual(buildPageOptions(), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 2,
  });
});

test('buildPageOptions honors requested resolution presets', () => {
  assert.deepEqual(buildPageOptions('2160p'), {
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 4,
  });
});

test('getTargetRasterSize preserves the legacy 150 DPI slide target by default', () => {
  assert.deepEqual(getTargetRasterSize(), {
    width: 2000,
    height: 1125,
  });
});

test('getTargetRasterSize returns preset raster dimensions when requested', () => {
  assert.deepEqual(getTargetRasterSize('1440p'), {
    width: 2560,
    height: 1440,
  });
});
