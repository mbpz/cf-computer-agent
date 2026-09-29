import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectorEgressClient } from '../tools/browser-vm/connector/egress-client.mjs';

const url = 'ws://127.0.0.1:9876/connector', pairingCode = 'a'.repeat(43);
const lease = { leaseId: 'lease-a', revision: 1, expiresAtMs: 61_000, renewAfterMs: 31_000 };
const credit0 = Buffer.from('030000000010000000','hex');
const connect = Buffer.from('010100000001bb016769746875622e636f6d','hex');
const data = Buffer.from('02010000006869','hex');
const flush = async () => { for(let i=0;i<5;i++) await Promise.resolve(); };
function fixture(options = {}) {
  let wall=1000, mono=0, next=0, instances=0; const timers=new Map();
  const clock={wallNow:()=>wall,monotonicNow:()=>mono,setTimer(fn,ms){const id=++next;timers.set(id,{fn,at:mono+ms});return id;},clearTimer(id){timers.delete(id);}};
  let ws; class Socket extends EventTarget {
    readyState=0; bufferedAmount=0; sent=[]; closes=0;
    constructor(destination){super();assert.equal(destination,url);instances++;ws=this;}
    send(value){this.sent.push(typeof value==='string'?JSON.parse(value):Buffer.from(value));}
    close(){this.closes++;this.readyState=3;}
    emit(type,data){if(type==='open')this.readyState=1;this.dispatchEvent(type==='message'?new MessageEvent(type,{data}):new Event(type));}
  }
  const frames=[],closed=[],ready=[],renewals=[];
  const client=createConnectorEgressClient({url,pairingCode,ticket:'initial-ticket',NativeWebSocket:Socket,clock,
    onReady:value=>ready.push(value),onFrame:value=>frames.push(Buffer.from(value)),onClose:value=>closed.push(value),
    renewTicket:async (value,signal)=>{renewals.push({value,signal});return 'renew-ticket';},...options});
  const json=value=>ws.emit('message',JSON.stringify(value));
  const binary=value=>ws.emit('message',Uint8Array.from(value).buffer);
  const open=()=>{ws.emit('open');json({type:'ready',version:1,forwarding:false,lease});};
  const active=()=>{open();json({type:'egress-ready',version:1,protocol:'wisp-v1',forwarding:true});binary(credit0);};
  return {client,ws,clock,frames,closed,ready,renewals,json,binary,open,active,timers,get instances(){return instances;},
    advance(ms,{run=true,wallDelta=ms}={}){mono+=ms;wall+=wallDelta;if(run)for(const[id,t]of[...timers])if(t.at<=mono){timers.delete(id);t.fn();}}};
}

test('formal credentials stay in initial JSON; data capability waits for enable ACK and stream-zero credit',()=>{
  const f=fixture(); assert.equal(f.client.readyState,0); assert.deepEqual(f.ws.sent,[]);
  f.open(); assert.deepEqual(f.ws.sent,[{type:'authenticate',version:1,pairingCode,ticket:'initial-ticket'}, {type:'start-egress',version:1,protocol:'wisp-v1'}]);
  assert.deepEqual(f.frames,[]);assert.deepEqual(f.ready,[]);
  f.json({type:'egress-ready',version:1,protocol:'wisp-v1',forwarding:true});assert.equal(f.client.readyState,0);
  f.binary(credit0);assert.equal(f.client.readyState,1);assert.deepEqual(f.ready,[lease]);assert.ok(Object.isFrozen(f.ready[0]));
  assert.deepEqual(f.frames,[credit0]);assert.equal(f.client.send(connect),true);assert.equal(f.client.send(data),true);
  f.binary(data);assert.deepEqual(f.frames,[credit0,data]);f.client.close();assert.equal(f.ws.closes,1);
});

test('constructor refuses noncanonical destinations and invalid credentials before opening a socket',()=>{
  for(const destination of ['wss://127.0.0.1:9876/connector','ws://localhost:9876/connector',url+'?ticket=x',url+'#x',url.replace('9876','0'),url.replace('9876','65536'),url.replace('/connector','/probe')])assert.throws(()=>fixture({url:destination}));
  for(const input of [{pairingCode:'short'},{ticket:''},{ticket:'x'.repeat(8193)}])assert.throws(()=>fixture(input));
});

test('cancel before native open prevents credentials, ignores late events and never reconnects',()=>{
  const f=fixture();f.client.close();f.client.close();f.ws.emit('open');f.json({type:'ready',version:1,forwarding:false,lease});f.ws.emit('error');
  assert.deepEqual(f.ws.sent,[]);assert.equal(f.ws.closes,1);assert.equal(f.instances,1);assert.equal(f.closed.length,1);assert.equal(f.timers.size,0);
});

test('pre-authorization or pre-credit data closes rather than queueing',()=>{
  for(const prepare of [()=>{},f=>f.open(),f=>{f.open();f.json({type:'egress-ready',version:1,protocol:'wisp-v1',forwarding:true});}]){
    const f=fixture();prepare(f);assert.equal(f.client.send(connect),false);assert.equal(f.client.readyState,3);assert.equal(f.ws.sent.some(Buffer.isBuffer),false);
  }
});

test('bounded handshake timeout is checked independently of timer execution',()=>{
  for(const run of [true,false]){const f=fixture();f.advance(5000,{run});f.ws.emit('open');assert.equal(f.client.readyState,3);assert.deepEqual(f.ws.sent,[]);assert.equal(f.closed.length,1);}
});

test('wrong phases, control shape, forwarding, lease fields and duplicate initial credit fail closed',()=>{
  const invalid=[{type:'ready',version:1,forwarding:true,lease},{type:'ready',version:2,forwarding:false,lease},
    {type:'ready',version:1,forwarding:false,lease:{...lease,revision:2}},
    {type:'ready',version:1,forwarding:false,lease:{...lease,expiresAtMs:61_001}},
    {type:'ready',version:1,forwarding:false,lease:{...lease,renewAfterMs:62_000}},
    {type:'ready',version:1,forwarding:false,lease,extra:'ignored?'},
    {type:'renewed',version:1,forwarding:true,lease}];
  for(const frame of invalid){const f=fixture();f.ws.emit('open');f.json(frame);assert.equal(f.client.readyState,3);assert.deepEqual(f.ready,[]);}
  const f=fixture();f.active();f.binary(credit0);assert.equal(f.client.readyState,3);
});

test('malformed or oversized incoming JSON and unexpected binary never reaches VM callback',()=>{
  for(const bytes of ['{','x'.repeat(10241),new ArrayBuffer(16390),new Blob(['no'])]){
    const f=fixture();f.ws.emit('open');f.ws.emit('message',bytes);assert.equal(f.client.readyState,3);assert.deepEqual(f.frames,[]);
  }
});

test('outgoing TCP targets are exact names, not probe IPs or arbitrary hostnames',()=>{
  for(const name of ['203.0.113.11','evil.example','github.com.','https://github.com']){
    const f=fixture();f.active();assert.equal(f.client.send(Buffer.concat([connect.subarray(0,8),Buffer.from(name)])),false);assert.equal(f.ws.sent.some(Buffer.isBuffer),false);
  }
});

test('stream cap, monotonic IDs, legal directions and 16-credit window fail closed before extra upload',()=>{
  for(const variant of ['window','reuse','zero','udp','port','direction','oversize','streams']){
    const f=fixture();f.active();assert.equal(f.client.send(connect),true);
    if(variant==='window'){for(let i=0;i<16;i++)assert.equal(f.client.send(data),true);assert.equal(f.client.send(data),false);}
    else if(variant==='streams'){for(let id=2;id<=8;id++){const b=Buffer.from(connect);b.writeUInt32LE(id,1);assert.equal(f.client.send(b),true);}const b=Buffer.from(connect);b.writeUInt32LE(9,1);assert.equal(f.client.send(b),false);}
    else {const b=variant==='direction'?credit0:variant==='oversize'?Buffer.alloc(16390):Buffer.from(connect);if(variant==='zero')b.writeUInt32LE(0,1);if(variant==='udp'){b.writeUInt32LE(2,1);b[5]=2;}if(variant==='port'){b.writeUInt32LE(2,1);b.writeUInt16LE(22,6);}assert.equal(f.client.send(b),false);}
    assert.equal(f.client.readyState,3);assert.equal(f.closed.length,1);
  }
});

test('server credit replaces a fully spent window; unsolicited credit cannot inflate it',()=>{
  const f=fixture();f.active();f.client.send(connect);for(let i=0;i<16;i++)f.client.send(data);
  const credit=Buffer.from('030100000010000000','hex');f.binary(credit);assert.equal(f.client.send(data),true);
  f.binary(credit);assert.equal(f.client.readyState,3);
});

test('retired streams tolerate already-in-flight replies but never reopen or consume new credit',()=>{
  const f=fixture();f.active();f.client.send(connect);f.client.send(Buffer.from('040100000002','hex'));
  f.binary(data);f.binary(Buffer.from('040100000002','hex'));assert.equal(f.client.readyState,1);assert.deepEqual(f.frames,[credit0]);
  assert.equal(f.client.send(data),false);assert.equal(f.client.readyState,3);
});

test('socket buffer has a hard limit instead of an application queue',()=>{
  const f=fixture();f.active();f.client.send(connect);f.ws.bufferedAmount=3*1024*1024;
  const count=f.ws.sent.length;assert.equal(f.client.send(data),false);assert.equal(f.ws.sent.length,count);assert.equal(f.client.readyState,3);
});

test('renewal uses one abortable callback per lease revision; only binary is delivered during renewal',async()=>{
  const f=fixture();f.active();f.client.send(connect);f.advance(30_000);
  f.json({type:'renewal-needed',version:1,leaseId:'lease-a',revision:1});await flush();
  assert.equal(f.renewals.length,1);assert.ok(Object.isFrozen(f.renewals[0].value));assert.equal(f.renewals[0].signal.aborted,false);
  assert.deepEqual(f.ws.sent.at(-1),{type:'renew',version:1,ticket:'renew-ticket'});
  assert.equal(f.client.send(data),true);f.binary(data);
  f.json({type:'renewed',version:1,forwarding:true,lease:{...lease,revision:2,expiresAtMs:91_000,renewAfterMs:61_000}});
  assert.equal(f.client.readyState,1);assert.equal(f.renewals[0].signal.aborted,true);assert.equal(f.ready.length,1);assert.deepEqual(f.frames,[credit0,data]);
});

test('failed or unknown renewal results close without retry and abort callback work',async()=>{
  for(const result of [()=>Promise.reject(new Error('private-token')),()=>Promise.resolve(''),()=>new Promise(()=>{})]){
    let calls=0,signal;const f=fixture({renewTicket:(_lease,s)=>{calls++;signal=s;return result();}});f.active();f.advance(30_000);await flush();f.advance(5000);await flush();
    assert.equal(f.client.readyState,3);assert.equal(calls,1);assert.equal(signal.aborted,true);assert.equal(f.instances,1);assert.equal(JSON.stringify(f.closed).includes('private-token'),false);
  }
});

test('late renewal after cancellation or elapsed timeout cannot send or resurrect a lease',async()=>{
  for(const action of ['cancel','timeout']){let resolve;const f=fixture({renewTicket:()=>new Promise(r=>{resolve=r;})});f.active();f.advance(30_000);await flush();
    if(action==='cancel')f.client.close();else f.advance(5000,{run:false});resolve('late-ticket');await flush();
    assert.equal(f.client.readyState,3);assert.equal(f.ws.sent.some(x=>x.type==='renew'),false);assert.equal(f.closed.length,1);
  }
});

test('old lease hard deadline is retained during renewal despite wall-clock rollback and suspended timers',async()=>{
  let signal;const f=fixture({renewTicket:(_lease,s)=>{signal=s;return new Promise(()=>{});}});f.active();f.client.send(connect);f.advance(30_000);await flush();
  f.advance(30_000,{run:false,wallDelta:-100_000});assert.equal(f.client.send(data),false);assert.equal(f.client.readyState,3);assert.equal(signal.aborted,true);
});

test('renewed ACK cannot change lease identity, skip revision, lose forwarding or arrive unsolicited',async()=>{
  for(const change of [{leaseId:'other'},{revision:3},{expiresAtMs:100_000},{renewAfterMs:29_000},{extra:true}]){
    const f=fixture();f.active();f.advance(30_000);await flush();f.json({type:'renewed',version:1,forwarding:true,lease:{...lease,revision:2,expiresAtMs:91_000,renewAfterMs:61_000,...change}});assert.equal(f.client.readyState,3);
  }
  const f=fixture();f.active();f.json({type:'renewed',version:1,forwarding:true,lease});assert.equal(f.client.readyState,3);
});

test('callback exceptions fail closed and do not leak their message; close callback runs once',()=>{
  const f=fixture({onFrame:()=>{throw new Error('secret-body');}});f.active();assert.equal(f.client.readyState,3);f.ws.emit('close');assert.equal(f.closed.length,1);assert.equal(JSON.stringify(f.closed).includes('secret-body'),false);
});


test('hard expiry beats the renewal timeout even when timer callbacks are suspended',async()=>{
  let signal;const f=fixture({renewTicket:(_lease,s)=>{signal=s;return new Promise(()=>{});}});
  f.ws.emit('open');f.json({type:'ready',version:1,forwarding:false,lease:{...lease,expiresAtMs:34_000}});
  f.json({type:'egress-ready',version:1,protocol:'wisp-v1',forwarding:true});f.binary(credit0);f.client.send(connect);
  f.advance(30_000);await flush();f.advance(3000,{run:false,wallDelta:-100_000});
  assert.equal(f.client.send(data),false);assert.equal(signal.aborted,true);assert.equal(f.closed.length,1);
});

test('a forward then backward wall-clock change cannot postpone an already accepted lease',async()=>{
  const f=fixture();f.active();f.client.send(connect);
  f.advance(1000,{wallDelta:30_000});
  f.json({type:'renewal-needed',version:1,leaseId:'lease-a',revision:1});await flush();
  f.json({type:'renewed',version:1,forwarding:true,lease:{...lease,revision:2,expiresAtMs:91_000,renewAfterMs:61_000}});
  assert.equal(f.client.readyState,1);assert.equal(f.renewals.length,1);
  f.advance(60_000,{run:false,wallDelta:-100_000});
  assert.equal(f.client.send(data),false);assert.equal(f.client.readyState,3);
});

test('malformed server data, future streams, oversized frames or inflated credit are never delivered',()=>{
  for(const hex of ['010100000001bb016769746875622e636f6d','02020000006869','040100000008','030100000011000000','0301000000','02000000006869']){
    const f=fixture();f.active();f.client.send(connect);f.binary(Buffer.from(hex,'hex'));assert.equal(f.client.readyState,3);assert.deepEqual(f.frames,[credit0]);
  }
});

test('local message and byte budgets include ignored retired-stream replies',()=>{
  for(const mode of ['frames','bytes']){
    const f=fixture();f.active();f.client.send(connect);f.client.send(Buffer.from('040100000002','hex'));
    const payload=mode==='bytes'?Buffer.concat([data.subarray(0,5),Buffer.alloc(16384)]):data;
    const attempts=mode==='bytes'?4100:100000;
    for(let i=0;i<attempts&&f.client.readyState===1;i++)f.binary(payload);
    assert.equal(f.client.readyState,3);assert.deepEqual(f.frames,[credit0]);assert.equal(f.closed.length,1);
  }
});

test('renewal ACK keeps forwarding and early renewal notifications do not request a ticket',async()=>{
  const early=fixture();early.active();early.json({type:'renewal-needed',version:1,leaseId:'lease-a',revision:1});await flush();
  assert.equal(early.client.readyState,3);assert.equal(early.renewals.length,0);
  const f=fixture();f.active();f.advance(30_000);await flush();
  f.json({type:'renewed',version:1,forwarding:false,lease:{...lease,revision:2,expiresAtMs:91_000,renewAfterMs:61_000}});
  assert.equal(f.client.readyState,3);
});


test('all three approved names and both approved ports work without importing Node-only protocol code',()=>{
  const f=fixture();f.active();let id=0;
  for(const hostname of ['dl-cdn.alpinelinux.org','github.com','api.github.com'])for(const port of [80,443]){
    const header=Buffer.from(connect.subarray(0,8));header.writeUInt32LE(++id,1);header.writeUInt16LE(port,6);
    assert.equal(f.client.send(Buffer.concat([header,Buffer.from(hostname)])),true);
  }
  assert.equal(f.client.readyState,1);assert.equal(f.ws.sent.filter(Buffer.isBuffer).length,6);f.client.close();
});


test('formal client DNS stays on authorization JSON and returns only its matching policy-approved result',async()=>{
 const f=fixture();f.active();const answer=f.client.resolve('github.com');assert.deepEqual(f.ws.sent.at(-1),{type:'resolve-destination',version:1,requestId:1,hostname:'github.com'});
 f.json({type:'destination-resolved',version:1,requestId:1,hostname:'github.com',address:'140.82.112.3'});
 assert.deepEqual(await answer,{hostname:'github.com',address:'140.82.112.3'});assert.deepEqual(f.frames,[credit0]);f.client.close();
});
test('client DNS refuses unknown names, mismatched replies, private IPs and duplicate results',async()=>{
 const denied=fixture();denied.active();await assert.rejects(denied.client.resolve('evil.test'));assert.equal(denied.ws.sent.some(x=>x.type==='resolve-destination'),false);
 for(const change of [{requestId:2},{hostname:'api.github.com'},{address:'127.0.0.1'},{address:'203.0.113.11'},{address:'140.082.112.3'},{address:'2606:4700::1'},{extra:true}]){
  const f=fixture();f.active();const answer=f.client.resolve('github.com');const rejected=assert.rejects(answer);f.json({type:'destination-resolved',version:1,requestId:1,hostname:'github.com',address:'140.82.112.3',...change});await rejected;assert.equal(f.client.readyState,3);
 }
 const f=fixture();f.active();const answer=f.client.resolve('github.com');const frame={type:'destination-resolved',version:1,requestId:1,hostname:'github.com',address:'140.82.112.3'};f.json(frame);await answer;f.json(frame);assert.equal(f.client.readyState,3);
});
test('client DNS caps pending requests and rejects all on cancellation or late timeout without retry',async()=>{
 for(const mode of ['cap','close','timeout','delayed-timer']){
  const f=fixture();f.active();const pending=[f.client.resolve('github.com'),f.client.resolve('api.github.com'),f.client.resolve('dl-cdn.alpinelinux.org')];
  const rejected=pending.map(p=>assert.rejects(p));if(mode==='cap')rejected.push(assert.rejects(f.client.resolve('github.com')));if(mode==='close')f.client.close();if(mode==='timeout')f.advance(5000);if(mode==='delayed-timer'){f.advance(5000,{run:false});f.json({type:'destination-resolved',version:1,requestId:1,hostname:'github.com',address:'140.82.112.3'});}
  await Promise.all(rejected);assert.equal(f.client.readyState,3);assert.equal(f.ws.sent.filter(x=>x.type==='resolve-destination').length,3);assert.equal(f.instances,1);
 }
});
