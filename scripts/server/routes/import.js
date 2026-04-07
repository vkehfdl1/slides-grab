import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';

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

const MAX_IMPORT_FILES = 5;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total across all files
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

/**
 * Import routes: markdown import, document import, multi-file import, import file serving.
 * Routes: GET /api/import-file, POST /api/import-md, POST /api/import-doc, POST /api/import-files
 */
export function createImportRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  // ── GET /api/import-file ────────────────────────────────────────────
  router.get('/api/import-file', async (_req, res) => {
    if (!opts.importFile) {
      return res.status(404).json({ error: 'No import file specified.' });
    }
    try {
      const absPath = resolve(process.cwd(), opts.importFile);
      let raw = await readFile(absPath, 'utf-8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      res.json({ content: raw, fileName: basename(absPath) });
    } catch (err) {
      res.status(404).json({ error: `Cannot read import file: ${err.message}` });
    }
  });

  // ── POST /api/import-md ─────────────────────────────────────────────
  router.post('/api/import-md', async (req, res) => {
    const { content: mdContent, filePath, model, slideCount, packId: reqImportPackId, userPrompt } = req.body ?? {};

    let rawMd = '';
    if (typeof mdContent === 'string' && mdContent.trim()) {
      rawMd = mdContent;
    } else if (typeof filePath === 'string' && filePath.trim()) {
      try {
        const absPath = resolve(process.cwd(), filePath.trim());
        rawMd = await readFile(absPath, 'utf-8');
        if (rawMd.charCodeAt(0) === 0xFEFF) rawMd = rawMd.slice(1);
      } catch (err) {
        return res.status(400).json({ error: `Cannot read file: ${err.message}` });
      }
    } else {
      return res.status(400).json({ error: 'Provide `content` or `filePath`.' });
    }

    if (!rawMd.trim()) return res.status(400).json({ error: 'Markdown content is empty.' });
    if (rawMd.length > 500_000) return res.status(400).json({ error: 'Content too large (max 500KB).' });
    if (!ctx.generateMutex.tryAcquire()) return res.status(409).json({ error: 'A generation is already in progress.' });

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim() : CLAUDE_MODELS[0];
    const runId = randomRunId();

    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: '(MD Import)' });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Converting markdown to slide outline' });
    res.json({ runId, topic: '(MD Import)', model: selectedModel });

    runImportPlan(ctx, {
      runId, model: selectedModel, reqPackId: reqImportPackId,
      slideCount: typeof slideCount === 'string' ? slideCount.trim() : '',
      userPrompt: typeof userPrompt === 'string' ? userPrompt.trim() : '',
      preambleLines: [
        '아래 마크다운 문서를 분석하여 프레젠테이션 아웃라인으로 변환하세요.',
        '', '--- 원본 마크다운 ---', rawMd, '--- 원본 마크다운 끝 ---', '',
        '분석 규칙:',
        '1. 문서에 슬라이드 구분(### 슬라이드 N, ## Slide N 등)이 있으면 그 구조를 그대로 따르세요.',
        '2. 슬라이드 구분이 없으면 내용을 분석하여 논리적 단위로 슬라이드를 구성하세요.',
        '3. **구성:** 섹션이 있으면 슬라이드의 시각적 내용으로 사용하세요.',
        '4. **발표 내용:** 섹션이 있으면 presenter-note로 보존하세요.',
        '5. 각 슬라이드에 가장 적합한 type을 배정하세요.',
        '6. 구성에 시각적 스타일 힌트(배경색, 색상 지시, 레이아웃 특수 요청 등)가 있으면 `- style:` 필드로 보존하세요.',
        '7. content가 구조화된 경우(왼쪽/오른쪽, 항목 나열 등) 들여쓴 하위 bullet(`  - left:`, `  - right:` 등)으로 작성하세요. YAML `|` 멀티라인 구문은 사용하지 마세요.',
      ],
      folderExample: '"AX 전환 발표" → ax-transformation',
    });
  });

  // ── POST /api/import-doc ────────────────────────────────────────────
  router.post('/api/import-doc', express.raw({ type: 'application/pdf', limit: '10mb' }), async (req, res) => {
    const { parseSource } = await import('../../../src/parsers.js');

    const sourceType = req.query.sourceType || req.headers['x-source-type'];
    const sourceUrl = req.query.url || req.headers['x-source-url'];

    if (!ctx.generateMutex.tryAcquire()) return res.status(409).json({ error: 'A generation is already in progress.' });

    let extractedText = '';
    let sourceLabel = '';
    let pageImages = [];
    let visionTmpDir = '';

    /** Parse a PDF result and extract vision metadata. */
    function applyPdfVision(result, label) {
      extractedText = result.text;
      pageImages = result.meta.pageImages || [];
      const renderedPages = result.meta.renderedPages || 0;
      const totalPages = result.meta.totalPages || result.meta.pages;
      sourceLabel = `${label} (${result.meta.pages} pages, ${renderedPages} page images)`;
      return { renderedPages, totalPages };
    }

    try {
      if (sourceType === 'pdf' || (req.is('application/pdf') && Buffer.isBuffer(req.body))) {
        const buffer = Buffer.isBuffer(req.body)
          ? req.body
          : (typeof req.body === 'object' && req.body?.pdfBase64)
            ? Buffer.from(req.body.pdfBase64, 'base64') : null;
        if (!buffer || buffer.length === 0) return res.status(400).json({ error: 'PDF body is empty.' });
        if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'PDF too large (max 10MB).' });

        visionTmpDir = await mkdtemp(join(tmpdir(), 'slides-grab-pdf-'));
        const result = await parseSource('upload.pdf', buffer, { vision: true, visionOutputDir: visionTmpDir });
        applyPdfVision(result, 'PDF');
      } else if (sourceType === 'url' || sourceUrl) {
        const url = sourceUrl || (typeof req.body === 'object' ? req.body?.url : '');
        if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Valid URL required.' });
        const result = await parseSource(url);
        extractedText = result.text;
        sourceLabel = `URL: ${result.meta.title || url}`;
      } else if (sourceType === 'pdf-path') {
        const filePath = typeof req.body === 'object' ? req.body?.filePath : '';
        if (!filePath) return res.status(400).json({ error: 'filePath required for pdf-path type.' });
        const absPath = resolve(process.cwd(), filePath.trim());

        visionTmpDir = await mkdtemp(join(tmpdir(), 'slides-grab-pdf-'));
        const result = await parseSource(absPath, null, { vision: true, visionOutputDir: visionTmpDir });
        applyPdfVision(result, 'PDF file');
      } else {
        return res.status(400).json({ error: 'Specify sourceType (pdf, url, pdf-path) or upload a PDF.' });
      }
    } catch (err) {
      ctx.generateMutex.release();
      if (visionTmpDir) await rm(visionTmpDir, { recursive: true, force: true }).catch(() => {});
      return res.status(400).json({ error: `Source parsing failed: ${err.message}` });
    }

    if (!extractedText.trim()) {
      ctx.generateMutex.release();
      if (visionTmpDir) await rm(visionTmpDir, { recursive: true, force: true }).catch(() => {});
      return res.status(400).json({ error: 'Extracted text is empty — the source may not contain readable content.' });
    }
    if (extractedText.length > 400_000) extractedText = extractedText.slice(0, 400_000) + '\n\n[… 원문 일부 생략됨]';

    // For binary PDF uploads, req.body is a Buffer so reqBody is {} — fall back to query string
    const reqBody = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {};
    const q = (key) => reqBody[key] || req.query[key] || '';

    const modelRaw = q('model');
    const model = typeof modelRaw === 'string' && CLAUDE_MODELS.includes(modelRaw.trim())
      ? modelRaw.trim() : CLAUDE_MODELS[0];

    const runId = randomRunId();

    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: `(Doc Import: ${sourceLabel})` });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: `Extracted text from ${sourceLabel}` });
    res.json({ runId, topic: `(Doc Import: ${sourceLabel})`, model, sourceLabel });

    const preambleLines = [
      '아래 문서 내용을 분석하여 프레젠테이션 아웃라인으로 변환하세요.',
      '', `원본 소스: ${sourceLabel}`, '',
    ];

    if (pageImages.length > 0) {
      preambleLines.push(
        `이 PDF의 ${pageImages.length}개 페이지 이미지가 첨부되어 있습니다.`,
        '이미지를 통해 차트, 다이어그램, 표, 이미지 등 시각적 요소를 파악하세요.',
        '텍스트 추출 결과와 이미지를 함께 참고하여 가장 정확한 아웃라인을 작성하세요.',
        '',
      );
    }

    preambleLines.push(
      '--- 원본 내용 ---', extractedText, '--- 원본 내용 끝 ---', '',
      '분석 규칙:',
      '1. 문서의 핵심 내용과 구조를 파악하세요.',
      '2. 내용을 논리적 단위로 나누어 슬라이드를 구성하세요.',
      '3. 숫자, 데이터, 인사이트를 우선 추출하세요.',
      '4. 각 슬라이드에 가장 적합한 type을 배정하세요.',
      '5. 원본의 핵심 메시지를 보존하되 발표에 적합하게 요약하세요.',
    );

    const rawSlideCount = q('slideCount');
    const rawUserPrompt = q('userPrompt');

    runImportPlan(ctx, {
      runId, model, reqPackId: q('packId'),
      slideCount: typeof rawSlideCount === 'string' ? rawSlideCount.trim() : '',
      userPrompt: typeof rawUserPrompt === 'string' ? rawUserPrompt.trim() : '',
      preambleLines,
      folderExample: '"AI 도입 보고서" → ai-adoption-report',
      imagePaths: pageImages.length > 0 ? pageImages : null,
      visionTmpDir,
    });
  });

  // ── POST /api/import-files (multi-file, JSON with base64 PDFs) ─────
  router.post('/api/import-files', express.json({ limit: '15mb' }), async (req, res) => {
    const { parseSource } = await import('../../../src/parsers.js');
    const { files, model, slideCount, packId, userPrompt } = req.body ?? {};

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided.' });
    }
    if (files.length > MAX_IMPORT_FILES) {
      return res.status(400).json({ error: `Too many files (max ${MAX_IMPORT_FILES}).` });
    }
    if (!ctx.generateMutex.tryAcquire()) {
      return res.status(409).json({ error: 'A generation is already in progress.' });
    }

    // Validate total size (base64 is ~33% larger than binary, estimate original)
    let estimatedSize = 0;
    for (const f of files) {
      if (f.type === 'pdf' && f.base64) {
        estimatedSize += Math.ceil(f.base64.length * 0.75);
      } else if (f.content) {
        estimatedSize += f.content.length;
      }
    }
    if (estimatedSize > MAX_TOTAL_SIZE) {
      return res.status(400).json({ error: 'Total file size too large (max 10MB).' });
    }

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim() : CLAUDE_MODELS[0];

    const runId = randomRunId();

    const fileNames = files.map((f) => f.name || 'unknown').join(', ');
    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: `(Multi-file Import: ${files.length} files)` });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: `Parsing ${files.length} files: ${fileNames}` });
    res.json({ runId, topic: `(Multi-file Import: ${files.length} files)`, model: selectedModel, fileCount: files.length });

    runMultiFileImport(ctx, {
      runId, files, model: selectedModel,
      reqPackId: packId,
      slideCount: typeof slideCount === 'string' ? slideCount.trim() : '',
      userPrompt: typeof userPrompt === 'string' ? userPrompt.trim() : '',
    });
  });

  return router;
}

// ── Multi-file import runner ────────────────────────────────────────

async function parseFileEntry(entry, parseSource, visionTmpDir) {
  const name = entry.name || 'unknown';
  const ext = extname(name).toLowerCase();

  if (TEXT_EXTENSIONS.has(ext) && typeof entry.content === 'string') {
    let text = entry.content;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return { name, text, pageImages: [] };
  }

  if (ext === '.pdf' && entry.base64) {
    const buffer = Buffer.from(entry.base64, 'base64');
    if (buffer.length === 0) return { name, text: '', pageImages: [] };
    const result = await parseSource(name, buffer, { vision: true, visionOutputDir: visionTmpDir });
    const pages = result.meta.pages || 0;
    const renderedPages = result.meta.renderedPages || 0;
    const label = `${name} (${pages} pages, ${renderedPages} page images)`;
    return { name: label, text: result.text, pageImages: result.meta.pageImages || [] };
  }

  return { name, text: '', pageImages: [] };
}

function runMultiFileImport(ctx, { runId, files, model, reqPackId, slideCount, userPrompt }) {
  (async () => {
    let visionTmpDir = '';
    try {
      const { parseSource } = await import('../../../src/parsers.js');
      visionTmpDir = await mkdtemp(join(tmpdir(), 'slides-grab-multi-'));

      broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Extracting content from files' });

      const parsed = [];
      for (const entry of files) {
        const result = await parseFileEntry(entry, parseSource, visionTmpDir);
        if (result.text.trim()) parsed.push(result);
      }

      if (parsed.length === 0) {
        broadcastSSE(ctx.sseClients, 'planFinished', { runId, success: false, message: 'No readable content found in any of the uploaded files.', outline: null });
        return;
      }

      // Combine texts with file separators
      const allPageImages = [];
      const textParts = [];
      for (const p of parsed) {
        textParts.push(`--- 파일: ${p.name} ---`);
        textParts.push(p.text);
        textParts.push(`--- 파일 끝: ${p.name} ---`);
        textParts.push('');
        allPageImages.push(...p.pageImages);
      }

      let combinedText = textParts.join('\n');
      if (combinedText.length > 500_000) {
        combinedText = combinedText.slice(0, 500_000) + '\n\n[… 원문 일부 생략됨]';
      }

      const preambleLines = [
        `아래 ${parsed.length}개 파일의 내용을 분석하여 프레젠테이션 아웃라인으로 변환하세요.`,
        `파일 목록: ${parsed.map((p) => p.name).join(', ')}`,
        '',
      ];

      if (allPageImages.length > 0) {
        preambleLines.push(
          `PDF 파일에서 총 ${allPageImages.length}개 페이지 이미지가 첨부되어 있습니다.`,
          '이미지를 통해 차트, 다이어그램, 표, 이미지 등 시각적 요소를 파악하세요.',
          '텍스트 추출 결과와 이미지를 함께 참고하여 가장 정확한 아웃라인을 작성하세요.',
          '',
        );
      }

      preambleLines.push(
        combinedText, '',
        '분석 규칙:',
        '1. 모든 파일의 내용을 종합적으로 분석하세요.',
        '2. 내용을 논리적 단위로 나누어 슬라이드를 구성하세요.',
        '3. 숫자, 데이터, 인사이트를 우선 추출하세요.',
        '4. 각 슬라이드에 가장 적합한 type을 배정하세요.',
        '5. 파일 간 관련 내용을 적절히 통합하거나 교차 참조하세요.',
      );

      runImportPlan(ctx, {
        runId, model, reqPackId,
        slideCount, userPrompt,
        preambleLines,
        folderExample: '"AI 도입 보고서" → ai-adoption-report',
        imagePaths: allPageImages.length > 0 ? allPageImages : null,
        visionTmpDir,
      });
    } catch (err) {
      broadcastSSE(ctx.sseClients, 'planFinished', { runId, success: false, message: err instanceof Error ? err.message : String(err), outline: null });
      ctx.generateMutex.release();
      if (visionTmpDir) await rm(visionTmpDir, { recursive: true, force: true }).catch(() => {});
    }
  })().catch((err) => {
    console.error('[import/multi] Unhandled error in async block:', err);
  });
}

// ── Shared import plan runner ───────────────────────────────────────

function runImportPlan(ctx, { runId, model, reqPackId, slideCount, userPrompt, preambleLines, folderExample, imagePaths, visionTmpDir }) {
  (async () => {
    try {
      const promptLines = [...preambleLines];

      promptLines.push('6. 원본 문서의 내용만 사용하세요.');
      if (slideCount) promptLines.push(`7. 목표 슬라이드 수: ${slideCount}장`);

      if (userPrompt) {
        const trimmedPrompt = userPrompt.slice(0, 2000);
        promptLines.push('', '--- 사용자 추가 지시사항 ---');
        promptLines.push(trimmedPrompt);
        promptLines.push('--- 사용자 추가 지시사항 끝 ---');
        promptLines.push('위 사용자 지시사항을 반드시 반영하여 아웃라인을 작성하세요.');
      }

      promptLines.push('', '다음을 수행하세요:', '');
      promptLines.push(`1. 주제에서 핵심 키워드 2~3개를 뽑아 영어 소문자 kebab-case 폴더명을 결정하세요.`);
      promptLines.push(`   예: ${folderExample}`);
      promptLines.push('');
      promptLines.push('2. 해당 폴더에 slide-outline.md를 생성하세요. (HTML 슬라이드는 생성하지 마세요)');
      promptLines.push('   mkdir -p decks/<name> && 아웃라인 파일만 작성');
      promptLines.push('');
      const importPackId = normalizePackId(reqPackId);
      const existingDeckNames = await listExistingDeckNames();
      appendOutlinePrompt(promptLines, importPackId, { includePresenterNote: true, existingDeckNames });

      broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Converting with AI' });

      const result = await spawnClaudeEdit({
        prompt: promptLines.join('\n'),
        imagePath: null,
        imagePaths: imagePaths || null,
        model,
        cwd: process.cwd(),
        onLog: (stream, chunk) => { broadcastSSE(ctx.sseClients, 'planLog', { runId, stream, chunk }); },
      });

      const success = result.code === 0;
      let outline = null;
      let detectedDeckName = '';

      if (success) {
        broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Parsing generated outline' });
        try {
          const decksRoot = resolve(process.cwd(), 'decks');
          const dirs = await readdir(decksRoot, { withFileTypes: true });
          let bestDir = '', bestMtime = 0;
          for (const d of dirs) {
            if (!d.isDirectory()) continue;
            const outlinePath = join(decksRoot, d.name, 'slide-outline.md');
            try { const s = await stat(outlinePath); if (s.mtimeMs > bestMtime) { bestMtime = s.mtimeMs; bestDir = d.name; } } catch { /* */ }
          }
          if (bestDir) {
            detectedDeckName = bestDir;
            const outlineContent = await readFile(join(decksRoot, bestDir, 'slide-outline.md'), 'utf-8');
            outline = parseOutline(outlineContent, bestDir);
            ctx.setSlidesDir(join(decksRoot, bestDir));
            setupFileWatcher(ctx, ctx.getSlidesDir());
          }
        } catch (err) { console.error('Failed to parse imported outline:', err); }
      }

      broadcastSSE(ctx.sseClients, 'planFinished', {
        runId, success,
        message: success ? 'Outline ready.' : `Import failed (exit code ${result.code}).`,
        outline, deckName: detectedDeckName,
      });
    } catch (err) {
      broadcastSSE(ctx.sseClients, 'planFinished', { runId, success: false, message: err instanceof Error ? err.message : String(err), outline: null });
    } finally {
      ctx.generateMutex.release();
      if (visionTmpDir) {
        await rm(visionTmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  })().catch((err) => {
    console.error('[import/plan] Unhandled error in async block:', err);
  });
}
