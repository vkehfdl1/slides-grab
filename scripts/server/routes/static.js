import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { normalizeSlideFilename } from '../helpers.js';

/**
 * Static file serving and page routes.
 * Routes: /, /editor, /slides/:file, CSS/JS/asset static mounts
 */
export function createStaticRouter(ctx) {
  const { express, PACKAGE_ROOT, opts } = ctx;
  const router = express.Router();

  // Serve editor JS files
  router.use('/js', express.static(join(PACKAGE_ROOT, 'src', 'editor', 'js'), {
    etag: false, lastModified: false,
    setHeaders: (res) => { res.setHeader('Cache-Control', 'no-store'); },
  }));

  // Serve asset files
  router.use('/asset', express.static(join(PACKAGE_ROOT, 'asset')));

  // Serve extracted CSS files for editor and browser UIs
  const editorDir = join(PACKAGE_ROOT, 'src', 'editor');
  router.get('/editor.css', (_req, res) => { res.type('text/css').sendFile(join(editorDir, 'editor.css')); });
  router.get('/browser.css', (_req, res) => { res.type('text/css').sendFile(join(editorDir, 'browser.css')); });
  router.get('/gallery.css', (_req, res) => { res.type('text/css').sendFile(join(editorDir, 'gallery.css')); });

  // Serve pack assets (preview images, etc.)
  const localPacksDir = join(process.cwd(), 'packs');

  // Static fallback for pack assets
  if (existsSync(localPacksDir)) {
    router.use('/packs-preview', express.static(localPacksDir));
  }
  router.use('/packs-preview', express.static(join(PACKAGE_ROOT, 'packs')));

  const editorHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'editor.html');
  const browserHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'browser.html');

  router.get('/', async (_req, res) => {
    try {
      // Always show deck browser at root; editor lives at /editor
      const html = await readFile(browserHtmlPath, 'utf-8');
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send(`Failed to load page: ${err.message}`);
    }
  });

  router.get('/editor', async (_req, res) => {
    try {
      const html = await readFile(editorHtmlPath, 'utf-8');
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send(`Failed to load editor: ${err.message}`);
    }
  });

  // Serve deck assets (logo images, etc.) under /slides/assets/
  router.use('/slides/assets', (req, res, next) => {
    const slidesDirectory = ctx.getSlidesDir();
    if (!slidesDirectory) return res.status(404).send('No slides directory');
    const assetsDir = join(slidesDirectory, 'assets');
    if (!existsSync(assetsDir)) return res.status(404).send('No assets directory');
    express.static(assetsDir)(req, res, next);
  });

  router.get('/slides/:file', async (req, res) => {
    let file;
    try {
      file = normalizeSlideFilename(req.params.file, 'slide filename');
    } catch {
      return res.status(400).send('Invalid slide filename');
    }

    const slidesDirectory = ctx.getSlidesDir();
    const filePath = join(slidesDirectory, file);
    try {
      let html = await readFile(filePath, 'utf-8');

      // Inject logo overlay from deck.json (skip if ?nologo query param)
      if (req.query.nologo == null) {
        try {
          const { loadDeckConfig, resolveLogoConfig, injectLogoIntoHtml, extractSlideIndex } = await import('../../../src/logo.js');
          const deckConfig = await loadDeckConfig(slidesDirectory);
          const logoConfig = resolveLogoConfig(deckConfig, slidesDirectory);
          if (logoConfig) {
            const slideIndex = extractSlideIndex(file);
            html = injectLogoIntoHtml(html, logoConfig, slideIndex, {
              srcOverride: `/slides/assets/${logoConfig.resolvedPath.split('/assets/').pop()}`,
            });
          }
        } catch (logoErr) {
          console.warn(`[static] Logo injection failed: ${logoErr.message}`);
        }
      }

      res.type('html').send(html);
    } catch {
      res.status(404).send(`Slide not found: ${file}`);
    }
  });

  return router;
}
