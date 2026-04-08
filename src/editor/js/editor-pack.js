// editor-pack.js — Template pack selector (gallery-style, integrated into create screen)

import { creationState } from './editor-state.js';

let packsData = [];
let selectedPackId = 'auto';
let previewCssLoaded = false;

/** Sort packs: pinned order first, then by pack.json order */
const pinnedOrder = ['hancom-corporate', 'simple_light', 'simple-dark'];
function sortPacks(packs) {
  return [...packs].sort((a, b) => {
    const ai = pinnedOrder.indexOf(a.id);
    const bi = pinnedOrder.indexOf(b.id);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
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
  if (selectedPackId === 'auto') {
    el.textContent = 'AI 추천';
  } else {
    const pack = packsData.find(p => p.id === selectedPackId);
    el.textContent = pack?.name || selectedPackId;
  }
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

  // AI 추천 카드 (첫 번째)
  const autoCard = document.createElement('button');
  autoCard.className = 'pack-card pack-card-auto' + (selectedPackId === 'auto' ? ' selected' : '');
  autoCard.dataset.packId = 'auto';
  autoCard.type = 'button';
  autoCard.innerHTML = `
    <div class="pack-preview pack-preview-auto">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5L18.2 21 12 16.5 5.8 21l2.4-7.1L2 9.4h7.6z"/>
      </svg>
    </div>
    <div class="pack-card-info">
      <div class="pack-card-name">AI 추천</div>
      <div class="pack-card-desc">주제에 가장 어울리는 템플릿을 AI가 선택</div>
    </div>
  `;
  autoCard.addEventListener('click', () => setSelectedPack('auto'));
  packGrid.appendChild(autoCard);

  // 나머지 팩 카드
  packsData.forEach((pack, idx) => {
    const card = createPackCard(pack, idx);
    card.addEventListener('click', () => setSelectedPack(pack.id));
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
