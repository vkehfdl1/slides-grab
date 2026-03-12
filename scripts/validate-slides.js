#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DEFAULT_SLIDES_DIR, getValidateUsage, parseValidateCliArgs } from '../src/validation/cli.js';
import {
  createValidationFailure,
  createValidationResult,
  ensureSlidesPassValidation,
  findSlideFiles,
  formatValidationFailureForExport,
  scanSlides,
} from '../src/validation/core.js';

export {
  DEFAULT_SLIDES_DIR,
  ensureSlidesPassValidation,
  findSlideFiles,
  formatValidationFailureForExport,
  parseValidateCliArgs as parseCliArgs,
};

export async function validateSlides(slidesDir) {
  const slideFiles = await findSlideFiles(slidesDir);
  if (slideFiles.length === 0) {
    throw new Error(`No slide-*.html files found in: ${slidesDir}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    const slides = await scanSlides(page, slidesDir, slideFiles);
    return createValidationResult(slides);
  } finally {
    await browser.close();
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseValidateCliArgs(args);
  if (options.help) {
    process.stdout.write(`${getValidateUsage()}\n`);
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const result = await validateSlides(slidesDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.summary.failedSlides > 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    const failure = createValidationFailure(error);
    process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
    process.exit(1);
  });
}
