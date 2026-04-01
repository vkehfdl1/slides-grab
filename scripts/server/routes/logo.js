import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';

/**
 * Logo management API routes.
 * Routes: GET/POST/DELETE /api/logo, POST /api/logo/upload, GET /api/logo/image
 */
export function createLogoRouter(ctx) {
  const { express } = ctx;
  const router = express.Router();

  // GET /api/logo — read current logo config from deck.json
  router.get('/api/logo', async (_req, res) => {
    const slidesDir = ctx.getSlidesDir();
    if (!slidesDir) return res.status(400).json({ error: 'No slides directory set.' });

    try {
      const { loadDeckConfig } = await import('../../../src/logo.js');
      const config = await loadDeckConfig(slidesDir);
      res.json({ logo: config?.logo || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/logo — save logo config to deck.json
  // Note: explicit express.json() because this router mounts before the global JSON parser
  router.post('/api/logo', express.json(), async (req, res) => {
    const slidesDir = ctx.getSlidesDir();
    if (!slidesDir) return res.status(400).json({ error: 'No slides directory set.' });

    const logo = req.body;
    if (!logo || typeof logo !== 'object') {
      return res.status(400).json({ error: 'Request body must be a logo config object.' });
    }

    try {
      const { writeDeckConfig } = await import('../../../src/logo.js');
      const config = await writeDeckConfig(slidesDir, { logo });
      res.json({ success: true, logo: config.logo });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/logo — remove logo config from deck.json
  router.delete('/api/logo', async (_req, res) => {
    const slidesDir = ctx.getSlidesDir();
    if (!slidesDir) return res.status(400).json({ error: 'No slides directory set.' });

    try {
      const { loadDeckConfig } = await import('../../../src/logo.js');
      const config = await loadDeckConfig(slidesDir);
      if (!config?.logo) {
        return res.json({ success: true, message: 'No logo configured.' });
      }

      delete config.logo;
      const configPath = join(slidesDir, 'deck.json');
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/logo/upload — upload logo image file
  router.post('/api/logo/upload',
    express.raw({ type: 'image/*', limit: '5mb' }),
    async (req, res) => {
      const slidesDir = ctx.getSlidesDir();
      if (!slidesDir) return res.status(400).json({ error: 'No slides directory set.' });

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'No image data received.' });
      }

      const contentType = req.headers['content-type'] || 'image/png';
      let ext = '.png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = '.jpg';
      else if (contentType.includes('svg')) ext = '.svg';
      else if (contentType.includes('gif')) ext = '.gif';
      else if (contentType.includes('webp')) ext = '.webp';

      const assetsDir = join(slidesDir, 'assets');
      if (!existsSync(assetsDir)) {
        await mkdir(assetsDir, { recursive: true });
      }

      const filename = `logo${ext}`;
      const filePath = join(assetsDir, filename);
      await writeFile(filePath, req.body);

      res.json({ success: true, path: `./assets/${filename}` });
    },
  );

  // GET /api/logo/image — serve the current logo image for preview
  router.get('/api/logo/image', async (_req, res) => {
    const slidesDir = ctx.getSlidesDir();
    if (!slidesDir) return res.status(400).json({ error: 'No slides directory set.' });

    try {
      const { loadDeckConfig } = await import('../../../src/logo.js');
      const config = await loadDeckConfig(slidesDir);
      if (!config?.logo?.path) {
        return res.status(404).json({ error: 'No logo configured.' });
      }

      const logoPath = config.logo.path;
      if (logoPath.startsWith('data:') || logoPath.startsWith('http')) {
        return res.redirect(logoPath);
      }

      const resolved = join(slidesDir, logoPath);
      if (!existsSync(resolved)) {
        return res.status(404).json({ error: 'Logo file not found.' });
      }

      res.sendFile(resolved);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
