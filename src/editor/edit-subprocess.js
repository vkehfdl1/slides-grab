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

export function runEditSubprocess({
  bin,
  args,
  cwd,
  env,
  stdio = ['ignore', 'pipe', 'pipe'],
  timeoutMs = DEFAULT_EDIT_TIMEOUT_MS,
  engineLabel,
  onLog = () => {},
  spawnImpl = spawn,
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(bin, args, { cwd, env, stdio });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer = null;

    const timeoutMessage = buildEditTimeoutMessage({ engineLabel, timeoutMs });

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      const messageLine = `${timeoutMessage}\n`;
      stderr += messageLine;
      onLog('stderr', messageLine);
      child.kill(EDIT_TIMEOUT_KILL_SIGNAL);
      forceKillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, EDIT_TIMEOUT_FORCE_KILL_AFTER_MS);
      forceKillTimer.unref?.();
    }, timeoutMs);
    timeoutTimer.unref?.();

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

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      resolvePromise({
        code: timedOut ? EDIT_TIMEOUT_EXIT_CODE : (code ?? 1),
        stdout,
        stderr,
        signal: timedOut ? (signal || EDIT_TIMEOUT_KILL_SIGNAL) : signal,
        timedOut,
        timeoutMs: timedOut ? timeoutMs : null,
        timeoutMessage: timedOut ? timeoutMessage : null,
      });
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      rejectPromise(error);
    });
  });
}
