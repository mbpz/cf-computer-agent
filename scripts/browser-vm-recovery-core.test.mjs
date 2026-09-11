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

test('timeout diagnostics distinguish an unstarted guest command without exposing command or serial contents', async () => {
  let listener;
  let instructions = 100;
  const machine = {
    add_listener: (_name, receive) => { listener = receive; },
    remove_listener: () => {},
    get_instruction_counter: () => instructions,
    is_running: () => true,
    serial0_send: () => {
      for (const char of 'private serial text') listener(char.charCodeAt(0));
      instructions += 500;
    },
  };
  await assert.rejects(runRecoveryCommand(machine, 'private-command', {
    stage: 'restored-file', timeoutMs: 5,
  }), error => {
    assert.deepEqual(error.diagnostic, {
      stage: 'restored-file', receivedBytes: 19, beginSeen: false,
      instructionDelta: 500, running: true,
      endSeen: false, lineFeeds: 0, commandEchoComplete: false, shellPromptSeen: false,
    });
    assert.equal(JSON.stringify(error).includes('private'), false);
    return true;
  });
});

test('a framed reply cannot advance the caller until the shell is ready for the next input', async () => {
  let receive;
  let id;
  const machine = {
    add_listener: (_name, listener) => { receive = listener; },
    remove_listener: () => {},
    serial0_send: text => { id = /BEGIN:([a-f0-9]{16})/.exec(text)[1]; },
  };
  const emit = text => { for (const char of text) receive(char.charCodeAt(0)); };
  let settled = false;
  const pending = runRecoveryCommand(machine, 'cat /tmp/file').then(result => { settled = true; return result; });
  emit(`localhost:~# \x1eBEGIN:${id}\x1fOK\x1eEND:${id}:0\x1f`);
  await Promise.resolve();
  const advancedBeforePrompt = settled;
  emit('\r\nlocalhost:~#');
  await Promise.resolve();
  const advancedBeforeFullPrompt = settled;
  emit(' ');
  assert.deepEqual(await pending, { output: 'OK', exitCode: 0 });
  assert.equal(advancedBeforePrompt, false, 'the next command must not race the shell input-mode transition');
  assert.equal(advancedBeforeFullPrompt, false);
});

test('a guest result with no subsequent ready prompt expires without replaying input', async () => {
  let receive;
  let sends = 0;
  const machine = {
    add_listener: (_name, listener) => { receive = listener; },
    remove_listener: () => {},
    serial0_send: text => {
      sends++;
      const id = /BEGIN:([a-f0-9]{16})/.exec(text)[1];
      for (const char of `\x1eBEGIN:${id}\x1ffailed\x1eEND:${id}:1\x1f`) receive(char.charCodeAt(0));
    },
  };
  await assert.rejects(runRecoveryCommand(machine, 'false', { timeoutMs: 5 }), error => {
    assert.equal(error.diagnostic.beginSeen, true);
    assert.equal(error.diagnostic.endSeen, true);
    return true;
  });
  assert.equal(sends, 1);
});
