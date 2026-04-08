import archiver from 'archiver';

import {
  getDomToSvgBundle,
  getOpentypeBundle,
  renderSlideToSvg,
  renderSlideToPng,
  convertTextToOutlines,
  scaleSvg,
  resizeSvg,
  getOutputFileName,
} from '../../html2svg.js';

import { SLIDE_PX } from '../../../src/slide-dimensions.js';
import { broadcastSSE } from '../sse.js';
import { listSlideFiles, withScreenshotPage, getDeckLabel } from '../helpers.js';

/**
 * SVG/PNG export routes.
 * Routes: POST /api/svg-export, GET /api/svg-export/:exportId/download.zip,
 *         GET /api/svg-export/:exportId/:file
 */
export function createExportRouter(ctx) {
  const { express, opts } = ctx;
  const SLIDE_FILE_PATTERN = ctx.SLIDE_FILE_PATTERN;
  const router = express.Router();

  let activeSvgExport = false;
  const svgExportFiles = new Map();
  const svgExportZips = new Map();
  const MAX_EXPORT_ENTRIES = 10;

  router.post('/api/svg-export', async (req, res) => {
    const { scope, slide, format = 'svg', scale = 1, width = SLIDE_PX.width, height = SLIDE_PX.height, outline = false } = req.body ?? {};

    if (!['svg', 'png'].includes(format)) return res.status(400).json({ error: 'format must be svg or png' });
    if (!['current', 'all'].includes(scope)) return res.status(400).json({ error: 'scope must be current or all' });

    const numScale = Number(scale) || 1;
    const numW = Math.max(320, Math.min(7680, Math.round(Number(width) || SLIDE_PX.width)));
    const numH = Math.max(180, Math.min(4320, Math.round(Number(height) || SLIDE_PX.height)));
    const useOutline = Boolean(outline) && format === 'svg';
    const slidesDirectory = ctx.getSlidesDir();

    if (scope === 'current') {
      const slideFile = typeof slide === 'string' ? slide.trim() : '';
      if (!slideFile || !SLIDE_FILE_PATTERN.test(slideFile)) {
        return res.status(400).json({ error: 'Missing or invalid slide.' });
      }
      try {
        const result = await withScreenshotPage(ctx, async (page) => {
          await page.setViewportSize({ width: numW, height: numH });
          const baseUrl = `http://localhost:${opts.port}/slides`;
          if (format === 'svg') {
            const bundlePath = getDomToSvgBundle();
            let rawSvg = await renderSlideToSvg(page, slideFile, slidesDirectory, bundlePath, { baseUrl });
            if (useOutline) {
              await page.addScriptTag({ path: getOpentypeBundle() });
              rawSvg = await convertTextToOutlines(page, rawSvg);
            }
            return scaleSvg(resizeSvg(rawSvg, numW, numH), numScale);
          }
          return renderSlideToPng(page, slideFile, slidesDirectory, { baseUrl });
        });
        const outName = getOutputFileName(slideFile, format);
        const contentType = format === 'svg' ? 'image/svg+xml' : 'image/png';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        return res.send(result);
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    // scope === 'all'
    if (activeSvgExport) return res.status(409).json({ error: 'An export is already in progress.' });

    let slideFiles;
    try { slideFiles = await listSlideFiles(slidesDirectory); } catch (err) { return res.status(500).json({ error: err.message }); }
    if (slideFiles.length === 0) return res.status(400).json({ error: 'No slide files found.' });

    const exportId = `export-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    activeSvgExport = true;
    svgExportFiles.set(exportId, new Map());
    res.json({ exportId, total: slideFiles.length });

    (async () => {
      try {
        let bundlePath, opentypeBundlePath;
        if (format === 'svg') {
          bundlePath = getDomToSvgBundle();
          if (useOutline) opentypeBundlePath = getOpentypeBundle();
        }
        const baseUrl = `http://localhost:${opts.port}/slides`;
        const fileMap = svgExportFiles.get(exportId);

        for (let i = 0; i < slideFiles.length; i++) {
          const sf = slideFiles[i];
          const outName = getOutputFileName(sf, format);
          const result = await withScreenshotPage(ctx, async (page) => {
            await page.setViewportSize({ width: numW, height: numH });
            if (format === 'svg') {
              let rawSvg = await renderSlideToSvg(page, sf, slidesDirectory, bundlePath, { baseUrl });
              if (useOutline) {
                await page.addScriptTag({ path: opentypeBundlePath });
                rawSvg = await convertTextToOutlines(page, rawSvg);
              }
              return scaleSvg(resizeSvg(rawSvg, numW, numH), numScale);
            }
            return renderSlideToPng(page, sf, slidesDirectory, { baseUrl });
          });
          fileMap.set(outName, result);
          broadcastSSE(ctx.sseClients, 'svgExportProgress', { exportId, current: i + 1, total: slideFiles.length, file: outName });
        }

        // Build ZIP
        const files = Array.from(fileMap.keys());
        console.log(`[svg-export] Creating ZIP for ${files.length} files...`);
        const archive = archiver('zip', { zlib: { level: 6 } });
        const chunks = [];
        archive.on('data', (chunk) => chunks.push(chunk));
        const zipDone = new Promise((resolveZip, rejectZip) => {
          archive.on('end', () => resolveZip(Buffer.concat(chunks)));
          archive.on('error', (err) => { console.error('[svg-export] archiver error:', err); rejectZip(err); });
        });
        for (const [name, data] of fileMap) {
          archive.append(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8'), { name });
        }
        archive.finalize();
        const zipBuffer = await zipDone;
        if (svgExportZips.size >= MAX_EXPORT_ENTRIES) {
          const oldest = svgExportZips.keys().next().value;
          svgExportZips.delete(oldest);
          svgExportFiles.delete(oldest);
        }
        svgExportZips.set(exportId, zipBuffer);
        console.log(`[svg-export] ZIP created: ${zipBuffer.length} bytes, exportId=${exportId}`);

        const zipUrl = `/api/svg-export/${exportId}/download.zip`;
        broadcastSSE(ctx.sseClients, 'svgExportFinished', { exportId, success: true, files, zipUrl, message: `Exported ${files.length} ${format.toUpperCase()} files.` });
        console.log(`[svg-export] Sent svgExportFinished with zipUrl=${zipUrl}`);
      } catch (err) {
        console.error(`[svg-export] Export failed:`, err);
        broadcastSSE(ctx.sseClients, 'svgExportFinished', { exportId, success: false, files: [], message: err.message });
      } finally {
        activeSvgExport = false;
        setTimeout(() => { svgExportZips.delete(exportId); svgExportFiles.delete(exportId); }, 5 * 60 * 1000);
      }
    })().catch((err) => {
      console.error('[svg-export] Unhandled error in async block:', err);
    });
  });

  router.get('/api/svg-export/:exportId/download.zip', (req, res) => {
    console.log(`[svg-export] ZIP download request: exportId=${req.params.exportId}`);
    const zipBuffer = svgExportZips.get(req.params.exportId);
    if (!zipBuffer) {
      console.log(`[svg-export] ZIP not found for exportId=${req.params.exportId}, available: [${Array.from(svgExportZips.keys()).join(', ')}]`);
      return res.status(404).json({ error: 'Export not found or expired.' });
    }
    console.log(`[svg-export] Sending ZIP: ${zipBuffer.length} bytes`);
    const deckLabel = getDeckLabel(opts, ctx.getSlidesDir());
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${deckLabel}-export.zip"`);
    res.send(zipBuffer);
  });

  router.get('/api/svg-export/:exportId/:file', (req, res) => {
    const fileMap = svgExportFiles.get(req.params.exportId);
    if (!fileMap) return res.status(404).json({ error: 'Export not found or expired.' });
    const fileName = req.params.file;
    const data = fileMap.get(fileName);
    if (!data) return res.status(404).json({ error: `File not found: ${fileName}` });
    const isSvg = fileName.endsWith('.svg');
    res.setHeader('Content-Type', isSvg ? 'image/svg+xml' : 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(data);
  });

  return router;
}
