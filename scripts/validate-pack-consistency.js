#!/usr/bin/env node
/**
 * Validate consistency between design.md and theme.css across all packs.
 *
 * Checks:
 *   1. Color variables: design.md Color Usage table vs theme.css :root values
 *
 * Usage: node scripts/validate-pack-consistency.js [--fix]
 *   --fix: Update theme.css to match design.md values
 */

import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = resolve(__dirname, '..', 'packs');
const FIX_MODE = process.argv.includes('--fix');

/** Parse CSS variables from theme.css content. */
function parseThemeCss(css) {
  const vars = {};
  const re = /--([a-z][\w-]*)\s*:\s*([^;]+)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    vars[`--${m[1]}`] = m[2].trim();
  }
  return vars;
}

/** Parse Color Usage table from design.md content. Returns { token: hexValue } */
function parseDesignColors(md) {
  const colors = {};
  // Match markdown table rows: | `--token` | `#hex` | description |
  const re = /\|\s*`(--[\w-]+)`\s*\|\s*`(#[0-9a-fA-F]{3,8})`\s*\|/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    colors[m[1]] = m[2].toLowerCase();
  }
  return colors;
}

function main() {
  const packDirs = readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort();

  let totalPacks = 0;
  let matchPacks = 0;
  let mismatchPacks = 0;
  let fixedCount = 0;

  for (const packId of packDirs) {
    const packDir = join(PACKS_DIR, packId);
    const themePath = join(packDir, 'theme.css');
    const designPath = join(packDir, 'design.md');

    if (!existsSync(themePath)) continue;
    totalPacks++;

    if (!existsSync(designPath)) {
      console.log(`  ${packId}: no design.md (skipped)`);
      continue;
    }

    const themeCss = readFileSync(themePath, 'utf-8');
    const designMd = readFileSync(designPath, 'utf-8');

    const themeVars = parseThemeCss(themeCss);
    const designColors = parseDesignColors(designMd);

    const mismatches = [];

    // Compare color variables
    for (const [token, designValue] of Object.entries(designColors)) {
      const themeValue = themeVars[token];
      if (!themeValue) {
        mismatches.push({ token, type: 'missing', designValue, themeValue: null });
        continue;
      }
      // Normalize: extract hex from theme value (may have comments or extra text)
      const themeHex = themeValue.match(/#[0-9a-fA-F]{3,8}/)?.[0]?.toLowerCase();
      if (themeHex && themeHex !== designValue.toLowerCase()) {
        mismatches.push({ token, type: 'color', designValue, themeValue: themeHex });
      }
    }

    if (mismatches.length === 0) {
      const colorCount = Object.keys(designColors).length;
      console.log(`  \u2713 ${packId}: ${colorCount} color variables match`);
      matchPacks++;
    } else {
      console.log(`  \u2717 ${packId}: ${mismatches.length} mismatch(es)`);
      for (const mm of mismatches) {
        if (mm.type === 'missing') {
          console.log(`    ${mm.token}: missing in theme.css (design=${mm.designValue})`);
        } else {
          console.log(`    ${mm.token}: theme=${mm.themeValue}, design=${mm.designValue}`);
        }
      }
      mismatchPacks++;

      // Fix mode: update theme.css to match design.md
      if (FIX_MODE) {
        let updated = themeCss;
        for (const mm of mismatches) {
          if (mm.type === 'color') {
            // Replace the hex value for this token in theme.css
            const re = new RegExp(`(${mm.token}\\s*:\\s*)#[0-9a-fA-F]{3,8}`, 'g');
            updated = updated.replace(re, `$1${mm.designValue}`);
          }
        }
        if (updated !== themeCss) {
          writeFileSync(themePath, updated, 'utf-8');
          const fixCount = mismatches.filter(m => m.type === 'color').length;
          fixedCount += fixCount;
          console.log(`    -> Fixed ${fixCount} value(s) in theme.css`);
        }
      }
    }
  }

  console.log('');
  console.log(`Summary: ${totalPacks} packs checked, ${matchPacks} fully consistent, ${mismatchPacks} with mismatches`);
  if (FIX_MODE && fixedCount > 0) {
    console.log(`Fixed: ${fixedCount} value(s) updated in theme.css files`);
  }
  if (!FIX_MODE && mismatchPacks > 0) {
    console.log('Run with --fix to update theme.css to match design.md values.');
  }

  process.exitCode = mismatchPacks > 0 && !FIX_MODE ? 1 : 0;
}

main();
