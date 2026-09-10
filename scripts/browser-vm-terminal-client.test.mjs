import assert from 'node:assert/strict';
import test from 'node:test';
import { connectTerminal } from '../tools/browser-vm/terminal-client.mjs';

class WorkerPort extends EventTarget {
  messages = [];
  terminated = false;
  postMessage(data) { this.messages.push(data); }
  terminate() { this.terminated = true; }
  reply(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

test('input reaches the ready Worker once, waits for its matching receipt, and rejects concurrent input', async () => {
  const worker = new WorkerPort();
  const terminal = connectTerminal({ createWorker: () => worker });
  await assert.rejects(terminal.write('before\n'), /ready/);
  worker.reply({ type: 'ready', id: worker.messages[0].id });
  await terminal.ready;
  const accepted = terminal.write('uname -a\n');
  const input = worker.messages.find(message => message.type === 'input');
  assert.equal(input.text, 'uname -a\n');
  await assert.rejects(terminal.write('second\n'), /pending/);
  worker.reply({ type: 'accepted', id: input.id });
  await accepted;
  assert.equal(worker.messages.filter(message => message.type === 'input').length, 1);
  terminal.close();
  await assert.rejects(terminal.write('closed\n'), /closed/);
  assert.equal(worker.terminated, true);
});

test('polling has at most one outstanding request; output is decoded across UTF-8 chunk boundaries', async () => {
  const worker = new WorkerPort();
  const output = [];
  const terminal = connectTerminal({ createWorker: () => worker, onOutput: text => output.push(text), pollMs: 1 });
  worker.reply({ type: 'ready', id: worker.messages[0].id });
  await terminal.ready;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(worker.messages.filter(message => message.type === 'poll').length, 1);
  let poll = worker.messages.at(-1);
  worker.reply({ type: 'output', id: poll.id, bytes: new Uint8Array([0xe4, 0xb8]), droppedBytes: 0 });
  await new Promise(resolve => setTimeout(resolve, 5));
  poll = worker.messages.at(-1);
  worker.reply({ type: 'output', id: poll.id, bytes: new Uint8Array([0xad]), droppedBytes: 0 });
  assert.equal(output.join(''), '中');
  terminal.close();
});

test('oversized input is rejected on the page before copying it to the Worker', async () => {
  const worker = new WorkerPort();
  const terminal = connectTerminal({ createWorker: () => worker });
  worker.reply({ type: 'ready', id: worker.messages[0].id });
  await terminal.ready;
  await assert.rejects(terminal.write('字'.repeat(1366)), /input/i);
  assert.equal(worker.messages.filter(message => message.type === 'input').length, 0);
  terminal.close();
});

test('closing during boot rejects readiness and ignores a late reply', async () => {
  const worker = new WorkerPort();
  const terminal = connectTerminal({ createWorker: () => worker });
  const rejection = assert.rejects(terminal.ready, /closed/);
  terminal.close();
  worker.reply({ type: 'ready', id: worker.messages[0].id });
  await rejection;
  assert.equal(terminal.state, 'closed');
});

test('missing input receipt terminates the session without retrying a possibly executed command', async () => {
  const worker = new WorkerPort();
  const terminal = connectTerminal({ createWorker: () => worker, requestTimeoutMs: 15, pollMs: 1000 });
  worker.reply({ type: 'ready', id: worker.messages[0].id });
  await terminal.ready;
  const poll = worker.messages.find(message => message.type === 'poll');
  worker.reply({ type: 'output', id: poll.id, bytes: new Uint8Array(), droppedBytes: 0 });
  await assert.rejects(terminal.write('touch /tmp/once\n'), /timed out/);
  assert.equal(worker.messages.filter(message => message.type === 'input').length, 1);
  assert.equal(worker.terminated, true);
});

test('mismatched receipts fail closed instead of accepting a different command', async () => {
  const worker = new WorkerPort();
  const terminal = connectTerminal({ createWorker: () => worker });
  worker.reply({ type: 'ready', id: worker.messages[0].id });
  await terminal.ready;
  const accepted = terminal.write('uname\n');
  worker.reply({ type: 'accepted', id: 999 });
  await assert.rejects(accepted, /Invalid/);
  assert.equal(worker.terminated, true);
});
