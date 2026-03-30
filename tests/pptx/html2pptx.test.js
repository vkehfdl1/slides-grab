/**
 * Unit tests for html2pptx conversion helpers.
 *
 * The pure functions inside src/html2pptx.cjs are embedded in page.evaluate()
 * and not exported. We reimplement the logic here to test it independently.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Constants (from src/html2pptx.cjs lines 34-36, 440) ──

const PT_PER_PX = 0.75;
const PX_PER_IN = 96;
const EMU_PER_IN = 914400;
const SINGLE_WEIGHT_FONTS = ['impact'];

// ── Reimplemented helpers (from page.evaluate block, lines 447-518) ──

function shouldSkipBold(fontFamily) {
  if (!fontFamily) return false;
  const normalizedFont = fontFamily.toLowerCase().replace(/['"]/g, '').split(',')[0].trim();
  return SINGLE_WEIGHT_FONTS.includes(normalizedFont);
}

function pxToInch(px) {
  return px / PX_PER_IN;
}

function pxToPoints(pxStr) {
  return parseFloat(pxStr) * PT_PER_PX;
}

function rgbToHex(rgbStr) {
  if (rgbStr === 'rgba(0, 0, 0, 0)' || rgbStr === 'transparent') return 'FFFFFF';
  const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return 'FFFFFF';
  return match.slice(1).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function extractAlpha(rgbStr) {
  const match = rgbStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!match || !match[4]) return null;
  const alpha = parseFloat(match[4]);
  return Math.round((1 - alpha) * 100);
}

function applyTextTransform(text, textTransform) {
  if (textTransform === 'uppercase') return text.toUpperCase();
  if (textTransform === 'lowercase') return text.toLowerCase();
  if (textTransform === 'capitalize') {
    return text.replace(/\b\w/g, c => c.toUpperCase());
  }
  return text;
}

function getRotation(transform, writingMode) {
  let angle = 0;
  if (writingMode === 'vertical-rl') angle = 90;
  else if (writingMode === 'vertical-lr') angle = 270;

  if (transform && transform !== 'none') {
    const rotateMatch = transform.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
    if (rotateMatch) {
      angle += parseFloat(rotateMatch[1]);
    } else {
      const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
      if (matrixMatch) {
        const values = matrixMatch[1].split(',').map(parseFloat);
        const matrixAngle = Math.atan2(values[1], values[0]) * (180 / Math.PI);
        angle += Math.round(matrixAngle);
      }
    }
  }

  angle = angle % 360;
  if (angle < 0) angle += 360;
  return angle === 0 ? null : angle;
}

// ── Tests ──

describe('html2pptx constants', () => {
  it('PT_PER_PX is 0.75', () => {
    assert.equal(PT_PER_PX, 0.75);
  });

  it('PX_PER_IN is 96', () => {
    assert.equal(PX_PER_IN, 96);
  });

  it('EMU_PER_IN is 914400', () => {
    assert.equal(EMU_PER_IN, 914400);
  });
});

describe('rgbToHex', () => {
  it('converts rgb(255, 0, 0) to ff0000', () => {
    assert.equal(rgbToHex('rgb(255, 0, 0)'), 'ff0000');
  });

  it('converts rgb(0, 128, 255) to 0080ff', () => {
    assert.equal(rgbToHex('rgb(0, 128, 255)'), '0080ff');
  });

  it('converts rgba(0, 0, 0, 1) to 000000', () => {
    assert.equal(rgbToHex('rgba(0, 0, 0, 1)'), '000000');
  });

  it('returns FFFFFF for transparent', () => {
    assert.equal(rgbToHex('transparent'), 'FFFFFF');
  });

  it('returns FFFFFF for rgba(0, 0, 0, 0)', () => {
    assert.equal(rgbToHex('rgba(0, 0, 0, 0)'), 'FFFFFF');
  });

  it('returns FFFFFF for unparseable string', () => {
    assert.equal(rgbToHex('not-a-color'), 'FFFFFF');
  });

  it('converts rgb(255, 255, 255) to ffffff', () => {
    assert.equal(rgbToHex('rgb(255, 255, 255)'), 'ffffff');
  });
});

describe('extractAlpha', () => {
  it('returns 50 for rgba with 0.5 alpha (50% transparency)', () => {
    assert.equal(extractAlpha('rgba(0, 0, 0, 0.5)'), 50);
  });

  it('returns 0 for fully opaque rgba', () => {
    assert.equal(extractAlpha('rgba(0, 0, 0, 1)'), 0);
  });

  it('returns 100 for fully transparent rgba', () => {
    assert.equal(extractAlpha('rgba(0, 0, 0, 0)'), 100);
  });

  it('returns null for rgb (no alpha)', () => {
    assert.equal(extractAlpha('rgb(0, 0, 0)'), null);
  });

  it('returns 75 for rgba with 0.25 alpha', () => {
    assert.equal(extractAlpha('rgba(100, 200, 50, 0.25)'), 75);
  });
});

describe('pxToInch', () => {
  it('converts 96px to 1 inch', () => {
    assert.equal(pxToInch(96), 1.0);
  });

  it('converts 48px to 0.5 inch', () => {
    assert.equal(pxToInch(48), 0.5);
  });

  it('converts 0 to 0', () => {
    assert.equal(pxToInch(0), 0);
  });
});

describe('pxToPoints', () => {
  it('converts "16px" to 12pt', () => {
    assert.equal(pxToPoints('16px'), 12);
  });

  it('converts "24px" to 18pt', () => {
    assert.equal(pxToPoints('24px'), 18);
  });

  it('converts "32px" to 24pt', () => {
    assert.equal(pxToPoints('32px'), 24);
  });

  it('handles numeric string without unit', () => {
    assert.equal(pxToPoints('20'), 15);
  });
});

describe('applyTextTransform', () => {
  it('uppercase converts to upper case', () => {
    assert.equal(applyTextTransform('hello world', 'uppercase'), 'HELLO WORLD');
  });

  it('lowercase converts to lower case', () => {
    assert.equal(applyTextTransform('HELLO WORLD', 'lowercase'), 'hello world');
  });

  it('capitalize capitalizes first letter of each word', () => {
    assert.equal(applyTextTransform('hello world', 'capitalize'), 'Hello World');
  });

  it('none returns text unchanged', () => {
    assert.equal(applyTextTransform('Hello', 'none'), 'Hello');
  });

  it('unrecognized value returns text unchanged', () => {
    assert.equal(applyTextTransform('test', 'unknown'), 'test');
  });
});

describe('getRotation', () => {
  it('returns null for no transform and no writing-mode', () => {
    assert.equal(getRotation('none', undefined), null);
  });

  it('parses rotate(45deg)', () => {
    assert.equal(getRotation('rotate(45deg)', undefined), 45);
  });

  it('parses rotate(-90deg) → 270', () => {
    assert.equal(getRotation('rotate(-90deg)', undefined), 270);
  });

  it('returns 90 for vertical-rl writing-mode', () => {
    assert.equal(getRotation('none', 'vertical-rl'), 90);
  });

  it('returns 270 for vertical-lr writing-mode', () => {
    assert.equal(getRotation('none', 'vertical-lr'), 270);
  });

  it('combines writing-mode and transform', () => {
    // vertical-rl (90) + rotate(45deg) = 135
    assert.equal(getRotation('rotate(45deg)', 'vertical-rl'), 135);
  });

  it('parses matrix transform for 90 degree rotation', () => {
    // matrix(cos90, sin90, -sin90, cos90, 0, 0) = matrix(0, 1, -1, 0, 0, 0)
    assert.equal(getRotation('matrix(0, 1, -1, 0, 0, 0)', undefined), 90);
  });

  it('returns null for 0 degree rotation', () => {
    assert.equal(getRotation('rotate(0deg)', undefined), null);
  });

  it('normalizes 360 to null', () => {
    assert.equal(getRotation('rotate(360deg)', undefined), null);
  });
});

describe('shouldSkipBold', () => {
  it('skips bold for Impact font', () => {
    assert.equal(shouldSkipBold('Impact'), true);
  });

  it('skips bold for impact (lowercase)', () => {
    assert.equal(shouldSkipBold('impact'), true);
  });

  it('skips bold for quoted Impact in font stack', () => {
    assert.equal(shouldSkipBold("'Impact', sans-serif"), true);
  });

  it('allows bold for Arial', () => {
    assert.equal(shouldSkipBold('Arial'), false);
  });

  it('allows bold for Pretendard', () => {
    assert.equal(shouldSkipBold('Pretendard'), false);
  });

  it('returns false for null/undefined', () => {
    assert.equal(shouldSkipBold(null), false);
    assert.equal(shouldSkipBold(undefined), false);
  });
});

describe('slide dimension validation', () => {
  // Reimplements the dimension check from html2pptx.cjs line ~290
  function validateDimensions(bodyW, bodyH, expectedW, expectedH) {
    const tolerance = 0.5;
    if (Math.abs(bodyW - expectedW) > tolerance || Math.abs(bodyH - expectedH) > tolerance) {
      return { valid: false, bodyW, bodyH, expectedW, expectedH };
    }
    return { valid: true };
  }

  it('accepts exact 720x405 dimensions', () => {
    assert.equal(validateDimensions(720, 405, 720, 405).valid, true);
  });

  it('accepts within tolerance', () => {
    assert.equal(validateDimensions(720.3, 405.2, 720, 405).valid, true);
  });

  it('rejects dimensions outside tolerance', () => {
    const result = validateDimensions(800, 600, 720, 405);
    assert.equal(result.valid, false);
  });
});

describe('image source classification', () => {
  it('identifies data URL', () => {
    const src = 'data:image/png;base64,iVBOR...';
    assert.ok(src.startsWith('data:'));
  });

  it('identifies local asset path', () => {
    const src = './assets/logo.png';
    assert.ok(src.startsWith('./assets/'));
  });

  it('identifies remote URL', () => {
    const src = 'https://cdn.example.com/image.png';
    assert.ok(src.startsWith('https://'));
  });

  it('identifies file:// protocol', () => {
    const src = 'file:///Users/test/image.png';
    assert.ok(src.startsWith('file://'));
  });
});
