import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);

export const DEFAULT_TLDRAW_WIDTH = 960;
export const DEFAULT_TLDRAW_HEIGHT = 540;
export const DEFAULT_TLDRAW_PADDING = 24;
export const DEFAULT_TLDRAW_OUTPUT = 'diagram.svg';

function readOptionValue(args, index, optionName) {
  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return next;
}

function parsePositiveInteger(value, optionName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, optionName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be zero or a positive integer.`);
  }
  return parsed;
}

function formatNumber(value) {
  return Number.parseFloat(Number(value).toFixed(4)).toString();
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function extractSvgMarkup(svg) {
  const match = String(svg).match(/<svg\b[^>]*>([\s\S]*?)<\/svg>\s*$/i);
  if (!match) {
    throw new Error('Rendered tldraw output did not contain a root <svg> element.');
  }
  return match[1];
}

function findPackageJsonPath(moduleName) {
  const resolvedEntry = require.resolve(moduleName);
  let currentDir = dirname(resolvedEntry);

  while (true) {
    const packageJsonPath = join(currentDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name === moduleName) {
        return packageJsonPath;
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  throw new Error(`Unable to locate package.json for ${moduleName}.`);
}

function getInstalledPackageVersion(moduleName) {
  const packageJsonPath = findPackageJsonPath(moduleName);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (!packageJson.version) {
    throw new Error(`Package ${moduleName} does not declare a version.`);
  }
  return packageJson.version;
}

function isLegacyTldrawPayload(payload) {
  return Boolean(payload && typeof payload === 'object' && payload.document && payload.document.version);
}

export function buildTldrawImportUrl() {
  const tldrawVersion = getInstalledPackageVersion('tldraw');
  const reactVersion = getInstalledPackageVersion('react');
  const reactDomVersion = getInstalledPackageVersion('react-dom');

  return `https://esm.sh/tldraw@${encodeURIComponent(tldrawVersion)}?deps=react@${encodeURIComponent(reactVersion)},react-dom@${encodeURIComponent(reactDomVersion)}`;
}

export function parseTldrawCliArgs(args = []) {
  const options = {
    input: '',
    output: DEFAULT_TLDRAW_OUTPUT,
    width: DEFAULT_TLDRAW_WIDTH,
    height: DEFAULT_TLDRAW_HEIGHT,
    padding: DEFAULT_TLDRAW_PADDING,
    background: 'transparent',
    pageId: '',
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--input') {
      options.input = readOptionValue(args, index, '--input');
      index += 1;
      continue;
    }

    if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length);
      continue;
    }

    if (arg === '--output') {
      options.output = readOptionValue(args, index, '--output');
      index += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--width') {
      options.width = parsePositiveInteger(readOptionValue(args, index, '--width'), '--width');
      index += 1;
      continue;
    }

    if (arg.startsWith('--width=')) {
      options.width = parsePositiveInteger(arg.slice('--width='.length), '--width');
      continue;
    }

    if (arg === '--height') {
      options.height = parsePositiveInteger(readOptionValue(args, index, '--height'), '--height');
      index += 1;
      continue;
    }

    if (arg.startsWith('--height=')) {
      options.height = parsePositiveInteger(arg.slice('--height='.length), '--height');
      continue;
    }

    if (arg === '--padding') {
      options.padding = parseNonNegativeInteger(readOptionValue(args, index, '--padding'), '--padding');
      index += 1;
      continue;
    }

    if (arg.startsWith('--padding=')) {
      options.padding = parseNonNegativeInteger(arg.slice('--padding='.length), '--padding');
      continue;
    }

    if (arg === '--background') {
      options.background = readOptionValue(args, index, '--background').trim() || 'transparent';
      index += 1;
      continue;
    }

    if (arg.startsWith('--background=')) {
      options.background = arg.slice('--background='.length).trim() || 'transparent';
      continue;
    }

    if (arg === '--page-id') {
      options.pageId = readOptionValue(args, index, '--page-id').trim();
      index += 1;
      continue;
    }

    if (arg.startsWith('--page-id=')) {
      options.pageId = arg.slice('--page-id='.length).trim();
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.help && (!options.input || !options.input.trim())) {
    throw new Error('--input must be a non-empty string.');
  }

  options.input = options.input.trim();
  options.output = String(options.output).trim();
  options.background = options.background || 'transparent';

  if (!options.help && !options.output) {
    throw new Error('--output must be a non-empty string.');
  }

  return options;
}

export function getTldrawUsage() {
  return [
    'Usage: node scripts/render-tldraw.js [options]',
    '',
    'Options:',
    '  --input <path>       Input current-format .tldr or store-snapshot JSON file',
    `  --output <path>      Output SVG asset path (default: ${DEFAULT_TLDRAW_OUTPUT})`,
    `  --width <px>         Exact output width in CSS pixels (default: ${DEFAULT_TLDRAW_WIDTH})`,
    `  --height <px>        Exact output height in CSS pixels (default: ${DEFAULT_TLDRAW_HEIGHT})`,
    `  --padding <px>       Inner fit padding in CSS pixels (default: ${DEFAULT_TLDRAW_PADDING})`,
    '  --background <css>   Optional wrapper background fill (default: transparent)',
    '  --page-id <id>       Optional tldraw page id to export',
    '  -h, --help           Show this help message',
    '',
    'Notes:',
    '  - Legacy pre-records .tldr files are not supported. Open and resave them in a current tldraw build first.',
    '',
    'Examples:',
    '  node scripts/render-tldraw.js --input slides/assets/diagram.tldr --output slides/assets/diagram.svg',
    '  node scripts/render-tldraw.js --input deck/assets/system.json --output deck/assets/system.svg --width 640 --height 320',
  ].join('\n');
}

export function normalizeTldrawSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Expected the tldraw input file to contain a JSON object.');
  }

  if (isLegacyTldrawPayload(payload)) {
    throw new Error('Legacy pre-records .tldr files are not supported yet. Open the diagram in a current tldraw build and save it again before exporting.');
  }

  if (payload.store && payload.schema) {
    return payload;
  }

  if (Array.isArray(payload.records) && payload.schema) {
    const store = Object.fromEntries(
      payload.records.map((record) => {
        if (!record || typeof record !== 'object' || typeof record.id !== 'string') {
          throw new Error('Each tldraw record must be an object with a string id.');
        }
        return [record.id, record];
      }),
    );

    return {
      store,
      schema: payload.schema,
    };
  }

  throw new Error('Input JSON must contain either { store, schema } or a current-format { records, schema } tldraw file.');
}

export function buildFixedSizeSvg(
  { svg, width, height },
  {
    targetWidth = DEFAULT_TLDRAW_WIDTH,
    targetHeight = DEFAULT_TLDRAW_HEIGHT,
    padding = DEFAULT_TLDRAW_PADDING,
    background = 'transparent',
  } = {},
) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);

  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new Error('Rendered tldraw output must include positive width and height values.');
  }

  const safePadding = Math.max(0, padding);
  const availableWidth = Math.max(1, targetWidth - safePadding * 2);
  const availableHeight = Math.max(1, targetHeight - safePadding * 2);
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;
  const offsetX = (targetWidth - fittedWidth) / 2;
  const offsetY = (targetHeight - fittedHeight) / 2;
  const markup = extractSvgMarkup(svg);
  const backgroundMarkup = background && background !== 'transparent'
    ? `\n  <rect x="0" y="0" width="${targetWidth}" height="${targetHeight}" fill="${escapeAttribute(background)}" />`
    : '';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${targetHeight}" viewBox="0 0 ${targetWidth} ${targetHeight}" role="img" aria-label="tldraw diagram export">`,
    backgroundMarkup,
    `  <g transform="translate(${formatNumber(offsetX)} ${formatNumber(offsetY)}) scale(${formatNumber(scale)})">`,
    markup
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

export async function loadTldrawInput(inputPath) {
  const raw = await readFile(inputPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Unable to parse tldraw JSON from ${inputPath}: ${error.message}`);
  }
  return normalizeTldrawSnapshot(parsed);
}

export async function renderTldrawSnapshot(snapshot, { pageId = '' } = {}) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: DEFAULT_TLDRAW_WIDTH, height: DEFAULT_TLDRAW_HEIGHT } });

  try {
    await page.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>', {
      waitUntil: 'load',
    });

    const moduleUrl = buildTldrawImportUrl();

    await page.evaluate(
      async ({ snapshot: browserSnapshot, requestedPageId, browserModuleUrl }) => {
        window.__TLDRAW_RENDER_RESULT__ = null;
        window.__TLDRAW_RENDER_ERROR__ = null;

        try {
          const {
            Editor,
            createTLStore,
            defaultAddFontsFromNode,
            defaultBindingUtils,
            defaultShapeUtils,
            tipTapDefaultExtensions,
          } = await import(browserModuleUrl);
          const container = document.createElement('div');
          container.style.position = 'fixed';
          container.style.inset = '0';
          container.classList.add('tl-container', 'tl-theme__light');
          document.body.appendChild(container);

          const tempElm = document.createElement('div');
          container.appendChild(tempElm);

          const store = createTLStore({
            snapshot: browserSnapshot,
            shapeUtils: defaultShapeUtils,
          });

          const editor = new Editor({
            store,
            shapeUtils: defaultShapeUtils,
            bindingUtils: defaultBindingUtils,
            tools: [],
            getContainer: () => tempElm,
            options: {
              text: {
                tipTapConfig: {
                  extensions: tipTapDefaultExtensions,
                },
                addFontsFromNode: defaultAddFontsFromNode,
              },
            },
          });

          if (requestedPageId) {
            editor.setCurrentPage(requestedPageId);
          }

          await editor.fonts.loadRequiredFontsForCurrentPage(editor.options.maxFontsToLoadBeforeRender);
          await new Promise((resolveAnimation) => requestAnimationFrame(() => requestAnimationFrame(resolveAnimation)));

          const shapeIds = Array.from(editor.getCurrentPageShapeIds());
          if (shapeIds.length === 0) {
            throw new Error('The selected tldraw page does not contain any shapes to export.');
          }

          const result = await editor.getSvgString(shapeIds, {
            background: false,
            padding: 0,
          });

          editor.dispose();

          if (!result) {
            throw new Error('tldraw did not return an SVG export.');
          }

          window.__TLDRAW_RENDER_RESULT__ = result;
        } catch (error) {
          window.__TLDRAW_RENDER_ERROR__ = error instanceof Error ? error.message : String(error);
        }
      },
      {
        snapshot,
        requestedPageId: pageId,
        browserModuleUrl: moduleUrl,
      },
    );

    await page.waitForFunction(
      () => window.__TLDRAW_RENDER_RESULT__ !== null || window.__TLDRAW_RENDER_ERROR__ !== null,
      null,
      { timeout: 30000 },
    );

    const errorMessage = await page.evaluate(() => window.__TLDRAW_RENDER_ERROR__);
    if (errorMessage) {
      throw new Error(errorMessage);
    }

    const result = await page.evaluate(() => window.__TLDRAW_RENDER_RESULT__);
    if (!result) {
      throw new Error('tldraw render completed without producing an SVG export.');
    }

    return result;
  } finally {
    await browser.close();
  }
}

export async function renderTldrawFile(inputPath, outputPath, options = {}) {
  const snapshot = await loadTldrawInput(inputPath);
  const rendered = await renderTldrawSnapshot(snapshot, { pageId: options.pageId });
  const fittedSvg = buildFixedSizeSvg(rendered, {
    targetWidth: options.width,
    targetHeight: options.height,
    padding: options.padding,
    background: options.background,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, fittedSvg, 'utf8');
  return {
    inputPath,
    outputPath,
    width: options.width,
    height: options.height,
  };
}

export async function main(args = process.argv.slice(2)) {
  const options = parseTldrawCliArgs(args);
  if (options.help) {
    process.stdout.write(`${getTldrawUsage()}\n`);
    return;
  }

  const inputPath = resolve(process.cwd(), options.input);
  const outputPath = resolve(process.cwd(), options.output);
  const result = await renderTldrawFile(inputPath, outputPath, options);
  process.stdout.write(`Generated tldraw SVG: ${result.outputPath} (${result.width}x${result.height})\n`);
}
