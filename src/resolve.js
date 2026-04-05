/**
 * Path resolution for slides-grab.
 *
 * Resolution order:
 *   1. Local (user's CWD) — per-project overrides
 *   2. Package root — built-in defaults
 *
 * slides directory, slide-outline.md → always local (CWD)
 * templates/ → local first, package fallback
 * scripts/ → always package
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(__dirname, '..');

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

/**
 * Resolve a template file. Local first, then package fallback.
 * @param {string} name — template name without extension (e.g. "cover")
 * @returns {{ path: string, source: 'local' | 'package' } | null}
 */
export function resolveTemplate(name) {
  const fileName = name.endsWith('.html') ? name : `${name}.html`;

  const localPath = join(getCwd(), 'templates', fileName);
  if (existsSync(localPath)) {
    return { path: localPath, source: 'local' };
  }

  const packagePath = join(PACKAGE_ROOT, 'templates', fileName);
  if (existsSync(packagePath)) {
    return { path: packagePath, source: 'package' };
  }

  return null;
}

/**
 * List all available templates (local + package, deduplicated).
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

  // Package templates (only if not already overridden)
  const pkgDir = join(PACKAGE_ROOT, 'templates');
  if (existsSync(pkgDir)) {
    for (const f of readdirSync(pkgDir)) {
      if (f.endsWith('.html') && !seen.has(f)) {
        seen.set(f, { name: f.replace('.html', ''), source: 'package' });
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
