import { readdir, readFile, mkdir, rename, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve, relative } from 'node:path';

import { CLAUDE_MODELS } from '../../../src/editor/codex-edit.js';
import { listPackTemplates, normalizePackId } from '../../../src/resolve.js';

import { broadcastSSE } from '../sse.js';
import { randomRunId, toPosixPath, listSlideFiles, spawnClaudeEdit, setupFileWatcher, backupSlides } from '../helpers.js';

/** Slide generation route: POST /api/generate */
export function createGenerateRouter(ctx) {
  const { express } = ctx;
  const router = express.Router();

  router.post('/api/generate', async (req, res) => {
    const { topic, requirements, model, deckName, slideCount: slideCountRange, fromOutline, packId: reqGenPackId } = req.body ?? {};

    if (!fromOutline && (typeof topic !== 'string' || topic.trim() === '')) {
      return res.status(400).json({ error: 'Missing or invalid `topic`.' });
    }

    if (ctx.activeGenerate) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    let slidesDirectory = ctx.getSlidesDir();

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
            ctx.setSlidesDir(newPath);
            slidesDirectory = newPath;
            setupFileWatcher(ctx, slidesDirectory);
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
        ctx.setSlidesDir(slidesDirectory);
        await mkdir(slidesDirectory, { recursive: true });
        setupFileWatcher(ctx, slidesDirectory);
      }
    }

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim()
      : CLAUDE_MODELS[0];

    const runId = randomRunId();
    ctx.activeGenerate = true;

    ctx.generateRunStore.startRun({
      runId,
      slide: '__generate__',
      prompt: (topic || '').trim(),
      selectionsCount: 0,
      model: selectedModel,
    });

    const resolvedDeckPath = slidesDirectory
      ? toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory)
      : '';
    broadcastSSE(ctx.sseClients, 'generateStarted', { runId, topic: (topic || '').trim(), deckPath: resolvedDeckPath });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Preparing slide templates' });

    res.json({ runId, topic: (topic || '').trim(), model: selectedModel, deckPath: resolvedDeckPath });

    (async () => {
      try {
        const slidesDir = resolvedDeckPath;
        let fullPrompt;

        if (fromOutline && slidesDirectory) {
          fullPrompt = await buildFromOutlinePrompt(ctx, slidesDirectory, slidesDir, reqGenPackId, runId);
        } else {
          fullPrompt = buildFromScratchPrompt(topic, requirements, slideCountRange, slidesDir, reqGenPackId);
        }

        broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Building slides with AI' });

        const result = await spawnClaudeEdit({
          prompt: fullPrompt,
          imagePath: null,
          model: selectedModel,
          cwd: process.cwd(),
          onLog: (stream, chunk) => {
            ctx.generateRunStore.appendLog(runId, chunk);
            broadcastSSE(ctx.sseClients, 'generateLog', { runId, stream, chunk });
          },
        });

        const success = result.code === 0;

        if (success) {
          broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Finalizing slides' });
        }

        // If slidesDirectory is still unset, detect the folder Claude created
        slidesDirectory = ctx.getSlidesDir();
        if (!slidesDirectory && success) {
          slidesDirectory = await detectNewDeck(ctx);
        }

        let slideCount = 0;
        try {
          slidesDirectory = ctx.getSlidesDir();
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

        ctx.generateRunStore.finishRun(runId, {
          status: success ? 'success' : 'failed',
          code: result.code,
          message,
        });

        broadcastSSE(ctx.sseClients, 'generateFinished', { runId, success, message, slideCount, deckPath: resolvedPath });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.generateRunStore.finishRun(runId, {
          status: 'failed',
          code: -1,
          message,
        });
        broadcastSSE(ctx.sseClients, 'generateFinished', { runId, success: false, message, slideCount: 0 });
      } finally {
        ctx.activeGenerate = false;
      }
    })();
  });

  return router;
}

// ── Prompt builders ─────────────────────────────────────────────────

async function buildFromOutlinePrompt(ctx, slidesDirectory, slidesDir, reqGenPackId, runId) {
  try {
    const backupPath = await backupSlides(slidesDirectory);
    if (backupPath) {
      broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Backed up existing slides' });
    }
  } catch (err) {
    console.error('Slide backup failed:', err);
  }

  const outlinePath = join(slidesDirectory, 'slide-outline.md');
  let outlineContent = '';
  try {
    outlineContent = await readFile(outlinePath, 'utf-8');
  } catch { /* no outline file */ }

  const outlinePackMatch = outlineContent.match(/^-\s*pack:\s*(.+)/im);
  const genPackId = normalizePackId(reqGenPackId) || normalizePackId(outlinePackMatch?.[1]);
  const packTemplateList = genPackId ? listPackTemplates(genPackId) : [];

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
  ];

  appendPackInstructions(promptLines, genPackId, packTemplateList);
  appendSlideSteps(promptLines, genPackId, slidesDir, { includeBackupNote: true });
  return promptLines.join('\n');
}

function buildFromScratchPrompt(topic, requirements, slideCountRange, slidesDir, reqGenPackId) {
  const countLabel = typeof slideCountRange === 'string' && slideCountRange.trim() ? slideCountRange.trim() : '8~12';
  const genPackId = normalizePackId(reqGenPackId);
  const packTemplateList = genPackId ? listPackTemplates(genPackId) : [];
  const hasDeckDir = !!slidesDir;

  const promptLines = [`주제: ${(topic || '').trim()}`];
  if (typeof requirements === 'string' && requirements.trim()) promptLines.push(`요구사항: ${requirements.trim()}`);
  promptLines.push(`슬라이드 수: ${countLabel}장`);
  if (hasDeckDir) promptLines.push(`작업 디렉토리: ${slidesDir}`);

  appendPackInstructions(promptLines, genPackId, packTemplateList);
  promptLines.push('', '다음 단계를 순서대로 수행하세요:', '');

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
  promptLines.push(`${stepNum}. ${dirRef}/slide-outline.md 아웃라인을 생성하세요.`);
  stepNum += 1;
  promptLines.push(
    `${stepNum}. 템플릿 기반으로 slide-01.html ~ slide-NN.html을 ${countLabel}장 생성하세요.`,
    '   - 크기: 720pt x 405pt (body width/height)',
    '   - 폰트: Pretendard CDN (link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css")',
    '   - 텍스트는 p, h1-h6, ul, ol, li 태그만 사용',
    genPackId ? `   - slides-grab show-template <name> --pack ${genPackId} 으로 템플릿 확인 후 활용` : '   - slides-grab show-template <name> 으로 템플릿 확인 후 활용',
    '   - 각 슬라이드는 독립적인 완전한 HTML 파일이어야 합니다',
  );
  stepNum += 1;
  promptLines.push(`${stepNum}. 승인 대기 없이 전체 슬라이드를 한번에 생성하세요.`);
  stepNum += 1;
  promptLines.push(`${stepNum}. 완료 후: node scripts/build-viewer.js --slides-dir ${dirRef}`);
  return promptLines.join('\n');
}

// ── Shared prompt helpers ───────────────────────────────────────────

function appendPackInstructions(promptLines, genPackId, packTemplateList) {
  if (!genPackId) return;
  promptLines.push('', `사용할 템플릿 팩: ${genPackId}`);
  if (packTemplateList.length > 0) promptLines.push(`이 팩의 보유 템플릿: ${packTemplateList.join(', ')}`);
  promptLines.push('', '각 슬라이드 생성 시:');
  promptLines.push(`- 팩에 있는 type → slides-grab show-template <type> --pack ${genPackId} 로 템플릿 기반 생성`);
  promptLines.push(`- 팩에 없는 type → slides-grab show-theme ${genPackId} 로 색상 확인 후, 720pt×405pt 크기로 직접 HTML 디자인`);
  promptLines.push('  (simple_light 템플릿을 복사하지 말고, 팩의 색상/분위기로 새로 만드세요)');
}

function appendSlideSteps(promptLines, genPackId, slidesDir, { includeBackupNote = false } = {}) {
  promptLines.push('다음 단계를 순서대로 수행하세요:', '');
  promptLines.push('1. 템플릿 기반으로 slide-01.html ~ slide-NN.html을 생성하세요.');
  promptLines.push('   - 크기: 720pt x 405pt (body width/height)');
  promptLines.push('   - 폰트: Pretendard CDN (link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css")');
  promptLines.push('   - 텍스트는 p, h1-h6, ul, ol, li 태그만 사용');
  promptLines.push(genPackId ? `   - slides-grab show-template <name> --pack ${genPackId} 으로 템플릿 확인 후 활용` : '   - slides-grab show-template <name> 으로 템플릿 확인 후 활용');
  if (includeBackupNote) promptLines.push('   - backup/ 폴더는 절대 수정하지 마세요 (이전 슬라이드 백업)');
  promptLines.push('   - 각 슬라이드는 독립적인 완전한 HTML 파일이어야 합니다', '');
  promptLines.push('2. 승인 대기 없이 전체 슬라이드를 한번에 생성하세요.', '');
  promptLines.push(`3. 완료 후: node scripts/build-viewer.js --slides-dir ${slidesDir}`);
}

// ── Detect newly created deck ───────────────────────────────────────

async function detectNewDeck(ctx) {
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
      ctx.setSlidesDir(bestDir);
      setupFileWatcher(ctx, bestDir);
      return bestDir;
    }
  } catch { /* ignore */ }
  return null;
}
