// editor-pdf-export.js — PDF export modal logic

import { currentSlideFile } from './editor-utils.js';

const modal = document.querySelector('#pdf-export-modal');
const progressDiv = document.querySelector('#pdf-export-progress');
const progressFill = document.querySelector('#pdf-export-progress-fill');
const progressText = document.querySelector('#pdf-export-progress-text');
const btnStart = document.querySelector('#pdf-export-start');
const btnCancel = document.querySelector('#pdf-export-cancel');

let activeExportId = null;

function resetProgress() {
  progressDiv.classList.remove('active');
  progressFill.style.width = '0%';
  progressText.textContent = '';
  btnStart.disabled = false;
  activeExportId = null;
}

export function openPdfExportModal() {
  resetProgress();
  modal.hidden = false;
}

export function closePdfExportModal() {
  modal.hidden = true;
  resetProgress();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}

export async function startPdfExport() {
  const scopeRadio = modal.querySelector('input[name="pdf-export-scope"]:checked');
  const scope = scopeRadio ? scopeRadio.value : 'all';
  const slide = currentSlideFile();

  btnStart.disabled = true;
  progressDiv.classList.add('active');
  progressText.textContent = 'Generating PDF...';
  progressFill.style.width = '10%';

  try {
    if (scope === 'current') {
      const res = await fetch('/api/pdf-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, slide }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'PDF export failed');
      }

      const blob = await res.blob();
      const filename = slide ? slide.replace(/\.html$/i, '.pdf') : 'slide.pdf';
      triggerDownload(blob, filename);

      progressFill.style.width = '100%';
      progressText.textContent = `Downloaded: ${filename}`;
      btnStart.disabled = false;
    } else {
      // scope === 'all' — async with SSE progress
      const res = await fetch('/api/pdf-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'PDF export failed');
      }

      const { exportId, total } = await res.json();
      activeExportId = exportId;
      progressText.textContent = `0 / ${total}`;
    }
  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
    btnStart.disabled = false;
  }
}

export function onPdfExportProgress(data) {
  if (data.exportId !== activeExportId) return;
  const pct = Math.round((data.current / data.total) * 100);
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${data.current} / ${data.total} — ${data.file}`;
}

export async function onPdfExportFinished(data) {
  if (data.exportId !== activeExportId) return;

  if (data.success && data.downloadUrl) {
    progressFill.style.width = '100%';
    progressText.textContent = 'Downloading PDF...';

    const a = document.createElement('a');
    a.href = data.downloadUrl;
    a.download = 'slides.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();

    progressText.textContent = data.message || 'PDF export complete.';
  } else {
    progressText.textContent = data.message || 'PDF export failed.';
  }

  btnStart.disabled = false;
  activeExportId = null;
}

// Event bindings
btnCancel.addEventListener('click', closePdfExportModal);
btnStart.addEventListener('click', startPdfExport);

modal.addEventListener('click', (e) => {
  if (e.target === modal) closePdfExportModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) {
    closePdfExportModal();
  }
});
