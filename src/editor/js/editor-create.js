// editor-create.js — Creation mode logic (generate slides from topic)

import { state, creationState } from './editor-state.js';
import {
  creationPanel, creationTopic, creationRequirements, creationModel,
  creationGenerate, creationLog, creationProgress,
  creationDeckName, creationSlideCount,
  slidePanel, editorSidebar, slideCounter, btnNewDeck, slideStrip,
  btnPrev, btnNext, btnExportToggle, btnReviewOutline, btnReviewDeck,
  tabTopic, tabImport, tabTopicPanel, tabImportPanel,
  importDropzone, importFileInput, importBrowse,
  importFileList, importFileListItems, importAddMore,
  importSlideCount, importResearchMode,
  importModel, importSubmit, importPrompt, importUrlInput, importUrlGo,
  btnPresent, btnDuplicateSlide, btnDeleteSlide,
} from './editor-dom.js';
import { getSelectedPack } from './editor-pack.js';
import { setStatus, loadModelOptions } from './editor-utils.js';
import { goToSlide } from './editor-navigation.js';
import { updateToolModeUI } from './editor-select.js';
import { scaleSlide } from './editor-bbox.js';
import { resetOutlineIndicators } from './editor-outline.js';
import { renderThumbnailStrip } from './editor-thumbnails.js';

let _planLoadingTimer = null;
let _planLoadingStart = 0;

export function showPlanLoading(visible, label) {
  const el = document.getElementById('plan-loading');
  if (!el) return;
  el.classList.toggle('active', visible);

  if (visible) {
    if (label) {
      const labelEl = document.getElementById('plan-loading-label');
      if (labelEl) labelEl.textContent = label;
    }
    const stepEl = document.getElementById('plan-loading-step');
    if (stepEl) stepEl.textContent = '';

    // Start timer
    _planLoadingStart = Date.now();
    const timerEl = document.getElementById('plan-loading-timer');
    if (timerEl) timerEl.textContent = '0:00';
    clearInterval(_planLoadingTimer);
    _planLoadingTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - _planLoadingStart) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = String(elapsed % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${m}:${s}`;
    }, 1000);
  } else {
    clearInterval(_planLoadingTimer);
    _planLoadingTimer = null;
  }
}

export function updatePlanLoadingStep(step) {
  const el = document.getElementById('plan-loading-step');
  if (el) el.textContent = step;
}

/**
 * Feed raw log chunks into the overlay step area.
 * Extracts the last meaningful line to show activity.
 */
let _lastLogLine = '';
export function feedPlanLoadingLog(chunk) {
  if (!chunk || typeof chunk !== 'string') return;
  const el = document.getElementById('plan-loading-step');
  if (!el) return;

  // Split chunk into lines, find the last non-empty one
  const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return;

  const line = lines[lines.length - 1];
  // Skip duplicate or very short lines
  if (line === _lastLogLine || line.length < 3) return;
  _lastLogLine = line;

  // Truncate for display
  el.textContent = line.length > 70 ? line.slice(0, 67) + '...' : line;
}

export function showCreationMode() {
  creationState.active = true;
  if (creationPanel) creationPanel.classList.add('active');
  if (slidePanel) slidePanel.style.display = 'none';
  if (editorSidebar) editorSidebar.style.display = 'none';
  if (btnNewDeck) btnNewDeck.style.display = 'none';
  if (slideStrip) slideStrip.style.display = 'none';
  slideCounter.textContent = '0 / 0';

  // Reset to input phase
  const phaseInput = document.getElementById('creation-phase-input');
  const phaseOutline = document.getElementById('creation-phase-outline');
  const packSection = document.getElementById('pack-section');
  const creationHeader = document.getElementById('creation-header');
  if (phaseInput) phaseInput.hidden = false;
  if (phaseOutline) phaseOutline.hidden = true;
  if (packSection) packSection.hidden = false;
  if (creationHeader) creationHeader.hidden = false;
  showPlanLoading(false);

  if (creationGenerate) {
    creationGenerate.disabled = false;
    creationGenerate.style.display = '';
  }
  if (creationProgress) creationProgress.hidden = true;
  resetOutlineIndicators();
  const outlineLog = document.getElementById('outline-log');
  if (outlineLog) outlineLog.textContent = '';
  const oldBtn = document.getElementById('creation-view-result');
  if (oldBtn) oldBtn.remove();

  // Disable nav buttons irrelevant in creation mode
  if (btnPrev) btnPrev.disabled = true;
  if (btnNext) btnNext.disabled = true;
  if (btnReviewOutline) btnReviewOutline.disabled = true;
  if (btnExportToggle) btnExportToggle.disabled = true;
  if (btnPresent) btnPresent.disabled = true;
  if (btnDuplicateSlide) btnDuplicateSlide.disabled = true;
  if (btnDeleteSlide) btnDeleteSlide.disabled = true;
  if (btnReviewDeck) btnReviewDeck.style.display = 'none';
  // Remove editor-mode emphasis during creation
  if (btnReviewOutline) btnReviewOutline.classList.remove('nav-emphasis');
  if (btnExportToggle) btnExportToggle.classList.remove('nav-emphasis');
}

export function hideCreationMode() {
  creationState.active = false;
  if (_placeholderTimer) { clearInterval(_placeholderTimer); _placeholderTimer = null; }
  if (creationPanel) creationPanel.classList.remove('active');
  if (slidePanel) slidePanel.style.display = '';
  if (editorSidebar) editorSidebar.style.display = '';
  if (btnNewDeck) btnNewDeck.style.display = '';
  if (slideStrip) slideStrip.style.display = '';

  // Re-enable nav buttons (Prev/Next state will be corrected by goToSlide)
  if (btnPrev) btnPrev.disabled = false;
  if (btnNext) btnNext.disabled = false;
  if (btnReviewOutline) btnReviewOutline.disabled = false;
  if (btnExportToggle) btnExportToggle.disabled = false;
  if (btnPresent) btnPresent.disabled = false;
  if (btnDuplicateSlide) btnDuplicateSlide.disabled = false;
  if (btnDeleteSlide) btnDeleteSlide.disabled = false;
  if (btnReviewDeck) btnReviewDeck.style.display = '';
  if (btnPresent) btnPresent.style.display = '';
  // Editor-mode button states (same logic in editor-init.js init)
  if (btnNewDeck) btnNewDeck.disabled = true;
  if (btnReviewOutline) btnReviewOutline.classList.add('nav-emphasis');
  if (btnExportToggle) btnExportToggle.classList.add('nav-emphasis');
}

export function isCreationMode() {
  return creationState.active;
}

export async function loadCreationModelOptions() {
  try {
    const res = await fetch('/api/models');
    if (!res.ok) return;
    const payload = await res.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const claudeModels = models.filter((m) => m.startsWith('claude-'));
    if (creationModel) {
      creationModel.innerHTML = claudeModels
        .map((m) => `<option value="${m}">${m}</option>`)
        .join('');
    }
  } catch {
    if (creationModel) {
      creationModel.innerHTML = '<option value="claude-sonnet-4-6">claude-sonnet-4-6</option>';
    }
  }
}

export async function checkCreateMode() {
  try {
    const res = await fetch('/api/editor-config');
    if (!res.ok) return false;
    const config = await res.json();
    if (config.createMode) {
      if (config.deckName && creationDeckName) {
        creationDeckName.value = config.deckName;
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function preventUnload(e) {
  e.preventDefault();
  e.returnValue = '';
}

export async function submitGeneration() {
  const topic = creationTopic?.value?.trim();
  if (!topic) {
    setStatus('주제를 입력해 주세요.');
    return;
  }

  if (creationState.generating) {
    setStatus('이미 진행 중입니다.');
    return;
  }

  const requirements = creationRequirements?.value?.trim() || '';
  const model = creationModel?.value || 'claude-sonnet-4-6';
  const slideCount = creationSlideCount?.value ?? '';

  creationState.generating = true;
  window.addEventListener('beforeunload', preventUnload);
  if (creationGenerate) creationGenerate.disabled = true;
  if (creationProgress) creationProgress.hidden = false;
  if (creationLog) creationLog.textContent = '';
  showPlanLoading(true, '아웃라인 생성 중');
  setStatus('아웃라인을 계획하고 있습니다...');

  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, requirements, model, slideCount, packId: getSelectedPack() }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    creationState.runId = data.runId;
    appendCreationLog(`[Plan] Topic: ${data.topic} | Model: ${data.model}\n`);
  } catch (err) {
    creationState.generating = false;
    window.removeEventListener('beforeunload', preventUnload);
    if (creationGenerate) creationGenerate.disabled = false;
    showPlanLoading(false);
    appendCreationLog(`[Error] ${err.message}\n`);
    setStatus(`아웃라인 생성 실패: ${err.message}`);
  }
}

export function appendCreationLog(text) {
  const outlinePhase = document.getElementById('creation-phase-outline');
  const inOutline = outlinePhase && !outlinePhase.hidden;

  const logEl = inOutline
    ? document.getElementById('outline-log')
    : creationLog;
  const progressEl = inOutline
    ? document.getElementById('outline-progress')
    : creationProgress;

  if (!logEl) return;
  if (progressEl) progressEl.hidden = false;
  logEl.textContent += text;
  logEl.scrollTop = logEl.scrollHeight;

}

export function onGenerateStarted(payload) {
  creationState.runId = payload.runId;
  appendCreationLog(`[Generation started] ${payload.topic}\n`);
}

export function onGenerateLog(payload) {
  if (payload.stream === 'stderr') return;
  appendCreationLog(payload.chunk || '');
}

export function onGenerateFinished(payload) {
  creationState.generating = false;
  window.removeEventListener('beforeunload', preventUnload);
  showPlanLoading(false);

  const outlinePhase = document.getElementById('creation-phase-outline');
  const inOutline = outlinePhase && !outlinePhase.hidden;

  if (payload.success) {
    if (inOutline) resetOutlineIndicators('success');
    else {
      const review = document.querySelector('.outline-review');
      if (review) review.classList.remove('generating');
    }
    appendCreationLog(`\n[Done] ${payload.message}\n`);
    setStatus(payload.message);
    showViewResultButton(payload.slideCount || 0, inOutline);
  } else {
    if (inOutline) {
      resetOutlineIndicators('fail');
    } else {
      if (creationGenerate) creationGenerate.disabled = false;
    }
    appendCreationLog(`\n[Failed] ${payload.message}\n`);
    setStatus(`생성 실패: ${payload.message}`);
    // Show partial result button if some slides were created despite failure
    if (payload.partialSlideCount > 0) {
      showViewResultButton(payload.partialSlideCount, inOutline);
    }
  }
}

function showViewResultButton(slideCount, inOutline = false) {
  if (creationGenerate) creationGenerate.style.display = 'none';

  const existing = document.getElementById('creation-view-result');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.id = 'creation-view-result';
  btn.textContent = `View Result (${slideCount} slides)`;
  btn.className = 'creation-view-result-btn';
  btn.addEventListener('click', () => {
    refreshSlideList();
  });

  if (inOutline) {
    // Place inside outline actions area
    const actions = document.querySelector('.outline-actions');
    if (actions) {
      actions.innerHTML = '';
      actions.appendChild(btn);
    }
  } else if (creationProgress) {
    creationProgress.insertAdjacentElement('afterend', btn);
  } else if (creationPanel) {
    creationPanel.querySelector('.creation-content')?.appendChild(btn);
  }
}

export async function refreshSlideList() {
  try {
    const res = await fetch('/api/slides');
    if (!res.ok) return;
    state.slides = await res.json();

    if (state.slides.length > 0) {
      hideCreationMode();
      // Check outline existence to enable/disable Outline button
      try {
        const outlineCheck = await fetch('/api/outline');
        if (btnReviewOutline) btnReviewOutline.disabled = !outlineCheck.ok;
      } catch {
        if (btnReviewOutline) btnReviewOutline.disabled = true;
      }
      await loadModelOptions();
      updateToolModeUI();
      renderThumbnailStrip();
      await goToSlide(0);
      scaleSlide();
      setStatus(`${state.slides.length}개 슬라이드 로드 완료. 편집 모드로 전환합니다.`);
    }
  } catch (err) {
    console.error('refreshSlideList error:', err);
  }
}

// Bind creation button event
if (creationGenerate) {
  creationGenerate.addEventListener('click', submitGeneration);
}

// Ctrl+Enter in topic textarea to submit
if (creationTopic) {
  creationTopic.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      submitGeneration();
    }
  });

  // Cycling placeholder examples
  const placeholders = [
    '어떤 주제의 프레젠테이션인가요?',
    '2026년 1분기 매출 리뷰...',
    '마이크로서비스 기술 아키텍처 개요...',
    '모바일 앱 출시 전략...',
    '신규 엔지니어 온보딩 가이드...',
    '연간 회고 및 목표 설정...',
  ];
  let placeholderIdx = 0;
  _placeholderTimer = setInterval(() => {
    if (creationTopic.value || document.activeElement === creationTopic) return;
    placeholderIdx = (placeholderIdx + 1) % placeholders.length;
    creationTopic.placeholder = placeholders[placeholderIdx];
  }, 3000);
}

var _placeholderTimer = null;

// ── Import MD Tab Logic ──────────────────────────────────────────────

/** @type {Array<{file: File, name: string, type: 'text'|'pdf', content?: string}>} */
let _importedFiles = [];

const MAX_IMPORT_FILES = 5;
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB total
const ALLOWED_EXTENSIONS = ['md', 'markdown', 'txt', 'pdf'];

function getUserPrompt() {
  return importPrompt?.value?.trim() || '';
}

function switchTab(tab) {
  const isTopic = tab === 'topic';
  if (tabTopic) {
    tabTopic.classList.toggle('active', isTopic);
    tabTopic.setAttribute('aria-selected', String(isTopic));
  }
  if (tabImport) {
    tabImport.classList.toggle('active', !isTopic);
    tabImport.setAttribute('aria-selected', String(!isTopic));
  }
  if (tabTopicPanel) tabTopicPanel.hidden = !isTopic;
  if (tabImportPanel) tabImportPanel.hidden = isTopic;
}

export function switchToImportTab() {
  switchTab('import');
}

if (tabTopic) {
  tabTopic.addEventListener('click', () => switchTab('topic'));
}
if (tabImport) {
  tabImport.addEventListener('click', () => switchTab('import'));
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFileList() {
  if (!importFileListItems) return;
  importFileListItems.innerHTML = '';

  for (let i = 0; i < _importedFiles.length; i++) {
    const entry = _importedFiles[i];
    const isPdf = entry.type === 'pdf';
    const item = document.createElement('div');
    item.className = 'import-file-item';
    item.innerHTML = `
      <svg class="import-file-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        ${isPdf
          ? '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M10 13h4"/><path d="M10 17h4"/>'
          : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>'}
      </svg>
      <span class="import-file-item-name">${entry.name}</span>
      <span class="import-file-item-size">${formatFileSize(entry.file.size)}</span>
    `;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'import-file-item-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.addEventListener('click', () => removeImportFile(i));
    item.appendChild(removeBtn);
    importFileListItems.appendChild(item);
  }

  const hasFiles = _importedFiles.length > 0;
  if (importDropzone) importDropzone.hidden = hasFiles;
  if (importFileList) importFileList.hidden = !hasFiles;
  // Hide add-more button when at max
  if (importAddMore) importAddMore.hidden = _importedFiles.length >= MAX_IMPORT_FILES;
}

function removeImportFile(index) {
  _importedFiles.splice(index, 1);
  renderFileList();
}

function clearAllImportFiles() {
  _importedFiles = [];
  if (importFileInput) importFileInput.value = '';
  renderFileList();
}

function getTotalImportSize() {
  return _importedFiles.reduce((sum, e) => sum + e.file.size, 0);
}

function handleImportFiles(fileList) {
  if (!fileList || fileList.length === 0) return;

  for (const file of fileList) {
    if (_importedFiles.length >= MAX_IMPORT_FILES) {
      setStatus(`최대 ${MAX_IMPORT_FILES}개 파일까지 추가할 수 있습니다.`);
      break;
    }

    // Duplicate check
    if (_importedFiles.some((e) => e.name === file.name && e.file.size === file.size)) continue;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setStatus(`${file.name}: .md, .txt, .pdf 파일만 지원합니다.`);
      continue;
    }

    if (getTotalImportSize() + file.size > MAX_IMPORT_FILE_SIZE) {
      setStatus('총 파일 크기가 10MB를 초과합니다.');
      break;
    }

    const isPdf = ext === 'pdf';
    if (isPdf) {
      _importedFiles.push({ file, name: file.name, type: 'pdf' });
    } else {
      _importedFiles.push({ file, name: file.name, type: 'text' });
    }
  }

  renderFileList();
  if (importFileInput) importFileInput.value = '';
}

// Browse button
if (importBrowse) {
  importBrowse.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    importFileInput?.click();
  });
}

// File input change (multiple)
if (importFileInput) {
  importFileInput.addEventListener('change', () => {
    handleImportFiles(importFileInput.files);
  });
}

// Click on dropzone
if (importDropzone) {
  importDropzone.addEventListener('click', (e) => {
    if (e.target === importBrowse) return;
    importFileInput?.click();
  });

  // Drag-and-drop (multiple)
  importDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    importDropzone.classList.add('dragover');
  });
  importDropzone.addEventListener('dragleave', () => {
    importDropzone.classList.remove('dragover');
  });
  importDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    importDropzone.classList.remove('dragover');
    handleImportFiles(e.dataTransfer?.files);
  });
}

// Add more button
if (importAddMore) {
  importAddMore.addEventListener('click', () => importFileInput?.click());
}

// Submit import
export async function submitImport(content) {
  const mdContent = content;
  if (!mdContent) {
    setStatus('먼저 마크다운 파일을 선택해 주세요.');
    return;
  }

  if (creationState.generating) {
    setStatus('이미 진행 중입니다.');
    return;
  }

  const model = importModel?.value || 'claude-sonnet-4-6';
  const slideCount = importSlideCount?.value || '';
  const researchMode = importResearchMode?.value || 'none';

  creationState.generating = true;
  window.addEventListener('beforeunload', preventUnload);
  if (importSubmit) importSubmit.disabled = true;
  if (creationProgress) creationProgress.hidden = false;
  if (creationLog) creationLog.textContent = '';
  showPlanLoading(true, '마크다운 가져오는 중');
  setStatus('마크다운을 아웃라인으로 변환 중...');

  try {
    const userPrompt = getUserPrompt();
    const res = await fetch('/api/import-md', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: mdContent, model, slideCount, researchMode, packId: getSelectedPack(), userPrompt }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    creationState.runId = data.runId;
    appendCreationLog(`[Import] Model: ${data.model}\n`);
  } catch (err) {
    creationState.generating = false;
    window.removeEventListener('beforeunload', preventUnload);
    if (importSubmit) importSubmit.disabled = false;
    showPlanLoading(false);
    appendCreationLog(`[Error] ${err.message}\n`);
    setStatus(`가져오기 실패: ${err.message}`);
  }
}

if (importSubmit) {
  importSubmit.addEventListener('click', () => {
    if (_importedFiles.length === 0) {
      setStatus('먼저 파일을 선택해 주세요.');
      return;
    }
    if (_importedFiles.length >= 2) {
      submitMultiFileImport();
    } else if (_importedFiles[0].type === 'pdf') {
      submitPdfUpload(_importedFiles[0].file);
    } else {
      // Single text file — read and send via existing path
      const reader = new FileReader();
      reader.onerror = () => setStatus('파일을 읽지 못했습니다.');
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result.trim() : '';
        if (!text) { setStatus('파일이 비어 있습니다.'); return; }
        submitImport(text);
      };
      reader.readAsText(_importedFiles[0].file, 'utf-8');
    }
  });
}

// URL import
function handleUrlImport() {
  const url = importUrlInput?.value?.trim();
  if (!url) {
    setStatus('URL을 입력해 주세요.');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    setStatus('https:// 또는 http:// 로 시작하는 URL을 입력하세요.');
    return;
  }
  submitDocImport({ source: url, sourceType: 'url' });
}

if (importUrlGo) {
  importUrlGo.addEventListener('click', handleUrlImport);
}
if (importUrlInput) {
  importUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUrlImport();
    }
  });
}

// Populate import model select from the same source as creation model
export async function loadImportModelOptions() {
  try {
    const res = await fetch('/api/models');
    if (!res.ok) return;
    const payload = await res.json();
    const models = Array.isArray(payload.models) ? payload.models : [];
    const claudeModels = models.filter((m) => m.startsWith('claude-'));
    if (importModel) {
      importModel.innerHTML = claudeModels
        .map((m) => `<option value="${m}">${m}</option>`)
        .join('');
    }
  } catch {
    if (importModel) {
      importModel.innerHTML = '<option value="claude-sonnet-4-6">claude-sonnet-4-6</option>';
    }
  }
}

// ── Document Import (PDF / URL) ───────────────────────────────────
/**
 * Submit a document import (PDF path or URL) to /api/import-doc.
 * Called from editor-init.js for CLI --import-doc mode, or from the UI.
 */
export async function submitDocImport({ source, sourceType, model, slideCount, researchMode, packId } = {}) {
  if (!source) {
    setStatus('소스가 지정되지 않았습니다.');
    return;
  }
  if (creationState.generating) {
    setStatus('이미 진행 중입니다.');
    return;
  }

  const selectedModel = model || importModel?.value || 'claude-sonnet-4-6';
  const selectedSlideCount = slideCount || importSlideCount?.value || '';
  const selectedResearchMode = researchMode || importResearchMode?.value || 'none';
  const selectedPack = packId || getSelectedPack();

  creationState.generating = true;
  window.addEventListener('beforeunload', preventUnload);
  if (importSubmit) importSubmit.disabled = true;
  if (creationProgress) creationProgress.hidden = false;
  if (creationLog) creationLog.textContent = '';

  const isUrl = sourceType === 'url' || /^https?:\/\//i.test(source);
  const labelText = isUrl ? 'URL 가져오는 중' : 'PDF 변환 중';
  showPlanLoading(true, labelText);
  setStatus(`${labelText}...`);

  try {
    const queryType = isUrl ? 'url' : 'pdf-path';
    const userPrompt = getUserPrompt();
    const body = {
      model: selectedModel,
      slideCount: selectedSlideCount,
      researchMode: selectedResearchMode,
      packId: selectedPack,
      userPrompt,
    };
    if (isUrl) {
      body.url = source;
    } else {
      body.filePath = source;
    }

    const res = await fetch(`/api/import-doc?sourceType=${queryType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    creationState.runId = data.runId;
    appendCreationLog(`[Doc Import] ${data.sourceLabel || source}\n`);
    appendCreationLog(`[Doc Import] Model: ${data.model}\n`);
  } catch (err) {
    creationState.generating = false;
    window.removeEventListener('beforeunload', preventUnload);
    if (importSubmit) importSubmit.disabled = false;
    showPlanLoading(false);
    appendCreationLog(`[Error] ${err.message}\n`);
    setStatus(`가져오기 실패: ${err.message}`);
  }
}

/**
 * Submit a PDF file (browser File object) via binary upload.
 */
export async function submitPdfUpload(file, { model, slideCount, researchMode, packId } = {}) {
  if (!file) {
    setStatus('PDF 파일을 선택해 주세요.');
    return;
  }
  if (creationState.generating) {
    setStatus('이미 진행 중입니다.');
    return;
  }

  const selectedModel = model || importModel?.value || 'claude-sonnet-4-6';
  const selectedSlideCount = slideCount || importSlideCount?.value || '';
  const selectedResearchMode = researchMode || importResearchMode?.value || 'none';
  const selectedPack = packId || getSelectedPack();

  creationState.generating = true;
  window.addEventListener('beforeunload', preventUnload);
  if (importSubmit) importSubmit.disabled = true;
  if (creationProgress) creationProgress.hidden = false;
  if (creationLog) creationLog.textContent = '';
  showPlanLoading(true, 'PDF 변환 중');
  setStatus('PDF를 아웃라인으로 변환 중...');

  try {
    const userPrompt = getUserPrompt();
    const buffer = await file.arrayBuffer();
    const qs = new URLSearchParams({
      sourceType: 'pdf',
      model: selectedModel,
      slideCount: selectedSlideCount,
      researchMode: selectedResearchMode,
      packId: selectedPack,
      userPrompt,
    });
    const res = await fetch(`/api/import-doc?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: buffer,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    creationState.runId = data.runId;
    appendCreationLog(`[PDF Import] ${file.name}\n`);
    appendCreationLog(`[PDF Import] Model: ${data.model}\n`);
  } catch (err) {
    creationState.generating = false;
    window.removeEventListener('beforeunload', preventUnload);
    if (importSubmit) importSubmit.disabled = false;
    showPlanLoading(false);
    appendCreationLog(`[Error] ${err.message}\n`);
    setStatus(`PDF 가져오기 실패: ${err.message}`);
  }
}

// ── Multi-file import ─────────────────────────────────────────────

/** Read a File as text (for MD/txt). */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file, 'utf-8');
  });
}

/** Read a File as base64 string (for PDF). */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL format: data:application/pdf;base64,XXXXX
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function submitMultiFileImport() {
  if (_importedFiles.length < 2) return;
  if (creationState.generating) {
    setStatus('이미 진행 중입니다.');
    return;
  }

  const model = importModel?.value || 'claude-sonnet-4-6';
  const slideCount = importSlideCount?.value || '';
  const researchMode = importResearchMode?.value || 'none';
  const userPrompt = getUserPrompt();

  creationState.generating = true;
  window.addEventListener('beforeunload', preventUnload);
  if (importSubmit) importSubmit.disabled = true;
  if (creationProgress) creationProgress.hidden = false;
  if (creationLog) creationLog.textContent = '';
  showPlanLoading(true, `${_importedFiles.length}개 파일 변환 중`);
  setStatus(`${_importedFiles.length}개 파일을 아웃라인으로 변환 중...`);

  try {
    // Read all files
    const files = [];
    for (const entry of _importedFiles) {
      if (entry.type === 'pdf') {
        const base64 = await readFileAsBase64(entry.file);
        files.push({ name: entry.name, type: 'pdf', base64 });
      } else {
        const content = await readFileAsText(entry.file);
        files.push({ name: entry.name, type: 'text', content });
      }
    }

    const res = await fetch('/api/import-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files, model, slideCount, researchMode,
        packId: getSelectedPack(), userPrompt,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    creationState.runId = data.runId;
    appendCreationLog(`[Multi-file Import] ${data.fileCount} files\n`);
    appendCreationLog(`[Multi-file Import] Model: ${data.model}\n`);
  } catch (err) {
    creationState.generating = false;
    window.removeEventListener('beforeunload', preventUnload);
    if (importSubmit) importSubmit.disabled = false;
    showPlanLoading(false);
    appendCreationLog(`[Error] ${err.message}\n`);
    setStatus(`가져오기 실패: ${err.message}`);
  }
}
