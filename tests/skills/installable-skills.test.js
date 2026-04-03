import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  assert.ok(filePaths.has('scripts/generate-image.js'));
  assert.ok(filePaths.has('src/pptx-raster-export.cjs'));
  assert.ok(filePaths.has('src/nano-banana.js'));
  assert.ok(!filePaths.has('scripts/install-codex-skills.js'));
});

test('packed npm install exposes the packaged image CLI command', () => {
  const packRoot = mkdtempSync(join(tmpdir(), 'slides-grab-image-pack-root-'));
  const installRoot = mkdtempSync(join(tmpdir(), 'slides-grab-image-pack-install-'));

  try {
    const output = execFileSync('npm', ['pack', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    const [packInfo] = JSON.parse(output);
    const tarballName = packInfo.filename;
    const tarballPath = join(process.cwd(), tarballName);
    const storedTarballPath = join(packRoot, tarballName);

    mkdirSync(packRoot, { recursive: true });
    mkdirSync(installRoot, { recursive: true });
    writeFileSync(
      join(installRoot, 'package.json'),
      JSON.stringify({ name: 'slides-grab-image-pack-smoke', private: true }, null, 2),
      'utf-8',
    );

    renameSync(tarballPath, storedTarballPath);

    execFileSync('npm', ['install', '--no-package-lock', storedTarballPath], {
      cwd: installRoot,
      encoding: 'utf-8',
    });

    const cliPath = join(installRoot, 'node_modules', '.bin', 'slides-grab');
    const helpOutput = execFileSync(cliPath, ['image', '--help'], {
      cwd: installRoot,
      encoding: 'utf-8',
    });

    assert.match(helpOutput, /slides-grab image/);
    assert.match(helpOutput, /Nano Banana Pro/);
    assert.match(helpOutput, /--prompt <text>/);
    assert.doesNotMatch(helpOutput, /Cannot find module/);
  } finally {
    rmSync(packRoot, { recursive: true, force: true });
    rmSync(installRoot, { recursive: true, force: true });
    rmSync(join(process.cwd(), 'slides-grab-1.0.0.tgz'), { force: true });
  }
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
  assert.match(text, /slides-grab image/i);
  assert.match(text, /Nano Banana Pro/i);
  assert.match(text, /GOOGLE_API_KEY|GEMINI_API_KEY/);
});

test('slides-grab design rules keep packaged image and video asset commands', () => {
  const text = readFileSync('skills/slides-grab-design/references/design-rules.md', 'utf-8');

  assert.match(text, /slides-grab image/i);
  assert.match(text, /slides-grab fetch-video/i);
  assert.match(text, /local videos and their poster thumbnails/i);
});

test('slides-grab workflow reference keeps packaged stage commands and image fallback guidance', () => {
  const text = readFileSync('skills/slides-grab/references/presentation-workflow-reference.md', 'utf-8');

  assert.doesNotMatch(text, /\.claude\/skills\//);
  assert.doesNotMatch(text, /node scripts\//);
  assert.match(text, /slides-grab-plan/);
  assert.match(text, /slides-grab-design/);
  assert.match(text, /slides-grab-export/);
  assert.match(text, /slides-grab build-viewer/);
  assert.match(text, /slides-grab image/i);
  assert.match(text, /Nano Banana Pro/i);
  assert.match(text, /GOOGLE_API_KEY|GEMINI_API_KEY/);
  assert.match(text, /Nano Banana API fails|Nano Banana is down/i);
  assert.match(text, /web search/i);
});

test('slides-grab orchestration skill keeps image and video workflows without duplicate rules', () => {
  const text = readFileSync('skills/slides-grab/SKILL.md', 'utf-8');

  assert.match(text, /slides-grab image/i);
  assert.match(text, /Nano Banana Pro/i);
  assert.match(text, /fetch-video|yt-dlp/i);
  assert.match(text, /local videos/i);
  assert.equal((text.match(/When a slide needs bespoke imagery/gi) || []).length, 1);
  assert.equal((text.match(/For complex diagrams/gi) || []).length, 1);
});

test('slides-grab design rules advertise both packaged image and video asset commands', () => {
  const text = readFileSync('skills/slides-grab-design/references/design-rules.md', 'utf-8');

  assert.match(text, /slides-grab image --prompt/i);
  assert.match(text, /slides-grab fetch-video/i);
});
