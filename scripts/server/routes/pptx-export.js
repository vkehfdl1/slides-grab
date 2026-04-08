import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

import PptxGenJS from 'pptxgenjs';

import { SLIDE_PX, SLIDE_IN, SCREENSHOT_SCALE } from '../../../src/slide-dimensions.js';
import { broadcastSSE } from '../sse.js';
import { listSlideFiles, getScreenshotBrowser, getDeckLabel } from '../helpers.js';
import { callOpenAIForPptx } from '../spawn.js';

const PPTX_AI_PROMPT = `You are a PptxGenJS code generator. Recreate this slide as PptxGenJS code.
Slide size: 10" wide × 5.625" tall (16:9).

Rules:
- Use slide.addText(), slide.addShape(), slide.addImage()
- All x/y/w/h values in inches
- Colors: 6-digit hex WITHOUT # prefix (e.g. 'FF0000' not '#FF0000')
- Do NOT wrap in a function — output only the statements
- Set slide.background = { color: 'HEX' } for background color
- Shapes: pres.ShapeType.rect, pres.ShapeType.roundRect, pres.ShapeType.line
- Text: fontSize in points, fontFace, color, bold, italic, align ('left'/'center'/'right'), valign ('top'/'middle'/'bottom'), inset: 0

Output ONLY a JavaScript code block with no explanation.`;

// ── Deterministic DOM Extraction (v3) ────────────────────────────────

/**
 * Extraction script runs inside Playwright page context.
 *
 * v3 — Pixel-perfect: always use exact browser-rendered coordinates.
 * No vertical-centering inference or parent-position overrides (those
 * caused overlap bugs when multiple texts shared a centered ancestor).
 *
 * Width strategy:
 *   - flex-row / inline  → element width + 15%
 *   - flex-column center → element width + 15%
 *   - block / stretch    → extend to parent right edge
 *
 * Single-line detection: texts that fit on one line get wrap:false in PPTX.
 */
function extractionScript() {
  function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return null;
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return null;
    return m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  const bodyStyle = getComputedStyle(document.body);
  const bodyBg = rgbToHex(bodyStyle.backgroundColor) || 'FFFFFF';
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const shapes = [];
  const texts = [];
  const lines = [];
  const textVisited = new WeakSet();

  function processElement(el) {
    if (el.nodeType !== 1) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    if (parseFloat(style.opacity) === 0) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    // ── Shapes ──
    const bg = style.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && el !== document.body) {
      const fill = rgbToHex(bg);
      if (fill) {
        shapes.push({
          x: rect.left, y: rect.top, w: rect.width, h: rect.height,
          fill,
          borderRadius: parseFloat(style.borderRadius) || 0,
          opacity: parseFloat(style.opacity),
        });
      }
    }

    // ── Border lines ──
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
      const bStyle = style[`border${side}Style`];
      const bWidth = parseFloat(style[`border${side}Width`]);
      if (bStyle !== 'none' && bWidth > 0) {
        const bColor = rgbToHex(style[`border${side}Color`]);
        if (bColor) {
          const isH = side === 'Top' || side === 'Bottom';
          const ly = side === 'Top' ? rect.top : side === 'Bottom' ? rect.bottom : rect.top;
          const lx = side === 'Left' ? rect.left : side === 'Right' ? rect.right : rect.left;
          lines.push({
            x: isH ? rect.left : lx, y: isH ? ly : rect.top,
            w: isH ? rect.width : 0, h: isH ? 0 : rect.height,
            color: bColor, width: bWidth,
          });
        }
      }
    }

    // ── Text (deduplicated) ──
    if (!textVisited.has(el)) {
      const hasDirectText = [...el.childNodes].some(
        n => n.nodeType === 3 && n.textContent.trim(),
      );
      const isLeaf = el.childElementCount === 0;

      if ((hasDirectText || isLeaf) && el.innerText && el.innerText.trim()) {
        const parent = el.parentElement;
        const parentRect = parent ? parent.getBoundingClientRect() : rect;
        const parentStyle = parent ? getComputedStyle(parent) : null;

        // Parent layout detection
        const isFlex = parentStyle && (parentStyle.display === 'flex' || parentStyle.display === 'inline-flex');
        const flexDir = parentStyle ? parentStyle.flexDirection : '';
        const isRowFlex = isFlex && (flexDir === 'row' || flexDir === 'row-reverse');
        const isColCenter = isFlex
          && (flexDir === 'column' || flexDir === 'column-reverse')
          && parentStyle.alignItems === 'center';

        // Width: tight for row/centered, generous for block/stretch
        let textW;
        if (isRowFlex || isColCenter) {
          textW = rect.width * 1.15;
        } else {
          const availW = (parentRect.right || vw) - rect.left;
          textW = Math.max(rect.width * 1.05, availW);
        }

        // Single-line detection: height < ~2x font size and no newlines
        const fSize = parseFloat(style.fontSize);
        const textContent = el.innerText.trim();
        const isSingleLine = !textContent.includes('\n') && rect.height < fSize * 2.2;

        texts.push({
          text: textContent,
          x: rect.left, y: rect.top, w: textW, h: rect.height,
          fontSize: fSize,
          fontWeight: parseInt(style.fontWeight) || 400,
          fontStyle: style.fontStyle,
          fontFamily: style.fontFamily.split(',')[0].trim().replace(/['"]/g, '') || 'Arial',
          color: rgbToHex(style.color) || '000000',
          textAlign: style.textAlign === 'start' ? 'left' : style.textAlign,
          isSingleLine,
        });
        el.querySelectorAll('*').forEach(d => textVisited.add(d));
        return;
      }
    }

    for (const child of el.children) processElement(child);
  }

  processElement(document.body);
  return { bodyBg, vw, vh, shapes, texts, lines };
}

/**
 * Convert extracted layout → PptxGenJS code (v3: pixel-perfect).
 */
function layoutToPptxCode(layout) {
  const { bodyBg, vw, vh, shapes, texts, lines } = layout;
  const sx = SLIDE_IN.width / vw;
  const sy = SLIDE_IN.height / vh;
  const code = [];

  code.push(`slide.background = { color: '${bodyBg}' };`);

  for (const s of shapes) {
    const x = (s.x * sx).toFixed(3);
    const y = (s.y * sy).toFixed(3);
    const w = (s.w * sx).toFixed(3);
    const h = (s.h * sy).toFixed(3);
    if (s.borderRadius > 0) {
      const r = Math.min(s.borderRadius * Math.min(sx, sy), 0.5).toFixed(3);
      code.push(`slide.addShape(pres.ShapeType.roundRect, { x: ${x}, y: ${y}, w: ${w}, h: ${h}, rectRadius: ${r}, fill: { color: '${s.fill}' } });`);
    } else {
      code.push(`slide.addShape(pres.ShapeType.rect, { x: ${x}, y: ${y}, w: ${w}, h: ${h}, fill: { color: '${s.fill}' } });`);
    }
  }

  for (const l of lines) {
    const x = (l.x * sx).toFixed(3);
    const y = (l.y * sy).toFixed(3);
    const w = (l.w * sx).toFixed(3);
    const h = (l.h * sy).toFixed(3);
    const lw = Math.max(0.5, l.width * 0.75);
    code.push(`slide.addShape(pres.ShapeType.line, { x: ${x}, y: ${y}, w: ${w}, h: ${h}, line: { color: '${l.color}', width: ${lw.toFixed(1)} } });`);
  }

  for (const t of texts) {
    const x = (t.x * sx).toFixed(3);
    const y = (t.y * sy).toFixed(3);
    const w = (t.w * sx).toFixed(3);
    // Multi-line: add 10% height buffer since PowerPoint renders fonts slightly taller than browsers
    const h = (t.h * sy * (t.isSingleLine ? 1 : 1.1)).toFixed(3);
    const fontSize = Math.round(t.fontSize * 72 / 96);
    const bold = t.fontWeight >= 600;
    const italic = t.fontStyle === 'italic';

    const opts = [`x: ${x}`, `y: ${y}`, `w: ${w}`, `h: ${h}`];
    opts.push(`fontSize: ${fontSize}`);
    opts.push(`fontFace: '${t.fontFamily}'`);
    if (bold) opts.push(`bold: true`);
    if (italic) opts.push(`italic: true`);
    opts.push(`color: '${t.color}'`);
    if (t.textAlign && t.textAlign !== 'left') opts.push(`align: '${t.textAlign}'`);
    opts.push(`valign: 'top'`);
    opts.push(`inset: 0`);
    if (t.isSingleLine) opts.push(`wrap: false`);

    code.push(`slide.addText(${JSON.stringify(t.text)}, { ${opts.join(', ')} });`);
  }

  return code.join('\n');
}

// ── Router ────────────────────────────────────────────────────────────

/**
 * PPTX export route.
 * Routes: POST /api/pptx-export, GET /api/pptx-export/:exportId/download.pptx
 *
 * Modes:
 *   - "image" (default): screenshot each slide as PNG → embed in PPTX (pixel-perfect)
 *   - "structured": deterministic DOM extraction → PptxGenJS code (editable text/shapes)
 *
 * Logo overlay: applied separately via applyLogoToPptxSlide() on each slide.
 */
export function createPptxExportRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  let activeExport = false;
  const pptxExportFiles = new Map();
  const MAX_EXPORT_ENTRIES = 10;

  // ── Image-based export (default) ───────────────────────────────────

  async function exportAsImage(slideFiles, slidesDirectory, exportId) {
    const pres = new PptxGenJS();
    pres.defineLayout({ name: 'SLIDE', width: SLIDE_IN.width, height: SLIDE_IN.height });
    pres.layout = 'SLIDE';

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      try {
        const { browser } = await getScreenshotBrowser(ctx);
        const context = await browser.newContext({
          viewport: { width: SLIDE_PX.width, height: SLIDE_PX.height },
          deviceScaleFactor: SCREENSHOT_SCALE,
        });
        let pngBuffer;
        try {
          const page = await context.newPage();
          const url = `http://localhost:${opts.port}/slides/${slideFile}`;
          await page.goto(url, { waitUntil: 'networkidle' });

          const slideEl = await page.$('.slide');
          pngBuffer = slideEl
            ? await slideEl.screenshot({ type: 'png' })
            : await page.screenshot({ type: 'png', fullPage: false });
        } finally {
          await context.close().catch(() => {});
        }

        const base64 = Buffer.from(pngBuffer).toString('base64');
        const slide = pres.addSlide();
        slide.addImage({
          data: `image/png;base64,${base64}`,
          x: 0, y: 0, w: '100%', h: '100%',
        });
      } catch (err) {
        console.warn(`[pptx-export] Screenshot failed for ${slideFile}: ${err.message}`);
        pres.addSlide(); // blank placeholder
      }

      broadcastSSE(ctx.sseClients, 'pptxExportProgress', {
        exportId, current: i + 1, total: slideFiles.length, file: slideFile,
      });
    }

    return pres;
  }

  // ── Deterministic structured export ────────────────────────────────

  async function extractSlideLayout(slideFile) {
    const { browser } = await getScreenshotBrowser(ctx);
    const context = await browser.newContext({
      viewport: { width: SLIDE_PX.width, height: SLIDE_PX.height },
    });
    try {
      const page = await context.newPage();
      // ?nologo prevents logo injection (logo is added separately)
      const url = `http://localhost:${opts.port}/slides/${slideFile}?nologo`;
      await page.goto(url, { waitUntil: 'networkidle' });
      const layout = await page.evaluate(extractionScript);
      // Capture screenshot alongside layout — reused by AI/screenshot fallbacks (no extra page load)
      const slideEl = await page.$('.slide');
      const pngBuffer = slideEl
        ? await slideEl.screenshot({ type: 'png' })
        : await page.screenshot({ type: 'png', fullPage: false });
      return { layout, screenshot: pngBuffer.toString('base64') };
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function convertSlideDeterministic(slideFile) {
    console.log(`[pptx-export v3] Extracting layout for ${slideFile}...`);
    const { layout, screenshot } = await extractSlideLayout(slideFile);
    const code = layoutToPptxCode(layout);
    const singleLine = layout.texts.filter(t => t.isSingleLine).length;
    console.log(`[pptx-export v3] ${slideFile}: ${layout.shapes.length}sh ${layout.texts.length}tx [${singleLine} single] ${layout.lines.length}ln`);
    // Debug: dump text details for problem slides
    if (slideFile === 'slide-10.html' || slideFile === 'slide-07.html') {
      for (const t of layout.texts) {
        console.log(`  [v3] "${t.text.slice(0,15)}" x=${Math.round(t.x)} y=${Math.round(t.y)} w=${Math.round(t.w)} h=${Math.round(t.h)} single=${t.isSingleLine}`);
      }
    }
    return { code, screenshot };
  }

  async function captureScreenshotBase64(slideFile) {
    const { browser } = await getScreenshotBrowser(ctx);
    const context = await browser.newContext({
      viewport: { width: SLIDE_PX.width, height: SLIDE_PX.height },
      deviceScaleFactor: SCREENSHOT_SCALE,
    });
    try {
      const page = await context.newPage();
      const url = `http://localhost:${opts.port}/slides/${slideFile}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      const slideEl = await page.$('.slide');
      const pngBuffer = slideEl
        ? await slideEl.screenshot({ type: 'png' })
        : await page.screenshot({ type: 'png', fullPage: false });
      return pngBuffer.toString('base64');
    } finally {
      await context.close().catch(() => {});
    }
  }

  async function convertSlideWithAI(slideFile, cachedScreenshot = null) {
    const imageBase64 = cachedScreenshot ?? await captureScreenshotBase64(slideFile);
    return callOpenAIForPptx({ prompt: PPTX_AI_PROMPT, imageBase64 });
  }

  async function embedScreenshot(slide, slideFile) {
    try {
      const base64 = await captureScreenshotBase64(slideFile);
      slide.addImage({ data: `image/png;base64,${base64}`, x: 0, y: 0, w: '100%', h: '100%' });
    } catch (err) {
      console.warn(`[pptx-export] Fallback screenshot also failed for ${slideFile}: ${err.message}`);
    }
  }

  async function loadLogoForPptx(slidesDirectory) {
    try {
      const { loadDeckConfig, resolveLogoConfig, loadLogoImage, shouldApplyLogo, applyLogoToPptxSlide } =
        await import('../../../src/logo.js');
      const deckConfig = await loadDeckConfig(slidesDirectory);
      const logoConfig = resolveLogoConfig(deckConfig, slidesDirectory);
      if (!logoConfig) return null;
      const imageData = await loadLogoImage(logoConfig.resolvedPath);
      return { logoConfig, imageData, shouldApplyLogo, applyLogoToPptxSlide };
    } catch {
      return null;
    }
  }

  async function exportAsStructured(slideFiles, slidesDirectory, exportId) {
    const pres = new PptxGenJS();
    pres.defineLayout({ name: 'SLIDE', width: SLIDE_IN.width, height: SLIDE_IN.height });
    pres.layout = 'SLIDE';
    const warnings = [];

    // Load logo config once
    const logo = await loadLogoForPptx(slidesDirectory);

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const slide = pres.addSlide();
      let method = 'extract';

      let screenshot = null;
      try {
        const result = await convertSlideDeterministic(slideFile);
        screenshot = result.screenshot;
        new Function('slide', 'pres', result.code)(slide, pres);
      } catch (err) {
        console.warn(`[pptx-export] DOM extraction failed for ${slideFile}: ${err.message}`);
        try {
          const aiCode = await convertSlideWithAI(slideFile, screenshot);
          new Function('slide', 'pres', aiCode)(slide, pres);
          method = 'ai';
          console.log(`[pptx-export] AI fallback succeeded for ${slideFile}`);
        } catch (aiErr) {
          console.warn(`[pptx-export] AI fallback failed for ${slideFile}: ${aiErr.message}`);
          await embedScreenshot(slide, slideFile);
          warnings.push(slideFile);
          method = 'screenshot';
        }
      }

      // Apply logo overlay (on top of everything)
      if (logo && logo.shouldApplyLogo(i, logo.logoConfig)) {
        try {
          logo.applyLogoToPptxSlide(slide, logo.logoConfig, logo.imageData);
        } catch (err) {
          console.warn(`[pptx-export] Logo failed for ${slideFile}: ${err.message}`);
        }
      }

      broadcastSSE(ctx.sseClients, 'pptxExportProgress', {
        exportId, current: i + 1, total: slideFiles.length, file: slideFile, method,
      });
    }

    return { pres, warnings };
  }

  // ── Route ──────────────────────────────────────────────────────────

  router.post('/api/pptx-export', async (req, res) => {
    if (activeExport) return res.status(409).json({ error: 'A PPTX export is already in progress.' });

    const slidesDirectory = ctx.getSlidesDir();
    if (!slidesDirectory) return res.status(400).json({ error: 'No slides directory set.' });

    const mode = req.body?.mode || 'image';
    if (!['image', 'structured'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "image" or "structured".' });
    }

    let slideFiles;
    try { slideFiles = await listSlideFiles(slidesDirectory); } catch (err) { return res.status(500).json({ error: err.message }); }
    if (slideFiles.length === 0) return res.status(400).json({ error: 'No slide files found.' });

    const exportId = `pptx-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    activeExport = true;
    res.json({ exportId, total: slideFiles.length });

    (async () => {
      try {
        let pres;
        let resultMsg;

        if (mode === 'image') {
          pres = await exportAsImage(slideFiles, slidesDirectory, exportId);
          resultMsg = `Exported ${slideFiles.length} slides to PPTX (image).`;
        } else {
          const result = await exportAsStructured(slideFiles, slidesDirectory, exportId);
          pres = result.pres;
          const converted = slideFiles.length - result.warnings.length;
          if (converted === 0) {
            broadcastSSE(ctx.sseClients, 'pptxExportFinished', {
              exportId, success: false,
              message: `All ${slideFiles.length} slides failed to convert. Check slide HTML structure.`,
            });
            return;
          }
          const warnMsg = result.warnings.length > 0
            ? ` (${result.warnings.length} fallback to image: ${result.warnings.join(', ')})`
            : '';
          resultMsg = `Exported ${converted}/${slideFiles.length} slides to editable PPTX.${warnMsg}`;
        }

        const arrayBuf = await pres.write({ outputType: 'arraybuffer' });
        if (pptxExportFiles.size >= MAX_EXPORT_ENTRIES) {
          const oldest = pptxExportFiles.keys().next().value;
          pptxExportFiles.delete(oldest);
        }
        pptxExportFiles.set(exportId, Buffer.from(arrayBuf));

        broadcastSSE(ctx.sseClients, 'pptxExportFinished', {
          exportId,
          success: true,
          downloadUrl: `/api/pptx-export/${exportId}/download.pptx`,
          message: resultMsg,
        });
      } catch (err) {
        console.error('[pptx-export] Export failed:', err);
        broadcastSSE(ctx.sseClients, 'pptxExportFinished', {
          exportId, success: false, message: err.message,
        });
      } finally {
        activeExport = false;
        setTimeout(() => { pptxExportFiles.delete(exportId); }, 5 * 60 * 1000);
      }
    })().catch((err) => {
      console.error('[pptx-export] Unhandled error in async block:', err);
    });
  });

  router.get('/api/pptx-export/:exportId/download.pptx', (req, res) => {
    const buffer = pptxExportFiles.get(req.params.exportId);
    if (!buffer) return res.status(404).json({ error: 'PPTX not found or expired.' });
    const deckLabel = getDeckLabel(opts, ctx.getSlidesDir());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${deckLabel}.pptx"`);
    res.send(buffer);
  });

  return router;
}
