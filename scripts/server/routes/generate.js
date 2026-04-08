import { readdir, readFile, mkdir, rename, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve, relative } from 'node:path';

import { CLAUDE_MODELS, CODEX_MODELS, isClaudeModel } from '../../../src/editor/codex-edit.js';
import { listPackTemplates, normalizePackId } from '../../../src/resolve.js';

import { broadcastSSE } from '../sse.js';
import { randomRunId, toPosixPath, listSlideFiles, spawnAIEdit, setupFileWatcher, backupSlides, uniqueDeckName, listExistingDeckNames, syncPackInOutline } from '../helpers.js';
import { parseOutline } from '../outline.js';
import { parallelGenerate } from '../parallel-generate.js';

const ALL_MODELS = [...CLAUDE_MODELS, ...CODEX_MODELS];

/** Slide generation route: POST /api/generate */
export function createGenerateRouter(ctx) {
  const { express } = ctx;
  const router = express.Router();

  router.post('/api/generate', async (req, res) => {
    const { topic, requirements, model, deckName, slideCount: slideCountRange, fromOutline, packId: reqGenPackId } = req.body ?? {};

    if (!fromOutline && (typeof topic !== 'string' || topic.trim() === '')) {
      return res.status(400).json({ error: 'Missing or invalid `topic`.' });
    }

    if (!ctx.generateMutex.tryAcquire()) {
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
        const uniqueName = await uniqueDeckName(folderName);
        slidesDirectory = resolve(process.cwd(), 'decks', uniqueName);
        ctx.setSlidesDir(slidesDirectory);
        await mkdir(slidesDirectory, { recursive: true });
        setupFileWatcher(ctx, slidesDirectory);
      }
    }

    const selectedModel = typeof model === 'string' && ALL_MODELS.includes(model.trim())
      ? model.trim()
      : CLAUDE_MODELS[0];

    const runId = randomRunId();

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
        let result;

        const onLog = (stream, chunk) => {
          ctx.generateRunStore.appendLog(runId, chunk);
          broadcastSSE(ctx.sseClients, 'generateLog', { runId, stream, chunk });
        };

        // Parallel path: fromOutline + Claude + 4+ slides
        if (fromOutline && slidesDirectory && isClaudeModel(selectedModel)) {
          const { outlineContent, genPackId } = await prepareOutlineContext(ctx, slidesDirectory, slidesDir, reqGenPackId, runId);
          const outline = parseOutline(outlineContent, basename(slidesDirectory));

          if (outline.slides.length > 3) {
            broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: `Building ${outline.slides.length} slides in parallel` });

            result = await parallelGenerate({
              outline, outlineContent, genPackId, slidesDir,
              model: selectedModel, cwd: process.cwd(),
              onBatchProgress: (_idx, _total, step) => {
                broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step });
              },
              onBatchLog: (_idx, stream, chunk) => onLog(stream, chunk),
            });
          } else {
            const fullPrompt = buildFromOutlinePromptFull(outlineContent, genPackId, slidesDir);
            broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Building slides with AI' });
            result = await spawnAIEdit({ prompt: fullPrompt, imagePath: null, model: selectedModel, cwd: process.cwd(), onLog });
          }
        } else if (fromOutline && slidesDirectory) {
          const fullPrompt = await buildFromOutlinePrompt(ctx, slidesDirectory, slidesDir, reqGenPackId, runId);
          broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Building slides with AI' });
          result = await spawnAIEdit({ prompt: fullPrompt, imagePath: null, model: selectedModel, cwd: process.cwd(), onLog });
        } else {
          const existingNames = slidesDir ? [] : await listExistingDeckNames();
          const fullPrompt = buildFromScratchPrompt(topic, requirements, slideCountRange, slidesDir, reqGenPackId, existingNames);
          broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Building slides with AI' });
          result = await spawnAIEdit({ prompt: fullPrompt, imagePath: null, model: selectedModel, cwd: process.cwd(), onLog });
        }

        const success = result.code === 0;

        if (success) {
          broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Finalizing slides' });
        }

        // If slidesDirectory is still unset, detect the folder Claude created
        slidesDirectory = ctx.getSlidesDir();
        if (!slidesDirectory && success) {
          slidesDirectory = await detectNewDeck(ctx);
        }

        // Count slides on disk (even on failure — partial results may exist)
        let slideCount = 0;
        let validSlideCount = 0;
        try {
          slidesDirectory = ctx.getSlidesDir();
          if (slidesDirectory) {
            const files = await listSlideFiles(slidesDirectory);
            slideCount = files.length;
            // Validate each file has minimal HTML structure (>100 bytes with <body or <html)
            for (const f of files) {
              try {
                const content = await readFile(join(slidesDirectory, f), 'utf-8');
                if (content.length > 100 && (/<body[\s>]/i.test(content) || /<html[\s>]/i.test(content))) {
                  validSlideCount++;
                }
              } catch { /* skip unreadable files */ }
            }
          }
        } catch { /* ignore */ }

        // Determine final status: success only if Claude exited 0 AND valid slides exist
        const finalSuccess = success && validSlideCount > 0;

        const resolvedPath = slidesDirectory
          ? toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory)
          : '';

        let message;
        if (finalSuccess) {
          message = validSlideCount < slideCount
            ? `${validSlideCount}/${slideCount} valid slides generated (${slideCount - validSlideCount} malformed).`
            : `${slideCount} slides generated.`;
        } else if (success && validSlideCount === 0) {
          message = slideCount > 0
            ? `Generation completed but ${slideCount} slides are malformed.`
            : 'Generation completed but no slides were created.';
        } else {
          message = slideCount > 0
            ? `Generation failed (exit code ${result.code}). ${slideCount} partial slides on disk.`
            : `Generation failed (exit code ${result.code}).`;
        }

        ctx.generateRunStore.finishRun(runId, {
          status: finalSuccess ? 'success' : 'failed',
          code: result.code,
          message,
        });

        broadcastSSE(ctx.sseClients, 'generateFinished', {
          runId, success: finalSuccess, message, slideCount: validSlideCount,
          partialSlideCount: !finalSuccess && slideCount > 0 ? slideCount : undefined,
          deckPath: resolvedPath,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.generateRunStore.finishRun(runId, {
          status: 'failed',
          code: -1,
          message,
        });
        broadcastSSE(ctx.sseClients, 'generateFinished', { runId, success: false, message, slideCount: 0 });
      } finally {
        ctx.generateMutex.release();
      }
    })().catch((err) => {
      console.error('[generate] Unhandled error in async block:', err);
    });
  });

  return router;
}

// ── Prompt builders ─────────────────────────────────────────────────

/**
 * Shared: read outline, resolve pack, backup slides.
 * Returns { outlineContent, genPackId } for both parallel and single-process paths.
 */
async function prepareOutlineContext(ctx, slidesDirectory, slidesDir, reqGenPackId, runId) {
  const backupPath = await backupSlides(slidesDirectory);
  if (backupPath) {
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'generate', step: 'Backed up existing slides' });
  }

  const outlinePath = join(slidesDirectory, 'slide-outline.md');
  let outlineContent = '';
  try {
    outlineContent = await readFile(outlinePath, 'utf-8');
  } catch {
    throw new Error('Outline file not found: slide-outline.md');
  }
  if (!outlineContent.trim()) {
    throw new Error('Outline file is empty.');
  }
  if (!/^###\s+Slide\s+\d+/im.test(outlineContent)) {
    throw new Error('Outline has no slide definitions (expected "### Slide N" headers).');
  }

  const outlinePackMatch = outlineContent.match(/^-\s*pack:\s*(.+)/im);
  const requestPack = normalizePackId(reqGenPackId);
  const outlinePack = normalizePackId(outlinePackMatch?.[1]);
  const genPackId = (requestPack && requestPack !== 'auto') ? requestPack : outlinePack || requestPack;

  return { outlineContent: syncPackInOutline(outlineContent, genPackId), genPackId };
}

/**
 * Build full single-process prompt from outline context.
 */
function buildFromOutlinePromptFull(outlineContent, genPackId, slidesDir) {
  const packTemplateList = genPackId && genPackId !== 'auto' ? listPackTemplates(genPackId, { includeFallback: true }) : [];
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

/**
 * Legacy: full prompt builder (for non-parallel paths that call this directly).
 */
async function buildFromOutlinePrompt(ctx, slidesDirectory, slidesDir, reqGenPackId, runId) {
  const { outlineContent, genPackId } = await prepareOutlineContext(ctx, slidesDirectory, slidesDir, reqGenPackId, runId);
  return buildFromOutlinePromptFull(outlineContent, genPackId, slidesDir);
}

function buildFromScratchPrompt(topic, requirements, slideCountRange, slidesDir, reqGenPackId, existingDeckNames = []) {
  const countLabel = typeof slideCountRange === 'string' && slideCountRange.trim() ? slideCountRange.trim() : '';
  const genPackId = normalizePackId(reqGenPackId);
  const packTemplateList = genPackId && genPackId !== 'auto' ? listPackTemplates(genPackId, { includeFallback: true }) : [];
  const hasDeckDir = !!slidesDir;

  const promptLines = [`주제: ${(topic || '').trim()}`];
  if (typeof requirements === 'string' && requirements.trim()) promptLines.push(`요구사항: ${requirements.trim()}`);
  if (countLabel) {
    promptLines.push(`슬라이드 수: ${countLabel}장`);
  } else {
    promptLines.push('슬라이드 수: 주제에 적합한 분량으로 자유롭게 결정하세요 (보통 8~12장)');
  }
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
    if (existingDeckNames.length > 0) {
      promptLines.push(
        '',
        '   중복 방지 규칙:',
        `   다음 이름의 덱 폴더가 이미 존재합니다: ${existingDeckNames.join(', ')}`,
        '   이미 존재하는 이름을 사용하지 마세요. 중복 시 이름 뒤에 -2, -3 등을 붙이세요.',
        '   예: ai-trends가 이미 있으면 → ai-trends-2',
      );
    }
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
    `   - slides-grab show-template <name>${genPackId && genPackId !== 'auto' ? ` --pack ${genPackId}` : ''} 으로 템플릿 확인 후 활용`,
    '   - 각 슬라이드는 독립적인 완전한 HTML 파일이어야 합니다',
  );
  stepNum += 1;
  promptLines.push(`${stepNum}. 승인 대기 없이 전체 슬라이드를 한번에 생성하세요.`);
  stepNum += 1;
  promptLines.push(`${stepNum}. 완료 후: node scripts/build-viewer.js --slides-dir ${dirRef}`);
  return promptLines.join('\n');
}

// ── Shared prompt helpers ───────────────────────────────────────────

export function appendPackInstructions(promptLines, genPackId, packTemplateList) {
  if (!genPackId) return;

  if (genPackId === 'auto') {
    promptLines.push('', '## 템플릿 팩: AI 자동 선택');
    promptLines.push('사용자가 팩을 지정하지 않았습니다. 주제와 청중에 가장 어울리는 팩을 아래 매트릭스에서 선택하세요.');
    promptLines.push('');
    promptLines.push('### Style Recommendation Matrix');
    promptLines.push('| 발표 목적 | 추천 팩 |');
    promptLines.push('|-----------|---------|');
    promptLines.push('| 테크 / AI / 스타트업 | glassmorphism, aurora-neon-glow, cyberpunk-outline, scifi-holographic |');
    promptLines.push('| 기업 / 컨설팅 / 금융 | swiss-international, monochrome-minimal, editorial-magazine, architectural-blueprint |');
    promptLines.push('| 교육 / 연구 / 역사 | dark-academia, nordic-minimalism, brutalist-newspaper |');
    promptLines.push('| 브랜드 / 마케팅 | gradient-mesh, typographic-bold, duotone-split, risograph-print |');
    promptLines.push('| 제품 / 앱 / UX | bento-grid, claymorphism, pastel-soft-ui, liquid-blob |');
    promptLines.push('| 엔터테인먼트 / 게이밍 | retro-y2k, dark-neon-miami, vaporwave, memphis-pop |');
    promptLines.push('| 에코 / 웰니스 / 문화 | handcrafted-organic, nordic-minimalism, dark-forest |');
    promptLines.push('| IT 인프라 / 아키텍처 | isometric-3d-flat, cyberpunk-outline, architectural-blueprint |');
    promptLines.push('| 포트폴리오 / 아트 / 크리에이티브 | monochrome-minimal, editorial-magazine, risograph-print, maximalist-collage |');
    promptLines.push('| 피치덱 / 전략 | neo-brutalism, duotone-split, bento-grid, art-deco-luxe |');
    promptLines.push('| 럭셔리 / 이벤트 / 갈라 | art-deco-luxe, monochrome-minimal, dark-academia |');
    promptLines.push('| 바이오 / 혁신 / 과학 | liquid-blob, scifi-holographic, aurora-neon-glow |');
    promptLines.push('');
    promptLines.push('### 선택 절차');
    promptLines.push('1. 주제를 분석하여 위 매트릭스에서 가장 적합한 카테고리를 찾으세요.');
    promptLines.push('2. 해당 카테고리의 추천 팩 중 하나를 선택하세요.');
    promptLines.push('3. 선택한 팩의 design.md를 읽으세요: `cat packs/<선택한-pack-id>/design.md`');
    promptLines.push('4. design.md의 mood, signature elements, CSS patterns를 따라 슬라이드를 생성하세요.');
    promptLines.push('');
    promptLines.push('**확신이 없으면 `simple_light`를 사용하세요.**');
    return;
  }

  promptLines.push('', `사용할 팩: ${genPackId}`);
  if (packTemplateList.length > 0) promptLines.push(`사용 가능 템플릿: ${packTemplateList.join(', ')}`);
  promptLines.push('', '각 슬라이드 생성 시:');
  promptLines.push(`1. 먼저 팩의 디자인 사양을 읽으세요: cat packs/${genPackId}/design.md`);
  promptLines.push(`2. slides-grab show-template <type> --pack ${genPackId} 로 템플릿 구조를 참고하세요`);
  promptLines.push(`3. design.md의 mood, signature elements, CSS patterns를 반드시 적용하여 팩 고유 스타일로 생성하세요`);
  promptLines.push(`4. 팩에 없는 type → slides-grab show-theme ${genPackId} 로 색상 확인 후 직접 디자인`);
  promptLines.push('  (템플릿은 구조 참고용입니다. 반드시 design.md의 스타일을 적용하세요)');
}

function appendSlideSteps(promptLines, genPackId, slidesDir, { includeBackupNote = false } = {}) {
  promptLines.push('다음 단계를 순서대로 수행하세요:', '');
  promptLines.push('1. 템플릿 기반으로 slide-01.html ~ slide-NN.html을 생성하세요.');
  promptLines.push('   - 크기: 720pt x 405pt (body width/height)');
  promptLines.push('   - 폰트: Pretendard CDN (link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css")');
  promptLines.push('   - 텍스트는 p, h1-h6, ul, ol, li 태그만 사용');
  const packArg = genPackId && genPackId !== 'auto' ? ` --pack ${genPackId}` : '';
  promptLines.push(`   - slides-grab show-template <name>${packArg} 으로 템플릿 확인 후 활용`);
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
