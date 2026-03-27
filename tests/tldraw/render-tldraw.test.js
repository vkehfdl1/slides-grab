import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  buildFixedSizeSvg,
  normalizeTldrawSnapshot,
  parseTldrawCliArgs,
  renderTldrawFile,
} from '../../scripts/render-tldraw.js';

const currentFormatFixture = resolve('tests/fixtures/tldraw/current-format-diagram.tldr');

test('parseTldrawCliArgs applies exact-size defaults', () => {
  assert.deepEqual(parseTldrawCliArgs(['--input', 'slides/assets/diagram.tldr']), {
    input: 'slides/assets/diagram.tldr',
    output: 'diagram.svg',
    width: 960,
    height: 540,
    padding: 24,
    background: 'transparent',
    pageId: '',
    help: false,
  });
});

test('parseTldrawCliArgs reads custom sizing and export options', () => {
  assert.deepEqual(
    parseTldrawCliArgs([
      '--input=diagram.json',
      '--output',
      'slides/assets/system.svg',
      '--width',
      '640',
      '--height=360',
      '--padding',
      '12',
      '--background',
      '#ffffff',
      '--page-id',
      'page:diagram',
    ]),
    {
      input: 'diagram.json',
      output: 'slides/assets/system.svg',
      width: 640,
      height: 360,
      padding: 12,
      background: '#ffffff',
      pageId: 'page:diagram',
      help: false,
    },
  );

  assert.throws(() => parseTldrawCliArgs([]), /--input must be a non-empty string/i);
  assert.throws(() => parseTldrawCliArgs(['--input', 'diagram.tldr', '--padding', '-1']), /--padding/i);
});

test('normalizeTldrawSnapshot accepts current-format tldraw files and store snapshots', async () => {
  const fromRecords = normalizeTldrawSnapshot(JSON.parse(await readFile(currentFormatFixture, 'utf8')));

  assert.ok(fromRecords.schema);
  assert.equal(fromRecords.store['shape:diagram-rect'].type, 'geo');

  const snapshot = {
    schema: { schemaVersion: 2, sequences: {} },
    store: {
      'shape:two': { id: 'shape:two', typeName: 'shape' },
    },
  };

  assert.equal(normalizeTldrawSnapshot(snapshot), snapshot);
});

test('normalizeTldrawSnapshot rejects legacy pre-records tldraw payloads with an actionable error', () => {
  assert.throws(
    () => normalizeTldrawSnapshot({ document: { version: 15.5, pages: {} } }),
    /legacy pre-records \.tldr files are not supported/i,
  );
});

test('buildFixedSizeSvg wraps exported markup into the requested slide-safe size', () => {
  const svg = buildFixedSizeSvg(
    {
      width: 200,
      height: 100,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><defs><style>.x{fill:red;}</style></defs><rect class="x" x="0" y="0" width="200" height="100" /></svg>',
    },
    {
      targetWidth: 640,
      targetHeight: 360,
      padding: 20,
      background: '#ffffff',
    },
  );

  assert.match(svg, /width="640" height="360" viewBox="0 0 640 360"/);
  assert.match(svg, /<rect x="0" y="0" width="640" height="360" fill="#ffffff"/);
  assert.match(svg, /transform="translate\(20 30\) scale\(3\)"/);
  assert.match(svg, /<defs><style>\.x\{fill:red;\}<\/style><\/defs>/);
});

test('renderTldrawFile renders a current-format tldraw fixture end-to-end', { timeout: 60000 }, async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'slides-grab-tldraw-test-'));
  const outputPath = join(outputDir, 'diagram.svg');

  try {
    const result = await renderTldrawFile(currentFormatFixture, outputPath, {
      width: 640,
      height: 360,
      padding: 20,
      background: '#ffffff',
    });

    assert.equal(result.outputPath, outputPath);
    const svg = await readFile(outputPath, 'utf8');
    assert.match(svg, /<svg/);
    assert.match(svg, /width="640" height="360"/);
    assert.match(svg, /aria-label="tldraw diagram export"/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
