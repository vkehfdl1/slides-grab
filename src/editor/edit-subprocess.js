import { spawn } from 'node:child_process';

export const DEFAULT_EDIT_TIMEOUT_MS = 10 * 60 * 1000;
export const EDIT_TIMEOUT_EXIT_CODE = 124;
export const EDIT_TIMEOUT_ENV_VAR = 'PPT_AGENT_EDIT_TIMEOUT_MS';
export const EDIT_TIMEOUT_KILL_SIGNAL = 'SIGTERM';
export const EDIT_TIMEOUT_FORCE_KILL_AFTER_MS = 5_000;

export function parseEditTimeoutMs(rawValue = process.env[EDIT_TIMEOUT_ENV_VAR]) {
  if (rawValue == null || rawValue === '') {
    return DEFAULT_EDIT_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawValue);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_EDIT_TIMEOUT_MS;
  }

  return Math.floor(timeoutMs);
}

export function buildEditTimeoutMessage({ engineLabel = 'Editor process', timeoutMs }) {
  return `${engineLabel} edit timed out after ${timeoutMs}ms and was terminated.`;
}

export const EDIT_ABORT_EXIT_CODE = 130;
export const EDIT_ABORT_KILL_SIGNAL = 'SIGTERM';
export const EDIT_ABORT_FORCE_KILL_AFTER_MS = 5_000;

export function buildEditAbortMessage({ engineLabel = 'Editor process' } = {}) {
  return `${engineLabel} edit was aborted and the child process was terminated.`;
}

export function runEditSubprocess({
  bin,
  args,
  cwd,
  env,
  stdio = ['ignore', 'pipe', 'pipe'],
  timeoutMs = DEFAULT_EDIT_TIMEOUT_MS,
  engineLabel,
  onLog = () => {},
  onChild = () => {},
  signal,
  spawnImpl = spawn,
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(bin, args, { cwd, env, stdio });

    try {
      onChild(child);
    } catch {
      // Never let a faulty observer crash the spawn lifecycle.
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let forceKillTimer = null;
    let abortForceKillTimer = null;

    const timeoutMessage = buildEditTimeoutMessage({ engineLabel, timeoutMs });
    const abortMessage = buildEditAbortMessage({ engineLabel });

    const timeoutTimer = setTimeout(() => {
      if (settled || aborted) return;
      timedOut = true;
      const messageLine = `${timeoutMessage}\n`;
      stderr += messageLine;
      onLog('stderr', messageLine);
      try {
        child.kill(EDIT_TIMEOUT_KILL_SIGNAL);
      } catch {}
      forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {}
      }, EDIT_TIMEOUT_FORCE_KILL_AFTER_MS);
      forceKillTimer.unref?.();
    }, timeoutMs);
    timeoutTimer.unref?.();

    function abortChild() {
      if (settled || aborted) return;
      aborted = true;
      const messageLine = `${abortMessage}\n`;
      stderr += messageLine;
      try {
        onLog('stderr', messageLine);
      } catch {}
      try {
        child.kill(EDIT_ABORT_KILL_SIGNAL);
      } catch {}
      abortForceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {}
      }, EDIT_ABORT_FORCE_KILL_AFTER_MS);
      abortForceKillTimer.unref?.();
    }

    if (signal) {
      if (signal.aborted) {
        setImmediate(abortChild);
      } else {
        const onAbort = () => abortChild();
        signal.addEventListener?.('abort', onAbort, { once: true });
        child.once('close', () => {
          signal.removeEventListener?.('abort', onAbort);
        });
      }
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onLog('stdout', text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLog('stderr', text);
    });

    child.on('close', (code, exitSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      clearTimeout(abortForceKillTimer);

      let resolvedCode;
      if (timedOut) {
        resolvedCode = EDIT_TIMEOUT_EXIT_CODE;
      } else if (aborted) {
        resolvedCode = EDIT_ABORT_EXIT_CODE;
      } else {
        resolvedCode = code ?? 1;
      }

      let resolvedSignal = exitSignal;
      if (timedOut && !exitSignal) resolvedSignal = EDIT_TIMEOUT_KILL_SIGNAL;
      else if (aborted && !exitSignal) resolvedSignal = EDIT_ABORT_KILL_SIGNAL;

      resolvePromise({
        code: resolvedCode,
        stdout,
        stderr,
        signal: resolvedSignal,
        timedOut,
        aborted,
        timeoutMs: timedOut ? timeoutMs : null,
        timeoutMessage: timedOut ? timeoutMessage : null,
        abortMessage: aborted ? abortMessage : null,
      });
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      clearTimeout(abortForceKillTimer);
      rejectPromise(error);
    });
  });
}
