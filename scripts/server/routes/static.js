import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import { normalizeSlideFilename } from '../helpers.js';
import { DEFAULT_PACK, PACK_NAME_REGEX } from '../../../src/resolve.js';

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

  // Serve pack template previews with theme.css injection and base fallback
  const localPacksDir = join(process.cwd(), 'packs');
  const packDirs = [localPacksDir, join(PACKAGE_ROOT, 'packs')];

  function findPackFile(...segments) {
    for (const dir of packDirs) {
      const p = join(dir, ...segments);
      if (existsSync(p)) return p;
    }
    return null;
  }

  function extractRootVars(css) {
    const match = css.match(/:root\s*\{(?:[^{}]|\{[^}]*\})*\}/);
    return match ? match[0] : '';
  }

  router.get('/packs-preview/:packId/templates/:file', async (req, res, next) => {
    const { packId, file } = req.params;
    if (!PACK_NAME_REGEX.test(packId) || file.includes('..')) return next();

    // CSS files: serve from pack's templates/ or pack root
    if (file.endsWith('.css')) {
      const p = findPackFile(packId, 'templates', file) || findPackFile(packId, file);
      return p ? res.sendFile(p) : next();
    }

    if (!file.endsWith('.html')) return next();

    // HTML: resolve template (pack own → base fallback)
    const ownPath = findPackFile(packId, 'templates', file);
    const templatePath = ownPath
      || (packId !== DEFAULT_PACK ? findPackFile(DEFAULT_PACK, 'templates', file) : null);
    if (!templatePath) return next();

    // Inject pack's theme.css
    const themePath = findPackFile(packId, 'theme.css');
    if (!themePath) return res.sendFile(templatePath);

    const [themeCss, html] = await Promise.all([
      readFile(themePath, 'utf-8'),
      readFile(templatePath, 'utf-8'),
    ]);
    // Own templates: inject full theme.css (component CSS needed)
    // Fallback templates: inject only :root variables (avoid layout conflicts)
    const cssToInject = ownPath ? themeCss : extractRootVars(themeCss);
    if (!cssToInject) return res.sendFile(templatePath);

    const result = html.replace('</head>', `<style>\n/* Pack: ${packId} */\n${cssToInject}\n</style>\n</head>`);
    return res.type('html').send(result);
  });

  // Static fallback for non-template pack assets (images, etc.)
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
