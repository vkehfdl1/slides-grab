// editor-bbox.js — BBox drawing, rendering, XPath, target extraction

import { state, SLIDE_W, SLIDE_H, TOOL_MODE_DRAW } from './editor-state.js';
import {
  slideIframe, slideStage, slideWrapper, bboxLayer, drawLayer, drawBox,
  bboxCountEl, contextChipList, sessionFileChip,
} from './editor-dom.js';
import {
  currentSlideFile, getSlideState, normalizeBoxStatus, escapeHtml,
  randomId, setStatus, clamp,
} from './editor-utils.js';

// Late-binding callback for updateSendState (avoids circular dependency)
let _onBboxChange = () => {};
export function onBboxChange(fn) { _onBboxChange = fn; }

export function scaleSlide() {
  const padX = 12;
  const padY = 12;
  const availW = slideStage.clientWidth - padX;
  const availH = slideStage.clientHeight - padY;
  if (availW <= 0 || availH <= 0) return;

  const scale = Math.min(availW / SLIDE_W, availH / SLIDE_H, 1);
  slideWrapper.style.transform = `scale(${scale})`;
}

export function renderContextChips() {
  if (!contextChipList) return;
  const slide = currentSlideFile();
  if (!slide) {
    contextChipList.innerHTML = '';
    if (sessionFileChip) sessionFileChip.textContent = '--';
    return;
  }

  if (sessionFileChip) sessionFileChip.textContent = slide;

  const ss = getSlideState(slide);
  if (!Array.isArray(ss.boxes) || ss.boxes.length === 0) {
    contextChipList.innerHTML = '<span class="context-chip-empty">No bbox selected</span>';
    return;
  }

  contextChipList.innerHTML = ss.boxes
    .map((box, index) => {
      const statusClass = normalizeBoxStatus(box.status);
      const selectedClass = box.id === ss.selectedBoxId ? 'selected' : '';
      return [
        `<button class="context-chip ${statusClass} ${selectedClass}" data-chip-box-id="${escapeHtml(box.id)}" title="Focus bbox #${index + 1}">`,
        `#${index + 1}`,
        '</button>',
      ].join('');
    })
    .join('');
}

export function renderBboxes() {
  const slide = currentSlideFile();
  if (!slide) {
    bboxLayer.innerHTML = '';
    bboxCountEl.textContent = '0 pending \u00b7 0 review';
    renderContextChips();
    return;
  }

  const ss = getSlideState(slide);
  bboxLayer.innerHTML = ss.boxes
    .map((box, index) => {
      const statusClass = normalizeBoxStatus(box.status);
      const selectedClass = box.id === ss.selectedBoxId ? 'selected' : '';
      return [
        `<div class="bbox-item ${statusClass} ${selectedClass}" data-box-id="${escapeHtml(box.id)}" style="left:${box.x}px;top:${box.y}px;width:${box.width}px;height:${box.height}px;">`,
        `<div class="bbox-index">${index + 1}</div>`,
        `<div class="bbox-actions">`,
        `<button class="bbox-action-btn bbox-delete" data-box-delete="${escapeHtml(box.id)}" title="Delete bbox">\u00d7</button>`,
        `<button class="bbox-action-btn bbox-check" data-box-check="${escapeHtml(box.id)}" title="Confirm bbox">Check</button>`,
        `<button class="bbox-action-btn bbox-rerun" data-box-rerun="${escapeHtml(box.id)}" title="Mark bbox pending">Rerun</button>`,
        `</div>`,
        `</div>`,
      ].join('');
    })
    .join('');
  bboxLayer.classList.toggle('inert', state.toolMode !== TOOL_MODE_DRAW);

  const pendingCount = ss.boxes.filter((box) => normalizeBoxStatus(box.status) === 'pending').length;
  const reviewCount = ss.boxes.length - pendingCount;
  bboxCountEl.textContent = `${pendingCount} pending \u00b7 ${reviewCount} review`;
  renderContextChips();
  _onBboxChange();
}

export function clientToSlidePoint(clientX, clientY) {
  const rect = drawLayer.getBoundingClientRect();
  const relX = clamp((clientX - rect.left) / rect.width, 0, 1);
  const relY = clamp((clientY - rect.top) / rect.height, 0, 1);
  return {
    x: Math.round(relX * SLIDE_W),
    y: Math.round(relY * SLIDE_H),
  };
}

export function startDrawing(event) {
  if (state.toolMode !== TOOL_MODE_DRAW) return;
  if (event.button !== 0) return;
  event.preventDefault();

  state.drawing = true;
  state.drawStart = clientToSlidePoint(event.clientX, event.clientY);
  drawBox.style.display = 'block';
  drawBox.style.left = `${state.drawStart.x}px`;
  drawBox.style.top = `${state.drawStart.y}px`;
  drawBox.style.width = '1px';
  drawBox.style.height = '1px';
}

export function moveDrawing(event) {
  if (state.toolMode !== TOOL_MODE_DRAW) return;
  if (!state.drawing || !state.drawStart) return;
  const current = clientToSlidePoint(event.clientX, event.clientY);

  const x = Math.min(state.drawStart.x, current.x);
  const y = Math.min(state.drawStart.y, current.y);
  const width = Math.max(1, Math.abs(current.x - state.drawStart.x));
  const height = Math.max(1, Math.abs(current.y - state.drawStart.y));

  drawBox.style.left = `${x}px`;
  drawBox.style.top = `${y}px`;
  drawBox.style.width = `${width}px`;
  drawBox.style.height = `${height}px`;
}

export function endDrawing(event) {
  if (state.toolMode !== TOOL_MODE_DRAW) return;
  if (!state.drawing || !state.drawStart) return;

  const slide = currentSlideFile();
  if (!slide) return;

  const current = clientToSlidePoint(event.clientX, event.clientY);

  const x = Math.min(state.drawStart.x, current.x);
  const y = Math.min(state.drawStart.y, current.y);
  const width = Math.max(1, Math.abs(current.x - state.drawStart.x));
  const height = Math.max(1, Math.abs(current.y - state.drawStart.y));

  drawBox.style.display = 'none';
  state.drawing = false;
  state.drawStart = null;

  if (width < 3 || height < 3) return;

  const ss = getSlideState(slide);
  const newBox = {
    id: randomId('bbox'),
    x,
    y,
    width,
    height,
    status: 'pending',
  };

  ss.boxes.push(newBox);
  ss.selectedBoxId = newBox.id;
  renderBboxes();
  setStatus(`Added bbox #${ss.boxes.length} for ${slide}.`);
}

export function clearBboxesForCurrentSlide() {
  const slide = currentSlideFile();
  if (!slide) return;

  const ss = getSlideState(slide);
  ss.boxes = [];
  ss.selectedBoxId = null;
  renderBboxes();
  setStatus('All bounding boxes cleared for current slide.');
}

// XPath extraction
export function getXPath(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return '';

  const segments = [];
  let node = el;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const tag = node.tagName.toLowerCase();

    let index = 1;
    let sibling = node.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === node.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }

    segments.unshift(`${tag}[${index}]`);
    node = node.parentElement;
  }

  return `/${segments.join('/')}`;
}

export function intersectArea(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

export function extractTargetsForBox(box) {
  const doc = slideIframe.contentDocument;
  if (!doc || !doc.body) return [];

  const all = Array.from(doc.body.querySelectorAll('*'));
  const candidates = [];

  for (const el of all) {
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (!tag || ['script', 'style', 'link', 'meta', 'noscript'].includes(tag)) continue;

    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 1 || rect.height <= 1) continue;

    const targetBox = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };

    const area = intersectArea(box, targetBox);
    if (area <= 0) continue;

    const xpath = getXPath(el);
    if (!xpath) continue;

    candidates.push({
      xpath,
      tag,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      area,
    });
  }

  candidates.sort((a, b) => b.area - a.area);

  const dedup = [];
  const seen = new Set();
  for (const item of candidates) {
    if (seen.has(item.xpath)) continue;
    seen.add(item.xpath);
    dedup.push({ xpath: item.xpath, tag: item.tag, text: item.text });
    if (dedup.length >= 12) break;
  }

  return dedup;
}

// Bbox layer click handler
export function initBboxLayerEvents() {
  bboxLayer.addEventListener('click', (event) => {
    if (state.toolMode !== TOOL_MODE_DRAW) return;
    const slide = currentSlideFile();
    if (!slide) return;

    const ss = getSlideState(slide);
    const checkButton = event.target.closest('[data-box-check]');
    if (checkButton) {
      const boxId = checkButton.getAttribute('data-box-check');
      ss.boxes = ss.boxes.filter((box) => box.id !== boxId);
      if (ss.selectedBoxId === boxId) ss.selectedBoxId = null;
      renderBboxes();
      setStatus('BBox confirmed and cleared.');
      event.stopPropagation();
      return;
    }

    const rerunButton = event.target.closest('[data-box-rerun]');
    if (rerunButton) {
      const boxId = rerunButton.getAttribute('data-box-rerun');
      const box = ss.boxes.find((item) => item.id === boxId);
      if (box) box.status = 'pending';
      ss.selectedBoxId = boxId;
      renderBboxes();
      setStatus('BBox moved back to pending (red).');
      event.stopPropagation();
      return;
    }

    const deleteButton = event.target.closest('[data-box-delete]');
    if (deleteButton) {
      const boxId = deleteButton.getAttribute('data-box-delete');
      ss.boxes = ss.boxes.filter((box) => box.id !== boxId);
      if (ss.selectedBoxId === boxId) ss.selectedBoxId = null;
      renderBboxes();
      setStatus('Bounding box deleted.');
      event.stopPropagation();
      return;
    }

    const boxEl = event.target.closest('[data-box-id]');
    if (boxEl) {
      ss.selectedBoxId = boxEl.getAttribute('data-box-id');
      renderBboxes();
      return;
    }

    ss.selectedBoxId = null;
    renderBboxes();
  });

  if (contextChipList) {
    contextChipList.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-chip-box-id]');
      if (!chip) return;

      const slide = currentSlideFile();
      if (!slide) return;

      const boxId = chip.getAttribute('data-chip-box-id');
      const ss = getSlideState(slide);
      const boxExists = ss.boxes.some((box) => box.id === boxId);
      if (!boxExists) return;

      ss.selectedBoxId = boxId;
      renderBboxes();
      setStatus(`Selected ${slide} region.`);
    });
  }
}
