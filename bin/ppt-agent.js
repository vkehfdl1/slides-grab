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
 * Scripts resolve slide paths via --slides-dir and templates via src/resolve.js.
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

function reportCliError(error) {
  console.error(`[slides-grab] ${error.message}`);
  process.exitCode = 1;
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
  .option('--mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir, '--mode', options.mode];
    await runCommand('scripts/build-viewer.js', args);
  });

program
  .command('validate')
  .alias('lint')
  .description('Run structured validation on slide HTML files (Playwright-based)')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--format <format>', 'Output format: concise, json, json-full', 'concise')
  .option('--mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .option('--slide <file>', 'Validate only the named slide file (repeatable)', collectRepeatedOption, [])
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir, '--format', options.format, '--mode', options.mode];
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
  .option('--mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .option('--resolution <preset>', 'Raster size preset: 720p, 1080p, 1440p, 2160p, or 4k (default: 2160p)')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir, '--mode', options.mode];
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
  .option('--slide-mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .option('--resolution <preset>', 'Capture raster size preset: 720p, 1080p, 1440p, 2160p, or 4k (default: 2160p in capture mode)')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.output) {
      args.push('--output', String(options.output));
    }
    if (options.mode) {
      args.push('--mode', String(options.mode));
    }
    if (options.slideMode) {
      args.push('--slide-mode', String(options.slideMode));
    }
    if (options.resolution) {
      args.push('--resolution', String(options.resolution));
    }
    await runCommand('scripts/html2pdf.js', args);
  });

program
  .command('png')
  .description('Render slide HTML files to one PNG per slide')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output-dir <path>', 'Output directory for PNG files (default: <slides-dir>/out-png)')
  .option('--slide-mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .option('--resolution <preset>', 'Raster size preset: 720p, 1080p, 1440p, 2160p, or 4k', '2160p')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.outputDir) {
      args.push('--output-dir', String(options.outputDir));
    }
    if (options.slideMode) {
      args.push('--slide-mode', String(options.slideMode));
    }
    if (options.resolution) {
      args.push('--resolution', String(options.resolution));
    }
    await runCommand('scripts/html2png.js', args);
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
  .option('--mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .addHelpText('after', figmaHelpText)
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir, '--mode', options.mode];
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
  .description('Generate a local slide image asset (default: god-tibo-imagen via your Codex ChatGPT login — no OpenAI/Google API key required)')
  .option('--prompt <text>', 'Prompt for image generation')
  .option('--slides-dir <path>', 'Slide directory', 'slides')
  .option('--output <path>', 'Optional output path inside <slides-dir>/assets/')
  .option('--name <slug>', 'Optional asset basename without extension')
  .option('--provider <name>', 'Image provider: god-tibo (default), codex (OpenAI), or nano-banana. Aliases: codex-cli → god-tibo, openai → codex, gemini → nano-banana')
  .option('--model <id>', 'Model id (default: gpt-5.4 for god-tibo, gpt-image-2 for codex, gemini-3-pro-image-preview for nano-banana)')
  .option('--aspect-ratio <ratio>', 'Aspect ratio; for god-tibo it is injected as a prompt hint, for codex it maps to the nearest supported OpenAI size (default: 16:9)')
  .option('--image-size <size>', 'Nano Banana image size preset: 2K or 4K (default: 4K)')
  .addHelpText('after', [
    '',
    'Auth:',
    '  Default (god-tibo): run `codex login` once to populate ~/.codex/auth.json. No OpenAI/Google API key required;',
    '                      requires a Codex/ChatGPT account entitled to image generation.',
    '  Codex/OpenAI provider: set OPENAI_API_KEY.',
    '  Nano Banana provider: set GOOGLE_API_KEY or GEMINI_API_KEY.',
    '',
    'WARNING: god-tibo-imagen calls an unsupported private Codex backend that may break without notice.',
  ].join('\n'))
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir];
    if (options.prompt) args.push('--prompt', String(options.prompt));
    if (options.output) args.push('--output', String(options.output));
    if (options.name) args.push('--name', String(options.name));
    if (options.provider) args.push('--provider', String(options.provider));
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
  .option('--mode <mode>', 'Slide mode: presentation or card-news', 'presentation')
  .action(async (options = {}) => {
    const args = ['--slides-dir', options.slidesDir, '--mode', options.mode];
    if (options.port) {
      args.push('--port', String(options.port));
    }
    await runCommand('scripts/editor-server.js', args);
  });

// --- Template/style discovery commands ---

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
  .command('list-styles')
  .description('List bundled design styles agents and users can reference during slide generation')
  .action(async () => {
    try {
      const { listDesignStyles } = await import('../src/design-styles.js');
      const styles = listDesignStyles();

      if (styles.length === 0) {
        console.log('No bundled design styles found.');
        return;
      }

      console.log('Available design styles:\n');
      for (const style of styles) {
        console.log(`  ${style.id.padEnd(22)} ${style.title}`);
        console.log(`    ${style.mood} · ${style.bestFor}`);
      }

      console.log(`\nTotal: ${styles.length} styles`);
      console.log('Preview: slides-grab preview-styles [--style <id>]');
    } catch (error) {
      reportCliError(error);
    }
  });

program
  .command('preview-styles')
  .description('Print the path to the bundled 35-style visual preview gallery')
  .action(async () => {
    try {
      const { getPreviewHtmlPath } = await import('../src/design-styles.js');
      const previewPath = getPreviewHtmlPath();
      console.log(previewPath);
    } catch (error) {
      reportCliError(error);
    }
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


await program.parseAsync(process.argv);
