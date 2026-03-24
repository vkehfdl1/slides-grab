// editor-pack.js — Template pack gallery for creation mode

import { creationState } from './editor-state.js';

let packsData = [];
let selectedPackId = 'simple_light';
let activePreviewType = '';

/** Pack descriptions — client-side lookup */
const PACK_DESC = {
  'simple_light': 'Clean white + orange accent',
  'simple_dark': 'Dark minimal monochrome',
  'midnight': 'Deep navy + gold premium dark',
  'corporate': 'White + navy blue business',
  'creative': 'Gradient pink/indigo creative',
  'grab': 'Modern business inline style',
  'mobile_strategy': 'Dark rose + pink mobile strategy',
  'black_rainbow': 'Black with rainbow accents',
};

/** Sort order: simple_light first, then alphabetical */
function sortPacks(packs) {
  return [...packs].sort((a, b) => {
    if (a.id === 'simple_light') return -1;
    if (b.id === 'simple_light') return 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Load packs from server and render the gallery.
 */
export async function loadPacks() {
  try {
    const res = await fetch('/api/packs');
    if (!res.ok) return;
    packsData = sortPacks(await res.json());
  } catch {
    packsData = [];
  }

  renderPackGrid();
  updateToggleText();
}

/**
 * Get the currently selected pack ID.
 */
export function getSelectedPack() {
  return selectedPackId;
}

/**
 * Set the selected pack by ID.
 */
export function setSelectedPack(packId) {
  selectedPackId = packId;
  creationState.packId = packId;
  updatePackSelection();
  updateToggleText();
  renderPackDetail();
}

/** Sanitize a CSS color value to prevent injection. */
function safeColor(v, fallback) {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

/** Update the collapsible toggle text with current pack name. */
function updateToggleText() {
  const el = document.getElementById('pack-toggle-current');
  if (!el) return;
  const pack = packsData.find(p => p.id === selectedPackId);
  el.textContent = pack?.name || selectedPackId;
}

function renderPackGrid() {
  const grid = document.getElementById('pack-grid');
  if (!grid) return;

  grid.innerHTML = '';

  for (const pack of packsData) {
    const card = document.createElement('button');
    card.className = 'pack-card' + (pack.id === selectedPackId ? ' selected' : '');
    card.dataset.packId = pack.id;
    card.type = 'button';

    const colors = pack.colors || {};
    const bg = safeColor(colors['bg-primary'], '#333');
    const bgSec = safeColor(colors['bg-secondary'], '#444');
    const accent = safeColor(colors.accent, '#666');
    const textPrimary = safeColor(colors['text-primary'], '#fff');
    const textSecondary = safeColor(colors['text-secondary'], '#aaa');
    const templates = pack.templates || [];

    // Color swatch bar
    const swatches = document.createElement('div');
    swatches.className = 'pack-swatches';
    for (const c of [bg, bgSec, accent, textPrimary, textSecondary]) {
      const swatch = document.createElement('div');
      swatch.style.background = c;
      swatches.appendChild(swatch);
    }

    // Stylized slide preview
    const preview = document.createElement('div');
    preview.className = 'pack-preview';
    preview.style.background = bg;

    const title = document.createElement('div');
    title.className = 'pack-slide-title';
    title.style.background = textPrimary;

    const accentBar = document.createElement('div');
    accentBar.className = 'pack-slide-accent';
    accentBar.style.background = accent;

    const body = document.createElement('div');
    body.className = 'pack-slide-body';
    body.style.background = textSecondary;

    const bodySm = document.createElement('div');
    bodySm.className = 'pack-slide-body-sm';
    bodySm.style.background = textSecondary;

    preview.append(title, accentBar, body, bodySm);

    // Info section
    const info = document.createElement('div');
    info.className = 'pack-info';

    const infoRow = document.createElement('div');
    infoRow.className = 'pack-info-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pack-name';
    nameSpan.textContent = pack.name || pack.id;

    const countSpan = document.createElement('span');
    countSpan.className = 'pack-template-count';
    countSpan.textContent = `${templates.length}`;

    infoRow.append(nameSpan, countSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'pack-desc';
    descSpan.textContent = PACK_DESC[pack.id] || '';

    info.append(infoRow);
    if (descSpan.textContent) info.append(descSpan);

    card.append(swatches, preview, info);

    card.addEventListener('click', () => {
      selectedPackId = pack.id;
      creationState.packId = pack.id;
      updatePackSelection();
      updateToggleText();
      renderPackDetail();
    });

    grid.appendChild(card);
  }
}

function updatePackSelection() {
  const grid = document.getElementById('pack-grid');
  if (!grid) return;

  for (const card of grid.querySelectorAll('.pack-card')) {
    card.classList.toggle('selected', card.dataset.packId === selectedPackId);
  }
}

/** Render the detail panel showing template types and live preview. */
function renderPackDetail() {
  const detail = document.getElementById('pack-detail');
  if (!detail) return;

  const pack = packsData.find(p => p.id === selectedPackId);
  if (!pack || !pack.templates?.length) {
    detail.hidden = true;
    return;
  }

  detail.hidden = false;

  const nameEl = document.getElementById('pack-detail-name');
  if (nameEl) nameEl.textContent = pack.name || pack.id;

  const templates = pack.templates || [];

  // Reset preview type if current selection isn't in this pack
  if (!templates.includes(activePreviewType)) {
    activePreviewType = templates.includes('cover') ? 'cover' : templates[0];
  }

  const typesEl = document.getElementById('pack-detail-types');
  if (typesEl) {
    typesEl.innerHTML = '';

    for (const tmpl of templates) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'template-chip' + (tmpl === activePreviewType ? ' active' : '');
      chip.textContent = tmpl;
      chip.dataset.template = tmpl;

      chip.addEventListener('click', () => {
        activePreviewType = tmpl;
        for (const c of typesEl.querySelectorAll('.template-chip')) {
          c.classList.toggle('active', c.dataset.template === tmpl);
        }
        loadTemplatePreview(pack.id, tmpl);
      });

      typesEl.appendChild(chip);
    }
  }

  // Load preview for the active type
  loadTemplatePreview(pack.id, activePreviewType);
}

/** Load a template into the preview iframe. */
function loadTemplatePreview(packId, templateName) {
  const iframe = document.getElementById('pack-preview-iframe');
  const skeleton = document.getElementById('pack-preview-skeleton');
  const wrapper = document.getElementById('pack-preview-wrapper');
  if (!iframe || !wrapper) return;

  // Pre-calculate scale before loading
  const wrapperWidth = wrapper.clientWidth || wrapper.offsetWidth || 600;
  const scale = wrapperWidth / 960;
  iframe.style.transform = `scale(${scale})`;

  // Show loading state
  if (skeleton) skeleton.style.display = 'flex';
  iframe.style.opacity = '0';

  const src = `/packs-preview/${encodeURIComponent(packId)}/templates/${encodeURIComponent(templateName)}.html`;
  iframe.src = src;

  iframe.onload = () => {
    // Re-calculate in case container resized
    const newWidth = wrapper.clientWidth || wrapper.offsetWidth || 600;
    const newScale = newWidth / 960;
    if (newScale > 0) iframe.style.transform = `scale(${newScale})`;
    iframe.style.opacity = '1';
    if (skeleton) skeleton.style.display = 'none';
  };

  // Fallback: show after 2s even if onload didn't fire
  setTimeout(() => {
    if (iframe.style.opacity === '0') {
      const fbWidth = wrapper.clientWidth || wrapper.offsetWidth || 600;
      iframe.style.transform = `scale(${fbWidth / 960})`;
      iframe.style.opacity = '1';
      if (skeleton) skeleton.style.display = 'none';
    }
  }, 2000);
}

// Lazy-load detail panel: only render when collapsible is opened
const collapsible = document.getElementById('pack-collapsible');
if (collapsible) {
  collapsible.addEventListener('toggle', () => {
    if (collapsible.open) {
      renderPackDetail();
    }
  });
}
