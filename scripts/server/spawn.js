import { spawn } from 'node:child_process';

import { buildCodexExecArgs } from '../../src/editor/codex-edit.js';

/**
 * Spawn a Codex subprocess for slide editing.
 */
export function spawnCodexEdit({ prompt, imagePath, model, cwd, onLog }) {
  const codexBin = process.env.PPT_AGENT_CODEX_BIN || 'codex';
  const args = buildCodexExecArgs({ prompt, imagePath, model });

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, args, { cwd, stdio: 'pipe', shell: process.platform === 'win32' });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onLog('stdout', text);
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLog('stderr', text);
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });
  });
}

/**
 * Spawn a Claude subprocess for slide editing.
 */
export function spawnClaudeEdit({ prompt, imagePath, model, cwd, onLog }) {
  const claudeBin = process.env.PPT_AGENT_CLAUDE_BIN || 'claude';

  const args = [
    '-p',
    '--dangerously-skip-permissions',
    '--model', model.trim(),
    '--max-turns', '30',
    '--verbose',
  ];

  let fullPrompt = prompt;
  if (typeof imagePath === 'string' && imagePath.trim() !== '') {
    fullPrompt = `First, read the annotated screenshot at "${imagePath.trim()}" to see the visual context of the bbox regions highlighted on the slide.\n\n${prompt}`;
  }

  const env = { ...process.env };
  delete env.CLAUDECODE;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(claudeBin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: process.platform === 'win32',
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onLog('stdout', text);
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLog('stderr', text);
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolvePromise({ code: code ?? 1, stdout, stderr });
    });

    child.on('error', (error) => {
      rejectPromise(error);
    });
  });
}
