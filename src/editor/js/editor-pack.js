// editor-pack.js — Template pack gallery for creation mode

import { creationState } from './editor-state.js';

let packsData = [];
let selectedPackId = 'figma-default';

/**
 * Load packs from server and render the gallery.
 */
export async function loadPacks() {
  try {
    const res = await fetch('/api/packs');
    if (!res.ok) return;
    packsData = await res.json();
  } catch {
    packsData = [];
  }

  renderPackGrid();
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
    const bg = colors['bg-primary'] || '#333';
    const accent = colors.accent || '#666';
    const textPrimary = colors['text-primary'] || '#fff';

    card.innerHTML = `
      <div class="pack-preview">
        <img src="/api/packs/${pack.id}/preview" loading="lazy" alt="${pack.name}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="pack-preview-fallback" style="display:none;background:${bg}">
          <div class="pack-preview-accent" style="background:${accent}"></div>
          <div class="pack-preview-lines">
            <div style="background:${textPrimary};opacity:0.5;width:60%;height:3px;border-radius:1px"></div>
            <div style="background:${textPrimary};opacity:0.25;width:40%;height:2px;border-radius:1px;margin-top:4px"></div>
          </div>
        </div>
      </div>
      <span class="pack-name">${pack.name}</span>
    `;

    card.addEventListener('click', () => {
      selectedPackId = pack.id;
      creationState.packId = pack.id;
      updatePackSelection();
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
