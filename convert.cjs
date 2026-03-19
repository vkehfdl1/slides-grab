const PptxGenJS = require('pptxgenjs');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const {
  getResolutionChoices,
  getResolutionSize,
  normalizeResolutionPreset,
} = require('./src/export-resolution.cjs');
const { resolveWorkspaceResolution } = require('./src/slides-workspace.cjs');

// Inline a simplified version that uses Playwright Chromium (not Chrome)
const DEFAULT_SLIDES_DIR = 'slides';
const DEFAULT_OUTPUT = 'output.pptx';
const DEFAULT_CAPTURE_VIEWPORT = { width: 960, height: 540 };
const DEFAULT_CAPTURE_DEVICE_SCALE_FACTOR = 2;
const TARGET_RASTER_DPI = 150;
const TARGET_SLIDE_SIZE_IN = { width: 13.33, height: 7.5 };

function normalizeDimension(value, fallback) {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.round(value));
}

function buildPageOptions(resolution = '') {
  const targetResolution = getResolutionSize(resolution);
  return {
    viewport: {
      width: DEFAULT_CAPTURE_VIEWPORT.width,
      height: DEFAULT_CAPTURE_VIEWPORT.height,
    },
    deviceScaleFactor: targetResolution
      ? targetResolution.height / DEFAULT_CAPTURE_VIEWPORT.height
      : DEFAULT_CAPTURE_DEVICE_SCALE_FACTOR,
  };
}

function getTargetRasterSize(resolution = '') {
  const targetResolution = getResolutionSize(resolution);
  if (targetResolution) {
    return targetResolution;
  }

  return {
    width: Math.round(TARGET_SLIDE_SIZE_IN.width * TARGET_RASTER_DPI),
    height: Math.round(TARGET_SLIDE_SIZE_IN.height * TARGET_RASTER_DPI),
  };
}

function printUsage() {
  process.stdout.write(
    [
      'Usage: node convert.cjs [options]',
      '',
      'Options:',
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
      `  --output <path>      Output pptx path (default: ${DEFAULT_OUTPUT})`,
      `  --resolution <preset> Raster size preset: ${getResolutionChoices().join('|')}|4k`,
      '  -h, --help           Show this help message',
    ].join('\n'),
  );
  process.stdout.write('\n');
}

function readOptionValue(args, index, optionName) {
  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return next;
}

function parseArgs(args) {
  const options = {
    slidesDir: DEFAULT_SLIDES_DIR,
    output: DEFAULT_OUTPUT,
    resolution: '',
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--slides-dir') {
      options.slidesDir = readOptionValue(args, i, '--slides-dir');
      i += 1;
      continue;
    }

    if (arg.startsWith('--slides-dir=')) {
      options.slidesDir = arg.slice('--slides-dir='.length);
      continue;
    }

    if (arg === '--output') {
      options.output = readOptionValue(args, i, '--output');
      i += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--resolution') {
      options.resolution = normalizeResolutionPreset(readOptionValue(args, i, '--resolution'));
      i += 1;
      continue;
    }

    if (arg.startsWith('--resolution=')) {
      options.resolution = normalizeResolutionPreset(arg.slice('--resolution='.length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (typeof options.slidesDir !== 'string' || options.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }

  if (typeof options.output !== 'string' || options.output.trim() === '') {
    throw new Error('--output must be a non-empty string.');
  }

  options.slidesDir = options.slidesDir.trim();
  options.output = options.output.trim();
  options.resolution = normalizeResolutionPreset(options.resolution);
  return options;
}

async function convertSlide(htmlFile, pres, browser, options = {}) {
  const filePath = path.isAbsolute(htmlFile) ? htmlFile : path.join(process.cwd(), htmlFile);

  const page = await browser.newPage(buildPageOptions(options.resolution));
  await page.goto(`file://${filePath}`);

  const bodyDimensions = await page.evaluate(() => {
    const body = document.body;
    const style = window.getComputedStyle(body);
    return {
      width: parseFloat(style.width),
      height: parseFloat(style.height),
    };
  });

  await page.setViewportSize({
    width: normalizeDimension(bodyDimensions.width, DEFAULT_CAPTURE_VIEWPORT.width),
    height: normalizeDimension(bodyDimensions.height, DEFAULT_CAPTURE_VIEWPORT.height)
  });

  // Take screenshot and add as full-slide image
  const screenshot = await page.screenshot({ type: 'png' });
  await page.close();

  // Resize to exact slide dimensions (13.33" x 7.5" at 150 DPI)
  const targetSize = getTargetRasterSize(options.resolution);

  const resized = await sharp(screenshot)
    .resize(targetSize.width, targetSize.height, { fit: 'fill' })
    .png()
    .toBuffer();

  const tmpPath = path.join(process.env.TMPDIR || '/tmp', `slide-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  fs.writeFileSync(tmpPath, resized);

  const slide = pres.addSlide();
  slide.addImage({
    path: tmpPath,
    x: 0,
    y: 0,
    w: '100%',
    h: '100%'
  });

  return tmpPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 16:9

  const slidesDir = path.resolve(process.cwd(), options.slidesDir);
  options.resolution = resolveWorkspaceResolution(slidesDir, options.resolution).resolution;
  const { ensureSlidesPassValidation } = await import('./scripts/validate-slides.js');
  await ensureSlidesPassValidation(slidesDir, { exportLabel: 'PPTX export' });
  const files = fs.readdirSync(slidesDir)
    .filter(f => f.endsWith('.html'))
    .sort();

  console.log(`Converting ${files.length} slides...`);

  // Launch Chromium (not Chrome)
  const browser = await chromium.launch();
  const tmpFiles = [];

  for (const file of files) {
    const filePath = path.join(slidesDir, file);
    console.log(`  Processing: ${file}`);
    try {
      const tmpPath = await convertSlide(filePath, pres, browser, { resolution: options.resolution });
      tmpFiles.push(tmpPath);
      console.log(`    ✓ ${file} done`);
    } catch (err) {
      console.error(`    ✗ ${file} error: ${err.message}`);
    }
  }

  await browser.close();

  const outputFile = path.resolve(process.cwd(), options.output);
  await pres.writeFile({ fileName: outputFile });
  console.log(`\nSaved: ${outputFile}`);

  // Cleanup tmp files
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch {}
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  buildPageOptions,
  getTargetRasterSize,
  parseArgs,
};
