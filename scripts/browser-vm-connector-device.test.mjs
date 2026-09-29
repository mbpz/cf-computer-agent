import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectorDevice } from '../tools/browser-vm/connector/authority.ts';
import { readConnectorAuthorizationClaims, encodeConnectorAuthorizationPart as encode, CONNECTOR_AUTHORIZATION_TYPE } from '../shared/connector-authorization.ts';

const origin = 'https://workbench.example.test';
const pair = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
const keys = [{ keyId: 'test', publicKey: pair.publicKey }];
function clock() {
  let wall = 100_000, mono = 0, next = 0;
  const timers = new Map();
  return {
    wallNow: () => wall, monotonicNow: () => mono,
    setTimer(fn, ms) { const id = ++next; timers.set(id, { fn, at: mono + ms }); return id; },
    clearTimer(id) { timers.delete(id); },
    advance(ms, run = true) { wall += ms; mono += ms; if (run) this.flush(); },
    rollback(ms) { wall -= ms; },
    flush() { for (const [id, t] of [...timers]) if (t.at <= mono) { timers.delete(id); t.fn(); } },
    get timers() { return timers.size; },
  };
}
async function signed(device, time, changes = {}) {
  const binding = { purpose: 'connect', origin, connectorId: device.connectorId,
    memberId: 'member', environmentId: 'environment', runtimeId: 'runtime', generation: 1,
    policyVersion: 'policy-1', leaseId: null };
  const input = { ...binding, version: 1, ticketId: crypto.randomUUID(), issuedAtMs: time.wallNow(), expiresAtMs: time.wallNow() + 60_000, ...changes };
  const expected = Object.fromEntries(Object.keys(binding).map(k => [k, input[k]]));
  const canonical = readConnectorAuthorizationClaims(input, expected, time.wallNow());
  assert.ok(canonical);
  const text = `${encode(JSON.stringify({ alg: 'EdDSA', typ: CONNECTOR_AUTHORIZATION_TYPE, kid: 'test' }))}.${encode(JSON.stringify(canonical))}`;
  return `${text}.${encode(new Uint8Array(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(text))))}`;
}
function fixture(options = {}) {
  const time = clock(); let consumes = 0, closes = 0, due = 0;
  const device = createConnectorDevice({ allowedOrigin: origin, policyVersion: 'policy-1', verificationKeys: keys, clock: time,
    consume: async ({ ticket }) => {
      consumes++;
      const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url').toString());
      return { lease: { leaseId: 'lease', revision: c.purpose === 'connect' ? 1 : 2, expiresAtMs: c.expiresAtMs, renewAfterMs: time.wallNow() + 30_000 } };
    }, ...options });
  const open = () => device.open(origin, { release: () => { closes++; }, renewalDue: () => { due++; } });
  const connect = async (channel = open(), changes = {}) => {
    const { pairingCode } = await device.issuePairing();
    const ticket = await signed(device, time, changes);
    assert.equal(await channel.connect({ pairingCode, ticket }), true);
    return { channel, ticket, pairingCode };
  };
  return { device, time, open, connect, get consumes() { return consumes; }, get closes() { return closes; }, get due() { return due; } };
}

test('no capability until BOTH one-time local pairing and signed server consumption complete', async () => {
  let resolve;
  const f = fixture({ consume: () => new Promise(r => { resolve = r; }) });
  const channel = f.open();
  assert.equal(channel.isActive(), false);
  assert.throws(() => channel.track(() => {}));
  const { pairingCode } = await f.device.issuePairing();
  const pending = channel.connect({ pairingCode, ticket: await signed(f.device, f.time) });
  while (!resolve) await new Promise(r => setImmediate(r));
  assert.equal(channel.isActive(), false);
  resolve({ lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } });
  assert.equal(await pending, true);
  assert.equal(channel.isActive(), true);
  channel.close(); assert.equal(f.closes, 1);
});

test('wrong/missing/null origins and channel capacity are rejected before any authorization', () => {
  const f = fixture();
  for (const value of [undefined, null, 'null', origin + '/', 'https://other.example.test']) assert.throws(() => f.device.open(value, {}));
  const channels = Array.from({ length: 4 }, () => f.open());
  assert.throws(() => f.open()); channels[0].close(); f.open();
  f.device.close(); assert.equal(f.closes, 5); assert.equal(f.time.timers, 0);
});

test('pairing is rotated, expires at 30 seconds, and locks after five wrong attempts', async () => {
  for (const mode of ['rotate', 'expire', 'attempts']) {
    const f = fixture(); const { pairingCode } = await f.device.issuePairing();
    const ticket = await signed(f.device, f.time);
    if (mode === 'rotate') await f.device.issuePairing();
    if (mode === 'expire') f.time.advance(30_000);
    if (mode === 'attempts') for (let i = 0; i < 5; i++) assert.equal(await f.open().connect({ pairingCode: 'A'.repeat(43), ticket }), false);
    assert.equal(await f.open().connect({ pairingCode, ticket }), false);
    assert.equal(f.consumes, 0); f.device.close();
  }
});

test('concurrent pairing reuse grants one channel only', async () => {
  const f = fixture(); const { pairingCode } = await f.device.issuePairing();
  const tickets = await Promise.all([1, 2, 3].map(() => signed(f.device, f.time)));
  const channels = [f.open(), f.open(), f.open()];
  assert.deepEqual((await Promise.all(channels.map((c, i) => c.connect({ pairingCode, ticket: tickets[i] })))).sort(), [false, false, true]);
  assert.equal(f.consumes, 1); f.device.close();
});

for (const field of ['connectorId', 'origin', 'policyVersion']) test(`signed but wrong local ${field} cannot consume`, async () => {
  const f = fixture(); const { pairingCode } = await f.device.issuePairing();
  const ticket = await signed(f.device, f.time, { [field]: field === 'origin' ? 'https://other.example.test' : 'other' });
  assert.equal(await f.open().connect({ pairingCode, ticket }), false);
  assert.equal(f.consumes, 0); f.device.close();
});

test('forged signature or additional browser identity fields cannot reach consumption', async () => {
  for (const forged of [true, false]) {
    const f = fixture(); const { pairingCode } = await f.device.issuePairing();
    let ticket = await signed(f.device, f.time);
    if (forged) ticket = ticket.slice(0, -8) + 'AAAAAAAA';
    assert.equal(await f.open().connect({ pairingCode, ticket, ...(!forged && { memberId: 'other' }) }), false);
    assert.equal(f.consumes, 0); f.device.close();
  }
});

test('restart changes connector identity and old signed tickets fail despite new pairing', async () => {
  const old = fixture(); const ticket = await signed(old.device, old.time); old.device.close();
  const f = fixture(); assert.notEqual(f.device.connectorId, old.device.connectorId);
  const { pairingCode } = await f.device.issuePairing();
  assert.equal(await f.open().connect({ pairingCode, ticket }), false); assert.equal(f.consumes, 0); f.device.close();
});

test('replay cache keeps failed consumptions and refuses to evict unexpired entries at capacity', async () => {
  let calls = 0;
  const f = fixture({ replayLimit: 1, consume: async () => { calls++; throw Error('unknown result'); } });
  const ticket = await signed(f.device, f.time);
  for (const candidate of [ticket, ticket, await signed(f.device, f.time)]) {
    const { pairingCode } = await f.device.issuePairing();
    assert.equal(await f.open().connect({ pairingCode, ticket: candidate }), false);
  }
  assert.equal(calls, 1);
  f.time.advance(60_000);
  const { pairingCode } = await f.device.issuePairing();
  assert.equal(await f.open().connect({ pairingCode, ticket: await signed(f.device, f.time) }), false);
  assert.equal(calls, 2); f.device.close();
});

test('30-second renewal notification and hard expiry release all resources once even if a disposer throws', async () => {
  const f = fixture(); const { channel } = await f.connect(); let released = 0;
  channel.track(() => { throw Error('resource failure'); }); channel.track(() => { released++; });
  f.time.advance(30_000); assert.equal(f.due, 1); assert.equal(channel.isActive(), true);
  f.time.advance(30_000); assert.equal(channel.isActive(), false); assert.equal(released, 1); assert.equal(f.closes, 1);
  channel.close(); f.device.close(); assert.equal(released, 1); assert.equal(f.time.timers, 0);
});

test('delayed timers and backwards wall clock cannot extend authorization', async () => {
  const f = fixture(); const { channel } = await f.connect();
  f.time.rollback(100_000); f.time.advance(60_000, false);
  assert.equal(channel.isActive(), false); assert.equal(f.closes, 1); f.device.close();
});

test('renewal stays bound to signed member/runtime/generation and the original lease', async () => {
  for (const change of [{ memberId: 'other' }, { runtimeId: 'other' }, { generation: 2 }, { leaseId: 'other' }]) {
    const f = fixture(); const { channel } = await f.connect(); f.time.advance(30_000);
    assert.equal(await channel.renew(await signed(f.device, f.time, { purpose: 'renew', leaseId: 'lease', ...change })), false);
    assert.equal(channel.isActive(), false); assert.equal(f.consumes, 1); f.device.close();
  }
});

test('renewal advances exactly one revision, retains consumer identity, and replaces rather than stacks timers', async () => {
  const consumers = [];
  const f = fixture({ consume: async ({ consumerId, ticket }) => {
    consumers.push(consumerId);
    const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url').toString());
    return { lease: { leaseId: 'lease', revision: consumers.length, expiresAtMs: c.expiresAtMs, renewAfterMs: c.issuedAtMs + 30_000 } };
  } });
  const { channel } = await f.connect(); f.time.advance(30_000);
  assert.equal(await channel.renew(await signed(f.device, f.time, { purpose: 'renew', leaseId: 'lease' })), true);
  assert.equal(consumers.length, 2); assert.equal(consumers[0], consumers[1]);
  f.time.advance(30_000); assert.equal(channel.isActive(), true); assert.equal(f.due, 2);
  f.time.advance(30_000); assert.equal(channel.isActive(), false); assert.equal(f.time.timers, 0);
});

test('early renewal, invalid ACKs and server denial never grant or prolong a lease', async () => {
  const early = fixture(); const { channel } = await early.connect();
  assert.equal(await channel.renew(await signed(early.device, early.time, { purpose: 'renew', leaseId: 'lease' })), false);
  assert.equal(channel.isActive(), false); assert.equal(early.consumes, 1); early.device.close();
  for (const changes of [{ expiresAtMs: 160_001 }, { expiresAtMs: 100_000 }, { revision: 2 }, { leaseId: '' }, { renewAfterMs: 160_000 }, { extra: true }]) {
    const f = fixture({ consume: async () => ({ lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000, ...changes } }) });
    const { pairingCode } = await f.device.issuePairing(); const c = f.open();
    assert.equal(await c.connect({ pairingCode, ticket: await signed(f.device, f.time) }), false);
    assert.equal(c.isActive(), false); f.device.close();
  }
});

test('local close invalidates pending ACKs; unknown consumption result is never retried', async () => {
  let resolve, calls = 0, signal;
  const f = fixture({ consume: (input, abort) => { calls++; signal = abort; return new Promise(r => { resolve = r; }); } });
  const { pairingCode } = await f.device.issuePairing(); const c = f.open();
  const pending = c.connect({ pairingCode, ticket: await signed(f.device, f.time) });
  while (!resolve) await new Promise(r => setImmediate(r));
  c.close(); assert.equal(signal.aborted, true);
  resolve({ lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } });
  assert.equal(await pending, false); assert.equal(c.isActive(), false); assert.equal(calls, 1); f.device.close();
});

test('unresponsive consumption times out even when transport ignores AbortSignal', async () => {
  let entered = false;
  const f = fixture({ consume: () => { entered = true; return new Promise(() => {}); } });
  const { pairingCode } = await f.device.issuePairing(); const c = f.open();
  const pending = c.connect({ pairingCode, ticket: await signed(f.device, f.time) });
  while (!entered) await new Promise(r => setImmediate(r));
  f.time.advance(5_000);
  assert.equal(await pending, false); assert.equal(c.isActive(), false); assert.equal(f.time.timers, 0); f.device.close();
});

test('synchronous transport failure is contained without unhandled promise rejection', async () => {
  const f = fixture({ consume: () => { throw Error('transport unavailable'); } });
  const { pairingCode } = await f.device.issuePairing(); const c = f.open();
  assert.equal(await c.connect({ pairingCode, ticket: await signed(f.device, f.time) }), false);
  assert.equal(c.isActive(), false); f.device.close();
  await new Promise(r => setImmediate(r));
});

test('missing pinned keys and renewal-purpose bootstrap fail before contacting issuer', async () => {
  for (const missingKeys of [true, false]) {
    const f = fixture(missingKeys ? { verificationKeys: [] } : {});
    const { pairingCode } = await f.device.issuePairing();
    const ticket = await signed(f.device, f.time, missingKeys ? {} : { purpose: 'renew', leaseId: 'lease' });
    assert.equal(await f.open().connect({ pairingCode, ticket }), false); assert.equal(f.consumes, 0); f.device.close();
  }
});

test('hard expiry wins over a late renewal ACK and aborts pending transport', async () => {
  let resolve, entered = false, aborted = false;
  const f = fixture({ consume: async ({ ticket }, signal) => {
    const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url').toString());
    if (c.purpose === 'connect') return { lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } };
    entered = true; signal.addEventListener('abort', () => { aborted = true; });
    return new Promise(r => { resolve = r; });
  } });
  const { channel } = await f.connect(); f.time.advance(59_000);
  const pending = channel.renew(await signed(f.device, f.time, { purpose: 'renew', leaseId: 'lease' }));
  while (!entered) await new Promise(r => setImmediate(r));
  f.time.advance(1_000); assert.equal(aborted, true);
  resolve({ lease: { leaseId: 'lease', revision: 2, expiresAtMs: 219_000, renewAfterMs: 189_000 } });
  assert.equal(await pending, false); assert.equal(channel.isActive(), false); assert.equal(f.closes, 1); f.device.close();
});

test('wrong lease or revision in trusted-channel renewal ACK still fails closed', async () => {
  for (const bad of [{ leaseId: 'replacement' }, { revision: 1 }, { revision: 3 }]) {
    const f = fixture({ consume: async ({ ticket }) => {
      const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url').toString());
      return { lease: { leaseId: 'lease', revision: c.purpose === 'connect' ? 1 : 2,
        expiresAtMs: c.expiresAtMs, renewAfterMs: c.issuedAtMs + 30_000, ...(c.purpose === 'renew' && bad) } };
    } });
    const { channel } = await f.connect(); f.time.advance(30_000);
    assert.equal(await channel.renew(await signed(f.device, f.time, { purpose: 'renew', leaseId: 'lease' })), false);
    assert.equal(channel.isActive(), false); f.device.close();
  }
});

test('a short remaining session grants only its deadline without scheduling an impossible renewal', async () => {
  const f = fixture(); const { channel } = await f.connect(undefined, { expiresAtMs: 110_000 });
  f.time.advance(10_000); assert.equal(channel.isActive(), false); assert.equal(f.due, 0); f.device.close();
});

test('resource bound is eight and local shutdown releases pending and active channels without restart', async () => {
  const f = fixture(); const { channel } = await f.connect(); let released = 0;
  const unregister = channel.track(() => { released++; }); unregister();
  for (let i = 0; i < 8; i++) channel.track(() => { released++; });
  assert.throws(() => channel.track(() => {})); f.open(); f.device.close();
  assert.equal(released, 8); assert.equal(f.closes, 2); assert.equal(f.time.timers, 0);
  assert.throws(() => f.open()); await assert.rejects(f.device.issuePairing());
});

test('default real device timer releases a short signed lease without a polling caller', async () => {
  const device = createConnectorDevice({ allowedOrigin: origin, policyVersion: 'policy-1', verificationKeys: keys,
    consume: async ({ ticket }) => {
      const c = JSON.parse(Buffer.from(ticket.split('.')[1], 'base64url').toString());
      return { lease: { leaseId: 'lease', revision: 1, expiresAtMs: c.expiresAtMs, renewAfterMs: c.issuedAtMs + 30_000 } };
    } });
  let released = 0;
  try {
    const { pairingCode } = await device.issuePairing();
    const ticket = await signed(device, { wallNow: () => Date.now() }, { expiresAtMs: Date.now() + 200 });
    const channel = device.open(origin, { release: () => { released++; }, renewalDue() {} });
    assert.equal(await channel.connect({ pairingCode, ticket }), true);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(released, 1); assert.equal(channel.isActive(), false);
  } finally { device.close(); }
});

test('adapter receives only an immutable active lease receipt for authenticated browser renewal', async () => {
  const f = fixture(); const channel = f.open();
  assert.equal(channel.getLease(), undefined);
  await f.connect(channel);
  const receipt = channel.getLease();
  assert.deepEqual(receipt, { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 });
  assert.equal(Object.isFrozen(receipt), true);
  assert.throws(() => { receipt.leaseId = 'other'; });
  f.time.advance(60_000, false);
  assert.equal(channel.getLease(), undefined); assert.equal(f.closes, 1); f.device.close();
});
