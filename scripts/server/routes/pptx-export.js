import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import PptxGenJS from 'pptxgenjs';

import { SLIDE_PX, SLIDE_IN, SCREENSHOT_SCALE } from '../../../src/slide-dimensions.js';
import { broadcastSSE } from '../sse.js';
import { listSlideFiles, getScreenshotBrowser } from '../helpers.js';

const require = createRequire(import.meta.url);
const html2pptx = require('../../../src/html2pptx.cjs');

/**
 * PPTX export route.
 * Routes: POST /api/pptx-export, GET /api/pptx-export/:exportId/download.pptx
 *
 * Modes:
 *   - "image" (default): screenshot each slide as PNG → embed in PPTX (pixel-perfect)
 *   - "structured": parse HTML → recreate as PPTX elements (editable text, best-effort)
 *
 * Logo overlay: handled by /slides/:file route (logo is already in the rendered HTML).
 */
export function createPptxExportRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  let activeExport = false;
  const pptxExportFiles = new Map();

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

  // ── Structured export (html2pptx parsing) ──────────────────────────

  async function exportAsStructured(slideFiles, slidesDirectory, exportId) {
    const pres = new PptxGenJS();
    pres.layout = 'LAYOUT_WIDE';
    const warnings = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const filePath = resolve(slidesDirectory, slideFiles[i]);
      try {
        await html2pptx(filePath, pres);
      } catch (slideErr) {
        console.warn(`[pptx-export] Skipped ${slideFiles[i]}: ${slideErr.message}`);
        warnings.push(slideFiles[i]);
        pres.addSlide();
      }
      broadcastSSE(ctx.sseClients, 'pptxExportProgress', {
        exportId, current: i + 1, total: slideFiles.length, file: slideFiles[i],
        skipped: warnings.includes(slideFiles[i]),
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
            ? ` (${result.warnings.length} skipped: ${result.warnings.join(', ')})`
            : '';
          resultMsg = `Exported ${converted}/${slideFiles.length} slides to PPTX.${warnMsg}`;
        }

        const arrayBuf = await pres.write({ outputType: 'arraybuffer' });
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
    })();
  });

  router.get('/api/pptx-export/:exportId/download.pptx', (req, res) => {
    const buffer = pptxExportFiles.get(req.params.exportId);
    if (!buffer) return res.status(404).json({ error: 'PPTX not found or expired.' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename="slides.pptx"');
    res.send(buffer);
  });

  return router;
}
