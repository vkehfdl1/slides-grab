/**
 * Canonical slide dimension constants.
 *
 * All slide-related code should import from here instead of hardcoding values.
 *
 *   CSS/HTML body:  720pt × 405pt
 *   Pixel (96 dpi):  960px × 540px
 *   Inches:           10"  × 5.625"
 *   Aspect ratio:     16:9
 */

/** Points per inch in CSS */
export const PT_PER_IN = 72;

/** CSS pixels per inch */
export const PX_PER_IN = 96;

/** Conversion factor: 1pt = (96/72) px ≈ 1.333px */
export const PT_TO_PX = PX_PER_IN / PT_PER_IN;

/** Slide dimensions in CSS points (as authored in HTML body) */
export const SLIDE_PT = Object.freeze({ width: 720, height: 405 });

/** Slide dimensions in CSS pixels */
export const SLIDE_PX = Object.freeze({
  width: SLIDE_PT.width * PT_TO_PX,   // 960
  height: SLIDE_PT.height * PT_TO_PX,  // 540
});

/** Slide dimensions in inches (for PPTX layout) */
export const SLIDE_IN = Object.freeze({
  width: SLIDE_PX.width / PX_PER_IN,   // 10
  height: SLIDE_PX.height / PX_PER_IN, // 5.625
});

/** Device scale factor for high-DPI screenshots (2× = 1920×1080 actual pixels) */
export const SCREENSHOT_SCALE = 2;
