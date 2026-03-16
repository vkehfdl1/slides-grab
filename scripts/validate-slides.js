#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  DEFAULT_SLIDES_DIR,
  DEFAULT_VALIDATE_FORMAT,
  getValidateUsage,
  parseValidateCliArgs,
} from '../src/validation/cli.js';
import {
  createValidationFailure,
  createValidationResult,
  ensureSlidesPassValidation,
  findSlideFiles,
  formatValidationFailureForExport,
  scanSlides,
  selectSlideFiles,
} from '../src/validation/core.js';

export {
  DEFAULT_SLIDES_DIR,
  ensureSlidesPassValidation,
  findSlideFiles,
  formatValidationFailureForExport,
  parseValidateCliArgs as parseCliArgs,
};

export function flattenValidationResult(result) {
  const diagnostics = [];

  for (const slide of result.slides || []) {
    for (const issue of slide.critical || []) {
      diagnostics.push({
        slide: slide.slide,
        severity: 'error',
        code: issue.code,
        message: issue.message,
        location: issue.element || issue.parent || undefined,
        related: Array.isArray(issue.elements) ? issue.elements : undefined,
        source: issue.source,
        assetPath: issue.assetPath,
        detail: issue.detail,
        metrics: issue.metrics,
        bbox: issue.bbox
          ? {
              x: issue.bbox.x,
              y: issue.bbox.y,
              width: issue.bbox.width,
              height: issue.bbox.height,
            }
          : undefined,
        intersection: issue.intersection,
      });
    }

    for (const issue of slide.warning || []) {
      diagnostics.push({
        slide: slide.slide,
        severity: 'warning',
        code: issue.code,
        message: issue.message,
        location: issue.element || issue.parent || undefined,
        related: Array.isArray(issue.elements) ? issue.elements : undefined,
        source: issue.source,
        assetPath: issue.assetPath,
        detail: issue.detail,
        metrics: issue.metrics,
        bbox: issue.bbox
          ? {
              x: issue.bbox.x,
              y: issue.bbox.y,
              width: issue.bbox.width,
              height: issue.bbox.height,
            }
          : undefined,
        intersection: issue.intersection,
      });
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: result.generatedAt,
    summary: {
      totalSlides: result.summary?.totalSlides ?? 0,
      passedSlides: result.summary?.passedSlides ?? 0,
      failedSlides: result.summary?.failedSlides ?? 0,
      errors: result.summary?.criticalIssues ?? 0,
      warnings: result.summary?.warnings ?? 0,
    },
    diagnostics,
    ...(result.error ? { error: result.error } : {}),
  };
}

function formatDiagnosticLine(diagnostic) {
  const target = diagnostic.location
    || (diagnostic.related && diagnostic.related.length > 0 ? diagnostic.related.join(' <> ') : '')
    || diagnostic.source
    || '';

  const extra = [];
  if (diagnostic.source) extra.push(`source=${diagnostic.source}`);
  if (diagnostic.assetPath) extra.push(`assetPath=${diagnostic.assetPath}`);
  if (diagnostic.metrics) {
    extra.push(
      Object.entries(diagnostic.metrics)
        .map(([key, value]) => `${key}=${value}`)
        .join(' '),
    );
  }
  if (diagnostic.bbox) {
    extra.push(`bbox=${diagnostic.bbox.x},${diagnostic.bbox.y} ${diagnostic.bbox.width}x${diagnostic.bbox.height}`);
  }
  if (diagnostic.intersection) {
    extra.push(
      `intersection=${diagnostic.intersection.x},${diagnostic.intersection.y} ${diagnostic.intersection.width}x${diagnostic.intersection.height}`,
    );
  }
  if (diagnostic.detail) extra.push(`detail=${diagnostic.detail}`);

  const targetSuffix = target ? ` ${target}` : '';
  const extraSuffix = extra.length > 0 ? ` (${extra.join('; ')})` : '';
  return `${diagnostic.slide}:${diagnostic.severity}[${diagnostic.code}]${targetSuffix} - ${diagnostic.message}${extraSuffix}`;
}

export function formatValidationResult(result, format = DEFAULT_VALIDATE_FORMAT) {
  if (format === 'json-full') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const flattened = flattenValidationResult(result);
  if (format === 'json') {
    return `${JSON.stringify(flattened, null, 2)}\n`;
  }

  const lines = flattened.diagnostics.map(formatDiagnosticLine);
  if (flattened.error) {
    lines.push(`validation:error[validation-failed] - ${flattened.error}`);
  }
  lines.push(
    `summary: ${flattened.summary.totalSlides} slide(s) checked, ${flattened.summary.passedSlides} passed, ${flattened.summary.failedSlides} failed, ${flattened.summary.errors} error(s), ${flattened.summary.warnings} warning(s)`,
  );
  return `${lines.join('\n')}\n`;
}

function peekValidateFormat(args = []) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--format') {
      return args[i + 1] || DEFAULT_VALIDATE_FORMAT;
    }
    if (arg.startsWith('--format=')) {
      return arg.slice('--format='.length) || DEFAULT_VALIDATE_FORMAT;
    }
  }
  return DEFAULT_VALIDATE_FORMAT;
}

export async function validateSlides(slidesDir, { selectedSlides = [] } = {}) {
  const slideFiles = selectSlideFiles(await findSlideFiles(slidesDir), selectedSlides, slidesDir);
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
  const result = await validateSlides(slidesDir, { selectedSlides: options.slides });
  process.stdout.write(formatValidationResult(result, options.format));
  if (result.summary.failedSlides > 0) {
    process.exitCode = 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    const failure = createValidationFailure(error);
    process.stdout.write(formatValidationResult(failure, peekValidateFormat(process.argv.slice(2))));
    process.exit(1);
  });
}
