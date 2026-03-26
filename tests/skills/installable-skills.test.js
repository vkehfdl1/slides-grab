import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const INSTALLABLE_SKILLS = [
  'skills/slides-grab/SKILL.md',
  'skills/slides-grab-plan/SKILL.md',
  'skills/slides-grab-design/SKILL.md',
  'skills/slides-grab-export/SKILL.md',
];

test('installable skills use packaged commands and avoid .claude runtime paths', () => {
  for (const file of INSTALLABLE_SKILLS) {
    const text = readFileSync(file, 'utf-8');
    assert.doesNotMatch(text, /\.claude\/skills\//, `${file} should not reference .claude skill paths`);
    assert.doesNotMatch(text, /node scripts\//, `${file} should not execute repo-local scripts directly`);
    assert.match(text, /slides-grab|Use the installed/, `${file} should describe installed CLI usage`);
  }
});

test('npm pack includes bundled skill references for installable skills', () => {
  const output = execFileSync('npm', ['pack', '--json', '--dry-run'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });
  const [packInfo] = JSON.parse(output);
  const filePaths = new Set(packInfo.files.map((entry) => entry.path));

  assert.ok(filePaths.has('skills/slides-grab-plan/references/outline-format.md'));
  assert.ok(filePaths.has('skills/slides-grab-plan/references/plan-workflow-reference.md'));
  assert.ok(filePaths.has('skills/slides-grab-design/references/design-rules.md'));
  assert.ok(filePaths.has('skills/slides-grab-design/references/detailed-design-rules.md'));
  assert.ok(filePaths.has('skills/slides-grab-design/references/design-system-full.md'));
  assert.ok(filePaths.has('skills/slides-grab-design/references/beautiful-slide-defaults.md'));
  assert.ok(filePaths.has('skills/slides-grab-export/references/export-rules.md'));
  assert.ok(filePaths.has('skills/slides-grab-export/references/pptx-skill-reference.md'));
  assert.ok(filePaths.has('skills/slides-grab-export/references/html2pptx.md'));
  assert.ok(filePaths.has('skills/slides-grab-export/references/ooxml.md'));
  assert.ok(filePaths.has('skills/slides-grab/references/presentation-workflow-reference.md'));
  assert.ok(filePaths.has('src/pptx-raster-export.cjs'));
  assert.ok(!filePaths.has('scripts/install-codex-skills.js'));
});

test('slides-grab help no longer exposes the legacy custom skill installer', () => {
  const output = execFileSync(process.execPath, ['bin/ppt-agent.js', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  assert.doesNotMatch(output, /\binstall-codex-skills\b/);
});
test('slides-grab design skill points at the bundled art-direction reference', () => {
  const text = readFileSync('skills/slides-grab-design/SKILL.md', 'utf-8');

  assert.match(text, /references\/beautiful-slide-defaults\.md/);
  assert.match(text, /visual thesis/i);
  assert.match(text, /content plan/i);
  assert.match(text, /slide litmus check/i);
});
