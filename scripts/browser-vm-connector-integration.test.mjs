import { fixture, pair, origin } from './helpers/connector-authority-fixture.mjs';
import { V86 } from 'v86';
import { attachConnectorGuestNetwork } from '../tools/browser-vm/connector/guest-network.mjs';
import { dns as guestDns, tcp as guestTcp } from './helpers/connector-guest-packets.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, connect as dial } from 'node:net';
import { createDestinationResolver } from '../tools/browser-vm/connector/destination-policy.mjs';
import { WebSocket } from 'ws';
import { createConnectorEgressClient } from '../tools/browser-vm/connector/egress-client.mjs';

const limit = { timeout: 20_000 };
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

// The browser transport is real production code. Node's Origin injection only
// supplies the header that a native browser derives from its page context.
async function formalClient(t,f,options={}) {
  let resolveReady,rejectReady,resolveClose,readyLease;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const closed=new Promise(resolve=>{resolveClose=resolve;});
  const received=[],waiting=[];
  let ended=false,renewals=0,renewalStops=0;
  const client=createConnectorEgressClient({url:f.server.url.replace('http:','ws:')+'/connector',
    pairingCode:await pair(f),ticket:f.ticket,clock:f.clock,
    NativeWebSocket:class extends WebSocket {constructor(url){super(url,{headers:{origin}});}},
    renewTicket:(lease,signal)=>{assert.equal(signal.aborted,false);renewals++;signal.addEventListener('abort',()=>{renewalStops++;},{once:true});return f.renewal(lease.leaseId);},
    onReady:lease=>{readyLease=lease;resolveReady();},
    onFrame:frame=>{const next=waiting.shift();if(next)next.resolve(Buffer.from(frame));else received.push(Buffer.from(frame));},
    onClose:()=>{ended=true;rejectReady(new Error('Formal client closed before ready'));for(const next of waiting.splice(0))next.reject(new Error('Formal client closed'));resolveClose();},
    ...options});
  t.after(()=>client.close());await ready;
  return {client,closed,get lease(){return readyLease;},get renewals(){return renewals;},get renewalStops(){return renewalStops;},
    next:()=>received.length?Promise.resolve(received.shift()):ended?Promise.reject(new Error('Formal client closed')):new Promise((resolve,reject)=>waiting.push({resolve,reject}))};
}
test('formal browser client demuxes real Worker/D1 auth and renewals while the same real TCP stream stays live',limit,async t=>{
  const f=await tcpFixture(t),c=await formalClient(t,f);
  assert.equal((await c.next()).toString('hex'),'030000000010000000');assert.equal(f.dns,0);
  assert.equal(c.client.send(tcpConnect),true);
  const payload=Buffer.from('0201000000666f726d616c','hex');
  for(let elapsed=0;elapsed<30_000;elapsed+=10_000){assert.equal(c.client.send(payload),true);assert.deepEqual(await c.next(),payload);await f.advance(10_000);}
  c.client.send(payload);assert.deepEqual(await c.next(),payload);
  const deadline=Date.now()+3000;
  while(await f.count()<2||c.renewalStops<1){assert.equal(c.client.readyState,1);assert.ok(Date.now()<deadline,'Renewal ACK did not complete');await new Promise(resolve=>setTimeout(resolve,10));}
  // The ACK must reach the client: advancing beyond its pending-operation 5s
  // deadline would close if JSON renewal was not consumed by this exact client.
  await f.advance(6000);
  assert.equal(c.client.readyState,1);assert.equal(c.client.send(payload),true);assert.deepEqual(await c.next(),payload);
  assert.equal(c.renewals,1);assert.equal(f.dials,1);assert.equal(f.dns,1);
  const peerClosed=once(f.peer,'close');c.client.close();await c.closed;await peerClosed;
});
test('formal client cancellation aborts real pending DNS and late completion cannot dial',limit,async t=>{
  const f=await tcpFixture(t,{pendingDns:true}),c=await formalClient(t,f);await c.next();
  assert.equal(c.client.send(tcpConnect),true);await f.dnsStarted;c.client.close();await c.closed;
  await new Promise(resolve=>setTimeout(resolve,20));f.releaseDns();await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.dials,0);assert.ok(f.cancellations>0);assert.equal(c.client.readyState,3);
});
test('real Worker rejects disabled policy renewal and formal client closes its TCP peer without reconnect',limit,async t=>{
  const f=await tcpFixture(t),c=await formalClient(t,f);await c.next();c.client.send(tcpConnect);
  const payload=Buffer.from('020100000064656e79','hex');
  for(let i=0;i<2;i++){c.client.send(payload);assert.deepEqual(await c.next(),payload);await f.advance(10_000);}
  await f.db.prepare('UPDATE connector_authorization_policy SET enabled=0').run();
  const peerClosed=once(f.peer,'close');await f.advance(10_000);await c.closed;await peerClosed;
  assert.equal(c.client.readyState,3);assert.equal(c.renewals,1);assert.equal(f.dials,1);
});

const dnsRequest = (requestId = 1, hostname = 'github.com') => ({ type: 'resolve-destination', version: 1, requestId, hostname });
test('formal DNS traverses real Worker/D1 authorization, then TCP independently resolves the domain again',limit,async t=>{
  const f=await tcpFixture(t),c=await formalClient(t,f);await c.next();
  assert.deepEqual(await c.client.resolve('github.com'),{hostname:'github.com',address:'140.82.112.3'});
  assert.equal(f.dns,1);assert.equal(f.dials,0);assert.equal(await f.count(),1);
  assert.equal(c.client.send(tcpConnect),true);
  const payload=Buffer.from('0201000000646e73','hex');c.client.send(payload);assert.deepEqual(await c.next(),payload);
  assert.equal(f.dns,2);assert.equal(f.dials,1);c.client.close();await c.closed;
});
test('formal DNS cancellation releases the actual pending resolver and late answer cannot dial',limit,async t=>{
  const f=await tcpFixture(t,{pendingDns:true}),c=await formalClient(t,f);await c.next();
  const rejected=assert.rejects(c.client.resolve('github.com'),/Connector DNS ended/);
  await f.dnsStarted;c.client.close();await rejected;await c.closed;
  const deadline=Date.now()+3000;
  while(!f.cancellations){assert.ok(Date.now()<deadline);await new Promise(resolve=>setTimeout(resolve,10));}
  f.releaseDns();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.dials,0);assert.equal(f.dns,1);
});
for(const state of ['unauthenticated','control-only','invalid-name','invalid-shape'])test(`real formal DNS rejects ${state} before any resolver work`,limit,async t=>{
  const f=await tcpFixture(t),c=state==='unauthenticated'?await socket(t,f):await connect(t,f);
  if(state.startsWith('invalid'))await enableEgress(c);
  const first=state==='invalid-name'?dnsRequest(1,'evil.test'):state==='invalid-shape'?{...dnsRequest(),extra:1}:dnsRequest();
  c.batchBinary([JSON.stringify(first),JSON.stringify(dnsRequest(2))]);
  assert.equal(await c.closed,1008);assert.equal(f.dns,0);assert.equal(f.dials,0);
});

test('formal DNS remains on the old live lease while renewal issuance is pending',limit,async t=>{
  const f=await tcpFixture(t);let release,started,issuance;
  const gate=new Promise(resolve=>{release=resolve;}),renewing=new Promise(resolve=>{started=resolve;});
  const c=await formalClient(t,f,{renewTicket:lease=>{issuance=(async()=>{started();await gate;return f.renewal(lease.leaseId);})();return issuance;}});await c.next();
  await f.advance(30_000);await renewing;
  assert.deepEqual(await c.client.resolve('github.com'),{hostname:'github.com',address:'140.82.112.3'});
  assert.equal(f.dns,1);assert.equal(f.dials,0);assert.equal(await f.count(),1);
  // Resolve issuance after closing: no late ticket may revive the channel.
  c.client.close();await c.closed;release();await issuance;
});

test('server accepts formal DNS during real renewal consumption without extending the old lease early',limit,async t=>{
  const f=await tcpFixture(t),c=await connect(t,f);await enableEgress(c);await f.advance(30_000);
  const ticket=await f.renewal(c.lease.leaseId),a=c.next(),b=c.next();
  c.batchBinary([JSON.stringify({type:'renew',version:1,ticket}),JSON.stringify(dnsRequest())]);
  const results=await Promise.all([a,b]);assert.deepEqual(results.map(v=>v.type).sort(),['destination-resolved','renewed']);
  assert.equal(f.dns,1);assert.equal(f.dials,0);assert.equal(await f.count(),2);
  c.send({type:'disconnect',version:1});await c.closed;
});

test('real v86 Ethernet DNS and TCP traverse the formal client, signed Worker/D1 lease and local TCP',limit,async t=>{
 const f=await tcpFixture(t);
 const machine=new V86({wasm_path:process.cwd()+'/node_modules/v86/build/v86.wasm',autostart:false,disable_speaker:true,memory_size:16*1024*1024,net_device:{type:'ne2k',relay_url:'fetch',dns_method:'static'}});
 await new Promise(resolve=>machine.add_listener('emulator-ready',resolve));t.after(()=>machine.destroy());
 let network,readyResolve,readyReject,closeResolve;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),closed=new Promise(resolve=>{closeResolve=resolve;});
 const client=createConnectorEgressClient({url:f.server.url.replace('http:','ws:')+'/connector',pairingCode:await pair(f),ticket:f.ticket,clock:f.clock,
  NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin}});}},renewTicket:lease=>f.renewal(lease.leaseId),
  onReady:readyResolve,onFrame:frame=>network?.receive(frame),onClose:()=>{network?.close();readyReject(new Error('Closed before ready'));closeResolve();}});
 t.after(()=>client.close());await ready;
 network=attachConnectorGuestNetwork({machine,client,clock:f.clock});const frames=[],mac=machine.network_adapter.vm_mac;
 machine.bus.pair.register('net0-receive',bytes=>frames.push(Buffer.from(bytes)));
 const input=bytes=>machine.bus.pair.send('net0-send',bytes);
 async function until(predicate){const deadline=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<deadline,'No expected guest Ethernet response');await new Promise(resolve=>setTimeout(resolve,5));}}
 input(guestDns(mac));await until(()=>frames.length===1);
 assert.deepEqual([...frames[0].subarray(-4)],[140,82,112,3]);assert.equal(f.dns,1);assert.equal(f.dials,0);
 input(guestTcp(mac));input(guestTcp(mac,{seq:101,ack:1338,flags:16}));input(guestTcp(mac,{seq:101,ack:1338,flags:24,data:'formal-v86'}));
 await until(()=>frames.some(b=>b.length>54&&b.subarray(54).toString()==='formal-v86'));
 assert.equal(f.dns,2);assert.equal(f.dials,1);assert.equal(await f.count(),1);
 const peerClosed=once(f.peer,'close');network.close();await closed;await peerClosed;
 input(guestTcp(mac,{source:12002}));assert.equal(f.dials,1);assert.equal(Object.keys(machine.network_adapter.tcp_conn).length,0);
});
