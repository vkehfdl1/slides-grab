import { WebSocketServer } from 'ws';
import { PDFDocument } from 'pdf-lib';

import { mergePdfBuffers } from '../../html2pdf.js';
import {
  getDomToSvgBundle,
  renderSlideToSvg,
  scaleSvg,
  resizeSvg,
} from '../../html2svg.js';

import { SLIDE_PX, SCREENSHOT_SCALE } from '../../../src/slide-dimensions.js';
import { broadcastSSE } from '../sse.js';
import { listSlideFiles, getScreenshotBrowser, withScreenshotPage, getDeckLabel } from '../helpers.js';

/**
 * PDF export and Figma export routes + WebSocket setup.
 * Routes: POST /api/pdf-export, GET /api/pdf-export/:exportId/download.pdf,
 *         POST /api/figma-export, OPTIONS /api/figma-export
 */
export function createPdfFigmaRouter(ctx) {
  const { express, opts } = ctx;
  const SLIDE_FILE_PATTERN = ctx.SLIDE_FILE_PATTERN;
  const router = express.Router();

  // ── PDF Export ────────────────────────────────────────────────────
  let activePdfExport = false;
  const pdfExportFiles = new Map();
  const MAX_EXPORT_ENTRIES = 10;
  const PDF_SCALE = 2;

  async function renderSlideToPdfBuffer(browser, slideFile) {
    const context = await browser.newContext({
      viewport: { width: SLIDE_PX.width, height: SLIDE_PX.height },
      deviceScaleFactor: PDF_SCALE,
    });
    const page = await context.newPage();
    try {
      const slideUrl = `http://localhost:${opts.port}/slides/${encodeURIComponent(slideFile)}`;
      await page.goto(slideUrl, { waitUntil: 'load' });
      await page.evaluate(async () => { if (document.fonts?.ready) await document.fonts.ready; });

      const bodySize = await page.evaluate((fallback) => {
        const body = document.body;
        const style = window.getComputedStyle(body);
        return {
          width: Math.round(parseFloat(style.width) || body.getBoundingClientRect().width || fallback.width),
          height: Math.round(parseFloat(style.height) || body.getBoundingClientRect().height || fallback.height),
        };
      }, SLIDE_PX);

      await page.setViewportSize({ width: bodySize.width, height: bodySize.height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const pngBuffer = await page.screenshot({ type: 'png', fullPage: false });

      const pdfDoc = await PDFDocument.create();
      const pngImage = await pdfDoc.embedPng(pngBuffer);
      const pdfPage = pdfDoc.addPage([bodySize.width, bodySize.height]);
      pdfPage.drawImage(pngImage, { x: 0, y: 0, width: bodySize.width, height: bodySize.height });
      return pdfDoc.save();
    } finally {
      await context.close().catch(() => {});
    }
  }

  router.post('/api/pdf-export', async (req, res) => {
    const { scope, slide } = req.body ?? {};
    if (!['current', 'all'].includes(scope)) return res.status(400).json({ error: 'scope must be current or all' });

    if (scope === 'current') {
      const slideFile = typeof slide === 'string' ? slide.trim() : '';
      if (!slideFile || !SLIDE_FILE_PATTERN.test(slideFile)) return res.status(400).json({ error: 'Missing or invalid slide.' });
      try {
        const { browser } = await getScreenshotBrowser(ctx);
        const pdfBuffer = await renderSlideToPdfBuffer(browser, slideFile);
        const deckLabel = getDeckLabel(opts, ctx.getSlidesDir());
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${deckLabel}.pdf"`);
        return res.send(Buffer.from(pdfBuffer));
      } catch (err) { return res.status(500).json({ error: err.message }); }
    }

    if (activePdfExport) return res.status(409).json({ error: 'A PDF export is already in progress.' });
    const slidesDirectory = ctx.getSlidesDir();
    let slideFiles;
    try { slideFiles = await listSlideFiles(slidesDirectory); } catch (err) { return res.status(500).json({ error: err.message }); }
    if (slideFiles.length === 0) return res.status(400).json({ error: 'No slide files found.' });

    const exportId = `pdf-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    activePdfExport = true;
    res.json({ exportId, total: slideFiles.length });

    (async () => {
      try {
        const pdfBuffers = [];
        for (let i = 0; i < slideFiles.length; i++) {
          const { browser: pdfBrowser } = await getScreenshotBrowser(ctx);
          const pdfBuf = await renderSlideToPdfBuffer(pdfBrowser, slideFiles[i]);
          pdfBuffers.push(pdfBuf);
          broadcastSSE(ctx.sseClients, 'pdfExportProgress', { exportId, current: i + 1, total: slideFiles.length, file: slideFiles[i] });
        }
        const mergedPdf = await mergePdfBuffers(pdfBuffers);
        if (pdfExportFiles.size >= MAX_EXPORT_ENTRIES) {
          const oldest = pdfExportFiles.keys().next().value;
          pdfExportFiles.delete(oldest);
        }
        pdfExportFiles.set(exportId, Buffer.from(mergedPdf));
        broadcastSSE(ctx.sseClients, 'pdfExportFinished', { exportId, success: true, downloadUrl: `/api/pdf-export/${exportId}/download.pdf`, message: `Exported ${slideFiles.length} slides to PDF.` });
      } catch (err) {
        console.error('[pdf-export] Export failed:', err);
        broadcastSSE(ctx.sseClients, 'pdfExportFinished', { exportId, success: false, message: err.message });
      } finally {
        activePdfExport = false;
        setTimeout(() => { pdfExportFiles.delete(exportId); }, 5 * 60 * 1000);
      }
    })().catch((err) => {
      console.error('[pdf-export] Unhandled error in async block:', err);
    });
  });

  router.get('/api/pdf-export/:exportId/download.pdf', (req, res) => {
    const pdfBuffer = pdfExportFiles.get(req.params.exportId);
    if (!pdfBuffer) return res.status(404).json({ error: 'PDF not found or expired.' });
    const deckLabel = getDeckLabel(opts, ctx.getSlidesDir());
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${deckLabel}.pdf"`);
    res.send(pdfBuffer);
  });

  // ── Figma Export ──────────────────────────────────────────────────
  let activeFigmaExport = false;

  router.post('/api/figma-export', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { scope, slide, scale = SCREENSHOT_SCALE, width = SLIDE_PX.width, height = SLIDE_PX.height } = req.body ?? {};
    if (!['current', 'all'].includes(scope)) return res.status(400).json({ error: 'scope must be current or all' });
    if (ctx.figmaClients.size === 0) return res.status(400).json({ error: 'No Figma plugin connected.' });
    if (activeFigmaExport) return res.status(409).json({ error: 'A Figma export is already in progress.' });

    const numScale = Number(scale) || SCREENSHOT_SCALE;
    const numW = Math.max(320, Math.min(7680, Math.round(Number(width) || SLIDE_PX.width)));
    const numH = Math.max(180, Math.min(4320, Math.round(Number(height) || SLIDE_PX.height)));
    const slidesDirectory = ctx.getSlidesDir();

    let slideFiles;
    if (scope === 'current') {
      const slideFile = typeof slide === 'string' ? slide.trim() : '';
      if (!slideFile || !SLIDE_FILE_PATTERN.test(slideFile)) return res.status(400).json({ error: 'Missing or invalid slide.' });
      slideFiles = [slideFile];
    } else {
      try { slideFiles = await listSlideFiles(slidesDirectory); } catch (err) { return res.status(500).json({ error: err.message }); }
      if (slideFiles.length === 0) return res.status(400).json({ error: 'No slide files found.' });
    }

    activeFigmaExport = true;
    res.json({ ok: true, total: slideFiles.length });

    (async () => {
      try {
        const bundlePath = getDomToSvgBundle();
        const baseUrl = `http://localhost:${opts.port}/slides`;
        for (let i = 0; i < slideFiles.length; i++) {
          const sf = slideFiles[i];
          const svg = await withScreenshotPage(ctx, async (page) => {
            await page.setViewportSize({ width: numW, height: numH });
            const rawSvg = await renderSlideToSvg(page, sf, slidesDirectory, bundlePath, { baseUrl });
            return scaleSvg(resizeSvg(rawSvg, numW, numH), numScale);
          });
          const msg = JSON.stringify({ type: 'slide', name: sf.replace(/\.html$/i, ''), svg, current: i + 1, total: slideFiles.length });
          for (const ws of ctx.figmaClients) { try { ws.send(msg); } catch { /* client gone */ } }
          broadcastSSE(ctx.sseClients, 'figmaExportProgress', { current: i + 1, total: slideFiles.length, file: sf });
        }
        const doneMsg = JSON.stringify({ type: 'done', total: slideFiles.length });
        for (const ws of ctx.figmaClients) { try { ws.send(doneMsg); } catch { /* client gone */ } }
        broadcastSSE(ctx.sseClients, 'figmaExportFinished', { success: true, total: slideFiles.length, message: `Sent ${slideFiles.length} slides to Figma.` });
      } catch (err) {
        console.error('[figma-export] Export failed:', err);
        broadcastSSE(ctx.sseClients, 'figmaExportFinished', { success: false, total: 0, message: err.message });
      } finally {
        activeFigmaExport = false;
      }
    })().catch((err) => {
      console.error('[figma-export] Unhandled error in async block:', err);
    });
  });

  router.options('/api/figma-export', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });

  return router;
}

/**
 * Set up WebSocket server for Figma plugin on the HTTP server.
 */
export function setupFigmaWebSocket(server, ctx) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://localhost:${ctx.opts.port}`);
    if (url.pathname === '/figma-ws') {
      wss.handleUpgrade(request, socket, head, (ws) => { wss.emit('connection', ws, request); });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    ctx.figmaClients.add(ws);
    console.log(`[figma-ws] Figma plugin connected (total: ${ctx.figmaClients.size})`);
    broadcastSSE(ctx.sseClients, 'figmaConnected', { clients: ctx.figmaClients.size });
    ws.on('close', () => {
      ctx.figmaClients.delete(ws);
      console.log(`[figma-ws] Figma plugin disconnected (total: ${ctx.figmaClients.size})`);
      broadcastSSE(ctx.sseClients, 'figmaDisconnected', { clients: ctx.figmaClients.size });
    });
    ws.on('error', () => { ctx.figmaClients.delete(ws); });
  });

  return wss;
}
