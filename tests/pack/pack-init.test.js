import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPack, PACK_NAME_REGEX, validatePackName } from '../../src/pack-init.js';

// ── validatePackName ────────────────────────────────────────────────────────

test('validatePackName accepts valid lowercase name', () => {
  assert.deepEqual(validatePackName('my-custom-pack'), { valid: true });
});

test('validatePackName accepts name with underscores', () => {
  assert.deepEqual(validatePackName('dark_theme'), { valid: true });
});

test('validatePackName accepts name with digits', () => {
  assert.deepEqual(validatePackName('pack123'), { valid: true });
});

test('validatePackName accepts single-char name', () => {
  assert.deepEqual(validatePackName('a'), { valid: true });
});

test('validatePackName rejects name with uppercase letters', () => {
  const result = validatePackName('MyPack');
  assert.equal(result.valid, false);
  assert.ok(result.error.length > 0);
});

test('validatePackName rejects name starting with hyphen', () => {
  const result = validatePackName('-bad');
  assert.equal(result.valid, false);
});

test('validatePackName rejects name starting with underscore', () => {
  const result = validatePackName('_bad');
  assert.equal(result.valid, false);
});

test('validatePackName rejects name with spaces', () => {
  const result = validatePackName('my pack');
  assert.equal(result.valid, false);
});

test('validatePackName rejects name with special characters', () => {
  const result = validatePackName('bad@name');
  assert.equal(result.valid, false);
});

test('validatePackName rejects empty string', () => {
  const result = validatePackName('');
  assert.equal(result.valid, false);
});

test('validatePackName rejects non-string input', () => {
  const result = validatePackName(42);
  assert.equal(result.valid, false);
});

// ── PACK_NAME_REGEX ─────────────────────────────────────────────────────────

test('PACK_NAME_REGEX matches valid names', () => {
  assert.ok(PACK_NAME_REGEX.test('simple'));
  assert.ok(PACK_NAME_REGEX.test('my-pack'));
  assert.ok(PACK_NAME_REGEX.test('dark_theme'));
  assert.ok(PACK_NAME_REGEX.test('pack123'));
});

test('PACK_NAME_REGEX rejects invalid names', () => {
  assert.ok(!PACK_NAME_REGEX.test('My-Pack'));
  assert.ok(!PACK_NAME_REGEX.test('-bad'));
  assert.ok(!PACK_NAME_REGEX.test('bad name'));
});

// ── createPack ──────────────────────────────────────────────────────────────

test('createPack creates correct directory structure', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'slides-grab-pack-test-'));
  try {
    const packsDir = path.join(tmpDir, 'packs');
    const result = createPack('my-custom-pack', packsDir);

    // Returns correct paths
    assert.equal(result.packDir, path.join(packsDir, 'my-custom-pack'));
    assert.equal(result.themePath, path.join(packsDir, 'my-custom-pack', 'theme.css'));

    // Directories and files exist
    assert.ok(existsSync(result.packDir), 'pack directory should exist');
    assert.ok(existsSync(result.themePath), 'theme.css should exist');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPack theme.css contains pack name and CSS variables', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'slides-grab-pack-test-'));
  try {
    const packsDir = path.join(tmpDir, 'packs');
    const { themePath } = createPack('test-brand', packsDir);

    const css = readFileSync(themePath, 'utf-8');
    assert.ok(css.includes('test-brand'), 'theme.css should contain pack name');
    assert.ok(css.includes('--bg-primary'), 'theme.css should define --bg-primary');
    assert.ok(css.includes('--accent'), 'theme.css should define --accent');
    assert.ok(css.includes('--font-sans'), 'theme.css should define --font-sans');
    assert.ok(css.includes('--text-primary'), 'theme.css should define --text-primary');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPack rejects invalid pack name', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'slides-grab-pack-test-'));
  try {
    const packsDir = path.join(tmpDir, 'packs');
    assert.throws(
      () => createPack('Invalid Name', packsDir),
      /invalid pack name/i,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPack rejects already-existing pack directory', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'slides-grab-pack-test-'));
  try {
    const packsDir = path.join(tmpDir, 'packs');

    // Create the pack once
    createPack('duplicate-pack', packsDir);

    // Second attempt should throw
    assert.throws(
      () => createPack('duplicate-pack', packsDir),
      /already exists/i,
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createPack directory contains only theme.css', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'slides-grab-pack-test-'));
  try {
    const packsDir = path.join(tmpDir, 'packs');
    const { packDir } = createPack('empty-pack', packsDir);

    const { readdirSync } = await import('node:fs');
    const entries = readdirSync(packDir);
    assert.equal(entries.length, 1, 'pack dir should contain only theme.css');
    assert.equal(entries[0], 'theme.css');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
