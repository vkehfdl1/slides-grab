#!/usr/bin/env node

import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { DEFAULT_SLIDES_DIR, getValidateUsage, parseValidateCliArgs } from '../src/validation/cli.js';
import { createValidationFailure, createValidationResult, findSlideFiles, scanSlides } from '../src/validation/core.js';

async function main() {
  const options = parseValidateCliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${getValidateUsage()}\n`);
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const slideFiles = await findSlideFiles(slidesDir);
  if (slideFiles.length === 0) {
    throw new Error(`No slide-*.html files found in: ${slidesDir}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    const slides = await scanSlides(page, slidesDir, slideFiles);
    const result = createValidationResult(slides);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

    if (result.summary.failedSlides > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const failure = createValidationFailure(error);
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
});
