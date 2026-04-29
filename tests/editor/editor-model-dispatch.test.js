import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  ALL_MODELS,
  CODEX_MODELS,
  CLAUDE_MODELS,
  DEFAULT_CODEX_MODEL,
  isClaudeModel,
} from '../../src/editor/js/model-registry.js';
import { getAvailablePort } from './test-server-helpers.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAKE_CODEX_BIN = join(REPO_ROOT, 'tests', 'editor', 'fixtures', 'fake-codex.cjs');
const FAKE_CLAUDE_BIN = join(REPO_ROOT, 'tests', 'editor', 'fixtures', 'fake-claude.cjs');

const SLIDE_HTML = '<!doctype html><html><body><div class="frame"><h1>Original Title</h1><p>Body</p></div></body></html>';

const APPLY_FETCH_TIMEOUT_MS = 8_000;
const EDIT_SUBPROCESS_TIMEOUT_MS = 4_000;
const SERVER_READY_TIMEOUT_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createWorkspace() {
  const workspace = await mkdtemp(join(os.tmpdir(), 'editor-model-dispatch-'));
  const slidesDir = join(workspace, 'slides');
  await mkdir(slidesDir, { recursive: true });
  await writeFile(join(slidesDir, 'slide-01.html'), SLIDE_HTML, 'utf8');
  return { workspace, slidesDir };
}

function spawnEditorServer(workspace, port, { env = {} } = {}) {
  const output = { value: '' };
  const child = spawn(
    process.execPath,
    [join(REPO_ROOT, 'scripts', 'editor-server.js'), '--port', String(port)],
    {
      cwd: workspace,
      env: {
        ...process.env,
        PPT_AGENT_PACKAGE_ROOT: REPO_ROOT,
        PPT_AGENT_CODEX_BIN: FAKE_CODEX_BIN,
        PPT_AGENT_CLAUDE_BIN: FAKE_CLAUDE_BIN,
        PPT_AGENT_EDIT_TIMEOUT_MS: String(EDIT_SUBPROCESS_TIMEOUT_MS),
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.on('data', (chunk) => {
    output.value += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output.value += chunk.toString();
  });

  return { child, output };
}

async function waitForServerReady(port, child, outputRef) {
  const started = Date.now();
  while (Date.now() - started < SERVER_READY_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early: ${child.exitCode}\n${outputRef.value}`);
    }
    try {
      const res = await fetch(`http://localhost:${port}/api/slides`);
      if (res.ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error(`server did not become ready within ${SERVER_READY_TIMEOUT_MS}ms\n${outputRef.value}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve();
    }, 4_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function postApplyWithTimeout(port, model, timeoutMs = APPLY_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://localhost:${port}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slide: 'slide-01.html',
        prompt: `Verify ${model} dispatches end-to-end.`,
        model,
        selections: [
          {
            x: 40,
            y: 60,
            width: 320,
            height: 180,
            targets: [
              { xpath: '/html/body/div[1]/h1[1]', tag: 'h1', text: 'Original Title' },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    clearTimeout(hardTimer);
  }
}

function expectedEngineFor(model) {
  return isClaudeModel(model) ? 'claude' : 'codex';
}

test('every model in ALL_MODELS is recognized either as Codex or Claude', () => {
  for (const model of ALL_MODELS) {
    const isCodex = CODEX_MODELS.includes(model);
    const isClaude = CLAUDE_MODELS.includes(model);
    assert.ok(
      isCodex !== isClaude,
      `${model} must belong to exactly one of CODEX_MODELS or CLAUDE_MODELS (registry sanity check)`,
    );
  }
});

test('ALL_MODELS equals CODEX_MODELS followed by CLAUDE_MODELS (registry composition is canonical)', () => {
  assert.deepEqual(
    ALL_MODELS,
    [...CODEX_MODELS, ...CLAUDE_MODELS],
    'ALL_MODELS must be the canonical concatenation of CODEX_MODELS and CLAUDE_MODELS',
  );
});

test('DEFAULT_CODEX_MODEL is the first entry of CODEX_MODELS', () => {
  assert.equal(
    DEFAULT_CODEX_MODEL,
    CODEX_MODELS[0],
    'DEFAULT_CODEX_MODEL must be CODEX_MODELS[0] so /api/models defaultModel stays in sync',
  );
});

test('isClaudeModel correctly classifies every registered model', () => {
  for (const model of CODEX_MODELS) {
    assert.equal(isClaudeModel(model), false, `isClaudeModel('${model}') must be false (registered Codex model)`);
  }
  for (const model of CLAUDE_MODELS) {
    assert.equal(isClaudeModel(model), true, `isClaudeModel('${model}') must be true (registered Claude model)`);
  }
});

test('/api/models advertises the full registry without drift', async () => {
  const { workspace } = await createWorkspace();
  const port = await getAvailablePort();
  const server = spawnEditorServer(workspace, port);
  try {
    await waitForServerReady(port, server.child, server.output);
    const res = await fetch(`http://localhost:${port}/api/models`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(
      [...body.models].sort(),
      [...ALL_MODELS].sort(),
      `/api/models must return exactly ALL_MODELS. Drift indicates the registry import is bypassed somewhere. Got: ${JSON.stringify(body.models)}`,
    );
    assert.equal(
      body.defaultModel,
      DEFAULT_CODEX_MODEL,
      `/api/models defaultModel must equal DEFAULT_CODEX_MODEL. Got: ${body.defaultModel}`,
    );
  } finally {
    await stopChild(server.child);
    await rm(workspace, { recursive: true, force: true });
  }
});

test('editor.html bundles a fallback <option> for every registered model', async () => {
  const html = await readFile(join(REPO_ROOT, 'src', 'editor', 'editor.html'), 'utf8');
  const selectMatch = html.match(/<select\b[^>]*id=["']model-select["'][\s\S]*?<\/select>/i);
  assert.ok(selectMatch, 'editor.html must contain a <select id="model-select"> element');
  const selectBlock = selectMatch[0];
  for (const model of ALL_MODELS) {
    const optionPattern = new RegExp(`<option\\b[^>]*value=["']${model.replace(/[.+*?^$()|[\\\]\\\\/]/g, '\\$&')}["']`, 'i');
    assert.match(
      selectBlock,
      optionPattern,
      `editor.html must include <option value="${model}"> in the model-select fallback list. ` +
        `Without it, users on a JS-disabled fallback path won't see this model. Update src/editor/editor.html.`,
    );
  }
});

for (const model of ALL_MODELS) {
  const expectedEngine = expectedEngineFor(model);
  const expectedMarker = `[EDITED-BY-${model}]`;

  test(`/api/apply with ${model} dispatches to ${expectedEngine} CLI and actually edits the slide (no hang, no silent failure)`, async () => {
    const { workspace, slidesDir } = await createWorkspace();
    const port = await getAvailablePort();
    const server = spawnEditorServer(workspace, port);

    try {
      await waitForServerReady(port, server.child, server.output);

      let result;
      try {
        result = await postApplyWithTimeout(port, model, APPLY_FETCH_TIMEOUT_MS);
      } catch (error) {
        if (error?.name === 'AbortError') {
          assert.fail(
            `model ${model} hung — likely stdin or CLI invocation regression. ` +
              `/api/apply did not respond within ${APPLY_FETCH_TIMEOUT_MS}ms when routing to the ${expectedEngine} fake CLI. ` +
              `If the recently-fixed Codex stdin-pipe bug returned, this is what it looks like in CI.\n` +
              `Server output tail:\n${server.output.value.slice(-1500)}`,
          );
        }
        throw error;
      }

      assert.equal(
        result.status,
        200,
        `model ${model}: /api/apply must return HTTP 200. Got ${result.status} body=${JSON.stringify(result.body)}\n` +
          `Server output tail:\n${server.output.value.slice(-1500)}`,
      );
      assert.equal(
        result.body.success,
        true,
        `model ${model}: /api/apply must report success=true. Got ${JSON.stringify(result.body)}\n` +
          `Server output tail:\n${server.output.value.slice(-1500)}`,
      );
      assert.equal(
        result.body.model,
        model,
        `model ${model}: /api/apply response must echo the requested model in body.model. Got ${result.body.model}`,
      );

      const slideAfter = await readFile(join(slidesDir, 'slide-01.html'), 'utf8');
      assert.ok(
        slideAfter.includes(expectedMarker),
        `model ${model}: slide-01.html must contain marker '${expectedMarker}' after the ${expectedEngine} CLI ran. ` +
          `Marker missing means /api/apply reported success but the CLI never actually edited the slide — a silent dispatch failure. ` +
          `Slide content tail:\n${slideAfter.slice(-400)}`,
      );

      const wrongEngineMarkerPattern = new RegExp(
        `\\[EDITED-BY-(?:${(expectedEngine === 'codex' ? CLAUDE_MODELS : CODEX_MODELS).join('|').replace(/\./g, '\\.')})\\]`,
      );
      assert.ok(
        !wrongEngineMarkerPattern.test(slideAfter),
        `model ${model}: slide must NOT contain a marker from the wrong engine class. Routing regression detected. ` +
          `Slide content tail:\n${slideAfter.slice(-400)}`,
      );

      const logRes = await fetch(`http://localhost:${port}/api/runs/${result.body.runId}/log`);
      assert.equal(logRes.status, 200);
      const runLog = await logRes.text();
      assert.match(
        runLog,
        new RegExp(`\\[fake-${expectedEngine}\\] model=${model.replace(/\./g, '\\.')}`),
        `model ${model}: run log must show the fake-${expectedEngine} stub was invoked with --model=${model}. ` +
          `If this assertion fails, the editor wired the wrong CLI binary or did not pass the model argv.`,
      );
    } finally {
      await stopChild(server.child);
      await rm(workspace, { recursive: true, force: true });
    }
  });
}
