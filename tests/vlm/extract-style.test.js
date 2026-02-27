import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCliArgs, sampleSlidesForAnalysis } from '../../scripts/extract-style.js';

test('parseCliArgs applies defaults for US-007', () => {
  const parsed = parseCliArgs(['--input', 'deck.pdf']);

  assert.deepEqual(parsed, {
    input: 'deck.pdf',
    output: 'style-config.md',
    provider: 'google',
    model: 'gemini-2.0-flash',
    help: false,
    seed: null,
  });
});

test('parseCliArgs reads --output, --provider, --model, --seed', () => {
  const parsed = parseCliArgs([
    '--input',
    'sample.pptx',
    '--output',
    'tmp/custom-style.md',
    '--provider',
    'anthropic',
    '--model',
    'claude-3-7-sonnet',
    '--seed',
    '42',
  ]);

  assert.equal(parsed.input, 'sample.pptx');
  assert.equal(parsed.output, 'tmp/custom-style.md');
  assert.equal(parsed.provider, 'anthropic');
  assert.equal(parsed.model, 'claude-3-7-sonnet');
  assert.equal(parsed.seed, 42);
});

test('parseCliArgs rejects missing --input', () => {
  assert.throws(() => parseCliArgs([]), /--input/i);
});

test('sampleSlidesForAnalysis keeps all slides when fewer than 10', () => {
  const slides = ['a.png', 'b.png', 'c.png'];
  const sampled = sampleSlidesForAnalysis(slides, () => 0.5);

  assert.deepEqual(sampled, slides);
});

test('sampleSlidesForAnalysis selects 5-8 slides and always keeps first/last when 10+ slides', () => {
  const slides = Array.from({ length: 12 }, (_, idx) => `slide-${idx + 1}.png`);

  const rngValues = [0.99, 0.8, 0.6, 0.4, 0.2, 0.1, 0.7, 0.3, 0.5];
  let cursor = 0;
  const sampled = sampleSlidesForAnalysis(slides, () => {
    const value = rngValues[cursor % rngValues.length];
    cursor += 1;
    return value;
  });

  assert.ok(sampled.length >= 5 && sampled.length <= 8);
  assert.equal(sampled[0], 'slide-1.png');
  assert.equal(sampled[sampled.length - 1], 'slide-12.png');

  const unique = new Set(sampled);
  assert.equal(unique.size, sampled.length);
});
