import { execFile } from 'node:child_process';

import { spawnClaudeEdit, inlineDesignMdRefs } from './spawn.js';
import { appendPackInstructions, appendImageInstructions, appendImageAssetsInstructions } from './routes/generate.js';

const DEFAULT_CONCURRENCY = Number(process.env.SLIDES_GRAB_PARALLEL) || 3;
const MAX_CONCURRENCY = 5;
const BATCH_TIMEOUT = 480_000; // 8 min per batch — Opus needs extra time for complex slides

/**
 * Split slides into roughly equal batches.
 */
export function splitIntoBatches(slides, concurrency = DEFAULT_CONCURRENCY) {
  const n = Math.min(Math.max(1, concurrency), MAX_CONCURRENCY);
  const batchCount = Math.min(n, Math.ceil(slides.length / 2));
  const batchSize = Math.ceil(slides.length / batchCount);
  const batches = [];
  for (let i = 0; i < slides.length; i += batchSize) {
    batches.push(slides.slice(i, i + batchSize).map((slide, j) => ({ ...slide, slideIndex: i + j })));
  }
  return batches;
}

/**
 * Build a prompt for a single batch of slides.
 * Includes the FULL outline for consistency — each batch sees the whole picture
 * but only generates its assigned slides.
 */
export function buildBatchPrompt({ batchSlides, outlineContent, genPackId, slidesDir, useImages = false, availableAssets = [] }) {
  const slideNumbers = batchSlides.map(s => String(s.slideIndex + 1).padStart(2, '0'));
  const slideNumberSet = new Set(batchSlides.map(s => s.slideIndex + 1));
  const fileList = slideNumbers.map(n => `slide-${n}.html`).join(', ');

  const lines = [
    `작업 디렉토리: ${slidesDir}`,
    '',
    '이 작업은 전체 슬라이드 중 일부만 생성하는 배치 작업입니다.',
    `**중요: ${fileList}만 생성하세요. 다른 슬라이드는 다른 에이전트가 동시에 생성합니다.**`,
    '',
    '전체 아웃라인을 참고하여 발표 전체의 흐름, 톤, 스타일 일관성을 유지하세요.',
    '',
  ];
  // Filter assets to only those relevant to this batch
  const batchAssets = availableAssets.filter(a => slideNumberSet.has(a.slideNumber));
  if (batchAssets.length > 0) {
    appendImageAssetsInstructions(lines, batchAssets);
  } else if (useImages) {
    appendImageInstructions(lines, slidesDir);
  }
  lines.push(
    '--- 전체 아웃라인 (참고용) ---',
    outlineContent,
    '--- 아웃라인 끝 ---',
    '',
  );

  appendPackInstructions(lines, genPackId);

  // Assigned slides
  lines.push('', `**이 배치에서 생성할 슬라이드: ${fileList}**`);
  lines.push('');
  lines.push(`${fileList}을 생성하세요.`);
  lines.push('   - 크기: 720pt x 405pt (body width/height)');
  lines.push('   - 폰트: Pretendard CDN (link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css")');
  lines.push('   - 텍스트는 p, h1-h6, ul, ol, li 태그만 사용');
  lines.push('   - design.md의 mood, signature elements, CSS patterns를 따라 생성');
  lines.push('   - 각 슬라이드는 독립적인 완전한 HTML 파일이어야 합니다');
  lines.push('   - backup/ 폴더는 절대 수정하지 마세요');
  lines.push('');
  lines.push('승인 대기 없이 한번에 생성하세요.');

  return lines.join('\n');
}

/**
 * Run build-viewer.js after all slides are generated.
 */
function runBuildViewer(slidesDir) {
  return new Promise((resolve, reject) => {
    execFile('node', ['scripts/build-viewer.js', '--slides-dir', slidesDir], {
      cwd: process.cwd(),
      timeout: 30_000,
    }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

/**
 * Generate slides in parallel batches using multiple Claude subprocesses.
 */
export async function parallelGenerate({
  outline, outlineContent, genPackId, slidesDir, model, cwd,
  onBatchProgress, onBatchLog, useImages = false, availableAssets = [],
}) {
  const concurrency = Math.min(
    Number(process.env.SLIDES_GRAB_PARALLEL) || DEFAULT_CONCURRENCY,
    MAX_CONCURRENCY,
  );
  const batches = splitIntoBatches(outline.slides, concurrency);
  const totalBatches = batches.length;

  onBatchProgress?.(0, totalBatches, `Splitting ${outline.slides.length} slides into ${totalBatches} batches`);

  const batchPrompts = batches.map(batch => {
    const raw = buildBatchPrompt({
      batchSlides: batch,
      outlineContent,
      genPackId,
      slidesDir,
      useImages,
      availableAssets,
    });
    return inlineDesignMdRefs(raw);
  });

  // Spawn all batches concurrently
  const results = await Promise.allSettled(
    batchPrompts.map((prompt, idx) => {
      onBatchProgress?.(idx, totalBatches, `Starting batch ${idx + 1}/${totalBatches}`);
      return spawnClaudeEdit({
        prompt,
        imagePath: null,
        model,
        cwd,
        timeout: BATCH_TIMEOUT,
        onLog: (stream, chunk) => onBatchLog?.(idx, stream, chunk),
      });
    }),
  );

  // Aggregate results
  let successCount = 0;
  let failCount = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value.code === 0) {
      successCount++;
      onBatchProgress?.(i, totalBatches, `Batch ${i + 1} complete`);
    } else {
      failCount++;
      const reason = r.status === 'rejected' ? r.reason?.message : `exit code ${r.value?.code}`;
      onBatchProgress?.(i, totalBatches, `Batch ${i + 1} failed: ${reason}`);
      onBatchLog?.(i, 'stderr', `\n[Batch ${i + 1} FAILED] ${reason}\n`);
    }
  }

  // Run build-viewer if any slides succeeded
  if (successCount > 0) {
    try {
      await runBuildViewer(slidesDir);
    } catch (err) {
      console.error('[parallel-generate] build-viewer failed:', err.message);
    }
  }

  return {
    code: successCount > 0 ? 0 : 1,
    successCount,
    failCount,
    totalBatches,
  };
}
