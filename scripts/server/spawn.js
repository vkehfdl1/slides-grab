import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { buildCodexExecArgs } from '../../src/editor/codex-edit.js';
import { resolveTemplate, resolvePackTheme } from '../../src/resolve.js';

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

// ── OpenAI API direct call for slide generation ─────────────────────

const OPENAI_SYSTEM_PROMPT = `You are an expert presentation slide generator. You create complete, production-ready HTML slide files.

CRITICAL OUTPUT FORMAT: When creating files, output EACH file using this exact delimiter:

=== FILE: <relative-path> ===
<complete file content>
=== END FILE ===

Rules:
- Output ONLY the file blocks. No explanations, no commentary.
- The relative path must match what was requested (e.g. decks/my-deck/slide-01.html).
- Include ALL requested files — do not skip any slides.
- Each HTML slide must be a COMPLETE standalone document with <!DOCTYPE html>, full <head>, and <body>.
- Generate RICH, detailed content for every slide — real paragraphs, bullet points, data, descriptions. Never leave slides with just a title or subtitle.
- Follow the template's visual structure but fill it with substantive, informative content.
- Slide dimensions: 720pt × 405pt (set on <body> via width/height).
- Use Pretendard font via CDN: https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css`;

/**
 * Detect if a model is an OpenAI reasoning model (o-series).
 * Reasoning models use max_completion_tokens instead of max_tokens.
 */
function isReasoningModel(model) {
  return /^o\d/.test(model);
}

/**
 * Replace `slides-grab show-template <type> --pack <packId>` references
 * in the prompt with the actual template HTML content.
 */
export function inlineTemplateRefs(prompt) {
  return prompt.replace(
    /slides-grab show-template (\S+)(?: --pack (\S+))?/g,
    (match, name, packId) => {
      try {
        const result = resolveTemplate(name, packId);
        if (result) {
          const html = readFileSync(result.path, 'utf-8');
          return `[Template "${name}" from pack "${result.pack}"]\n\`\`\`html\n${html}\n\`\`\``;
        }
      } catch { /* template not found */ }
      return match;
    },
  );
}

/**
 * Replace `slides-grab show-theme <packId>` references
 * in the prompt with the actual theme CSS content.
 */
export function inlineThemeRefs(prompt) {
  return prompt.replace(
    /slides-grab show-theme (\S+)/g,
    (match, packId) => {
      try {
        const result = resolvePackTheme(packId);
        if (result) {
          const css = readFileSync(result.path, 'utf-8');
          return `[Theme CSS for pack "${result.pack}"]\n\`\`\`css\n${css}\n\`\`\``;
        }
      } catch { /* theme not found */ }
      return match;
    },
  );
}

/**
 * Parse file blocks from OpenAI response.
 * Format: === FILE: <path> === ... === END FILE ===
 */
function parseFileBlocks(text) {
  const files = [];
  const regex = /=== FILE: (.+?) ===\n([\s\S]*?)(?:\n=== END FILE ===)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const filePath = m[1].trim();
    const content = m[2];
    if (filePath && content != null) {
      files.push({ path: filePath, content });
    }
  }
  return files;
}

/**
 * Call OpenAI Chat Completions API directly for slide generation.
 * Replaces spawnCodexEdit — same interface as spawnClaudeEdit.
 */
export async function spawnOpenAIEdit({ prompt, model, cwd, onLog, timeout = 300_000 }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const msg = 'OPENAI_API_KEY is not set. Add it to .env file.';
    onLog?.('stderr', msg);
    return { code: 1, stdout: '', stderr: msg };
  }

  const selectedModel = (model || 'gpt-4o').trim();
  onLog?.('stdout', `[OpenAI API] Calling ${selectedModel}...\n`);

  // Template/theme inlining is done in spawnAIEdit() before dispatch
  const enhancedPrompt = prompt;

  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, timeout });

    const isReasoning = isReasoningModel(selectedModel);
    const messages = isReasoning
      ? [{ role: 'user', content: OPENAI_SYSTEM_PROMPT + '\n\n---\n\n' + enhancedPrompt }]
      : [
          { role: 'system', content: OPENAI_SYSTEM_PROMPT },
          { role: 'user', content: enhancedPrompt },
        ];

    const response = await client.chat.completions.create({
      model: selectedModel,
      messages,
      ...(isReasoning
        ? { max_completion_tokens: 65536 }
        : { temperature: 0.3, max_tokens: 16384 }),
    });

    const text = response.choices[0]?.message?.content || '';
    onLog?.('stdout', text);

    // Parse and write files
    const files = parseFileBlocks(text);
    const written = [];

    for (const { path: filePath, content } of files) {
      const fullPath = join(cwd, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      written.push(filePath);
    }

    if (written.length > 0) {
      const summary = `\n[OpenAI API] Wrote ${written.length} file(s): ${written.join(', ')}\n`;
      onLog?.('stdout', summary);
      console.log(summary);
    } else {
      const warn = '\n[OpenAI API] Warning: No file blocks found in response.\n';
      onLog?.('stderr', warn);
      console.warn(warn);
    }

    return { code: written.length > 0 ? 0 : 1, stdout: text, stderr: '' };
  } catch (err) {
    const msg = `[OpenAI API] Error: ${err.message}\n`;
    onLog?.('stderr', msg);
    console.error(msg);
    return { code: 1, stdout: '', stderr: msg };
  }
}
