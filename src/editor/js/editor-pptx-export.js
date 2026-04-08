// editor-pptx-export.js — PPTX export modal logic

import { state } from './editor-state.js';

const modal = document.querySelector('#pptx-export-modal');
const progressDiv = document.querySelector('#pptx-export-progress');
const progressFill = document.querySelector('#pptx-export-progress-fill');
const progressText = document.querySelector('#pptx-export-progress-text');
const btnStart = document.querySelector('#pptx-export-start');
const btnCancel = document.querySelector('#pptx-export-cancel');

let activeExportId = null;

function resetProgress() {
  if (progressDiv) progressDiv.classList.remove('active');
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '';
  if (btnStart) btnStart.disabled = false;
  activeExportId = null;
}

export function openPptxExportModal() {
  if (!modal) return;
  resetProgress();
  modal.hidden = false;
}

export function closePptxExportModal() {
  if (!modal) return;
  modal.hidden = true;
  resetProgress();
  document.getElementById('export-dropdown')?.classList.remove('open');
}

async function startPptxExport() {
  if (!btnStart) return;
  btnStart.disabled = true;
  if (progressDiv) progressDiv.classList.add('active');
  if (progressText) progressText.textContent = 'Generating PPTX...';
  if (progressFill) progressFill.style.width = '10%';

  try {
    const res = await fetch('/api/pptx-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: document.querySelector('input[name="pptx-export-mode"]:checked')?.value || 'image',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'PPTX export failed');
    }

    const { exportId, total } = await res.json();
    activeExportId = exportId;
    if (progressText) progressText.textContent = `0 / ${total}`;
  } catch (err) {
    if (progressText) progressText.textContent = `Error: ${err.message}`;
    if (btnStart) btnStart.disabled = false;
  }
}

export function onPptxExportProgress(data) {
  if (data.exportId !== activeExportId) return;
  const pct = Math.round((data.current / data.total) * 100);
  if (progressFill) progressFill.style.width = `${pct}%`;
  if (progressText) progressText.textContent = `${data.current} / ${data.total} — ${data.file}`;
}

export function onPptxExportFinished(data) {
  if (data.exportId !== activeExportId) return;

  if (data.success && data.downloadUrl) {
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = 'Downloading PPTX...';

    const a = document.createElement('a');
    a.href = data.downloadUrl;
    a.download = `${state.deckName || 'slides'}.pptx`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (progressText) progressText.textContent = data.message || 'PPTX export complete.';
    setTimeout(closePptxExportModal, 1500);
  } else {
    if (progressText) progressText.textContent = data.message || 'PPTX export failed.';
    if (btnStart) btnStart.disabled = false;
  }

  activeExportId = null;
}

// Event bindings
if (btnCancel) btnCancel.addEventListener('click', closePptxExportModal);
if (btnStart) btnStart.addEventListener('click', startPptxExport);

if (modal) {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePptxExportModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) {
      closePptxExportModal();
    }
  });
}
