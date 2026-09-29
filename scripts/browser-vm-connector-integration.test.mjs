import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, connect as dial } from 'node:net';
import { createDestinationResolver } from '../tools/browser-vm/connector/destination-policy.mjs';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel } from 'miniflare';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { WebSocket } from 'ws';
import { startConnectorServer } from '../tools/browser-vm/connector/server.mjs';

// Actual Workerd/D1, production routes/services/crypto, device core and loopback
// WebSocket. Only clock and issuer transport routing are harness ports; no fake ACK.
// Canonical origin is enforced by createApp. dispatchFetch routes this locally;
// outboundService rejects all network egress, including this production hostname.
const origin = 'https://memory.crgmhrc.asia';
const bundled = await build({ entryPoints: ['test/fixtures/connector/worker.mjs'], bundle: true,
  write: false, format: 'esm', platform: 'neutral', conditions: ['workerd', 'worker', 'browser'],
  external: ['cloudflare:*', 'node:*'], logLevel: 'silent' });
const migrations = await readD1Migrations(new URL('../migrations/', import.meta.url).pathname);
const limit = { timeout: 20_000 };
async function fixture(t, egressTransport) {
  let now = Date.now(), next = 0; const timers = new Map();
  const clock = { wallNow: () => now, monotonicNow: () => now,
    setTimer(fn, ms) { const id = ++next; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimer(id) { timers.delete(id); } };
  const secret = crypto.randomUUID();
  let server;
  const mf = new Miniflare({ modules: true, compatibilityDate: '2026-07-26',
    compatibilityFlags: ['nodejs_compat'], script: bundled.outputFiles[0].text,
    d1Databases: { DB: 'connector-integration' },
    durableObjects: { KNOWLEDGE: 'UnusedKnowledge' }, log: new Log(LogLevel.ERROR),
    bindings: { TEST_SECRET: secret, TEST_ORIGIN: origin },
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
    db.prepare("INSERT INTO connector_authorization_policy(singleton,origin,policy_version,enabled) VALUES(1,?,'policy-1',1)").bind(origin),
  ]);
  const boot = await mf.dispatchFetch(origin + '/__test/session', { headers: { 'x-test-secret': secret } });
  assert.equal(boot.status, 200);
  const { token, publicKey } = await boot.json();
  const key = await crypto.subtle.importKey('jwk', publicKey, 'Ed25519', false, ['verify']);
  let dropResponse = false; const consumptionStatuses = [];
  const serverOptions = { allowedOrigin: origin, policyVersion: 'policy-1', ...(egressTransport ? { egressTransport } : {}),
    verificationKeys: [{ keyId: 'integration-test', publicKey: key }], clock,
    fetch: async req => {
      assert.equal(req.url, origin + '/api/connector/consume');
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
  return { db, get server() { return server; }, api, binding, ticket, consumptionStatuses,
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
async function socket(t, f) {
  const ws = new WebSocket(f.server.url.replace('http:', 'ws:') + '/connector', { headers: { origin } });
  t.after(() => ws.terminate()); ws.on('error', () => {});
  let isClosed = false;
  const closed = new Promise(resolve => ws.once('close', code => { isClosed = true; resolve(code); }));
  const binaryQueue = [], binaryWaiters = [];
  ws.on('close', () => { for(const waiter of binaryWaiters.splice(0)) waiter.reject(new Error('Connector closed before binary reply')); });
  const messages = [], pending = [];
  ws.on('message', (bytes, binary) => { if (binary) { const waiter = binaryWaiters.shift(); if(waiter) waiter.resolve(bytes); else binaryQueue.push(bytes); return; } const value = JSON.parse(bytes.toString()); messages.push(value); pending.shift()?.(value); });
  await once(ws, 'open');
  return { closed, messages, get isClosed() { return isClosed; }, get isOpen() { return ws.readyState === WebSocket.OPEN; }, next: () => new Promise(resolve => pending.push(resolve)),
    batchBinary: frames => { ws._socket.cork(); for(const frame of frames) ws.send(frame); ws._socket.uncork(); },
    pauseReceive: () => ws._socket.pause(), resumeReceive: () => ws._socket.resume(),
    send: value => ws.send(JSON.stringify(value)), sendBinary: value => ws.send(value),
    nextBinary: () => binaryQueue.length ? Promise.resolve(binaryQueue.shift()) : isClosed ? Promise.reject(new Error('Connector closed before binary reply')) : new Promise((resolve,reject) => binaryWaiters.push({resolve,reject})) };
}
async function pair(f) {
  const response = await fetch(f.server.url + '/pair', { method: 'POST', headers: { origin: f.server.url, 'content-type': 'application/json' } });
  assert.equal(response.status, 200); return (await response.json()).pairingCode;
}
async function connect(t, f) {
  const channel = await socket(t, f), pairingCode = await pair(f), ready = channel.next();
  channel.send({ type: 'authenticate', version: 1, ticket: f.ticket, pairingCode });
  const message = await ready; assert.equal(message.type, 'ready'); assert.equal(message.forwarding, false);
  return { ...channel, get isClosed() { return channel.isClosed; }, get isOpen() { return channel.isOpen; }, lease: message.lease };
}

test('real Worker/D1 signed ticket authorizes a real socket, renews at 30s and closes at the renewed deadline', limit, async t => {
  const f = await fixture(t), c = await connect(t, f);
  assert.equal(c.lease.revision, 1);
  assert.equal(c.lease.expiresAtMs - c.lease.renewAfterMs, 30_000);
  const due = c.next(); await f.advance(30_000); assert.equal((await due).type, 'renewal-needed');
  const ticket = await f.renewal(c.lease.leaseId), renewed = c.next();
  c.send({ type: 'renew', version: 1, ticket });
  const message = await renewed;
  assert.equal(message.type, 'renewed'); assert.equal(message.lease.revision, 2);
  assert.equal(message.lease.leaseId, c.lease.leaseId);
  assert.equal(message.lease.expiresAtMs, c.lease.expiresAtMs + 30_000);
  await f.advance(60_000); assert.equal(await c.closed, 1008);
  assert.deepEqual(f.consumptionStatuses, [201, 201]);
});

for (const change of ['role', 'session', 'member', 'environment', 'policy', 'revoke', 'generation']) {
  test(`real ${change} invalidation after renewal issuance rejects consumption and closes the socket`, limit, async t => {
    const f = await fixture(t), c = await connect(t, f);
    const due = c.next(); await f.advance(30_000); await due;
    const ticket = await f.renewal(c.lease.leaseId);
    if (change === 'role') await f.db.prepare("DELETE FROM role_members WHERE member_id='member-a'").run();
    if (change === 'session') await f.db.prepare("DELETE FROM auth_sessions WHERE member_id='member-a'").run();
    if (change === 'member') await f.db.prepare("UPDATE members SET status='disabled' WHERE id='member-a'").run();
    if (change === 'environment') await f.db.prepare("DELETE FROM browser_environments WHERE id='env-a'").run();
    if (change === 'policy') await f.db.prepare('UPDATE connector_authorization_policy SET enabled=0').run();
    if (change === 'revoke') assert.equal((await f.api('connector-authority/revoke', { ...f.binding, operationId: 'revoke-1' })).status, 200);
    if (change === 'generation') {
      const { connectorId } = await (await fetch(f.server.url + '/identity')).json();
      assert.equal((await f.api('connector-authority', { operationId: 'reserve-2', expectedGeneration: 1, connectorId })).status, 201);
    }
    c.send({ type: 'renew', version: 1, ticket });
    assert.equal(await c.closed, 1008);
    assert.equal(c.messages.some(m => m.type === 'renewed'), false);
    assert.equal(f.consumptionStatuses.length, 2);
    const denied = { role: 403, session: 401, member: 401, environment: 409, policy: 503, revoke: 409, generation: 409 };
    assert.equal(f.consumptionStatuses[1], denied[change]);
    assert.equal(await f.count(), 1);
  });
}

test('lost response after actual D1 commit never emits ready and cannot trigger a second consume', limit, async t => {
  const f = await fixture(t); f.loseResponse();
  const c = await socket(t, f), pairingCode = await pair(f);
  c.send({ type: 'authenticate', version: 1, ticket: f.ticket, pairingCode });
  assert.equal(await c.closed, 1008); assert.deepEqual(c.messages, []);
  assert.equal(await f.count(), 1);
  const retry = await socket(t, f);
  retry.send({ type: 'authenticate', version: 1, ticket: f.ticket, pairingCode: await pair(f) });
  assert.equal(await retry.closed, 1008); assert.deepEqual(retry.messages, []);
  assert.deepEqual(f.consumptionStatuses, [201]); assert.equal(await f.count(), 1);
});

test('concurrent real sockets with one pairing and one signed ticket produce exactly one persisted consume', limit, async t => {
  const f = await fixture(t), a = await socket(t, f), b = await socket(t, f), pairingCode = await pair(f);
  const first = a.next(), second = b.next();
  const message = { type: 'authenticate', version: 1, ticket: f.ticket, pairingCode };
  a.send(message); b.send(message);
  const winner = await Promise.race([first.then(m => ({ channel: a, loser: b, message: m })), second.then(m => ({ channel: b, loser: a, message: m }))]);
  assert.equal(winner.message.type, 'ready'); assert.equal(await winner.loser.closed, 1008);
  assert.equal(await f.count(), 1); assert.deepEqual(f.consumptionStatuses, [201]);
  winner.channel.send({ type: 'disconnect', version: 1 }); assert.equal(await winner.channel.closed, 1000);
});

for (const invalid of ['signature', 'pairing', 'restart']) {
  test(`real issued ticket with invalid ${invalid} cannot reach D1 consumption`, limit, async t => {
    const f = await fixture(t);
    if (invalid === 'restart') await f.restart();
    const c = await socket(t, f); let pairingCode = await pair(f), ticket = f.ticket;
    if (invalid === 'pairing') pairingCode = 'x'.repeat(43);
    if (invalid === 'signature') {
      const parts = ticket.split('.'), signature = Buffer.from(parts[2], 'base64url'); signature[0] ^= 1;
      parts[2] = signature.toString('base64url'); ticket = parts.join('.');
    }
    c.send({ type: 'authenticate', version: 1, ticket, pairingCode });
    assert.equal(await c.closed, 1008); assert.deepEqual(c.messages, []);
    assert.equal(await f.count(), 0); assert.deepEqual(f.consumptionStatuses, []);
  });
}

test('real committed renewal with lost ACK cannot keep the old socket active', limit, async t => {
  const f = await fixture(t), c = await connect(t, f);
  const due = c.next(); await f.advance(30_000); await due;
  const ticket = await f.renewal(c.lease.leaseId); f.loseResponse();
  c.send({ type: 'renew', version: 1, ticket });
  assert.equal(await c.closed, 1008); assert.equal(c.messages.some(m => m.type === 'renewed'), false);
  assert.equal(await f.count(), 2);
  assert.equal(await f.db.prepare("SELECT revision FROM connector_leases WHERE environment_id='env-a'").first('revision'), 2);
  assert.deepEqual(f.consumptionStatuses, [201,201]);
});

test('server-side revoke without a renewal attempt cannot exceed the original 60s lease', limit, async t => {
  const f = await fixture(t), c = await connect(t, f);
  assert.equal((await f.api('connector-authority/revoke', { ...f.binding, operationId: 'revoke-1' })).status, 200);
  // No server-push channel exists: do not claim instantaneous offline revocation.
  await f.advance(59_999); assert.equal(c.isOpen, true); assert.equal(c.isClosed, false); assert.equal(c.messages.some(m => m.type === 'renewed'), false);
  await f.advance(1); assert.equal(await c.closed, 1008);
  assert.equal(await f.count(), 1); assert.deepEqual(f.consumptionStatuses, [201]);
});

for (const action of ['disconnect', 'stop']) {
  test(`explicit ${action} releases a socket authorized by real Worker/D1`, limit, async t => {
    const f = await fixture(t), c = await connect(t, f);
    if (action === 'disconnect') c.send({ type: 'disconnect', version: 1 });
    else {
      const response = await fetch(f.server.url + '/stop', { method: 'POST', headers: { origin: f.server.url, 'content-type': 'application/json' } });
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { stopped: true });
    }
    assert.equal(await c.closed, action === 'disconnect' ? 1000 : 1001);
    assert.equal(await f.count(), 1); assert.deepEqual(f.consumptionStatuses, [201]);
  });
}

// Egress uses the actual production DNS policy and real TCP. Only test DNS
// answers and the final already-pinned dial are routed to a local fixture.
async function tcpFixture(t, { pendingDns = false } = {}) {
  let started, release, cancellations=0;
  const dnsStarted=new Promise(resolve=>{started=resolve;});
  const dnsGate=new Promise(resolve=>{release=resolve;});
  t.after(()=>release());
  const peers=new Set(); let dns=0, dials=0, peer;
  const tcp=createServer(socket => { peer=socket; peers.add(socket); socket.on('error',()=>{});
    socket.on('close',()=>peers.delete(socket)); socket.on('data',data=>socket.write(data)); });
  await new Promise(resolve=>tcp.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{ for(const socket of peers) socket.destroy(); await new Promise(resolve=>tcp.close(resolve)); });
  const resolveDestination=createDestinationResolver({createResolver:()=>({
    async resolve4(name) { dns++; started(); assert.equal(name,'github.com'); if(pendingDns) await dnsGate; return ['140.82.112.3']; },
    async resolve6(name) { assert.equal(name,'github.com'); return []; }, cancel() { cancellations++; },
  })});
  const f=await fixture(t,{resolveDestination,dial(options) {
    dials++; assert.equal(options.host,'140.82.112.3'); assert.equal(options.port,443);
    assert.equal(options.family,4); assert.equal(options.autoSelectFamily,false);
    return dial({...options,host:'127.0.0.1',port:tcp.address().port});
  }});
  return {...f,dnsStarted,releaseDns:release,get cancellations(){return cancellations;},get dns(){return dns;},get dials(){return dials;},get peer(){return peer;}};
}
const tcpConnect=Buffer.from('010100000001bb016769746875622e636f6d','hex');
async function enableEgress(c) {
  const enabled=c.next(); c.send({type:'start-egress',version:1,protocol:'wisp-v1'});
  assert.deepEqual(await enabled,{type:'egress-ready',version:1,protocol:'wisp-v1',forwarding:true});
  assert.equal((await c.nextBinary()).toString('hex'),'030000000010000000');
}
async function echo(c,text='hello') {
  c.sendBinary(Buffer.concat([Buffer.from('0201000000','hex'),Buffer.from(text)]));
  assert.equal((await c.nextBinary()).toString('hex'),Buffer.concat([Buffer.from('0201000000','hex'),Buffer.from(text)]).toString('hex'));
}
test('real Worker/D1 consumption enables explicit WISP and real TCP bytes, disconnect destroys the peer',limit,async t=>{
  const f=await tcpFixture(t), c=await connect(t,f); assert.equal(f.dns,0); assert.equal(f.dials,0);
  await enableEgress(c); assert.equal(f.dns,0); c.sendBinary(tcpConnect); await echo(c);
  assert.equal(f.dns,1); assert.equal(f.dials,1); assert.deepEqual(f.consumptionStatuses,[201]); assert.equal(await f.count(),1);
  const ended=once(f.peer,'close'); c.send({type:'disconnect',version:1}); assert.equal(await c.closed,1000); await ended;
});
for(const state of ['unauthenticated','control-only']) test(`binary CONNECT in ${state} phase never starts DNS or TCP`,limit,async t=>{
  const f=await tcpFixture(t),c=state==='control-only'?await connect(t,f):await socket(t,f);
  c.sendBinary(tcpConnect); assert.equal(await c.closed,1008); assert.equal(f.dns,0); assert.equal(f.dials,0);
});
for(const action of ['expiry','renewal-denied','stop']) test(`real D1 authority with live TCP: ${action} actually closes both sockets`,limit,async t=>{
  const f=await tcpFixture(t),c=await connect(t,f); await enableEgress(c); c.sendBinary(tcpConnect); await echo(c);
  const ended=once(f.peer,'close');
  if(action==='stop') await f.server.close();
  if(action==='renewal-denied') {
    for(let i=0;i<3;i++) { await f.advance(10000); await echo(c); }
    const ticket=await f.renewal(c.lease.leaseId);
    await f.db.prepare('UPDATE connector_authorization_policy SET enabled=0').run();
    c.send({type:'renew',version:1,ticket});
  }
  if(action==='expiry') {
    for(let i=0;i<5;i++) { await f.advance(10000); await echo(c); }
    await f.advance(10000);
  }
  assert.equal(await c.closed,action==='stop'?1001:1008); await ended;
  assert.equal(f.dns,1); assert.equal(f.dials,1);
  if(action==='renewal-denied') assert.deepEqual(f.consumptionStatuses,[201,503]);
});
test('unsupported or repeated egress negotiation, malformed frames and synthetic probe IPs do not dial',limit,async t=>{
  for(const kind of ['version','repeat','continue','probe-ip','oversize-json']) {
    const f=await tcpFixture(t),c=await connect(t,f);
    if(kind==='version') c.send({type:'start-egress',version:1,protocol:'wisp-v2'});
    else {
      await enableEgress(c);
      if(kind==='repeat') c.send({type:'start-egress',version:1,protocol:'wisp-v1'});
      if(kind==='continue') c.sendBinary(Buffer.from('030100000010000000','hex'));
      if(kind==='oversize-json') c.send({type:'x',padding:'x'.repeat(11000)});
      if(kind==='probe-ip') {
        c.sendBinary(Buffer.concat([tcpConnect.subarray(0,8),Buffer.from('203.0.113.11')]));
        assert.equal((await c.nextBinary()).toString('hex'),'040100000002');
        c.send({type:'disconnect',version:1});
      }
    }
    assert.equal(await c.closed,kind==='probe-ip'?1000:1008); assert.equal(f.dns,0); assert.equal(f.dials,0);
  }
});
test('real WISP download splits 256KiB TCP into bounded frames and preserves exact bytes',limit,async t=>{
  const f=await tcpFixture(t),c=await connect(t,f); await enableEgress(c); c.sendBinary(tcpConnect); await echo(c);
  const input=Buffer.alloc(256*1024,0x61); f.peer.write(input);
  const chunks=[]; let received=0;
  while(received<input.length) {
    const frame=await c.nextBinary(); assert.equal(frame[0],2); assert.equal(frame.readUInt32LE(1),1);
    assert.ok(frame.length<=16389); chunks.push(frame.subarray(5)); received+=frame.length-5;
  }
  assert.deepEqual(Buffer.concat(chunks),input); c.send({type:'disconnect',version:1}); await c.closed;
});

test('real authority and WISP cancel pending DNS, late answer cannot dial',limit,async t=>{
  const f=await tcpFixture(t,{pendingDns:true}),c=await connect(t,f); await enableEgress(c);
  c.sendBinary(tcpConnect); await f.dnsStarted;
  c.sendBinary(Buffer.from('040100000002','hex'));
  assert.equal((await c.nextBinary()).toString('hex'),'040100000002');
  f.releaseDns(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.cancellations,1); assert.equal(f.dials,0);
  c.send({type:'disconnect',version:1}); await c.closed;
});
test('real authority WISP 17th upload before DNS credit closes and cancels resolver',limit,async t=>{
  const f=await tcpFixture(t,{pendingDns:true}),c=await connect(t,f); await enableEgress(c);
  c.sendBinary(tcpConnect); await f.dnsStarted;
  for(let i=0;i<17;i++) c.sendBinary(Buffer.from('020100000061','hex'));
  assert.equal(await c.closed,1008); f.releaseDns(); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.cancellations,1); assert.equal(f.dials,0);
});
test('real WISP replenishes 16-frame credit only after completed uploads, renewal keeps the same TCP stream',limit,async t=>{
  const f=await tcpFixture(t),c=await connect(t,f); await enableEgress(c); c.sendBinary(tcpConnect);
  for(let i=0;i<16;i++) c.sendBinary(Buffer.from('020100000061','hex'));
  let received=0,credit=false;
  while(received<16||!credit) {
    const frame=await c.nextBinary();
    if(frame[0]===3) { assert.equal(credit,false); assert.equal(frame.toString('hex'),'030100000010000000'); credit=true; }
    else { assert.equal(frame[0],2); received+=frame.length-5; assert.ok(frame.subarray(5).every(b=>b===0x61)); }
  }
  for(let i=0;i<3;i++) { await f.advance(10000); await echo(c); }
  const ticket=await f.renewal(c.lease.leaseId), renewed=c.next();
  c.send({type:'renew',version:1,ticket}); const result=await renewed;
  assert.equal(result.type,'renewed'); assert.equal(result.forwarding,true); await echo(c);
  assert.equal(f.dials,1); assert.deepEqual(f.consumptionStatuses,[201,201]);
  c.send({type:'disconnect',version:1}); await c.closed;
});

test('real Worker/D1 WISP slow browser backpressures actual TCP and resumes without losing bytes',limit,async t=>{
  const f=await tcpFixture(t),c=await connect(t,f); await enableEgress(c); c.sendBinary(tcpConnect); await echo(c);
  c.pauseReceive(); let written=0,waiting=false,done=false;
  const size=16*1024*1024, chunk=Buffer.alloc(16384,0x62);
  const pump=(async()=>{
    while(written<size) {
      const accepted=f.peer.write(chunk); written+=chunk.length;
      if(!accepted) { waiting=true; await once(f.peer,'drain'); waiting=false; }
    }
    done=true;
  })(); pump.catch(()=>{});
  let stable=0,last=-1; const deadline=performance.now()+5000;
  while(stable<100) {
    assert.ok(performance.now()<deadline,'upstream TCP must stall while browser is paused');
    await new Promise(resolve=>setTimeout(resolve,10));
    stable=waiting&&written===last?stable+10:0; last=written;
    assert.equal(c.isClosed,false); assert.equal(done,false);
  }
  assert.ok(written<size); c.resumeReceive(); let received=0;
  while(received<size) {
    const frame=await c.nextBinary(); assert.equal(frame[0],2); assert.equal(frame.readUInt32LE(1),1);
    assert.ok(frame.length<=16389); assert.ok(frame.subarray(5).every(b=>b===0x62)); received+=frame.length-5;
  }
  await pump; assert.equal(received,size); assert.equal(f.dials,1);
  c.send({type:'disconnect',version:1}); assert.equal(await c.closed,1000);
});

test('malformed binary frame closes synchronously before a coalesced valid CONNECT can start DNS',limit,async t=>{
  const f=await tcpFixture(t),c=await connect(t,f); await enableEgress(c);
  c.batchBinary([Buffer.from('030100000010000000','hex'),tcpConnect]);
  assert.equal(await c.closed,1008); assert.equal(f.dns,0); assert.equal(f.dials,0);
});
