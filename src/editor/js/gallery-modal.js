// gallery-modal.js — Pack detail modal for the standalone gallery page

let commonTypes = {};
let activePreviewType = '';
let currentPack = null;

/** Detect the actual content dimensions inside an iframe. */
function detectIframeContentSize(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    const slide = doc.querySelector('.slide');
    if (slide) {
      const rect = slide.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return { w: rect.width, h: rect.height };
    }
    const body = doc.body;
    if (body) {
      const cs = iframe.contentWindow.getComputedStyle(body);
      const w = parseFloat(cs.width);
      const h = parseFloat(cs.height);
      if (w > 0 && h > 0) return { w, h };
    }
  } catch (_) { /* cross-origin */ }
  return { w: 960, h: 540 };
}

function loadModalPreview(packId, templateName) {
  const iframe = document.getElementById('gallery-preview-iframe');
  const skeleton = document.getElementById('gallery-preview-skeleton');
  const wrapper = document.getElementById('gallery-preview-wrapper');
  if (!iframe || !wrapper) return;

  const wrapperWidth = wrapper.clientWidth || 600;
  iframe.style.width = '960px';
  iframe.style.height = '540px';
  iframe.style.transform = `scale(${wrapperWidth / 960})`;
  iframe.style.opacity = '0';
  if (skeleton) skeleton.style.display = 'flex';

  iframe.src = `/packs-preview/${encodeURIComponent(packId)}/templates/${encodeURIComponent(templateName)}.html`;

  iframe.onload = () => {
    const { w, h } = detectIframeContentSize(iframe);
    iframe.style.width = w + 'px';
    iframe.style.height = h + 'px';
    const currentWidth = wrapper.clientWidth || wrapperWidth;
    iframe.style.transform = `scale(${currentWidth / w})`;
    iframe.style.opacity = '1';
    if (skeleton) skeleton.style.display = 'none';
  };

  setTimeout(() => {
    if (iframe.style.opacity === '0') {
      iframe.style.opacity = '1';
      if (skeleton) skeleton.style.display = 'none';
    }
  }, 2000);
}

function updateTypeDescription(templateName) {
  const descEl = document.getElementById('gallery-modal-desc');
  if (!descEl) return;
  const desc = commonTypes[templateName] || '';
  descEl.textContent = desc;
  descEl.style.display = desc ? 'block' : 'none';
}

function renderTemplateChips(pack) {
  const typesEl = document.getElementById('gallery-modal-types');
  if (!typesEl) return;
  typesEl.innerHTML = '';

  // Show only pack's own templates; fall back to full list for skin packs
  const templates = (pack.ownTemplates?.length ? pack.ownTemplates : pack.templates) || [];
  for (const tmpl of templates) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'gallery-modal-chip' + (tmpl === activePreviewType ? ' active' : '');
    chip.textContent = tmpl;
    chip.dataset.template = tmpl;

    chip.addEventListener('click', () => {
      activePreviewType = tmpl;
      for (const c of typesEl.querySelectorAll('.gallery-modal-chip')) {
        c.classList.toggle('active', c.dataset.template === tmpl);
      }
      updateTypeDescription(tmpl);
      loadModalPreview(pack.id, tmpl);
    });

    typesEl.appendChild(chip);
  }

  updateTypeDescription(activePreviewType);
}

function closePackModal() {
  const backdrop = document.getElementById('gallery-modal-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.body.style.overflow = '';
  const iframe = document.getElementById('gallery-preview-iframe');
  if (iframe) iframe.src = 'about:blank';
  currentPack = null;
}

/**
 * Open the modal for a specific pack.
 */
export function openPackModal(pack) {
  currentPack = pack;
  const backdrop = document.getElementById('gallery-modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = false;
  document.body.style.overflow = 'hidden';

  const nameEl = document.getElementById('gallery-modal-name');
  if (nameEl) nameEl.textContent = pack.name || pack.id;

  const useBtn = document.getElementById('gallery-modal-use-btn');
  if (useBtn) useBtn.href = `/?pack=${encodeURIComponent(pack.id)}`;

  // Show only pack's own templates; fall back to full list for skin packs
  const templates = (pack.ownTemplates?.length ? pack.ownTemplates : pack.templates) || [];
  if (!templates.includes(activePreviewType)) {
    activePreviewType = templates.includes('cover') ? 'cover' : templates[0] || '';
  }

  renderTemplateChips(pack);
  loadModalPreview(pack.id, activePreviewType);
}

/**
 * Initialize modal event listeners. Call once after DOM is ready.
 */
export function initGalleryModal(types) {
  commonTypes = types || {};

  const closeBtn = document.getElementById('gallery-modal-close');
  const backdrop = document.getElementById('gallery-modal-backdrop');

  if (closeBtn) closeBtn.addEventListener('click', closePackModal);
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePackModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (!backdrop || backdrop.hidden) return;

    if (e.key === 'Escape') {
      closePackModal();
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const chips = [...document.querySelectorAll('#gallery-modal-types .gallery-modal-chip')];
      if (!chips.length) return;
      const idx = chips.findIndex(c => c.classList.contains('active'));
      const next = e.key === 'ArrowRight'
        ? (idx + 1) % chips.length
        : (idx - 1 + chips.length) % chips.length;
      chips[next].click();
    }
  });
}
