#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServerState, ALL_MODELS } from './server/state.js';
import { setupFileWatcher, closeBrowser } from './server/helpers.js';
import { setupDevReloadWatcher } from './server/dev-reload.js';
import { createStaticRouter } from './server/routes/static.js';
import { createSlidesRouter } from './server/routes/slides.js';
import { createDecksRouter } from './server/routes/decks.js';
import { createModelsRouter } from './server/routes/models.js';
import { createPacksRouter } from './server/routes/packs.js';
import { createApplyRouter } from './server/routes/apply.js';
import { createPlanRouter } from './server/routes/plan.js';
import { createImportRouter } from './server/routes/import.js';
import { createGenerateRouter } from './server/routes/generate.js';
import { createExportRouter } from './server/routes/export.js';
import { createPdfFigmaRouter, setupFigmaWebSocket } from './server/routes/pdf-figma.js';
import { createPptxExportRouter } from './server/routes/pptx-export.js';
import { createLogoRouter } from './server/routes/logo.js';
import { createRethemeRouter } from './server/routes/retheme.js';
import { createEventsRouter } from './server/routes/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = process.env.PPT_AGENT_PACKAGE_ROOT || resolve(__dirname, '..');

const DEFAULT_PORT = 3456;
const DEFAULT_SLIDES_DIR = 'slides';

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
    importDocSource: '',
    importDocSourceType: '',
    importPack: '',
    importSlideCount: '',
    rethemeMode: false,
    rethemeSaveAs: '',
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

    if (arg === '--import-doc') {
      opts.importDocSource = argv[i + 1] || '';
      opts.createMode = true;
      i += 1;
      continue;
    }

    if (arg.startsWith('--import-doc=')) {
      opts.importDocSource = arg.slice('--import-doc='.length);
      opts.createMode = true;
      continue;
    }

    if (arg === '--source-type') {
      opts.importDocSourceType = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--pack') {
      opts.importPack = argv[i + 1] || '';
      i += 1;
      continue;
    }

    if (arg === '--retheme') {
      opts.rethemeMode = true;
      opts.createMode = true;
      continue;
    }

    if (arg === '--save-as') {
      opts.rethemeSaveAs = argv[i + 1] || '';
      i += 1;
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

async function startServer(opts) {
  await loadDeps();

  const ctx = createServerState(opts, { PACKAGE_ROOT, express, screenshotMod });

  // Initialize slides directory
  if (!opts.createMode && !opts.browseMode) {
    const slidesDir = resolve(process.cwd(), opts.slidesDir);
    ctx.setSlidesDir(slidesDir);
    await mkdir(slidesDir, { recursive: true });
  }

  // If create mode with a pre-set deck name, resolve it now
  if (opts.createMode && opts.deckName) {
    const slidesDir = resolve(process.cwd(), 'decks', opts.deckName);
    ctx.setSlidesDir(slidesDir);
    await mkdir(slidesDir, { recursive: true });
  }

  const app = express();

  // Logo router MUST be mounted before express.json() — upload route needs raw body
  app.use(createLogoRouter(ctx));
  app.use(express.json({ limit: '5mb' }));

  // Mount all route modules
  app.use(createStaticRouter(ctx));
  app.use(createSlidesRouter(ctx));
  app.use(createDecksRouter(ctx));
  app.use(createModelsRouter(ctx));
  app.use(createPacksRouter(ctx));
  app.use(createEventsRouter(ctx));
  app.use(createApplyRouter(ctx));
  app.use(createPlanRouter(ctx));
  app.use(createImportRouter(ctx));
  app.use(createGenerateRouter(ctx));
  app.use(createExportRouter(ctx));
  app.use(createPdfFigmaRouter(ctx));
  app.use(createPptxExportRouter(ctx));
  app.use(createRethemeRouter(ctx));

  // Global error handler — catches unhandled route errors
  app.use((err, _req, res, _next) => {
    console.error(`[editor] Unhandled route error:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  const slidesDirectory = ctx.getSlidesDir();
  if (slidesDirectory) setupFileWatcher(ctx, slidesDirectory);

  // Hot-reload watcher for editor JS/CSS (development mode only)
  const devReloadHandle = setupDevReloadWatcher(ctx);

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

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(`[editor] Port ${opts.port} is already in use.\n`);
    } else {
      process.stderr.write(`[editor] Server error: ${err.message}\n`);
    }
    process.exit(1);
  });

  const wss = setupFigmaWebSocket(server, ctx);

  async function shutdown() {
    process.stdout.write('\n[editor] Shutting down...\n');
    if (ctx.watcher) ctx.watcher.close();
    if (devReloadHandle) devReloadHandle.close();
    for (const client of ctx.sseClients) client.end();
    ctx.sseClients.clear();
    for (const ws of ctx.figmaClients) ws.close();
    ctx.figmaClients.clear();
    wss.close();
    server.close();
    await closeBrowser(ctx);
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`[editor] ${error.message}\n`);
  process.exit(1);
}

if (opts.help) {
  printUsage();
  process.exit(0);
}

process.on('unhandledRejection', (reason) => {
  console.error('[editor] Unhandled promise rejection:', reason);
});

startServer(opts).catch((err) => {
  process.stderr.write(`[editor] Fatal: ${err.message}\n`);
  process.exit(1);
});
