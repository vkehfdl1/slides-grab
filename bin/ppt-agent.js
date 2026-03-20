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
  .command('show-template')
  .description('Print the contents of a template file')
  .argument('<name>', 'Template name (e.g. "cover", "content", "chart")')
  .action(async (name) => {
    const { resolveTemplate } = await import('../src/resolve.js');
    const result = resolveTemplate(name);
    if (!result) {
      console.error(`Template "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const content = readFileSync(result.path, 'utf-8');
    console.log(`# Template: ${name} (${result.source})`);
    console.log(`# Path: ${result.path}\n`);
    console.log(content);
  });

program
  .command('show-theme')
  .description('Print the contents of a theme file')
  .argument('<name>', 'Theme name (e.g. "modern-dark", "executive")')
  .action(async (name) => {
    const { resolveTheme } = await import('../src/resolve.js');
    const result = resolveTheme(name);
    if (!result) {
      console.error(`Theme "${name}" not found.`);
      process.exitCode = 1;
      return;
    }
    const content = readFileSync(result.path, 'utf-8');
    console.log(`/* Theme: ${name} (${result.source}) */`);
    console.log(`/* Path: ${result.path} */\n`);
    console.log(content);
  });

await program.parseAsync(process.argv);
