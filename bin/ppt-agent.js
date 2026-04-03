#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import {
  getFigmaImportCaveats,
  getFigmaManualImportInstructions,
} from '../src/figma.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf-8'));
const figmaHelpText = [
  '',
  'Creates an experimental / unstable PowerPoint file tuned for Figma Slides manual import.',
  'Treat both PPTX and Figma export as best-effort only.',
  '',
  'Manual import:',
  `  ${getFigmaManualImportInstructions()}`,
  '',
  'Figma import caveats:',
  ...getFigmaImportCaveats().map((caveat) => `  - ${caveat}`),
].join('\n');

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

function collectRepeatedOption(value, previous = []) {
  return [...previous, value];
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
  .alias('lint')
  .description('Run structured validation on slide HTML files (Playwright-based)')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--format <format>', 'Output format: concise, json, json-full', 'concise')
  .option('--slide <file>', 'Validate only the named slide file (repeatable)', collectRepeatedOption, [])
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir, '--format', options.format];
    for (const slide of options.slide || []) {
      args.push('--slide', String(slide));
    }
    await runCommand('scripts/validate-slides.js', args);
  });

program
  .command('convert')
  .description('Convert slide HTML files to experimental / unstable PPTX')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Output PPTX file')
  .option('--resolution <preset>', 'Raster size preset: 720p, 1080p, 1440p, 2160p, or 4k (default: 2160p)')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    if (options.resolution) {
      args.push('--resolution', String(options.resolution));
    }
    await runCommand('convert.cjs', args);
  });

program
  .command('pdf')
  .description('Convert slide HTML files to PDF')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Output PDF file')
  .option('--mode <mode>', 'PDF export mode: capture for visual fidelity, print for searchable text', 'capture')
  .option('--resolution <preset>', 'Capture raster size preset: 720p, 1080p, 1440p, 2160p, or 4k (default: 2160p in capture mode)')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    if (options.mode) {
      args.push('--mode', String(options.mode));
    }
    if (options.resolution) {
      args.push('--resolution', String(options.resolution));
    }
    await runCommand('scripts/html2pdf.js', args);
  });

program
  .command('fetch-video')
  .description('Download a video into <slides-dir>/assets via yt-dlp and print the ./assets reference')
  .requiredOption('--url <url>', 'Video page URL to download with yt-dlp')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output-name <name>', 'Optional output stem inside <slides-dir>/assets/')
  .action(async (options = {}) => {
    const args = ['--url', String(options.url), '--slides-dir', options.slidesDir];
    if (options.outputName) {
      args.push('--output-name', String(options.outputName));
    }
    await runCommand('scripts/download-video.js', args);
  });

program
  .command('figma')
  .description('Export an experimental / unstable Figma Slides importable PPTX')
  .helpOption('-h, --help', 'Show this help message')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Output PPTX file (default: <slides-dir>-figma.pptx)')
  .addHelpText('after', figmaHelpText)
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    await runCommand('scripts/figma-export.js', args);
  });

program
  .command('tldraw')
  .description('Render a current-format .tldr or store-snapshot JSON file to an exact-size SVG asset for slides')
  .option('--input <path>', 'Input current-format .tldr or snapshot JSON file')
  .option('--output <path>', 'Output SVG asset path')
  .option('--width <number>', 'Exact output width in CSS pixels')
  .option('--height <number>', 'Exact output height in CSS pixels')
  .option('--padding <number>', 'Inner fit padding in CSS pixels')
  .option('--background <css>', 'Optional wrapper background fill')
  .option('--page-id <id>', 'Optional tldraw page id to export')
  .action(async (options = {}) => {
    const args = [];
    if (options.input) args.push('--input', String(options.input));
    if (options.output) args.push('--output', String(options.output));
    if (options.width) args.push('--width', String(options.width));
    if (options.height) args.push('--height', String(options.height));
    if (options.padding) args.push('--padding', String(options.padding));
    if (options.background) args.push('--background', String(options.background));
    if (options.pageId) args.push('--page-id', String(options.pageId));
    await runCommand('scripts/render-tldraw.js', args);
  });

program
  .command('image')
  .description('Generate a local slide image asset with Nano Banana Pro')
  .option('--prompt <text>', 'Prompt for image generation')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Optional output path inside <slides-dir>/assets/')
  .option('--name <slug>', 'Optional asset basename without extension')
  .option('--model <id>', 'Model id (default: gemini-3-pro-image-preview)')
  .option('--aspect-ratio <ratio>', 'Aspect ratio (default: 16:9)')
  .option('--image-size <size>', 'Image size preset: 2K or 4K (default: 4K)')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.prompt) args.push('--prompt', String(options.prompt));
    if (options.output) args.push('--output', String(options.output));
    if (options.name) args.push('--name', String(options.name));
    if (options.model) args.push('--model', String(options.model));
    if (options.aspectRatio) args.push('--aspect-ratio', String(options.aspectRatio));
    if (options.imageSize) args.push('--image-size', String(options.imageSize));
    await runCommand('scripts/generate-image.js', args);
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
