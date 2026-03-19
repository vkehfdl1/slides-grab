// editor-navigation.js — Slide navigation (goToSlide, persistDraft)

import { state } from './editor-state.js';
import {
  slideIframe, slideCounter, btnPrev, btnNext, sessionFileChip,
  promptInput, modelSelect, slideSkeleton,
} from './editor-dom.js';
import { currentSlideFile, getSlideState, normalizeModelName, setStatus } from './editor-utils.js';
import { renderChatMessages } from './editor-chat.js';
import { renderBboxes, scaleSlide } from './editor-bbox.js';
import { renderObjectSelection, updateObjectEditorControls } from './editor-select.js';
import { flushDirectSaveForSlide } from './editor-direct-edit.js';
import { updateSendState } from './editor-send.js';
import { updateActiveThumbnail } from './editor-thumbnails.js';

export function persistCurrentSlideDraft() {
  const slide = currentSlideFile();
  if (!slide) return;
  const ss = getSlideState(slide);
  ss.prompt = promptInput.value;
  ss.model = normalizeModelName(modelSelect.value) || ss.model || state.defaultModel;
}

export async function goToSlide(index) {
  if (index < 0 || index >= state.slides.length) return;

  const previousSlide = currentSlideFile();
  persistCurrentSlideDraft();
  if (previousSlide) {
    await flushDirectSaveForSlide(previousSlide);
  }

  state.currentIndex = index;
  const slide = currentSlideFile();

  // Show loading skeleton
  if (slideSkeleton) slideSkeleton.classList.add('visible');

  slideIframe.src = `/slides/${slide}`;
  if (sessionFileChip) sessionFileChip.textContent = slide;
  slideCounter.textContent = `${state.currentIndex + 1} / ${state.slides.length}`;
  btnPrev.disabled = state.currentIndex === 0;
  btnNext.disabled = state.currentIndex === state.slides.length - 1;

  const ss = getSlideState(slide);
  if (!state.availableModels.includes(normalizeModelName(ss.model))) {
    ss.model = state.defaultModel;
  }
  state.selectedModel = ss.model;
  modelSelect.value = state.selectedModel;
  promptInput.value = ss.prompt || '';
  state.hoveredObjectXPath = '';
  renderChatMessages();
  renderBboxes();
  renderObjectSelection();
  updateObjectEditorControls();
  updateSendState();
  updateActiveThumbnail(index);
  setStatus(`Loaded ${slide}`);
}
