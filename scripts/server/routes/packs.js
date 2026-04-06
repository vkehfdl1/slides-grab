import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { listPacks, resolvePack, resolveTemplate, getPackInfo } from '../../../src/resolve.js';

/**
 * Template pack API routes.
 * Routes: GET /api/packs, GET /api/packs/:id/preview, GET /api/packs/:id/templates/:name,
 *         GET /packs-gallery
 */
export function createPacksRouter(ctx) {
  const { express, PACKAGE_ROOT } = ctx;
  const router = express.Router();

  // Redirect gallery to main create screen
  router.get('/packs-gallery', (_req, res) => {
    res.redirect('/');
  });

  router.get('/api/packs', (_req, res) => {
    try {
      const packs = listPacks();
      res.json(packs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/packs/:id/preview', (req, res) => {
    const pack = resolvePack(req.params.id);
    if (!pack) return res.status(404).send('Pack not found');

    const previewPath = join(pack.path, 'preview.png');
    res.sendFile(previewPath, (err) => {
      if (!err) return;

      const safeColor = (v, fallback) => {
        const s = typeof v === 'string' ? v.trim() : '';
        return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
      };
      const info = getPackInfo(req.params.id);
      const colors = info?.colors || {};
      const bg = safeColor(colors['bg-primary'], '#333');
      const accent = safeColor(colors.accent, '#666');
      const text1 = safeColor(colors['text-primary'], '#fff');
      const text2 = safeColor(colors['text-secondary'], '#aaa');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="158" viewBox="0 0 280 158">
      <rect width="280" height="158" fill="${bg}" rx="4"/>
      <rect x="20" y="20" width="160" height="12" rx="2" fill="${accent}" opacity="0.9"/>
      <rect x="20" y="42" width="120" height="8" rx="2" fill="${text1}" opacity="0.4"/>
      <rect x="20" y="58" width="100" height="8" rx="2" fill="${text2}" opacity="0.3"/>
      <rect x="20" y="90" width="240" height="1" fill="${accent}" opacity="0.2"/>
      <rect x="20" y="110" width="80" height="6" rx="1" fill="${text2}" opacity="0.25"/>
      <rect x="20" y="124" width="60" height="6" rx="1" fill="${text2}" opacity="0.15"/>
    </svg>`;
      res.type('image/svg+xml').send(svg);
    });
  });

  router.get('/api/packs/:id/templates/:name', (req, res) => {
    const resolved = resolveTemplate(req.params.name, req.params.id);
    if (!resolved) return res.status(404).send('Template not found');
    res.sendFile(resolved.path);
  });

  // Serve preview.css for gallery thumbnails
  router.get('/api/packs/:id/preview.css', (req, res) => {
    const pack = resolvePack(req.params.id);
    if (!pack) return res.status(404).send('Pack not found');
    const cssPath = join(pack.path, 'preview.css');
    res.sendFile(cssPath, (err) => {
      if (err) res.status(404).send('No preview.css');
    });
  });

  return router;
}
