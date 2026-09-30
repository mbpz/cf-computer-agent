import {test as nodeTest} from 'node:test';
import assert from 'node:assert/strict';
import {createAccountVmNetwork} from '../frontend/features/environments/account-network.mjs';
const test=(name,run)=>nodeTest(name,{timeout:3000},run);
const origin='https://workbench.example';
const authority={runtimeId:'runtime-new',generation:4,connectorId:'device-a',origin,policyVersion:'policy-1',state:'active'};
const inputs={port:61006,connectorId:'device-a',pairingCode:'a'.repeat(43)};
function setup({respond,clock}={}){
 let current=true, next=0;const requests=[],sockets=[],events=new EventTarget();
 class Socket extends EventTarget {
  constructor(url){super();this.url=url;this.readyState=0;this.bufferedAmount=0;sockets.push(this);}
  close(){this.readyState=3;this.dispatchEvent(new Event('close'));}
  send(data){this.sent??=[];this.sent.push(data);}
 }
 const requester=async(path,init)=>{requests.push({path,...init});return respond?respond(path,init):Response.json(path.endsWith('connector-tickets')?{ticket:'signed-ticket'}:{authority: init.method==='GET'?{...authority,generation:3}:authority});};
 const runtime=createAccountVmNetwork({environmentId:'env-a',scope:{origin,memberId:'member-a',sessionEpoch:1},isCurrent:()=>current,requester,events,NativeWebSocket:Socket,clock,operationId:()=>`operation-${++next}`});
 return {runtime,requests,sockets,events,changeAccount(){current=false;}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
// Removing same-origin credentials or allowing caller-controlled identity fails this contract.
test('explicit connect uses server generation and fixed authenticated endpoints without a memberId payload',async()=>{
 const f=setup();const pending=f.runtime.connect(inputs);const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);
 await tick();assert.equal(f.sockets.length,1);assert.equal(f.sockets[0].url,'ws://127.0.0.1:61006/connector');
 assert.deepEqual(f.requests.map(r=>[r.path,r.method]),[
 ['/api/environments/env-a/connector-authority','GET'],['/api/environments/env-a/connector-authority','POST'],['/api/environments/env-a/connector-tickets','POST']]);
 assert.deepEqual(JSON.parse(f.requests[1].body),{operationId:'operation-1',connectorId:'device-a',expectedGeneration:3});
 assert.deepEqual(JSON.parse(f.requests[2].body),{operationId:'operation-2',runtimeId:'runtime-new',generation:4});
 for(const req of f.requests){assert.equal(req.credentials,'same-origin');assert.equal(req.redirect,'error');assert.equal(req.cache,'no-store');assert.equal(req.signal.aborted,false);assert.equal(req.headers['content-type'],req.method==='POST'?'application/json':undefined);}
 f.runtime.disconnect();await rejected;assert.equal(f.sockets[0].readyState,3);assert.equal(f.runtime.state.status,'offline');
});
for(const action of ['disconnect','beforeRestore','dispose','offline','pagehide'])test(`${action} cancels a pending server reservation and ignores its late result`,async()=>{
 let release;const f=setup({respond:()=>new Promise(r=>{release=r;})});
 const pending=f.runtime.connect(inputs);const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);
 if(['offline','pagehide'].includes(action))f.events.dispatchEvent(new Event(action));else f.runtime[action]();
 await rejected;assert.equal(f.requests[0].signal.aborted,true);release(Response.json({authority}));await tick();assert.equal(f.requests.length,1);assert.equal(f.sockets.length,0);
});
test('account switch during reserve prevents issue and all later use of the old owner',async()=>{
 let release;const f=setup({respond:()=>release?Response.json({authority}):new Promise(r=>{release=r;})});
 const pending=f.runtime.connect(inputs);f.changeAccount();release(Response.json({authority}));
 await assert.rejects(pending,/ACCOUNT_CHANGED/);assert.equal(f.requests.length,1);assert.equal(f.sockets.length,0);
 await assert.rejects(f.runtime.connect(inputs),/NETWORK_CLOSED|ACCOUNT_CHANGED/);
});
test('reservation conflict is not retried or promoted to a socket',async()=>{
 const f=setup({respond:()=>new Response('{"error":{"code":"CONNECTOR_AUTHORIZATION_CONFLICT","message":"secret-ticket"}}',{status:409})});
 await assert.rejects(f.runtime.connect(inputs),e=>e.message==='NETWORK_API_409');assert.equal(f.requests.length,1);assert.equal(f.sockets.length,0);
});
for(const patch of [{generation:3},{connectorId:'other'},{origin:'https://evil.example'},{runtimeId:''},{state:'revoked'}])test(`rejects invalid reserve binding ${JSON.stringify(patch)}`,async()=>{
 const f=setup({respond:(p,i)=>Response.json({authority:i.method==='GET'?{...authority,generation:3}:{...authority,...patch}})});
 await assert.rejects(f.runtime.connect(inputs),/INVALID_AUTHORITY/);assert.equal(f.requests.length,2);assert.equal(f.sockets.length,0);
});
test('invalid manual connection input never reserves server authority',async()=>{
 const f=setup();for(const bad of [{port:65536},{port:'61006'},{connectorId:'../escape'},{pairingCode:'bad'}])await assert.rejects(f.runtime.connect({...inputs,...bad}),/INVALID_CONNECTOR/);
 assert.equal(f.requests.length,0);f.runtime.dispose();
});
test('a second click while reserving is rejected without another request',async()=>{
 const f=setup({respond:()=>new Promise(()=>{})});const pending=f.runtime.connect(inputs);const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);
 await assert.rejects(f.runtime.connect(inputs),/NETWORK_BUSY/);assert.equal(f.requests.length,1);f.runtime.dispose();await rejected;
});
test('preparation deadline aborts even an uncooperative fetch, with no retry',async()=>{
 let now=0,expire;const clock={monotonicNow:()=>now,setTimer(fn){expire=fn;return 1;},clearTimer(){}};
 const f=setup({clock,respond:()=>new Promise(()=>{})});const pending=f.runtime.connect(inputs);now=10000;expire();
 await assert.rejects(pending,/NETWORK_CANCELLED/);assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.requests.length,1);assert.equal(f.runtime.state.reason,'connection-timeout');
});
test('oversized API responses are rejected and never logged as an error',async()=>{
 const f=setup({respond:()=>Response.json({authority:null,padding:'x'.repeat(17000)})});await assert.rejects(f.runtime.connect(inputs),/INVALID_RESPONSE/);assert.equal(f.sockets.length,0);
});
test('total deadline includes reservation time even if ready arrives before the timer callback',async()=>{
 let now=0,n=0;const clock={monotonicNow:()=>now,wallNow:()=>now,setTimer:()=>++n,clearTimer(){}};
 const f=setup({clock,respond:(path,init)=>{
  now=9000;
  return Response.json(path.endsWith('connector-tickets')?{ticket:'signed-ticket'}:{authority:init.method==='GET'?{...authority,generation:3}:authority});
 }});
 const pending=f.runtime.connect(inputs);await tick();const socket=f.sockets[0];assert.ok(socket);
 now=10001;socket.readyState=1;socket.dispatchEvent(new Event('open'));
 const message=data=>socket.dispatchEvent(new MessageEvent('message',{data:typeof data==='object'&&!(data instanceof ArrayBuffer)?JSON.stringify(data):data}));
 message({type:'ready',version:1,forwarding:false,lease:{leaseId:'lease-1',revision:1,expiresAtMs:60000,renewAfterMs:30000}});
 message({type:'egress-ready',version:1,protocol:'wisp-v1-drain-v1',forwarding:true});
 const frame=new Uint8Array([3,0,0,0,0,16,0,0,0]);message(frame.buffer);
 await assert.rejects(pending,/NETWORK_CANCELLED/);assert.equal(socket.readyState,3);assert.equal(f.runtime.state.status,'offline');
});
for(const step of ['reserve','ticket'])test(`cancelled ${step} response cannot issue the next request or open a socket`,async()=>{
 let release;const f=setup({respond:(path,init)=>{
  if((step==='reserve'&&init.method==='POST')||(step==='ticket'&&path.endsWith('connector-tickets')))return new Promise(r=>{release=r;});
  return Response.json({authority:init.method==='GET'?{...authority,generation:3}:authority});
 }});
 const pending=f.runtime.connect(inputs);const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);await tick();assert.ok(release);
 f.runtime.beforeRestore();await rejected;const count=f.requests.length;release(Response.json(step==='ticket'?{ticket:'late-secret'}:{authority}));await tick();assert.equal(f.requests.length,count);assert.equal(f.sockets.length,0);
});
test('uncertain committed reservation is not automatically replayed',async()=>{
 let reserved=false;const f=setup({respond:(path,init)=>{
  if(init.method==='GET')return Response.json({authority:{...authority,generation:reserved?4:3}});
  if(!reserved){reserved=true;throw Error('transport lost response with secret-ticket');}
  throw Error('should not retry a write in this attempt');
 }});
 await assert.rejects(f.runtime.connect(inputs),e=>e.message==='NETWORK_CONNECTION_FAILED');
 await tick();assert.equal(f.requests.length,2);assert.equal(f.sockets.length,0);assert.equal(f.runtime.state.status,'offline');
});
test('backend-valid dotted policy version remains usable',async()=>{
 const f=setup({respond:(path,init)=>Response.json(path.endsWith('connector-tickets')?{ticket:'signed-ticket'}:{authority:{...authority,policyVersion:'policy.v1:2026',generation:init.method==='GET'?3:4}})});
 const pending=f.runtime.connect(inputs);const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);await tick();assert.equal(f.sockets.length,1);f.runtime.dispose();await rejected;
});
test('first connection reserves generation one from an empty server head',async()=>{
 const f=setup({respond:(path,init)=>Response.json(path.endsWith('connector-tickets')?{ticket:'signed-ticket'}:{authority:init.method==='GET'?null:{...authority,generation:1}})});
 const pending=f.runtime.connect(inputs);const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);await tick();
 assert.equal(JSON.parse(f.requests[1].body).expectedGeneration,0);assert.equal(JSON.parse(f.requests[2].body).generation,1);assert.equal(f.sockets.length,1);
 f.runtime.dispose();await rejected;
});
test('malformed ticket cannot create a socket after a successful reservation',async()=>{
 const f=setup({respond:(path,init)=>Response.json(path.endsWith('connector-tickets')?{ticket:''}:{authority:init.method==='GET'?{...authority,generation:3}:authority})});
 await assert.rejects(f.runtime.connect(inputs),/NETWORK_CANCELLED|NETWORK_CONNECTION_FAILED/);assert.equal(f.requests.length,3);assert.equal(f.sockets.length,0);
});
