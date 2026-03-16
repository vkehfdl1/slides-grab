import { access, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  buildImageContractReport,
  classifyImageSource,
  resolveSlideSourcePath,
} from '../image-contract.js';

export const FRAME_PT = { width: 720, height: 405 };
export const PT_TO_PX = 96 / 72;
export const FRAME_PX = {
  width: FRAME_PT.width * PT_TO_PX,
  height: FRAME_PT.height * PT_TO_PX,
};
export const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
export const TEXT_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li';
export const TOLERANCE_PX = 0.5;

export function toSlideOrder(fileName) {
  const match = fileName.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY;
}

export function sortSlideFiles(a, b) {
  const orderA = toSlideOrder(a);
  const orderB = toSlideOrder(b);
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b);
}

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

export function createValidationResult(slides) {
  return {
    generatedAt: new Date().toISOString(),
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

export function createValidationFailure(error) {
  return {
    generatedAt: new Date().toISOString(),
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

async function inspectImageContract(slidesDir, fileName, inspection) {
  const critical = [];
  const warning = [];
  const slidePath = join(slidesDir, fileName);

  for (const image of inspection.images) {
    const source = image.src;
    const classification = classifyImageSource(source);
    const issues = buildImageContractReport({
      slideFile: fileName,
      sources: [{
        element: buildElementPath(image.element),
        source,
      }],
    });

    for (const issue of issues) {
      const target = issue.severity === 'critical' ? critical : warning;
      target.push(issue);
    }

    if (
      classification.kind === 'empty'
      || classification.kind === 'data-url'
      || classification.kind === 'remote-url'
      || classification.kind === 'remote-url-insecure'
      || classification.kind === 'absolute-filesystem-path'
      || classification.kind === 'root-relative-path'
      || classification.kind === 'other-scheme'
    ) {
      continue;
    }

    const assetPath = resolveSlideSourcePath(slidePath, source);
    if (!(await fileExists(assetPath))) {
      critical.push(buildImageIssue(
        'critical',
        'missing-local-asset',
        'Local image asset is missing.',
        {
          slide: fileName,
          element: buildElementPath(image.element),
          source,
          assetPath,
        },
      ));
    }
  }

  for (const background of inspection.backgrounds) {
    if (background.urls.length === 0) continue;

    if (background.element !== 'body') {
      critical.push(buildImageIssue(
        'critical',
        'unsupported-background-image',
        'Non-body background-image usage is not supported for slide content. Use <img src="./assets/<file>"> instead.',
        {
          slide: fileName,
          element: buildElementPath(background.element),
          backgroundImage: background.backgroundImage,
          sources: background.urls,
        },
      ));
    }

    const issues = buildImageContractReport({
      slideFile: fileName,
      sources: background.urls.map((source) => ({
        element: buildElementPath(background.element),
        source,
      })),
    });

    for (const issue of issues) {
      const code = issue.code === 'remote-image-url'
        ? 'remote-background-image-url'
        : issue.code === 'remote-image-url-insecure'
          ? 'remote-background-image-url-insecure'
          : issue.code;
      const nextIssue = { ...issue, code };
      const target = issue.severity === 'critical' ? critical : warning;
      target.push(nextIssue);
    }

    for (const source of background.urls) {
      const classification = classifyImageSource(source);
      if (
        classification.kind === 'empty'
        || classification.kind === 'data-url'
        || classification.kind === 'remote-url'
        || classification.kind === 'remote-url-insecure'
        || classification.kind === 'absolute-filesystem-path'
        || classification.kind === 'root-relative-path'
        || classification.kind === 'other-scheme'
      ) {
        continue;
      }

      const assetPath = resolveSlideSourcePath(slidePath, source);
      if (!(await fileExists(assetPath))) {
        critical.push(buildImageIssue(
          'critical',
          'missing-local-background-asset',
          'Background image references a missing local asset.',
          {
            slide: fileName,
            element: buildElementPath(background.element),
            source,
            assetPath,
          },
        ));
      }
    }
  }

  return { critical, warning };
}

export async function findSlideFiles(slidesDir) {
  const entries = await readdir(slidesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && SLIDE_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(sortSlideFiles);
}

export function selectSlideFiles(slideFiles, selectedSlides = [], slidesDir = '') {
  if (!Array.isArray(selectedSlides) || selectedSlides.length === 0) {
    return slideFiles;
  }

  const requested = [...new Set(
    selectedSlides
      .map((slide) => basename(String(slide).trim()))
      .filter(Boolean),
  )];

  const available = new Set(slideFiles);
  const missing = requested.filter((slide) => !available.has(slide));
  if (missing.length > 0) {
    const location = slidesDir ? ` in ${slidesDir}` : '';
    throw new Error(`Requested slide file(s) not found${location}: ${missing.join(', ')}`);
  }

  return slideFiles.filter((slide) => available.has(slide) && requested.includes(slide));
}

export async function inspectSlide(page, fileName, slidesDir) {
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
      const cssUrlRe = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

      const round = (value) => Number(value.toFixed(2));
      const extractUrls = (value) => {
        const input = typeof value === 'string' ? value : '';
        const matches = [];
        let match;
        cssUrlRe.lastIndex = 0;
        while ((match = cssUrlRe.exec(input)) !== null) {
          const candidate = (match[2] || '').trim();
          if (candidate) {
            matches.push(candidate);
          }
        }
        return matches;
      };

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
          bottom: round(bottom),
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

      const collectDeclaredBackgroundValues = (element) => {
        const values = [];
        const pushValue = (value) => {
          if (
            typeof value !== 'string'
            || value === ''
            || value === 'none'
            || !value.includes('url(')
            || values.includes(value)
          ) {
            return;
          }
          values.push(value);
        };

        pushValue(element.style?.getPropertyValue('background-image'));
        pushValue(element.style?.getPropertyValue('background'));

        const visitRules = (rules) => {
          for (const rule of Array.from(rules || [])) {
            if (rule.type === CSSRule.STYLE_RULE) {
              let matches = false;
              try {
                matches = element.matches(rule.selectorText);
              } catch {
                matches = false;
              }

              if (!matches) continue;
              pushValue(rule.style?.getPropertyValue('background-image'));
              pushValue(rule.style?.getPropertyValue('background'));
              continue;
            }

            if ('cssRules' in rule) {
              try {
                visitRules(rule.cssRules);
              } catch {
                // Ignore cross-origin and invalid stylesheet access.
              }
            }
          }
        };

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            visitRules(sheet.cssRules);
          } catch {
            // Ignore cross-origin stylesheets.
          }
        }

        return values;
      };

      const bodyRect = document.body.getBoundingClientRect();
      const frameRect = {
        left: bodyRect.left,
        top: bodyRect.top,
        right: bodyRect.left + (bodyRect.width || framePx.width),
        bottom: bodyRect.top + (bodyRect.height || framePx.height),
        width: bodyRect.width || framePx.width,
        height: bodyRect.height || framePx.height,
      };

      const allVisibleElements = Array.from(document.body.querySelectorAll('*')).filter(isVisible);
      const visibleSet = new Set(allVisibleElements);

      for (const element of allVisibleElements) {
        const rect = element.getBoundingClientRect();
        const outsideFrame = (
          rect.left < frameRect.left - tolerancePx
          || rect.top < frameRect.top - tolerancePx
          || rect.right > frameRect.right + tolerancePx
          || rect.bottom > frameRect.bottom + tolerancePx
        );

        if (outsideFrame) {
          critical.push({
            code: 'overflow-outside-frame',
            message: 'Element exceeds the 720pt x 405pt slide frame.',
            element: elementPath(element),
            bbox: normalizeRect(rect),
            frame: normalizeRect(frameRect),
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
            clientHeight: element.clientHeight,
          },
          bbox: normalizeRect(element.getBoundingClientRect()),
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
                height: round(overlapHeight),
              },
              boxes: [normalizeRect(rectA), normalizeRect(rectB)],
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
          const computedBackgroundImage = window.getComputedStyle(element).backgroundImage;
          const declaredBackgroundValues = collectDeclaredBackgroundValues(element);
          const declaredBackgroundImage = declaredBackgroundValues.find((value) => extractUrls(value).length > 0) || '';
          const declaredUrls = declaredBackgroundValues.flatMap(extractUrls);
          const urls = declaredUrls.length > 0 ? declaredUrls : extractUrls(computedBackgroundImage);

          return {
            element: element === document.body ? 'body' : elementPath(element),
            backgroundImage: declaredBackgroundImage || computedBackgroundImage,
            urls,
          };
        })
        .filter((entry) => entry.urls.length > 0);

      return {
        critical,
        warning,
        images,
        backgrounds,
      };
    },
    {
      framePx: FRAME_PX,
      textSelector: TEXT_SELECTOR,
      tolerancePx: TOLERANCE_PX,
    },
  );

  const imageContractIssues = await inspectImageContract(slidesDir, fileName, {
    images: inspection.images,
    backgrounds: inspection.backgrounds,
  });

  inspection.critical.push(...imageContractIssues.critical);
  inspection.warning.push(...imageContractIssues.warning);

  const summary = {
    criticalCount: inspection.critical.length,
    warningCount: inspection.warning.length,
  };

  return {
    slide: fileName,
    status: summary.criticalCount > 0 ? 'fail' : 'pass',
    critical: inspection.critical,
    warning: inspection.warning,
    summary,
  };
}

export async function scanSlides(page, slidesDir, slideFiles) {
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

  return slides;
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

const EXPORT_BLOCKING_IMAGE_CONTRACT_CODES = new Set([
  'absolute-filesystem-image-path',
  'missing-local-asset',
  'missing-local-background-asset',
  'root-relative-image-path',
  'unsupported-background-image',
]);

function filterExportBlockingSlides(result, shouldBlockIssue) {
  const slides = result.slides
    .map((slide) => {
      const critical = slide.critical.filter(shouldBlockIssue);
      const warning = slide.warning.filter(shouldBlockIssue);
      const criticalCount = critical.length;
      const warningCount = warning.length;
      return {
        ...slide,
        status: criticalCount > 0 ? 'fail' : 'pass',
        critical,
        warning,
        summary: {
          ...slide.summary,
          criticalCount,
          warningCount,
        },
      };
    })
    .filter((slide) => slide.critical.length > 0 || slide.warning.length > 0);

  return {
    ...result,
    slides,
    summary: summarizeSlides(slides),
  };
}

export function isBlockingImageContractIssue(issue) {
  return EXPORT_BLOCKING_IMAGE_CONTRACT_CODES.has(issue?.code);
}

export async function ensureSlidesPassValidation(
  slidesDir,
  {
    exportLabel = 'Export',
    shouldBlockIssue = isBlockingImageContractIssue,
  } = {},
) {
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
    const blockingResult = filterExportBlockingSlides(result, shouldBlockIssue);
    if (blockingResult.summary.failedSlides > 0) {
      throw new Error(formatValidationFailureForExport(blockingResult, exportLabel));
    }
    return blockingResult;
  } finally {
    await browser.close();
  }
}
