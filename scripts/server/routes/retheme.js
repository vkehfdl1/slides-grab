import { writeFile, mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import { CLAUDE_MODELS } from '../../../src/editor/codex-edit.js';
import { normalizePackId } from '../../../src/resolve.js';
import { prepareRetheme, listBackups, restoreBackup } from '../../../src/retheme.js';
import { analyzeDeck } from '../../../src/review.js';

import { broadcastSSE } from '../sse.js';
import { randomRunId, spawnClaudeEdit, setupFileWatcher, uniqueDeckName } from '../helpers.js';

/**
 * Retheme, review, backup, and restore routes.
 * Routes: POST /api/retheme, POST /api/review,
 *         GET /api/backups, POST /api/restore
 */
export function createRethemeRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  // ── POST /api/retheme ─────────────────────────────────────────────
  router.post('/api/retheme', async (req, res) => {
    const { deckName, packId, model: reqModel, saveAs } = req.body ?? {};

    if (!deckName || typeof deckName !== 'string') {
      return res.status(400).json({ error: 'deckName required.' });
    }
    if (!packId || typeof packId !== 'string') {
      return res.status(400).json({ error: 'packId required.' });
    }
    if (ctx.activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    const targetPack = normalizePackId(packId);
    if (!targetPack) {
      return res.status(400).json({ error: 'Invalid pack ID.' });
    }

    const deckDir = resolve(process.cwd(), 'decks', deckName);
    if (!existsSync(deckDir)) {
      return res.status(404).json({ error: `Deck not found: ${deckName}` });
    }

    const selectedModel = typeof reqModel === 'string' && CLAUDE_MODELS.includes(reqModel.trim())
      ? reqModel.trim()
      : CLAUDE_MODELS[0];

    const rawTargetName = (typeof saveAs === 'string' && saveAs.trim()) || `${deckName}-${targetPack}`;
    const targetDeckName = await uniqueDeckName(rawTargetName);
    const targetDeckDir = resolve(process.cwd(), 'decks', targetDeckName);

    const runId = randomRunId();
    ctx.activeGenerate = true;

    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: `(Retheme: ${deckName} → ${targetPack})` });
    res.json({ runId, deckName, targetDeckName, targetPack, model: selectedModel });

    (async () => {
      try {
        broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'retheme', step: 'Preparing retheme data' });

        const { prompt, outline } = await prepareRetheme({
          deckDir,
          targetPackId: targetPack,
          targetDeckName,
        });

        await mkdir(targetDeckDir, { recursive: true });
        await writeFile(join(targetDeckDir, 'slide-outline.md'), outline, 'utf-8');

        broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'retheme', step: `Regenerating slides with ${targetPack} pack` });

        const result = await spawnClaudeEdit({
          prompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            broadcastSSE(ctx.sseClients, 'planLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;

        if (success) {
          ctx.setSlidesDir(targetDeckDir);
          setupFileWatcher(ctx, targetDeckDir);
        }

        broadcastSSE(ctx.sseClients, 'planFinished', {
          runId,
          success,
          phase: 'retheme',
          message: success
            ? `Retheme complete: ${targetDeckName} now uses ${targetPack} pack.`
            : `Retheme failed (exit code ${result.code}).`,
          deckName: targetDeckName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastSSE(ctx.sseClients, 'planFinished', { runId, success: false, message });
      } finally {
        ctx.activeGenerate = false;
      }
    })();
  });

  // ── GET /api/backups ──────────────────────────────────────────────
  router.get('/api/backups', async (req, res) => {
    const slidesDirectory = ctx.getSlidesDir();
    const deckName = (typeof req.query.deck === 'string' ? req.query.deck.trim() : '') || (slidesDirectory ? basename(slidesDirectory) : '');
    if (!deckName) {
      return res.status(400).json({ error: 'No deck loaded.' });
    }

    const deckDir = resolve(process.cwd(), 'decks', deckName);
    if (!existsSync(deckDir)) {
      return res.status(404).json({ error: `Deck not found: ${deckName}` });
    }

    try {
      const backups = await listBackups(deckDir);
      res.json(backups);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/restore ─────────────────────────────────────────────
  router.post('/api/restore', async (req, res) => {
    const { deckName, timestamp } = req.body ?? {};
    const slidesDirectory = ctx.getSlidesDir();

    const name = deckName || (slidesDirectory ? basename(slidesDirectory) : '');
    if (!name) {
      return res.status(400).json({ error: 'deckName required.' });
    }
    if (!timestamp || typeof timestamp !== 'string') {
      return res.status(400).json({ error: 'timestamp required.' });
    }

    const deckDir = resolve(process.cwd(), 'decks', name);
    if (!existsSync(deckDir)) {
      return res.status(404).json({ error: `Deck not found: ${name}` });
    }

    try {
      const result = await restoreBackup(deckDir, timestamp);
      if (slidesDirectory && resolve(slidesDirectory) === resolve(deckDir)) {
        setupFileWatcher(ctx, slidesDirectory);
      }
      res.json({ success: true, restored: result.restored, timestamp });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/review ──────────────────────────────────────────────
  router.post('/api/review', async (req, res) => {
    const { deckName, audience, timeMinutes } = req.body ?? {};
    const slidesDirectory = ctx.getSlidesDir();

    const name = deckName || (slidesDirectory ? basename(slidesDirectory) : '');
    if (!name) {
      return res.status(400).json({ error: 'deckName required.' });
    }

    const deckDir = resolve(process.cwd(), 'decks', name);
    if (!existsSync(deckDir)) {
      return res.status(404).json({ error: `Deck not found: ${name}` });
    }

    try {
      const result = await analyzeDeck(deckDir, {
        audience: audience || undefined,
        timeMinutes: typeof timeMinutes === 'number' ? timeMinutes : 15,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
