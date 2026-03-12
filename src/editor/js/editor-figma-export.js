// editor-figma-export.js — Figma export: connection status, confirm modal, progress

import { currentSlideFile } from './editor-utils.js';
import {
  btnFigmaExport, figmaConnDot, figmaConfirmModal, figmaConfirmDesc,
  figmaConfirmActions, figmaProgress, figmaProgressFill, figmaProgressText,
  figmaSendCurrent, figmaSendAll, figmaCancel, figmaToast,
} from './editor-dom.js';

let figmaConnected = false;
let figmaExporting = false;

// ── Connection status ─────────────────────────────────────────────

export function onFigmaConnected(data) {
  figmaConnected = true;
  figmaConnDot.classList.add('connected');
  btnFigmaExport.disabled = false;
  btnFigmaExport.title = `Send to Figma (${data.clients || 1} plugin connected)`;
}

export function onFigmaDisconnected(data) {
  const clients = data.clients || 0;
  figmaConnected = clients > 0;
  if (figmaConnected) {
    figmaConnDot.classList.add('connected');
    btnFigmaExport.disabled = false;
    btnFigmaExport.title = `Send to Figma (${clients} plugin connected)`;
  } else {
    figmaConnDot.classList.remove('connected');
    btnFigmaExport.disabled = true;
    btnFigmaExport.title = 'Send to Figma (plugin not connected)';
  }
}

// ── Toast ─────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(message, type = '') {
  clearTimeout(toastTimer);
  figmaToast.textContent = message;
  figmaToast.className = 'figma-toast visible' + (type ? ` ${type}` : '');
  toastTimer = setTimeout(() => {
    figmaToast.classList.remove('visible');
  }, 4000);
}

// ── Confirm modal ─────────────────────────────────────────────────

function getViewportParams() {
  const presetSelect = document.querySelector('#svg-export-preset');
  const widthInput = document.querySelector('#svg-export-width');
  const heightInput = document.querySelector('#svg-export-height');
  const scaleInput = document.querySelector('#svg-export-scale');

  let width = 1920, height = 1080;
  if (presetSelect) {
    if (presetSelect.value === 'custom') {
      width = Number(widthInput?.value) || 1920;
      height = Number(heightInput?.value) || 1080;
    } else {
      const [w, h] = presetSelect.value.split('x').map(Number);
      width = w || 1920;
      height = h || 1080;
    }
  }

  const scale = Number(scaleInput?.value) || 1;
  return { width, height, scale };
}

function resetModal() {
  figmaProgress.classList.remove('active');
  figmaProgressFill.style.width = '0%';
  figmaProgressText.textContent = '';
  figmaSendCurrent.disabled = false;
  figmaSendAll.disabled = false;
  figmaConfirmActions.hidden = false;
  figmaExporting = false;
}

export function openFigmaModal() {
  if (!figmaConnected) return;
  resetModal();
  const slide = currentSlideFile();
  figmaConfirmDesc.textContent = slide
    ? `Send slides to Figma. Current: ${slide}`
    : 'Send all slides to Figma.';
  figmaConfirmModal.hidden = false;
}

export function closeFigmaModal() {
  figmaConfirmModal.hidden = true;
  resetModal();
}

async function sendToFigma(scope) {
  if (figmaExporting) return;
  figmaExporting = true;
  figmaSendCurrent.disabled = true;
  figmaSendAll.disabled = true;

  const { width, height, scale } = getViewportParams();
  const body = { scope, width, height, scale };
  if (scope === 'current') {
    body.slide = currentSlideFile();
  }

  figmaProgress.classList.add('active');
  figmaProgressText.textContent = 'Starting...';
  figmaProgressFill.style.width = '0%';

  try {
    const res = await fetch('/api/figma-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Export failed');
    }

    // Response received — progress will come via SSE
    const data = await res.json();
    figmaProgressText.textContent = `0 / ${data.total}`;
  } catch (err) {
    figmaProgressText.textContent = `Error: ${err.message}`;
    showToast(err.message, 'error');
    figmaSendCurrent.disabled = false;
    figmaSendAll.disabled = false;
    figmaExporting = false;
  }
}

// ── SSE event handlers ────────────────────────────────────────────

export function onFigmaExportProgress(data) {
  const pct = Math.round((data.current / data.total) * 100);
  figmaProgressFill.style.width = `${pct}%`;
  figmaProgressText.textContent = `${data.current} / ${data.total} — ${data.file}`;
}

export function onFigmaExportFinished(data) {
  figmaProgressFill.style.width = '100%';

  if (data.success) {
    figmaProgressText.textContent = data.message || 'Done!';
    showToast(data.message || `Sent ${data.total} slides to Figma.`, 'success');
    // Auto-close modal after short delay
    setTimeout(closeFigmaModal, 1500);
  } else {
    figmaProgressText.textContent = data.message || 'Export failed.';
    showToast(data.message || 'Figma export failed.', 'error');
    figmaSendCurrent.disabled = false;
    figmaSendAll.disabled = false;
  }
  figmaExporting = false;
}

// ── Event bindings ────────────────────────────────────────────────

btnFigmaExport.addEventListener('click', openFigmaModal);
figmaCancel.addEventListener('click', closeFigmaModal);
figmaSendCurrent.addEventListener('click', () => sendToFigma('current'));
figmaSendAll.addEventListener('click', () => sendToFigma('all'));

figmaConfirmModal.addEventListener('click', (e) => {
  if (e.target === figmaConfirmModal && !figmaExporting) closeFigmaModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !figmaConfirmModal.hidden && !figmaExporting) {
    closeFigmaModal();
  }
});
