import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  DESIGN_STYLES_SOURCE,
  buildStylePreviewHtml,
  getDesignStyle,
  listDesignStyles,
} from '../../src/design-styles.js';
import {
  STYLE_CONFIG_FILE,
  getStyleConfigPath,
  readSelectedStyleConfig,
  writeSelectedStyleConfig,
} from '../../src/style-config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(repoRoot, 'bin', 'ppt-agent.js');

function makeWorkspace(prefix = 'slides-grab-style-test-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('bundled design styles preserve upstream citation metadata', () => {
  const styles = listDesignStyles();

  assert.equal(styles.length, 30);
  assert.equal(styles[0].id, 'glassmorphism');
  assert.equal(styles[0].source.repo, 'corazzon/pptx-design-styles');
  assert.equal(DESIGN_STYLES_SOURCE.repo, 'corazzon/pptx-design-styles');
  assert.match(DESIGN_STYLES_SOURCE.url, /corazzon\/pptx-design-styles/);
});

test('preview html includes the selected style and upstream citation', () => {
  const style = getDesignStyle('glassmorphism');
  const html = buildStylePreviewHtml({ styles: [style], selectedStyleId: style.id });

  assert.match(html, /Glassmorphism/);
  assert.match(html, /corazzon\/pptx-design-styles/);
  assert.match(html, /slides-grab select-style glassmorphism/);
  assert.match(html, /Selected style/);
});

test('selected style config round-trips to the local workspace', async () => {
  const workspace = makeWorkspace();

  try {
    const style = getDesignStyle('neo-brutalism');
    const configPath = getStyleConfigPath(workspace);

    await writeSelectedStyleConfig({ cwd: workspace, style });
    assert.equal(configPath, path.join(workspace, STYLE_CONFIG_FILE));
    assert.ok(existsSync(configPath));

    const config = await readSelectedStyleConfig(workspace);
    assert.equal(config.style.id, 'neo-brutalism');
    assert.equal(config.style.source.repo, 'corazzon/pptx-design-styles');
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab help exposes style discovery commands', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });

  assert.match(output, /list-styles/);
  assert.match(output, /preview-styles/);
  assert.match(output, /select-style/);
});

test('style discovery commands support --slides-dir workspaces', () => {
  const workspace = makeWorkspace();
  const slidesDir = path.join('decks', 'demo');
  const configPath = path.join(workspace, slidesDir, STYLE_CONFIG_FILE);
  const previewPath = path.join(workspace, slidesDir, 'style-preview.html');

  try {
    const selectOutput = execFileSync(
      process.execPath,
      [cliPath, 'select-style', 'glassmorphism', '--slides-dir', slidesDir],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.match(selectOutput, /Saved selection to .*decks[\/]demo[\/]style-config\.json/);
    assert.ok(existsSync(configPath));

    const listOutput = execFileSync(
      process.execPath,
      [cliPath, 'list-styles', '--slides-dir', slidesDir],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.match(listOutput, /glassmorphism/);
    assert.match(listOutput, /selected/i);

    const previewOutput = execFileSync(
      process.execPath,
      [cliPath, 'preview-styles', '--slides-dir', slidesDir],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.match(previewOutput, /Wrote style preview catalog/i);
    assert.ok(existsSync(previewPath));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab preview-styles writes a local html gallery', () => {
  const workspace = makeWorkspace();
  const outputPath = path.join(workspace, 'style-preview.html');

  try {
    const output = execFileSync(
      process.execPath,
      [cliPath, 'preview-styles', '--style', 'glassmorphism', '--output', outputPath],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    const html = readFileSync(outputPath, 'utf-8');
    assert.match(output, /Wrote style preview/i);
    assert.match(html, /Glassmorphism/);
    assert.match(html, /corazzon\/pptx-design-styles/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('preview-styles keeps explicit relative --output paths rooted at cwd even with --slides-dir', () => {
  const workspace = makeWorkspace();
  const slidesDir = path.join('decks', 'demo');
  const outputPath = path.join(workspace, 'custom-preview.html');
  const rebasedPath = path.join(workspace, slidesDir, 'custom-preview.html');

  try {
    const output = execFileSync(
      process.execPath,
      [cliPath, 'preview-styles', '--slides-dir', slidesDir, '--output', 'custom-preview.html'],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.match(output, /Wrote style preview catalog to .*custom-preview\.html/i);
    assert.ok(existsSync(outputPath));
    assert.equal(existsSync(rebasedPath), false);
    assert.match(readFileSync(outputPath, 'utf-8'), /Previewing 30 bundled design styles/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('preview-styles treats explicit --output style-preview.html as cwd-relative with --slides-dir', () => {
  const workspace = makeWorkspace();
  const slidesDir = path.join('decks', 'demo');
  const outputPath = path.join(workspace, 'style-preview.html');
  const rebasedPath = path.join(workspace, slidesDir, 'style-preview.html');

  try {
    execFileSync(
      process.execPath,
      [cliPath, 'preview-styles', '--slides-dir', slidesDir, '--output', 'style-preview.html'],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.ok(existsSync(outputPath));
    assert.equal(existsSync(rebasedPath), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('command hints quote --slides-dir values with spaces', () => {
  const workspace = makeWorkspace();
  const slidesDir = path.join('decks', 'my demo');
  const configPath = path.join(workspace, slidesDir, STYLE_CONFIG_FILE);
  const quotedSlidesDirPattern = `'${escapeRegExp(slidesDir)}'`;

  try {
    const selectOutput = execFileSync(
      process.execPath,
      [cliPath, 'select-style', 'glassmorphism', '--slides-dir', slidesDir],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    writeFileSync(configPath, `${JSON.stringify({ selectedStyleId: 'unknown-style' }, null, 2)}\n`, 'utf-8');

    const listOutput = execFileSync(
      process.execPath,
      [cliPath, 'list-styles', '--slides-dir', slidesDir],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.match(
      selectOutput,
      new RegExp(`preview-styles --style glassmorphism --slides-dir ${quotedSlidesDirPattern}`),
    );
    assert.match(
      listOutput,
      new RegExp(`select-style <id> --slides-dir ${quotedSlidesDirPattern}`),
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab preview-styles without --style renders the full catalog', () => {
  const workspace = makeWorkspace();
  const outputPath = path.join(workspace, 'style-catalog.html');

  try {
    execFileSync(process.execPath, [cliPath, 'preview-styles', '--output', outputPath], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    const html = readFileSync(outputPath, 'utf-8');
    assert.match(html, /Previewing 30 bundled design styles/i);
    assert.match(html, /neo-brutalism/i);
    assert.match(html, /glassmorphism/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});


test('preview-styles without --style highlights the currently selected style when config exists', () => {
  const workspace = makeWorkspace();
  const outputPath = path.join(workspace, 'style-catalog.html');

  try {
    execFileSync(process.execPath, [cliPath, 'select-style', 'neo-brutalism'], {
      cwd: workspace,
      encoding: 'utf-8',
    });
    execFileSync(process.execPath, [cliPath, 'preview-styles', '--output', outputPath], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    const html = readFileSync(outputPath, 'utf-8');
    assert.match(html, /Neo-Brutalism/);
    assert.match(html, /Selected style/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('slides-grab select-style writes the local style config and list-styles marks it', () => {
  const workspace = makeWorkspace();

  try {
    const selectOutput = execFileSync(
      process.execPath,
      [cliPath, 'select-style', 'neo-brutalism'],
      {
        cwd: workspace,
        encoding: 'utf-8',
      },
    );

    assert.match(selectOutput, /Selected style: Neo-Brutalism/);
    assert.ok(existsSync(path.join(workspace, STYLE_CONFIG_FILE)));

    const listOutput = execFileSync(process.execPath, [cliPath, 'list-styles'], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    assert.match(listOutput, /neo-brutalism/);
    assert.match(listOutput, /selected/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('stale style-config entries do not block list or preview recovery', () => {
  const workspace = makeWorkspace();
  const outputPath = path.join(workspace, 'style-catalog.html');
  const configPath = path.join(workspace, STYLE_CONFIG_FILE);

  try {
    writeFileSync(configPath, `${JSON.stringify({ selectedStyleId: 'unknown-style' }, null, 2)}\n`, 'utf-8');

    const listOutput = execFileSync(process.execPath, [cliPath, 'list-styles'], {
      cwd: workspace,
      encoding: 'utf-8',
    });
    const previewOutput = execFileSync(process.execPath, [cliPath, 'preview-styles', '--output', outputPath], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    assert.match(listOutput, /Available design styles:/);
    assert.match(listOutput, /unknown-style/);
    assert.match(previewOutput, /Ignoring saved style selection/i);
    assert.match(readFileSync(outputPath, 'utf-8'), /Previewing 30 bundled design styles/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('invalid style ids fail cleanly', () => {
  const workspace = makeWorkspace();

  try {
    const result = spawnSync(process.execPath, [cliPath, 'select-style', 'not-a-style'], {
      cwd: workspace,
      encoding: 'utf-8',
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stderr}\n${result.stdout}`, /unknown style/i);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
