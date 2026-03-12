import assert from 'node:assert/strict';
import test from 'node:test';

import { getOutputFileName, parseCliArgs, resizeSvg, scaleSvg } from '../../scripts/html2svg.js';

test('parseCliArgs applies defaults for output, slidesDir, format, scale, and help', () => {
  const parsed = parseCliArgs([]);

  assert.deepEqual(parsed, {
    output: 'output',
    slidesDir: 'slides',
    format: 'svg',
    scale: 2,
    help: false,
  });
});

test('parseCliArgs reads --output, --slides-dir, --format, and --scale options', () => {
  assert.equal(parseCliArgs(['--output', 'dist/svgs']).output, 'dist/svgs');
  assert.equal(parseCliArgs(['--output=my-output']).output, 'my-output');
  assert.equal(parseCliArgs(['--slides-dir', 'decks/product-a']).slidesDir, 'decks/product-a');
  assert.equal(parseCliArgs(['--slides-dir=slides-q1']).slidesDir, 'slides-q1');
  assert.equal(parseCliArgs(['--format', 'png']).format, 'png');
  assert.equal(parseCliArgs(['--format=svg']).format, 'svg');
  assert.equal(parseCliArgs(['--scale', '3']).scale, 3);
  assert.equal(parseCliArgs(['--scale=1.5']).scale, 1.5);
});

test('parseCliArgs rejects missing option values', () => {
  assert.throws(() => parseCliArgs(['--output']), /missing value/i);
  assert.throws(() => parseCliArgs(['--slides-dir']), /missing value/i);
  assert.throws(() => parseCliArgs(['--format']), /missing value/i);
  assert.throws(() => parseCliArgs(['--scale']), /missing value/i);
});

test('parseCliArgs rejects invalid --format values', () => {
  assert.throws(() => parseCliArgs(['--format', 'jpg']), /must be one of/i);
  assert.throws(() => parseCliArgs(['--format', 'pdf']), /must be one of/i);
});

test('parseCliArgs rejects invalid --scale values', () => {
  assert.throws(() => parseCliArgs(['--scale', '0']), /positive number/i);
  assert.throws(() => parseCliArgs(['--scale', 'abc']), /positive number/i);
});

test('getOutputFileName converts .html to the specified format', () => {
  assert.equal(getOutputFileName('slide-01.html', 'svg'), 'slide-01.svg');
  assert.equal(getOutputFileName('slide-02-cover.html', 'png'), 'slide-02-cover.png');
  assert.equal(getOutputFileName('Slide-03.HTML', 'svg'), 'Slide-03.svg');
});

test('getOutputFileName defaults to svg format', () => {
  assert.equal(getOutputFileName('slide-01.html'), 'slide-01.svg');
});

test('scaleSvg returns unchanged SVG when scale is 1', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  assert.equal(scaleSvg(svg, 1), svg);
});

test('scaleSvg multiplies width and height by scale factor', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  const scaled = scaleSvg(svg, 2);
  assert.ok(scaled.includes('width="1920"'));
  assert.ok(scaled.includes('height="1080"'));
});

test('scaleSvg handles fractional scale factors', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  const scaled = scaleSvg(svg, 1.5);
  assert.ok(scaled.includes('width="1440"'));
  assert.ok(scaled.includes('height="810"'));
});

test('scaleSvg adds viewBox when missing so content scales properly', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  const scaled = scaleSvg(svg, 2);
  assert.ok(scaled.includes('viewBox="0 0 960 540"'));
});

test('scaleSvg preserves existing viewBox', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="960" height="540"></svg>';
  const scaled = scaleSvg(svg, 2);
  assert.ok(scaled.includes('viewBox="0 0 100 100"'));
  assert.ok(scaled.includes('width="1920"'));
});

test('resizeSvg changes width/height to target dimensions', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  const resized = resizeSvg(svg, 1920, 1080);
  assert.ok(resized.includes('width="1920"'));
  assert.ok(resized.includes('height="1080"'));
  assert.ok(resized.includes('viewBox="0 0 960 540"'));
});

test('resizeSvg returns unchanged when dimensions match', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  assert.equal(resizeSvg(svg, 960, 540), svg);
});

test('resizeSvg preserves existing viewBox', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="960" height="540"></svg>';
  const resized = resizeSvg(svg, 1920, 1080);
  assert.ok(resized.includes('viewBox="0 0 100 100"'));
  assert.ok(resized.includes('width="1920"'));
  assert.ok(resized.includes('height="1080"'));
});

test('resizeSvg + scaleSvg chain applies viewport then scale', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"></svg>';
  const result = scaleSvg(resizeSvg(svg, 1920, 1080), 2);
  assert.ok(result.includes('width="3840"'));
  assert.ok(result.includes('height="2160"'));
  assert.ok(result.includes('viewBox="0 0 960 540"'));
});
