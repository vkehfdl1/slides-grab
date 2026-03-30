import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listSlideFiles, normalizeSlideFilename, normalizeSlideHtml } from '../helpers.js';

/**
 * Slide file API routes.
 * Routes: GET /api/slides, POST /api/slides/:file/save
 */
export function createSlidesRouter(ctx) {
  const { express } = ctx;
  const router = express.Router();

  router.get('/api/slides', async (_req, res) => {
    try {
      const slidesDirectory = ctx.getSlidesDir();
      if (!slidesDirectory) {
        return res.json([]);
      }
      const files = await listSlideFiles(slidesDirectory);
      res.json(files);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/slides/:file/save', async (req, res) => {
    let file;
    try {
      file = normalizeSlideFilename(req.params.file, '`slide`');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const bodySlide = req.body?.slide;
    if (bodySlide !== undefined) {
      let normalizedBodySlide;
      try {
        normalizedBodySlide = normalizeSlideFilename(bodySlide, '`slide`');
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      if (normalizedBodySlide !== file) {
        return res.status(400).json({ error: '`slide` does not match the requested file.' });
      }
    }

    let html;
    try {
      html = normalizeSlideHtml(req.body?.html);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const slidesDirectory = ctx.getSlidesDir();
    const filePath = join(slidesDirectory, file);
    try {
      await readFile(filePath, 'utf-8');
    } catch {
      return res.status(404).json({ error: `Slide not found: ${file}` });
    }

    try {
      await writeFile(filePath, html, 'utf8');
      return res.json({
        success: true,
        slide: file,
        bytes: Buffer.byteLength(html, 'utf8'),
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: `Failed to save ${file}: ${error.message}`,
      });
    }
  });

  return router;
}
