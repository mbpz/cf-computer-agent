import assert from 'node:assert/strict';
import test from 'node:test';
import { attachTerminalWorker } from '../tools/browser-vm/terminal-worker-endpoint.mjs';

class Port extends EventTarget {
  messages = [];
  closed = false;
  postMessage(data) { this.messages.push(data); }
  close() { this.closed = true; }
  send(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('duplicate serial request cannot replay guest input and closes the session', async () => {
  const port = new Port();
  const inputs = [];
  let closed = false;
  attachTerminalWorker(port, async () => ({ ready: Promise.resolve(), write: text => inputs.push(text), close: async () => { closed = true; } }));
  port.send({ type: 'start', id: 1 });
  await tick();
  assert.deepEqual(port.messages[0], { type: 'ready', id: 1 });
  port.send({ type: 'input', id: 2, text: 'touch /tmp/once\n' });
  port.send({ type: 'input', id: 2, text: 'touch /tmp/once\n' });
  await tick();
  assert.deepEqual(inputs, ['touch /tmp/once\n']);
  assert.equal(port.messages.at(-1).type, 'failure');
  assert.equal(port.closed, true);
  assert.equal(closed, true);
});

test('closing while assets load destroys a late session instead of posting ready', async () => {
  const port = new Port();
  let finish;
  let closed = false;
  attachTerminalWorker(port, () => new Promise(resolve => { finish = resolve; }));
  port.send({ type: 'start', id: 1 });
  port.send({ type: 'start', id: 2 });
  finish({ ready: Promise.resolve(), close: async () => { closed = true; } });
  await tick();
  assert.equal(closed, true);
  assert.equal(port.messages.some(message => message.type === 'ready'), false);
});

test('a late session boot rejection is consumed after the endpoint already failed', async () => {
  const port = new Port();
  let finish;
  let rejectReady;
  attachTerminalWorker(port, () => new Promise(resolve => { finish = resolve; }));
  port.send({ type: 'start', id: 1 });
  port.send({ type: 'start', id: 2 });
  finish({
    ready: new Promise((_, reject) => { rejectReady = reject; }),
    close: async () => { rejectReady(new Error('Terminal closed during boot')); },
  });
  await tick();
  assert.equal(port.messages.filter(message => message.type === 'failure').length, 1);
  assert.equal(port.closed, true);
});

test('output is emitted only in response to an explicit poll with its matching request id', async () => {
  const port = new Port();
  attachTerminalWorker(port, async () => ({ ready: Promise.resolve(), drain: () => ({ bytes: new Uint8Array([65]), droppedBytes: 7 }), close: async () => {} }));
  port.send({ type: 'start', id: 1 });
  await tick();
  assert.equal(port.messages.length, 1);
  port.send({ type: 'poll', id: 2 });
  assert.deepEqual(port.messages[1], { type: 'output', id: 2, bytes: new Uint8Array([65]), droppedBytes: 7 });
});
