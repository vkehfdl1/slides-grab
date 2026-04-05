import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DESIGN_STYLES_SOURCE,
  buildStylePreviewHtml,
  getPreviewHtmlPath,
  listDesignStyles,
} from '../../src/design-styles.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(repoRoot, 'bin', 'ppt-agent.js');

function makeWorkspace(prefix = 'slides-grab-style-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

test('bundled design styles preserve upstream citation metadata', () => {
  const styles = listDesignStyles();

  assert.equal(styles.length, 35);
  assert.equal(styles[0].id, 'glassmorphism');
  assert.equal(styles[0].source.repo, 'corazzon/pptx-design-styles');
  assert.equal(DESIGN_STYLES_SOURCE.repo, 'corazzon/pptx-design-styles');
  assert.match(DESIGN_STYLES_SOURCE.url, /corazzon\/pptx-design-styles/);
});

test('legacy themes are included as styles 31–35', () => {
  const ids = listDesignStyles().map((s) => s.id);

  assert.ok(ids.includes('executive-minimal'));
  assert.ok(ids.includes('sage-professional'));
  assert.ok(ids.includes('modern-dark'));
  assert.ok(ids.includes('corporate-blue'));
  assert.ok(ids.includes('warm-neutral'));
});

test('bundled preview html file exists and contains all 35 styles', () => {
  const previewPath = getPreviewHtmlPath();
  assert.ok(existsSync(previewPath));

  const html = buildStylePreviewHtml();
  assert.match(html, /35/);
  assert.match(html, /GLASSMORPHISM/i);
  assert.match(html, /EXECUTIVE MINIMAL/i);
  assert.match(html, /CORPORATE BLUE/i);
  assert.match(html, /corazzon\/pptx-design-styles/);
});

test('slides-grab help exposes style discovery commands', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  assert.match(output, /list-styles/);
  assert.match(output, /preview-styles/);
});

test('slides-grab preview-styles prints the bundled preview path', () => {
  const output = execFileSync(
    process.execPath,
    [cliPath, 'preview-styles'],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
    },
  );

  assert.match(output, /Opening style preview/i);
  assert.match(output, /preview\.html/);
});

test('slides-grab list-styles shows all 35 styles', () => {
  const workspace = makeWorkspace();

  try {
    const output = execFileSync(process.execPath, [cliPath, 'list-styles'], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    assert.match(output, /glassmorphism/);
    assert.match(output, /modern-dark/);
    assert.match(output, /Total: 35 styles/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
