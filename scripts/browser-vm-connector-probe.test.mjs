import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from 'node:http';
import { connect } from 'node:net';
import { WebSocket } from 'ws';
import { startConnectorProbe } from '../tools/browser-vm/connector-probe/server.mjs';

const origin = 'https://workbench.example';
async function fixture(t, options = {}) {
  const server = await startConnectorProbe({ allowedOrigin: origin, ...options });
  t.after(() => server.close());
  return server;
}
async function credential(server, headers = {}) {
  return fetch(`${server.url}/pair`, { method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json', ...headers } });
}
function socket(server, headers = { Origin: origin }, path = '/probe') {
  return new WebSocket(server.url.replace('http:', 'ws:') + path, { headers });
}
const opened = ws => new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
const closed = ws => new Promise(resolve => { ws.once('close', code => resolve(code)); ws.on('error', () => {}); });
async function authenticate(server, token) {
  const ws = socket(server);
  const close = closed(ws);
  const message = new Promise(resolve => ws.once('message', bytes => resolve(JSON.parse(bytes.toString()))));
  await opened(ws);
  ws.send(JSON.stringify({ type: 'probe-authenticate', token }));
  return { ws, close, message };
}

test('configuration accepts only one exact HTTPS origin', async () => {
  for (const allowedOrigin of ['http://example.com', 'https://example.com/', 'https://example.com/path', 'null', '*', 'https://user@example.com']) {
    await assert.rejects(startConnectorProbe({ allowedOrigin }));
  }
});

test('control page is local-only and cannot mint credentials cross-origin or via GET', async t => {
  const server = await fixture(t);
  const page = await fetch(server.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${server.url}/pair`)).status, 405);
  for (const value of [origin, 'null', 'https://evil.example']) assert.equal((await credential(server, { Origin: value })).status, 403);
  assert.equal((await fetch(`${server.url}/pair`, { method: 'POST' })).status, 403);
  const rebound = await new Promise((resolve, reject) => {
    const req = request(`${server.url}/pair`, { method: 'POST', headers: { Host: 'evil.example', Origin: server.url, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(rebound, 403);
  assert.equal((await credential(server, { 'Content-Type': 'text/plain' })).status, 415);
  const response = await credential(server);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { token } = await response.json();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await fetch(`${server.url}/../package.json`)).status, 404);
});

test('upgrade rejects missing/null/foreign Origin, rebinding Host and query credentials', async t => {
  const server = await fixture(t);
  for (const headers of [{}, { Origin: 'null' }, { Origin: 'https://evil.example' }, { Origin: origin, Host: 'evil.example' }]) {
    const ws = socket(server, headers);
    const error = await new Promise(resolve => ws.once('error', resolve));
    assert.match(error.message, /403/);
  }
  const ws = socket(server, { Origin: origin }, '/probe?token=not-allowed');
  const error = await new Promise(resolve => ws.once('error', resolve));
  assert.match(error.message, /403/);
});

test('successful handshake consumes credential atomically, has no forwarding protocol, and stops on exit', async t => {
  const server = await fixture(t);
  const { token } = await (await credential(server)).json();
  const first = await authenticate(server, token);
  assert.deepEqual(await first.message, { type: 'probe-ready', version: 1, forwarding: false });
  const replay = await authenticate(server, token);
  assert.equal(await replay.close, 1008);
  first.ws.send(JSON.stringify({ type: 'connect', host: 'example.com', port: 443 }));
  assert.equal(await first.close, 1008);
  const nextToken = await (await credential(server)).json();
  const next = await authenticate(server, nextToken.token);
  await next.message;
  await server.close();
  assert.equal(await next.close, 1001);
});

test('expired, unpaired, replaced credentials and extra auth fields are rejected', async t => {
  let clock = 0;
  const server = await fixture(t, { now: () => clock });
  const old = await (await credential(server)).json();
  clock = 30_001;
  assert.equal(await (await authenticate(server, old.token)).close, 1008);
  assert.equal(await (await authenticate(server, 'x'.repeat(43))).close, 1008);
  const replaced = await (await credential(server)).json();
  const current = await (await credential(server)).json();
  assert.equal(await (await authenticate(server, replaced.token)).close, 1008);
  const ws = socket(server); const close = closed(ws); await opened(ws);
  ws.send(JSON.stringify({ type: 'probe-authenticate', token: current.token, member: 'forged' }));
  assert.equal(await close, 1008);
});

test('handshake waits and session lifetimes are bounded; concurrent sockets cannot exceed four', async t => {
  const server = await fixture(t, { handshakeMs: 100, sessionMs: 80 });
  const pending = socket(server); const timedOut = closed(pending); await opened(pending);
  assert.equal(await timedOut, 1008);
  const { token } = await (await credential(server)).json();
  const session = await authenticate(server, token); await session.message;
  assert.equal(await session.close, 1001);
  const clients = Array.from({ length: 4 }, () => socket(server));
  clients.forEach(ws => ws.on('error', () => {}));
  await Promise.all(clients.map(opened));
  const overflow = socket(server);
  const error = await new Promise(resolve => overflow.once('error', resolve));
  assert.match(error.message, /429/);
  clients.forEach(ws => ws.terminate());
});

test('occupied port is a startup error, not browser permission diagnosis', async t => {
  const server = await fixture(t);
  await assert.rejects(startConnectorProbe({ allowedOrigin: origin, port: Number(new URL(server.url).port) }), { code: 'EADDRINUSE' });
});

test('five failed pairing attempts invalidate the pending credential and oversized frames close', async t => {
  const server = await fixture(t);
  const { token } = await (await credential(server)).json();
  for (let i = 0; i < 5; i++) assert.equal(await (await authenticate(server, 'b'.repeat(43))).close, 1008);
  assert.equal(await (await authenticate(server, token)).close, 1008);
  const ws = socket(server); const close = closed(ws); await opened(ws);
  ws.send('x'.repeat(2048));
  assert.equal(await close, 1009);
});

test('two concurrent consumers of the same credential yield only one ready session', async t => {
  const server = await fixture(t);
  const { token } = await (await credential(server)).json();
  const outcomes = await Promise.all([1, 2].map(async () => {
    const ws = socket(server);
    const result = new Promise(resolve => {
      ws.once('message', () => { resolve('ready'); ws.close(); });
      ws.once('close', code => resolve(code));
    });
    await opened(ws); ws.send(JSON.stringify({ type: 'probe-authenticate', token }));
    return result;
  }));
  assert.deepEqual(outcomes.sort(), [1008, 'ready']);
});

test('shutdown remains bounded when an upgraded peer ignores the close handshake', async t => {
  const server = await fixture(t);
  const raw = connect({ host: '127.0.0.1', port: Number(new URL(server.url).port) });
  t.after(() => raw.destroy());
  await new Promise(resolve => raw.once('connect', resolve));
  const upgrade = new Promise(resolve => raw.once('data', bytes => resolve(bytes.toString())));
  raw.write(`GET /probe HTTP/1.1\r\nHost: ${new URL(server.url).host}\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  assert.match(await upgrade, /101 Switching Protocols/);
  let timer;
  try {
    assert.equal(await Promise.race([server.close().then(() => 'closed'), new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), 600); })]), 'closed');
  } finally { clearTimeout(timer); raw.destroy(); }
});
