import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkConsistency } from '../../src/consistency.js';

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'consistency-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('checkConsistency', () => {
  it('returns consistent for a single slide', async () => {
    await writeFile(join(tmpDir, 'slide-01.html'), '<div style="font-size: 24pt">Title</div>');
    const result = await checkConsistency(tmpDir);
    assert.equal(result.summary.consistent, true);
    assert.equal(result.summary.slideCount, 1);
    assert.equal(result.issues.length, 0);
  });

  it('returns consistent for uniform slides', async () => {
    const html = '<div style="font-size: 28pt">Title</div><p style="font-size: 14pt">Body</p>';
    await writeFile(join(tmpDir, 'slide-01.html'), html);
    await writeFile(join(tmpDir, 'slide-02.html'), html);
    await writeFile(join(tmpDir, 'slide-03.html'), html);
    const result = await checkConsistency(tmpDir);
    assert.equal(result.summary.consistent, true);
    assert.equal(result.summary.slideCount, 3);
  });

  it('flags title font size drift > 2pt', async () => {
    await writeFile(join(tmpDir, 'slide-01.html'), '<h1 style="font-size: 30pt">A</h1>');
    await writeFile(join(tmpDir, 'slide-02.html'), '<h1 style="font-size: 24pt">B</h1>');
    const result = await checkConsistency(tmpDir);
    assert.equal(result.summary.consistent, false);
    const titleIssue = result.issues.find(i => i.type === 'title-font-size');
    assert.ok(titleIssue, 'should have a title-font-size issue');
    assert.equal(titleIssue.severity, 'warn');
  });

  it('flags body font size drift > 1pt', async () => {
    await writeFile(join(tmpDir, 'slide-01.html'), '<p style="font-size: 12pt">text</p>');
    await writeFile(join(tmpDir, 'slide-02.html'), '<p style="font-size: 15pt">text</p>');
    const result = await checkConsistency(tmpDir);
    const bodyIssue = result.issues.find(i => i.type === 'body-font-size');
    assert.ok(bodyIssue, 'should have a body-font-size issue');
    assert.equal(bodyIssue.severity, 'warn');
  });

  it('flags excessive non-theme colors', async () => {
    // 5 distinct colors across slides
    await writeFile(join(tmpDir, 'slide-01.html'), '<div style="color: #ff0000; background: #00ff00">A</div>');
    await writeFile(join(tmpDir, 'slide-02.html'), '<div style="color: #0000ff; background: #ffff00">B</div>');
    await writeFile(join(tmpDir, 'slide-03.html'), '<div style="color: #ff00ff">C</div>');
    const result = await checkConsistency(tmpDir);
    const colorIssue = result.issues.find(i => i.type === 'color-count');
    assert.ok(colorIssue, 'should have a color-count issue');
    assert.equal(colorIssue.severity, 'warn');
  });

  it('excludes theme colors from color count', async () => {
    const themeColors = new Set(['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff']);
    await writeFile(join(tmpDir, 'slide-01.html'), '<div style="color: #ff0000; background: #00ff00">A</div>');
    await writeFile(join(tmpDir, 'slide-02.html'), '<div style="color: #0000ff; background: #ffff00">B</div>');
    await writeFile(join(tmpDir, 'slide-03.html'), '<div style="color: #ff00ff">C</div>');
    const result = await checkConsistency(tmpDir, { themeColors });
    const colorIssue = result.issues.find(i => i.type === 'color-count');
    assert.equal(colorIssue, undefined, 'theme colors should be excluded');
  });

  it('flags excessive padding patterns', async () => {
    await writeFile(join(tmpDir, 'slide-01.html'), '<div style="padding: 10px 20px">A</div>');
    await writeFile(join(tmpDir, 'slide-02.html'), '<div style="padding: 15px 25px">B</div>');
    await writeFile(join(tmpDir, 'slide-03.html'), '<div style="padding: 20px 30px">C</div>');
    await writeFile(join(tmpDir, 'slide-04.html'), '<div style="padding: 5px 10px">D</div>');
    const result = await checkConsistency(tmpDir);
    const spacingIssue = result.issues.find(i => i.type === 'spacing');
    assert.ok(spacingIssue, 'should have a spacing issue');
    assert.equal(spacingIssue.severity, 'info');
  });

  it('returns empty for directory with no slides', async () => {
    const result = await checkConsistency(tmpDir);
    assert.equal(result.summary.slideCount, 0);
    assert.equal(result.summary.consistent, true);
  });

  it('handles px font sizes with correct pt conversion', async () => {
    // 36px = 27pt (title), 16px = 12pt (body)
    // 24px = 18pt (body), so body drift = 18 - 12 = 6pt
    await writeFile(join(tmpDir, 'slide-01.html'), '<h1 style="font-size: 36px">Title</h1><p style="font-size: 16px">body</p>');
    await writeFile(join(tmpDir, 'slide-02.html'), '<h1 style="font-size: 36px">Title</h1><p style="font-size: 24px">body</p>');
    const result = await checkConsistency(tmpDir);
    const bodyIssue = result.issues.find(i => i.type === 'body-font-size');
    assert.ok(bodyIssue, 'should detect body font size drift in px');
  });
});
