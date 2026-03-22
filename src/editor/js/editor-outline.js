// editor-outline.js — Outline review panel with inline-editable cards

import { creationState } from './editor-state.js';
import { setStatus } from './editor-utils.js';
import { appendCreationLog, showCreationMode, loadCreationModelOptions, showPlanLoading, updatePlanLoadingStep } from './editor-create.js';
import { btnReviewOutline } from './editor-dom.js';
import { getSelectedPack } from './editor-pack.js';

const $ = (sel) => document.querySelector(sel);

const phaseInput = $('#creation-phase-input');
const phaseOutline = $('#creation-phase-outline');
const outlineCount = $('#outline-count');
const outlineDeckName = $('#outline-deck-name');
const outlineSlides = $('#outline-slides');
const outlineFeedback = $('#outline-feedback');
const outlineRevise = $('#outline-revise');
const outlineApprove = $('#outline-approve');
const outlineBack = $('#outline-back');
const creationProgress = $('#creation-progress');
const creationGenerate = $('#creation-generate');

let currentOutline = null;
let editingIndex = -1;

// ── Public API ──

/**
 * Reset bunny indicator + button states after a revise/generate completes.
 * @param {'success'|'fail'} [result] — omit to just reset silently
 */
export function resetOutlineIndicators(result) {
  // Hide bunny track + overlay
  const review = document.querySelector('.outline-review');
  if (review) review.classList.remove('generating');
  const oProgress = document.getElementById('outline-progress');
  if (oProgress) oProgress.hidden = true;
  showPlanLoading(false);

  // Flash + restore buttons
  const revBtn = outlineRevise;
  const appBtn = outlineApprove;

  const workingBtn = revBtn?.classList.contains('working') ? revBtn
    : appBtn?.classList.contains('working') ? appBtn
    : null;

  if (workingBtn && result) {
    const flashClass = result === 'success' ? 'done-success' : 'done-fail';
    const flashText = result === 'success' ? 'Done' : 'Failed';
    workingBtn.classList.remove('working');
    workingBtn.classList.add(flashClass);
    workingBtn.textContent = flashText;

    setTimeout(() => {
      workingBtn.classList.remove(flashClass);
      // Restore original text
      if (workingBtn === revBtn) workingBtn.textContent = 'Revise';
      else workingBtn.textContent = 'Approve & Generate';

      // Re-enable & show both
      if (revBtn) { revBtn.disabled = false; revBtn.style.display = ''; }
      if (appBtn) { appBtn.disabled = false; appBtn.style.display = ''; }
    }, 1500);
  } else {
    // Silent reset — just restore
    if (workingBtn) {
      workingBtn.classList.remove('working');
      if (workingBtn === revBtn) workingBtn.textContent = 'Revise';
      else workingBtn.textContent = 'Approve & Generate';
    }
    if (revBtn) { revBtn.disabled = false; revBtn.style.display = ''; }
    if (appBtn) { appBtn.disabled = false; appBtn.style.display = ''; }
  }
}

export function showOutlinePhase(outline, { isExistingDeck = false } = {}) {
  currentOutline = outline;
  editingIndex = -1;

  if (phaseInput) phaseInput.hidden = true;
  if (phaseOutline) phaseOutline.hidden = false;
  if (creationProgress) creationProgress.hidden = true;
  const oProgress = document.getElementById('outline-progress');
  if (oProgress) oProgress.hidden = true;

  if (outlineDeckName) {
    outlineDeckName.value = outline.deckName || '';
    outlineDeckName.readOnly = isExistingDeck;
    outlineDeckName.title = isExistingDeck ? '기존 덱 — 이름 변경 불가' : '';
    outlineDeckName.style.opacity = isExistingDeck ? '0.6' : '';
  }
  if (outlineCount) {
    const packLabel = outline.pack || getSelectedPack() || '';
    const packBadge = packLabel && packLabel !== 'figma-default'
      ? ` <span class="outline-pack-badge">${packLabel}</span>`
      : '';
    outlineCount.innerHTML = `${outline.slides?.length || 0} slides${packBadge}`;
  }

  // Sync pack selection from outline if present
  if (outline.pack) {
    import('./editor-pack.js').then(m => m.setSelectedPack(outline.pack));
  }

  renderOutlineCards(outline.slides || []);
  updateFeedbackPlaceholder();
}

export function hideOutlinePhase() {
  if (phaseOutline) phaseOutline.hidden = true;
  if (phaseInput) phaseInput.hidden = false;
  currentOutline = null;
  editingIndex = -1;
}

export function getOutlineDeckName() {
  return outlineDeckName?.value?.trim() || '';
}

export function getCurrentOutline() {
  return currentOutline;
}

// ── Known field labels (structural, not content) ──

const FIELD_LABEL_RE = /^(content|details|items|subtitle|context|key\s*message|presenter\s*note|headline?)\s*:\s*/i;

// ── Content extraction / reconstruction ──

function extractEditContent(slide) {
  const lines = (slide.rawBlock || '').split('\n');
  const result = [];

  for (const line of lines) {
    if (/^###\s+Slide/i.test(line)) continue;
    if (/^---\s*$/.test(line)) continue;
    if (!line.trim()) continue;

    const plain = line.replace(/\*\*(.*?)\*\*/g, '$1').replace(/<[^>]*>/g, '');

    if (/^\s*-\s*type\s*:/i.test(plain)) continue;
    if (/^\s*-\s*title\s*:/i.test(plain)) continue;

    // Field label line — keep inline value, skip if empty
    const fm = plain.match(/^(\s*)-?\s*(content|details|items|key\s*message|subtitle|context|presenter\s*note|headline?)\s*:\s*(.*)/i);
    if (fm) {
      if (fm[3].trim()) result.push(fm[3].trim());
      continue;
    }

    result.push(plain);
  }

  // Normalize indentation: subtract minimum leading spaces
  const indents = result.filter(l => l.trim()).map(l => l.match(/^(\s*)/)[1].length);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;

  return result.map(l => minIndent > 0 ? l.slice(minIndent) : l).join('\n');
}

function reconstructRawBlock(slideNum, type, title, contentText) {
  let block = `### Slide ${slideNum}\n`;
  block += `- type: ${type}\n`;
  block += `- title: ${title}\n`;
  block += `- content:\n`;

  for (const line of contentText.split('\n')) {
    if (!line.trim()) continue;
    block += `  ${line}\n`;
  }
  block += '\n';
  return block;
}

// ── Rendering ──

function cleanDetail(raw) {
  let text = raw.trim();
  text = text.replace(/^[-*]\s*/, '');
  text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(FIELD_LABEL_RE, '');
  return text.trim();
}

function renderOutlineCards(slides) {
  if (!outlineSlides) return;
  outlineSlides.innerHTML = '';

  slides.forEach((slide, i) => {
    const card = document.createElement('div');
    card.className = 'outline-card' + (i === editingIndex ? ' editing' : '');
    card.dataset.index = i;
    card.dataset.type = (slide.type || 'content').toLowerCase();

    const isEditing = i === editingIndex;
    const cleanTitle = (slide.title || '').replace(/<[^>]*>/g, '').replace(/\*\*(.*?)\*\*/g, '$1');

    if (isEditing) {
      // ── Edit mode: title input + content textarea ──
      const content = extractEditContent(slide);

      card.innerHTML = `
        <span class="outline-card-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="outline-card-body">
          <div class="outline-card-top">
            <span class="outline-card-type">${escapeHtml(slide.type || 'content')}</span>
            <input class="outline-card-title-input" type="text" value="${escapeHtml(cleanTitle)}" placeholder="Title">
            <button class="outline-card-badge save" title="Save (Ctrl+S)">save</button>
          </div>
          <textarea class="outline-card-textarea" spellcheck="false">${escapeHtml(content)}</textarea>
        </div>
      `;

      const saveBtn = card.querySelector('.outline-card-badge');
      saveBtn.addEventListener('click', (e) => { e.stopPropagation(); saveCardEdit(i); });

      const ta = card.querySelector('.outline-card-textarea');
      const titleInput = card.querySelector('.outline-card-title-input');

      // Ctrl+S anywhere in card
      const onKey = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          saveCardEdit(i);
        }
      };
      ta.addEventListener('keydown', onKey);
      titleInput.addEventListener('keydown', onKey);

    } else {
      // ── View mode ──
      const details = (slide.details || [])
        .map(raw => {
          const leadingSpaces = raw.match(/^(\s*)/)[1].length;
          const level = Math.min(Math.floor(leadingSpaces / 2), 4);
          const text = cleanDetail(raw);
          return { text, level };
        })
        .filter(item => item.text);

      const detailsHtml = details.length > 0
        ? `<div class="outline-card-details">${details.map(d =>
            `<div class="outline-detail-line" style="margin-left:${d.level * 12}px">${escapeHtml(d.text)}</div>`
          ).join('')}</div>`
        : '';

      card.innerHTML = `
        <span class="outline-card-num">${String(i + 1).padStart(2, '0')}</span>
        <div class="outline-card-body">
          <div class="outline-card-top">
            <span class="outline-card-type">${escapeHtml(slide.type || 'content')}</span>
            <span class="outline-card-title">${escapeHtml(cleanTitle)}</span>
            <button class="outline-card-badge edit" title="Edit this slide">edit</button>
          </div>
          ${detailsHtml}
        </div>
      `;

      card.querySelector('.outline-card-badge').addEventListener('click', (e) => {
        e.stopPropagation();
        enterEditMode(i);
      });
    }

    outlineSlides.appendChild(card);
  });
}

// ── Edit mode logic ──

function enterEditMode(index) {
  if (editingIndex >= 0 && editingIndex !== index) {
    commitCurrentEdit();
  }
  editingIndex = index;
  renderOutlineCards(currentOutline?.slides || []);
  updateFeedbackPlaceholder();

  requestAnimationFrame(() => {
    const ta = outlineSlides?.querySelector('.outline-card.editing .outline-card-textarea');
    if (ta) {
      ta.focus();
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  });
}

function commitCurrentEdit() {
  if (editingIndex < 0 || !currentOutline?.slides[editingIndex]) return;
  const card = outlineSlides?.querySelector(`.outline-card[data-index="${editingIndex}"]`);
  if (!card) return;

  const ta = card.querySelector('.outline-card-textarea');
  const titleInput = card.querySelector('.outline-card-title-input');
  if (!ta) return;

  const slide = currentOutline.slides[editingIndex];
  const newTitle = titleInput ? titleInput.value.trim() : slide.title;
  slide.rawBlock = reconstructRawBlock(editingIndex + 1, slide.type, newTitle, ta.value);
  reparseSlide(slide);
}

async function saveCardEdit(index) {
  const card = outlineSlides?.querySelector(`.outline-card[data-index="${index}"]`);
  if (!card) return;

  const ta = card.querySelector('.outline-card-textarea');
  const titleInput = card.querySelector('.outline-card-title-input');
  if (!ta) return;

  const slide = currentOutline.slides[index];
  const newTitle = titleInput ? titleInput.value.trim() : slide.title;
  slide.rawBlock = reconstructRawBlock(index + 1, slide.type, newTitle, ta.value);
  reparseSlide(slide);

  const ok = await saveOutlineToServer();
  if (ok) {
    editingIndex = -1;
    renderOutlineCards(currentOutline?.slides || []);
    updateFeedbackPlaceholder();
    setStatus(`슬라이드 ${index + 1} 저장 완료.`);
  }
}

function reparseSlide(slide) {
  const lines = slide.rawBlock.split('\n');
  slide.type = '';
  slide.title = '';
  slide.details = [];

  for (const line of lines) {
    const sm = line.match(/^###\s+Slide\s+\d+\s*(?:[-\u2013\u2014]\s*(.+))?/i);
    if (sm) { if (sm[1]) slide.title = sm[1].trim(); continue; }
    if (/^---\s*$/.test(line)) continue;

    const plain = line.replace(/\*\*(.*?)\*\*/g, '$1');
    const tm = plain.match(/^-\s*type:\s*(.+)/i);
    const tt = plain.match(/^-\s*title:\s*(.+)/i);

    if (tm) { slide.type = tm[1].trim(); }
    else if (tt) { slide.title = tt[1].trim(); }
    else { const t = line.trimEnd(); if (t) slide.details.push(t); }
  }
}

// ── Feedback placeholder ──

function updateFeedbackPlaceholder() {
  if (!outlineFeedback) return;
  if (editingIndex >= 0) {
    outlineFeedback.placeholder = `Slide ${editingIndex + 1}\uC5D0 \uB300\uD55C \uC218\uC815 \uC694\uCCAD... (AI\uAC00 \uC774 \uC2AC\uB77C\uC774\uB4DC\uB9CC \uC218\uC815)`;
  } else {
    outlineFeedback.placeholder = '\uC804\uCCB4 \uC544\uC6C3\uB77C\uC778\uC5D0 \uB300\uD55C \uC218\uC815 \uC694\uCCAD...';
  }
}

// ── Save to server ──

async function saveOutlineToServer() {
  if (!currentOutline) return false;

  let md = currentOutline.rawHeader || '';
  for (const slide of currentOutline.slides) {
    md += slide.rawBlock || '';
  }
  if (currentOutline.rawFooter) {
    md += currentOutline.rawFooter;
  }

  try {
    const res = await fetch('/api/outline', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: md }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const updated = await res.json();
    currentOutline.slides = updated.slides;
    currentOutline.rawHeader = updated.rawHeader;
    currentOutline.rawFooter = updated.rawFooter;
    currentOutline.title = updated.title;
    currentOutline.deckName = updated.deckName;
    return true;
  } catch (err) {
    setStatus(`저장 실패: ${err.message}`);
    return false;
  }
}

// ── Helpers ──

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event handlers ──

if (outlineBack) {
  outlineBack.addEventListener('click', () => {
    hideOutlinePhase();
    if (creationGenerate) {
      creationGenerate.disabled = false;
      creationGenerate.style.display = '';
    }
  });
}

if (outlineRevise) {
  outlineRevise.addEventListener('click', async () => {
    const feedback = outlineFeedback?.value?.trim();
    if (!feedback) { setStatus('수정 피드백을 입력해 주세요.'); return; }
    if (creationState.generating) return;

    if (editingIndex >= 0) { commitCurrentEdit(); await saveOutlineToServer(); }

    outlineRevise.disabled = true;
    outlineApprove.disabled = true;
    creationState.generating = true;

    // Button working state
    outlineRevise.classList.add('working');
    outlineRevise.textContent = 'Revising...';
    if (outlineApprove) outlineApprove.style.display = 'none';
    showPlanLoading(true, '아웃라인 수정 중');

    // Clear previous log
    const oLog = document.getElementById('outline-log');
    if (oLog) oLog.textContent = '';

    try {
      const deckName = getOutlineDeckName();
      const body = { feedback, deckName };
      if (editingIndex >= 0) body.targetSlide = editingIndex + 1;

      const res = await fetch('/api/plan/revise', {
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
      const target = editingIndex >= 0 ? ` (Slide ${editingIndex + 1})` : '';
      appendCreationLog(`[Revise${target}] Applying feedback...\n`);
    } catch (err) {
      creationState.generating = false;
      resetOutlineIndicators('fail');
      showPlanLoading(false);
      appendCreationLog(`[Error] ${err.message}\n`);
      setStatus(`수정 실패: ${err.message}`);
    }
  });
}

if (outlineApprove) {
  outlineApprove.addEventListener('click', async () => {
    if (creationState.generating) return;

    if (editingIndex >= 0) commitCurrentEdit();
    const saved = await saveOutlineToServer();
    if (!saved) return;

    editingIndex = -1;
    outlineApprove.disabled = true;
    outlineRevise.disabled = true;
    creationState.generating = true;

    // Button working state
    outlineApprove.classList.add('working');
    outlineApprove.textContent = 'Generating...';
    if (outlineRevise) outlineRevise.style.display = 'none';
    showPlanLoading(true, '슬라이드 생성 중');

    // Clear previous log and show progress
    const oLog = document.getElementById('outline-log');
    if (oLog) oLog.textContent = '';

    try {
      const deckName = getOutlineDeckName();
      const model = document.querySelector('#creation-model')?.value || 'claude-sonnet-4-6';

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: currentOutline?.title || '',
          deckName, model, fromOutline: true, packId: getSelectedPack(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      creationState.runId = data.runId;
      appendCreationLog(`[Generate] Building slides from approved outline...\n`);
    } catch (err) {
      creationState.generating = false;
      resetOutlineIndicators('fail');
      showPlanLoading(false);
      appendCreationLog(`[Error] ${err.message}\n`);
      setStatus(`생성 실패: ${err.message}`);
    }
  });
}

// ── Plan SSE handlers ──

export function onPlanStarted(payload) {
  creationState.runId = payload.runId;
  appendCreationLog(`[Plan] Started: ${payload.topic}\n`);
}

export function onPlanLog(payload) {
  if (payload.stream === 'stderr') return;
  appendCreationLog(payload.chunk || '');
}

export function onPlanFinished(payload) {
  creationState.generating = false;
  showPlanLoading(false);

  if (payload.success && payload.outline) {
    resetOutlineIndicators('success');
    appendCreationLog(`\n[Done] Outline ready.\n`);
    showOutlinePhase(payload.outline);
    if (outlineFeedback) outlineFeedback.value = '';
    setStatus('아웃라인을 검토하고 피드백을 입력하세요.');
  } else {
    resetOutlineIndicators('fail');
    appendCreationLog(`\n[Failed] ${payload.message}\n`);
    if (creationGenerate) {
      creationGenerate.disabled = false;
      creationGenerate.style.display = '';
    }
    // Also re-enable import submit button
    const importSubmitBtn = document.getElementById('import-submit');
    if (importSubmitBtn) importSubmitBtn.disabled = false;
    setStatus(`계획 실패: ${payload.message}`);
  }
}

// ── Load existing outline directly ──

export async function loadAndShowOutline() {
  try {
    const res = await fetch('/api/outline');
    if (!res.ok) { setStatus('이 덱에서 아웃라인을 찾을 수 없습니다.'); return; }
    const outline = await res.json();
    showCreationMode();
    await loadCreationModelOptions();
    showOutlinePhase(outline, { isExistingDeck: true });
    if (outlineFeedback) outlineFeedback.value = '';
    if (outlineRevise) outlineRevise.disabled = false;
    if (outlineApprove) outlineApprove.disabled = false;
    setStatus('아웃라인을 검토하고 피드백을 입력하세요.');
  } catch (err) {
    setStatus(`아웃라인 로드 실패: ${err.message}`);
  }
}

if (btnReviewOutline) {
  btnReviewOutline.addEventListener('click', loadAndShowOutline);
}
