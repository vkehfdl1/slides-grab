import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import {
  buildDefaultFigmaOutput,
  getFigmaImportCaveats,
  normalizeFigmaOutput,
  sortFigmaSlideFiles,
} from '../../src/figma.js';

test('buildDefaultFigmaOutput places figma pptx next to slides dir', () => {
  const output = buildDefaultFigmaOutput('/tmp/decks/q1-review');
  assert.equal(output, '/tmp/decks/q1-review-figma.pptx');
});

test('normalizeFigmaOutput appends .pptx when omitted', () => {
  const output = normalizeFigmaOutput('slides', 'exports/demo-figma');
  assert.equal(output, 'exports/demo-figma.pptx');
});

test('getFigmaImportCaveats returns user-facing warnings', () => {
  const caveats = getFigmaImportCaveats();
  assert.equal(caveats.length, 4);
  assert.match(caveats[0], /best-effort/i);
  assert.match(caveats[1], /Pretendard/i);
});

test('sortFigmaSlideFiles orders slide html files numerically', () => {
  const files = ['slide-10.html', 'slide-02.html', 'slide-1.html', 'slide-a.html'];
  files.sort(sortFigmaSlideFiles);
  assert.deepEqual(files, ['slide-1.html', 'slide-02.html', 'slide-10.html', 'slide-a.html']);
});

test('slides-grab help lists the figma command', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.match(output, /\bfigma\b/);
  assert.match(output, /Figma Slides importable PPTX/);
});

test('figma command help documents manual import intent', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', 'figma', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.match(output, /Output PPTX file/);
  assert.match(output, /slides-grab figma/);
});
