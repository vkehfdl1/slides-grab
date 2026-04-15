// gallery-modal.js — Pack detail modal for the gallery page

let currentPack = null;

function closePackModal() {
  const backdrop = document.getElementById('gallery-modal-backdrop');
  if (backdrop) backdrop.hidden = true;
  document.body.style.overflow = '';
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

  const descEl = document.getElementById('gallery-modal-desc');
  if (descEl) {
    descEl.textContent = pack.description || pack.bestFor || '';
    descEl.style.display = descEl.textContent ? 'block' : 'none';
  }

  const useBtn = document.getElementById('gallery-modal-use-btn');
  if (useBtn) useBtn.href = `/?pack=${encodeURIComponent(pack.id)}`;
}

/**
 * Initialize modal event listeners. Call once after DOM is ready.
 */
export function initGalleryModal() {
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
    if (e.key === 'Escape') closePackModal();
  });
}
