import { resolve, basename, relative, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';

import {
  CLAUDE_MODELS,
} from '../../src/editor/codex-edit.js';

import { normalizePackId } from '../../src/resolve.js';

const CODEX_MODELS = ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark'];
const ALL_MODELS = [...CODEX_MODELS, ...CLAUDE_MODELS];
const DEFAULT_CODEX_MODEL = CODEX_MODELS[0];
const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;

const MAX_RUNS = 200;
const MAX_LOG_CHARS = 800_000;

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

/**
 * Create shared server state object.
 * `slidesDirectory` is mutable — routes read/write via ctx.getSlidesDir() / ctx.setSlidesDir().
 */
export function createServerState(opts, { PACKAGE_ROOT, express, screenshotMod }) {
  let slidesDirectory = (opts.createMode || opts.browseMode)
    ? ''
    : resolve(process.cwd(), opts.slidesDir);

  return {
    opts,
    PACKAGE_ROOT,
    express,
    screenshotMod,

    // Mutable slides directory
    getSlidesDir() { return slidesDirectory; },
    setSlidesDir(dir) { slidesDirectory = dir; },

    // Run stores
    runStore: createRunStore(),
    generateRunStore: createRunStore(),

    // SSE clients
    sseClients: new Set(),
    figmaClients: new Set(),

    // File watcher state
    watcher: null,
    debounceTimer: null,

    // Browser for screenshots
    browserPromise: null,

    // Active generation lock
    activeGenerate: false,

    // Constants
    ALL_MODELS,
    CODEX_MODELS,
    CLAUDE_MODELS,
    DEFAULT_CODEX_MODEL,
    SLIDE_FILE_PATTERN,
    MAX_RUNS,
    MAX_LOG_CHARS,
  };
}

export {
  ALL_MODELS,
  CODEX_MODELS,
  DEFAULT_CODEX_MODEL,
  SLIDE_FILE_PATTERN,
  createRunStore,
};
