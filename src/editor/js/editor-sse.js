// editor-sse.js — EventSource connection, run event handling

import { state, runsById, activeRunBySlide, localFileUpdateBySlide } from './editor-state.js';
import { slideIframe, statusDot, statusConn } from './editor-dom.js';
import { currentSlideFile, setStatus } from './editor-utils.js';
import { addChatMessage, renderRunsList } from './editor-chat.js';
import { renderBboxes } from './editor-bbox.js';
import { updateSendState } from './editor-send.js';
import { onSvgExportProgress, onSvgExportFinished } from './editor-svg-export.js';
import { onPdfExportProgress, onPdfExportFinished } from './editor-pdf-export.js';
import { onPptxExportProgress, onPptxExportFinished } from './editor-pptx-export.js';
import {
  onFigmaConnected, onFigmaDisconnected,
  onFigmaExportProgress, onFigmaExportFinished,
} from './editor-figma-export.js';
import {
  isCreationMode, onGenerateStarted, onGenerateLog, onGenerateFinished,
  refreshSlideList, updatePlanLoadingStep, feedPlanLoadingLog,
} from './editor-create.js';
import { onPlanStarted, onPlanLog, onPlanFinished } from './editor-outline.js';

function upsertRun(run) {
  if (!run?.runId) return;
  const existing = runsById.get(run.runId) || {};
  runsById.set(run.runId, {
    ...existing,
    ...run,
  });
}

export function connectSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.onopen = () => {
    statusDot.classList.add('connected');
    statusDot.classList.remove('disconnected');
    statusConn.textContent = 'Connected';
  };

  evtSource.addEventListener('runsSnapshot', (event) => {
    try {
      const payload = JSON.parse(event.data);

      runsById.clear();
      for (const run of payload.runs || []) {
        upsertRun(run);
      }

      activeRunBySlide.clear();
      for (const active of payload.activeRuns || []) {
        if (active.slide && active.runId) {
          activeRunBySlide.set(active.slide, active.runId);
        }
      }

      renderRunsList();
      updateSendState();
    } catch (error) {
      console.error('runsSnapshot parse error:', error);
    }
  });

  evtSource.addEventListener('applyStarted', (event) => {
    try {
      const payload = JSON.parse(event.data);
      activeRunBySlide.set(payload.slide, payload.runId);

      upsertRun({
        runId: payload.runId,
        slide: payload.slide,
        model: payload.model || '',
        status: 'running',
        message: `${payload.model ? `${payload.model} | ` : ''}Running (${payload.selectionsCount || 0} bbox)`,
        startedAt: new Date().toISOString(),
        logPreview: '',
      });

      addChatMessage('system', `[${payload.slide}] run started (${payload.runId})`, payload.slide);
      renderRunsList();
      updateSendState();
    } catch (error) {
      console.error('applyStarted parse error:', error);
    }
  });

  evtSource.addEventListener('applyLog', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (!payload.runId) return;
      const run = runsById.get(payload.runId);
      if (run) {
        run.logPreview = (String(run.logPreview || '') + String(payload.chunk || '')).slice(-2000);
        runsById.set(payload.runId, run);
      }
    } catch (error) {
      console.error('applyLog parse error:', error);
    }
  });

  evtSource.addEventListener('applyFinished', (event) => {
    try {
      const payload = JSON.parse(event.data);
      activeRunBySlide.delete(payload.slide);

      // Note: initial snapshot is pushed on iframe load; fileChanged will reload
      // the iframe with new content, pushing the post-AI snapshot automatically.

      upsertRun({
        runId: payload.runId,
        slide: payload.slide,
        model: payload.model || '',
        status: payload.success ? 'success' : 'failed',
        code: payload.code,
        message: payload.message,
        finishedAt: new Date().toISOString(),
      });

      addChatMessage(
        payload.success ? 'system' : 'error',
        `[${payload.slide}] ${payload.message || (payload.success ? 'completed' : 'failed')}`,
        payload.slide,
      );

      renderRunsList();
      updateSendState();
      setStatus(payload.message || 'Run finished.');
    } catch (error) {
      console.error('applyFinished parse error:', error);
    }
  });

  evtSource.addEventListener('planStarted', (event) => {
    try {
      onPlanStarted(JSON.parse(event.data));
    } catch (error) {
      console.error('planStarted parse error:', error);
    }
  });

  evtSource.addEventListener('planLog', (event) => {
    try {
      const data = JSON.parse(event.data);
      onPlanLog(data);
      if (data.stream !== 'stderr') feedPlanLoadingLog(data.chunk);
    } catch (error) {
      console.error('planLog parse error:', error);
    }
  });

  evtSource.addEventListener('planFinished', (event) => {
    try {
      onPlanFinished(JSON.parse(event.data));
    } catch (error) {
      console.error('planFinished parse error:', error);
    }
  });

  evtSource.addEventListener('progress', (event) => {
    try {
      const data = JSON.parse(event.data);
      updatePlanLoadingStep(data.step || '');
    } catch { /* ignore */ }
  });

  evtSource.addEventListener('generateStarted', (event) => {
    try {
      onGenerateStarted(JSON.parse(event.data));
    } catch (error) {
      console.error('generateStarted parse error:', error);
    }
  });

  evtSource.addEventListener('generateLog', (event) => {
    try {
      const data = JSON.parse(event.data);
      onGenerateLog(data);
      if (data.stream !== 'stderr') feedPlanLoadingLog(data.chunk);
    } catch (error) {
      console.error('generateLog parse error:', error);
    }
  });

  evtSource.addEventListener('generateFinished', (event) => {
    try {
      onGenerateFinished(JSON.parse(event.data));
    } catch (error) {
      console.error('generateFinished parse error:', error);
    }
  });

  evtSource.addEventListener('fileChanged', (event) => {
    try {
      const { file } = JSON.parse(event.data);

      // In creation mode while generating, do NOT auto-switch to edit mode
      // (the user will click "생성 결과 보기" after generation finishes)

      if (file === currentSlideFile()) {
        const updatedAt = localFileUpdateBySlide.get(file);
        if (updatedAt && Date.now() - updatedAt < 2000) {
          localFileUpdateBySlide.delete(file);
          return;
        }
        slideIframe.src = slideIframe.src;
      }
    } catch (error) {
      console.error('fileChanged parse error:', error);
    }
  });

  evtSource.addEventListener('svgExportProgress', (event) => {
    try {
      onSvgExportProgress(JSON.parse(event.data));
    } catch (error) {
      console.error('svgExportProgress parse error:', error);
    }
  });

  evtSource.addEventListener('svgExportFinished', (event) => {
    try {
      onSvgExportFinished(JSON.parse(event.data));
    } catch (error) {
      console.error('svgExportFinished parse error:', error);
    }
  });

  evtSource.addEventListener('pdfExportProgress', (event) => {
    try {
      onPdfExportProgress(JSON.parse(event.data));
    } catch (error) {
      console.error('pdfExportProgress parse error:', error);
    }
  });

  evtSource.addEventListener('pdfExportFinished', (event) => {
    try {
      onPdfExportFinished(JSON.parse(event.data));
    } catch (error) {
      console.error('pdfExportFinished parse error:', error);
    }
  });

  evtSource.addEventListener('pptxExportProgress', (event) => {
    try {
      onPptxExportProgress(JSON.parse(event.data));
    } catch (error) {
      console.error('pptxExportProgress parse error:', error);
    }
  });

  evtSource.addEventListener('pptxExportFinished', (event) => {
    try {
      onPptxExportFinished(JSON.parse(event.data));
    } catch (error) {
      console.error('pptxExportFinished parse error:', error);
    }
  });

  evtSource.addEventListener('figmaConnected', (event) => {
    try {
      onFigmaConnected(JSON.parse(event.data));
    } catch (error) {
      console.error('figmaConnected parse error:', error);
    }
  });

  evtSource.addEventListener('figmaDisconnected', (event) => {
    try {
      onFigmaDisconnected(JSON.parse(event.data));
    } catch (error) {
      console.error('figmaDisconnected parse error:', error);
    }
  });

  evtSource.addEventListener('figmaExportProgress', (event) => {
    try {
      onFigmaExportProgress(JSON.parse(event.data));
    } catch (error) {
      console.error('figmaExportProgress parse error:', error);
    }
  });

  evtSource.addEventListener('figmaExportFinished', (event) => {
    try {
      onFigmaExportFinished(JSON.parse(event.data));
    } catch (error) {
      console.error('figmaExportFinished parse error:', error);
    }
  });

  evtSource.addEventListener('devReload', () => {
    window.location.reload();
  });

  evtSource.onerror = () => {
    statusDot.classList.remove('connected');
    statusDot.classList.add('disconnected');
    statusConn.textContent = 'Disconnected';
  };
}

export async function loadRunsInitial() {
  try {
    const res = await fetch('/api/runs');
    if (!res.ok) return;
    const payload = await res.json();

    runsById.clear();
    for (const run of payload.runs || []) {
      upsertRun(run);
    }

    activeRunBySlide.clear();
    for (const active of payload.activeRuns || []) {
      if (active.slide && active.runId) {
        activeRunBySlide.set(active.slide, active.runId);
      }
    }

    renderRunsList();
    updateSendState();
  } catch {
    // ignore
  }
}
