import { spawn } from 'node:child_process';

import { buildCodexExecArgs } from '../../src/editor/codex-edit.js';

/**
 * Spawn a Codex subprocess for slide editing.
 */
export function spawnCodexEdit({ prompt, imagePath, model, cwd, onLog, timeout = 300_000 }) {
  const codexBin = process.env.PPT_AGENT_CODEX_BIN || 'codex';
  const args = buildCodexExecArgs({ prompt, imagePath, model });

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(codexBin, args, { cwd, stdio: 'pipe', shell: process.platform === 'win32' });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 5000);
    }, timeout);

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
      clearTimeout(timer);
      resolvePromise({
        code: killed ? -1 : (code ?? 1),
        stdout,
        stderr: killed ? stderr + `\n[TIMEOUT after ${timeout}ms]` : stderr,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

/**
 * Spawn a Claude subprocess for slide editing.
 */
export function spawnClaudeEdit({ prompt, imagePath, imagePaths, model, cwd, onLog, timeout = 600_000 }) {
  const claudeBin = process.env.PPT_AGENT_CLAUDE_BIN || 'claude';

  const args = [
    '-p',
    '--dangerously-skip-permissions',
    '--model', model.trim(),
    '--max-turns', '30',
    '--verbose',
  ];

  let fullPrompt = prompt;
  if (Array.isArray(imagePaths) && imagePaths.length > 0) {
    const lines = ['First, read the following PDF page images to understand the visual layout and content:'];
    imagePaths.forEach((p, i) => lines.push(`- Page ${i + 1}: "${p}"`));
    lines.push('', 'These images show the original document pages. Use them to understand charts, diagrams, tables, and visual layout.', '');
    fullPrompt = lines.join('\n') + prompt;
  } else if (typeof imagePath === 'string' && imagePath.trim() !== '') {
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
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already exited */ } }, 5000);
    }, timeout);

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
      clearTimeout(timer);
      resolvePromise({
        code: killed ? -1 : (code ?? 1),
        stdout,
        stderr: killed ? stderr + `\n[TIMEOUT after ${timeout}ms]` : stderr,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });
  });
}

/**
 * Call OpenAI API (with vision) for PptxGenJS code generation.
 * Sends both the text prompt and a screenshot for visual accuracy.
 * Returns the extracted JavaScript code from the response.
 */
export async function callOpenAIForPptx({ prompt, imageBase64, timeout = 60_000 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env file.');
  }

  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey, timeout });

  const content = [];
  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' },
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await client.chat.completions.create({
    model: process.env.PPTX_MODEL || 'gpt-4o',
    messages: [{ role: 'user', content }],
    temperature: 0.2,
    max_tokens: 4096,
  });

  const text = response.choices[0]?.message?.content || '';
  const m = text.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
  if (!m) throw new Error(`No code block in OpenAI response: ${text.slice(0, 200)}`);
  return unwrapFunctionBody(m[1]);
}

/**
 * Strip function wrapper if AI wrapped code in a function declaration.
 * e.g. "function foo(slide, pres) { ...body... }" → "...body..."
 */
function unwrapFunctionBody(code) {
  const wrapped = code.match(/^function\s+\w*\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/);
  if (wrapped) return wrapped[1].trim();
  return code;
}
