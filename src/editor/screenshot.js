import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import { SLIDE_PX, SCREENSHOT_SCALE } from '../slide-dimensions.js';

/** Viewport used for annotation screenshots (scaled up for resolution) */
export const SCREENSHOT_SIZE = {
  width: SLIDE_PX.width * SCREENSHOT_SCALE,
  height: SLIDE_PX.height * SCREENSHOT_SCALE,
};

/**
 * Launch a reusable headless Chromium browser.
 * Caller is responsible for closing the browser when done.
 */
export async function createScreenshotBrowser() {
  const browser = await chromium.launch({ headless: true });
  return { browser };
}

/**
 * Create a fresh screenshot page/context from an existing browser.
 * Caller must close the returned context.
 */
export async function createScreenshotPage(browser) {
  const context = await browser.newContext({ viewport: SCREENSHOT_SIZE });
  const page = await context.newPage();
  return { context, page };
}

/**
 * Capture a screenshot of a single slide HTML file.
 *
 * @param {import('playwright').Page} page  – reusable Playwright page
 * @param {string} slideFile               – filename, e.g. "slide-04.html"
 * @param {string} screenshotPath          – output PNG path
 * @param {string} slidesDir               – directory containing the slide files
 * @param {object} [options]
 * @param {boolean} [options.useHttp]       – if true, slidesDir is treated as a base URL
 * @param {boolean} [options.elementOnly]   – if true, capture just the .slide element (for thumbnails)
 */
export async function captureSlideScreenshot(page, slideFile, screenshotPath, slidesDir, options = {}) {
  const slideUrl = options.useHttp
    ? `${slidesDir}/${slideFile}`
    : pathToFileURL(join(slidesDir, slideFile)).href;

  await page.goto(slideUrl, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });

  if (options.elementOnly) {
    // Thumbnail mode: capture just the slide element at its native size
    const handle = await page.$('.slide') || await page.$('body');
    await handle.screenshot({ path: screenshotPath });
    return;
  }

  // Annotation mode: scale slide to fill the full viewport
  await page.evaluate(({ width, height }) => {
    const htmlStyle = document.documentElement.style;
    const bodyStyle = document.body.style;

    htmlStyle.margin = '0';
    htmlStyle.padding = '0';
    htmlStyle.overflow = 'hidden';
    htmlStyle.background = '#ffffff';

    bodyStyle.margin = '0';
    bodyStyle.padding = '0';
    bodyStyle.transformOrigin = '0 0';

    const slideEl = document.querySelector('.slide');
    const target = slideEl || document.body;
    const rect = target.getBoundingClientRect();
    const sourceW = rect.width > 0 ? rect.width : width;
    const sourceH = rect.height > 0 ? rect.height : height;

    if (slideEl) {
      bodyStyle.background = 'transparent';
    }

    const scale = Math.min(width / sourceW, height / sourceH);
    const tx = (width - sourceW * scale) / 2 - rect.left * scale;
    const ty = (height - sourceH * scale) / 2 - rect.top * scale;

    bodyStyle.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }, SCREENSHOT_SIZE);

  await page.screenshot({
    path: screenshotPath,
    fullPage: false,
  });
}
