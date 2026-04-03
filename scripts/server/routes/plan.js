import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { CLAUDE_MODELS } from '../../../src/editor/codex-edit.js';
import { normalizePackId } from '../../../src/resolve.js';

import { broadcastSSE } from '../sse.js';
import {
  randomRunId,
  parseOutline,
  appendOutlinePrompt,
  spawnClaudeEdit,
  setupFileWatcher,
  listExistingDeckNames,
} from '../helpers.js';

/**
 * Plan and outline routes.
 * Routes: POST /api/plan, POST /api/plan/revise,
 *         GET /api/outline, PUT /api/outline
 */
export function createPlanRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  // ── GET /api/outline ────────────────────────────────────────────────
  router.get('/api/outline', async (_req, res) => {
    const slidesDirectory = ctx.getSlidesDir();
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

  // ── PUT /api/outline ────────────────────────────────────────────────
  router.put('/api/outline', async (req, res) => {
    const slidesDirectory = ctx.getSlidesDir();
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

  // ── POST /api/plan ──────────────────────────────────────────────────
  router.post('/api/plan', async (req, res) => {
    const { topic, requirements, model, slideCount: slideCountRange, packId: reqPackId } = req.body ?? {};

    if (typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid `topic`.' });
    }

    if (ctx.activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim()
      : CLAUDE_MODELS[0];

    const runId = randomRunId();
    ctx.activeGenerate = true;

    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: topic.trim() });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Analyzing topic and structuring outline' });
    res.json({ runId, topic: topic.trim(), model: selectedModel });

    (async () => {
      try {
        const countLabel = typeof slideCountRange === 'string' && slideCountRange.trim()
          ? slideCountRange.trim()
          : '8~12';
        const selectedPackId = normalizePackId(reqPackId);
        const existingDeckNames = await listExistingDeckNames();

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
        appendOutlinePrompt(promptLines, selectedPackId, { existingDeckNames });

        const fullPrompt = promptLines.join('\n');

        broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Generating outline with AI' });

        const result = await spawnClaudeEdit({
          prompt: fullPrompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            broadcastSSE(ctx.sseClients, 'planLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;
        let outline = null;
        let detectedDeckName = '';

        if (success) {
          broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Parsing generated outline' });
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

              ctx.setSlidesDir(join(decksRoot, bestDir));
              setupFileWatcher(ctx, ctx.getSlidesDir());
            }
          } catch (err) {
            console.error('Failed to parse outline:', err);
          }
        }

        broadcastSSE(ctx.sseClients, 'planFinished', {
          runId,
          success,
          message: success ? 'Outline ready.' : `Plan failed (exit code ${result.code}).`,
          outline,
          deckName: detectedDeckName,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastSSE(ctx.sseClients, 'planFinished', { runId, success: false, message, outline: null });
      } finally {
        ctx.activeGenerate = false;
      }
    })();
  });

  // ── POST /api/plan/revise ───────────────────────────────────────────
  router.post('/api/plan/revise', async (req, res) => {
    const { feedback, deckName, targetSlide } = req.body ?? {};

    if (typeof feedback !== 'string' || feedback.trim() === '') {
      return res.status(400).json({ error: 'Missing feedback.' });
    }

    if (ctx.activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    const slidesDirectory = ctx.getSlidesDir();
    if (!slidesDirectory) {
      return res.status(400).json({ error: 'No outline to revise.' });
    }

    const selectedModel = CLAUDE_MODELS[0];
    const runId = randomRunId();
    ctx.activeGenerate = true;

    const targetLabel = typeof targetSlide === 'number'
      ? `Revise Slide ${targetSlide}: ${feedback.trim().slice(0, 40)}`
      : `Revise: ${feedback.trim().slice(0, 50)}`;
    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: targetLabel });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'revise', step: 'Applying revision feedback' });
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
            broadcastSSE(ctx.sseClients, 'planLog', { runId, stream, chunk });
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

        broadcastSSE(ctx.sseClients, 'planFinished', {
          runId,
          success,
          message: success ? 'Outline revised.' : `Revision failed (exit code ${result.code}).`,
          outline,
          deckName: deckName || basename(slidesDirectory),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcastSSE(ctx.sseClients, 'planFinished', { runId, success: false, message, outline: null });
      } finally {
        ctx.activeGenerate = false;
      }
    })();
  });

  return router;
}
