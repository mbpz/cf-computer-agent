import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { runMachineProbe } from '../tools/browser-vm/probe-core.mjs';

test('a stalled engine cannot leave verification waiting forever during cleanup', { timeout: 1000 }, async () => {
  // Fault injection: initialization and engine shutdown can both fail to acknowledge.
  const events = new EventEmitter();
  const failedEngine = {
    add_listener: (...args) => events.on(...args),
    remove_listener: (...args) => events.off(...args),
    destroy: () => new Promise(() => {}),
  };
  await assert.rejects(runMachineProbe({ createMachine: () => failedEngine, timeoutMs: 10 }), /timed out/i);
});

test('emulator-ready without a Linux serial prompt is not a successful boot', { timeout: 1000 }, async () => {
  const events = new EventEmitter();
  let destroyed = false;
  await assert.rejects(runMachineProbe({ createMachine: () => {
    queueMicrotask(() => events.emit('emulator-ready'));
    return {
      add_listener: (...args) => events.on(...args),
      remove_listener: (...args) => events.off(...args),
      run: async () => {},
      destroy: async () => { destroyed = true; },
    };
  }, timeoutMs: 10 }), /Guest serial timed out/);
  assert.equal(destroyed, true);
  assert.equal(events.listenerCount('serial0-output-byte'), 0);
});

test('failed Linux boot reports its measured phase without reporting success', { timeout: 1000 }, async () => {
  const events = new EventEmitter();
  const progress = [];
  await assert.rejects(runMachineProbe({
    timeoutMs: 10, onProgress: event => progress.push(event),
    createMachine: () => {
      queueMicrotask(() => events.emit('emulator-ready'));
      return {
        add_listener: (...args) => events.on(...args),
        remove_listener: (...args) => events.off(...args),
        run: async () => {}, destroy: async () => {}, get_instruction_counter: () => 123,
      };
    },
  }), /Guest serial timed out/);
  assert.deepEqual(progress.map(({ stage, status }) => [stage, status]), [['boot', 'running'], ['boot', 'failed']]);
  assert.ok(progress[1].elapsedMs >= 0);
  assert.equal(progress[1].instructions, 0);
});
