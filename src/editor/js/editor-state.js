// editor-state.js — State variables, constants, Maps/Sets

// Default slide dimensions — updated dynamically per slide content
export let SLIDE_W = 960;
export let SLIDE_H = 540;

export function setSlideSize(w, h) {
  SLIDE_W = w;
  SLIDE_H = h;
}
export const TOOL_MODE_DRAW = 'draw';
export const TOOL_MODE_SELECT = 'select';
export const POPOVER_TEXT = 'text';
export const POPOVER_TEXT_COLOR = 'text-color';
export const POPOVER_BG_COLOR = 'bg-color';
export const POPOVER_SIZE = 'size';
export const DEFAULT_MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'gpt-4o', 'o4-mini'];
export const DIRECT_TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);
export const NON_SELECTABLE_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'noscript']);

export const slideStates = new Map();
export const activeRunBySlide = new Map();
export const pendingRequestBySlide = new Set();
export const runsById = new Map();
export const directSaveStateBySlide = new Map();
export const localFileUpdateBySlide = new Map();

export const state = {
  slides: [],
  currentIndex: 0,
  drawStart: null,
  drawing: false,
  availableModels: DEFAULT_MODELS.slice(),
  defaultModel: DEFAULT_MODELS[0],
  selectedModel: DEFAULT_MODELS[0],
  toolMode: TOOL_MODE_DRAW,
  hoveredObjectXPath: '',
  deckName: '',
};

export const creationState = {
  active: false,
  generating: false,
  runId: null,
  packId: 'auto',
};
