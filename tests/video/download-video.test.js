import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import {
  buildYtDlpArgs,
  parseCliArgs,
} from '../../scripts/download-video.js';

test('parseCliArgs applies defaults for slides-dir and optional output name', () => {
  assert.deepEqual(parseCliArgs(['--url', 'https://youtu.be/demo']), {
    url: 'https://youtu.be/demo',
    slidesDir: 'slides',
    outputName: '',
    help: false,
  });
});

test('parseCliArgs reads slides-dir and output-name options', () => {
  assert.deepEqual(parseCliArgs([
    '--url',
    'https://youtu.be/demo',
    '--slides-dir',
    'decks/q2',
    '--output-name',
    'hero-video',
  ]), {
    url: 'https://youtu.be/demo',
    slidesDir: 'decks/q2',
    outputName: 'hero-video',
    help: false,
  });
});

test('parseCliArgs rejects missing and unknown options', () => {
  assert.throws(() => parseCliArgs([]), /--url is required/i);
  assert.throws(() => parseCliArgs(['--url']), /missing value/i);
  assert.throws(() => parseCliArgs(['--url', 'https://youtu.be/demo', '--slides-dir']), /missing value/i);
  assert.throws(() => parseCliArgs(['--url', 'https://youtu.be/demo', '--output-name']), /missing value/i);
  assert.throws(() => parseCliArgs(['--url', 'https://youtu.be/demo', '--wat']), /unknown option/i);
});

test('buildYtDlpArgs downloads into the deck assets folder with mp4 output', () => {
  const args = buildYtDlpArgs({
    url: 'https://youtu.be/demo',
    assetsDir: '/tmp/deck/assets',
    outputName: 'hero-video',
  });

  assert.deepEqual(args, [
    '--no-playlist',
    '--restrict-filenames',
    '--format',
    'mp4/bestvideo+bestaudio/best',
    '--merge-output-format',
    'mp4',
    '--paths',
    '/tmp/deck/assets',
    '--output',
    'hero-video.%(ext)s',
    '--print',
    'after_move:filepath',
    'https://youtu.be/demo',
  ]);
});

test('slides-grab help exposes the fetch-video command', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.match(output, /\bfetch-video\b/);
});
