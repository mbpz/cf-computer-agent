import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeProbeCommand, parseProbeReply } from '../tools/browser-vm/serial-protocol.mjs';

const id = 'a0123456789bcdef';
const begin = `\x1eBEGIN:${id}\x1f`;
const end = code => `\x1eEND:${id}:${code}\x1f`;

test('terminal echo cannot impersonate a completed Linux command', () => {
  const command = encodeProbeCommand('uname -m', id);
  assert.equal(command.includes('\x1e'), false);
  assert.equal(parseProbeReply(command, id), null);
});

test('waits for an entire framed exit status and preserves real command output', () => {
  assert.equal(parseProbeReply(`${begin}i686\r\n\x1eEND:${id}:`, id), null);
  assert.deepEqual(parseProbeReply(`boot log\r\n${begin}i686\r\n${end(0)}~% `, id),
    { output: 'i686\n', exitCode: 0 });
});

test('reports guest failures rather than treating any prompt as success', () => {
  assert.deepEqual(parseProbeReply(`${begin}not found\r\n${end(127)}`, id),
    { output: 'not found\n', exitCode: 127 });
});

test('ignores delayed replies from a different operation', () => {
  assert.equal(parseProbeReply('\x1eBEGIN:1111111111111111\x1fold\x1eEND:1111111111111111:0\x1f', id), null);
});

test('does not accept an end marker preceding the begin marker', () => {
  assert.equal(parseProbeReply(`${end(0)}${begin}incomplete`, id), null);
});

test('rejects unsafe operation IDs before composing shell commands', () => {
  for (const unsafe of ['', 'short', "'; reboot; '", 'a0123456789bcdef\n']) {
    assert.throws(() => encodeProbeCommand('uname -m', unsafe), /id/i);
    assert.throws(() => parseProbeReply('', unsafe), /id/i);
  }
});

test('rejects terminal-control bytes and multiline commands in the verification harness', () => {
  for (const command of ['', 'ls\nreboot', 'ls\x03', 'ls\x1e']) {
    assert.throws(() => encodeProbeCommand(command, id), /command/i);
  }
});
