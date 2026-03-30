#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8'));

/**
 * Run a Node.js script from the package, with CWD set to the user's directory.
 * Scripts resolve slide paths via --slides-dir and templates/themes via src/resolve.js.
 */
function runNodeScript(relativePath, args = []) {
  return new Promise((resolvePromise, rejectPromise) => {
    const scriptPath = resolve(packageRoot, relativePath);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        PPT_AGENT_PACKAGE_ROOT: packageRoot,
      }
    });

    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Command terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

async function runCommand(relativePath, args = []) {
  try {
    const code = await runNodeScript(relativePath, args);
    if (code !== 0) {
      process.exitCode = code;
    }
  } catch (error) {
    console.error(`[slides-grab] ${error.message}`);
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name('slides-grab')
  .description('Agent-first PPT framework CLI')
  .version(packageJson.version);

// --- Core workflow commands ---

program
  .command('build-viewer')
  .description('Build viewer.html from slide HTML files')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    await runCommand('scripts/build-viewer.js', args);
  });

program
  .command('validate')
  .description('Run structured validation on slide HTML files (Playwright-based)')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    await runCommand('scripts/validate-slides.js', args);
  });

program
  .command('convert')
  .description('Convert slide HTML files to PPTX')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Output PPTX file')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    await runCommand('convert.cjs', args);
  });

program
  .command('pdf')
  .description('Convert slide HTML files to PDF')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Output PDF file')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    await runCommand('scripts/html2pdf.js', args);
  });

program
  .command('svg')
  .description('Export slide HTML files as individual SVG or PNG images')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Output directory', 'output')
  .option('--format <type>', 'Output format: svg or png', 'svg')
  .option('--scale <number>', 'Scale factor for output size', '2')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    if (options.format) {
      args.push('--format', String(options.format));
    }
    if (options.scale) {
      args.push('--scale', String(options.scale));
    }
    await runCommand('scripts/html2svg.js', args);
  });

program
  .command('edit')
  .description('Start interactive slide editor with Codex image-based edit flow')
  .option('--port <number>', 'Server port')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.port) {
      args.push('--port', String(options.port));
    }
    await runCommand('scripts/editor-server.js', args);
  });

program
  .command('create')
  .description('Start editor in creation mode — generate a new presentation from scratch')
  .option('--port <number>', 'Server port')
  .option('--deck-name <name>', 'Deck folder name under decks/ (auto-generated if omitted)')
  .action(async (options = {}) => {
    const args = ['--create'];
    if (options.deckName) {
      args.push('--deck-name', options.deckName);
    }
    if (options.port) {
      args.push('--port', String(options.port));
    }
    await runCommand('scripts/editor-server.js', args);
  });

program
  .command('import')
  .description('Import a document (markdown, PDF, or URL) and convert to presentation slides')
  .argument('<source>', 'File path (markdown/PDF) or URL (https://...)')
  .option('--port <number>', 'Server port')
  .option('--deck-name <name>', 'Deck folder name under decks/ (auto-generated if omitted)')
  .option('--slide-count <range>', 'Target slide count range (e.g., "25~30")')
  .option('--research', 'Enable additional web research to enrich content')
  .option('--pack <id>', 'Template pack to use')
  .action(async (source, options = {}) => {
    // Auto-detect source type
    const isUrl = /^https?:\/\//i.test(source);
    const isPdf = !isUrl && source.toLowerCase().endsWith('.pdf');

    if (isUrl || isPdf) {
      // New document import flow
      const args = ['--import-doc', source];
      if (isPdf) args.push('--source-type', 'pdf');
      if (isUrl) args.push('--source-type', 'url');
      if (options.deckName) args.push('--deck-name', options.deckName);
      if (options.port) args.push('--port', String(options.port));
      if (options.slideCount) args.push('--slide-count', options.slideCount);
      if (options.research) args.push('--research');
      if (options.pack) args.push('--pack', options.pack);
      await runCommand('scripts/editor-server.js', args);
    } else {
      // Existing markdown import flow
      const args = ['--import', source];
      if (options.deckName) args.push('--deck-name', options.deckName);
      if (options.port) args.push('--port', String(options.port));
      if (options.slideCount) args.push('--slide-count', options.slideCount);
      if (options.research) args.push('--research');
      await runCommand('scripts/editor-server.js', args);
    }
  });

program
  .command('review')
  .description('Analyze a presentation deck and generate quality report')
  .requiredOption('--deck <name>', 'Deck folder name under decks/')
  .option('--audience <type>', 'Target audience (e.g., investors, technical, general)')
  .option('--time <minutes>', 'Presentation time in minutes', '15')
  .action(async (options = {}) => {
    const args = ['--deck', options.deck];
    if (options.audience) args.push('--audience', options.audience);
    if (options.time) args.push('--time', String(options.time));
    await runCommand('scripts/review.js', args);
  });

program
  .command('retheme')
  .description('Re-generate a deck with a different template pack (one-click redesign)')
  .requiredOption('--deck <name>', 'Deck folder name under decks/')
  .requiredOption('--pack <id>', 'Target template pack ID')
  .option('--save-as <name>', 'Save as a new deck instead of overwriting')
  .option('--model <model>', 'Claude model to use')
  .action(async (options = {}) => {
    const args = ['--deck', options.deck, '--pack', options.pack];
    if (options.saveAs) args.push('--save-as', options.saveAs);
    if (options.model) args.push('--model', options.model);
    await runCommand('scripts/retheme.js', args);
  });

program
  .command('browse')
  .description('Open deck browser to view and manage all decks')
  .option('--port <number>', 'Server port')
  .action(async (options = {}) => {
    const args = ['--browse'];
    if (options.port) {
      args.push('--port', String(options.port));
    }
    await runCommand('scripts/editor-server.js', args);
  });

program
  .command('split')
  .description('Split a multi-slide HTML file into individual slide-*.html files')
  .requiredOption('--input <path>', 'Source HTML file containing multiple slides')
  .option('--slides-dir <path>', 'Output directory', 'slides')
  .option('--selector <sel>', 'CSS selector for slide elements', '.slide')
  .option('--source-width <px>', 'Source slide width in px (auto-detected)')
  .option('--source-height <px>', 'Source slide height in px (auto-detected)')
  .option('--no-scale', 'Skip scaling (source is already 720pt×405pt)')
  .action(async (options = {}) => {
    const args = ['--input', options.input, '--slides-dir', options.slidesDir];
    if (options.selector && options.selector !== '.slide') {
      args.push('--selector', options.selector);
    }
    if (options.sourceWidth) args.push('--source-width', String(options.sourceWidth));
    if (options.sourceHeight) args.push('--source-height', String(options.sourceHeight));
    if (options.noScale === false) args.push('--no-scale');
    await runCommand('scripts/split-html.js', args);
  });

program
  .command('install-codex-skills')
  .description('Install project Codex skills into $CODEX_HOME/skills (default: ~/.codex/skills)')
  .option('--force', 'Overwrite existing skill directories')
  .option('--dry-run', 'Preview what would be installed')
  .action(async (options = {}) => {
    const args = [];
    if (options.force) args.push('--force');
    if (options.dryRun) args.push('--dry-run');
    await runCommand('scripts/install-codex-skills.js', args);
  });

// --- Template/theme discovery commands ---

program
  .command('list-templates')
  .description('List all available slide templates (local overrides + package built-ins)')
  .action(async () => {
    const { listTemplates } = await import('../src/resolve.js');
    const templates = listTemplates();
    if (templates.length === 0) {
      console.log('No templates found.');
      return;
    }
    console.log('Available templates:\n');
    for (const t of templates) {
      const tag = t.source === 'local' ? '(local)' : '(built-in)';
      console.log(`  ${t.name.padEnd(20)} ${tag}`);
    }
    console.log(`\nTotal: ${templates.length} templates`);
  });

program
  .command('list-themes')
  .description('List all available color themes (local overrides + package built-ins)')
  .action(async () => {
    const { listThemes } = await import('../src/resolve.js');
    const themes = listThemes();
    if (themes.length === 0) {
      console.log('No themes found.');
      return;
    }
    console.log('Available themes:\n');
    for (const t of themes) {
      const tag = t.source === 'local' ? '(local)' : '(built-in)';
      console.log(`  ${t.name.padEnd(20)} ${tag}`);
    }
    console.log(`\nTotal: ${themes.length} themes`);
  });

program
  .command('list-packs')
  .description('List all available template packs')
  .action(async () => {
    const { listPacks } = await import('../src/resolve.js');
    const packs = listPacks();
    if (packs.length === 0) {
      console.log('No packs found.');
      return;
    }
    console.log('Available template packs:\n');
    for (const p of packs) {
      const accent = p.colors.accent || '';
      const bg = p.colors['bg-primary'] || '';
      console.log(`  ${p.id.padEnd(18)} ${p.name.padEnd(16)} ${p.templates.length} templates  (bg: ${bg}, accent: ${accent})`);
    }
    console.log(`Total: ${packs.length} packs`);
  });

program
  .command('show-pack')
  .description('Show details and templates of a specific pack')
  .argument('<id>', 'Pack ID (e.g. "midnight", "corporate")')
  .action(async (id) => {
    const { getPackInfo, listPackTemplates, getCommonTypes } = await import('../src/resolve.js');
    const info = getPackInfo(id);
    if (!info) {
      console.error(`Pack "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    const ownTemplates = listPackTemplates(id);
    const commonTypes = getCommonTypes();
    const allTypeNames = Object.keys(commonTypes);

    console.log(`Pack: ${info.name} (${id})`);
    console.log(`Colors:`);
    for (const [key, val] of Object.entries(info.colors)) {
      console.log(`  --${key}: ${val}`);
    }
    console.log(`\nOwn templates (${ownTemplates.length}):`);
    for (const t of ownTemplates) {
      const desc = commonTypes[t] || '';
      console.log(`  ${t.padEnd(20)} ${desc ? `— ${desc}` : ''}`);
    }
    const missing = allTypeNames.filter(t => !ownTemplates.includes(t));
    if (missing.length > 0) {
      console.log(`\nNot in pack — AI generates from theme.css (${missing.length}):`);
      for (const t of missing) {
        console.log(`  ${t}`);
      }
    }
  });

program
  .command('show-template')
  .description('Print the contents of a template file')
  .argument('<name>', 'Template name (e.g. "cover", "content", "chart")')
  .option('--pack <id>', 'Pack ID to resolve template from')
  .option('--raw', 'Print raw HTML without inlining external CSS')
  .action(async (name, options) => {
    const { resolveTemplate } = await import('../src/resolve.js');
    const { dirname: dirnameFn, join: joinFn } = await import('node:path');
    const result = resolveTemplate(name, options.pack);
    if (!result) {
      console.error(`Template "${name}" not found${options.pack ? ` in pack "${options.pack}"` : ''}.`);
      process.exitCode = 1;
      return;
    }
    let content = readFileSync(result.path, 'utf-8');
    console.log(`# Template: ${name} (${result.source}, pack: ${result.pack})`);
    console.log(`# Path: ${result.path}\n`);

    // Inline external CSS <link> references for AI readability
    if (!options.raw) {
      const templateDir = dirnameFn(result.path);
      // Also check pack root (one level up from templates/)
      const packDir = dirnameFn(templateDir);
      content = content.replace(
        /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/gi,
        (match, href) => {
          // Skip CDN/external URLs
          if (href.startsWith('http://') || href.startsWith('https://')) return match;
          // Try resolving from template dir, then pack root
          for (const base of [templateDir, packDir]) {
            const cssPath = joinFn(base, href);
            try {
              const css = readFileSync(cssPath, 'utf-8');
              return `<style>\n/* Inlined from ${href} */\n${css}\n</style>`;
            } catch { /* not found here, try next */ }
          }
          return match; // Keep original if not found
        }
      );
    }

    console.log(content);
  });

program
  .command('show-theme')
  .description('Print the theme CSS for a pack or legacy theme')
  .argument('[name]', 'Pack ID or legacy theme name (default: simple_light)')
  .option('--pack <id>', 'Pack ID (alias for argument)')
  .action(async (name, options) => {
    const packId = options.pack || name || 'simple_light';
    const { resolvePackTheme, resolveTheme } = await import('../src/resolve.js');

    // Try pack theme first
    const packResult = resolvePackTheme(packId);
    if (packResult) {
      const content = readFileSync(packResult.path, 'utf-8');
      console.log(`/* Theme: ${packId} (${packResult.source}, pack: ${packResult.pack}) */`);
      console.log(`/* Path: ${packResult.path} */\n`);
      console.log(content);
      return;
    }

    // Fallback to legacy theme
    const result = resolveTheme(packId);
    if (!result) {
      console.error(`Theme "${packId}" not found.`);
      process.exitCode = 1;
      return;
    }
    const content = readFileSync(result.path, 'utf-8');
    console.log(`/* Theme: ${packId} (${result.source}) */`);
    console.log(`/* Path: ${result.path} */\n`);
    console.log(content);
  });

// --- Pack management commands ---

const packCmd = program
  .command('pack')
  .description('Manage template packs');

packCmd
  .command('init <name>')
  .description('Scaffold a new custom template pack in packs/<name>/')
  .action(async (name) => {
    const { createPack, validatePackName } = await import('../src/pack-init.js');
    const { join: joinPath } = await import('node:path');

    const validation = validatePackName(name);
    if (!validation.valid) {
      console.error(`[slides-grab] ${validation.error}`);
      process.exitCode = 1;
      return;
    }

    const packsDir = joinPath(process.cwd(), 'packs');
    try {
      const { packDir, themePath, templatesDir } = createPack(name, packsDir);
      console.log(`Pack "${name}" created successfully:`);
      console.log(`  ${packDir}/`);
      console.log(`  ${themePath}`);
      console.log(`  ${templatesDir}/`);
      console.log(`\nEdit theme.css to customize colors, then add templates in templates/.`);
    } catch (error) {
      console.error(`[slides-grab] ${error.message}`);
      process.exitCode = 1;
    }
  });

packCmd
  .command('list')
  .description('List all available template packs (alias for list-packs)')
  .action(async () => {
    const { listPacks } = await import('../src/resolve.js');
    const packs = listPacks();
    if (packs.length === 0) {
      console.log('No packs found.');
      return;
    }
    console.log('Available template packs:\n');
    for (const p of packs) {
      const accent = p.colors.accent || '';
      const bg = p.colors['bg-primary'] || '';
      console.log(`  ${p.id.padEnd(18)} ${p.name.padEnd(16)} ${p.templates.length} templates  (bg: ${bg}, accent: ${accent})`);
    }
    console.log(`Total: ${packs.length} packs`);
  });

await program.parseAsync(process.argv);

