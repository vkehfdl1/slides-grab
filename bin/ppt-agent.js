#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
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

function reportCliError(error) {
  console.error(`[slides-grab] ${error.message}`);
  process.exitCode = 1;
}

function resolveWorkspaceDir(slidesDir) {
  if (!slidesDir) {
    return process.cwd();
  }
  return resolve(process.cwd(), String(slidesDir));
}

function quoteShellArg(value) {
  const stringValue = String(value);
  if (!/[\s"'\\$`!()[\]{}<>|&;*?]/.test(stringValue)) {
    return stringValue;
  }
  return `'${stringValue.replaceAll('\'', `'\\''`)}'`;
}

function buildSlidesDirSuffix(slidesDir) {
  return slidesDir ? ` --slides-dir ${quoteShellArg(slidesDir)}` : '';
}

function resolvePreviewOutputPath(output, workspaceDir, explicitOutput) {
  if (isAbsolute(output)) {
    return output;
  }
  if (!explicitOutput && output === 'style-preview.html') {
    return resolve(workspaceDir, output);
  }
  return resolve(process.cwd(), output);
}

function formatInvalidStyleSelectionMessage(config) {
  if (!config?.invalidSelectedStyleId) {
    return null;
  }
  return `Ignoring saved style selection "${config.invalidSelectedStyleId}" from ${config.path}.`;
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
  .command('list-styles')
  .description('List bundled design collections users can preview/select before slide generation')
  .option('--slides-dir <path>', 'Optional slides workspace used for style-config.json')
  .action(async (options = {}) => {
    try {
      const [{ listDesignStyles }, { readSelectedStyleConfig }] = await Promise.all([
        import('../src/design-styles.js'),
        import('../src/style-config.js'),
      ]);
      const workspaceDir = resolveWorkspaceDir(options.slidesDir);
      const styles = listDesignStyles();
      const selectedConfig = await readSelectedStyleConfig(workspaceDir, { allowInvalidSelection: true });
      const selectedStyleId = selectedConfig?.style?.id ?? null;

      if (styles.length === 0) {
        console.log('No bundled design styles found.');
        return;
      }

      console.log('Available design styles:\n');
      for (const style of styles) {
        const selectedTag = style.id === selectedStyleId ? '  [selected]' : '';
        console.log(`  ${style.id.padEnd(22)} ${style.title}${selectedTag}`);
        console.log(`    ${style.mood} · ${style.bestFor}`);
      }

      console.log(`\nTotal: ${styles.length} styles`);
      if (selectedConfig?.style) {
        console.log(`Selected style: ${selectedConfig.style.title} (${selectedConfig.style.id})`);
      } else if (selectedConfig?.invalidSelectedStyleId) {
        console.log(`Selected style: none (saved value "${selectedConfig.invalidSelectedStyleId}" is no longer bundled)`);
      } else {
        console.log('Selected style: none');
      }
      const invalidSelectionMessage = formatInvalidStyleSelectionMessage(selectedConfig);
      if (invalidSelectionMessage) {
        console.log(`${invalidSelectionMessage} Run "slides-grab select-style <id>${buildSlidesDirSuffix(options.slidesDir)}" to update it.`);
      }
    } catch (error) {
      reportCliError(error);
    }
  });

program
  .command('preview-styles')
  .description('Generate a local HTML preview for the full design catalog or one selected style')
  .option('--slides-dir <path>', 'Optional slides workspace used for style-config.json and default preview output')
  .option('--style <id>', 'Focus the preview on a single style id')
  .option('--output <path>', 'Output HTML path', 'style-preview.html')
  .action(async (options = {}, command) => {
    try {
      const { buildStylePreviewHtml, requireDesignStyle } = await import('../src/design-styles.js');
      const { readSelectedStyleConfig } = await import('../src/style-config.js');
      const workspaceDir = resolveWorkspaceDir(options.slidesDir);
      const explicitOutput = command?.getOptionValueSource('output') === 'cli';
      const outputPath = resolvePreviewOutputPath(String(options.output), workspaceDir, explicitOutput);
      const currentSelection = await readSelectedStyleConfig(workspaceDir, { allowInvalidSelection: true });
      const selectedStyle = options.style ? requireDesignStyle(String(options.style)) : null;
      const html = buildStylePreviewHtml({
        styleId: selectedStyle?.id,
        selectedStyleId: selectedStyle?.id ?? currentSelection?.style?.id ?? null,
      });

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, html, 'utf-8');

      if (selectedStyle) {
        console.log(`Wrote style preview for ${selectedStyle.title} to ${outputPath}`);
      } else {
        console.log(`Wrote style preview catalog to ${outputPath}`);
      }
      const invalidSelectionMessage = !selectedStyle ? formatInvalidStyleSelectionMessage(currentSelection) : null;
      if (invalidSelectionMessage) {
        console.log(invalidSelectionMessage);
      }
    } catch (error) {
      reportCliError(error);
    }
  });

program
  .command('select-style')
  .description('Persist a selected bundled design style before slide generation')
  .argument('<id>', 'Design style id (e.g. "glassmorphism")')
  .option('--slides-dir <path>', 'Optional slides workspace used for style-config.json')
  .action(async (styleId, options = {}) => {
    try {
      const { requireDesignStyle } = await import('../src/design-styles.js');
      const {
        getStyleConfigPath,
        writeSelectedStyleConfig,
      } = await import('../src/style-config.js');
      const workspaceDir = resolveWorkspaceDir(options.slidesDir);
      const style = requireDesignStyle(String(styleId));

      await writeSelectedStyleConfig({ cwd: workspaceDir, style });

      console.log(`Selected style: ${style.title} (${style.id})`);
      console.log(`Saved selection to ${getStyleConfigPath(workspaceDir)}`);
      console.log(`Preview anytime with: slides-grab preview-styles --style ${style.id}${buildSlidesDirSuffix(options.slidesDir)}`);
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
