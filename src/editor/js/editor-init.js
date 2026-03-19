// editor-init.js — Entry point: imports, event bindings, init()

import { state, TOOL_MODE_DRAW, TOOL_MODE_SELECT, setSlideSize } from './editor-state.js';
import {
  btnPrev, btnNext, slideIframe, drawLayer, promptInput, modelSelect,
  btnSend, btnClearBboxes, slideCounter, btnPdfExport, btnSvgExport,
  toggleBold, toggleItalic, toggleUnderline, toggleStrike,
  alignLeft, alignCenter, alignRight,
  popoverTextInput, popoverApplyText, popoverTextColorInput, popoverBgColorInput,
  popoverSizeInput, popoverApplySize, toolModeDrawBtn, toolModeSelectBtn,
  btnNewDeck,
  slideStrip, btnExportToggle, exportDropdown,
  slideSkeleton, bboxEmptyGuide, shortcutsModal, shortcutsClose, btnShortcuts,
  sidebarToggle, editorSidebar, btnSendLabel,
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
import { openExportModal } from './editor-svg-export.js';
import { openPdfExportModal } from './editor-pdf-export.js';
import './editor-figma-export.js';
import { showCreationMode, hideCreationMode, loadCreationModelOptions, checkCreateMode } from './editor-create.js';
import { showOutlinePhase } from './editor-outline.js';
import { renderThumbnailStrip, updateActiveThumbnail } from './editor-thumbnails.js';

// Late-binding: connect bbox changes to updateSendState
onBboxChange(updateSendState);

// Bbox layer events
initBboxLayerEvents();

// Navigation
btnPrev.addEventListener('click', () => { void goToSlide(state.currentIndex - 1); });
btnNext.addEventListener('click', () => { void goToSlide(state.currentIndex + 1); });

// Tool modes
toolModeDrawBtn.addEventListener('click', () => setToolMode(TOOL_MODE_DRAW));
toolModeSelectBtn.addEventListener('click', () => setToolMode(TOOL_MODE_SELECT));

// PDF Export
btnPdfExport.addEventListener('click', openPdfExportModal);

// SVG Export
btnSvgExport.addEventListener('click', openExportModal);

// New Deck — switch to creation mode
if (btnNewDeck) {
  btnNewDeck.addEventListener('click', async () => {
    showCreationMode();
    await loadCreationModelOptions();
  });
}

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
  const inPromptField = document.activeElement === promptInput;

  if (state.toolMode === TOOL_MODE_SELECT && (event.ctrlKey || event.metaKey) && !inPromptField) {
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
    // Close shortcuts modal if open
    if (shortcutsModal && !shortcutsModal.hidden) {
      shortcutsModal.hidden = true;
      return;
    }
    if (document.activeElement) document.activeElement.blur();
    return;
  }

  if (inPromptField) return;

  // ? key for shortcuts
  if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    toggleShortcutsModal();
    return;
  }

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

// Thumbnail strip click
if (slideStrip) {
  slideStrip.addEventListener('click', (event) => {
    const thumb = event.target.closest('.slide-thumb');
    if (!thumb) return;
    const idx = parseInt(thumb.dataset.index, 10);
    if (!isNaN(idx)) void goToSlide(idx);
  });
}

// Export dropdown toggle
if (btnExportToggle && exportDropdown) {
  btnExportToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = exportDropdown.classList.toggle('open');
    btnExportToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  document.addEventListener('click', () => {
    exportDropdown.classList.remove('open');
    btnExportToggle.setAttribute('aria-expanded', 'false');
  });
}

// Keyboard shortcuts modal
function toggleShortcutsModal() {
  if (!shortcutsModal) return;
  const isHidden = shortcutsModal.hidden;
  shortcutsModal.hidden = !isHidden;
}
if (btnShortcuts) btnShortcuts.addEventListener('click', toggleShortcutsModal);
if (shortcutsClose) shortcutsClose.addEventListener('click', () => { if (shortcutsModal) shortcutsModal.hidden = true; });
if (shortcutsModal) {
  shortcutsModal.addEventListener('click', (event) => {
    if (event.target === shortcutsModal) shortcutsModal.hidden = true;
  });
}

// Sidebar toggle
if (sidebarToggle && editorSidebar) {
  const savedState = localStorage.getItem('sidebar-collapsed');
  if (savedState === 'true') editorSidebar.classList.add('collapsed');

  sidebarToggle.addEventListener('click', () => {
    const isCollapsed = editorSidebar.classList.toggle('collapsed');
    sidebarToggle.innerHTML = isCollapsed ? '&#9656;' : '&#9666;';
    localStorage.setItem('sidebar-collapsed', isCollapsed ? 'true' : 'false');
    // Recalculate slide scale after sidebar resize
    setTimeout(scaleSlide, 200);
  });
}

// Prompt textarea auto-grow
if (promptInput) {
  const sidebarTextarea = document.querySelector('.sidebar-textarea');
  if (sidebarTextarea) {
    sidebarTextarea.addEventListener('input', () => {
      sidebarTextarea.style.height = 'auto';
      sidebarTextarea.style.height = Math.min(sidebarTextarea.scrollHeight, 200) + 'px';
    });
  }
}

// Run button dynamic label
function updateRunButtonLabel() {
  if (!btnSendLabel) return;
  const model = normalizeModelName(modelSelect?.value || '');
  if (model.startsWith('claude-')) {
    btnSendLabel.textContent = 'Run Claude';
  } else if (model.startsWith('gpt-')) {
    btnSendLabel.textContent = 'Run Codex';
  } else {
    btnSendLabel.textContent = 'Run';
  }
}
modelSelect?.addEventListener('change', updateRunButtonLabel);

// Iframe load — detect content size and adapt wrapper/iframe dimensions
slideIframe.addEventListener('load', () => {
  try {
    const doc = slideIframe.contentDocument;
    if (doc && doc.body) {
      const body = doc.body;
      const cs = doc.defaultView.getComputedStyle(body);
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      const wrapper = document.getElementById('slide-wrapper');
      if (w > 0 && h > 0) {
        setSlideSize(w, h);
        wrapper.style.width = `${w}px`;
        wrapper.style.height = `${h}px`;
        slideIframe.style.width = `${w}px`;
        slideIframe.style.height = `${h}px`;
      } else {
        // Reset to default
        setSlideSize(960, 540);
        wrapper.style.width = '960px';
        wrapper.style.height = '540px';
        slideIframe.style.width = '960px';
        slideIframe.style.height = '540px';
      }
    }
  } catch { /* cross-origin or no content */ }

  scaleSlide();

  // Hide loading skeleton
  if (slideSkeleton) slideSkeleton.classList.remove('visible');

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
    const res = await fetch('/api/slides');
    if (!res.ok) {
      throw new Error(`Failed to fetch slide list: ${res.status}`);
    }

    state.slides = await res.json();

    // Enter creation mode if: server is in create mode, or no slides exist
    const isCreateMode = await checkCreateMode();
    if (isCreateMode || state.slides.length === 0) {
      showCreationMode();
      await loadCreationModelOptions();
      connectSSE();

      // Auto-load outline if one exists in the deck
      try {
        const outlineRes = await fetch('/api/outline');
        if (outlineRes.ok) {
          const outline = await outlineRes.json();
          showOutlinePhase(outline);
          setStatus('Outline loaded. Review and provide feedback.');
          return;
        }
      } catch { /* no outline */ }

      setStatus('Enter a topic to generate slides.');
      return;
    }

    await loadModelOptions();
    updateToolModeUI();
    renderThumbnailStrip();
    await goToSlide(0);
    scaleSlide();
    await loadRunsInitial();
    connectSSE();
    updateRunButtonLabel();

    setStatus(`Ready. Model: ${state.selectedModel}. Draw red pending bboxes, run Codex, then review green bboxes.`);
  } catch (error) {
    setStatus(`Error loading slides: ${error.message}`);
    console.error('Init error:', error);
  }
}

init();
