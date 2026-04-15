import { basename, relative } from 'node:path';

import { listSlideFiles, toPosixPath } from '../helpers.js';

/**
 * Model and editor config routes.
 * Routes: GET /api/models, GET /api/editor-config
 */
export function createModelsRouter(ctx) {
  const { express, opts } = ctx;
  const router = express.Router();

  router.get('/api/editor-config', async (_req, res) => {
    const slidesDirectory = ctx.getSlidesDir();
    let effectiveCreateMode = opts.createMode;
    if (effectiveCreateMode && slidesDirectory) {
      try {
        const existing = await listSlideFiles(slidesDirectory);
        if (existing.length > 0) effectiveCreateMode = false;
      } catch { /* directory may not exist yet */ }
    }
    res.json({
      createMode: effectiveCreateMode,
      browseMode: opts.browseMode || false,
      deckName: opts.deckName || (slidesDirectory ? basename(slidesDirectory) : ''),
      slidesDir: slidesDirectory ? toPosixPath(relative(process.cwd(), slidesDirectory) || slidesDirectory) : '',
      importFile: opts.importFile || null,
      importDocSource: opts.importDocSource || null,
      importDocSourceType: opts.importDocSourceType || null,
      importPack: opts.importPack || null,
      importSlideCount: opts.importSlideCount || null,
    });
  });

  router.get('/api/models', (_req, res) => {
    res.json({
      models: ctx.ALL_MODELS,
      defaultModel: ctx.DEFAULT_CODEX_MODEL,
    });
  });

  return router;
}
