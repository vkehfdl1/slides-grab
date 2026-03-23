// editor-utils.js — Helper functions

import { state, DEFAULT_MODELS, slideStates, runsById, directSaveStateBySlide } from './editor-state.js';
import { statusMsg, modelSelect } from './editor-dom.js';

export function setStatus(message) {
  statusMsg.textContent = message;
}

export function currentSlideFile() {
  return state.slides[state.currentIndex] || null;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function getDirectSaveState(slide) {
  if (!directSaveStateBySlide.has(slide)) {
    directSaveStateBySlide.set(slide, {
      timer: null,
      pendingHtml: '',
      pendingMessage: '',
      chain: Promise.resolve(),
    });
  }
  return directSaveStateBySlide.get(slide);
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTime(iso) {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function randomId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function normalizeModelName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeHexColor(value, fallback = '#111111') {
  if (typeof value !== 'string') return fallback;
  const hexMatch = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    return `#${hexMatch[1].toLowerCase()}`;
  }

  const rgbMatch = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) return fallback;
  const toHex = (part) => Number(part).toString(16).padStart(2, '0');
  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
}

export function parsePixelValue(value, fallback = 24) {
  const parsed = Number.parseFloat(String(value || '').replace('px', ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
}

export function isBoldFontWeight(value) {
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) return numeric >= 600;
  return /bold/i.test(String(value || ''));
}

export function loadSavedModel() {
  try {
    return normalizeModelName(window.localStorage.getItem('slides-grab-editor-model'));
  } catch {
    return '';
  }
}

export function saveSelectedModel(model) {
  try {
    window.localStorage.setItem('slides-grab-editor-model', model);
  } catch {
    // ignore
  }
}

export function setModelOptions(models, preferredModel = '') {
  const list = Array.isArray(models)
    ? models
      .map((name) => normalizeModelName(name))
      .filter((name) => name !== '')
    : [];
  const uniqueModels = Array.from(new Set(list));

  state.availableModels = uniqueModels.length > 0 ? uniqueModels : DEFAULT_MODELS.slice();

  const preferred = normalizeModelName(preferredModel);
  const saved = loadSavedModel();

  if (state.availableModels.includes(preferred)) {
    state.selectedModel = preferred;
  } else if (state.availableModels.includes(saved)) {
    state.selectedModel = saved;
  } else {
    state.selectedModel = state.availableModels[0];
  }

  state.defaultModel = state.selectedModel;

  modelSelect.innerHTML = state.availableModels
    .map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join('');
  modelSelect.value = state.selectedModel;
  saveSelectedModel(state.selectedModel);
}

export async function loadModelOptions() {
  const saved = loadSavedModel();

  try {
    const res = await fetch('/api/models');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const payload = await res.json();
    const serverModels = Array.isArray(payload.models) ? payload.models : [];
    const serverDefault = normalizeModelName(payload.defaultModel);

    setModelOptions(serverModels, saved || serverDefault);
  } catch {
    setModelOptions(DEFAULT_MODELS, saved);
  }
}

export function normalizeBoxStatus(status) {
  return status === 'review' ? 'review' : 'pending';
}

export function getSlideState(slide) {
  if (!slideStates.has(slide)) {
    slideStates.set(slide, {
      prompt: '',
      model: state.defaultModel,
      messages: [],
      boxes: [],
      selectedBoxId: null,
      selectedObjectXPath: '',
    });
  }
  return slideStates.get(slide);
}

export function isTextInput(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el.type || '').toLowerCase();
    return !type || type === 'text' || type === 'number' || type === 'search'
      || type === 'url' || type === 'email' || type === 'tel' || type === 'password';
  }
  return el.isContentEditable === true;
}

export function getLatestRunForSlide(slide) {
  const runs = Array.from(runsById.values())
    .filter((run) => run.slide === slide)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return runs[0] || null;
}
