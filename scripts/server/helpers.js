import { readdir, stat } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { watch as fsWatch } from 'node:fs';

import {
  SLIDE_SIZE,
  normalizeSelection,
  isClaudeModel,
} from '../../src/editor/codex-edit.js';
import { normalizePackId } from '../../src/resolve.js';

import { backupDeck } from '../../src/retheme.js';
import { broadcastSSE } from './sse.js';

const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;

// ── Re-exports from sub-modules ─────────────────────────────────────

export { appendOutlinePrompt, parseOutline } from './outline.js';

/**
 * Ensure outline markdown has the correct pack line.
 * Replaces existing pack line or inserts one after deck-name/slide-count anchor.
 */
export function syncPackInOutline(content, packId) {
  const id = normalizePackId(packId);
  if (!id || id === 'auto') return content;

  const packMatch = content.match(/^-\s*pack:\s*(.+)/im);
  if (packMatch) {
    return normalizePackId(packMatch[1]) !== id
      ? content.replace(/^(-\s*pack:\s*).+/im, `$1${id}`)
      : content;
  }

  const anchor = content.match(/^-\s*(slide-count|deck-name):\s*.+$/im);
  if (anchor) {
    const idx = content.indexOf(anchor[0]) + anchor[0].length;
    return content.slice(0, idx) + `\n- pack: ${id}` + content.slice(idx);
  }
  return content;
}

import { spawnClaudeEdit, spawnCodexEdit, spawnOpenAIEdit, inlineDesignMdRefs } from './spawn.js';
export { spawnClaudeEdit, spawnCodexEdit, spawnOpenAIEdit };

export function spawnAIEdit(params) {
  const backend = isClaudeModel(params.model) ? 'Claude' : 'OpenAI API';
  console.log(`[AI] Using ${backend} — model: ${params.model}`);
  // Inline design.md CLI refs into actual content so AI doesn't need tool calls
  const inlinedPrompt = inlineDesignMdRefs(params.prompt);
  const inlinedParams = { ...params, prompt: inlinedPrompt };
  return isClaudeModel(params.model) ? spawnClaudeEdit(inlinedParams) : spawnOpenAIEdit(inlinedParams);
}

// ── Path utilities ──────────────────────────────────────────────────

export function getDeckLabel(opts, slidesDirectory, fallback = 'slides') {
  return opts.deckName || (slidesDirectory ? basename(slidesDirectory) : '') || fallback;
}

export function toPosixPath(inputPath) {
  return inputPath.split(sep).join('/');
}

export function toSlidePathLabel(slidesDirectory, slideFile) {
  const relativePath = relative(process.cwd(), join(slidesDirectory, slideFile));
  const hasParentTraversal = relativePath.startsWith('..');
  const label = !hasParentTraversal && relativePath !== '' ? relativePath : join(slidesDirectory, slideFile);
  return toPosixPath(label);
}

// ── Slide file utilities ────────────────────────────────────────────

export async function listSlideFiles(slidesDirectory) {
  const entries = await readdir(slidesDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const numA = Number.parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const numB = Number.parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return numA - numB || a.localeCompare(b);
    });
}

export function normalizeSlideFilename(rawSlide, source = '`slide`') {
  const slide = typeof rawSlide === 'string' ? basename(rawSlide.trim()) : '';
  if (!slide || !SLIDE_FILE_PATTERN.test(slide)) {
    throw new Error(`Missing or invalid ${source}.`);
  }
  return slide;
}

export function normalizeSlideHtml(rawHtml) {
  if (typeof rawHtml !== 'string' || rawHtml.trim() === '') {
    throw new Error('Missing or invalid `html`.');
  }
  return rawHtml;
}

// ── Selection/target utilities ──────────────────────────────────────

export function sanitizeTargets(rawTargets) {
  if (!Array.isArray(rawTargets)) return [];
  return rawTargets
    .filter((target) => target && typeof target === 'object')
    .slice(0, 30)
    .map((target) => ({
      xpath: typeof target.xpath === 'string' ? target.xpath.slice(0, 500) : '',
      tag: typeof target.tag === 'string' ? target.tag.slice(0, 40) : '',
      text: typeof target.text === 'string' ? target.text.slice(0, 400) : '',
    }))
    .filter((target) => target.xpath);
}

export function normalizeSelections(rawSelections) {
  if (!Array.isArray(rawSelections) || rawSelections.length === 0) {
    throw new Error('At least one selection is required.');
  }
  return rawSelections.slice(0, 24).map((selection) => {
    const selectionSource = selection?.bbox && typeof selection.bbox === 'object'
      ? selection.bbox
      : selection;
    const bbox = normalizeSelection(selectionSource, SLIDE_SIZE);
    const targets = sanitizeTargets(selection?.targets);
    return { bbox, targets };
  });
}

export function normalizeModel(rawModel, allModels, defaultModel) {
  const model = typeof rawModel === 'string' ? rawModel.trim() : '';
  if (!model) return defaultModel;
  if (!allModels.includes(model)) {
    throw new Error(`Invalid \`model\`. Allowed models: ${allModels.join(', ')}`);
  }
  return model;
}

export function randomRunId() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `run-${ts}-${rand}`;
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣a-z0-9-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `deck-${Date.now()}`;
}

// ── Deck name deduplication ─────────────────────────────────────────

export async function listExistingDeckNames() {
  const decksRoot = resolve(process.cwd(), 'decks');
  try {
    const entries = await readdir(decksRoot, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => e.name);
  } catch { return []; }
}

export async function uniqueDeckName(baseName) {
  const decksRoot = resolve(process.cwd(), 'decks');
  let candidate = baseName;
  let suffix = 2;
  while (true) {
    try {
      await stat(join(decksRoot, candidate));
      candidate = `${baseName}-${suffix++}`;
    } catch (err) {
      if (err.code === 'ENOENT') return candidate;
      throw err;
    }
  }
}

// ── Screenshot browser helpers ──────────────────────────────────────

export async function getScreenshotBrowser(ctx) {
  if (!ctx.browserPromise) {
    ctx.browserPromise = ctx.screenshotMod.createScreenshotBrowser()
      .catch((err) => {
        ctx.browserPromise = null;
        throw err;
      });
  }
  return ctx.browserPromise;
}

export async function closeBrowser(ctx) {
  if (!ctx.browserPromise) return;
  const promise = ctx.browserPromise;
  ctx.browserPromise = null;
  try {
    const { browser } = await promise;
    await browser.close();
  } catch {
    // browser was never created or already crashed — nothing to close
  }
}

export async function withScreenshotPage(ctx, callback) {
  const { browser } = await getScreenshotBrowser(ctx);
  const { context, page } = await ctx.screenshotMod.createScreenshotPage(browser);
  try {
    return await callback(page);
  } finally {
    await context.close().catch(() => {});
  }
}

// ── File watcher ────────────────────────────────────────────────────

export function setupFileWatcher(ctx, dir) {
  if (ctx.watcher) { try { ctx.watcher.close(); } catch { /* ignore */ } }
  clearTimeout(ctx.debounceTimer);
  if (!dir) return;
  ctx.watcher = fsWatch(dir, { persistent: false }, (_eventType, filename) => {
    if (!filename || !SLIDE_FILE_PATTERN.test(filename)) return;
    clearTimeout(ctx.debounceTimer);
    ctx.debounceTimer = setTimeout(() => {
      broadcastSSE(ctx.sseClients, 'fileChanged', { file: filename });
    }, 300);
  });
  ctx.watcher.on('error', (err) => {
    console.error('[editor] File watcher error:', err.message);
  });
}

// ── Deck name sanitization ──────────────────────────────────────────

export function sanitizeDeckName(rawName) {
  if (typeof rawName !== 'string' || !rawName.trim()) return null;
  const sanitized = basename(rawName.trim());
  if (!sanitized || sanitized === '.' || sanitized === '..') return null;
  return sanitized;
}

export function resolveDeckPath(rawName) {
  const name = sanitizeDeckName(rawName);
  if (!name) return null;
  const decksRoot = resolve(process.cwd(), 'decks');
  const deckPath = resolve(decksRoot, name);
  if (!deckPath.startsWith(decksRoot + sep) && deckPath !== decksRoot) return null;
  return { name, path: deckPath, decksRoot };
}

// ── Backup helper ───────────────────────────────────────────────────

export async function backupSlides(deckDir) {
  return backupDeck(deckDir, { deleteOriginals: true });
}
