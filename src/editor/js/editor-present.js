// editor-present.js — Fullscreen presentation mode with fade transitions

import { state, SLIDE_W, SLIDE_H } from './editor-state.js';
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
  overlay.tabIndex = -1;
  if (notesBar) notesBar.hidden = true;

  // Request browser fullscreen on the overlay
  try { await overlay.requestFullscreen?.(); } catch { /* user denied or unsupported */ }

  await showSlide(presentIndex);
  fitIframe();
  overlay.focus();

  document.addEventListener('keydown', onPresentKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('resize', fitIframe);
}

export function exitPresentationMode() {
  if (!active) return;
  active = false;

  if (iframe) {
    try { iframe.contentWindow?.removeEventListener('keydown', onIframeKeydown); } catch { /* ok */ }
  }

  // Exit browser fullscreen if active
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }

  if (overlay) overlay.hidden = true;
  if (notesBar) notesBar.hidden = true;
  notesVisible = false;

  document.removeEventListener('keydown', onPresentKeydown);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  window.removeEventListener('resize', fitIframe);
}

/** If user exits fullscreen via browser (e.g. Esc handled by browser), also exit presentation mode */
function onFullscreenChange() {
  if (!document.fullscreenElement && active) {
    exitPresentationMode();
  }
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
    bindIframeKeydown(iframe);
    fitIframe();
    iframe.classList.remove('fade-out');
    if (overlay) overlay.focus();
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
  const key = event.key;
  const code = event.code;

  // Escape — exit (note: in fullscreen the browser may consume the first Esc)
  if (key === 'Escape') {
    event.preventDefault();
    exitPresentationMode();
    return;
  }

  // Next slide
  if (key === 'ArrowRight' || key === 'ArrowDown' || key === ' ' || key === 'PageDown') {
    event.preventDefault();
    nextSlide();
    return;
  }

  // Previous slide
  if (key === 'ArrowLeft' || key === 'ArrowUp' || key === 'PageUp') {
    event.preventDefault();
    prevSlide();
    return;
  }

  // N — toggle notes (code-based for Korean IME)
  if (code === 'KeyN') {
    event.preventDefault();
    toggleNotes();
    return;
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
  let slideW = SLIDE_W;
  let slideH = SLIDE_H;
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

  // Scale to fit — no upper cap so slides fill the screen in fullscreen
  const scaleX = availW / slideW;
  const scaleY = availH / slideH;
  const scale = Math.min(scaleX, scaleY);

  iframe.style.width = `${slideW}px`;
  iframe.style.height = `${slideH}px`;
  iframe.style.transform = `scale(${scale})`;
  iframe.style.transformOrigin = 'center center';
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Forward keydown events from inside the presentation iframe to the main handler */
function bindIframeKeydown(iframeEl) {
  try {
    const win = iframeEl.contentWindow;
    if (!win) return;
    win.removeEventListener('keydown', onIframeKeydown);
    win.addEventListener('keydown', onIframeKeydown);
  } catch { /* cross-origin */ }
}

function onIframeKeydown(event) {
  onPresentKeydown(event);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForIframeLoad(iframeEl) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      iframeEl.removeEventListener('load', onLoad);
      resolve();
    }, 3000);
    const onLoad = () => {
      clearTimeout(timer);
      iframeEl.removeEventListener('load', onLoad);
      resolve();
    };
    iframeEl.addEventListener('load', onLoad);
  });
}
