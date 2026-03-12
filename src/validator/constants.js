export const FRAME_PT = { width: 720, height: 405 };
export const PT_TO_PX = 96 / 72;
export const FRAME_PX = {
  width: FRAME_PT.width * PT_TO_PX,
  height: FRAME_PT.height * PT_TO_PX,
};
export const SLIDE_FILE_PATTERN = /^slide-.*\.html$/i;
export const TEXT_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,li';
export const TOLERANCE_PX = 0.5;
export const DEFAULT_SLIDES_DIR = 'slides';
