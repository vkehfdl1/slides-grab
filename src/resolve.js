/**
 * Path resolution for slides-grab.
 *
 * Resolution order:
 *   1. Local (user's CWD) — per-project overrides
 *   2. Package root — built-in defaults
 *
 * slides directory, slide-outline.md, style-config.md → always local (CWD)
 * packs/, templates/, themes/ → local first, package fallback
 * scripts/ → always package
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

const DEFAULT_PACK = 'figma-default';

/**
 * Get the package root directory (where slides-grab is installed).
 */
export function getPackageRoot() {
  return PACKAGE_ROOT;
}

/**
 * Get the user's working directory (where slides are created).
 */
export function getCwd() {
  return process.cwd();
}

/**
 * Resolve the slides directory in CWD.
 * @param {string} [slidesDir='slides'] - relative or absolute slides directory path
 */
export function getSlidesDir(slidesDir = process.env.PPT_AGENT_SLIDES_DIR || 'slides') {
  return resolve(getCwd(), slidesDir);
}

// ── Pack helpers ─────────────────────────────────────────────────────

/**
 * Locate the packs directory. Local first, then package.
 * @returns {string | null}
 */
function findPacksDir() {
  const localDir = join(getCwd(), 'packs');
  if (existsSync(localDir)) return localDir;

  const pkgDir = join(PACKAGE_ROOT, 'packs');
  if (existsSync(pkgDir)) return pkgDir;

  return null;
}

/**
 * Read and parse a JSON file. Returns null on failure.
 */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Resolve a pack by its ID.
 * @param {string} packId
 * @returns {{ path: string, meta: object, source: 'local' | 'package' } | null}
 */
export function resolvePack(packId) {
  if (!packId) return null;

  const localPath = join(getCwd(), 'packs', packId);
  if (existsSync(localPath)) {
    const meta = readJsonSafe(join(localPath, 'meta.json'));
    if (meta) return { path: localPath, meta, source: 'local' };
  }

  const pkgPath = join(PACKAGE_ROOT, 'packs', packId);
  if (existsSync(pkgPath)) {
    const meta = readJsonSafe(join(pkgPath, 'meta.json'));
    if (meta) return { path: pkgPath, meta, source: 'package' };
  }

  return null;
}

/**
 * List templates owned by a specific pack.
 * @param {string} packId
 * @returns {string[]} template names (without .html)
 */
export function listPackTemplates(packId) {
  const pack = resolvePack(packId);
  if (!pack) return [];

  const templatesDir = join(pack.path, 'templates');
  if (!existsSync(templatesDir)) return [];

  return readdirSync(templatesDir)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''))
    .sort();
}

/**
 * List all available packs with metadata.
 * @returns {Array<{ id: string, name: string, description: string, colors: object, tags: string[], templates: string[] }>}
 */
export function listPacks() {
  const packsDir = findPacksDir();
  if (!packsDir) return [];

  const manifest = readJsonSafe(join(packsDir, 'pack-manifest.json'));
  const packIds = manifest?.packs || [];

  return packIds
    .map(id => {
      const pack = resolvePack(id);
      if (!pack) return null;
      return {
        id: pack.meta.id || id,
        name: pack.meta.name || id,
        description: pack.meta.description || '',
        colors: pack.meta.colors || {},
        tags: pack.meta.tags || [],
        templates: listPackTemplates(id),
      };
    })
    .filter(Boolean);
}

/**
 * Resolve a template file with pack support.
 * Resolution: pack → figma-default fallback → local CWD fallback
 *
 * @param {string} name — template name without extension (e.g. "cover")
 * @param {string} [packId] — pack ID (defaults to figma-default)
 * @returns {{ path: string, source: 'local' | 'package', pack: string } | null}
 */
export function resolveTemplate(name, packId) {
  const fileName = name.endsWith('.html') ? name : `${name}.html`;
  const effectivePackId = packId || DEFAULT_PACK;

  // 1. Check requested pack
  const pack = resolvePack(effectivePackId);
  if (pack) {
    const packTemplatePath = join(pack.path, 'templates', fileName);
    if (existsSync(packTemplatePath)) {
      return { path: packTemplatePath, source: pack.source, pack: effectivePackId };
    }
  }

  // 2. Fallback to figma-default (if not already)
  if (effectivePackId !== DEFAULT_PACK) {
    const defaultPack = resolvePack(DEFAULT_PACK);
    if (defaultPack) {
      const fallbackPath = join(defaultPack.path, 'templates', fileName);
      if (existsSync(fallbackPath)) {
        return { path: fallbackPath, source: defaultPack.source, pack: DEFAULT_PACK };
      }
    }
  }

  // 3. Legacy fallback: local CWD templates/ dir (backward compatibility)
  const localPath = join(getCwd(), 'templates', fileName);
  if (existsSync(localPath)) {
    return { path: localPath, source: 'local', pack: 'local' };
  }

  return null;
}

/**
 * Resolve a theme file. Local first, then package fallback.
 * @param {string} name — theme name without extension (e.g. "modern-dark")
 * @returns {{ path: string, source: 'local' | 'package' } | null}
 */
export function resolveTheme(name) {
  const fileName = name.endsWith('.css') ? name : `${name}.css`;

  const localPath = join(getCwd(), 'themes', fileName);
  if (existsSync(localPath)) {
    return { path: localPath, source: 'local' };
  }

  const packagePath = join(PACKAGE_ROOT, 'themes', fileName);
  if (existsSync(packagePath)) {
    return { path: packagePath, source: 'package' };
  }

  return null;
}

/**
 * List all available templates (local + package, deduplicated).
 * Uses figma-default pack as the primary source.
 * @returns {Array<{ name: string, source: 'local' | 'package' }>}
 */
export function listTemplates() {
  const seen = new Map();

  // Local templates first (take priority)
  const localDir = join(getCwd(), 'templates');
  if (existsSync(localDir)) {
    for (const f of readdirSync(localDir)) {
      if (f.endsWith('.html')) {
        seen.set(f, { name: f.replace('.html', ''), source: 'local' });
      }
    }
  }

  // Also check local custom/ subdirectory
  const localCustomDir = join(localDir, 'custom');
  if (existsSync(localCustomDir)) {
    for (const f of readdirSync(localCustomDir)) {
      if (f.endsWith('.html')) {
        const key = `custom/${f}`;
        seen.set(key, { name: `custom/${f.replace('.html', '')}`, source: 'local' });
      }
    }
  }

  // Package templates from figma-default pack
  const defaultPack = resolvePack(DEFAULT_PACK);
  if (defaultPack) {
    const pkgDir = join(defaultPack.path, 'templates');
    if (existsSync(pkgDir)) {
      for (const f of readdirSync(pkgDir)) {
        if (f.endsWith('.html') && !seen.has(f)) {
          seen.set(f, { name: f.replace('.html', ''), source: 'package' });
        }
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * List all available themes (local + package, deduplicated).
 * @returns {Array<{ name: string, source: 'local' | 'package' }>}
 */
export function listThemes() {
  const seen = new Map();

  const localDir = join(getCwd(), 'themes');
  if (existsSync(localDir)) {
    for (const f of readdirSync(localDir)) {
      if (f.endsWith('.css')) {
        seen.set(f, { name: f.replace('.css', ''), source: 'local' });
      }
    }
  }

  const pkgDir = join(PACKAGE_ROOT, 'themes');
  if (existsSync(pkgDir)) {
    for (const f of readdirSync(pkgDir)) {
      if (f.endsWith('.css') && !seen.has(f)) {
        seen.set(f, { name: f.replace('.css', ''), source: 'package' });
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resolve a script path. Always from package.
 * @param {string} relativePath — e.g. "scripts/validate-slides.js"
 */
export function resolveScript(relativePath) {
  return join(PACKAGE_ROOT, relativePath);
}
