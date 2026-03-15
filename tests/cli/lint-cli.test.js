import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI_PATH = path.join(REPO_ROOT, 'bin', 'ppt-agent.js');
const POSITIVE_FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'image-contract', 'positive-local-asset');

function runCli(args = []) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PPT_AGENT_PACKAGE_ROOT: REPO_ROOT,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolvePromise({
        code: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

test('slides-grab help lists lint and validate commands', async () => {
  const result = await runCli(['--help']);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /\blint\b/);
  assert.match(result.stdout, /\bvalidate\b/);
});

test('slides-grab lint succeeds on the positive local-asset fixture', async () => {
  const result = await runCli(['lint', '--slides-dir', POSITIVE_FIXTURE]);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.summary.failedSlides, 0);
  assert.equal(payload.summary.criticalIssues, 0);
});

test('slides-grab validate remains a working alias for lint', async () => {
  const lintResult = await runCli(['lint', '--slides-dir', POSITIVE_FIXTURE]);
  const validateResult = await runCli(['validate', '--slides-dir', POSITIVE_FIXTURE]);

  assert.equal(validateResult.code, 0, validateResult.stderr || validateResult.stdout);

  const lintPayload = JSON.parse(lintResult.stdout);
  const validatePayload = JSON.parse(validateResult.stdout);

  assert.deepEqual(validatePayload.summary, lintPayload.summary);
  assert.equal(validatePayload.slides.length, lintPayload.slides.length);
  assert.equal(validatePayload.slides[0].status, lintPayload.slides[0].status);
});

test('slides-grab validate --help still resolves through the alias', async () => {
  const result = await runCli(['validate', '--help']);

  assert.equal(result.code, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Backward-compatible alias for `slides-grab lint`/);
});
