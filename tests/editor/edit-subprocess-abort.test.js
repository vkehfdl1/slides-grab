import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
  buildEditAbortMessage,
  EDIT_ABORT_EXIT_CODE,
  EDIT_ABORT_FORCE_KILL_AFTER_MS,
  EDIT_ABORT_KILL_SIGNAL,
  runEditSubprocess,
} from '../../src/editor/edit-subprocess.js';

function createFakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.exitCode = null;
  child.killCalls = [];
  child.kill = (signal) => {
    child.killCalls.push(signal ?? 'SIGTERM');
    return true;
  };
  return child;
}

function makeFakeSpawn(child) {
  return () => child;
}

test('runEditSubprocess invokes onChild synchronously with the spawned child', () => {
  const child = createFakeChild();
  let observed = null;

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    spawnImpl: makeFakeSpawn(child),
    onChild: (c) => {
      observed = c;
    },
  });

  assert.strictEqual(observed, child, 'onChild must receive the spawned child reference');

  child.emit('close', 0, null);
  return promise.then((result) => {
    assert.equal(result.code, 0);
    assert.equal(result.aborted, false);
  });
});

test('runEditSubprocess swallows onChild observer errors so the spawn lifecycle is not corrupted', () => {
  const child = createFakeChild();

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    spawnImpl: makeFakeSpawn(child),
    onChild: () => {
      throw new Error('observer blew up');
    },
  });

  child.emit('close', 0, null);
  return promise.then((result) => {
    assert.equal(result.code, 0);
  });
});

test('runEditSubprocess sends SIGTERM to the child when the AbortSignal fires', async () => {
  const child = createFakeChild();
  const ac = new AbortController();

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    engineLabel: 'Codex',
    spawnImpl: makeFakeSpawn(child),
    signal: ac.signal,
  });

  ac.abort();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(child.killCalls, [EDIT_ABORT_KILL_SIGNAL]);

  child.emit('close', null, EDIT_ABORT_KILL_SIGNAL);
  const result = await promise;

  assert.equal(result.aborted, true, 'result.aborted must be true after AbortSignal fires');
  assert.equal(result.code, EDIT_ABORT_EXIT_CODE, 'aborted runs must surface EDIT_ABORT_EXIT_CODE');
  assert.equal(result.signal, EDIT_ABORT_KILL_SIGNAL);
  assert.equal(
    result.abortMessage,
    buildEditAbortMessage({ engineLabel: 'Codex' }),
    'aborted runs must include a human-readable abort message for the run log',
  );
});

test('runEditSubprocess aborts immediately when the signal is already aborted at spawn time', async () => {
  const child = createFakeChild();
  const ac = new AbortController();
  ac.abort();

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    spawnImpl: makeFakeSpawn(child),
    signal: ac.signal,
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(child.killCalls, [EDIT_ABORT_KILL_SIGNAL]);

  child.emit('close', null, EDIT_ABORT_KILL_SIGNAL);
  const result = await promise;
  assert.equal(result.aborted, true);
});

test('runEditSubprocess escalates to SIGKILL if the child ignores the abort SIGTERM', async () => {
  const child = createFakeChild();
  const ac = new AbortController();

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    spawnImpl: makeFakeSpawn(child),
    signal: ac.signal,
  });

  ac.abort();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(child.killCalls, ['SIGTERM']);

  await new Promise((resolve) => setTimeout(resolve, EDIT_ABORT_FORCE_KILL_AFTER_MS + 200));
  assert.deepEqual(
    child.killCalls,
    ['SIGTERM', 'SIGKILL'],
    'SIGKILL must escalate after the force-kill timeout when the child ignores SIGTERM',
  );

  child.emit('close', null, 'SIGKILL');
  await promise;
});

test('runEditSubprocess does NOT abort when no signal is provided (backward compatibility)', () => {
  const child = createFakeChild();

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    spawnImpl: makeFakeSpawn(child),
  });

  child.emit('close', 0, null);
  return promise.then((result) => {
    assert.equal(result.aborted, false);
    assert.equal(result.code, 0);
    assert.equal(child.killCalls.length, 0, 'kill must not be called for a clean run');
  });
});

test('runEditSubprocess result includes an `aborted` boolean for downstream lifecycle tracking', async () => {
  const child = createFakeChild();
  const ac = new AbortController();

  const promise = runEditSubprocess({
    bin: 'fake',
    args: [],
    spawnImpl: makeFakeSpawn(child),
    signal: ac.signal,
  });

  ac.abort();
  await new Promise((resolve) => setImmediate(resolve));
  child.emit('close', null, 'SIGTERM');

  const result = await promise;
  assert.ok('aborted' in result, 'result must expose `aborted` so callers can branch on it');
  assert.equal(typeof result.aborted, 'boolean');
});
