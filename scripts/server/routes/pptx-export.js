import { createRequire } from 'node:module';
import { resolve } from 'node:path';

import PptxGenJS from 'pptxgenjs';

import { broadcastSSE } from '../sse.js';
import { listSlideFiles } from '../helpers.js';

const require = createRequire(import.meta.url);
const html2pptx = require('../../../src/html2pptx.cjs');

/**
 * PPTX export route.
 * Routes: POST /api/pptx-export, GET /api/pptx-export/:exportId/download.pptx
 */
export function createPptxExportRouter(ctx) {
  const { express } = ctx;
  const router = express.Router();

  let activeExport = false;
  const pptxExportFiles = new Map();

  router.post('/api/pptx-export', async (req, res) => {
    if (activeExport) return res.status(409).json({ error: 'A PPTX export is already in progress.' });

    const slidesDirectory = ctx.getSlidesDir();
    if (!slidesDirectory) return res.status(400).json({ error: 'No slides directory set.' });

    let slideFiles;
    try { slideFiles = await listSlideFiles(slidesDirectory); } catch (err) { return res.status(500).json({ error: err.message }); }
    if (slideFiles.length === 0) return res.status(400).json({ error: 'No slide files found.' });

    const exportId = `pptx-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    activeExport = true;
    res.json({ exportId, total: slideFiles.length });

    (async () => {
      try {
        const pres = new PptxGenJS();
        pres.layout = 'LAYOUT_WIDE';

        for (let i = 0; i < slideFiles.length; i++) {
          const filePath = resolve(slidesDirectory, slideFiles[i]);
          await html2pptx(filePath, pres);
          broadcastSSE(ctx.sseClients, 'pptxExportProgress', {
            exportId, current: i + 1, total: slideFiles.length, file: slideFiles[i],
          });
        }

        const arrayBuf = await pres.write({ outputType: 'arraybuffer' });
        pptxExportFiles.set(exportId, Buffer.from(arrayBuf));

        broadcastSSE(ctx.sseClients, 'pptxExportFinished', {
          exportId,
          success: true,
          downloadUrl: `/api/pptx-export/${exportId}/download.pptx`,
          message: `Exported ${slideFiles.length} slides to PPTX.`,
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
