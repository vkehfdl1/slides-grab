// editor-svg-export.js — SVG/PNG export modal logic

import { currentSlideFile } from './editor-utils.js';

const modal = document.querySelector('#svg-export-modal');
const presetSelect = document.querySelector('#svg-export-preset');
const customSizeDiv = document.querySelector('#svg-export-custom-size');
const widthInput = document.querySelector('#svg-export-width');
const heightInput = document.querySelector('#svg-export-height');
const scaleInput = document.querySelector('#svg-export-scale');
const formatSelect = document.querySelector('#svg-export-format');
const progressDiv = document.querySelector('#svg-export-progress');
const progressFill = document.querySelector('#svg-export-progress-fill');
const progressText = document.querySelector('#svg-export-progress-text');
const btnStart = document.querySelector('#svg-export-start');
const btnCancel = document.querySelector('#svg-export-cancel');

let activeExportId = null;

// Sync custom size inputs from preset
function syncSizeFromPreset() {
  const isCustom = presetSelect.value === 'custom';
  customSizeDiv.hidden = !isCustom;
  if (!isCustom) {
    const [w, h] = presetSelect.value.split('x').map(Number);
    widthInput.value = w;
    heightInput.value = h;
  }
}

// Preset changes
presetSelect.addEventListener('change', syncSizeFromPreset);

// Sync on init
syncSizeFromPreset();

function getExportParams() {
  const scopeRadio = modal.querySelector('input[name="svg-export-scope"]:checked');
  const scope = scopeRadio ? scopeRadio.value : 'current';

  let width, height;
  if (presetSelect.value === 'custom') {
    width = Number(widthInput.value) || 1280;
    height = Number(heightInput.value) || 720;
  } else {
    const [w, h] = presetSelect.value.split('x').map(Number);
    width = w;
    height = h;
  }

  const rawFormat = formatSelect.value;
  const outline = rawFormat === 'svg-outline';
  const format = outline ? 'svg' : rawFormat;

  return {
    scope,
    slide: currentSlideFile(),
    format,
    outline,
    scale: Number(scaleInput.value) || 1,
    width,
    height,
  };
}

function resetProgress() {
  progressDiv.classList.remove('active');
  progressFill.style.width = '0%';
  progressText.textContent = '';
  btnStart.disabled = false;
  activeExportId = null;
}

export function openExportModal() {
  resetProgress();
  modal.hidden = false;
}

export function closeExportModal() {
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

export async function startExport() {
  const params = getExportParams();
  btnStart.disabled = true;

  try {
    if (params.scope === 'current') {
      progressDiv.classList.add('active');
      progressText.textContent = 'Exporting...';
      progressFill.style.width = '50%';

      const res = await fetch('/api/svg-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Export failed');
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch ? filenameMatch[1] : `slide.${params.format}`;

      const blob = await res.blob();
      triggerDownload(blob, filename);

      progressFill.style.width = '100%';
      progressText.textContent = `Downloaded: ${filename}`;
      btnStart.disabled = false;
    } else {
      // scope === 'all'
      progressDiv.classList.add('active');
      progressText.textContent = 'Starting export...';
      progressFill.style.width = '0%';

      const res = await fetch('/api/svg-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Export failed');
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

export function onSvgExportProgress(data) {
  if (data.exportId !== activeExportId) return;
  const pct = Math.round((data.current / data.total) * 100);
  progressFill.style.width = `${pct}%`;
  progressText.textContent = `${data.current} / ${data.total} — ${data.file}`;
}

export async function onSvgExportFinished(data) {
  console.log('[svg-export] onSvgExportFinished:', data);
  if (data.exportId !== activeExportId) {
    console.warn('[svg-export] exportId mismatch:', data.exportId, '!==', activeExportId);
    return;
  }

  if (data.success && data.files && data.files.length > 0) {
    progressFill.style.width = '100%';

    if (data.zipUrl) {
      // Download as a single ZIP — use direct link click (most reliable)
      progressText.textContent = `Downloading ZIP (${data.files.length} files)...`;
      const a = document.createElement('a');
      a.href = data.zipUrl;
      a.download = 'slides-export.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      // Fallback: individual file downloads
      progressText.textContent = `Downloading ${data.files.length} files...`;
      for (const file of data.files) {
        try {
          const res = await fetch(`/api/svg-export/${data.exportId}/${file}`);
          if (res.ok) {
            const blob = await res.blob();
            triggerDownload(blob, file);
            await new Promise((r) => setTimeout(r, 300));
          }
        } catch (err) {
          console.error('[svg-export] individual download error:', err);
        }
      }
    }

    progressText.textContent = data.message || 'Export complete.';
  } else {
    progressText.textContent = data.message || 'Export failed.';
    console.error('[svg-export] Export failed:', data.message);
  }

  btnStart.disabled = false;
  activeExportId = null;
}

// Event bindings
btnCancel.addEventListener('click', closeExportModal);
btnStart.addEventListener('click', startExport);

// Close on overlay click
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeExportModal();
});

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) {
    closeExportModal();
  }
});
