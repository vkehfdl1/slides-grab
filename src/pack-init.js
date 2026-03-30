/**
 * Pack scaffolding logic for `slides-grab pack init <name>`.
 *
 * Creates the directory structure for a new custom template pack:
 *   packs/<name>/
 *   packs/<name>/theme.css
 *   packs/<name>/templates/   (empty)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regex for valid pack names: lowercase alphanumeric, hyphens, underscores.
 * Must start with a letter or digit (no leading hyphens/underscores).
 */
export const PACK_NAME_REGEX = /^[a-z0-9][a-z0-9\-_]*$/;

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
  --text-on-accent: #ffffff;

  /* === Accent === */
  --accent: #4361ee;
  --accent-light: #e8ecff;

  /* === Border === */
  --border: #dee2e6;

  /* === Font === */
  --font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;
}
`;
}

/**
 * Scaffold a new custom pack directory.
 *
 * @param {string} name - pack name (must pass validatePackName)
 * @param {string} packsDir - absolute path to the packs/ directory (e.g. `join(cwd, 'packs')`)
 * @throws {Error} if name is invalid or the pack already exists
 * @returns {{ packDir: string, themePath: string, templatesDir: string }}
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

  // Create pack root and templates subdirectory
  mkdirSync(packDir, { recursive: true });
  const templatesDir = join(packDir, 'templates');
  mkdirSync(templatesDir);

  // Write theme.css
  const themePath = join(packDir, 'theme.css');
  writeFileSync(themePath, buildThemeCss(name), 'utf-8');

  return { packDir, themePath, templatesDir };
}
