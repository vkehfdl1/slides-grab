// editor-pack.js — Template pack selector (gallery-style, integrated into create screen)

import { creationState } from './editor-state.js';

let packsData = [];
let selectedPackId = 'simple_light';
let previewCssLoaded = false;

/** Sort by order from pack.json, simple_light first */
function sortPacks(packs) {
  return [...packs].sort((a, b) => {
    if (a.id === 'simple_light') return -1;
    if (b.id === 'simple_light') return 1;
    return (a.order || 999) - (b.order || 999);
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

  // Load all preview CSS once
  if (!previewCssLoaded) {
    const cssPromises = packsData.map(p =>
      fetch(`/api/packs/${encodeURIComponent(p.id)}/preview.css`)
        .then(r => r.ok ? r.text() : '')
        .catch(() => '')
    );
    const cssTexts = await Promise.all(cssPromises);
    const styleEl = document.createElement('style');
    styleEl.textContent = cssTexts.filter(Boolean).join('\n');
    document.head.appendChild(styleEl);
    previewCssLoaded = true;
  }

  renderPackGrid();
  updateToggleText();
}

export function getSelectedPack() {
  return selectedPackId;
}

export function setSelectedPack(packId) {
  selectedPackId = packId;
  creationState.packId = packId;
  updatePackSelection();
  updateToggleText();
}

function updateToggleText() {
  const el = document.getElementById('pack-toggle-current');
  if (!el) return;
  const pack = packsData.find(p => p.id === selectedPackId);
  el.textContent = pack?.name || selectedPackId;
}

/** Create a gallery-style pack card (number + name + desc + tags) */
function createPackCard(pack, idx) {
  const card = document.createElement('button');
  card.className = 'pack-card' + (pack.id === selectedPackId ? ' selected' : '');
  card.dataset.packId = pack.id;
  card.type = 'button';

  // CSS art preview
  const preview = document.createElement('div');
  preview.className = `pack-preview preview preview-${pack.id}`;
  preview.innerHTML = '<div class="el el-1"></div><div class="el el-2"></div><div class="el el-3"></div>';

  // Info
  const info = document.createElement('div');
  info.className = 'pack-card-info';

  // Name
  const name = document.createElement('div');
  name.className = 'pack-card-name';
  name.textContent = pack.name || pack.id;

  // Description (prefer pack description, fall back to bestFor)
  const desc = document.createElement('div');
  desc.className = 'pack-card-desc';
  desc.textContent = pack.description || pack.bestFor || '';

  // Use-case tags (Korean)
  const tags = document.createElement('div');
  tags.className = 'pack-card-tags';
  const tagList = pack.tags || [];
  tagList.slice(0, 3).forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'pack-card-tag';
    tag.textContent = t;
    tags.appendChild(tag);
  });

  info.append(name);
  if (desc.textContent) info.appendChild(desc);
  if (tagList.length) info.appendChild(tags);

  card.append(preview, info);
  return card;
}

function renderPackGrid() {
  const grid = document.getElementById('pack-grid');
  if (!grid) return;

  grid.innerHTML = '';

  const existingLink = grid.parentNode?.querySelector('.pack-browse-all');
  if (existingLink) existingLink.remove();

  const packGrid = document.createElement('div');
  packGrid.className = 'pack-grid-all';

  packsData.forEach((pack, idx) => {
    const card = createPackCard(pack, idx);
    card.addEventListener('click', () => {
      selectedPackId = pack.id;
      creationState.packId = pack.id;
      updatePackSelection();
      updateToggleText();
    });
    packGrid.appendChild(card);
  });

  grid.appendChild(packGrid);
}

function updatePackSelection() {
  const grid = document.getElementById('pack-grid');
  if (!grid) return;

  for (const card of grid.querySelectorAll('.pack-card')) {
    card.classList.toggle('selected', card.dataset.packId === selectedPackId);
  }
}

// ── Modal handlers (keep for backward compat) ──
const modalCloseBtn = document.getElementById('pack-modal-close');
const modalBackdrop = document.getElementById('pack-modal-backdrop');

function closePackModal() {
  if (modalBackdrop) modalBackdrop.hidden = true;
}

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closePackModal);
if (modalBackdrop) modalBackdrop.addEventListener('click', (e) => {
  if (e.target === modalBackdrop) closePackModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden) closePackModal();
});
