import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { connect, createServer } from 'node:net';
import { createConnectorStreams } from '../tools/browser-vm/connector/streams.mjs';
import { createConnectorDevice } from '../tools/browser-vm/connector/authority.ts';
import { readConnectorAuthorizationClaims, encodeConnectorAuthorizationPart as encode, CONNECTOR_AUTHORIZATION_TYPE } from '../shared/connector-authorization.ts';
import { createDestinationResolver } from '../tools/browser-vm/connector/destination-policy.mjs';

const target = { hostname: 'github.com', port: 443 };
const pin = Object.freeze({ ...target, address: '140.82.112.3', family: 4 });
const tick = () => new Promise(resolve => setImmediate(resolve));
function clockFixture() {
  let time = 0, id = 0; const timers = new Map();
  return {
    monotonicNow: () => time, wallNow: () => 100_000 + time,
    setTimer(fn, delay) { timers.set(++id, { fn, at: time + delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms, dispatch = true) {
      time += ms;
      if (dispatch) for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
    }, timers,
  };
}
function authorityFixture(active = true) {
  const resources = new Set(); let closes = 0;
  return {
    isActive: () => active,
    track(dispose) { if (!active || resources.size >= 8) throw new Error('resource denied'); resources.add(dispose); return () => resources.delete(dispose); },
    close() { if (!active) return; active = false; closes++; for (const dispose of [...resources]) dispose(); },
    resources, get closes() { return closes; },
  };
}
class ControlledSocket extends EventEmitter {
  reads = 0; incoming = Buffer.alloc(0);
  get readableLength() { return this.incoming.length; }
  feed(bytes) { this.incoming = Buffer.concat([this.incoming, bytes]); this.emit('readable'); }
  read(size) { this.reads++; const bytes = this.incoming.subarray(0, size); this.incoming = this.incoming.subarray(size); return bytes; }
  writes = []; destroyed = false; paused = true; writable = true; destroyCount = 0;
  write(bytes, callback) { this.writes.push({ bytes: Buffer.from(bytes), callback }); return this.writable; }
  pause() { this.paused = true; return this; }
  resume() { this.paused = false; return this; }
  destroy() { this.destroyCount++; this.destroyed = true; this.emit('close'); return this; }
}
function fixture(options = {}) {
  const authority = options.authority ?? authorityFixture(), clock = clockFixture();
  const sockets = [], dials = [], dns = [], ready = [], data = [], credits = [], closed = [];
  const streams = createConnectorStreams({
    authority, clock,
    resolveDestination: options.resolveDestination ?? (async (target, signal) => { dns.push({ target, signal }); return pin; }),
    dial: options.dial ?? (parameters => { dials.push(parameters); const socket = new ControlledSocket(); sockets.push(socket); return socket; }),
    onReady: (...args) => ready.push(args),
    onCredit: (...args) => credits.push(args), onClose: (...args) => closed.push(args),
    ...options, // Test-only injection of slow DNS/TCP and transport failures.
    onData: (...args) => { data.push(args); return options.onData?.(...args); },
  });
  return { streams, authority, clock, sockets, dials, dns, ready, data, credits, closed };
}
async function connected(f, id = 1) {
  assert.equal(f.streams.open(id, target), true); await tick();
  const socket = f.sockets.at(-1); socket.emit('connect'); await tick(); return socket;
}

test('inactive authority never starts DNS, tracks a resource, or dials', () => {
  const f = fixture({ authority: authorityFixture(false) });
  assert.equal(f.streams.open(1, target), false);
  assert.equal(f.streams.write(1, Buffer.from('secret')), false);
  assert.equal(f.dns.length, 0); assert.equal(f.dials.length, 0); assert.equal(f.authority.resources.size, 0);
});
test('DNS-pending streams reserve all eight slots synchronously; ninth closes without new DNS', async () => {
  const f = fixture({ resolveDestination: () => new Promise(() => {}) });
  for (let id = 1; id <= 8; id++) assert.equal(f.streams.open(id, target), true);
  assert.equal(f.authority.resources.size, 8);
  assert.equal(f.streams.open(9, target), false);
  assert.equal(f.authority.resources.size, 0); assert.equal(f.authority.closes, 1);
  await tick(); assert.equal(f.sockets.length, 0);
});
test('cancel pending DNS aborts and unregisters; a late answer never dials', async () => {
  let finish, signal;
  const f = fixture({ resolveDestination: (_, inputSignal) => { signal = inputSignal; return new Promise(resolve => { finish = resolve; }); } });
  f.streams.open(1, target); await tick();
  assert.equal(f.streams.closeStream(1), true);
  assert.equal(signal.aborted, true); assert.equal(f.authority.resources.size, 0);
  finish(pin); await tick(); assert.equal(f.dials.length, 0); assert.equal(f.closed.length, 1);
});
test('only pinned literal address is dialed; no lookup, family fallback, or hostname retry', async () => {
  const f = fixture(); const socket = await connected(f);
  assert.equal(f.dials.length, 1);
  const parameters = f.dials[0];
  assert.equal(parameters.host, '140.82.112.3'); assert.equal(parameters.port, 443); assert.equal(parameters.family, 4);
  assert.equal(parameters.autoSelectFamily, false); assert.equal(parameters.highWaterMark, 16384);
  let error;
  parameters.lookup('github.com', {}, failure => { error = failure; });
  assert.ok(error instanceof Error);
  assert.deepEqual(f.ready, [[1, 16]]); assert.equal(socket.paused, true);
  socket.emit('error', new Error('sensitive host diagnostic'));
  assert.equal(socket.destroyed, true); assert.equal(f.dials.length, 1);
  assert.ok(!JSON.stringify(f.closed).includes('sensitive'));
  f.streams.close();
});
test('lease resource release destroys connected sockets and cancels outstanding DNS immediately', async () => {
  let finish, signal, count = 0;
  const f = fixture({ resolveDestination: (_, inputSignal) => ++count === 1 ? Promise.resolve(pin) : new Promise(resolve => { finish = resolve; signal = inputSignal; }) });
  const socket = await connected(f); f.streams.open(2, target); await tick();
  f.authority.close();
  assert.equal(socket.destroyed, true); assert.equal(signal.aborted, true);
  assert.equal(f.authority.resources.size, 0); assert.equal(f.clock.timers.size, 0);
  finish(pin); socket.emit('connect'); socket.feed(Buffer.from('late')); await tick();
  assert.equal(f.sockets.length, 1); assert.equal(f.ready.length, 1); assert.equal(f.data.length, 0);
});
test('connect deadline destroys socket; late connect cannot publish ready', async () => {
  const f = fixture(); f.streams.open(1, target); await tick();
  const socket = f.sockets[0]; f.clock.advance(4999); assert.equal(socket.destroyed, false);
  f.clock.advance(1); assert.equal(socket.destroyed, true); socket.emit('connect'); await tick();
  assert.equal(f.ready.length, 0); assert.equal(f.authority.resources.size, 0);
  f.streams.close();
});
test('idle deadline closes even while downstream completion is stalled', async () => {
  let sent;
  const f = fixture({ onData: () => new Promise(resolve => { sent = resolve; }) });
  const socket = await connected(f); socket.feed(Buffer.from('hello'));
  assert.equal(socket.paused, true);
  f.clock.advance(14999); assert.equal(socket.destroyed, false);
  f.clock.advance(1); assert.equal(socket.destroyed, true);
  sent(); await tick(); assert.equal(socket.paused, true); assert.equal(f.clock.timers.size, 0);
  f.streams.close();
});
test('deadline checks prevent late callbacks from winning against a delayed timer dispatch', async () => {
  const f = fixture(); f.streams.open(1, target); await tick();
  f.clock.advance(5000, false); f.sockets[0].emit('connect');
  assert.equal(f.sockets[0].destroyed, true); assert.equal(f.ready.length, 0);
  const active = fixture(); const socket = await connected(active);
  active.clock.advance(15000, false);
  assert.equal(active.streams.write(1, Buffer.from('late')), false); assert.equal(socket.destroyed, true);
  f.streams.close(); active.streams.close();
});
test('write(false) stops socket writes; credit is withheld until drain and all sixteen callbacks', async () => {
  const f = fixture(), socket = await connected(f); socket.writable = false;
  const input = Buffer.from('original');
  assert.equal(f.streams.write(1, input), true); input.fill(0);
  for (let n = 1; n < 16; n++) assert.equal(f.streams.write(1, Buffer.alloc(16384, n)), true);
  assert.equal(socket.writes.length, 1); assert.equal(socket.writes[0].bytes.toString(), 'original');
  socket.writes[0].callback(); await tick(); assert.equal(f.credits.length, 0);
  socket.writable = true; socket.emit('drain'); await tick();
  assert.equal(socket.writes.length, 16); assert.equal(f.credits.length, 0);
  for (const write of socket.writes.slice(1)) write.callback(); await tick();
  assert.deepEqual(f.credits, [[1, 16]]);
  assert.equal(f.streams.write(1, Buffer.from('new window')), true);
  f.streams.close();
});
test('window overrun or oversized/empty/malformed data closes all resources without another write', async () => {
  for (const bad of [Buffer.alloc(0), Buffer.alloc(16385), 'text', new Uint8Array(1)]) {
    const f = fixture(), socket = await connected(f);
    assert.equal(f.streams.write(1, bad), false); assert.equal(socket.writes.length, 0); assert.equal(socket.destroyed, true);
  }
  const f = fixture(), socket = await connected(f);
  for (let n = 0; n < 16; n++) assert.equal(f.streams.write(1, Buffer.alloc(16384)), true);
  assert.equal(f.streams.write(1, Buffer.from('overrun')), false);
  assert.equal(socket.writes.length, 16); assert.equal(socket.destroyed, true);
  for (const write of socket.writes) write.callback(); await tick(); assert.equal(f.credits.length, 0);
});
test('DNS-pending upload queue is bounded by same sixteen-frame window', async () => {
  let finish;
  const f = fixture({ resolveDestination: () => new Promise(resolve => { finish = resolve; }) });
  f.streams.open(1, target); await tick();
  for (let n = 0; n < 16; n++) assert.equal(f.streams.write(1, Buffer.alloc(16384)), true);
  assert.equal(f.streams.write(1, Buffer.from('overrun')), false);
  finish(pin); await tick(); assert.equal(f.sockets.length, 0);
});
test('downstream pulls one frame only; extra readable events cannot read ahead', async () => {
  let sent;
  const f = fixture({ onData: () => new Promise(resolve => { sent = resolve; }) });
  const socket = await connected(f); socket.feed(Buffer.from('one'));
  assert.equal(socket.paused, true); assert.equal(f.data.length, 1); assert.equal(socket.reads, 1);
  socket.feed(Buffer.from('two')); socket.emit('readable');
  assert.equal(f.data.length, 1); assert.equal(socket.reads, 1);
  sent(); await tick(); assert.equal(f.data.length, 2); assert.equal(socket.reads, 2);
  assert.equal(f.data[1][1].toString(), 'two');
  f.streams.close(); sent(); await tick(); assert.equal(socket.reads, 2);
});
test('stream IDs never repeat, regress, overflow or resurrect after cancellation', async () => {
  for (const id of [0, -1, 1.5, '1', 2 ** 32, NaN]) {
    const f = fixture(); assert.equal(f.streams.open(id, target), false); assert.equal(f.dns.length, 0);
  }
  const f = fixture(); await connected(f, 4); f.streams.closeStream(4);
  assert.equal(f.streams.open(4, target), false); await tick(); assert.equal(f.sockets.length, 1);
  const lower = fixture(); await connected(lower, 4);
  assert.equal(lower.streams.open(3, target), false); assert.equal(lower.authority.resources.size, 0);
});
test('DNS, dialing, writes, transport callbacks and resource registration errors fail closed', async () => {
  const denied = fixture({ resolveDestination: async () => { throw new Error('private DNS'); } });
  denied.streams.open(1, target); await tick();
  assert.equal(denied.dials.length, 0); assert.equal(denied.authority.resources.size, 0); assert.equal(denied.closed.length, 1); denied.streams.close();
  const dial = fixture({ dial: () => { throw new Error('private path'); } });
  dial.streams.open(1, target); await tick(); assert.equal(dial.authority.resources.size, 0); assert.equal(dial.closed.length, 1); dial.streams.close();
  const write = fixture(), socket = await connected(write);
  socket.write = () => { throw new Error('private write'); };
  write.streams.write(1, Buffer.from('fail')); assert.equal(socket.destroyed, true); write.streams.close();
  const callback = fixture({ onReady: () => { throw new Error('transport'); } });
  await connected(callback); assert.equal(callback.sockets[0].destroyed, true); assert.equal(callback.authority.closes, 1);
  const data = fixture({ onData: () => Promise.reject(new Error('send failed')) }), downstream = await connected(data);
  downstream.feed(Buffer.from('fail')); await tick(); assert.equal(downstream.destroyed, true); assert.equal(data.authority.closes, 1);
  const authority = authorityFixture(); authority.track = () => { throw new Error('track'); };
  const registration = fixture({ authority }); assert.equal(registration.streams.open(1, target), false); await tick(); assert.equal(registration.dns.length, 0);
});
test('normal remote close and repeated local close release once without closing other streams', async () => {
  const f = fixture(), first = await connected(f), second = await connected(f, 2);
  first.emit('end'); assert.equal(first.destroyed, true); assert.equal(second.destroyed, false);
  assert.equal(f.authority.resources.size, 1); assert.equal(f.closed.length, 1);
  assert.equal(f.streams.closeStream(1), false);
  f.streams.close(); f.streams.close();
  assert.equal(second.destroyCount, 1); assert.equal(f.authority.resources.size, 0); assert.equal(f.clock.timers.size, 0);
});

test('real policy resolver plus actual loopback TCP transfers bytes and closes peer on revoke', { timeout: 8000 }, async t => {
  let accept;
  const accepted = new Promise(resolve => { accept = resolve; });
  const peers = new Set();
  const server = createServer(socket => { peers.add(socket); socket.on('close', () => peers.delete(socket)); accept(socket); socket.on('data', bytes => socket.write(bytes)); });
  t.after(async () => { for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const authority = authorityFixture(); let ready, data;
  const readySignal = new Promise(resolve => { ready = resolve; }), dataSignal = new Promise(resolve => { data = resolve; });
  let dialed;
  const manager = createConnectorStreams({
    authority,
    resolveDestination: createDestinationResolver({ createResolver: () => ({ resolve4: async () => ['140.82.112.3'], resolve6: async () => [], cancel() {} }) }),
    dial: parameters => { dialed = parameters; return connect({ ...parameters, host: '127.0.0.1', port: server.address().port }); },
    onReady: ready, onData: (_, bytes) => { data(bytes); }, onCredit() {}, onClose() {},
  });
  t.after(() => manager.close());
  manager.open(1, target); await readySignal; const peer = await accepted;
  assert.equal(dialed.host, '140.82.112.3'); assert.equal(dialed.port, 443);
  const payload = Buffer.from([0, 255, 3, 0, 42]); manager.write(1, payload);
  assert.deepEqual(await dataSignal, payload);
  const ended = new Promise(resolve => peer.once('close', resolve)); authority.close(); await ended;
  assert.equal(authority.resources.size, 0); assert.equal(manager.write(1, payload), false);
});

test('ready reports remaining credits rather than regranting a DNS-pending window', async () => {
  let finish;
  const f = fixture({ resolveDestination: () => new Promise(resolve => { finish = resolve; }) });
  f.streams.open(1, target); await tick();
  for (let n = 0; n < 16; n++) f.streams.write(1, Buffer.from('pending'));
  finish(pin); await tick(); f.sockets[0].emit('connect');
  assert.deepEqual(f.ready, [[1, 0]]);
  assert.equal(f.credits.length, 0);
  for (const write of f.sockets[0].writes) write.callback(); await tick();
  assert.deepEqual(f.credits, [[1, 16]]); f.streams.close();
});
test('late downstream rejection after stream cancellation does not kill a newer stream', async () => {
  let reject;
  const f = fixture({ onData: () => new Promise((_, fail) => { reject = fail; }) });
  const first = await connected(f); first.feed(Buffer.from('queued'));
  f.streams.closeStream(1); const second = await connected(f, 2);
  reject(new Error('late completion')); await tick();
  assert.equal(second.destroyed, false); assert.equal(f.authority.isActive(), true); f.streams.close();
});
test('64 MiB cumulative payload limit survives credit resets and stream replacement', async () => {
  const f = fixture(); let socket = await connected(f);
  const chunk = Buffer.alloc(16384);
  for (let batch = 0; batch < 256; batch++) {
    for (let n = 0; n < 16; n++) assert.equal(f.streams.write(batch < 128 ? 1 : 2, chunk), true);
    for (const write of socket.writes.splice(0)) write.callback(); await tick();
    if (batch === 127) { f.streams.closeStream(1); socket = await connected(f, 2); }
  }
  assert.equal(f.authority.isActive(), true);
  assert.equal(f.streams.write(2, Buffer.from('beyond limit')), false);
  assert.equal(socket.destroyed, true); assert.equal(f.authority.resources.size, 0);
});
test('100000-frame ceiling bounds tiny-frame traffic independently of byte budget', async () => {
  const f = fixture(), socket = await connected(f);
  // CONNECT + READY = 2 frames, each full 16-frame window also emits one CREDIT.
  for (let batch = 0; batch < 5882; batch++) {
    for (let n = 0; n < 16; n++) assert.equal(f.streams.write(1, Buffer.from('x')), true);
    for (const write of socket.writes.splice(0)) write.callback(); await tick();
  }
  // 2 + 5882 * 17 = 99996. Four final data frames reach exactly 100000.
  for (let n = 0; n < 4; n++) assert.equal(f.streams.write(1, Buffer.from('x')), true);
  assert.equal(f.streams.write(1, Buffer.from('beyond count')), false);
  assert.equal(socket.destroyed, true); assert.equal(f.authority.resources.size, 0);
});
test('synchronous write callback cannot replenish credit before false/drain is observed', async () => {
  const f = fixture(), socket = await connected(f);
  socket.write = (_bytes, callback) => { callback(); return false; };
  for (let n = 0; n < 16; n++) f.streams.write(1, Buffer.from('x'));
  await tick(); assert.equal(f.credits.length, 0);
  for (let n = 0; n < 15; n++) { socket.emit('drain'); await tick(); }
  assert.equal(f.credits.length, 0);
  socket.emit('drain'); await tick(); assert.deepEqual(f.credits, [[1, 16]]);
  f.streams.close();
});
test('one failing release callback cannot strand other streams or authorization', async () => {
  const f = fixture({ onClose: () => { throw new Error('release handler'); } });
  const first = await connected(f), second = await connected(f, 2);
  f.streams.close();
  assert.equal(first.destroyed, true); assert.equal(second.destroyed, true);
  assert.equal(f.authority.resources.size, 0); assert.equal(f.authority.closes, 1);
});

test('actual TCP coalescing preserves a 256 KiB window under slow downstream sends', { timeout: 8000 }, async t => {
  const peers = new Set();
  const payload = Buffer.alloc(256 * 1024, 42);
  const server = createServer(socket => {
    peers.add(socket); socket.once('close', () => peers.delete(socket)); socket.write(payload);
  });
  t.after(async () => { for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const authority = authorityFixture(); let finish, fail; const received = []; let total = 0, inFlight = 0;
  const complete = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const manager = createConnectorStreams({
    authority, resolveDestination: async () => pin,
    dial: parameters => connect({ ...parameters, host: '127.0.0.1', port: server.address().port }),
    onReady() {}, onCredit() {}, onClose: (_, reason) => { if (total < payload.length) fail(new Error(`early close: ${reason} after ${total}`)); },
    onData: async (_, bytes) => {
      assert.equal(++inFlight, 1); assert.ok(bytes.length <= 16384);
      received.push(Buffer.from(bytes)); total += bytes.length;
      await tick(); inFlight--;
      if (total === payload.length) finish();
    },
  });
  t.after(() => manager.close()); manager.open(1, target);
  await complete; assert.deepEqual(Buffer.concat(received), payload); manager.close();
});

for (const mode of ['hard-expiry', 'rejected-renewal', 'device-stop']) {
  test(`real signed device authority releases actual TCP on ${mode}`, { timeout: 8000 }, async t => {
    const time = clockFixture(), origin = 'https://workbench.example.test';
    const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    let consumes = 0;
    const device = createConnectorDevice({ allowedOrigin: origin, policyVersion: 'policy-1', clock: time,
      verificationKeys: [{ keyId: 'tcp-test', publicKey: pair.publicKey }],
      consume: async () => {
        // Explicit controlled issuer ACK. This is NOT Worker/D1 or HTTPS proof.
        if (++consumes > 1) throw new Error('revoked');
        return { lease: { leaseId: 'lease-1', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } };
      },
    });
    t.after(() => device.close());
    async function ticket(purpose) {
      const claims = { version: 1, purpose, origin, connectorId: device.connectorId, memberId: 'member-1',
        environmentId: 'environment-1', runtimeId: 'runtime-1', generation: 1, policyVersion: 'policy-1',
        leaseId: purpose === 'connect' ? null : 'lease-1', ticketId: crypto.randomUUID(),
        issuedAtMs: time.wallNow(), expiresAtMs: time.wallNow() + 60_000 };
      const { version: _version, ticketId: _ticket, issuedAtMs: _issued, expiresAtMs: _expires, ...binding } = claims;
      const canonical = readConnectorAuthorizationClaims(claims, binding, time.wallNow());
      assert.ok(canonical);
      const text = `${encode(JSON.stringify({ alg: 'EdDSA', typ: CONNECTOR_AUTHORIZATION_TYPE, kid: 'tcp-test' }))}.${encode(JSON.stringify(canonical))}`;
      return `${text}.${encode(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(text))))}`;
    }
    let releases = 0;
    const channel = device.open(origin, { release: () => { releases++; }, renewalDue() {} });
    const { pairingCode } = await device.issuePairing();
    assert.equal(await channel.connect({ pairingCode, ticket: await ticket('connect') }), true);
    const peers = new Set(); let accepted;
    const peerSignal = new Promise(resolve => { accepted = resolve; });
    const server = createServer(socket => { peers.add(socket); socket.on('close', () => peers.delete(socket)); socket.on('data', bytes => socket.write(bytes)); accepted(socket); });
    t.after(async () => { for (const peer of peers) peer.destroy(); await new Promise(resolve => server.close(resolve)); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    let ready, received;
    const readySignal = new Promise(resolve => { ready = resolve; });
    const manager = createConnectorStreams({ authority: channel, clock: time,
      resolveDestination: createDestinationResolver({ createResolver: () => ({ resolve4: async () => ['140.82.112.3'], resolve6: async () => [], cancel() {} }) }),
      dial: parameters => { assert.equal(parameters.host, '140.82.112.3'); return connect({ ...parameters, host: '127.0.0.1', port: server.address().port }); },
      onReady: ready, onData: (_, bytes) => { received?.(bytes); }, onCredit() {}, onClose() {},
    });
    t.after(() => manager.close());
    manager.open(1, target); await readySignal;
    const peer = await peerSignal, closed = new Promise(resolve => peer.once('close', resolve));
    for (let i = 0; i < (mode === 'hard-expiry' ? 5 : 3); i++) {
      time.advance(10_000);
      const echoed = new Promise(resolve => { received = resolve; });
      assert.equal(manager.write(1, Buffer.from('keepalive')), true);
      assert.equal((await echoed).toString(), 'keepalive'); await tick();
    }
    if (mode === 'hard-expiry') {
      time.advance(9999); assert.equal(channel.isActive(), true); assert.equal(peer.destroyed, false);
      time.advance(1);
    } else if (mode === 'rejected-renewal') {
      assert.equal(await channel.renew(await ticket('renew')), false); assert.equal(consumes, 2);
    } else device.close();
    await closed;
    assert.equal(channel.isActive(), false); assert.equal(manager.write(1, Buffer.from('late')), false);
    assert.equal(releases, 1); assert.equal(time.timers.size, 0);
  });
}

test('repeated failed opens consume both request and close-notification frame budget', async () => {
  const f = fixture({ resolveDestination: async () => { throw new Error('DNS denied'); } });
  for (let id = 1; id <= 50_000; id++) {
    assert.equal(f.streams.open(id, target), true); await Promise.resolve();
  }
  assert.equal(f.closed.length, 50_000); assert.equal(f.authority.resources.size, 0);
  assert.equal(f.streams.open(50_001, target), false);
  assert.equal(f.authority.isActive(), false);
});

test('unknown close requests are still charged to the session frame ceiling', () => {
  const f = fixture();
  for (let n = 0; n < 100_000; n++) assert.equal(f.streams.closeStream(42), false);
  assert.equal(f.authority.isActive(), true);
  f.streams.closeStream(42);
  assert.equal(f.authority.isActive(), false);
});
test('download bytes share the same cumulative 64 MiB budget as uploads', async () => {
  const f = fixture(), socket = await connected(f), chunk = Buffer.alloc(16384);
  for (let batch = 0; batch < 128; batch++) {
    for (let n = 0; n < 16; n++) assert.equal(f.streams.write(1, chunk), true);
    for (const write of socket.writes.splice(0)) write.callback(); await tick();
  }
  for (let n = 0; n < 2048; n++) { socket.feed(chunk); await tick(); assert.equal(f.data.length, 1); f.data.length = 0; }
  assert.equal(f.authority.isActive(), true);
  socket.feed(Buffer.from('over budget')); await tick();
  assert.equal(f.data.length, 0); assert.equal(socket.destroyed, true);
});
