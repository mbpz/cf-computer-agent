import assert from 'node:assert/strict';
import test from 'node:test';
import { runRecoveryCommand } from '../tools/browser-vm/recovery-core.mjs';

test('a timed-out recovery command reports only its stage, removes its listener and never replays guest input', async () => {
  const listeners = new Set();
  const sent = [];
  const machine = {
    add_listener: (_name, listener) => listeners.add(listener),
    remove_listener: (_name, listener) => listeners.delete(listener),
    serial0_send: text => sent.push(text),
  };
  await assert.rejects(runRecoveryCommand(machine, 'private-command-content', {
    stage: 'initial-post', timeoutMs: 5,
  }), { message: 'Recovery guest command timed out: initial-post' });
  assert.equal(listeners.size, 0);
  assert.equal(sent.length, 1);
});
