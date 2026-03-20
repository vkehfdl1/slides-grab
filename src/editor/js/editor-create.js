// editor-create.js — Creation mode logic (generate slides from topic)

import { state, creationState } from './editor-state.js';
import {
  creationPanel, creationTopic, creationRequirements, creationModel,
  creationGenerate, creationLog, creationProgress,
  creationDeckName, creationSlideCount,
  slidePanel, editorSidebar, slideCounter, btnNewDeck, slideStrip,
} from './editor-dom.js';
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
  if (phaseInput) phaseInput.hidden = false;
  if (phaseOutline) phaseOutline.hidden = true;
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
}

export function hideCreationMode() {
  creationState.active = false;
  if (_placeholderTimer) { clearInterval(_placeholderTimer); _placeholderTimer = null; }
  if (creationPanel) creationPanel.classList.remove('active');
  if (slidePanel) slidePanel.style.display = '';
  if (editorSidebar) editorSidebar.style.display = '';
  if (btnNewDeck) btnNewDeck.style.display = '';
  if (slideStrip) slideStrip.style.display = '';
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

export async function submitGeneration() {
  const topic = creationTopic?.value?.trim();
  if (!topic) {
    setStatus('Please enter a topic.');
    return;
  }

  if (creationState.generating) {
    setStatus('Already in progress.');
    return;
  }

  const requirements = creationRequirements?.value?.trim() || '';
  const model = creationModel?.value || 'claude-sonnet-4-6';
  const slideCount = creationSlideCount?.value || '8~12';

  creationState.generating = true;
  if (creationGenerate) creationGenerate.disabled = true;
  if (creationProgress) creationProgress.hidden = false;
  if (creationLog) creationLog.textContent = '';
  showPlanLoading(true, 'Generating outline');
  setStatus('Planning outline...');

  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, requirements, model, slideCount }),
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
    if (creationGenerate) creationGenerate.disabled = false;
    showPlanLoading(false);
    appendCreationLog(`[Error] ${err.message}\n`);
    setStatus(`Plan failed: ${err.message}`);
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
    setStatus(`Generation failed: ${payload.message}`);
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
      await loadModelOptions();
      updateToolModeUI();
      renderThumbnailStrip();
      await goToSlide(0);
      scaleSlide();
      setStatus(`${state.slides.length} slides loaded. Switched to edit mode.`);
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
    'What is this presentation about?',
    'Quarterly sales review for Q1 2026...',
    'Technical architecture overview of our microservices...',
    'Product launch strategy for mobile app...',
    'Team onboarding guide for new engineers...',
    'Annual company retrospective and goals...',
  ];
  let placeholderIdx = 0;
  _placeholderTimer = setInterval(() => {
    if (creationTopic.value || document.activeElement === creationTopic) return;
    placeholderIdx = (placeholderIdx + 1) % placeholders.length;
    creationTopic.placeholder = placeholders[placeholderIdx];
  }, 3000);
}

var _placeholderTimer = null;
