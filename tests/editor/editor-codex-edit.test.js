import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCodexEditPrompt,
  buildCodexExecArgs,
  getDetailedDesignSkillPrompt,
  getPptDesignSkillPrompt,
  normalizeSelection,
  scaleSelectionToScreenshot,
} from '../../src/editor/codex-edit.js';
import {
  buildEditTimeoutMessage,
  DEFAULT_EDIT_TIMEOUT_MS,
  parseEditTimeoutMs,
} from '../../src/editor/edit-subprocess.js';

test('normalizeSelection rounds values and clamps to slide bounds', () => {
  const selection = normalizeSelection(
    {
      x: -10.7,
      y: 15.2,
      width: 980.9,
      height: 700.6,
    },
    { width: 960, height: 540 },
  );

  assert.deepEqual(selection, {
    x: 0,
    y: 15,
    width: 960,
    height: 525,
  });
});

test('scaleSelectionToScreenshot maps slide bbox to screenshot pixels', () => {
  const scaled = scaleSelectionToScreenshot(
    { x: 96, y: 54, width: 480, height: 270 },
    { width: 960, height: 540 },
    { width: 1600, height: 900 },
  );

  assert.deepEqual(scaled, {
    x: 160,
    y: 90,
    width: 800,
    height: 450,
  });
});

test('buildCodexEditPrompt includes user prompt, bbox, and XPath targets', () => {
  const prompt = buildCodexEditPrompt({
    slideFile: 'slide-01.html',
    userPrompt: 'Make this title larger and move it left.',
    selections: [
      {
        bbox: { x: 100, y: 40, width: 300, height: 120 },
        targets: [
          {
            xpath: '/html/body/div[1]/h1[1]',
            tag: 'h1',
            text: 'Q1 Revenue',
          },
          {
            xpath: '/html/body/div[1]/p[2]',
            tag: 'p',
            text: 'Source: Internal',
          },
        ],
      },
    ],
  });

  assert.match(prompt, /slides\/slide-01\.html/);
  assert.match(prompt, /Make this title larger and move it left\./);
  assert.match(prompt, /x=100, y=40, width=300, height=120/);
  assert.match(prompt, /\/html\/body\/div\[1\]\/h1\[1\]/);
  assert.match(prompt, /Q1 Revenue/);
  assert.match(prompt, /Region 1/);
  assert.match(prompt, /Project skill guidance \(follow strictly\):/);
  assert.match(prompt, /skills\/slides-grab-design\/SKILL\.md/);
  assert.match(prompt, /Keep slide size 720pt x 405pt\./);
  assert.match(prompt, /Detailed design\/export guardrails \(selected from the full design system\):/);
  assert.match(prompt, /Do not use non-body `background-image` for content imagery; use `<img>` instead\./);
  assert.match(prompt, /CSS gradients.*not supported in PowerPoint conversion/i);
  assert.match(prompt, /Never forget to build the viewer/i);
  assert.match(prompt, /Do not persist runtime-only editor\/viewer injections/);
});

test('buildCodexEditPrompt uses explicit slide path when provided', () => {
  const prompt = buildCodexEditPrompt({
    slideFile: 'slide-01.html',
    slidePath: 'presentations/demo-a/slide-01.html',
    userPrompt: 'Increase title size.',
    selections: [{ bbox: { x: 10, y: 12, width: 220, height: 80 }, targets: [] }],
  });

  assert.match(prompt, /Edit presentations\/demo-a\/slide-01\.html only\./);
});

test('buildCodexExecArgs attaches image and prompt to codex exec', () => {
  const args = buildCodexExecArgs({
    prompt: 'Edit slide',
    imagePath: '/tmp/slide-annotated.png',
    model: 'gpt-5.3',
  });

  assert.deepEqual(args, [
    '--dangerously-bypass-approvals-and-sandbox',
    'exec',
    '--color',
    'never',
    '--model',
    'gpt-5.3',
    '--image',
    '/tmp/slide-annotated.png',
    '--',
    'Edit slide',
  ]);
});

test('getPptDesignSkillPrompt loads bundled ppt design skill guidance', () => {
  const skillPrompt = getPptDesignSkillPrompt();

  assert.match(skillPrompt, /# slides-grab Design Skill \(Codex\)/);
  assert.match(skillPrompt, /Keep slide size 720pt x 405pt\./);
  assert.match(skillPrompt, /reference them as `\.\/assets\/<file>`\./);
});

test('getDetailedDesignSkillPrompt loads only relevant detailed design sections', () => {
  const detailedPrompt = getDetailedDesignSkillPrompt();

  assert.match(detailedPrompt, /## Base Settings/);
  assert.match(detailedPrompt, /### 4\. Image Usage Rules/);
  assert.match(detailedPrompt, /## Text Usage Rules/);
  assert.match(detailedPrompt, /## Workflow \(Stage 2: Design \+ Human Review\)/);
  assert.match(detailedPrompt, /## Important Notes/);
  assert.doesNotMatch(detailedPrompt, /## Core Design Philosophy/);
  assert.doesNotMatch(detailedPrompt, /### 1\. Chart\.js/);
});

test('parseEditTimeoutMs falls back to the 10-minute default for invalid values', () => {
  assert.equal(DEFAULT_EDIT_TIMEOUT_MS, 600000);
  assert.equal(parseEditTimeoutMs(undefined), DEFAULT_EDIT_TIMEOUT_MS);
  assert.equal(parseEditTimeoutMs(''), DEFAULT_EDIT_TIMEOUT_MS);
  assert.equal(parseEditTimeoutMs('0'), DEFAULT_EDIT_TIMEOUT_MS);
  assert.equal(parseEditTimeoutMs('-10'), DEFAULT_EDIT_TIMEOUT_MS);
  assert.equal(parseEditTimeoutMs('abc'), DEFAULT_EDIT_TIMEOUT_MS);
});

test('buildEditTimeoutMessage describes terminated editor runs', () => {
  assert.equal(
    buildEditTimeoutMessage({ engineLabel: 'Codex', timeoutMs: 200 }),
    'Codex edit timed out after 200ms and was terminated.',
  );
});
