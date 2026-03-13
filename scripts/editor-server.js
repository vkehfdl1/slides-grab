#!/usr/bin/env node

import { readdir, readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
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

async function startServer(opts) {
  await loadDeps();
  const slidesDirectory = resolve(process.cwd(), opts.slidesDir);
  await mkdir(slidesDirectory, { recursive: true });

  const runStore = createRunStore();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/js', express.static(join(PACKAGE_ROOT, 'src', 'editor', 'js')));

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
      res.type('html').send(html);
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
    watcher.close();
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
