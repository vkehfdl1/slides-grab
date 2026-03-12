import { chromium } from 'playwright';

import { FRAME_PT, FRAME_PX } from './constants.js';
import { inspectSlide } from './inspect.js';
import { findSlideFiles } from './slide-files.js';

export function buildIssue(code, message, payload = {}) {
  return { code, message, ...payload };
}

export function summarizeSlides(slides) {
  const summary = {
    totalSlides: slides.length,
    passedSlides: 0,
    failedSlides: 0,
    criticalIssues: 0,
    warnings: 0,
  };

  for (const slide of slides) {
    if (slide.status === 'pass') {
      summary.passedSlides += 1;
    } else {
      summary.failedSlides += 1;
    }
    summary.criticalIssues += slide.summary.criticalCount;
    summary.warnings += slide.summary.warningCount;
  }

  return summary;
}

export function buildValidationResult(slides, generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    frame: {
      widthPt: FRAME_PT.width,
      heightPt: FRAME_PT.height,
      widthPx: FRAME_PX.width,
      heightPx: FRAME_PX.height,
    },
    slides,
    summary: summarizeSlides(slides),
  };
}

export function buildValidationFailure(error, generatedAt = new Date().toISOString()) {
  return {
    generatedAt,
    frame: {
      widthPt: FRAME_PT.width,
      heightPt: FRAME_PT.height,
      widthPx: FRAME_PX.width,
      heightPx: FRAME_PX.height,
    },
    slides: [],
    summary: {
      totalSlides: 0,
      passedSlides: 0,
      failedSlides: 0,
      criticalIssues: 1,
      warnings: 0,
    },
    error: error instanceof Error ? error.message : String(error),
  };
}

export async function validateSlidesInPage(page, slidesDir) {
  const slideFiles = await findSlideFiles(slidesDir);
  if (slideFiles.length === 0) {
    throw new Error(`No slide-*.html files found in: ${slidesDir}`);
  }

  const slides = [];
  for (const slideFile of slideFiles) {
    try {
      const result = await inspectSlide(page, slideFile, slidesDir);
      slides.push(result);
    } catch (error) {
      slides.push({
        slide: slideFile,
        status: 'fail',
        critical: [
          buildIssue(
            'slide-validation-error',
            'Slide validation failed before checks could complete.',
            { detail: error instanceof Error ? error.message : String(error) },
          ),
        ],
        warning: [],
        summary: {
          criticalCount: 1,
          warningCount: 0,
        },
      });
    }
  }

  return buildValidationResult(slides);
}

export async function validateSlides(slidesDir) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  try {
    return await validateSlidesInPage(page, slidesDir);
  } finally {
    await browser.close();
  }
}
