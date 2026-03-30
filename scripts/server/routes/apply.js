import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  SLIDE_SIZE,
  buildCodexEditPrompt,
  scaleSelectionToScreenshot,
  writeAnnotatedScreenshot,
  isClaudeModel,
} from '../../../src/editor/codex-edit.js';

import { broadcastSSE, broadcastRunsSnapshot } from '../sse.js';
import {
  normalizeSelections,
  normalizeModel,
  randomRunId,
  toSlidePathLabel,
  withScreenshotPage,
  spawnCodexEdit,
  spawnClaudeEdit,
} from '../helpers.js';

/**
 * AI apply (edit) route.
 * Routes: POST /api/apply
 */
export function createApplyRouter(ctx) {
  const { express, opts } = ctx;
  const SLIDE_FILE_PATTERN = ctx.SLIDE_FILE_PATTERN;
  const router = express.Router();

  router.post('/api/apply', async (req, res) => {
    const { slide, prompt, selections, model } = req.body ?? {};

    if (!slide || typeof slide !== 'string' || !SLIDE_FILE_PATTERN.test(slide)) {
      return res.status(400).json({ error: 'Missing or invalid `slide`.' });
    }

    if (typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid `prompt`.' });
    }

    let selectedModel;
    try {
      selectedModel = normalizeModel(model, ctx.ALL_MODELS, ctx.DEFAULT_CODEX_MODEL);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (ctx.runStore.hasActiveRunForSlide(slide)) {
      return res.status(409).json({
        error: `Slide ${slide} already has an active run.`,
        runId: ctx.runStore.getActiveRunId(slide),
      });
    }

    let normalizedSelections;
    try {
      normalizedSelections = normalizeSelections(selections);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const runId = randomRunId();

    const runSummary = ctx.runStore.startRun({
      runId,
      slide,
      prompt: prompt.trim(),
      selectionsCount: normalizedSelections.length,
      model: selectedModel,
    });

    broadcastSSE(ctx.sseClients, 'applyStarted', {
      runId,
      slide,
      model: selectedModel,
      selectionsCount: normalizedSelections.length,
      selectionBoxes: normalizedSelections.map((selection) => selection.bbox),
    });
    broadcastRunsSnapshot(ctx);

    const tmpPath = await mkdtemp(join(tmpdir(), 'editor-codex-'));
    const screenshotPath = join(tmpPath, 'slide.png');
    const annotatedPath = join(tmpPath, 'slide-annotated.png');

    try {
      await withScreenshotPage(ctx, async (page) => {
        await ctx.screenshotMod.captureSlideScreenshot(
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
          ctx.screenshotMod.SCREENSHOT_SIZE,
        ),
      );

      await writeAnnotatedScreenshot(screenshotPath, annotatedPath, scaledBoxes);

      const slidesDirectory = ctx.getSlidesDir();
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
          ctx.runStore.appendLog(runId, chunk);
          broadcastSSE(ctx.sseClients, 'applyLog', { runId, slide, stream, chunk });
        },
      });

      const engineLabel = isClaudeModel(selectedModel) ? 'Claude' : 'Codex';
      const success = result.code === 0;
      const message = success
        ? `${engineLabel} edit completed.`
        : `${engineLabel} exited with code ${result.code}.`;

      ctx.runStore.finishRun(runId, {
        status: success ? 'success' : 'failed',
        code: result.code,
        message,
      });

      broadcastSSE(ctx.sseClients, 'applyFinished', {
        runId,
        slide,
        model: selectedModel,
        success,
        code: result.code,
        message,
      });
      broadcastRunsSnapshot(ctx);

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

      ctx.runStore.finishRun(runId, {
        status: 'failed',
        code: -1,
        message,
      });

      broadcastSSE(ctx.sseClients, 'applyFinished', {
        runId,
        slide,
        model: selectedModel,
        success: false,
        code: -1,
        message,
      });
      broadcastRunsSnapshot(ctx);

      res.status(500).json({
        success: false,
        runId,
        error: message,
      });
    } finally {
      ctx.runStore.clearActiveRun(slide, runId);
      await rm(tmpPath, { recursive: true, force: true }).catch(() => {});
    }
  });

  return router;
}
