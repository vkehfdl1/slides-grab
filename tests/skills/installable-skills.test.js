import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const INSTALLABLE_SKILLS = [
  'skills/slides-grab/SKILL.md',
  'skills/slides-grab-plan/SKILL.md',
  'skills/slides-grab-design/SKILL.md',
  'skills/slides-grab-export/SKILL.md',
  'skills/slides-grab-card-news/SKILL.md',
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
  assert.ok(filePaths.has('skills/slides-grab-card-news/SKILL.md'));
  assert.ok(filePaths.has('templates/design-styles/README.md'));
  assert.ok(filePaths.has('scripts/generate-image.js'));
  assert.ok(filePaths.has('src/pptx-raster-export.cjs'));
  assert.ok(filePaths.has('src/nano-banana.js'));
  assert.ok(!filePaths.has('scripts/install-codex-skills.js'));
});

test('packed npm install exposes the packaged image CLI command', () => {
  const packRoot = mkdtempSync(join(tmpdir(), 'slides-grab-image-pack-root-'));
  const installRoot = mkdtempSync(join(tmpdir(), 'slides-grab-image-pack-install-'));

  try {
    mkdirSync(packRoot, { recursive: true });
    mkdirSync(installRoot, { recursive: true });

    const output = execFileSync('npm', ['pack', '--json', '--pack-destination', packRoot], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });
    const [packInfo] = JSON.parse(output);
    const storedTarballPath = join(packRoot, packInfo.filename);

    writeFileSync(
      join(installRoot, 'package.json'),
      JSON.stringify({ name: 'slides-grab-image-pack-smoke', private: true }, null, 2),
      'utf-8',
    );

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
    assert.match(helpOutput, /Codex\/OpenAI/);
    assert.match(helpOutput, /--provider <name>/);
    assert.match(helpOutput, /--aspect-ratio <ratio>/);
    assert.match(helpOutput, /Nano Banana image size preset/);
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
test('slides-grab design skill keeps the packaged style-discovery CLI guidance', () => {
  const text = readFileSync('skills/slides-grab-design/SKILL.md', 'utf-8');

  assert.match(text, /references\/beautiful-slide-defaults\.md/);
  assert.match(text, /visual thesis/i);
  assert.match(text, /content plan/i);
  assert.match(text, /slide litmus check/i);
  assert.match(text, /slides-grab list-styles/);
  assert.match(text, /slides-grab preview-styles/);
  assert.match(text, /slides-grab image/i);
  assert.match(text, /Codex\/OpenAI/i);
  assert.match(text, /OPENAI_API_KEY/);
  assert.match(text, /GOOGLE_API_KEY|GEMINI_API_KEY/);
});

test('slides-grab design rules keep packaged style, image, and video asset commands', () => {
  const text = readFileSync('skills/slides-grab-design/references/design-rules.md', 'utf-8');

  assert.match(text, /slides-grab list-styles/);
  assert.match(text, /slides-grab preview-styles/);
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
  assert.match(text, /god-tibo-imagen/i);
  assert.match(text, /codex login/i);
  assert.match(text, /OPENAI_API_KEY/);
  assert.match(text, /GOOGLE_API_KEY|GEMINI_API_KEY/);
  assert.match(text, /--aspect-ratio/);
  assert.match(text, /--image-size 2K\|4K.*Nano Banana-only/i);
  assert.match(text, /Nano Banana/i);
  assert.match(text, /web search/i);
});

test('slides-grab orchestration skill keeps packaged style/image/video workflows without duplicate rules', () => {
  const text = readFileSync('skills/slides-grab/SKILL.md', 'utf-8');

  assert.match(text, /slides-grab image/i);
  assert.match(text, /god-tibo-imagen/i);
  assert.match(text, /codex login/i);
  assert.match(text, /fetch-video|yt-dlp/i);
  assert.match(text, /slides-grab list-styles/);
  assert.match(text, /slides-grab preview-styles/);
  assert.match(text, /local videos/i);
  assert.equal((text.match(/When a slide needs bespoke imagery/gi) || []).length, 1);
  assert.equal((text.match(/For complex diagrams/gi) || []).length, 1);
});

test('slides-grab design rules advertise both packaged image and video asset commands', () => {
  const text = readFileSync('skills/slides-grab-design/references/design-rules.md', 'utf-8');

  assert.match(text, /slides-grab image --prompt/i);
  assert.match(text, /slides-grab fetch-video/i);
});

test('slides-grab packaged guidance prefers Lucide as the default icon library', () => {
  const designSkill = readFileSync('skills/slides-grab-design/SKILL.md', 'utf-8');
  const designRules = readFileSync('skills/slides-grab-design/references/design-rules.md', 'utf-8');
  const detailedDesignRules = readFileSync('skills/slides-grab-design/references/detailed-design-rules.md', 'utf-8');
  const exportReference = readFileSync('skills/slides-grab-export/references/html2pptx.md', 'utf-8');
  const packageManifest = JSON.parse(readFileSync('package.json', 'utf-8'));

  assert.match(designSkill, /Lucide/i);
  assert.match(designSkill, /prefer Lucide/i);
  assert.match(designRules, /Lucide/i);
  assert.match(designRules, /avoid emoji as the default/i);
  assert.match(detailedDesignRules, /Prefer Lucide as the default icon library/i);
  assert.match(detailedDesignRules, /Do not default to emoji/i);
  assert.match(exportReference, /lucide-react/);
  assert.doesNotMatch(exportReference, /react-icons/);
  assert.match(packageManifest.dependencies['lucide-react'], /^\^?\d+\.\d+\.\d+$/);
  assert.equal(packageManifest.dependencies['react-icons'], undefined);
});


test('slides-grab card-news skill documents square Instagram workflow via packaged commands', () => {
  const text = readFileSync('skills/slides-grab-card-news/SKILL.md', 'utf-8');

  assert.match(text, /Instagram/i);
  assert.match(text, /card-news/i);
  assert.match(text, /--mode card-news|--slide-mode card-news/);
  assert.match(text, /slides-grab validate/i);
  assert.match(text, /slides-grab build-viewer/i);
});

test('beautiful-slide-defaults declares the system before designing (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/references/beautiful-slide-defaults.md', 'utf-8');

  assert.match(text, /system declaration/i);
  assert.match(text, /vocalize the system/i);
});

test('beautiful-slide-defaults enforces content discipline against filler (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/references/beautiful-slide-defaults.md', 'utf-8');

  assert.match(text, /## Content Discipline/);
  assert.match(text, /filler/i);
  assert.match(text, /data slop/i);
  assert.match(text, /one thousand no's/i);
});

test('beautiful-slide-defaults enforces color discipline with oklch extension (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/references/beautiful-slide-defaults.md', 'utf-8');

  assert.match(text, /## Color Discipline/);
  assert.match(text, /oklch/i);
  assert.match(text, /design-styles-data\.js/);
});

test('beautiful-slide-defaults names AI slop tropes to avoid (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/references/beautiful-slide-defaults.md', 'utf-8');

  assert.match(text, /## AI Slop Tropes to Avoid/);
  assert.match(text, /gradient backgrounds/i);
  assert.match(text, /left-border accent/i);
  assert.match(text, /Inter, Roboto, Arial/);
});

test('detailed-design-rules enforces typography scale floors (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/references/detailed-design-rules.md', 'utf-8');

  assert.match(text, /## Typography Scale Rules/);
  assert.match(text, /14pt/);
  assert.match(text, /10pt/);
  assert.match(text, /cut content/i);
});

test('detailed-design-rules enforces color usage rules with oklch extension (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/references/detailed-design-rules.md', 'utf-8');

  assert.match(text, /## Color Usage Rules/);
  assert.match(text, /oklch/i);
  assert.match(text, /design-styles-data\.js/);
});

test('design SKILL.md surfaces system declaration and AI-slop guardrails (issue #66)', () => {
  const text = readFileSync('skills/slides-grab-design/SKILL.md', 'utf-8');

  assert.match(text, /system declaration/i);
  assert.match(text, /filler copy|filler content/i);
  assert.match(text, /14pt minimum/i);
  assert.match(text, /AI slop tropes/i);
  assert.match(text, /oklch/i);
});
