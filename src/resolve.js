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

export const DEFAULT_PACK = 'simple_light';

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
 * Parse CSS variables from a theme.css file content.
 * @param {string} css
 * @returns {Record<string, string>}
 */
function parseThemeColors(css) {
  const colors = {};
  const re = /--([a-z\-]+)\s*:\s*([^;/]+)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    colors[m[1]] = m[2].trim();
  }
  return colors;
}

/**
 * Derive a display name from a pack ID.
 * "simple_light" → "Simple Light", "mobile_strategy" → "Mobile Strategy"
 */
function packIdToName(id) {
  return id.replace(/(^|[-_])([a-z])/g, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase());
}

/**
 * Validate and normalize a pack ID from user input.
 * Returns trimmed ID or empty string if invalid.
 * @param {*} value
 * @returns {string}
 */
/** Valid pack ID pattern: lowercase alphanumeric, hyphens, underscores. */
export const PACK_NAME_REGEX = /^[a-z0-9][a-z0-9\-_]*$/;

export function normalizePackId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || !PACK_NAME_REGEX.test(trimmed)) return '';
  return trimmed;
}

/**
 * Resolve a pack by its ID. A valid pack must have a theme.css file.
 * @param {string} packId
 * @returns {{ path: string, source: 'local' | 'package' } | null}
 */
export function resolvePack(packId) {
  if (!packId || !PACK_NAME_REGEX.test(packId)) return null;

  const localPath = join(getCwd(), 'packs', packId);
  if (existsSync(join(localPath, 'theme.css'))) {
    return { path: localPath, source: 'local' };
  }

  const pkgPath = join(PACKAGE_ROOT, 'packs', packId);
  if (existsSync(join(pkgPath, 'theme.css'))) {
    return { path: pkgPath, source: 'package' };
  }

  return null;
}

/**
 * Get pack info (name, colors) derived from theme.css.
 * @param {string} packId
 * @returns {{ id: string, name: string, colors: Record<string, string> } | null}
 */
export function getPackInfo(packId) {
  const pack = resolvePack(packId);
  if (!pack) return null;

  const themePath = join(pack.path, 'theme.css');
  let colors = {};
  try {
    colors = parseThemeColors(readFileSync(themePath, 'utf-8'));
  } catch { /* no theme */ }

  return { id: packId, name: packIdToName(packId), colors };
}

/**
 * List templates owned by a specific pack.
 * @param {string} packId
 * @param {{ includeFallback?: boolean }} [opts]
 * @returns {string[]} template names (without .html)
 */
export function listPackTemplates(packId, opts = {}) {
  const pack = resolvePack(packId);
  if (!pack) return [];

  const templatesDir = join(pack.path, 'templates');
  const own = existsSync(templatesDir)
    ? readdirSync(templatesDir).filter(f => f.endsWith('.html')).map(f => f.replace('.html', ''))
    : [];

  if (!opts.includeFallback || packId === DEFAULT_PACK) return own.sort();

  // Merge with simple_light fallback templates
  const fallback = listPackTemplates(DEFAULT_PACK);
  const merged = new Set([...own, ...fallback]);
  return Array.from(merged).sort();
}

/**
 * List all available packs with info derived from theme.css.
 * @returns {Array<{ id: string, name: string, colors: Record<string, string>, templates: string[] }>}
 */
export function listPacks() {
  // Auto-discover packs: scan both local and package packs dirs
  // for subdirectories containing theme.css
  const seen = new Map(); // id → pack entry (local wins over package)
  const fallbackTemplates = listPackTemplates(DEFAULT_PACK); // cache once

  for (const baseDir of [join(getCwd(), 'packs'), join(PACKAGE_ROOT, 'packs')]) {
    if (!existsSync(baseDir)) continue;
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
      if (seen.has(entry.name)) continue; // local takes priority
      const packDir = join(baseDir, entry.name);
      if (!existsSync(join(packDir, 'theme.css'))) continue;

      const info = getPackInfo(entry.name);
      const own = listPackTemplates(entry.name);
      const templates = entry.name === DEFAULT_PACK
        ? own
        : Array.from(new Set([...own, ...fallbackTemplates])).sort();
      const ownCount = own.length;
      seen.set(entry.name, {
        id: entry.name,
        name: info?.name || entry.name,
        colors: info?.colors || {},
        templates,
        ownTemplates: own,
        tier: ownCount > 0 ? 'custom' : 'skin',
        ownTemplateCount: ownCount,
      });
    }
  }

  // Put simple_light first, then sort rest alphabetically
  const result = Array.from(seen.values());
  result.sort((a, b) => {
    if (a.id === DEFAULT_PACK) return -1;
    if (b.id === DEFAULT_PACK) return 1;
    return a.id.localeCompare(b.id);
  });
  return result;
}

/**
 * Resolve a template file with pack support.
 * Resolution: pack → simple_light fallback → local CWD fallback
 *
 * @param {string} name — template name without extension (e.g. "cover")
 * @param {string} [packId] — pack ID (defaults to simple_light)
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

  // 2. Fallback to simple_light (if not already)
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
 * Resolve a pack's theme.css file.
 * @param {string} packId — pack ID (e.g. "midnight")
 * @returns {{ path: string, source: 'local' | 'package', pack: string } | null}
 */
export function resolvePackTheme(packId) {
  const effectivePackId = packId || DEFAULT_PACK;
  const pack = resolvePack(effectivePackId);
  if (pack) {
    const themePath = join(pack.path, 'theme.css');
    if (existsSync(themePath)) {
      return { path: themePath, source: pack.source, pack: effectivePackId };
    }
  }

  // Fallback to simple_light pack's theme
  if (effectivePackId !== DEFAULT_PACK) {
    const defaultPack = resolvePack(DEFAULT_PACK);
    if (defaultPack) {
      const fallbackPath = join(defaultPack.path, 'theme.css');
      if (existsSync(fallbackPath)) {
        return { path: fallbackPath, source: defaultPack.source, pack: DEFAULT_PACK };
      }
    }
  }

  return null;
}

/**
 * Resolve a theme file. Checks pack theme.css first, then legacy themes/ dir.
 * @param {string} name — theme/pack name without extension (e.g. "midnight", "simple_light")
 * @returns {{ path: string, source: 'local' | 'package' } | null}
 */
export function resolveTheme(name) {
  // Try as pack theme first
  const packTheme = resolvePackTheme(name);
  if (packTheme) return { path: packTheme.path, source: packTheme.source };

  // Legacy fallback: themes/ directory
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
 * Uses simple_light pack as the primary source.
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

  // Package templates from simple_light pack
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
 * Read common template types from packs/common-types.json.
 * @returns {Record<string, string>} type name → description
 */
let _commonTypesCache;
export function getCommonTypes() {
  if (_commonTypesCache) return _commonTypesCache;
  const typesPath = join(PACKAGE_ROOT, 'packs', 'common-types.json');
  try { _commonTypesCache = JSON.parse(readFileSync(typesPath, 'utf-8')); } catch { _commonTypesCache = {}; }
  return _commonTypesCache;
}

/**
 * Resolve a script path. Always from package.
 * @param {string} relativePath — e.g. "scripts/validate-slides.js"
 */
export function resolveScript(relativePath) {
  return join(PACKAGE_ROOT, relativePath);
}
