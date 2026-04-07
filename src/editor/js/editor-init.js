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
  slideStrip, btnExportToggle, exportDropdown, btnReviewOutline, btnReviewDeck,
  slideSkeleton, bboxEmptyGuide, shortcutsModal, shortcutsClose, btnShortcuts,
  sidebarToggle, editorSidebar, btnSendLabel,
  themeToggle,
  btnDuplicateSlide, btnDeleteSlide,
  deleteSlideModal, deleteSlideName, deleteSlideCancel, deleteSlideConfirm,
  btnPresent,
} from './editor-dom.js';
import {
  currentSlideFile, getSlideState, normalizeModelName, setStatus,
  saveSelectedModel, loadModelOptions, clamp, isTextInput,
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
  mutateSelectedObject, applyTextDecorationToken, serializeSlideDocument, persistDirectSlideHtml,
} from './editor-direct-edit.js';
import { undo, redo, pushSnapshot, setRestoring } from './editor-history.js';
import { updateSendState, applyChanges } from './editor-send.js';
import { goToSlide } from './editor-navigation.js';
import { connectSSE, loadRunsInitial } from './editor-sse.js';
import { openExportModal } from './editor-svg-export.js';
import { openPdfExportModal } from './editor-pdf-export.js';
import { openPptxExportModal } from './editor-pptx-export.js';
import { openLogoSettingsModal } from './editor-logo.js';
import './editor-figma-export.js';
import { showCreationMode, hideCreationMode, loadCreationModelOptions, checkCreateMode, loadImportModelOptions, switchToImportTab, submitImport, submitDocImport, showPlanLoading } from './editor-create.js';
import { showOutlinePhase } from './editor-outline.js';
import { renderThumbnailStrip, updateActiveThumbnail } from './editor-thumbnails.js';
import { loadPacks } from './editor-pack.js';
import { initNotesPanel, loadNotes } from './editor-notes.js';
import { enterPresentationMode, exitPresentationMode, isPresenting } from './editor-present.js';

// Late-binding: connect bbox changes to updateSendState
onBboxChange(updateSendState);

// Bbox layer events
initBboxLayerEvents();

// Navigation
btnPrev.addEventListener('click', () => { void goToSlide(state.currentIndex - 1); });
btnNext.addEventListener('click', () => { void goToSlide(state.currentIndex + 1); });

// ── Slide duplicate / delete ──────────────────────────────────────
async function duplicateCurrentSlide() {
  const slide = currentSlideFile();
  if (!slide) return;
  setStatus(`Duplicating ${slide}...`);
  try {
    const res = await fetch(`/api/slides/${encodeURIComponent(slide)}/duplicate`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setStatus(`Duplicate failed: ${err.error}`);
      return;
    }
    const data = await res.json();
    state.slides = data.slides;
    renderThumbnailStrip();
    await goToSlide(data.insertIndex);
    setStatus(`Duplicated as ${data.duplicatedAs}`);
  } catch (err) {
    setStatus(`Duplicate failed: ${err.message}`);
  }
}

async function deleteCurrentSlide() {
  const slide = currentSlideFile();
  if (!slide) return;
  if (state.slides.length <= 1) {
    setStatus('Cannot delete the last remaining slide.');
    return;
  }
  setStatus(`Deleting ${slide}...`);
  try {
    const res = await fetch(`/api/slides/${encodeURIComponent(slide)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      setStatus(`Delete failed: ${err.error}`);
      return;
    }
    const data = await res.json();
    state.slides = data.slides;
    renderThumbnailStrip();
    const nextIndex = Math.min(state.currentIndex, state.slides.length - 1);
    await goToSlide(nextIndex);
    setStatus(`Deleted ${data.deleted}. ${state.slides.length} slides remaining.`);
  } catch (err) {
    setStatus(`Delete failed: ${err.message}`);
  }
}

function openDeleteSlideModal() {
  const slide = currentSlideFile();
  if (!slide || state.slides.length <= 1) return;
  if (deleteSlideModal && deleteSlideName) {
    deleteSlideName.textContent = slide;
    deleteSlideModal.hidden = false;
  }
}

if (btnDuplicateSlide) {
  btnDuplicateSlide.addEventListener('click', duplicateCurrentSlide);
}

if (btnDeleteSlide) {
  btnDeleteSlide.addEventListener('click', openDeleteSlideModal);
}

if (deleteSlideModal) {
  if (deleteSlideCancel) {
    deleteSlideCancel.addEventListener('click', () => { deleteSlideModal.hidden = true; });
  }
  if (deleteSlideConfirm) {
    deleteSlideConfirm.addEventListener('click', async () => {
      deleteSlideModal.hidden = true;
      await deleteCurrentSlide();
    });
  }
  deleteSlideModal.addEventListener('click', (e) => {
    if (e.target === deleteSlideModal) deleteSlideModal.hidden = true;
  });
}

// Tool modes
toolModeDrawBtn.addEventListener('click', () => setToolMode(TOOL_MODE_DRAW));
toolModeSelectBtn.addEventListener('click', () => setToolMode(TOOL_MODE_SELECT));

// PDF Export
btnPdfExport.addEventListener('click', openPdfExportModal);

// SVG Export
btnSvgExport.addEventListener('click', openExportModal);

// PPTX Export
const btnPptxExport = document.querySelector('#btn-pptx-export');
if (btnPptxExport) btnPptxExport.addEventListener('click', openPptxExportModal);

// Presentation mode
if (btnPresent) {
  btnPresent.addEventListener('click', () => { void enterPresentationMode(); });
}

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
  }, 'Text color updated.', { delay: 300, skipSnapshot: true });
});
popoverTextColorInput.addEventListener('change', () => {
  if (popoverTextColorInput.disabled) return;
  mutateSelectedObject((el) => {
    el.style.color = popoverTextColorInput.value;
  }, 'Text color updated.');
});

popoverBgColorInput.addEventListener('input', () => {
  if (popoverBgColorInput.disabled) return;
  mutateSelectedObject((el) => {
    el.style.backgroundColor = popoverBgColorInput.value;
  }, 'Background color updated.', { delay: 300, skipSnapshot: true });
});
popoverBgColorInput.addEventListener('change', () => {
  if (popoverBgColorInput.disabled) return;
  mutateSelectedObject((el) => {
    el.style.backgroundColor = popoverBgColorInput.value;
  }, 'Background color updated.');
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

// Global keyboard — use event.code for IME-safe matching (works with Korean input)
function codeIs(event, code) { return event.code === code; }

document.addEventListener('keydown', (event) => {
  // Presentation mode owns keyboard when active
  if (isPresenting()) return;

  // F5 to enter presentation mode
  if (event.key === 'F5') {
    event.preventDefault();
    void enterPresentationMode();
    return;
  }

  const inTextField = isTextInput(document.activeElement);
  const ctrl = event.ctrlKey || event.metaKey;

  // Ctrl+B/I/U — Select mode text styling
  if (state.toolMode === TOOL_MODE_SELECT && ctrl && !inTextField) {
    if (codeIs(event, 'KeyB')) { event.preventDefault(); if (!toggleBold.disabled) toggleBold.click(); return; }
    if (codeIs(event, 'KeyI')) { event.preventDefault(); if (!toggleItalic.disabled) toggleItalic.click(); return; }
    if (codeIs(event, 'KeyU')) { event.preventDefault(); if (!toggleUnderline.disabled) toggleUnderline.click(); return; }
  }

  // Ctrl+Shift+D — Duplicate slide
  if (ctrl && event.shiftKey && codeIs(event, 'KeyD') && !inTextField) {
    event.preventDefault();
    duplicateCurrentSlide();
    return;
  }

  if (ctrl && event.key === 'Enter') {
    event.preventDefault();
    applyChanges();
    return;
  }

  // Undo / Redo — available even outside text fields
  if (ctrl && !inTextField) {
    if (codeIs(event, 'KeyZ') && !event.shiftKey) {
      event.preventDefault();
      const slide = currentSlideFile();
      if (slide) {
        const html = undo(slide);
        if (html) {
          setRestoring(true);
          slideIframe.contentDocument.open();
          slideIframe.contentDocument.write(html);
          slideIframe.contentDocument.close();
          setRestoring(false);
          void persistDirectSlideHtml(slide, html, 'Undo applied.');
        }
      }
      return;
    }
    if ((codeIs(event, 'KeyZ') && event.shiftKey) || codeIs(event, 'KeyY')) {
      event.preventDefault();
      const slide = currentSlideFile();
      if (slide) {
        const html = redo(slide);
        if (html) {
          setRestoring(true);
          slideIframe.contentDocument.open();
          slideIframe.contentDocument.write(html);
          slideIframe.contentDocument.close();
          setRestoring(false);
          void persistDirectSlideHtml(slide, html, 'Redo applied.');
        }
      }
      return;
    }
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

  if (inTextField) return;

  // Backspace / Delete — open delete slide confirmation
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    openDeleteSlideModal();
    return;
  }

  // ? key for shortcuts (Shift+/ on most layouts)
  if ((event.key === '?' || (event.shiftKey && codeIs(event, 'Slash'))) && !ctrl) {
    event.preventDefault();
    toggleShortcutsModal();
    return;
  }

  // Tool mode shortcuts (IME-safe via event.code)
  if (codeIs(event, 'KeyD')) {
    event.preventDefault();
    setToolMode(TOOL_MODE_DRAW);
    return;
  }
  if (codeIs(event, 'KeyS')) {
    event.preventDefault();
    setToolMode(TOOL_MODE_SELECT);
    return;
  }

  if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    event.preventDefault();
    void goToSlide(state.currentIndex - 1);
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    event.preventDefault();
    void goToSlide(state.currentIndex + 1);
    return;
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
  document.addEventListener('click', (event) => {
    if (event.target.closest('.export-dropdown-wrapper')) return;
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

// Sidebar toggle (right chat sidebar)
if (sidebarToggle && editorSidebar) {
  const savedState = localStorage.getItem('sidebar-collapsed');
  if (savedState === 'true') editorSidebar.classList.add('collapsed');

  sidebarToggle.addEventListener('click', () => {
    const isCollapsed = editorSidebar.classList.toggle('collapsed');
    sidebarToggle.textContent = isCollapsed ? '\u25c2' : '\u25b8';
    localStorage.setItem('sidebar-collapsed', isCollapsed ? 'true' : 'false');
    // Recalculate slide scale after sidebar transition completes
    editorSidebar.addEventListener('transitionend', scaleSlide, { once: true });
  });
}

// Slide sidebar toggle (left thumbnail sidebar)
{
  const slideSidebar = document.getElementById('slide-sidebar');
  const slideSidebarToggle = document.getElementById('slide-sidebar-toggle');
  if (slideSidebar && slideSidebarToggle) {
    const savedState = localStorage.getItem('slide-sidebar-collapsed');
    if (savedState === 'true') slideSidebar.classList.add('collapsed');

    const handleToggle = () => {
      const isCollapsed = slideSidebar.classList.toggle('collapsed');
      localStorage.setItem('slide-sidebar-collapsed', isCollapsed ? 'true' : 'false');
      slideSidebar.addEventListener('transitionend', scaleSlide, { once: true });
    };

    slideSidebarToggle.addEventListener('click', handleToggle);
  }
}

// Theme toggle
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sg-theme', next);
  });
}
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
  if (!localStorage.getItem('sg-theme')) {
    document.documentElement.setAttribute('data-theme', e.matches ? 'light' : 'dark');
  }
});

// ── Logo settings ──
const logoBtn = document.getElementById('btn-logo-settings');
if (logoBtn) logoBtn.addEventListener('click', () => openLogoSettingsModal());

// ── Retheme modal ──
const rethemeBtn = document.getElementById('btn-retheme');
const rethemeModal = document.getElementById('retheme-modal');
const rethemePackSelect = document.getElementById('retheme-pack-select');
const rethemeSaveAs = document.getElementById('retheme-save-as');
const rethemeCancel = document.getElementById('retheme-cancel');
const rethemeConfirm = document.getElementById('retheme-confirm');

const rethemeBackupsSection = document.getElementById('retheme-backups-section');
const rethemeBackupSelect = document.getElementById('retheme-backup-select');
const rethemeRestoreBtn = document.getElementById('retheme-restore-btn');

if (rethemeBtn && rethemeModal) {
  let _rethemeDeckName = '';

  const updateRethemePlaceholder = () => {
    if (_rethemeDeckName && rethemePackSelect.value) {
      rethemeSaveAs.placeholder = `${_rethemeDeckName}-${rethemePackSelect.value}`;
    }
  };

  rethemePackSelect.addEventListener('change', updateRethemePlaceholder);

  rethemeBtn.addEventListener('click', async () => {
    rethemeSaveAs.value = '';

    // Fetch config, packs, and backups in parallel
    const [cfgRes, packsRes, backupsRes] = await Promise.all([
      fetch('/api/editor-config').catch(() => null),
      fetch('/api/packs').catch(() => null),
      rethemeBackupsSection ? fetch('/api/backups').catch(() => null) : null,
    ]);

    if (cfgRes?.ok) {
      const cfg = await cfgRes.json();
      _rethemeDeckName = cfg.deckName || '';
    }

    // Populate pack options
    if (packsRes?.ok) {
      const packs = await packsRes.json();
      rethemePackSelect.innerHTML = packs
        .map(p => `<option value="${p.id}">${p.name} (${p.templates?.length || 0} templates)</option>`)
        .join('');
    }

    updateRethemePlaceholder();

    // Load backups for "Previous versions"
    if (rethemeBackupsSection) {
      if (backupsRes?.ok) {
        const backups = await backupsRes.json();
        if (backups.length > 0) {
          rethemeBackupSelect.innerHTML = backups
            .map(b => `<option value="${b.timestamp}">${b.label} (${b.slideCount} slides)</option>`)
            .join('');
          rethemeBackupsSection.hidden = false;
        } else {
          rethemeBackupsSection.hidden = true;
        }
      } else {
        rethemeBackupsSection.hidden = true;
      }
    }

    rethemeModal.hidden = false;
  });

  rethemeCancel.addEventListener('click', () => {
    rethemeModal.hidden = true;
  });

  rethemeModal.addEventListener('click', (e) => {
    if (e.target === rethemeModal) rethemeModal.hidden = true;
  });

  rethemeConfirm.addEventListener('click', async () => {
    const packId = rethemePackSelect.value;
    if (!packId) return;

    const deckName = _rethemeDeckName;
    if (!deckName) {
      setStatus('덱 이름을 확인할 수 없습니다.');
      return;
    }

    rethemeModal.hidden = true;

    try {
      const res = await fetch('/api/retheme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckName,
          packId,
          saveAs: rethemeSaveAs.value.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setStatus(`Retheme 실패: ${err.error}`);
        return;
      }

      const data = await res.json();
      showPlanLoading(true, `Retheme: ${data.targetDeckName} → ${data.targetPack}`);
    } catch (err) {
      setStatus(`Retheme 실패: ${err.message}`);
    }
  });

  // Restore from backup
  if (rethemeRestoreBtn) {
    rethemeRestoreBtn.addEventListener('click', async () => {
      const timestamp = rethemeBackupSelect?.value;
      if (!timestamp) return;

      let deckName = '';
      try {
        const cfgRes = await fetch('/api/editor-config');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          deckName = cfg.deckName;
        }
      } catch { /* */ }

      if (!deckName) {
        setStatus('덱 이름을 확인할 수 없습니다.');
        return;
      }

      rethemeModal.hidden = true;
      setStatus(`복원 중: ${timestamp}...`);

      try {
        const res = await fetch('/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckName, timestamp }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setStatus(`복원 실패: ${err.error}`);
          return;
        }

        const data = await res.json();
        setStatus(`복원 완료: ${data.restored}개 슬라이드 (${timestamp})`);
        // Reload slides
        window.location.reload();
      } catch (err) {
        setStatus(`복원 실패: ${err.message}`);
      }
    });
  }
}

// ── Review panel ──
const reviewBtn = document.getElementById('btn-review-deck');
const reviewPanel = document.getElementById('review-panel');
const reviewClose = document.getElementById('review-close');

if (reviewBtn && reviewPanel) {
  reviewBtn.addEventListener('click', async () => {
    const reviewLoading = document.getElementById('review-loading');
    const reviewContent = document.getElementById('review-content');
    if (reviewLoading) reviewLoading.hidden = false;
    if (reviewContent) reviewContent.hidden = true;
    reviewPanel.hidden = false;

    // Get deck name
    let deckName = '';
    try {
      const cfgRes = await fetch('/api/editor-config');
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        deckName = cfg.deckName;
      }
    } catch { /* */ }

    if (!deckName) {
      if (reviewLoading) reviewLoading.textContent = '덱을 찾을 수 없습니다.';
      return;
    }

    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        if (reviewLoading) reviewLoading.textContent = `분석 실패: ${err.error}`;
        return;
      }

      const data = await res.json();
      renderReviewResult(data);
    } catch (err) {
      if (reviewLoading) reviewLoading.textContent = `분석 실패: ${err.message}`;
    }
  });

  reviewClose?.addEventListener('click', () => { reviewPanel.hidden = true; });
  reviewPanel.addEventListener('click', (e) => { if (e.target === reviewPanel) reviewPanel.hidden = true; });
}

function renderReviewResult(data) {
  const reviewLoading = document.getElementById('review-loading');
  const reviewContent = document.getElementById('review-content');
  if (reviewLoading) reviewLoading.hidden = true;
  if (reviewContent) reviewContent.hidden = false;

  const title = document.getElementById('review-title');
  if (title) title.textContent = `Review: ${data.deckName}`;

  const grade = document.getElementById('review-grade');
  if (grade) grade.textContent = `${data.grade}`;

  const scoreText = document.getElementById('review-score-text');
  if (scoreText) scoreText.textContent = `${data.score} / 100  •  ${data.slideCount} slides`;

  const barFill = document.getElementById('review-bar-fill');
  if (barFill) barFill.style.width = `${data.score}%`;

  // Categories
  const catsEl = document.getElementById('review-categories');
  if (catsEl) {
    catsEl.innerHTML = '';
    for (const [, cat] of Object.entries(data.categories || {})) {
      const div = document.createElement('div');
      div.style.cssText = 'padding: 8px 12px; background: var(--surface-1); border-radius: var(--radius); border: 1px solid var(--border);';
      const stars = Math.round(cat.score / 20);
      div.innerHTML = `<div style="font-size: 12px; color: var(--text-2);">${cat.label}</div><div style="font-size: 14px;">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)} <span style="color: var(--text-2); font-size: 12px;">(${cat.score})</span></div>`;
      catsEl.appendChild(div);
    }
  }

  // Issues
  const issuesSection = document.getElementById('review-issues-section');
  const issuesEl = document.getElementById('review-issues');
  if (issuesEl && data.issues?.length > 0) {
    if (issuesSection) issuesSection.hidden = false;
    issuesEl.innerHTML = '';
    for (const issue of data.issues) {
      const div = document.createElement('div');
      div.style.cssText = 'padding: 8px 12px; background: var(--surface-1); border-radius: var(--radius); font-size: 13px; border-left: 3px solid ' + (issue.severity === 'error' ? 'var(--danger)' : issue.severity === 'warn' ? 'var(--warn)' : 'var(--accent)') + ';';
      const loc = issue.slide ? `<strong>Slide ${issue.slide}:</strong> ` : '';
      div.innerHTML = `${loc}${issue.message}`;
      issuesEl.appendChild(div);
    }
  } else if (issuesSection) {
    issuesSection.hidden = true;
  }

  // Strengths
  const strengthsSection = document.getElementById('review-strengths-section');
  const strengthsEl = document.getElementById('review-strengths');
  if (strengthsEl && data.strengths?.length > 0) {
    if (strengthsSection) strengthsSection.hidden = false;
    strengthsEl.innerHTML = '';
    for (const s of data.strengths) {
      const div = document.createElement('div');
      div.style.cssText = 'font-size: 13px; color: var(--success);';
      div.textContent = `✓ ${s}`;
      strengthsEl.appendChild(div);
    }
  } else if (strengthsSection) {
    strengthsSection.hidden = true;
  }
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
      // Prefer .slide element dimensions (more reliable when body has no explicit size)
      const slideEl = doc.querySelector('.slide');
      const target = slideEl || body;
      const cs = doc.defaultView.getComputedStyle(target);
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

  // Push initial snapshot so undo has a baseline to revert to
  const loadedSlide = currentSlideFile();
  if (loadedSlide) {
    const initialHtml = serializeSlideDocument(slideIframe.contentDocument);
    if (initialHtml) pushSnapshot(loadedSlide, initialHtml);
  }

  renderBboxes();
  renderObjectSelection();
  updateObjectEditorControls();
  updateSendState();
});

// Init
async function init() {
  initNotesPanel();
  setStatus('Loading slide list...');

  try {
    const urlParams = new URLSearchParams(window.location.search);

    // If ?deck= param exists, switch to that deck first (from browse page)
    const deckParam = urlParams.get('deck');
    if (deckParam) {
      const switchRes = await fetch('/api/decks/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckName: deckParam }),
      });
      if (!switchRes.ok) {
        const err = await switchRes.json().catch(() => ({}));
        throw new Error(`Failed to switch deck: ${err.error || switchRes.statusText}`);
      }
    }

    // Handle ?create=1 query param (from browser "New Deck" button)
    const forceCreate = urlParams.get('create') === '1';

    // Reset server state for new deck creation
    if (forceCreate) {
      await fetch('/api/decks/new', { method: 'POST' }).catch(() => {});
    }

    // Show deck name in nav bar
    const configRes = await fetch('/api/editor-config');
    const config = configRes.ok ? await configRes.json() : {};
    const deckNameEl = document.getElementById('nav-deck-name');
    if (deckNameEl) {
      if (forceCreate) {
        deckNameEl.textContent = '';
        deckNameEl.style.display = 'none';
      } else if (config.deckName) {
        deckNameEl.textContent = config.deckName;
        deckNameEl.style.display = '';
      }
    }

    const res = await fetch('/api/slides');
    if (!res.ok) {
      throw new Error(`Failed to fetch slide list: ${res.status}`);
    }

    state.slides = await res.json();
    // Enter creation mode if: server is in create mode, or no slides exist, or ?create=1
    const isCreateMode = await checkCreateMode();
    if (forceCreate || isCreateMode || state.slides.length === 0) {
      showCreationMode();
      await Promise.all([loadCreationModelOptions(), loadImportModelOptions(), loadPacks()]);
      connectSSE();

      // Auto-load outline if one exists in the deck (skip for explicit new deck)
      if (!forceCreate) {
        try {
          const outlineRes = await fetch('/api/outline');
          if (outlineRes.ok) {
            const outline = await outlineRes.json();
            showOutlinePhase(outline, { isExistingDeck: state.slides.length > 0 });
            setStatus('Outline loaded. Review and provide feedback.');
            return;
          }
        } catch { /* no outline */ }
      }

      // Check if CLI --import mode: auto-switch to import tab and trigger
      try {
        const cfgRes = await fetch('/api/editor-config');
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          // CLI --import-doc mode: PDF or URL
          if (cfg.importDocSource) {
            switchToImportTab();
            const importSlideCountEl = document.getElementById('import-slide-count');
            if (cfg.importSlideCount && importSlideCountEl) {
              importSlideCountEl.value = cfg.importSlideCount;
            }
            // Show source info in dropzone area
            const dropzone = document.getElementById('import-dropzone');
            const fileInfo = document.getElementById('import-file-info');
            const fileNameEl = document.getElementById('import-file-name');
            if (dropzone) dropzone.hidden = true;
            if (fileInfo) fileInfo.hidden = false;
            if (fileNameEl) fileNameEl.textContent = cfg.importDocSource;
            // Auto-submit document import
            submitDocImport({
              source: cfg.importDocSource,
              sourceType: cfg.importDocSourceType,
              slideCount: cfg.importSlideCount,
              packId: cfg.importPack,
            });
            return;
          }

          if (cfg.importFile) {
            switchToImportTab();
            // Fetch import file content from server
            const fileRes = await fetch('/api/import-file');
            if (fileRes.ok) {
              const { content: importContent, fileName } = await fileRes.json();
              // Set slide count from CLI flags
              const importSlideCountEl = document.getElementById('import-slide-count');
              if (cfg.importSlideCount && importSlideCountEl) {
                importSlideCountEl.value = cfg.importSlideCount;
              }
              // Show file info
              const dropzone = document.getElementById('import-dropzone');
              const fileInfo = document.getElementById('import-file-info');
              const fileNameEl = document.getElementById('import-file-name');
              if (dropzone) dropzone.hidden = true;
              if (fileInfo) fileInfo.hidden = false;
              if (fileNameEl) fileNameEl.textContent = fileName;
              // Auto-submit
              submitImport(importContent);
              return;
            }
          }
        }
      } catch { /* no import mode */ }

      setStatus('Enter a topic to generate slides.');
      return;
    }

    // Check if outline exists and enable/disable button accordingly
    const btnOutline = document.getElementById('btn-review-outline');
    if (btnOutline) {
      try {
        const outlineCheck = await fetch('/api/outline');
        btnOutline.disabled = !outlineCheck.ok;
      } catch {
        btnOutline.disabled = true;
      }
    }

    await loadModelOptions();
    updateToolModeUI();
    renderThumbnailStrip();
    await goToSlide(0);
    scaleSlide();
    await loadRunsInitial();
    connectSSE();
    updateRunButtonLabel();
    // Editor-mode button states (same logic in editor-create.js hideCreationMode)
    if (btnNewDeck) btnNewDeck.disabled = true;
    if (btnReviewOutline) btnReviewOutline.classList.add('nav-emphasis');
    if (btnExportToggle) btnExportToggle.classList.add('nav-emphasis');
    if (btnReviewDeck) btnReviewDeck.style.display = '';
    if (btnPresent) btnPresent.style.display = '';

    setStatus(`Ready. Model: ${state.selectedModel}. Draw red pending bboxes, run Codex, then review green bboxes.`);
  } catch (error) {
    setStatus(`Error loading slides: ${error.message}`);
    console.error('Init error:', error);
  }
}

init();
