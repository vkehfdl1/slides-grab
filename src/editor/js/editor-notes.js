// editor-notes.js — Presenter notes: load, save, auto-save panel

import { currentSlideFile } from './editor-utils.js';

/** @type {HTMLTextAreaElement|null} */
let notesTextarea = null;

/** @type {HTMLElement|null} */
let notesToggleBtn = null;

/** @type {HTMLElement|null} */
let notesSection = null;

/** Debounce timer for auto-save */
let saveTimer = null;

/** Track the slide file we last loaded notes for */
let loadedForSlide = '';

/** Whether the panel is expanded */
let expanded = false;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Initialize the notes panel: find DOM elements, set up event listeners.
 */
export function initNotesPanel() {
  notesTextarea = document.getElementById('notes-textarea');
  notesToggleBtn = document.getElementById('notes-toggle');
  notesSection = document.getElementById('notes-section');

  if (!notesTextarea || !notesSection) return;

  // Restore collapsed/expanded state from localStorage (default: expanded)
  const savedState = localStorage.getItem('sg-notes-expanded');
  expanded = savedState !== 'false';
  applyExpandedState();

  if (notesToggleBtn) {
    notesToggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      applyExpandedState();
      localStorage.setItem('sg-notes-expanded', expanded ? 'true' : 'false');
    });
  }

  // Auto-save on blur
  notesTextarea.addEventListener('blur', () => {
    flushSave();
  });

  // Auto-save after 1 second of inactivity
  notesTextarea.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      flushSave();
    }, 1000);
  });
}

/**
 * Load notes for a given slide file from the server.
 */
export async function loadNotes(slideFile) {
  if (!notesTextarea) return;

  // Flush any pending save for the previous slide first
  if (loadedForSlide && loadedForSlide !== slideFile) {
    flushSave();
  }

  loadedForSlide = slideFile;

  if (!slideFile) {
    notesTextarea.value = '';
    return;
  }

  try {
    const res = await fetch(`/api/slides/${encodeURIComponent(slideFile)}/notes`);
    if (res.ok) {
      const data = await res.json();
      // Only update if we're still on the same slide
      if (loadedForSlide === slideFile) {
        notesTextarea.value = data.notes || '';
      }
    } else {
      if (loadedForSlide === slideFile) {
        notesTextarea.value = '';
      }
    }
  } catch {
    if (loadedForSlide === slideFile) {
      notesTextarea.value = '';
    }
  }
}

/**
 * Save notes for the given slide file to the server.
 */
export async function saveNotes(slideFile, text) {
  if (!slideFile) return;
  try {
    await fetch(`/api/slides/${encodeURIComponent(slideFile)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: text }),
    });
  } catch {
    // silent — notes are non-critical
  }
}

/**
 * Get the current notes text (used by presentation mode).
 */
export function getCurrentNotesText() {
  return notesTextarea?.value || '';
}

// ── Internal helpers ────────────────────────────────────────────────

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const slide = loadedForSlide || currentSlideFile();
  if (!slide || !notesTextarea) return;
  saveNotes(slide, notesTextarea.value);
}

function applyExpandedState() {
  if (!notesSection) return;
  if (expanded) {
    notesSection.classList.add('expanded');
  } else {
    notesSection.classList.remove('expanded');
  }
  if (notesToggleBtn) {
    notesToggleBtn.setAttribute('aria-expanded', String(expanded));
  }
}
