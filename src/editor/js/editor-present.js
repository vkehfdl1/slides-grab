// editor-present.js — Fullscreen presentation mode with fade transitions

import { state } from './editor-state.js';
import { currentSlideFile } from './editor-utils.js';
import { getCurrentNotesText, loadNotes } from './editor-notes.js';

/** Whether we are in presentation mode */
let active = false;

/** Current presentation slide index */
let presentIndex = 0;

/** Whether notes bar is visible */
let notesVisible = false;

/** DOM references (resolved lazily) */
let overlay = null;
let iframe = null;
let counter = null;
let notesBar = null;
let notesText = null;

function resolveDOM() {
  overlay = document.getElementById('present-overlay');
  iframe = document.getElementById('present-slide-iframe');
  counter = document.getElementById('present-counter');
  notesBar = document.getElementById('present-notes-bar');
  notesText = document.getElementById('present-notes-text');
}

// ── Public API ──────────────────────────────────────────────────────

export function isPresenting() {
  return active;
}

export async function enterPresentationMode() {
  if (active) return;
  resolveDOM();
  if (!overlay || !iframe) return;
  if (state.slides.length === 0) return;

  active = true;
  presentIndex = state.currentIndex;
  notesVisible = false;

  overlay.hidden = false;
  if (notesBar) notesBar.hidden = true;

  await showSlide(presentIndex);
  fitIframe();

  document.addEventListener('keydown', onPresentKeydown);
  window.addEventListener('resize', fitIframe);
}

export function exitPresentationMode() {
  if (!active) return;
  active = false;

  if (overlay) overlay.hidden = true;
  if (notesBar) notesBar.hidden = true;
  notesVisible = false;

  document.removeEventListener('keydown', onPresentKeydown);
  window.removeEventListener('resize', fitIframe);
}

// ── Navigation ──────────────────────────────────────────────────────

async function showSlide(index) {
  if (index < 0 || index >= state.slides.length) return;
  presentIndex = index;

  const slideFile = state.slides[presentIndex];

  // Fade out
  if (iframe) {
    iframe.classList.add('fade-out');
    await delay(150);
  }

  // Load the slide
  if (iframe) {
    iframe.src = `/slides/${slideFile}`;
    await waitForIframeLoad(iframe);
    fitIframe();
    iframe.classList.remove('fade-out');
  }

  // Update counter
  if (counter) {
    counter.textContent = `${presentIndex + 1} / ${state.slides.length}`;
  }

  // Load notes for the new slide
  await loadNotes(slideFile);
  updateNotesDisplay();
}

async function nextSlide() {
  if (presentIndex < state.slides.length - 1) {
    await showSlide(presentIndex + 1);
  }
}

async function prevSlide() {
  if (presentIndex > 0) {
    await showSlide(presentIndex - 1);
  }
}

// ── Keyboard handler ────────────────────────────────────────────────

function onPresentKeydown(event) {
  if (!active) return;

  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      exitPresentationMode();
      break;
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
    case 'PageDown':
      event.preventDefault();
      nextSlide();
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      event.preventDefault();
      prevSlide();
      break;
    case 'Home':
      event.preventDefault();
      showSlide(0);
      break;
    case 'End':
      event.preventDefault();
      showSlide(state.slides.length - 1);
      break;
    case 'n':
    case 'N':
      event.preventDefault();
      toggleNotes();
      break;
    default:
      break;
  }
}

// ── Notes display ───────────────────────────────────────────────────

function toggleNotes() {
  notesVisible = !notesVisible;
  updateNotesDisplay();
}

function updateNotesDisplay() {
  if (!notesBar || !notesText) return;
  const text = getCurrentNotesText();
  if (notesVisible && text.trim()) {
    notesText.textContent = text;
    notesBar.hidden = false;
  } else {
    notesBar.hidden = true;
  }
}

// ── Layout ──────────────────────────────────────────────────────────

function fitIframe() {
  if (!iframe || !overlay) return;

  const container = overlay.querySelector('.present-slide-container');
  if (!container) return;

  // Reserve space for notes bar if visible
  const notesHeight = (notesBar && !notesBar.hidden) ? notesBar.offsetHeight : 0;
  const availW = window.innerWidth;
  const availH = window.innerHeight - notesHeight;

  // Detect slide dimensions from iframe content
  let slideW = 960;
  let slideH = 540;
  try {
    const doc = iframe.contentDocument;
    if (doc) {
      const slideEl = doc.querySelector('.slide') || doc.body;
      if (slideEl) {
        const cs = doc.defaultView.getComputedStyle(slideEl);
        const w = parseFloat(cs.width);
        const h = parseFloat(cs.height);
        if (w > 0 && h > 0) { slideW = w; slideH = h; }
      }
    }
  } catch { /* cross-origin */ }

  // Scale to fit
  const scaleX = availW / slideW;
  const scaleY = availH / slideH;
  const scale = Math.min(scaleX, scaleY, 1.5);

  iframe.style.width = `${slideW}px`;
  iframe.style.height = `${slideH}px`;
  iframe.style.transform = `scale(${scale})`;
  iframe.style.transformOrigin = 'center center';
}

// ── Helpers ─────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForIframeLoad(iframeEl) {
  return new Promise((resolve) => {
    const onLoad = () => {
      iframeEl.removeEventListener('load', onLoad);
      resolve();
    };
    iframeEl.addEventListener('load', onLoad);
    // Timeout fallback
    setTimeout(resolve, 3000);
  });
}
