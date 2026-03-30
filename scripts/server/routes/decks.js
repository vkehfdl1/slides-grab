import { readdir, readFile, writeFile, stat, rename, copyFile, mkdir, rm, mkdtemp, unlink } from 'node:fs/promises';
import { basename, join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { listSlideFiles, toPosixPath, setupFileWatcher, withScreenshotPage } from '../helpers.js';

/**
 * Deck browser API routes.
 * Routes: GET /api/decks, POST /api/decks/new, POST /api/decks/switch,
 *         GET /api/decks/:name/thumbnail, PATCH /api/decks/:name/rename,
 *         POST /api/decks/:name/duplicate, DELETE /api/decks/:name
 */
export function createDecksRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  router.get('/api/decks', async (_req, res) => {
    try {
      const decksRoot = resolve(process.cwd(), 'decks');
      let entries;
      try {
        entries = await readdir(decksRoot, { withFileTypes: true });
      } catch {
        return res.json([]);
      }
      const decks = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const deckPath = join(decksRoot, entry.name);
        try {
          const slideFiles = await listSlideFiles(deckPath);
          const deckStat = await stat(deckPath);
          let hasOutline = false;
          try { await stat(join(deckPath, 'slide-outline.md')); hasOutline = true; } catch { /* no outline */ }
          decks.push({
            name: entry.name,
            slideCount: slideFiles.length,
            lastModified: deckStat.mtime.toISOString(),
            hasOutline,
            firstSlide: slideFiles[0] || null,
          });
        } catch { /* skip unreadable dirs */ }
      }
      decks.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      res.json(decks);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/decks/new', (_req, res) => {
    if (ctx.watcher) { try { ctx.watcher.close(); } catch { /* ignore */ } ctx.watcher = null; }
    ctx.setSlidesDir(null);
    opts.deckName = '';
    opts.createMode = true;
    res.json({ ok: true });
  });

  router.post('/api/decks/switch', async (req, res) => {
    const { deckName } = req.body ?? {};
    if (typeof deckName !== 'string' || !deckName.trim()) {
      return res.status(400).json({ error: 'Missing deckName.' });
    }
    const sanitized = deckName.trim();
    const newDir = resolve(process.cwd(), 'decks', sanitized);
    try {
      await stat(newDir);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    ctx.setSlidesDir(newDir);
    opts.deckName = sanitized;
    opts.createMode = false;
    setupFileWatcher(ctx, newDir);
    res.json({
      deckName: sanitized,
      slidesDir: toPosixPath(relative(process.cwd(), newDir) || newDir),
    });
  });

  router.get('/api/decks/:name/thumbnail', async (req, res) => {
    const deckName = req.params.name;
    const deckPath = resolve(process.cwd(), 'decks', deckName);
    try {
      await stat(deckPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    try {
      const slideFiles = await listSlideFiles(deckPath);
      if (slideFiles.length === 0) {
        return res.status(404).json({ error: 'No slides in deck.' });
      }
      const firstSlide = slideFiles[0];
      const thumbPath = join(deckPath, '.thumb.png');

      // Check cache: thumb exists and is newer than first slide
      let useCache = false;
      try {
        const thumbStat = await stat(thumbPath);
        const slideStat = await stat(join(deckPath, firstSlide));
        if (thumbStat.mtime >= slideStat.mtime) useCache = true;
      } catch { /* no cache */ }

      if (useCache) {
        const thumbBuf = await readFile(thumbPath);
        res.type('image/png').send(thumbBuf);
        return;
      }

      // Generate thumbnail using file:// URL
      const tmpPath = await mkdtemp(join(tmpdir(), 'thumb-'));
      const screenshotPath = join(tmpPath, 'thumb.png');

      await withScreenshotPage(ctx, async (page) => {
        await ctx.screenshotMod.captureSlideScreenshot(
          page, firstSlide, screenshotPath, deckPath, { useHttp: false, elementOnly: true },
        );
      });

      const thumbBuf = await readFile(screenshotPath);
      try { await writeFile(thumbPath, thumbBuf); } catch { /* ignore cache write failure */ }
      try { await rm(tmpPath, { recursive: true }); } catch { /* ignore */ }

      res.type('image/png').send(thumbBuf);
    } catch (err) {
      res.status(500).json({ error: `Thumbnail generation failed: ${err.message}` });
    }
  });

  router.patch('/api/decks/:name/rename', async (req, res) => {
    const oldName = basename(req.params.name);
    const { newName: rawNewName } = req.body ?? {};
    if (typeof rawNewName !== 'string' || !rawNewName.trim()) {
      return res.status(400).json({ error: 'Missing newName.' });
    }
    const sanitized = rawNewName.trim().replace(/[<>:"/\\|?*]/g, '-');
    if (!sanitized) {
      return res.status(400).json({ error: 'Invalid name after sanitization.' });
    }
    const decksRoot = resolve(process.cwd(), 'decks');
    const oldPath = resolve(decksRoot, oldName);
    const newPath = resolve(decksRoot, sanitized);
    try {
      await stat(oldPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    if (oldPath === newPath) {
      return res.json({ ok: true, oldName, newName: sanitized });
    }
    try {
      await stat(newPath);
      return res.status(409).json({ error: 'A deck with that name already exists.' });
    } catch { /* good — no conflict */ }
    try {
      await unlink(join(oldPath, '.thumb.png')).catch(() => {});
      await rename(oldPath, newPath);
      const slidesDirectory = ctx.getSlidesDir();
      if (slidesDirectory && resolve(slidesDirectory) === oldPath) {
        ctx.setSlidesDir(newPath);
        opts.deckName = sanitized;
        setupFileWatcher(ctx, newPath);
      }
      res.json({ ok: true, oldName, newName: sanitized });
    } catch (err) {
      res.status(500).json({ error: `Rename failed: ${err.message}` });
    }
  });

  router.post('/api/decks/:name/duplicate', async (req, res) => {
    const srcName = basename(req.params.name);
    const decksRoot = resolve(process.cwd(), 'decks');
    const srcPath = resolve(decksRoot, srcName);
    try {
      await stat(srcPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    let copyName = `${srcName}-copy`;
    let copyPath = resolve(decksRoot, copyName);
    let suffix = 2;
    while (true) {
      try { await stat(copyPath); } catch { break; }
      copyName = `${srcName}-copy-${suffix++}`;
      copyPath = resolve(decksRoot, copyName);
    }
    try {
      await mkdir(copyPath, { recursive: true });
      const entries = await readdir(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue;
        await copyFile(join(srcPath, entry.name), join(copyPath, entry.name));
      }
      res.json({ ok: true, name: copyName });
    } catch (err) {
      res.status(500).json({ error: `Duplicate failed: ${err.message}` });
    }
  });

  router.delete('/api/decks/:name', async (req, res) => {
    const deckName = basename(req.params.name);
    const decksRoot = resolve(process.cwd(), 'decks');
    const deckPath = resolve(decksRoot, deckName);
    if (!deckPath.startsWith(decksRoot)) {
      return res.status(400).json({ error: 'Invalid deck name.' });
    }
    try {
      await stat(deckPath);
    } catch {
      return res.status(404).json({ error: 'Deck not found.' });
    }
    try {
      const slidesDirectory = ctx.getSlidesDir();
      const isActive = slidesDirectory && resolve(slidesDirectory) === deckPath;
      if (isActive) {
        if (ctx.watcher) { try { ctx.watcher.close(); } catch { /* ignore */ } ctx.watcher = null; }
      }
      await rm(deckPath, { recursive: true, force: true });
      if (isActive) {
        ctx.setSlidesDir(null);
        opts.deckName = '';
        opts.createMode = true;
      }
      res.json({ ok: true, deleted: deckName });
    } catch (err) {
      res.status(500).json({ error: `Delete failed: ${err.message}` });
    }
  });

  return router;
}
