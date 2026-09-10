import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { attachLocalProbeRelay } from '../tools/browser-vm/relay/local-relay.mjs';

const implementation = await import('../tools/browser-vm/authenticated-probe-socket.mjs').catch(() => ({}));

async function setup(t) {
  assert.equal(typeof implementation.createAuthenticatedProbeSocket, 'function', 'first-frame native WISP authentication exists');
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const relay = attachLocalProbeRelay(server, { origin: () => origin });
  t.after(async () => {
    await relay.close();
    await new Promise(resolve => server.close(resolve));
  });
  // Browsers supply Origin automatically; the Node WS test client needs it explicitly.
  class NativeWebSocket extends WebSocket {
    constructor(url) { super(url, { origin }); }
  }
  return { ...relay, NativeWebSocket, url: origin.replace('http:', 'ws:') + '/relay' };
}

test('native adapter receives binary WISP readiness only after automatic first-frame authentication', { timeout: 5000 }, async t => {
  const f = await setup(t);
  const Socket = implementation.createAuthenticatedProbeSocket({ ...f, ticket: f.issueTicket(), onDisconnect: () => {} });
  const socket = new Socket(f.url);
  socket.binaryType = 'arraybuffer';
  const frame = await new Promise(resolve => { socket.onmessage = event => resolve(new Uint8Array(event.data)); });
  assert.equal(frame[0], 3);
  assert.equal(new DataView(frame.buffer).getUint32(1, true), 0);
  const closed = once(socket, 'close');
  socket.close();
  await closed;
  assert.throws(() => new Socket(f.url), /consumed/);
});

test('unplanned disconnect is reported without invoking native automatic reconnect', { timeout: 5000 }, async t => {
  const f = await setup(t);
  let nativeReconnects = 0;
  let report;
  const disconnected = new Promise(resolve => { report = resolve; });
  const Socket = implementation.createAuthenticatedProbeSocket({ ...f, ticket: 'a'.repeat(43), onDisconnect: report });
  const socket = new Socket(f.url);
  socket.onclose = () => nativeReconnects++;
  await disconnected;
  assert.equal(nativeReconnects, 0);
  assert.throws(() => new Socket(f.url), /consumed/);
});

test('the authentication wrapper cannot send its capability to a different destination', async t => {
  const f = await setup(t);
  const Socket = implementation.createAuthenticatedProbeSocket({ ...f, ticket: f.issueTicket(), onDisconnect: () => {} });
  assert.throws(() => new Socket('wss://unrelated.example/relay'), /destination/);
});
