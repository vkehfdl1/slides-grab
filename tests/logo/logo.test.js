import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadDeckConfig,
  loadDeckConfigSync,
  writeDeckConfig,
  resolveLogoConfig,
  shouldApplyLogo,
  clearLogoCache,
  injectLogoIntoHtml,
  extractSlideIndex,
} from '../../src/logo.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'logo-test-'));
  return dir;
}

function writeDeckJson(dir, content) {
  writeFileSync(path.join(dir, 'deck.json'), JSON.stringify(content, null, 2));
}

function createDummyLogo(dir) {
  const assetsDir = path.join(dir, 'assets');
  if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
  // 1x1 transparent PNG
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const logoPath = path.join(assetsDir, 'logo.png');
  writeFileSync(logoPath, pngBytes);
  return logoPath;
}

// ── loadDeckConfig ──────────────────────────────────────────────────────────

test('loadDeckConfig returns null when deck.json does not exist', async () => {
  const dir = await makeTempDir();
  const result = await loadDeckConfig(dir);
  assert.equal(result, null);
  rmSync(dir, { recursive: true });
});

test('loadDeckConfig reads valid deck.json', async () => {
  const dir = await makeTempDir();
  writeDeckJson(dir, { logo: { path: './assets/logo.png', position: 'top-right' } });
  const result = await loadDeckConfig(dir);
  assert.equal(result.logo.path, './assets/logo.png');
  assert.equal(result.logo.position, 'top-right');
  rmSync(dir, { recursive: true });
});

test('loadDeckConfigSync returns null when missing', async () => {
  const dir = await makeTempDir();
  assert.equal(loadDeckConfigSync(dir), null);
  rmSync(dir, { recursive: true });
});

test('loadDeckConfigSync reads valid deck.json', async () => {
  const dir = await makeTempDir();
  writeDeckJson(dir, { logo: { path: './assets/logo.png' } });
  const result = loadDeckConfigSync(dir);
  assert.equal(result.logo.path, './assets/logo.png');
  rmSync(dir, { recursive: true });
});

// ── writeDeckConfig ─────────────────────────────────────────────────────────

test('writeDeckConfig creates new deck.json', async () => {
  const dir = await makeTempDir();
  const result = await writeDeckConfig(dir, { logo: { path: './logo.png' } });
  assert.equal(result.logo.path, './logo.png');
  const raw = await readFile(path.join(dir, 'deck.json'), 'utf-8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.logo.path, './logo.png');
  rmSync(dir, { recursive: true });
});

test('writeDeckConfig merges into existing deck.json', async () => {
  const dir = await makeTempDir();
  writeDeckJson(dir, { theme: 'dark', logo: { path: './old.png' } });
  const result = await writeDeckConfig(dir, { logo: { path: './new.png' } });
  assert.equal(result.theme, 'dark');
  assert.equal(result.logo.path, './new.png');
  rmSync(dir, { recursive: true });
});

// ── resolveLogoConfig ───────────────────────────────────────────────────────

test('resolveLogoConfig returns null when no logo configured', async () => {
  const dir = await makeTempDir();
  assert.equal(resolveLogoConfig(null, dir), null);
  assert.equal(resolveLogoConfig({}, dir), null);
  assert.equal(resolveLogoConfig({ logo: {} }, dir), null);
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig resolves top-right preset', async () => {
  const dir = await makeTempDir();
  createDummyLogo(dir);
  const config = resolveLogoConfig(
    { logo: { path: './assets/logo.png', position: 'top-right' } },
    dir,
  );
  assert.ok(config);
  assert.equal(config.width, 1.1);
  assert.equal(config.height, 0.5);
  // top-right: x = 10 - 1.1 - 0.2 = 8.7
  assert.ok(Math.abs(config.x - 8.7) < 0.01, `Expected x ≈ 8.7, got ${config.x}`);
  assert.ok(Math.abs(config.y - 0.15) < 0.01, `Expected y ≈ 0.15, got ${config.y}`);
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig resolves bottom-left preset', async () => {
  const dir = await makeTempDir();
  createDummyLogo(dir);
  const config = resolveLogoConfig(
    { logo: { path: './assets/logo.png', position: 'bottom-left', width: 1.0, height: 0.4 } },
    dir,
  );
  assert.ok(config);
  // bottom-left: x = 0.2, y = 5.625 - 0.4 - 0.15 = 5.075
  assert.ok(Math.abs(config.x - 0.2) < 0.01);
  assert.ok(Math.abs(config.y - 5.075) < 0.01, `Expected y ≈ 5.075, got ${config.y}`);
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig uses explicit x/y over preset', async () => {
  const dir = await makeTempDir();
  createDummyLogo(dir);
  const config = resolveLogoConfig(
    { logo: { path: './assets/logo.png', position: 'top-right', x: 2.0, y: 3.0 } },
    dir,
  );
  assert.equal(config.x, 2.0);
  assert.equal(config.y, 3.0);
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig defaults to top-right when position omitted', async () => {
  const dir = await makeTempDir();
  createDummyLogo(dir);
  const config = resolveLogoConfig(
    { logo: { path: './assets/logo.png' } },
    dir,
  );
  assert.ok(config);
  assert.ok(Math.abs(config.x - 8.7) < 0.01);
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig throws on missing logo file', async () => {
  const dir = await makeTempDir();
  assert.throws(
    () => resolveLogoConfig({ logo: { path: './missing.png' } }, dir),
    /Logo file not found/,
  );
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig accepts data URL without file check', async () => {
  const dir = await makeTempDir();
  const config = resolveLogoConfig(
    { logo: { path: 'data:image/png;base64,abc123' } },
    dir,
  );
  assert.ok(config);
  assert.equal(config.resolvedPath, 'data:image/png;base64,abc123');
  rmSync(dir, { recursive: true });
});

test('resolveLogoConfig CLI overrides take precedence', async () => {
  const dir = await makeTempDir();
  createDummyLogo(dir);
  const config = resolveLogoConfig(
    { logo: { path: './assets/logo.png', position: 'top-right', width: 2.0 } },
    dir,
    { path: './assets/logo.png', position: 'bottom-left', width: 0.8 },
  );
  assert.equal(config.width, 0.8);
  // bottom-left with width 0.8: x = 0.2
  assert.ok(Math.abs(config.x - 0.2) < 0.01);
  rmSync(dir, { recursive: true });
});

// ── shouldApplyLogo ─────────────────────────────────────────────────────────

test('shouldApplyLogo returns false when no config', () => {
  assert.equal(shouldApplyLogo(0, null), false);
});

test('shouldApplyLogo applies to all slides by default', () => {
  const config = { slides: 'all', exclude: [] };
  assert.equal(shouldApplyLogo(0, config), true);
  assert.equal(shouldApplyLogo(5, config), true);
  assert.equal(shouldApplyLogo(99, config), true);
});

test('shouldApplyLogo excludes specified slides', () => {
  const config = { slides: 'all', exclude: [1, 3] };
  assert.equal(shouldApplyLogo(0, config), false); // slide 1 (0-based idx 0)
  assert.equal(shouldApplyLogo(1, config), true);   // slide 2
  assert.equal(shouldApplyLogo(2, config), false); // slide 3
  assert.equal(shouldApplyLogo(3, config), true);   // slide 4
});

test('shouldApplyLogo with specific slide list', () => {
  const config = { slides: [2, 4, 6], exclude: [] };
  assert.equal(shouldApplyLogo(0, config), false); // slide 1
  assert.equal(shouldApplyLogo(1, config), true);   // slide 2
  assert.equal(shouldApplyLogo(2, config), false); // slide 3
  assert.equal(shouldApplyLogo(3, config), true);   // slide 4
  assert.equal(shouldApplyLogo(4, config), false); // slide 5
  assert.equal(shouldApplyLogo(5, config), true);   // slide 6
});

// ── injectLogoIntoHtml ──────────────────────────────────────────────────────

test('injectLogoIntoHtml injects img before </body>', () => {
  const html = '<html><body><p>Hello</p></body></html>';
  const config = {
    resolvedPath: '/tmp/logo.png',
    x: 8.7, y: 0.15, width: 1.1, height: 0.5, opacity: 1, slides: 'all', exclude: [],
  };
  const result = injectLogoIntoHtml(html, config, 0);
  assert.ok(result.includes('data-logo-overlay="true"'));
  assert.ok(result.includes('</body>'));
  assert.ok(result.indexOf('data-logo-overlay') < result.indexOf('</body>'));
});

test('injectLogoIntoHtml returns unchanged for excluded slide', () => {
  const html = '<html><body></body></html>';
  const config = {
    resolvedPath: '/tmp/logo.png',
    x: 8.7, y: 0.15, width: 1.1, height: 0.5, opacity: 1, slides: 'all', exclude: [1],
  };
  const result = injectLogoIntoHtml(html, config, 0); // slide 1 excluded
  assert.equal(result, html);
});

test('injectLogoIntoHtml returns unchanged when no config', () => {
  const html = '<html><body></body></html>';
  assert.equal(injectLogoIntoHtml(html, null, 0), html);
});

test('injectLogoIntoHtml uses srcOverride when provided', () => {
  const html = '<html><body></body></html>';
  const config = {
    resolvedPath: '/abs/path/logo.png',
    x: 0.2, y: 0.15, width: 1.0, height: 0.5, opacity: 1, slides: 'all', exclude: [],
  };
  const result = injectLogoIntoHtml(html, config, 0, { srcOverride: '/slides/assets/logo.png' });
  assert.ok(result.includes('/slides/assets/logo.png'));
  assert.ok(!result.includes('/abs/path/'));
});

// ── extractSlideIndex ───────────────────────────────────────────────────────

test('extractSlideIndex parses slide-01.html', () => {
  assert.equal(extractSlideIndex('slide-01.html'), 0);
});

test('extractSlideIndex parses slide-15-title.html', () => {
  assert.equal(extractSlideIndex('slide-15-title.html'), 14);
});

test('extractSlideIndex handles no number', () => {
  assert.equal(extractSlideIndex('intro.html'), 0);
});

// ── clearLogoCache ──────────────────────────────────────────────────────────

test('clearLogoCache resets cache without error', () => {
  clearLogoCache();
  // no assertions needed — just ensure no throw
});
