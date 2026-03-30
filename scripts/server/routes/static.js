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

  // Serve pack files (templates, theme.css) for iframe preview
  const localPacksDir = join(process.cwd(), 'packs');
  if (existsSync(localPacksDir)) {
    router.use('/packs-preview', express.static(localPacksDir));
  }
  router.use('/packs-preview', express.static(join(PACKAGE_ROOT, 'packs')));

  // Fallback: templates reference base.css/theme.css with relative paths
  router.get('/packs-preview/:packId/templates/:file', (req, res, next) => {
    const { packId, file } = req.params;
    if (!file.endsWith('.css')) return next();
    const dirs = [localPacksDir, join(PACKAGE_ROOT, 'packs')];
    for (const dir of dirs) {
      const filePath = join(dir, packId, file);
      if (existsSync(filePath)) return res.sendFile(filePath);
    }
    next();
  });

  const editorHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'editor.html');
  const browserHtmlPath = join(PACKAGE_ROOT, 'src', 'editor', 'browser.html');

  router.get('/', async (_req, res) => {
    try {
      const targetPath = opts.browseMode ? browserHtmlPath : editorHtmlPath;
      const html = await readFile(targetPath, 'utf-8');
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
      const html = await readFile(filePath, 'utf-8');
      res.type('html').send(html);
    } catch {
      res.status(404).send(`Slide not found: ${file}`);
    }
  });

  return router;
}
