/**
 * Pack scaffolding logic for `slides-grab pack init <name>`.
 *
 * Creates the directory structure for a new custom pack:
 *   packs/<name>/
 *   packs/<name>/theme.css
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACK_NAME_REGEX } from './resolve.js';

export { PACK_NAME_REGEX };

/**
 * Validate a pack name.
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePackName(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    return { valid: false, error: 'Pack name must be a non-empty string.' };
  }
  if (!PACK_NAME_REGEX.test(name)) {
    return {
      valid: false,
      error: `Invalid pack name "${name}". Use lowercase letters, digits, hyphens, and underscores only (must start with a letter or digit).`,
    };
  }
  return { valid: true };
}

/**
 * Generate the default theme.css content for a new pack.
 * @param {string} name - pack name used in the comment header
 * @returns {string}
 */
function buildThemeCss(name) {
  return `/* Custom pack: ${name} */
:root {
  /* === Background === */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-elevated: #ffffff;

  /* === Text === */
  --text-primary: #1a1a2e;
  --text-secondary: #6c757d;

  /* === Accent === */
  --accent: #4361ee;

  /* === Border === */
  --border: #dee2e6;

  /* === Font === */
  --font-sans: 'Pretendard', -apple-system, sans-serif;

  /* === Typography scale (adjust values to match your pack's personality) === */
  --title-hero: 64pt;
  --title-section: 44pt;
  --title-slide: 32pt;
  --text-subtitle: 20pt;
  --text-body: 16pt;
  --text-caption: 11pt;
  --text-label: 10pt;
}
`;
}

/**
 * Scaffold a new custom pack directory.
 *
 * @param {string} name - pack name (must pass validatePackName)
 * @param {string} packsDir - absolute path to the packs/ directory (e.g. `join(cwd, 'packs')`)
 * @throws {Error} if name is invalid or the pack already exists
 * @returns {{ packDir: string, themePath: string }}
 */
export function createPack(name, packsDir) {
  const validation = validatePackName(name);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const packDir = join(packsDir, name);
  if (existsSync(packDir)) {
    throw new Error(`Pack "${name}" already exists at ${packDir}`);
  }

  mkdirSync(packDir, { recursive: true });

  // Write theme.css
  const themePath = join(packDir, 'theme.css');
  writeFileSync(themePath, buildThemeCss(name), 'utf-8');

  return { packDir, themePath };
}
