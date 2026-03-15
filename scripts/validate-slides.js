#!/usr/bin/env node

import { access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

import {
  extractCssUrls,
  LOCAL_ASSET_PREFIX,
  looksLikeAbsoluteFilesystemPath,
} from '../src/image-contract.js';

const FRAME_PT = { width: 720, height: 405 };
const PT_TO_PX = 96 / 72;
const FRAME_PX = {
  width: FRAME_PT.width * PT_TO_PX,
  height: FRAME_PT.height * PT_TO_PX
};
const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
const TEXT_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li';
const TOLERANCE_PX = 0.5;
const DEFAULT_SLIDES_DIR = 'slides';

function toSlideOrder(fileName) {
  const match = fileName.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

function sortSlideFiles(a, b) {
  const orderA = toSlideOrder(a);
  const orderB = toSlideOrder(b);
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b);
}

function buildIssue(code, message, payload = {}) {
  return { code, message, ...payload };
}

function summarizeSlides(slides) {
  const summary = {
    totalSlides: slides.length,
    passedSlides: 0,
    failedSlides: 0,
    criticalIssues: 0,
    warnings: 0
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

function printUsage() {
  process.stdout.write(
    [
      'Usage: slides-grab lint [options]',
      '   or: node scripts/validate-slides.js [options]',
      '',
      'Options:',
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
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

export function parseCliArgs(args) {
  const options = {
    slidesDir: DEFAULT_SLIDES_DIR,
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

    throw new Error(`Unknown option: ${arg}`);
  }

  if (typeof options.slidesDir !== 'string' || options.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }

  options.slidesDir = options.slidesDir.trim();
  return options;
}

export async function findSlideFiles(slidesDir) {
  const entries = await readdir(slidesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(sortSlideFiles);
}

function buildElementPath(element) {
  return typeof element === 'string' && element ? element : 'unknown';
}

function buildImageIssue(severity, code, message, payload = {}) {
  return {
    severity,
    code,
    message,
    ...payload,
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function classifyImageSource(source) {
  const value = typeof source === 'string' ? source.trim() : '';
  if (!value) return { kind: 'empty' };
  if (value.startsWith('data:')) return { kind: 'data-url' };
  if (value.startsWith('https://')) return { kind: 'remote-url' };
  if (value.startsWith('http://')) return { kind: 'remote-url-insecure' };
  if (looksLikeAbsoluteFilesystemPath(value)) return { kind: 'absolute-filesystem-path' };
  if (value.startsWith(LOCAL_ASSET_PREFIX)) return { kind: 'local-asset-path' };
  return { kind: 'other' };
}

async function inspectImageContract(slidesDir, fileName, inspection) {
  const critical = [];
  const warning = [];

  for (const image of inspection.images) {
    const source = image.src;
    const classification = classifyImageSource(source);

    if (classification.kind === 'data-url' || classification.kind === 'empty') {
      continue;
    }

    if (classification.kind === 'local-asset-path') {
      const assetPath = join(slidesDir, source.replace(/^\.\//, ''));
      if (!(await fileExists(assetPath))) {
        critical.push(buildImageIssue(
          'critical',
          'missing-local-asset',
          'Local asset under ./assets/ is missing.',
          {
            element: buildElementPath(image.element),
            source,
            assetPath,
          },
        ));
      }
      continue;
    }

    if (classification.kind === 'remote-url' || classification.kind === 'remote-url-insecure') {
      warning.push(buildImageIssue(
        'warning',
        'remote-image-url',
        'Remote image URL is best-effort only and may break deterministic exports.',
        {
          element: buildElementPath(image.element),
          source,
        },
      ));
      continue;
    }

    if (classification.kind === 'absolute-filesystem-path') {
      critical.push(buildImageIssue(
        'critical',
        'absolute-filesystem-image-path',
        'Absolute filesystem image paths are not portable. Use ./assets/<file> instead.',
        {
          element: buildElementPath(image.element),
          source,
        },
      ));
      continue;
    }
  }

  for (const background of inspection.backgrounds) {
    if (background.element === 'body') continue;
    if (background.urls.length === 0) continue;

    critical.push(buildImageIssue(
      'critical',
      'unsupported-background-image',
      'Non-body background-image usage is not supported for slide content. Use <img src="./assets/<file>"> instead.',
      {
        element: buildElementPath(background.element),
        backgroundImage: background.backgroundImage,
        sources: background.urls,
      },
    ));

    for (const source of background.urls) {
      const classification = classifyImageSource(source);
      if (classification.kind === 'remote-url' || classification.kind === 'remote-url-insecure') {
        warning.push(buildImageIssue(
          'warning',
          'remote-background-image-url',
          'Remote background images are best-effort only and should not be used for canonical slide imagery.',
          {
            element: buildElementPath(background.element),
            source,
          },
        ));
      } else if (classification.kind === 'absolute-filesystem-path') {
        critical.push(buildImageIssue(
          'critical',
          'absolute-filesystem-background-image-path',
          'Absolute filesystem background-image paths are not portable.',
          {
            element: buildElementPath(background.element),
            source,
          },
        ));
      } else if (classification.kind === 'local-asset-path') {
        const assetPath = join(slidesDir, source.replace(/^\.\//, ''));
        if (!(await fileExists(assetPath))) {
          critical.push(buildImageIssue(
            'critical',
            'missing-local-background-asset',
            'Background image references a missing local asset.',
            {
              element: buildElementPath(background.element),
              source,
              assetPath,
            },
          ));
        }
      }
    }
  }

  return { critical, warning };
}

async function inspectSlide(page, fileName, slidesDir) {
  const slidePath = join(slidesDir, fileName);
  const slideUrl = pathToFileURL(slidePath).href;

  await page.goto(slideUrl, { waitUntil: 'load' });
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });

  const inspection = await page.evaluate(
    ({ framePx, textSelector, tolerancePx }) => {
      const skipTags = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT']);
      const critical = [];
      const warning = [];
      const seenOverlaps = new Set();

      const round = (value) => Number(value.toFixed(2));

      const normalizeRect = (rect) => {
        const left = rect.left ?? rect.x ?? 0;
        const top = rect.top ?? rect.y ?? 0;
        const width = rect.width ?? (rect.right - left) ?? 0;
        const height = rect.height ?? (rect.bottom - top) ?? 0;
        const right = rect.right ?? (left + width);
        const bottom = rect.bottom ?? (top + height);
        return {
          x: round(left),
          y: round(top),
          width: round(width),
          height: round(height),
          left: round(left),
          top: round(top),
          right: round(right),
          bottom: round(bottom)
        };
      };

      const elementPath = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
        if (element === document.body) return 'body';

        const parts = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
          let part = current.tagName.toLowerCase();
          if (current.id) {
            part += `#${current.id}`;
            parts.unshift(part);
            break;
          }

          const classNames = Array.from(current.classList).slice(0, 2);
          if (classNames.length > 0) {
            part += `.${classNames.join('.')}`;
          }

          if (current.parentElement) {
            const siblingsOfSameTag = Array.from(current.parentElement.children)
              .filter((sibling) => sibling.tagName === current.tagName);
            if (siblingsOfSameTag.length > 1) {
              const index = siblingsOfSameTag.indexOf(current);
              part += `:nth-of-type(${index + 1})`;
            }
          }

          parts.unshift(part);
          current = current.parentElement;
        }

        return `body > ${parts.join(' > ')}`;
      };

      const isVisible = (element) => {
        if (skipTags.has(element.tagName)) return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const bodyRect = document.body.getBoundingClientRect();
      const frameRect = {
        left: bodyRect.left,
        top: bodyRect.top,
        right: bodyRect.left + (bodyRect.width || framePx.width),
        bottom: bodyRect.top + (bodyRect.height || framePx.height),
        width: bodyRect.width || framePx.width,
        height: bodyRect.height || framePx.height
      };

      const allVisibleElements = Array.from(document.body.querySelectorAll('*')).filter(isVisible);
      const visibleSet = new Set(allVisibleElements);

      for (const element of allVisibleElements) {
        const rect = element.getBoundingClientRect();
        const outsideFrame = (
          rect.left < frameRect.left - tolerancePx ||
          rect.top < frameRect.top - tolerancePx ||
          rect.right > frameRect.right + tolerancePx ||
          rect.bottom > frameRect.bottom + tolerancePx
        );

        if (outsideFrame) {
          critical.push({
            code: 'overflow-outside-frame',
            message: 'Element exceeds the 720pt x 405pt slide frame.',
            element: elementPath(element),
            bbox: normalizeRect(rect),
            frame: normalizeRect(frameRect)
          });
        }
      }

      const textElements = Array.from(document.querySelectorAll(textSelector));
      for (const element of textElements) {
        if (!isVisible(element)) continue;
        const content = (element.textContent || '').trim();
        if (!content) continue;

        const clipped = element.scrollHeight > element.clientHeight;
        if (!clipped) continue;

        critical.push({
          code: 'text-clipped',
          message: 'Text element is clipped because scrollHeight is larger than clientHeight.',
          element: elementPath(element),
          metrics: {
            scrollHeight: element.scrollHeight,
            clientHeight: element.clientHeight
          },
          bbox: normalizeRect(element.getBoundingClientRect())
        });
      }

      const parents = [document.body, ...allVisibleElements];
      for (const parent of parents) {
        const children = Array.from(parent.children).filter((child) => visibleSet.has(child));
        if (children.length < 2) continue;

        for (let i = 0; i < children.length; i += 1) {
          for (let j = i + 1; j < children.length; j += 1) {
            const first = children[i];
            const second = children[j];

            const rectA = first.getBoundingClientRect();
            const rectB = second.getBoundingClientRect();

            const overlapWidth = Math.min(rectA.right, rectB.right) - Math.max(rectA.left, rectB.left);
            const overlapHeight = Math.min(rectA.bottom, rectB.bottom) - Math.max(rectA.top, rectB.top);

            if (overlapWidth <= tolerancePx || overlapHeight <= tolerancePx) continue;

            const firstPath = elementPath(first);
            const secondPath = elementPath(second);
            const overlapKey = [firstPath, secondPath].sort().join('::');

            if (seenOverlaps.has(overlapKey)) continue;
            seenOverlaps.add(overlapKey);

            warning.push({
              code: 'sibling-overlap',
              message: 'Sibling elements overlap in their bounding boxes.',
              parent: elementPath(parent),
              elements: [firstPath, secondPath],
              intersection: {
                x: round(Math.max(rectA.left, rectB.left)),
                y: round(Math.max(rectA.top, rectB.top)),
                width: round(overlapWidth),
                height: round(overlapHeight)
              },
              boxes: [normalizeRect(rectA), normalizeRect(rectB)]
            });
          }
        }
      }

      const images = Array.from(document.querySelectorAll('img')).map((element) => ({
        element: elementPath(element),
        src: (element.getAttribute('src') || '').trim(),
        alt: (element.getAttribute('alt') || '').trim(),
      }));

      const backgrounds = [document.body, ...Array.from(document.body.querySelectorAll('*'))]
        .map((element) => {
          const backgroundImage = window.getComputedStyle(element).backgroundImage;
          return {
            element: element === document.body ? 'body' : elementPath(element),
            backgroundImage,
            urls: backgroundImage && backgroundImage !== 'none' ? Array.from(backgroundImage.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)).map((match) => (match[2] || '').trim()).filter(Boolean) : [],
          };
        })
        .filter((entry) => entry.urls.length > 0);

      return {
        critical,
        warning,
        images,
        backgrounds
      };
    },
    {
      framePx: FRAME_PX,
      textSelector: TEXT_SELECTOR,
      tolerancePx: TOLERANCE_PX
    }
  );

  const imageContractIssues = await inspectImageContract(slidesDir, fileName, {
    images: inspection.images,
    backgrounds: inspection.backgrounds.map((background) => ({
      ...background,
      urls: extractCssUrls(background.backgroundImage),
    })),
  });

  inspection.critical.push(...imageContractIssues.critical);
  inspection.warning.push(...imageContractIssues.warning);

  const summary = {
    criticalCount: inspection.critical.length,
    warningCount: inspection.warning.length
  };

  return {
    slide: fileName,
    status: summary.criticalCount > 0 ? 'fail' : 'pass',
    critical: inspection.critical,
    warning: inspection.warning,
    summary
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
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

  const slides = [];
  try {
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
              { detail: error instanceof Error ? error.message : String(error) }
            )
          ],
          warning: [],
          summary: {
            criticalCount: 1,
            warningCount: 0
          }
        });
      }
    }
  } finally {
    await browser.close();
  }

  const result = {
    generatedAt: new Date().toISOString(),
    frame: {
      widthPt: FRAME_PT.width,
      heightPt: FRAME_PT.height,
      widthPx: FRAME_PX.width,
      heightPx: FRAME_PX.height
    },
    slides,
    summary: summarizeSlides(slides)
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.summary.failedSlides > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    frame: {
      widthPt: FRAME_PT.width,
      heightPt: FRAME_PT.height,
      widthPx: FRAME_PX.width,
      heightPx: FRAME_PX.height
    },
    slides: [],
    summary: {
      totalSlides: 0,
      passedSlides: 0,
      failedSlides: 0,
      criticalIssues: 1,
      warnings: 0
    },
    error: error instanceof Error ? error.message : String(error)
  };

  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
});
