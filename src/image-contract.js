const ABSOLUTE_FILESYSTEM_PATH_RE = /^(file:\/\/|\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/Volumes\/|[A-Za-z]:[\\/]|\\\\)/i;
const CSS_URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;

export const LOCAL_ASSET_PREFIX = './assets/';

export function looksLikeAbsoluteFilesystemPath(value) {
  return ABSOLUTE_FILESYSTEM_PATH_RE.test((value || '').trim());
}

export function extractCssUrls(value) {
  const input = typeof value === 'string' ? value : '';
  const matches = [];
  let match;
  while ((match = CSS_URL_RE.exec(input)) !== null) {
    const candidate = (match[2] || '').trim();
    if (candidate) {
      matches.push(candidate);
    }
  }
  return matches;
}

function injectIntoHead(html, snippet) {
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${snippet}`);
  }

  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}\n<head>\n${snippet}\n</head>`);
  }

  return `${snippet}\n${html}`;
}

export function buildSlideRuntimeHtml(html, { baseHref, slideFile }) {
  const snippets = [];

  if (baseHref && !/<base\b/i.test(html)) {
    snippets.push(`<base href="${baseHref}">`);
  }

  const script = `<script>
(() => {
  const slideFile = ${JSON.stringify(slideFile)};
  const localAssetPrefix = ${JSON.stringify(LOCAL_ASSET_PREFIX)};
  const absolutePathRe = ${ABSOLUTE_FILESYSTEM_PATH_RE.toString()};
  const prefix = '[slides-grab:image]';

  function describeElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    if (element === document.body) return 'body';

    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += '#' + current.id;
        parts.unshift(part);
        break;
      }
      if (current.classList.length > 0) {
        part += '.' + Array.from(current.classList).slice(0, 2).join('.');
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }

  function warn(message, detail) {
    console.warn(prefix + ' ' + slideFile + ': ' + message, detail);
  }

  function fail(message, detail) {
    console.error(prefix + ' ' + slideFile + ': ' + message, detail);
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    const src = (target.getAttribute('src') || target.currentSrc || '').trim();
    if (!src || src.startsWith('data:')) return;
    if (src.startsWith(localAssetPrefix)) {
      fail('missing local asset', { src });
      return;
    }
    fail('image failed to load', { src });
  }, true);

  window.addEventListener('DOMContentLoaded', () => {
    for (const image of document.querySelectorAll('img[src]')) {
      const src = (image.getAttribute('src') || '').trim();
      if (!src || src.startsWith('data:')) continue;
      if (src.startsWith('https://')) {
        warn('remote image is best-effort only', { src });
        continue;
      }
      if (absolutePathRe.test(src)) {
        fail('absolute filesystem image path is unsupported', { src });
      }
    }

    for (const element of document.body.querySelectorAll('*')) {
      if (element === document.body) continue;
      const backgroundImage = window.getComputedStyle(element).backgroundImage;
      if (!backgroundImage || backgroundImage === 'none' || !backgroundImage.includes('url(')) continue;
      fail('non-body background-image is not supported for slide content', {
        element: describeElement(element),
        backgroundImage,
      });
    }
  });
})();
</script>`;

  snippets.push(script);

  return injectIntoHead(html, snippets.join('\n'));
}
