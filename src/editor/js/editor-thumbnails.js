// editor-thumbnails.js — Slide thumbnail strip rendering

import { state } from './editor-state.js';
import { slideStrip } from './editor-dom.js';

export function renderThumbnailStrip() {
  if (!slideStrip) return;
  slideStrip.innerHTML = '';

  state.slides.forEach((slide, i) => {
    const thumb = document.createElement('button');
    thumb.className = 'slide-thumb' + (i === state.currentIndex ? ' active' : '');
    thumb.setAttribute('role', 'tab');
    thumb.setAttribute('aria-selected', i === state.currentIndex ? 'true' : 'false');
    thumb.setAttribute('aria-label', `Slide ${i + 1}`);
    thumb.title = slide;
    thumb.dataset.index = i;

    const num = document.createElement('span');
    num.className = 'slide-thumb-num';
    num.textContent = i + 1;
    thumb.appendChild(num);

    slideStrip.appendChild(thumb);
  });
}

export function updateActiveThumbnail(index) {
  if (!slideStrip) return;

  const thumbs = slideStrip.querySelectorAll('.slide-thumb');
  thumbs.forEach((thumb, i) => {
    const isActive = i === index;
    thumb.classList.toggle('active', isActive);
    thumb.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  // Scroll active thumb into view
  const active = slideStrip.querySelector('.slide-thumb.active');
  if (active) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}
