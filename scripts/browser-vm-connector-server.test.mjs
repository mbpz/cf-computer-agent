import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect as connectTcp } from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startConnectorServer } from '../tools/browser-vm/connector/server.mjs';
import { readConnectorAuthorizationClaims, encodeConnectorAuthorizationPart as encode, CONNECTOR_AUTHORIZATION_TYPE } from '../shared/connector-authorization.ts';

const origin = 'https://workbench.example.test';
const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
const keys = [{ keyId: 'test', publicKey: pair.publicKey }];
function clock() {
  let now = 100_000, next = 0;
  const timers = new Map();
  return {
    wallNow: () => now, monotonicNow: () => now,
    setTimer(fn, ms) { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms) { now += ms; for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn(); } },
    get size() { return timers.size; },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  const deadline = performance.now() + 2000;
  while (!predicate()) {
    assert.ok(performance.now() < deadline, 'expected transport call within two seconds');
    await tick();
  }
}
async function fixture(t, overrides = {}) {
  const time = clock(); const requests = [];
  const server = await startConnectorServer({ allowedOrigin: origin, policyVersion: 'policy-1', verificationKeys: keys, clock: time,
    fetch: async req => {
      assert.equal(req.url, `${origin}/api/connector/consume`);
      assert.equal(req.redirect, 'manual'); assert.equal(req.credentials, 'omit');
      const input = await req.json(); requests.push(input);
      const c = JSON.parse(Buffer.from(input.ticket.split('.')[1], 'base64url'));
      return Response.json({ lease: { leaseId: 'lease', revision: c.purpose === 'connect' ? 1 : 2,
        expiresAtMs: c.expiresAtMs, renewAfterMs: c.issuedAtMs + 30_000 } }, { status: 201 });
    }, ...overrides });
  t.after(() => server.close());
  const identity = await (await fetch(`${server.url}/identity`)).json();
  return { server, time, requests, identity };
}
async function signed(f, changes = {}) {
  const binding = { purpose: 'connect', origin, connectorId: f.identity.connectorId,
    memberId: 'member', environmentId: 'environment', runtimeId: 'runtime', generation: 1,
    policyVersion: 'policy-1', leaseId: null };
  const input = { ...binding, version: 1, ticketId: crypto.randomUUID(), issuedAtMs: f.time.wallNow(), expiresAtMs: f.time.wallNow() + 60_000, ...changes };
  const expected = Object.fromEntries(Object.keys(binding).map(k => [k, input[k]]));
  const claims = readConnectorAuthorizationClaims(input, expected, f.time.wallNow());
  assert.ok(claims);
  const text = `${encode(JSON.stringify({ alg: 'EdDSA', typ: CONNECTOR_AUTHORIZATION_TYPE, kid: 'test' }))}.${encode(JSON.stringify(claims))}`;
  return `${text}.${encode(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(text))))}`;
}
const post = (server, path, headers = {}, body) => fetch(`${server.url}${path}`, { method: 'POST',
  headers: { Origin: server.url, 'Content-Type': 'application/json', ...headers }, body });
const pairing = async f => (await post(f.server, '/pair')).json();
async function socket(t, f, options = {}) {
  const ws = new WebSocket(f.server.url.replace('http:', 'ws:') + '/connector', { headers: { Origin: origin }, ...options });
  t.after(() => ws.terminate());
  const close = new Promise(resolve => ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  ws.on('error', () => {});
  const messages = [], waiters = [];
  ws.on('message', bytes => { const value = JSON.parse(bytes.toString()); messages.push(value); waiters.shift()?.(value); });
  await once(ws, 'open');
  return { ws, close, messages, next: () => new Promise(resolve => waiters.push(resolve)), send: value => ws.send(JSON.stringify(value)) };
}
async function authenticate(t, f, changes = {}) {
  const channel = await socket(t, f);
  const { pairingCode } = await pairing(f);
  const ticket = await signed(f);
  const ready = channel.next();
  channel.send({ type: 'authenticate', version: 1, pairingCode, ticket, ...changes });
  return { ...channel, ready, ticket, pairingCode };
}
async function deniedUpgrade(f, headers = { Origin: origin }, path = '/connector', options = {}) {
  const ws = new WebSocket(f.server.url.replace('http:', 'ws:') + path, { headers, ...options });
  const result = await new Promise(resolve => { ws.once('error', resolve); ws.once('open', () => { ws.terminate(); resolve(new Error('unexpected open')); }); });
  return result.message;
}
const deadline = { timeout: 10_000 };

test('configuration is explicit, HTTPS-only, and never accepts a non-loopback bind address', deadline, async () => {
  for (const options of [{ allowedOrigin: 'http://example.test' }, { allowedOrigin: origin + '/' }, { port: -1 }, { port: 65536 }, { port: 1.5 }, { host: '0.0.0.0' }]) {
    await assert.rejects(startConnectorServer({ allowedOrigin: origin, policyVersion: 'policy-1', verificationKeys: keys, ...options }));
  }
});

test('local control exposes only fixed assets/public identity and requires exact local Origin for mutations', deadline, async t => {
  const f = await fixture(t);
  assert.equal(new URL(f.server.url).hostname, '127.0.0.1');
  const page = await fetch(f.server.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('access-control-allow-origin'), null);
  assert.match(await page.text(), /control.js/);
  assert.equal((await fetch(`${f.server.url}/control.js`)).status, 200);
  assert.deepEqual(Object.keys(f.identity).sort(), ['allowedOrigin', 'connectorId', 'forwarding', 'policyVersion', 'version']);
  assert.equal(f.identity.forwarding, false);
  for (const path of ['/pair', '/stop']) {
    assert.equal((await fetch(`${f.server.url}${path}`)).status, 405);
    for (const Origin of [origin, 'null', 'https://evil.test']) assert.equal((await post(f.server, path, { Origin })).status, 403);
    assert.equal((await fetch(`${f.server.url}${path}`, { method: 'POST' })).status, 403);
    assert.equal((await post(f.server, path, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(f.server, path, {}, '{}')).status, 400);
  }
  const rebound = await new Promise((resolve, reject) => {
    const req = request(`${f.server.url}/pair`, { method: 'POST', headers: { Host: 'evil.test', Origin: f.server.url, 'Content-Type': 'application/json' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(rebound, 403);
  for (const path of ['/../package.json', '/pair?token=secret', '/identity?x=1']) assert.equal((await fetch(`${f.server.url}${path}`)).status, 404);
  const code = await pairing(f);
  assert.match(code.pairingCode, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(code.connectorId, f.identity.connectorId);
  assert.equal(code.expiresAtMs, 130_000);
});

test('upgrade rejects foreign/missing Origin, rebinding, duplicate authorities, URL credentials and subprotocols', deadline, async t => {
  const f = await fixture(t);
  for (const headers of [{}, { Origin: 'null' }, { Origin: origin + '/' }, { Origin: 'https://evil.test' }, { Origin: origin, Host: 'evil.test' }, { Origin: origin, Cookie: 'session=x' }, { Origin: origin, Authorization: 'Bearer x' }, { Origin: origin, 'Sec-WebSocket-Protocol': 'unknown' }, { Origin: [origin, origin] }]) {
    assert.match(await deniedUpgrade(f, headers), /403/);
  }
  assert.match(await deniedUpgrade(f, { Origin: origin }, '/connector?ticket=secret'), /403/);
  const raw = connectTcp(new URL(f.server.url).port, '127.0.0.1');
  t.after(() => raw.destroy()); let response = '';
  raw.on('data', b => { response += b; });
  raw.write(`GET /connector HTTP/1.1\r\nHost: ${new URL(f.server.url).host}\r\nHost: evil.test\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  await once(raw, 'close');
  assert.match(response, /^HTTP\/1.1 (400|403)/);
  assert.equal(f.requests.length, 0);
});

test('real socket requires pairing plus signature/consumption, sends lease not credentials, and disconnects explicitly', deadline, async t => {
  const f = await fixture(t), c = await authenticate(t, f);
  const receipt = await c.ready;
  assert.deepEqual(receipt, { type: 'ready', version: 1, forwarding: false, lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } });
  assert.equal(c.ws.extensions, '');
  assert.equal(f.requests.length, 1);
  assert.ok(!JSON.stringify(c.messages).includes(c.ticket));
  assert.ok(!JSON.stringify(c.messages).includes(c.pairingCode));
  c.send({ type: 'disconnect', version: 1 });
  assert.equal((await c.close).code, 1000);
  assert.equal(f.time.size, 0);
});

test('only four upgraded channels; unauthenticated connections expire and capacity is released', deadline, async t => {
  const f = await fixture(t), channels = [];
  for (let i = 0; i < 4; i++) channels.push(await socket(t, f));
  assert.match(await deniedUpgrade(f), /429/);
  f.time.advance(5000);
  for (const c of channels) assert.equal((await c.close).code, 1008);
  const next = await socket(t, f); next.send({ type: 'disconnect', version: 1 });
  assert.equal((await next.close).code, 1000);
  assert.equal(f.requests.length, 0);
});

test('malformed/extra/unsupported/binary/control/oversized frames close without consuming authority', deadline, async t => {
  const f = await fixture(t);
  for (const send of [
    c => c.ws.send('{'), c => c.send(null), c => c.send([]),
    c => c.send({ type: 'authenticate', version: 2, pairingCode: 'x', ticket: 'x' }),
    c => c.send({ type: 'authenticate', version: 1, pairingCode: 'x', ticket: 'x', memberId: 'member' }),
    c => c.send({ type: 'renew', version: 1, ticket: 'x' }),
    c => c.send({ type: 'connect', host: 'example.com', port: 443 }),
    c => c.ws.send(Buffer.from('binary')), c => c.ws.ping(), c => c.ws.pong(),
    c => c.ws.send('x'.repeat(10_241)),
  ]) {
    const c = await socket(t, f); let pongs = 0; c.ws.on('pong', () => pongs++); send(c);
    assert.ok([1008, 1009].includes((await c.close).code));
    assert.equal(pongs, 0); assert.equal(c.messages.length, 0);
  }
  assert.equal(f.requests.length, 0);
});

test('fragmented messages stay bounded even below the byte cap', deadline, async t => {
  const f = await fixture(t), c = await socket(t, f);
  const { pairingCode } = await pairing(f);
  const text = JSON.stringify({ type: 'authenticate', version: 1, pairingCode, ticket: await signed(f) });
  const unexpectedReady = c.next();
  for (let i = 0; i < 39; i++) c.ws.send(text[i], { fin: false });
  c.ws.send(text.slice(39), { fin: true });
  // Valid complete message: a JSON/authority rejection must not mask this bound.
  const result = await Promise.race([c.close.then(value => value.code), unexpectedReady.then(() => 'unexpected-ready')]);
  assert.equal(result, 1008);
  assert.equal(f.requests.length, 0);
});

test('bad pairing, tampered signatures and browser identity overrides never reach the issuer', deadline, async t => {
  const f = await fixture(t);
  for (const mode of ['pair', 'signature', 'identity']) {
    const c = await socket(t, f); const { pairingCode } = await pairing(f); const ticket = await signed(f);
    c.send({ type: 'authenticate', version: 1, pairingCode: mode === 'pair' ? 'A'.repeat(43) : pairingCode,
      ticket: mode === 'signature' ? ticket + 'A' : ticket, ...(mode === 'identity' ? { connectorId: f.identity.connectorId } : {}) });
    assert.equal((await c.close).code, 1008);
  }
  assert.equal(f.requests.length, 0);
});

test('racing different signed tickets with the same pairing code grants exactly one socket', deadline, async t => {
  const f = await fixture(t), a = await socket(t, f), b = await socket(t, f), { pairingCode } = await pairing(f);
  const messages = [await signed(f), await signed(f)].map(ticket => ({ type: 'authenticate', version: 1, pairingCode, ticket }));
  const ar = Promise.race([a.next().then(() => 'ready'), a.close.then(() => 'closed')]);
  const br = Promise.race([b.next().then(() => 'ready'), b.close.then(() => 'closed')]);
  a.send(messages[0]); b.send(messages[1]);
  assert.deepEqual((await Promise.all([ar, br])).sort(), ['closed', 'ready']);
  assert.equal(f.requests.length, 1);
});

test('signed renewal travels on the same socket and old lease expires independently', deadline, async t => {
  const f = await fixture(t), c = await authenticate(t, f); const receipt = await c.ready;
  const due = c.next(); f.time.advance(30_000);
  assert.deepEqual(await due, { type: 'renewal-needed', version: 1, leaseId: 'lease', revision: 1 });
  const renewed = c.next();
  c.send({ type: 'renew', version: 1, ticket: await signed(f, { purpose: 'renew', leaseId: receipt.lease.leaseId }) });
  assert.deepEqual(await renewed, { type: 'renewed', version: 1, forwarding: false, lease: { leaseId: 'lease', revision: 2, expiresAtMs: 190_000, renewAfterMs: 160_000 } });
  assert.equal(f.requests[0].consumerId, f.requests[1].consumerId);
  f.time.advance(60_000); assert.equal((await c.close).code, 1008);
  assert.equal(f.time.size, 0);
});

test('issuer denial and early/wrong-lease renewal cannot keep the socket active', deadline, async t => {
  for (const mode of ['early', 'wrong-lease', 'denied']) {
    let calls = 0;
    const f = await fixture(t, mode === 'denied' ? { fetch: async req => {
      calls++; const { ticket } = await req.json(); const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url'));
      if (calls > 1) return new Response(null, { status: 409 });
      return Response.json({ lease: { leaseId: 'lease', revision: 1, expiresAtMs: c.expiresAtMs, renewAfterMs: c.issuedAtMs + 30_000 } }, { status: 201 });
    } } : {});
    const c = await authenticate(t, f); await c.ready;
    if (mode !== 'early') { const due = c.next(); f.time.advance(30_000); await due; }
    c.send({ type: 'renew', version: 1, ticket: await signed(f, { purpose: 'renew', leaseId: mode === 'wrong-lease' ? 'other' : 'lease' }) });
    assert.equal((await c.close).code, 1008);
    if (mode === 'denied') assert.equal(calls, 2); else assert.equal(f.requests.length, 1);
  }
});

test('cancel during consumption aborts the request and late success never sends ready', deadline, async t => {
  let resolve, signal;
  const f = await fixture(t, { fetch: req => { signal = req.signal; return new Promise(r => { resolve = r; }); } });
  const c = await authenticate(t, f);
  await until(() => resolve);
  c.send({ type: 'disconnect', version: 1 });
  assert.equal((await c.close).code, 1000); assert.equal(signal.aborted, true);
  resolve(Response.json({ lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } }, { status: 201 }));
  await tick(); assert.equal(c.messages.length, 0); assert.equal(f.time.size, 0);
});

test('overlapping authorization frames fail closed rather than queueing a replay', deadline, async t => {
  let signal;
  const f = await fixture(t, { fetch: req => { signal = req.signal; return new Promise(() => {}); } });
  const c = await authenticate(t, f);
  await until(() => signal);
  c.send({ type: 'authenticate', version: 1, pairingCode: c.pairingCode, ticket: c.ticket });
  assert.equal((await c.close).code, 1008); assert.equal(signal.aborted, true);
});

test('local stop closes authorized sockets plus incomplete HTTP and is idempotent', deadline, async t => {
  const f = await fixture(t), c = await authenticate(t, f); await c.ready;
  const raw = connectTcp(new URL(f.server.url).port, '127.0.0.1'); raw.on('error', () => {});
  t.after(() => raw.destroy()); await once(raw, 'connect'); raw.write('GET / HTTP/1.1\r\n');
  const rawClosed = once(raw, 'close');
  const response = await post(f.server, '/stop'); assert.equal(response.status, 200); await response.text();
  assert.equal((await c.close).code, 1001); await rawClosed;
  await f.server.close(); await f.server.close();
  assert.equal(f.time.size, 0);
  await assert.rejects(fetch(f.server.url));
});

test('restarted server rejects old device tickets even with a fresh valid pairing code', deadline, async t => {
  const old = await fixture(t), oldTicket = await signed(old); await old.server.close();
  const f = await fixture(t); assert.notEqual(old.identity.connectorId, f.identity.connectorId);
  const c = await socket(t, f), { pairingCode } = await pairing(f);
  c.send({ type: 'authenticate', version: 1, pairingCode, ticket: oldTicket });
  assert.equal((await c.close).code, 1008); assert.equal(f.requests.length, 0);
});


test('occupied explicit port fails without replacing the existing connector', deadline, async t => {
  const f = await fixture(t);
  await assert.rejects(startConnectorServer({ allowedOrigin: origin, policyVersion: 'policy-1', verificationKeys: keys,
    port: Number(new URL(f.server.url).port) }), { code: 'EADDRINUSE' });
  assert.equal((await fetch(`${f.server.url}/identity`)).status, 200);
});

test('missing pinned keys cannot be supplied by the browser or accept a valid-looking ticket', deadline, async t => {
  const f = await fixture(t, { verificationKeys: [] });
  const c = await authenticate(t, f);
  assert.equal((await c.close).code, 1008); assert.equal(f.requests.length, 0);
});

test('lost consumption response burns the ticket and socket expiry aborts without a retry', deadline, async t => {
  let requests = 0, signal;
  const f = await fixture(t, { fetch: req => { requests++; signal = req.signal; return new Promise(() => {}); } });
  const c = await authenticate(t, f);
  await until(() => signal);
  f.time.advance(5000);
  assert.equal((await c.close).code, 1008); assert.equal(signal.aborted, true);
  const b = await socket(t, f), { pairingCode } = await pairing(f);
  b.send({ type: 'authenticate', version: 1, pairingCode, ticket: c.ticket });
  assert.equal((await b.close).code, 1008); assert.equal(requests, 1);
});

test('old lease deadline closes the actual socket while renewal consumption is unresolved', deadline, async t => {
  let calls = 0, signal, completeRenewal;
  const f = await fixture(t, { fetch: async req => {
    const { ticket } = await req.json(); const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url'));
    const response = Response.json({ lease: { leaseId: 'lease', revision: ++calls,
      expiresAtMs: c.expiresAtMs, renewAfterMs: c.issuedAtMs + 30_000 } }, { status: 201 });
    if (calls === 1) return response;
    signal = req.signal;
    return new Promise(resolve => { completeRenewal = () => resolve(response); });
  } });
  const c = await authenticate(t, f); await c.ready;
  const due = c.next(); f.time.advance(58_000); await due;
  c.send({ type: 'renew', version: 1, ticket: await signed(f, { purpose: 'renew', leaseId: 'lease' }) });
  await until(() => completeRenewal);
  f.time.advance(2000);
  assert.equal((await c.close).code, 1008); assert.equal(signal.aborted, true);
  completeRenewal(); await tick();
  assert.equal(c.messages.filter(m => m.type === 'renewed').length, 0);
  assert.equal(calls, 2); assert.equal(f.time.size, 0);
});

test('real timer closes a real socket without a browser message or virtual clock advance', deadline, async t => {
  const f = await fixture(t, { clock: undefined });
  f.time = { wallNow: () => Date.now() };
  const c = await socket(t, f), { pairingCode } = await pairing(f);
  const ready = c.next();
  c.send({ type: 'authenticate', version: 1, pairingCode, ticket: await signed(f, { expiresAtMs: Date.now() + 300 }) });
  await ready;
  assert.equal((await c.close).code, 1008);
});

test('shutdown bounds an uncooperative upgraded peer that does not acknowledge close', deadline, async t => {
  const f = await fixture(t), c = await authenticate(t, f); await c.ready;
  // A real peer pauses reads: no close acknowledgment can be delivered.
  c.ws.pause();
  const before = performance.now(); await f.server.close();
  assert.ok(performance.now() - before < 1500);
  c.ws.terminate(); await c.close;
});
