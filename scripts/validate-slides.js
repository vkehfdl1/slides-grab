#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { DEFAULT_SLIDES_DIR, getValidateUsage, parseValidateCliArgs } from '../src/validation/cli.js';
import { createValidationFailure, createValidationResult, findSlideFiles, scanSlides } from '../src/validation/core.js';

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

export function formatValidationFailureForExport(result, exportLabel = 'Export') {
  const findings = [];

  for (const slide of result.slides) {
    if (slide.status !== 'fail') continue;
    for (const issue of slide.critical) {
      const source = typeof issue.source === 'string' ? ` (${issue.source})` : '';
      findings.push(`- ${slide.slide}: ${issue.code}${source}`);
      if (findings.length >= 8) break;
    }
    if (findings.length >= 8) break;
  }

  const suffix = findings.length > 0 ? `\n${findings.join('\n')}` : '';
  return `${exportLabel} blocked by slide validation. Run \`slides-grab validate --slides-dir <path>\` for full diagnostics.${suffix}`;
}

export async function ensureSlidesPassValidation(slidesDir, { exportLabel = 'Export' } = {}) {
  const result = await validateSlides(slidesDir);
  if (result.summary.failedSlides > 0) {
    throw new Error(formatValidationFailureForExport(result, exportLabel));
  }
  return result;
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
    process.stdout.write(`${JSON.stringify(createValidationFailure(error), null, 2)}\n`);
    process.exit(1);
  });
}
