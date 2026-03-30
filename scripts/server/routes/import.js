import { readdir, readFile, stat } from 'node:fs/promises';
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
} from '../helpers.js';

/**
 * Import routes: markdown import, document import, import file serving.
 * Routes: GET /api/import-file, POST /api/import-md, POST /api/import-doc
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
    const { content: mdContent, filePath, model, slideCount, researchMode, packId: reqImportPackId } = req.body ?? {};

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
    if (ctx.activeGenerate) return res.status(409).json({ error: 'A generation is already in progress.' });

    const selectedModel = typeof model === 'string' && CLAUDE_MODELS.includes(model.trim())
      ? model.trim() : CLAUDE_MODELS[0];
    const runId = randomRunId();
    ctx.activeGenerate = true;

    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: '(MD Import)' });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Converting markdown to slide outline' });
    res.json({ runId, topic: '(MD Import)', model: selectedModel });

    runImportPlan(ctx, {
      runId, model: selectedModel, reqPackId: reqImportPackId,
      slideCount: typeof slideCount === 'string' ? slideCount.trim() : '',
      useResearch: researchMode === 'research',
      preambleLines: [
        '아래 마크다운 문서를 분석하여 프레젠테이션 아웃라인으로 변환하세요.',
        '', '--- 원본 마크다운 ---', rawMd, '--- 원본 마크다운 끝 ---', '',
        '분석 규칙:',
        '1. 문서에 슬라이드 구분(### 슬라이드 N, ## Slide N 등)이 있으면 그 구조를 그대로 따르세요.',
        '2. 슬라이드 구분이 없으면 내용을 분석하여 논리적 단위로 슬라이드를 구성하세요.',
        '3. **구성:** 섹션이 있으면 슬라이드의 시각적 내용으로 사용하세요.',
        '4. **발표 내용:** 섹션이 있으면 presenter-note로 보존하세요.',
        '5. 각 슬라이드에 가장 적합한 type을 배정하세요.',
      ],
      folderExample: '"AX 전환 발표" → ax-transformation',
    });
  });

  // ── POST /api/import-doc ────────────────────────────────────────────
  router.post('/api/import-doc', express.raw({ type: 'application/pdf', limit: '10mb' }), async (req, res) => {
    const { parseSource } = await import('../../../src/parsers.js');

    const sourceType = req.query.sourceType || req.headers['x-source-type'];
    const sourceUrl = req.query.url || req.headers['x-source-url'];

    if (ctx.activeGenerate) return res.status(409).json({ error: 'A generation is already in progress.' });

    let extractedText = '';
    let sourceLabel = '';

    try {
      if (sourceType === 'pdf' || (req.is('application/pdf') && Buffer.isBuffer(req.body))) {
        const buffer = Buffer.isBuffer(req.body)
          ? req.body
          : (typeof req.body === 'object' && req.body?.pdfBase64)
            ? Buffer.from(req.body.pdfBase64, 'base64') : null;
        if (!buffer || buffer.length === 0) return res.status(400).json({ error: 'PDF body is empty.' });
        if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'PDF too large (max 10MB).' });
        const result = await parseSource('upload.pdf', buffer);
        extractedText = result.text;
        sourceLabel = `PDF (${result.meta.pages} pages)`;
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
        const result = await parseSource(absPath);
        extractedText = result.text;
        sourceLabel = `PDF file (${result.meta.pages} pages)`;
      } else {
        return res.status(400).json({ error: 'Specify sourceType (pdf, url, pdf-path) or upload a PDF.' });
      }
    } catch (err) {
      return res.status(400).json({ error: `Source parsing failed: ${err.message}` });
    }

    if (!extractedText.trim()) return res.status(400).json({ error: 'Extracted text is empty — the source may not contain readable content.' });
    if (extractedText.length > 400_000) extractedText = extractedText.slice(0, 400_000) + '\n\n[… 원문 일부 생략됨]';

    const reqBody = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {};
    const model = typeof reqBody.model === 'string' && CLAUDE_MODELS.includes(reqBody.model.trim())
      ? reqBody.model.trim() : CLAUDE_MODELS[0];

    const runId = randomRunId();
    ctx.activeGenerate = true;

    broadcastSSE(ctx.sseClients, 'planStarted', { runId, topic: `(Doc Import: ${sourceLabel})` });
    broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: `Extracted text from ${sourceLabel}` });
    res.json({ runId, topic: `(Doc Import: ${sourceLabel})`, model, sourceLabel });

    runImportPlan(ctx, {
      runId, model, reqPackId: reqBody.packId,
      slideCount: typeof reqBody.slideCount === 'string' ? reqBody.slideCount.trim() : '',
      useResearch: reqBody.researchMode === 'research',
      preambleLines: [
        '아래 문서 내용을 분석하여 프레젠테이션 아웃라인으로 변환하세요.',
        '', `원본 소스: ${sourceLabel}`, '',
        '--- 원본 내용 ---', extractedText, '--- 원본 내용 끝 ---', '',
        '분석 규칙:',
        '1. 문서의 핵심 내용과 구조를 파악하세요.',
        '2. 내용을 논리적 단위로 나누어 슬라이드를 구성하세요.',
        '3. 숫자, 데이터, 인사이트를 우선 추출하세요.',
        '4. 각 슬라이드에 가장 적합한 type을 배정하세요.',
        '5. 원본의 핵심 메시지를 보존하되 발표에 적합하게 요약하세요.',
      ],
      folderExample: '"AI 도입 보고서" → ai-adoption-report',
    });
  });

  return router;
}

// ── Shared import plan runner ───────────────────────────────────────

function runImportPlan(ctx, { runId, model, reqPackId, slideCount, useResearch, preambleLines, folderExample }) {
  (async () => {
    try {
      const promptLines = [...preambleLines];

      if (useResearch) {
        promptLines.push('6. 웹 리서치를 추가로 수행하여 내용을 보강하세요. 최신 데이터, 통계, 사례를 추가할 수 있습니다.');
      } else {
        promptLines.push('6. 원본 마크다운의 내용만 사용하세요. 추가 리서치는 하지 마세요.');
      }
      if (slideCount) promptLines.push(`7. 목표 슬라이드 수: ${slideCount}장`);

      promptLines.push('', '다음을 수행하세요:', '');
      promptLines.push(`1. 주제에서 핵심 키워드 2~3개를 뽑아 영어 소문자 kebab-case 폴더명을 결정하세요.`);
      promptLines.push(`   예: ${folderExample}`);
      promptLines.push('');
      promptLines.push('2. 해당 폴더에 slide-outline.md를 생성하세요. (HTML 슬라이드는 생성하지 마세요)');
      promptLines.push('   mkdir -p decks/<name> && 아웃라인 파일만 작성');
      promptLines.push('');
      const importPackId = normalizePackId(reqPackId);
      appendOutlinePrompt(promptLines, importPackId, { includePresenterNote: true });

      broadcastSSE(ctx.sseClients, 'progress', { runId, phase: 'plan', step: 'Converting with AI' });

      const result = await spawnClaudeEdit({
        prompt: promptLines.join('\n'),
        imagePath: null,
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
      ctx.activeGenerate = false;
    }
  })();
}
