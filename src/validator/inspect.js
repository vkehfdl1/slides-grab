import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { FRAME_PX, TEXT_SELECTOR, TOLERANCE_PX } from './constants.js';

export function inspectSlideDocument({ framePx, textSelector, tolerancePx }) {
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

  return { critical, warning };
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

  const inspection = await page.evaluate(inspectSlideDocument, {
    framePx: FRAME_PX,
    textSelector: TEXT_SELECTOR,
    tolerancePx: TOLERANCE_PX,
  });

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
