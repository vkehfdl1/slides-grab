#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdtemp, rm, mkdir, stat, rename, copyFile, unlink } from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';
import { basename, dirname, join, resolve, relative, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import archiver from 'archiver';
import { WebSocketServer } from 'ws';

import {
  SLIDE_SIZE,
  buildCodexEditPrompt,
  buildCodexExecArgs,
  buildClaudeExecArgs,
  CLAUDE_MODELS,
  isClaudeModel,
  normalizeSelection,
  scaleSelectionToScreenshot,
  writeAnnotatedScreenshot,
} from '../src/editor/codex-edit.js';

import { listTemplates } from '../src/resolve.js';

import { mergePdfBuffers } from './html2pdf.js';
import { PDFDocument } from 'pdf-lib';

import {
  getDomToSvgBundle,
  getOpentypeBundle,
  renderSlideToSvg,
  renderSlideToSvgForeignObject,
  renderSlideToPng,
  convertTextToOutlines,
  scaleSvg,
  resizeSvg,
  getOutputFileName,
} from './html2svg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = process.env.PPT_AGENT_PACKAGE_ROOT || resolve(__dirname, '..');

let express;
let screenshotMod;

async function loadDeps() {
  if (!express) {
    express = (await import('express')).default;
  }
  if (!screenshotMod) {
    screenshotMod = await import('../src/editor/screenshot.js');
  }
}

const DEFAULT_PORT = 3456;
const DEFAULT_SLIDES_DIR = 'slides';
const CODEX_MODELS = ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'];
const ALL_MODELS = [...CODEX_MODELS, ...CLAUDE_MODELS];
const DEFAULT_CODEX_MODEL = CODEX_MODELS[0];
const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;

const MAX_RUNS = 200;
const MAX_LOG_CHARS = 800_000;

function printUsage() {
  process.stdout.write(`Usage: slides-grab edit [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --port <number>           Server port (default: ${DEFAULT_PORT})\n`);
  process.stdout.write(`  --slides-dir <path>       Slide directory (default: ${DEFAULT_SLIDES_DIR})\n`);
  process.stdout.write(`  Model is selected in editor UI dropdown.\n`);
  process.stdout.write(`  -h, --help                Show this help message\n`);
}

function parseArgs(argv) {
  const opts = {
    port: DEFAULT_PORT,
    slidesDir: DEFAULT_SLIDES_DIR,
    help: false,
    createMode: false,
    browseMode: false,
    deckName: '',
    importFile: '',
    importSlideCount: '',
    importResearch: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
      continue;
    }

    if (arg === '--create') {
      opts.createMode = true;
      continue;
    }

    if (arg === '--browse') {
      opts.browseMode = true;
      continue;
    }

    if (arg === '--deck-name') {
      opts.deckName = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg.startsWith('--deck-name=')) {
      opts.deckName = arg.slice('--deck-name='.length);
      continue;
    }

    if (arg === '--port') {
      opts.port = Number(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--port=')) {
      opts.port = Number(arg.slice('--port='.length));
      continue;
    }

    if (arg === '--slides-dir') {
      opts.slidesDir = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--slides-dir=')) {
      opts.slidesDir = arg.slice('--slides-dir='.length);
      continue;
    }

    if (arg === '--import') {
      opts.importFile = argv[i + 1] || '';
      opts.createMode = true;
      i += 1;
      continue;
    }

    if (arg.startsWith('--import=')) {
      opts.importFile = arg.slice('--import='.length);
      opts.createMode = true;
      continue;
    }

    if (arg === '--slide-count') {
      opts.importSlideCount = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg.startsWith('--slide-count=')) {
      opts.importSlideCount = arg.slice('--slide-count='.length);
      continue;
    }

    if (arg === '--research') {
      opts.importResearch = true;
      continue;
    }

    if (arg === '--codex-model') {
      // Backward compatibility: ignore legacy CLI option.
      i += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!Number.isInteger(opts.port) || opts.port <= 0) {
    throw new Error('`--port` must be a positive integer.');
  }

  // In create/browse mode, slidesDir is determined later
  if (!opts.createMode && !opts.browseMode) {
    if (typeof opts.slidesDir !== 'string' || opts.slidesDir.trim() === '') {
      throw new Error('`--slides-dir` must be a non-empty path.');
    }
    opts.slidesDir = opts.slidesDir.trim();
  }

  opts.deckName = opts.deckName.trim();

  return opts;
}

const sseClients = new Set();
const figmaClients = new Set();

function broadcastSSE(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    res.write(payload);
  }
}

let browserPromise = null;

async function getScreenshotBrowser() {
  if (!browserPromise) {
    browserPromise = screenshotMod.createScreenshotBrowser();
  }
  return browserPromise;
}

async function closeBrowser() {
  if (browserPromise) {
    const { browser } = await getScreenshotBrowser();
    browserPromise = null;
    await browser.close();
  }
}

async function withScreenshotPage(callback) {
  const { browser } = await getScreenshotBrowser();
  const { context, page } = await screenshotMod.createScreenshotPage(browser);
  try {
    return await callback(page);
  } finally {
    await context.close().catch(() => {});
  }
}

function toPosixPath(inputPath) {
  return inputPath.split(sep).join('/');
}

function toSlidePathLabel(slidesDirectory, slideFile) {
  const relativePath = relative(process.cwd(), join(slidesDirectory, slideFile));
  const hasParentTraversal = relativePath.startsWith('..');
  const label = !hasParentTraversal && relativePath !== '' ? relativePath : join(slidesDirectory, slideFile);
  return toPosixPath(label);
}

async function listSlideFiles(slidesDirectory) {
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

function normalizeSlideFilename(rawSlide, source = '`slide`') {
  const slide = typeof rawSlide === 'string' ? basename(rawSlide.trim()) : '';
  if (!slide || !SLIDE_FILE_PATTERN.test(slide)) {
    throw new Error(`Missing or invalid ${source}.`);
  }
  return slide;
}

/**
 * Back up existing slide HTML files into a timestamped subdirectory.
 * e.g. decks/my-deck/backup/2026-03-20_143052/slide-01.html ...
 * Returns the backup directory path, or null if there was nothing to back up.
 */
async function backupSlides(deckDir) {
  const slideFiles = await listSlideFiles(deckDir);
  if (slideFiles.length === 0) return null;

  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const backupDir = join(deckDir, 'backup', ts);
  await mkdir(backupDir, { recursive: true });

  await Promise.all(
    slideFiles.map((f) => copyFile(join(deckDir, f), join(backupDir, f))),
  );

  // Remove originals so Claude generates all slides fresh
  await Promise.all(
    slideFiles.map((f) => unlink(join(deckDir, f))),
  );

  console.log(`Backed up ${slideFiles.length} slides → ${backupDir} (originals removed)`);
  return backupDir;
}

function normalizeSlideHtml(rawHtml) {
  if (typeof rawHtml !== 'string' || rawHtml.trim() === '') {
    throw new Error('Missing or invalid `html`.');
  }
  return rawHtml;
}

function sanitizeTargets(rawTargets) {
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

function normalizeSelections(rawSelections) {
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

function normalizeModel(rawModel) {
  const model = typeof rawModel === 'string' ? rawModel.trim() : '';
  if (!model) return DEFAULT_CODEX_MODEL;
  if (!ALL_MODELS.includes(model)) {
    throw new Error(`Invalid \`model\`. Allowed models: ${ALL_MODELS.join(', ')}`);
  }
  return model;
}

function randomRunId() {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `run-${ts}-${rand}`;
}

function parseOutline(content, deckName) {
  const lines = content.split('\n');
  const outline = { title: '', deckName: deckName || '', slides: [], rawHeader: '', rawFooter: '' };

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)/);
    if (h1) { outline.title = h1[1].trim().replace(/<[^>]*>/g, ''); break; }
  }

  for (const line of lines) {
    const plain = line.replace(/\*\*(.*?)\*\*/g, '$1');
    const dm = plain.match(/^-\s*deck-name:\s*(.+)/i);
    if (dm) { outline.deckName = dm[1].trim(); break; }
  }

  // Find ### Slide boundaries and H1/H2 footer boundary
  const slideStarts = [];
  let footerStart = -1;
  let foundFirstSlide = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Slide\s+\d+/i.test(lines[i])) {
      slideStarts.push(i);
      foundFirstSlide = true;
    } else if (foundFirstSlide && /^#{1,2}\s/.test(lines[i]) && !/^###/.test(lines[i])) {
      if (footerStart < 0) footerStart = i;
    }
  }

  if (slideStarts.length === 0) {
    outline.rawHeader = content;
    return outline;
  }

  // rawHeader: everything before first slide
  outline.rawHeader = lines.slice(0, slideStarts[0]).join('\n');
  if (outline.rawHeader) outline.rawHeader += '\n';

  const contentEnd = footerStart >= 0 ? footerStart : lines.length;

  // Parse each slide
  for (let si = 0; si < slideStarts.length; si++) {
    const start = slideStarts[si];
    const end = si + 1 < slideStarts.length ? slideStarts[si + 1] : contentEnd;

    const rawBlock = lines.slice(start, end).join('\n') + '\n';
    const headerLine = lines[start];
    const slideMatch = headerLine.match(/^###\s+Slide\s+\d+\s*(?:[-–—]\s*(.+))?/i);

    const cur = {
      type: '',
      title: (slideMatch?.[1] || '').trim(),
      details: [],
      rawBlock,
    };

    for (let j = start + 1; j < end; j++) {
      const line = lines[j];
      if (/^---\s*$/.test(line)) continue;

      const plain = line.replace(/\*\*(.*?)\*\*/g, '$1');
      const tm = plain.match(/^-\s*type:\s*(.+)/i);
      const tt = plain.match(/^-\s*title:\s*(.+)/i);

      if (tm) { cur.type = tm[1].trim(); }
      else if (tt) { cur.title = tt[1].trim(); }
      else {
        const trimmed = line.trimEnd();
        if (trimmed) cur.details.push(trimmed);
      }
    }

    outline.slides.push(cur);
  }

  // rawFooter: everything after the last slide region
  if (footerStart >= 0) {
    outline.rawFooter = lines.slice(footerStart).join('\n');
  }

  return outline;
}

function spawnCodexEdit({ prompt, imagePath, model, cwd, onLog }) {
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

function spawnClaudeEdit({ prompt, imagePath, model, cwd, onLog }) {
  const claudeBin = process.env.PPT_AGENT_CLAUDE_BIN || 'claude';

  // Build args WITHOUT the prompt — we'll pipe it via stdin instead,
  // because Windows cmd.exe truncates long multi-line arguments.
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

  // Remove CLAUDECODE env var to avoid "nested session" detection error
  const env = { ...process.env };
  delete env.CLAUDECODE;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(claudeBin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: process.platform === 'win32',
    });

    // Send prompt via stdin and close it
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

function createRunStore() {
  const activeRunsBySlide = new Map();
  const runStore = new Map();
  const runOrder = [];

  function toRunSummary(run) {
    return {
      runId: run.runId,
      slide: run.slide,
      model: run.model,
      status: run.status,
      code: run.code,
      message: run.message,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      prompt: run.prompt,
      selectionsCount: run.selectionsCount,
      logSize: run.log.length,
      logPreview: run.log.slice(-2000),
    };
  }

  return {
    hasActiveRunForSlide(slide) {
      return activeRunsBySlide.has(slide);
    },

    getActiveRunId(slide) {
      return activeRunsBySlide.get(slide) ?? null;
    },

    startRun({ runId, slide, prompt, selectionsCount, model }) {
      activeRunsBySlide.set(slide, runId);

      const run = {
        runId,
        slide,
        status: 'running',
        code: null,
        message: 'Running',
        prompt,
        model,
        selectionsCount,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        log: '',
      };

      runStore.set(runId, run);
      runOrder.push(runId);

      while (runOrder.length > MAX_RUNS) {
        const oldestRunId = runOrder.shift();
        if (!oldestRunId) continue;
        runStore.delete(oldestRunId);
      }

      return toRunSummary(run);
    },

    appendLog(runId, chunk) {
      const run = runStore.get(runId);
      if (!run) return;

      run.log += chunk;
      if (run.log.length > MAX_LOG_CHARS) {
        run.log = run.log.slice(run.log.length - MAX_LOG_CHARS);
      }
    },

    finishRun(runId, { status, code, message }) {
      const run = runStore.get(runId);
      if (!run) return null;

      run.status = status;
      run.code = code;
      run.message = message;
      run.finishedAt = new Date().toISOString();

      if (activeRunsBySlide.get(run.slide) === runId) {
        activeRunsBySlide.delete(run.slide);
      }

      return toRunSummary(run);
    },

    clearActiveRun(slide, runId) {
      if (activeRunsBySlide.get(slide) === runId) {
        activeRunsBySlide.delete(slide);
      }
    },

    listRuns(limit = 60) {
      return runOrder
        .slice(Math.max(0, runOrder.length - limit))
        .reverse()
        .map((runId) => runStore.get(runId))
        .filter(Boolean)
        .map((run) => toRunSummary(run));
    },

    getRunLog(runId) {
      const run = runStore.get(runId);
      if (!run) return null;
      return run.log;
    },

    listActiveRuns() {
      return Array.from(activeRunsBySlide.entries()).map(([slide, runId]) => ({ slide, runId }));
    },
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣a-z0-9-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || `deck-${Date.now()}`;
}

async function startServer(opts) {
  await loadDeps();
  let slidesDirectory = (opts.createMode || opts.browseMode)
    ? ''  // will be set when user submits topic or selects a deck
    : resolve(process.cwd(), opts.slidesDir);

  if (!opts.createMode && !opts.browseMode) {
    await mkdir(slidesDirectory, { recursive: true });
  }

  // If create mode with a pre-set deck name, resolve it now
  if (opts.createMode && opts.deckName) {
    slidesDirectory = resolve(process.cwd(), 'decks', opts.deckName);
    await mkdir(slidesDirectory, { recursive: true });
  }

  const runStore = createRunStore();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/js', express.static(join(PACKAGE_ROOT, 'src', 'editor', 'js'), {
    etag: false, lastModified: false,
    setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); },
  }));
  app.use('/asset', express.static(join(PACKAGE_ROOT, 'asset')));

  const editorHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'editor.html');
  const browserHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'browser.html');

  function broadcastRunsSnapshot() {
    broadcastSSE('runsSnapshot', {
      runs: runStore.listRuns(),
      activeRuns: runStore.listActiveRuns(),
    });
  }

  app.get('/', async (_req, res) => {
    try {
      const targetPath = opts.browseMode ? browserHtmlPath : editorHtmlPath;
      const html = await readFile(targetPath, 'utf-8');
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send(`Failed to load page: ${err.message}`);
    }
  });

  app.get('/editor', async (_req, res) => {
    try {
      const html = await readFile(editorHtmlPath, 'utf-8');
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send(`Failed to load editor: ${err.message}`);
    }
  });

  app.get('/slides/:file', async (req, res) => {
    let file;
    try {
      file = normalizeSlideFilename(req.params.file, 'slide filename');
    } catch {
      return res.status(400).send('Invalid slide filename');
    }

    const filePath = join(slidesDirectory, file);
    try {
      const html = await readFile(filePath, 'utf-8');
      res.type('html').send(html);
    } catch {
      res.status(404).send(`Slide not found: ${file}`);
    }
  });

  app.get('/api/editor-config', async (_req, res) => {
    // If slides already exist in the directory, override createMode to false
    let effectiveCreateMode = opts.createMode;
    if (effectiveCreateMode && slidesDirectory) {
      try {
        const existing = await listSlideFiles(slidesDirectory);
        if (existing.length > 0) effectiveCreateMode = false;
      } catch { /* directory may not exist yet */ }
    }
    res.json({
      createMode: effectiveCreateMode,
      browseMode: opts.browseMode || false,
      deckName: opts.deckName || (slidesDirectory ? basename(slidesDirectory) : ''),
      slidesDir: slidesDirectory ? toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory) : '',
      importFile: opts.importFile || null,
      importSlideCount: opts.importSlideCount || null,
      importResearch: opts.importResearch || false,
    });
  });

  app.get('/api/slides', async (_req, res) => {
    try {
      if (!slidesDirectory) {
        return res.json([]);
      }
      const files = await listSlideFiles(slidesDirectory);
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Deck browser APIs ──

  app.get('/api/decks', async (_req, res) => {
    try {
      const decksRoot = resolve(process.cwd(), 'decks');
      let entries;
      try {
        entries = await readdir(decksRoot, { withFileTypes: true });
      } catch {
        return res.json([]);
      }
      const decks = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const deckPath = join(decksRoot, entry.name);
        try {
          const slideFiles = await listSlideFiles(deckPath);
          const deckStat = await stat(deckPath);
          let hasOutline = false;
          try { await stat(join(deckPath, 'slide-outline.md')); hasOutline = true; } catch { /* no outline */ }
          decks.push({
            name: entry.name,
            slideCount: slideFiles.length,
            lastModified: deckStat.mtime.toISOString(),
            hasOutline,
            firstSlide: slideFiles[0] || null,
          });
        } catch { /* skip unreadable dirs */ }
      }
      decks.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      res.json(decks);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/decks/new', (_req, res) => {
    if (watcher) { try { watcher.close(); } catch { /* ignore */ } watcher = null; }
    slidesDirectory = null;
    opts.deckName = '';
    opts.createMode = true;
    res.json({ ok: true });
  });

  app.post('/api/decks/switch', async (req, res) => {
    const { deckName } = req.body ?? {};
    if (typeof deckName !== 'string' || !deckName.trim()) {
      return res.status(400).json({ error: 'Missing deckName.' });
    }
    const sanitized = deckName.trim();
    const newDir = resolve(process.cwd(), 'decks', sanitized);
    try {
      await stat(newDir);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    slidesDirectory = newDir;
    opts.deckName = sanitized;
    opts.createMode = false;
    setupFileWatcher(slidesDirectory);
    res.json({
      deckName: sanitized,
      slidesDir: toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory),
    });
  });

  app.get('/api/decks/:name/thumbnail', async (req, res) => {
    const deckName = req.params.name;
    const deckPath = resolve(process.cwd(), 'decks', deckName);
    try {
      await stat(deckPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    try {
      const slideFiles = await listSlideFiles(deckPath);
      if (slideFiles.length === 0) {
        return res.status(404).json({ error: 'No slides in deck.' });
      }
      const firstSlide = slideFiles[0];
      const thumbPath = join(deckPath, '.thumb.png');

      // Check cache: thumb exists and is newer than first slide
      let useCache = false;
      try {
        const thumbStat = await stat(thumbPath);
        const slideStat = await stat(join(deckPath, firstSlide));
        if (thumbStat.mtime >= slideStat.mtime) useCache = true;
      } catch { /* no cache */ }

      if (useCache) {
        const thumbBuf = await readFile(thumbPath);
        res.type('image/png').send(thumbBuf);
        return;
      }

      // Generate thumbnail using file:// URL (no race condition with slidesDirectory)
      const tmpPath = await mkdtemp(join(tmpdir(), 'thumb-'));
      const screenshotPath = join(tmpPath, 'thumb.png');

      await withScreenshotPage(async (page) => {
        await screenshotMod.captureSlideScreenshot(
          page, firstSlide, screenshotPath, deckPath, { useHttp: false },
        );
      });

      const thumbBuf = await readFile(screenshotPath);
      // Cache to deck folder
      try { await writeFile(thumbPath, thumbBuf); } catch { /* ignore cache write failure */ }
      // Clean up temp
      try { await rm(tmpPath, { recursive: true }); } catch { /* ignore */ }

      res.type('image/png').send(thumbBuf);
    } catch (err) {
      res.status(500).json({ error: `Thumbnail generation failed: ${err.message}` });
    }
  });

  // ── Deck rename ──
  app.patch('/api/decks/:name/rename', async (req, res) => {
    const oldName = basename(req.params.name);
    const { newName: rawNewName } = req.body ?? {};
    if (typeof rawNewName !== 'string' || !rawNewName.trim()) {
      return res.status(400).json({ error: 'Missing newName.' });
    }
    const sanitized = rawNewName.trim().replace(/[<>:"/\\|?*]/g, '-');
    if (!sanitized) {
      return res.status(400).json({ error: 'Invalid name after sanitization.' });
    }
    const decksRoot = resolve(process.cwd(), 'decks');
    const oldPath = resolve(decksRoot, oldName);
    const newPath = resolve(decksRoot, sanitized);
    try {
      await stat(oldPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    if (oldPath === newPath) {
      return res.json({ ok: true, oldName, newName: sanitized });
    }
    try {
      await stat(newPath);
      return res.status(409).json({ error: 'A deck with that name already exists.' });
    } catch { /* good — no conflict */ }
    try {
      // Delete cached thumbnail
      await unlink(join(oldPath, '.thumb.png')).catch(() => {});
      await rename(oldPath, newPath);
      // Update server state if this was the active deck
      if (slidesDirectory && resolve(slidesDirectory) === oldPath) {
        slidesDirectory = newPath;
        opts.deckName = sanitized;
        setupFileWatcher(slidesDirectory);
      }
      res.json({ ok: true, oldName, newName: sanitized });
    } catch (err) {
      res.status(500).json({ error: `Rename failed: ${err.message}` });
    }
  });

  // ── Deck duplicate ──
  app.post('/api/decks/:name/duplicate', async (req, res) => {
    const srcName = basename(req.params.name);
    const decksRoot = resolve(process.cwd(), 'decks');
    const srcPath = resolve(decksRoot, srcName);
    try {
      await stat(srcPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    // Find unique name: "name-copy", "name-copy-2", ...
    let copyName = `${srcName}-copy`;
    let copyPath = resolve(decksRoot, copyName);
    let suffix = 2;
    while (true) {
      try { await stat(copyPath); } catch { break; }
      copyName = `${srcName}-copy-${suffix++}`;
      copyPath = resolve(decksRoot, copyName);
    }
    try {
      await mkdir(copyPath, { recursive: true });
      const entries = await readdir(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue;
        await copyFile(join(srcPath, entry.name), join(copyPath, entry.name));
      }
      res.json({ ok: true, name: copyName });
    } catch (err) {
      res.status(500).json({ error: `Duplicate failed: ${err.message}` });
    }
  });

  // ── Deck delete ──
  app.delete('/api/decks/:name', async (req, res) => {
    const deckName = basename(req.params.name);
    const decksRoot = resolve(process.cwd(), 'decks');
    const deckPath = resolve(decksRoot, deckName);
    if (!deckPath.startsWith(decksRoot)) {
      return res.status(400).json({ error: 'Invalid deck name.' });
    }
    try {
      await stat(deckPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    try {
      // Close file watcher BEFORE deleting to avoid EPERM on Windows
      const isActive = slidesDirectory && resolve(slidesDirectory) === deckPath;
      if (isActive) {
        if (watcher) { try { watcher.close(); } catch { /* ignore */ } watcher = null; }
      }
      await rm(deckPath, { recursive: true, force: true });
      if (isActive) {
        slidesDirectory = null;
        opts.deckName = '';
        opts.createMode = true;
      }
      res.json({ ok: true, deleted: deckName });
    } catch (err) {
      res.status(500).json({ error: `Delete failed: ${err.message}` });
    }
  });

  app.post('/api/slides/:file/save', async (req, res) => {
    let file;
    try {
      file = normalizeSlideFilename(req.params.file, '`slide`');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const bodySlide = req.body?.slide;
    if (bodySlide !== undefined) {
      let normalizedBodySlide;
      try {
        normalizedBodySlide = normalizeSlideFilename(bodySlide, '`slide`');
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      if (normalizedBodySlide !== file) {
        return res.status(400).json({ error: '`slide` does not match the requested file.' });
      }
    }

    let html;
    try {
      html = normalizeSlideHtml(req.body?.html);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const filePath = join(slidesDirectory, file);
    try {
      await readFile(filePath, 'utf-8');
    } catch {
      return res.status(404).json({ error: `Slide not found: ${file}` });
    }

    try {
      await writeFile(filePath, html, 'utf8');
      return res.json({
        success: true,
        slide: file,
        bytes: Buffer.byteLength(html, 'utf8'),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to save ${file}: ${error.message}`,
      });
    }
  });

  app.get('/api/models', (_req, res) => {
    res.json({
      models: ALL_MODELS,
      defaultModel: DEFAULT_CODEX_MODEL,
    });
  });

  app.get('/api/runs', (_req, res) => {
    res.json({
      runs: runStore.listRuns(100),
      activeRuns: runStore.listActiveRuns(),
    });
  });

  app.get('/api/runs/:runId/log', (req, res) => {
    const log = runStore.getRunLog(req.params.runId);
    if (log === null) {
      return res.status(404).send('Run not found');
    }

    res.type('text/plain').send(log);
  });

  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: connected\ndata: {}\n\n');

    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));

    const snapshotPayload = {
      runs: runStore.listRuns(),
      activeRuns: runStore.listActiveRuns(),
    };
    res.write(`event: runsSnapshot\ndata: ${JSON.stringify(snapshotPayload)}\n\n`);
  });

  app.post('/api/apply', async (req, res) => {
    const { slide, prompt, selections, model } = req.body ?? {};

    if (!slide || typeof slide !== 'string' || !SLIDE_FILE_PATTERN.test(slide)) {
      return res.status(400).json({ error: 'Missing or invalid `slide`.' });
    }

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid `prompt`.' });
    }

    let selectedModel;
    try {
      selectedModel = normalizeModel(model);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (runStore.hasActiveRunForSlide(slide)) {
      return res.status(409).json({
        error: `Slide ${slide} already has an active run.`,
        runId: runStore.getActiveRunId(slide),
      });
    }

    let normalizedSelections;
    try {
      normalizedSelections = normalizeSelections(selections);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const runId = randomRunId();

    const runSummary = runStore.startRun({
      runId,
      slide,
      prompt: prompt.trim(),
      selectionsCount: normalizedSelections.length,
      model: selectedModel,
    });

    broadcastSSE('applyStarted', {
      runId,
      slide,
      model: selectedModel,
      selectionsCount: normalizedSelections.length,
      selectionBoxes: normalizedSelections.map((selection) => selection.bbox),
    });
    broadcastRunsSnapshot();

    const tmpPath = await mkdtemp(join(tmpdir(), 'editor-codex-'));
    const screenshotPath = join(tmpPath, 'slide.png');
    const annotatedPath = join(tmpPath, 'slide-annotated.png');

    try {
      await withScreenshotPage(async (page) => {
        await screenshotMod.captureSlideScreenshot(
          page,
          slide,
          screenshotPath,
          `http://localhost:${opts.port}/slides`,
          { useHttp: true },
        );
      });

      const scaledBoxes = normalizedSelections.map((selection) =>
        scaleSelectionToScreenshot(
          selection.bbox,
          SLIDE_SIZE,
          screenshotMod.SCREENSHOT_SIZE,
        ),
      );

      await writeAnnotatedScreenshot(screenshotPath, annotatedPath, scaledBoxes);

      const codexPrompt = buildCodexEditPrompt({
        slideFile: slide,
        slidePath: toSlidePathLabel(slidesDirectory, slide),
        userPrompt: prompt,
        selections: normalizedSelections,
      });

      const usesClaude = isClaudeModel(selectedModel);
      const spawnEdit = usesClaude ? spawnClaudeEdit : spawnCodexEdit;
      const result = await spawnEdit({
        prompt: codexPrompt,
        imagePath: annotatedPath,
        model: selectedModel,
        cwd: process.cwd(),
        onLog: (stream, chunk) => {
          runStore.appendLog(runId, chunk);
          broadcastSSE('applyLog', { runId, slide, stream, chunk });
        },
      });

      const engineLabel = isClaudeModel(selectedModel) ? 'Claude' : 'Codex';
      const success = result.code === 0;
      const message = success
        ? `${engineLabel} edit completed.`
        : `${engineLabel} exited with code ${result.code}.`;

      runStore.finishRun(runId, {
        status: success ? 'success' : 'failed',
        code: result.code,
        message,
      });

      broadcastSSE('applyFinished', {
        runId,
        slide,
        model: selectedModel,
        success,
        code: result.code,
        message,
      });
      broadcastRunsSnapshot();

      res.json({
        ...runSummary,
        success,
        runId,
        model: selectedModel,
        code: result.code,
        message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      runStore.finishRun(runId, {
        status: 'failed',
        code: -1,
        message,
      });

      broadcastSSE('applyFinished', {
        runId,
        slide,
        model: selectedModel,
        success: false,
        code: -1,
        message,
      });
      broadcastRunsSnapshot();

      res.status(500).json({
        success: false,
        runId,
        error: message,
      });
    } finally {
      runStore.clearActiveRun(slide, runId);
      await rm(tmpPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  // ── GET /api/templates ──────────────────────────────────────────────
  app.get('/api/templates', (_req, res) => {
    try {
      const templates = listTemplates();
      res.json(templates);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/outline — Load existing outline ───────────────────────
  app.get('/api/outline', async (_req, res) => {
    if (!slidesDirectory) {
      return res.status(404).json({ error: 'No slides directory set.' });
    }
    const outlinePath = join(slidesDirectory, 'slide-outline.md');
    try {
      const content = await readFile(outlinePath, 'utf-8');
      const outline = parseOutline(content, basename(slidesDirectory));
      res.json(outline);
    } catch {
      res.status(404).json({ error: 'No slide-outline.md found.' });
    }
  });

  // ── PUT /api/outline — Save edited outline ──────────────────────────
  app.put('/api/outline', async (req, res) => {
    if (!slidesDirectory) {
      return res.status(404).json({ error: 'No slides directory set.' });
    }
    const { content } = req.body ?? {};
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing `content` string.' });
    }
    const outlinePath = join(slidesDirectory, 'slide-outline.md');
    try {
      await writeFile(outlinePath, content, 'utf-8');
      const outline = parseOutline(content, basename(slidesDirectory));
      res.json(outline);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/import-md — Import freeform MD and convert to outline ─
  // ── GET /api/import-file — Serve import file content for CLI mode ──
  app.get('/api/import-file', async (_req, res) => {
    if (!opts.importFile) {
      return res.status(404).json({ error: 'No import file specified.' });
    }
    try {
      const absPath = resolve(process.cwd(), opts.importFile);
      let raw = await readFile(absPath, 'utf-8');
      // Strip UTF-8 BOM if present
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      res.json({ content: raw, fileName: basename(absPath) });
    } catch (err) {
      res.status(404).json({ error: `Cannot read import file: ${err.message}` });
    }
  });

  // ── POST /api/import-md — Convert freeform MD to slide outline ─────
  const generateRunStore = createRunStore();
  let activeGenerate = false;

  app.post('/api/import-md', async (req, res) => {
    const { content: mdContent, filePath, model, slideCount, researchMode } = req.body ?? {};

    // Read MD content from body or file
    let rawMd = '';
    if (typeof mdContent === 'string' && mdContent.trim()) {
      rawMd = mdContent;
    } else if (typeof filePath === 'string' && filePath.trim()) {
      try {
        const absPath = resolve(process.cwd(), filePath.trim());
        rawMd = await readFile(absPath, 'utf-8');
        if (rawMd.charCodeAt(0) === 0xFEFF) rawMd = rawMd.slice(1);
      } catch (err) {
        return res.status(400).json({ error: `Cannot read file: ${err.message}` });
      }
    } else {
      return res.status(400).json({ error: 'Provide `content` or `filePath`.' });
    }

    if (!rawMd.trim()) {
      return res.status(400).json({ error: 'Markdown content is empty.' });
    }
    if (rawMd.length > 500_000) {
      return res.status(400).json({ error: 'Content too large (max 500KB).' });
    }

    if (activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim()
      : CLAUDE_MODELS[0];

    const runId = randomRunId();
    activeGenerate = true;

    broadcastSSE('planStarted', { runId, topic: '(MD Import)' });
    broadcastSSE('progress', { runId, phase: 'plan', step: 'Converting markdown to slide outline' });
    res.json({ runId, topic: '(MD Import)', model: selectedModel });

    (async () => {
      try {
        const slideCountLabel = typeof slideCount === 'string' && slideCount.trim()
          ? slideCount.trim()
          : '';
        const useResearch = researchMode === 'research';

        const promptLines = [
          '아래 마크다운 문서를 분석하여 프레젠테이션 아웃라인으로 변환하세요.',
          '',
          '--- 원본 마크다운 ---',
          rawMd,
          '--- 원본 마크다운 끝 ---',
          '',
          '분석 규칙:',
          '1. 문서에 슬라이드 구분(### 슬라이드 N, ## Slide N 등)이 있으면 그 구조를 그대로 따르세요.',
          '2. 슬라이드 구분이 없으면 내용을 분석하여 논리적 단위로 슬라이드를 구성하세요.',
          '3. **구성:** 섹션이 있으면 슬라이드의 시각적 내용으로 사용하세요.',
          '4. **발표 내용:** 섹션이 있으면 presenter-note로 보존하세요.',
          '5. 각 슬라이드에 가장 적합한 type을 배정하세요.',
        ];

        if (useResearch) {
          promptLines.push('6. 웹 리서치를 추가로 수행하여 내용을 보강하세요. 최신 데이터, 통계, 사례를 추가할 수 있습니다.');
        } else {
          promptLines.push('6. 원본 마크다운의 내용만 사용하세요. 추가 리서치는 하지 마세요.');
        }

        if (slideCountLabel) {
          promptLines.push(`7. 목표 슬라이드 수: ${slideCountLabel}장`);
        }

        promptLines.push('');
        promptLines.push('다음을 수행하세요:');
        promptLines.push('');
        promptLines.push('1. 주제에서 핵심 키워드 2~3개를 뽑아 영어 소문자 kebab-case 폴더명을 결정하세요.');
        promptLines.push('   예: "AX 전환 발표" → ax-transformation');
        promptLines.push('');
        promptLines.push('2. 해당 폴더에 slide-outline.md를 생성하세요. (HTML 슬라이드는 생성하지 마세요)');
        promptLines.push('   mkdir -p decks/<name> && 아웃라인 파일만 작성');
        promptLines.push('');
        promptLines.push('아웃라인 형식:');
        promptLines.push('```');
        promptLines.push('# 발표 제목');
        promptLines.push('');
        promptLines.push('## Meta');
        promptLines.push('- deck-name: <kebab-case-name>');
        promptLines.push('- slide-count: N');
        promptLines.push('');
        promptLines.push('## Slides');
        promptLines.push('### Slide 1');
        promptLines.push('- type: cover');
        promptLines.push('- title: 제목');
        promptLines.push('- content: 부제 또는 설명');
        promptLines.push('- presenter-note: 발표 내용 (있는 경우)');
        promptLines.push('');
        promptLines.push('### Slide 2');
        promptLines.push('- type: contents');
        promptLines.push('- title: 목차');
        promptLines.push('- content: 목차 항목들');
        promptLines.push('...');
        promptLines.push('```');
        promptLines.push('');
        promptLines.push('type은 다음 중 하나: cover, contents, section-divider, content, two-columns, split-layout, image-text, image-description, chart, statistics, key-metrics, timeline, funnel, matrix, quote, quotes-grid, highlight, principles, diagram, team, simple-list, big-metric, closing');
        promptLines.push('');
        promptLines.push('중요: slide-outline.md 파일만 생성하세요. HTML 파일은 생성하지 마세요.');

        const fullPrompt = promptLines.join('\n');

        broadcastSSE('progress', { runId, phase: 'plan', step: 'Converting with AI' });

        const result = await spawnClaudeEdit({
          prompt: fullPrompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            broadcastSSE('planLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;

        let outline = null;
        let detectedDeckName = '';

        if (success) {
          broadcastSSE('progress', { runId, phase: 'plan', step: 'Parsing generated outline' });
        }

        if (success) {
          try {
            const decksRoot = resolve(process.cwd(), 'decks');
            const dirs = await readdir(decksRoot, { withFileTypes: true });
            let bestDir = '';
            let bestMtime = 0;

            for (const d of dirs) {
              if (!d.isDirectory()) continue;
              const outlinePath = join(decksRoot, d.name, 'slide-outline.md');
              try {
                const s = await stat(outlinePath);
                if (s.mtimeMs > bestMtime) {
                  bestMtime = s.mtimeMs;
                  bestDir = d.name;
                }
              } catch { /* no outline */ }
            }

            if (bestDir) {
              detectedDeckName = bestDir;
              const outlinePath = join(decksRoot, bestDir, 'slide-outline.md');
              const outlineContent = await readFile(outlinePath, 'utf-8');
              outline = parseOutline(outlineContent, bestDir);

              slidesDirectory = join(decksRoot, bestDir);
              setupFileWatcher(slidesDirectory);
            }
          } catch (err) {
            console.error('Failed to parse imported outline:', err);
          }
        }

        broadcastSSE('planFinished', {
          runId,
          success,
          message: success ? 'Outline ready.' : `Import failed (exit code ${result.code}).`,
          outline,
          deckName: detectedDeckName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastSSE('planFinished', { runId, success: false, message, outline: null });
      } finally {
        activeGenerate = false;
      }
    })();
  });

  // ── POST /api/plan — Outline Planning ─────────────────────────────

  app.post('/api/plan', async (req, res) => {
    const { topic, requirements, model, slideCount: slideCountRange } = req.body ?? {};

    if (typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid `topic`.' });
    }

    if (activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim()
      : CLAUDE_MODELS[0];

    const runId = randomRunId();
    activeGenerate = true;

    broadcastSSE('planStarted', { runId, topic: topic.trim() });
    broadcastSSE('progress', { runId, phase: 'plan', step: 'Analyzing topic and structuring outline' });
    res.json({ runId, topic: topic.trim(), model: selectedModel });

    (async () => {
      try {
        const countLabel = typeof slideCountRange === 'string' && slideCountRange.trim()
          ? slideCountRange.trim()
          : '8~12';

        const promptLines = [
          `주제: ${topic.trim()}`,
        ];
        if (typeof requirements === 'string' && requirements.trim()) {
          promptLines.push(`요구사항: ${requirements.trim()}`);
        }
        promptLines.push(`슬라이드 수: ${countLabel}장`);
        promptLines.push('');
        promptLines.push('다음을 수행하세요:');
        promptLines.push('');
        promptLines.push('1. 주제에서 핵심 키워드 2~3개를 뽑아 영어 소문자 kebab-case 폴더명을 결정하세요.');
        promptLines.push('   예: "인공지능 트렌드 2025" → ai-trends-2025');
        promptLines.push('');
        promptLines.push('2. 해당 폴더에 slide-outline.md를 생성하세요. (HTML 슬라이드는 생성하지 마세요)');
        promptLines.push('   mkdir -p decks/<name> && 아웃라인 파일만 작성');
        promptLines.push('');
        promptLines.push('아웃라인 형식:');
        promptLines.push('```');
        promptLines.push('# 발표 제목');
        promptLines.push('');
        promptLines.push('## Meta');
        promptLines.push('- deck-name: <kebab-case-name>');
        promptLines.push('- slide-count: N');
        promptLines.push('');
        promptLines.push('## Slides');
        promptLines.push('### Slide 1');
        promptLines.push('- type: cover');
        promptLines.push('- title: 제목');
        promptLines.push('- content: 부제 또는 설명');
        promptLines.push('');
        promptLines.push('### Slide 2');
        promptLines.push('- type: contents');
        promptLines.push('- title: 목차');
        promptLines.push('- content: 목차 항목들');
        promptLines.push('...');
        promptLines.push('```');
        promptLines.push('');
        promptLines.push('type은 다음 중 하나: cover, contents, section-divider, content, two-columns, split-layout, image-text, image-description, chart, statistics, key-metrics, timeline, funnel, matrix, quote, quotes-grid, highlight, principles, diagram, team, simple-list, big-metric, closing');
        promptLines.push('');
        promptLines.push('중요: slide-outline.md 파일만 생성하세요. HTML 파일은 생성하지 마세요.');

        const fullPrompt = promptLines.join('\n');

        broadcastSSE('progress', { runId, phase: 'plan', step: 'Generating outline with AI' });

        const result = await spawnClaudeEdit({
          prompt: fullPrompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            broadcastSSE('planLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;

        let outline = null;
        let detectedDeckName = '';

        if (success) {
          broadcastSSE('progress', { runId, phase: 'plan', step: 'Parsing generated outline' });
        }

        if (success) {
          try {
            const decksRoot = resolve(process.cwd(), 'decks');
            const dirs = await readdir(decksRoot, { withFileTypes: true });
            let bestDir = '';
            let bestMtime = 0;

            for (const d of dirs) {
              if (!d.isDirectory()) continue;
              const outlinePath = join(decksRoot, d.name, 'slide-outline.md');
              try {
                const s = await stat(outlinePath);
                if (s.mtimeMs > bestMtime) {
                  bestMtime = s.mtimeMs;
                  bestDir = d.name;
                }
              } catch { /* no outline */ }
            }

            if (bestDir) {
              detectedDeckName = bestDir;
              const outlinePath = join(decksRoot, bestDir, 'slide-outline.md');
              const content = await readFile(outlinePath, 'utf-8');
              outline = parseOutline(content, bestDir);

              slidesDirectory = join(decksRoot, bestDir);
              setupFileWatcher(slidesDirectory);
            }
          } catch (err) {
            console.error('Failed to parse outline:', err);
          }
        }

        broadcastSSE('planFinished', {
          runId,
          success,
          message: success ? 'Outline ready.' : `Plan failed (exit code ${result.code}).`,
          outline,
          deckName: detectedDeckName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastSSE('planFinished', { runId, success: false, message, outline: null });
      } finally {
        activeGenerate = false;
      }
    })();
  });

  // ── POST /api/plan/revise — Revise outline with feedback ──────────
  app.post('/api/plan/revise', async (req, res) => {
    const { feedback, deckName, targetSlide } = req.body ?? {};

    if (typeof feedback !== 'string' || feedback.trim() === '') {
      return res.status(400).json({ error: 'Missing feedback.' });
    }

    if (activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    if (!slidesDirectory) {
      return res.status(400).json({ error: 'No outline to revise.' });
    }

    const selectedModel = CLAUDE_MODELS[0];
    const runId = randomRunId();
    activeGenerate = true;

    const targetLabel = typeof targetSlide === 'number'
      ? `Revise Slide ${targetSlide}: ${feedback.trim().slice(0, 40)}`
      : `Revise: ${feedback.trim().slice(0, 50)}`;
    broadcastSSE('planStarted', { runId, topic: targetLabel });
    broadcastSSE('progress', { runId, phase: 'revise', step: 'Applying revision feedback' });
    res.json({ runId });

    (async () => {
      try {
        const outlinePath = join(slidesDirectory, 'slide-outline.md');

        const promptLines = [
          '현재 아웃라인 파일을 수정 요청에 따라 업데이트하세요.',
          '',
          `파일 경로: ${outlinePath}`,
          '',
        ];

        if (typeof targetSlide === 'number') {
          promptLines.push(`대상: Slide ${targetSlide}만 수정하세요. 다른 슬라이드는 변경하지 마세요.`);
          promptLines.push('');
        }

        promptLines.push('수정 요청:');
        promptLines.push(feedback.trim());
        promptLines.push('');
        promptLines.push('규칙:');
        promptLines.push('- slide-outline.md 파일만 수정하세요');
        promptLines.push('- HTML 파일은 생성하지 마세요');
        promptLines.push('- 기존 아웃라인 형식을 유지하세요');

        const fullPrompt = promptLines.join('\n');

        const result = await spawnClaudeEdit({
          prompt: fullPrompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            broadcastSSE('planLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;

        let outline = null;
        if (success) {
          try {
            const content = await readFile(outlinePath, 'utf-8');
            outline = parseOutline(content, deckName || basename(slidesDirectory));
          } catch (err) {
            console.error('Failed to parse revised outline:', err);
          }
        }

        broadcastSSE('planFinished', {
          runId,
          success,
          message: success ? 'Outline revised.' : `Revision failed (exit code ${result.code}).`,
          outline,
          deckName: deckName || basename(slidesDirectory),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastSSE('planFinished', { runId, success: false, message, outline: null });
      } finally {
        activeGenerate = false;
      }
    })();
  });

  // ── POST /api/generate — Creation Mode ────────────────────────────

  app.post('/api/generate', async (req, res) => {
    const { topic, requirements, model, deckName, slideCount: slideCountRange, fromOutline } = req.body ?? {};

    if (!fromOutline && (typeof topic !== 'string' || topic.trim() === '')) {
      return res.status(400).json({ error: 'Missing or invalid `topic`.' });
    }

    if (activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    // Rename deck directory if user changed the name in outline review (new decks only)
    if (fromOutline && slidesDirectory && typeof deckName === 'string' && deckName.trim()) {
      const existingSlides = await listSlideFiles(slidesDirectory).catch(() => []);
      if (existingSlides.length === 0) {
        const currentName = basename(slidesDirectory);
        const newName = deckName.trim().replace(/[<>:"/\\|?*]/g, '-');
        if (newName !== currentName) {
          const newPath = resolve(dirname(slidesDirectory), newName);
          try {
            await rename(slidesDirectory, newPath);
            slidesDirectory = newPath;
            setupFileWatcher(slidesDirectory);
          } catch (err) {
            console.error('Failed to rename deck directory:', err);
          }
        }
      }
    }

    // In create mode without a pre-set directory, resolve one now if deckName given
    if (!slidesDirectory) {
      if (typeof deckName === 'string' && deckName.trim()) {
        const folderName = deckName.trim().replace(/[<>:"/\\|?*]/g, '-');
        slidesDirectory = resolve(process.cwd(), 'decks', folderName);
        await mkdir(slidesDirectory, { recursive: true });
        setupFileWatcher(slidesDirectory);
      }
      // else: Claude will create the folder — we detect it after generation
    }

    // Only allow Claude models for generation
    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim()
      : CLAUDE_MODELS[0];

    const runId = randomRunId();
    activeGenerate = true;

    generateRunStore.startRun({
      runId,
      slide: '__generate__',
      prompt: (topic || '').trim(),
      selectionsCount: 0,
      model: selectedModel,
    });

    const resolvedDeckPath = slidesDirectory
      ? toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory)
      : '';
    broadcastSSE('generateStarted', { runId, topic: (topic || '').trim(), deckPath: resolvedDeckPath });
    broadcastSSE('progress', { runId, phase: 'generate', step: 'Preparing slide templates' });

    res.json({ runId, topic: (topic || '').trim(), model: selectedModel, deckPath: resolvedDeckPath });

    // Run Claude subprocess in background
    (async () => {
      try {
        const slidesDir = resolvedDeckPath;

        let fullPrompt;

        if (fromOutline && slidesDirectory) {
          // Back up existing slides before regeneration
          try {
            const backupPath = await backupSlides(slidesDirectory);
            if (backupPath) {
              broadcastSSE('progress', { runId, phase: 'generate', step: 'Backed up existing slides' });
            }
          } catch (err) {
            console.error('Slide backup failed:', err);
          }

          // Generate from approved outline — skip outline creation
          const outlinePath = join(slidesDirectory, 'slide-outline.md');
          let outlineContent = '';
          try {
            outlineContent = await readFile(outlinePath, 'utf-8');
          } catch { /* no outline file */ }

          const promptLines = [
            `작업 디렉토리: ${slidesDir}`,
            '',
            '아래 승인된 아웃라인 기반으로 HTML 슬라이드를 새로 생성하세요.',
            '기존 슬라이드는 백업 후 삭제되었으므로, 모든 슬라이드를 빠짐없이 새로 만들어야 합니다.',
            '',
            '--- 아웃라인 ---',
            outlineContent,
            '--- 아웃라인 끝 ---',
            '',
            '다음 단계를 순서대로 수행하세요:',
            '',
            '1. 템플릿 기반으로 slide-01.html ~ slide-NN.html을 생성하세요.',
            '   - 크기: 720pt x 405pt (body width/height)',
            '   - 폰트: Pretendard CDN (link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css")',
            '   - 텍스트는 p, h1-h6, ul, ol, li 태그만 사용',
            '   - slides-grab show-template <name> 으로 템플릿 확인 후 활용',
            '   - backup/ 폴더는 절대 수정하지 마세요 (이전 슬라이드 백업)',
            '   - 각 슬라이드는 독립적인 완전한 HTML 파일이어야 합니다',
            '',
            '2. 승인 대기 없이 전체 슬라이드를 한번에 생성하세요.',
            '',
            `3. 완료 후: node scripts/build-viewer.js --slides-dir ${slidesDir}`,
          ];
          fullPrompt = promptLines.join('\n');
        } else {
          // Original flow — generate outline + slides together
          const countLabel = typeof slideCountRange === 'string' && slideCountRange.trim()
            ? slideCountRange.trim()
            : '8~12';

          const hasDeckDir = !!slidesDir;
          const promptLines = [
            `주제: ${(topic || '').trim()}`,
          ];
          if (typeof requirements === 'string' && requirements.trim()) {
            promptLines.push(`요구사항: ${requirements.trim()}`);
          }
          promptLines.push(`슬라이드 수: ${countLabel}장`);

          if (hasDeckDir) {
            promptLines.push(`작업 디렉토리: ${slidesDir}`);
          }

          promptLines.push(
            '',
            '다음 단계를 순서대로 수행하세요:',
            '',
          );

          let stepNum = 1;

          if (!hasDeckDir) {
            promptLines.push(
              `${stepNum}. 주제에서 핵심 키워드 2~3개를 뽑아 영어 소문자 kebab-case 폴더명을 결정하세요.`,
              '   예: "인공지능 트렌드 2025" → decks/ai-trends-2025',
              '   예: "스타트업 투자 전략" → decks/startup-investment-strategy',
              '   mkdir -p decks/<name> 으로 폴더를 생성하세요.',
            );
            stepNum += 1;
          }

          const dirRef = hasDeckDir ? slidesDir : 'decks/<name>';
          promptLines.push(
            `${stepNum}. ${dirRef}/slide-outline.md 아웃라인을 생성하세요.`,
          );
          stepNum += 1;

          promptLines.push(
            `${stepNum}. 템플릿 기반으로 slide-01.html ~ slide-NN.html을 ${countLabel}장 생성하세요.`,
            '   - 크기: 720pt x 405pt (body width/height)',
            '   - 폰트: Pretendard CDN (link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css")',
            '   - 텍스트는 p, h1-h6, ul, ol, li 태그만 사용',
            '   - slides-grab show-template <name> 으로 템플릿 확인 후 활용',
            '   - 각 슬라이드는 독립적인 완전한 HTML 파일이어야 합니다',
          );
          stepNum += 1;

          promptLines.push(
            `${stepNum}. 승인 대기 없이 전체 슬라이드를 한번에 생성하세요.`,
          );
          stepNum += 1;

          promptLines.push(
            `${stepNum}. 완료 후: node scripts/build-viewer.js --slides-dir ${dirRef}`,
          );

          fullPrompt = promptLines.join('\n');
        }

        broadcastSSE('progress', { runId, phase: 'generate', step: 'Building slides with AI' });

        const result = await spawnClaudeEdit({
          prompt: fullPrompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            generateRunStore.appendLog(runId, chunk);
            broadcastSSE('generateLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;

        if (success) {
          broadcastSSE('progress', { runId, phase: 'generate', step: 'Finalizing slides' });
        }

        // If slidesDirectory is still unset, detect the folder Claude created
        if (!slidesDirectory && success) {
          try {
            const decksRoot = resolve(process.cwd(), 'decks');
            const dirs = await readdir(decksRoot, { withFileTypes: true });
            let bestDir = '';
            let bestMtime = 0;
            for (const d of dirs) {
              if (!d.isDirectory()) continue;
              const dirPath = join(decksRoot, d.name);
              try {
                const files = await listSlideFiles(dirPath);
                if (files.length > 0) {
                  const dirStat = await stat(dirPath);
                  if (dirStat.mtimeMs > bestMtime) {
                    bestMtime = dirStat.mtimeMs;
                    bestDir = dirPath;
                  }
                }
              } catch { /* skip */ }
            }
            if (bestDir) {
              slidesDirectory = bestDir;
              setupFileWatcher(slidesDirectory);
            }
          } catch { /* ignore */ }
        }

        let slideCount = 0;
        try {
          if (slidesDirectory) {
            const files = await listSlideFiles(slidesDirectory);
            slideCount = files.length;
          }
        } catch { /* ignore */ }

        const resolvedPath = slidesDirectory
          ? toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory)
          : '';
        const message = success
          ? `${slideCount} slides generated.`
          : `Generation failed (exit code ${result.code}).`;

        generateRunStore.finishRun(runId, {
          status: success ? 'success' : 'failed',
          code: result.code,
          message,
        });

        broadcastSSE('generateFinished', { runId, success, message, slideCount, deckPath: resolvedPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        generateRunStore.finishRun(runId, {
          status: 'failed',
          code: -1,
          message,
        });
        broadcastSSE('generateFinished', { runId, success: false, message, slideCount: 0 });
      } finally {
        activeGenerate = false;
      }
    })();
  });

  // ── SVG / PNG Export ────────────────────────────────────────────────
  let activeSvgExport = false;
  const svgExportFiles = new Map(); // exportId -> Map<filename, Buffer|string>
  const svgExportZips = new Map();  // exportId -> Buffer (in-memory ZIP)

  app.post('/api/svg-export', async (req, res) => {
    const { scope, slide, format = 'svg', scale = 1, width = 1280, height = 720, outline = false } = req.body ?? {};

    if (!['svg', 'png'].includes(format)) {
      return res.status(400).json({ error: 'format must be svg or png' });
    }
    if (!['current', 'all'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be current or all' });
    }
    const numScale = Number(scale) || 1;
    const numW = Math.max(320, Math.min(7680, Math.round(Number(width) || 1280)));
    const numH = Math.max(180, Math.min(4320, Math.round(Number(height) || 720)));
    const useOutline = Boolean(outline) && format === 'svg';

    if (scope === 'current') {
      const slideFile = typeof slide === 'string' ? slide.trim() : '';
      if (!slideFile || !SLIDE_FILE_PATTERN.test(slideFile)) {
        return res.status(400).json({ error: 'Missing or invalid slide.' });
      }

      try {
        const result = await withScreenshotPage(async (page) => {
          await page.setViewportSize({ width: numW, height: numH });
          const baseUrl = `http://localhost:${opts.port}/slides`;

          if (format === 'svg') {
            const bundlePath = getDomToSvgBundle();
            let rawSvg = await renderSlideToSvg(page, slideFile, slidesDirectory, bundlePath, { baseUrl });
            if (useOutline) {
              await page.addScriptTag({ path: getOpentypeBundle() });
              rawSvg = await convertTextToOutlines(page, rawSvg);
            }
            return scaleSvg(resizeSvg(rawSvg, numW, numH), numScale);
          }
          return renderSlideToPng(page, slideFile, slidesDirectory, { baseUrl });
        });

        const outName = getOutputFileName(slideFile, format);
        const contentType = format === 'svg' ? 'image/svg+xml' : 'image/png';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        return res.send(result);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // scope === 'all'
    if (activeSvgExport) {
      return res.status(409).json({ error: 'An export is already in progress.' });
    }

    let slideFiles;
    try {
      slideFiles = await listSlideFiles(slidesDirectory);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }

    if (slideFiles.length === 0) {
      return res.status(400).json({ error: 'No slide files found.' });
    }

    const exportId = `export-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    activeSvgExport = true;
    svgExportFiles.set(exportId, new Map());

    res.json({ exportId, total: slideFiles.length });

    // Process in background
    (async () => {
      try {
        let bundlePath;
        let opentypeBundlePath;
        if (format === 'svg') {
          bundlePath = getDomToSvgBundle();
          if (useOutline) opentypeBundlePath = getOpentypeBundle();
        }

        const baseUrl = `http://localhost:${opts.port}/slides`;
        const fileMap = svgExportFiles.get(exportId);

        for (let i = 0; i < slideFiles.length; i++) {
          const sf = slideFiles[i];
          const outName = getOutputFileName(sf, format);

          const result = await withScreenshotPage(async (page) => {
            await page.setViewportSize({ width: numW, height: numH });
            if (format === 'svg') {
              let rawSvg = await renderSlideToSvg(page, sf, slidesDirectory, bundlePath, { baseUrl });
              if (useOutline) {
                await page.addScriptTag({ path: opentypeBundlePath });
                rawSvg = await convertTextToOutlines(page, rawSvg);
              }
              return scaleSvg(resizeSvg(rawSvg, numW, numH), numScale);
            }
            return renderSlideToPng(page, sf, slidesDirectory, { baseUrl });
          });

          fileMap.set(outName, result);

          broadcastSSE('svgExportProgress', {
            exportId,
            current: i + 1,
            total: slideFiles.length,
            file: outName,
          });
        }

        // Build ZIP in memory from all exported files
        const files = Array.from(fileMap.keys());
        console.log(`[svg-export] Creating ZIP for ${files.length} files...`);
        const archive = archiver('zip', { zlib: { level: 6 } });
        const chunks = [];
        archive.on('data', (chunk) => chunks.push(chunk));
        const zipDone = new Promise((resolveZip, rejectZip) => {
          archive.on('end', () => resolveZip(Buffer.concat(chunks)));
          archive.on('error', (err) => {
            console.error('[svg-export] archiver error:', err);
            rejectZip(err);
          });
        });

        for (const [name, data] of fileMap) {
          archive.append(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8'), { name });
        }
        archive.finalize();
        const zipBuffer = await zipDone;
        svgExportZips.set(exportId, zipBuffer);
        console.log(`[svg-export] ZIP created: ${zipBuffer.length} bytes, exportId=${exportId}`);

        const zipUrl = `/api/svg-export/${exportId}/download.zip`;
        broadcastSSE('svgExportFinished', {
          exportId,
          success: true,
          files,
          zipUrl,
          message: `Exported ${files.length} ${format.toUpperCase()} files.`,
        });
        console.log(`[svg-export] Sent svgExportFinished with zipUrl=${zipUrl}`);
      } catch (err) {
        console.error(`[svg-export] Export failed:`, err);
        broadcastSSE('svgExportFinished', {
          exportId,
          success: false,
          files: [],
          message: err.message,
        });
      } finally {
        activeSvgExport = false;
        // Clean up after 5 minutes
        setTimeout(() => {
          svgExportZips.delete(exportId);
          svgExportFiles.delete(exportId);
        }, 5 * 60 * 1000);
      }
    })();
  });

  // ZIP download endpoint
  app.get('/api/svg-export/:exportId/download.zip', (req, res) => {
    console.log(`[svg-export] ZIP download request: exportId=${req.params.exportId}`);
    const zipBuffer = svgExportZips.get(req.params.exportId);
    if (!zipBuffer) {
      console.log(`[svg-export] ZIP not found for exportId=${req.params.exportId}, available: [${Array.from(svgExportZips.keys()).join(', ')}]`);
      return res.status(404).json({ error: 'Export not found or expired.' });
    }
    console.log(`[svg-export] Sending ZIP: ${zipBuffer.length} bytes`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="slides-export.zip"');
    res.send(zipBuffer);
  });

  // Individual file download (kept for backward compat)
  app.get('/api/svg-export/:exportId/:file', (req, res) => {
    const fileMap = svgExportFiles.get(req.params.exportId);
    if (!fileMap) {
      return res.status(404).json({ error: 'Export not found or expired.' });
    }

    const fileName = req.params.file;
    const data = fileMap.get(fileName);
    if (!data) {
      return res.status(404).json({ error: `File not found: ${fileName}` });
    }

    const isSvg = fileName.endsWith('.svg');
    res.setHeader('Content-Type', isSvg ? 'image/svg+xml' : 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(data);
  });

  // ── PDF Export ─────────────────────────────────────────────────────
  let activePdfExport = false;
  const pdfExportFiles = new Map(); // exportId -> Buffer

  // Screenshot-based PDF rendering (pixel-perfect, avoids print-media layout issues)
  const PDF_SCALE = 2; // 2x DPI for crisp output

  async function renderSlideToPdfBuffer(browser, slideFile) {
    // Create a dedicated high-DPI context for PDF capture
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: PDF_SCALE,
    });
    const page = await context.newPage();

    try {
      const slideUrl = `http://localhost:${opts.port}/slides/${encodeURIComponent(slideFile)}`;
      await page.goto(slideUrl, { waitUntil: 'load' });
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });

      // Read the actual body size to clip the screenshot precisely
      const bodySize = await page.evaluate(() => {
        const body = document.body;
        const style = window.getComputedStyle(body);
        return {
          width: Math.round(parseFloat(style.width) || body.getBoundingClientRect().width || 1280),
          height: Math.round(parseFloat(style.height) || body.getBoundingClientRect().height || 720),
        };
      });

      // Resize viewport to exactly match body
      await page.setViewportSize({ width: bodySize.width, height: bodySize.height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

      // Screenshot at 2x produces (bodySize * 2) pixel image — crisp in PDF
      const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });

      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(pngBuffer);
      const pdfPage = pdfDoc.addPage([bodySize.width, bodySize.height]);
      pdfPage.drawImage(pngImage, { x: 0, y: 0, width: bodySize.width, height: bodySize.height });
      return pdfDoc.save();
    } finally {
      await context.close().catch(() => {});
    }
  }

  app.post('/api/pdf-export', async (req, res) => {
    const { scope, slide } = req.body ?? {};

    if (!['current', 'all'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be current or all' });
    }

    if (scope === 'current') {
      const slideFile = typeof slide === 'string' ? slide.trim() : '';
      if (!slideFile || !SLIDE_FILE_PATTERN.test(slideFile)) {
        return res.status(400).json({ error: 'Missing or invalid slide.' });
      }

      try {
        const { browser } = await getScreenshotBrowser();
        const pdfBuffer = await renderSlideToPdfBuffer(browser, slideFile);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${slideFile.replace(/\.html$/i, '.pdf')}"`);
        return res.send(Buffer.from(pdfBuffer));
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // scope === 'all'
    if (activePdfExport) {
      return res.status(409).json({ error: 'A PDF export is already in progress.' });
    }

    let slideFiles;
    try {
      slideFiles = await listSlideFiles(slidesDirectory);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }

    if (slideFiles.length === 0) {
      return res.status(400).json({ error: 'No slide files found.' });
    }

    const exportId = `pdf-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    activePdfExport = true;

    res.json({ exportId, total: slideFiles.length });

    // Process in background
    (async () => {
      try {
        const pdfBuffers = [];

        for (let i = 0; i < slideFiles.length; i++) {
          const sf = slideFiles[i];

          const { browser: pdfBrowser } = await getScreenshotBrowser();
          const pdfBuf = await renderSlideToPdfBuffer(pdfBrowser, sf);

          pdfBuffers.push(pdfBuf);

          broadcastSSE('pdfExportProgress', {
            exportId,
            current: i + 1,
            total: slideFiles.length,
            file: sf,
          });
        }

        const mergedPdf = await mergePdfBuffers(pdfBuffers);
        pdfExportFiles.set(exportId, Buffer.from(mergedPdf));

        const downloadUrl = `/api/pdf-export/${exportId}/download.pdf`;
        broadcastSSE('pdfExportFinished', {
          exportId,
          success: true,
          downloadUrl,
          message: `Exported ${slideFiles.length} slides to PDF.`,
        });
      } catch (err) {
        console.error('[pdf-export] Export failed:', err);
        broadcastSSE('pdfExportFinished', {
          exportId,
          success: false,
          message: err.message,
        });
      } finally {
        activePdfExport = false;
        // Clean up after 5 minutes
        setTimeout(() => {
          pdfExportFiles.delete(exportId);
        }, 5 * 60 * 1000);
      }
    })();
  });

  app.get('/api/pdf-export/:exportId/download.pdf', (req, res) => {
    const pdfBuffer = pdfExportFiles.get(req.params.exportId);
    if (!pdfBuffer) {
      return res.status(404).json({ error: 'PDF not found or expired.' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="slides.pdf"');
    res.send(pdfBuffer);
  });

  // ── Figma Export via WebSocket ──────────────────────────────────────
  let activeFigmaExport = false;

  app.post('/api/figma-export', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const { scope, slide, scale = 1, width = 1920, height = 1080 } = req.body ?? {};

    if (!['current', 'all'].includes(scope)) {
      return res.status(400).json({ error: 'scope must be current or all' });
    }

    if (figmaClients.size === 0) {
      return res.status(400).json({ error: 'No Figma plugin connected.' });
    }

    if (activeFigmaExport) {
      return res.status(409).json({ error: 'A Figma export is already in progress.' });
    }

    const numScale = Number(scale) || 1;
    const numW = Math.max(320, Math.min(7680, Math.round(Number(width) || 1920)));
    const numH = Math.max(180, Math.min(4320, Math.round(Number(height) || 1080)));

    let slideFiles;
    if (scope === 'current') {
      const slideFile = typeof slide === 'string' ? slide.trim() : '';
      if (!slideFile || !SLIDE_FILE_PATTERN.test(slideFile)) {
        return res.status(400).json({ error: 'Missing or invalid slide.' });
      }
      slideFiles = [slideFile];
    } else {
      try {
        slideFiles = await listSlideFiles(slidesDirectory);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
      if (slideFiles.length === 0) {
        return res.status(400).json({ error: 'No slide files found.' });
      }
    }

    activeFigmaExport = true;
    res.json({ ok: true, total: slideFiles.length });

    // Process in background
    (async () => {
      try {
        const bundlePath = getDomToSvgBundle();
        const baseUrl = `http://localhost:${opts.port}/slides`;

        for (let i = 0; i < slideFiles.length; i++) {
          const sf = slideFiles[i];

          const svg = await withScreenshotPage(async (page) => {
            await page.setViewportSize({ width: numW, height: numH });
            const rawSvg = await renderSlideToSvg(page, sf, slidesDirectory, bundlePath, { baseUrl });
            return scaleSvg(resizeSvg(rawSvg, numW, numH), numScale);
          });

          const msg = JSON.stringify({
            type: 'slide',
            name: sf.replace(/\.html$/i, ''),
            svg,
            current: i + 1,
            total: slideFiles.length,
          });

          for (const ws of figmaClients) {
            try { ws.send(msg); } catch { /* client gone */ }
          }

          broadcastSSE('figmaExportProgress', {
            current: i + 1,
            total: slideFiles.length,
            file: sf,
          });
        }

        const doneMsg = JSON.stringify({ type: 'done', total: slideFiles.length });
        for (const ws of figmaClients) {
          try { ws.send(doneMsg); } catch { /* client gone */ }
        }

        broadcastSSE('figmaExportFinished', {
          success: true,
          total: slideFiles.length,
          message: `Sent ${slideFiles.length} slides to Figma.`,
        });
      } catch (err) {
        console.error('[figma-export] Export failed:', err);
        broadcastSSE('figmaExportFinished', {
          success: false,
          total: 0,
          message: err.message,
        });
      } finally {
        activeFigmaExport = false;
      }
    })();
  });

  // CORS preflight for Figma export
  app.options('/api/figma-export', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });

  let debounceTimer = null;
  let watcher = null;

  function setupFileWatcher(dir) {
    if (watcher) { try { watcher.close(); } catch { /* ignore */ } }
    if (!dir) return;
    watcher = fsWatch(dir, { persistent: false }, (_eventType, filename) => {
      if (!filename || !SLIDE_FILE_PATTERN.test(filename)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        broadcastSSE('fileChanged', { file: filename });
      }, 300);
    });
  }

  if (slidesDirectory) {
    setupFileWatcher(slidesDirectory);
  }

  const server = app.listen(opts.port, () => {
    const mode = opts.browseMode ? 'BROWSE' : opts.createMode ? 'CREATE' : 'EDIT';
    process.stdout.write('\n  slides-grab editor\n');
    process.stdout.write('  ─────────────────────────────────────\n');
    process.stdout.write(`  Mode:        ${mode}\n`);
    process.stdout.write(`  Local:       http://localhost:${opts.port}\n`);
    process.stdout.write(`  Models:      ${ALL_MODELS.join(', ')}\n`);
    process.stdout.write(`  Slides:      ${slidesDirectory || '(will be created)'}\n`);
    process.stdout.write(`  Figma WS:    ws://localhost:${opts.port}/figma-ws\n`);
    process.stdout.write('  ─────────────────────────────────────\n\n');
  });

  // WebSocket server for Figma plugin
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://localhost:${opts.port}`);
    if (url.pathname === '/figma-ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    figmaClients.add(ws);
    console.log(`[figma-ws] Figma plugin connected (total: ${figmaClients.size})`);
    broadcastSSE('figmaConnected', { clients: figmaClients.size });

    ws.on('close', () => {
      figmaClients.delete(ws);
      console.log(`[figma-ws] Figma plugin disconnected (total: ${figmaClients.size})`);
      broadcastSSE('figmaDisconnected', { clients: figmaClients.size });
    });

    ws.on('error', () => {
      figmaClients.delete(ws);
    });
  });

  async function shutdown() {
    process.stdout.write('\n[editor] Shutting down...\n');
    if (watcher) watcher.close();
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
    for (const ws of figmaClients) {
      ws.close();
    }
    figmaClients.clear();
    wss.close();
    server.close();
    await closeBrowser();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const args = process.argv.slice(2);

let opts;
try {
  opts = parseArgs(args);
} catch (error) {
  process.stderr.write(`[editor] ${error.message}\n`);
  process.exit(1);
}

if (opts.help) {
  printUsage();
  process.exit(0);
}

startServer(opts).catch((err) => {
  process.stderr.write(`[editor] Fatal: ${err.message}\n`);
  process.exit(1);
});
