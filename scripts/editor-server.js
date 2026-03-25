#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { watch as fsWatch } from 'node:fs';
import { basename, dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

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
import {
  parseEditTimeoutMs,
  runEditSubprocess,
} from '../src/editor/edit-subprocess.js';
import { buildSlideRuntimeHtml } from '../src/image-contract.js';

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
const EDIT_TIMEOUT_MS = parseEditTimeoutMs();

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
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      opts.help = true;
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

  if (typeof opts.slidesDir !== 'string' || opts.slidesDir.trim() === '') {
    throw new Error('`--slides-dir` must be a non-empty path.');
  }

  opts.slidesDir = opts.slidesDir.trim();

  return opts;
}

const sseClients = new Set();

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

function mirrorRunLog(onLog) {
  return (stream, chunk) => {
    onLog(stream, chunk);
    process[stream].write(chunk);
  };
}

function spawnCodexEdit({ prompt, imagePath, model, cwd, onLog }) {
  const codexBin = process.env.PPT_AGENT_CODEX_BIN || 'codex';
  const args = buildCodexExecArgs({ prompt, imagePath, model });
  return runEditSubprocess({
    bin: codexBin,
    args,
    cwd,
    stdio: 'pipe',
    timeoutMs: EDIT_TIMEOUT_MS,
    engineLabel: 'Codex',
    onLog: mirrorRunLog(onLog),
  });
}

function spawnClaudeEdit({ prompt, imagePath, model, cwd, onLog }) {
  const claudeBin = process.env.PPT_AGENT_CLAUDE_BIN || 'claude';
  const args = buildClaudeExecArgs({ prompt, imagePath, model });

  // Remove CLAUDECODE env var to avoid "nested session" detection error
  const env = { ...process.env };
  delete env.CLAUDECODE;

  return runEditSubprocess({
    bin: claudeBin,
    args,
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeoutMs: EDIT_TIMEOUT_MS,
    engineLabel: 'Claude',
    onLog: mirrorRunLog(onLog),
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

async function startServer(opts) {
  await loadDeps();
  const slidesDirectory = resolve(process.cwd(), opts.slidesDir);
  await mkdir(slidesDirectory, { recursive: true });

  const runStore = createRunStore();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/js', express.static(join(PACKAGE_ROOT, 'src', 'editor', 'js')));
  app.use('/slides/assets', express.static(join(slidesDirectory, 'assets')));

  const editorHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'editor.html');

  function broadcastRunsSnapshot() {
    broadcastSSE('runsSnapshot', {
      runs: runStore.listRuns(),
      activeRuns: runStore.listActiveRuns(),
    });
  }

  app.get('/', async (_req, res) => {
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
      const runtimeHtml = buildSlideRuntimeHtml(html, {
        baseHref: '/slides/',
        slideFile: file,
      });
      res.type('html').send(runtimeHtml);
    } catch {
      res.status(404).send(`Slide not found: ${file}`);
    }
  });

  app.get('/api/slides', async (_req, res) => {
    try {
      const files = await listSlideFiles(slidesDirectory);
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
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
        : (result.timeoutMessage || `${engineLabel} exited with code ${result.code}.`);

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

  let debounceTimer = null;
  const watcher = fsWatch(slidesDirectory, { persistent: false }, (_eventType, filename) => {
    if (!filename || !SLIDE_FILE_PATTERN.test(filename)) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      broadcastSSE('fileChanged', { file: filename });
    }, 300);
  });

  const server = app.listen(opts.port, () => {
    process.stdout.write('\n  slides-grab editor\n');
    process.stdout.write('  ─────────────────────────────────────\n');
    process.stdout.write(`  Local:       http://localhost:${opts.port}\n`);
    process.stdout.write(`  Models:      ${ALL_MODELS.join(', ')}\n`);
    process.stdout.write(`  Slides:      ${slidesDirectory}\n`);
    process.stdout.write('  ─────────────────────────────────────\n\n');
  });

  async function shutdown() {
    process.stdout.write('\n[editor] Shutting down...\n');
    watcher.close();
    for (const client of sseClients) {
      client.end();
    }
    sseClients.clear();
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
