import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { startConnectorServer } from '../../tools/browser-vm/connector/server.mjs';

// Actual Workerd/D1, production routes/services/crypto, device core and loopback
// WebSocket. Only clock and issuer transport routing are harness ports; no fake ACK.
// Canonical origin is enforced by createApp. dispatchFetch routes this locally;
// outboundService rejects all network egress, including this production hostname.
export const origin = 'https://memory.crgmhrc.asia';
const bundled = await build({ entryPoints: ['test/fixtures/connector/worker.mjs'], bundle: true,
  write: false, format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'],
  external: ['cloudflare:*', 'node:*'], logLevel: 'silent' });
const migrations = await readD1Migrations(new URL('../../migrations/', import.meta.url).pathname);
export async function fixture(t, egressTransport, { allowedOrigin = origin, realtime = false } = {}) {
  let now = Date.now(), next = 0; const timers = new Map();
  const clock = realtime ? { wallNow: () => Date.now(), monotonicNow: () => performance.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: id => clearTimeout(id) } : { wallNow: () => now, monotonicNow: () => now,
    setTimer(fn, ms) { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer(id) { timers.delete(id); } };
  const secret = crypto.randomUUID();
  let server;
  const mf = new Miniflare({ modules: true, compatibilityDate: '2026-07-26',
    compatibilityFlags: ['nodejs_compat'], script: bundled.outputFiles[0].text,
    d1Databases: { DB: 'connector-integration' },
    durableObjects: { KNOWLEDGE: 'UnusedKnowledge' }, log: new Log(LogLevel.ERROR),
    bindings: { TEST_SECRET: secret, TEST_ORIGIN: allowedOrigin, TEST_REAL_CLOCK: realtime },
    outboundService: () => { throw new Error('Unexpected outbound request in local integration'); } });
  t.after(async () => { try { await server?.close(); } finally { await mf.dispose(); } });
  const db = await mf.getD1Database('DB');
  for (const m of migrations) await db.batch(m.queries.map(q => db.prepare(q)));
  const timestamp = new Date(now).toISOString();
  await db.batch([
    db.prepare('CREATE TABLE connector_test_clock(now INTEGER NOT NULL)'),
    db.prepare('INSERT INTO connector_test_clock VALUES(?)').bind(now),
    db.prepare("INSERT INTO members(id,access_sub,email,role,status,created_at,updated_at) VALUES('member-a','subject-a','a@example.test','contributor','active',?,?)").bind(timestamp,timestamp),
    db.prepare("INSERT INTO roles(id,key,name,allow_bits,status,is_system,created_at,updated_at) VALUES('test-vm','test-vm','VM','0x200000','active',0,?,?)").bind(timestamp,timestamp),
    db.prepare("INSERT INTO role_members(role_id,member_id,created_at) VALUES('test-vm','member-a',?)").bind(timestamp),
    db.prepare("INSERT INTO browser_environments(id,member_id,name,type,version,created_at,updated_at) VALUES('env-a','member-a','A','personal',1,?,?)").bind(now,now),
    db.prepare("INSERT INTO connector_authorization_policy(singleton,origin,policy_version,enabled) VALUES(1,?,'policy-1',1)").bind(allowedOrigin),
  ]);
  const boot = await mf.dispatchFetch(origin + '/__test/session', { headers: { 'x-test-secret': secret } });
  assert.equal(boot.status, 200);
  const { token, publicKey } = await boot.json();
  const key = await crypto.subtle.importKey('jwk', publicKey, 'Ed25519', false, ['verify']);
  let dropResponse = false; const consumptionStatuses = [];
  const serverOptions = { allowedOrigin, policyVersion: 'policy-1', ...(egressTransport ? { egressTransport } : {}),
    verificationKeys: [{ keyId: 'integration-test', publicKey: key }], clock,
    fetch: async req => {
      assert.equal(req.url, allowedOrigin + '/api/connector/consume');
      const response = await mf.dispatchFetch(req.url, { method: req.method, headers: req.headers,
        body: await req.text(), redirect: 'manual' });
      consumptionStatuses.push(response.status);
      if (dropResponse) { await response.body?.cancel(); throw new Error('Test transport lost committed response'); }
      return response;
    } };
  server = await startConnectorServer(serverOptions);
  const identity = await (await fetch(server.url + '/identity')).json();
  const api = (path, body) => mf.dispatchFetch(origin + '/api/environments/env-a/' + path, {
    method: 'POST', headers: { origin, cookie: `__Host-memory-session=${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const reserved = await api('connector-authority', { operationId: 'reserve-1', connectorId: identity.connectorId, expectedGeneration: 0 });
  assert.equal(reserved.status, 201);
  const { authority } = await reserved.json();
  const binding = { runtimeId: authority.runtimeId, generation: authority.generation };
  const issued = await api('connector-tickets', { ...binding, operationId: 'ticket-1' });
  assert.equal(issued.status, 201);
  const { ticket } = await issued.json();
  // Browser fetch boundary only: inject the local test cookie and actual browser
  // Origin, route relative product URLs to Workerd; never contact a remote host.
  const requester = (path, init) => {
    assert.match(path, /^\/api\/environments\/[A-Za-z0-9_-]{1,128}(\/(connector-authority|connector-tickets|connector-renewals))?$/);
    assert.equal(init.credentials, 'same-origin'); assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    return mf.dispatchFetch(origin + path, { method: init.method,
      headers: { ...init.headers, origin: allowedOrigin, cookie: `__Host-memory-session=${token}` },
      ...(init.body === undefined ? {} : { body: init.body }), redirect: 'manual' });
  };
  return { db, clock, requester, get server() { return server; }, api, binding, ticket, consumptionStatuses,
    async restart() { await server.close(); server = await startConnectorServer(serverOptions); },
    count() { return db.prepare("SELECT count(*) AS n FROM connector_ticket_consumptions").first("n"); },
    loseResponse() { dropResponse = true; },
    async advance(ms) {
      now += ms; await db.prepare('UPDATE connector_test_clock SET now=?').bind(now).run();
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    },
    async renewal(leaseId) {
      const response = await api('connector-renewals', { ...binding, leaseId, operationId: crypto.randomUUID() });
      assert.equal(response.status, 201); return (await response.json()).ticket;
    },
  };
}
export async function pair(f) {
  const response = await fetch(f.server.url + '/pair', { method: 'POST', headers: { origin: f.server.url, 'content-type': 'application/json' } });
  assert.equal(response.status, 200); return (await response.json()).pairingCode;
}
