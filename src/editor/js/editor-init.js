// editor-init.js — Entry point: imports, event bindings, init()

import { state, TOOL_MODE_DRAW, TOOL_MODE_SELECT, DEFAULT_RESOLUTIONS } from './editor-state.js';
import {
  btnPrev, btnNext, slideIframe, drawLayer, promptInput, modelSelect, resolutionSelect,
  btnSend, btnClearBboxes, slideCounter,
  toggleBold, toggleItalic, toggleUnderline, toggleStrike,
  alignLeft, alignCenter, alignRight,
  popoverTextInput, popoverApplyText, popoverTextColorInput, popoverBgColorInput,
  popoverSizeInput, popoverApplySize, toolModeDrawBtn, toolModeSelectBtn,
} from './editor-dom.js';
import {
  currentSlideFile, getSlideState, normalizeModelName, setStatus,
  saveSelectedModel, loadModelOptions, clamp,
} from './editor-utils.js';
import { renderChatMessages } from './editor-chat.js';
import {
  onBboxChange, renderBboxes, scaleSlide, startDrawing, moveDrawing, endDrawing,
  clearBboxesForCurrentSlide, initBboxLayerEvents, getXPath,
} from './editor-bbox.js';
import {
  setToolMode, updateToolModeUI, renderObjectSelection, updateObjectEditorControls,
  getSelectedObjectElement, setSelectedObjectXPath, updateHoveredObjectFromPointer,
  clearHoveredObject, getSelectableTargetAt, readSelectedObjectStyleState,
} from './editor-select.js';
import {
  mutateSelectedObject, applyTextDecorationToken,
} from './editor-direct-edit.js';
import { updateSendState, applyChanges } from './editor-send.js';
import { goToSlide } from './editor-navigation.js';
import { connectSSE, loadRunsInitial } from './editor-sse.js';

// Late-binding: connect bbox changes to updateSendState
onBboxChange(updateSendState);

function normalizeWorkspaceResolution(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return DEFAULT_RESOLUTIONS.includes(normalized) ? normalized : '';
}

function applyWorkspaceInfo(workspace = null) {
  const nextResolution = normalizeWorkspaceResolution(workspace?.resolution);
  state.workspaceResolution = nextResolution;
  resolutionSelect.value = nextResolution;
}

function formatReadyStatus() {
  const resolutionLabel = state.workspaceResolution || 'default';
  return `Ready. Model: ${state.selectedModel}. Workspace resolution: ${resolutionLabel}. Draw red pending bboxes, run Codex, then review green bboxes.`;
}

let resolutionUpdateToken = 0;

async function updateWorkspaceResolution() {
  const previousResolution = state.workspaceResolution;
  const nextResolution = normalizeWorkspaceResolution(resolutionSelect.value);

  const token = ++resolutionUpdateToken;
  resolutionSelect.disabled = true;
  setStatus(`Applying workspace resolution: ${nextResolution || 'default'}...`);

  try {
    const response = await fetch('/api/workspace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resolution: nextResolution }),
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json();
        if (typeof payload?.error === 'string' && payload.error.trim() !== '') {
          message = payload.error.trim();
        }
      } catch {
        // ignore response parse errors
      }
      throw new Error(message);
    }

    const payload = await response.json();
    if (token !== resolutionUpdateToken) return;

    applyWorkspaceInfo(payload);
    scaleSlide();
    setStatus(`Workspace resolution updated: ${state.workspaceResolution || 'default'}.`);
  } catch (error) {
    if (token !== resolutionUpdateToken) return;
    resolutionSelect.value = previousResolution;
    setStatus(`Failed to update workspace resolution: ${error.message}`);
  } finally {
    if (token === resolutionUpdateToken) {
      resolutionSelect.disabled = false;
    }
  }
}

// Bbox layer events
initBboxLayerEvents();

// Navigation
btnPrev.addEventListener('click', () => { void goToSlide(state.currentIndex - 1); });
btnNext.addEventListener('click', () => { void goToSlide(state.currentIndex + 1); });

// Tool modes
toolModeDrawBtn.addEventListener('click', () => setToolMode(TOOL_MODE_DRAW));
toolModeSelectBtn.addEventListener('click', () => setToolMode(TOOL_MODE_SELECT));

// Clear bboxes
btnClearBboxes.addEventListener('click', clearBboxesForCurrentSlide);

// Drawing
drawLayer.addEventListener('mousedown', startDrawing);
drawLayer.addEventListener('mousemove', (event) => {
  if (state.toolMode !== TOOL_MODE_SELECT) return;
  updateHoveredObjectFromPointer(event.clientX, event.clientY);
});
drawLayer.addEventListener('mouseleave', clearHoveredObject);
drawLayer.addEventListener('click', (event) => {
  if (state.toolMode !== TOOL_MODE_SELECT) return;
  const target = getSelectableTargetAt(event.clientX, event.clientY);
  if (!target) {
    setSelectedObjectXPath('', 'No selectable object at this point.');
    return;
  }

  const xpath = getXPath(target);
  setSelectedObjectXPath(xpath, `Object selected on ${currentSlideFile()}.`);
});
window.addEventListener('mousemove', moveDrawing);
window.addEventListener('mouseup', endDrawing);

// Send
btnSend.addEventListener('click', applyChanges);

// Model select
modelSelect.addEventListener('change', () => {
  const nextModel = normalizeModelName(modelSelect.value);
  if (!state.availableModels.includes(nextModel)) {
    modelSelect.value = state.selectedModel;
    return;
  }

  const slide = currentSlideFile();
  if (slide) {
    const ss = getSlideState(slide);
    ss.model = nextModel;
  }
  state.selectedModel = nextModel;
  state.defaultModel = nextModel;
  saveSelectedModel(state.selectedModel);
  updateSendState();
  setStatus(`Model selected: ${state.selectedModel}`);
});

resolutionSelect.addEventListener('change', () => {
  void updateWorkspaceResolution();
});

// Prompt input
promptInput.addEventListener('input', () => {
  const slide = currentSlideFile();
  if (slide) {
    const ss = getSlideState(slide);
    ss.prompt = promptInput.value;
  }
  updateSendState();
});

// Text editing
popoverApplyText.addEventListener('click', () => {
  if (popoverApplyText.disabled) return;
  mutateSelectedObject((el) => {
    const escaped = popoverTextInput.value
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    el.innerHTML = escaped.replace(/\n/g, '<br>');
  }, 'Object text updated and saved.', { delay: 120 });
});

popoverApplySize.addEventListener('click', () => {
  if (popoverApplySize.disabled) return;
  const size = clamp(Number.parseInt(popoverSizeInput.value || '24', 10) || 24, 8, 180);
  mutateSelectedObject((el) => {
    el.style.fontSize = `${size}px`;
  }, 'Object font size updated and saved.');
});

popoverTextInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    popoverApplyText.click();
  }
});

popoverSizeInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    popoverApplySize.click();
  }
});

popoverTextColorInput.addEventListener('input', () => {
  if (popoverTextColorInput.disabled) return;
  mutateSelectedObject((el) => {
    el.style.color = popoverTextColorInput.value;
  }, 'Text color updated.', { delay: 300 });
});

popoverBgColorInput.addEventListener('input', () => {
  if (popoverBgColorInput.disabled) return;
  mutateSelectedObject((el) => {
    el.style.backgroundColor = popoverBgColorInput.value;
  }, 'Background color updated.', { delay: 300 });
});

function hasEditableFocus() {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  if (activeElement.matches('input, textarea, select')) return true;
  return activeElement.isContentEditable;
}

// Style toggles
toggleBold.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    const nextBold = !readSelectedObjectStyleState(el).bold;
    el.style.fontWeight = nextBold ? '700' : '400';
  }, 'Object font weight updated and saved.');
});

toggleItalic.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    const nextItalic = !readSelectedObjectStyleState(el).italic;
    el.style.fontStyle = nextItalic ? 'italic' : 'normal';
  }, 'Object font style updated and saved.');
});

toggleUnderline.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    const nextUnderline = !readSelectedObjectStyleState(el).underline;
    applyTextDecorationToken(el, 'underline', nextUnderline);
  }, 'Object underline updated and saved.');
});

toggleStrike.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    const nextStrike = !readSelectedObjectStyleState(el).strike;
    applyTextDecorationToken(el, 'line-through', nextStrike);
  }, 'Object strikethrough updated and saved.');
});

// Alignment
alignLeft.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    el.style.textAlign = 'left';
  }, 'Object alignment updated and saved.');
});

alignCenter.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    el.style.textAlign = 'center';
  }, 'Object alignment updated and saved.');
});

alignRight.addEventListener('click', () => {
  mutateSelectedObject((el) => {
    el.style.textAlign = 'right';
  }, 'Object alignment updated and saved.');
});

// Global keyboard
document.addEventListener('keydown', (event) => {
  const inEditableField = hasEditableFocus();

  if (state.toolMode === TOOL_MODE_SELECT && (event.ctrlKey || event.metaKey) && !inEditableField) {
    const key = event.key.toLowerCase();
    if (key === 'b') { event.preventDefault(); if (!toggleBold.disabled) toggleBold.click(); return; }
    if (key === 'i') { event.preventDefault(); if (!toggleItalic.disabled) toggleItalic.click(); return; }
    if (key === 'u') { event.preventDefault(); if (!toggleUnderline.disabled) toggleUnderline.click(); return; }
  }

  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    applyChanges();
    return;
  }

  if (event.key === 'Escape') {
    if (document.activeElement) document.activeElement.blur();
    return;
  }

  if (inEditableField) return;

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    void goToSlide(state.currentIndex - 1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    void goToSlide(state.currentIndex + 1);
  }
});

// Resize
window.addEventListener('resize', scaleSlide);

// Iframe load
slideIframe.addEventListener('load', () => {
  const slide = currentSlideFile();
  if (slide) {
    const ss = getSlideState(slide);
    if (ss.selectedObjectXPath && !getSelectedObjectElement(slide)) {
      ss.selectedObjectXPath = '';
    }
  }
  state.hoveredObjectXPath = '';
  renderBboxes();
  renderObjectSelection();
  updateObjectEditorControls();
  updateSendState();
});

// Init
async function init() {
  setStatus('Loading slide list...');

  try {
    const [slidesResponse, workspaceResponse] = await Promise.all([
      fetch('/api/slides'),
      fetch('/api/workspace').catch(() => null),
    ]);

    if (!slidesResponse.ok) {
      throw new Error(`Failed to fetch slide list: ${slidesResponse.status}`);
    }

    state.slides = await slidesResponse.json();
    const workspace = workspaceResponse?.ok ? await workspaceResponse.json() : null;
    applyWorkspaceInfo(workspace);

    if (state.slides.length === 0) {
      setStatus('No slides found.');
      slideCounter.textContent = '0 / 0';
      return;
    }

    await loadModelOptions();
    updateToolModeUI();
    await goToSlide(0);
    scaleSlide();
    await loadRunsInitial();
    connectSSE();

    setStatus(formatReadyStatus());
  } catch (error) {
    setStatus(`Error loading slides: ${error.message}`);
    console.error('Init error:', error);
  }
}

init();
