import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectorDns } from '../tools/browser-vm/connector/dns.mjs';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const request=(requestId=1,hostname='github.com')=>({type:'resolve-destination',version:1,requestId,hostname});
function fixture(options={}){
  let active=true,time=0,next=0,calls=0,closed=0;const resources=new Set(),timers=new Map(),answers=[],pending=[];
  const authority={isActive:()=>active,track(fn){if(!active||resources.size>=8)throw new Error('Resource denied');resources.add(fn);return()=>resources.delete(fn);},close(){if(!active)return;active=false;closed++;for(const fn of[...resources])fn();resources.clear();}};
  const clock={monotonicNow:()=>time,setTimer(fn,ms){const id=++next;timers.set(id,{fn,at:time+ms});return id;},clearTimer(id){timers.delete(id);}};
  const dns=createConnectorDns({authority,clock,resolveDestination:(target,signal)=>{calls++;return new Promise((resolve,reject)=>pending.push({target,signal,resolve,reject}));},onAnswer:value=>answers.push(value),...options});
  return{dns,authority,resources,timers,answers,pending,get calls(){return calls;},get closed(){return closed;},advance(ms,run=true){time+=ms;if(run)for(const[id,t]of[...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
test('authorized DNS holds a tracked resource and returns only a bounded policy-validated IPv4 answer',async()=>{
 const f=fixture();f.dns.request(request());assert.equal(f.calls,1);assert.equal(f.resources.size,1);
 assert.deepEqual(f.pending[0].target,{hostname:'github.com',port:443});
 f.pending[0].resolve({hostname:'github.com',port:443,address:'140.82.112.3',family:4});await flush();
 assert.deepEqual(f.answers,[{type:'destination-resolved',version:1,requestId:1,hostname:'github.com',address:'140.82.112.3'}]);assert.equal(f.resources.size,0);assert.equal(f.timers.size,0);assert.equal(f.pending[0].signal.aborted,true);
});
test('unknown domain, probe IP, extra field, wrong version and reused ID revoke synchronously before more DNS',async()=>{
 for(const frame of [request(1,'evil.test'),request(1,'203.0.113.11'),request(1,'Github.com'),{...request(),extra:1},{...request(),version:2},request(0)]){
  const f=fixture();f.dns.request(frame);f.dns.request(request(2));assert.equal(f.calls,0);assert.equal(f.closed,1);
 }
 const f=fixture();f.dns.request(request());f.dns.request(request());f.dns.request(request(2));assert.equal(f.calls,1);assert.equal(f.pending[0].signal.aborted,true);assert.equal(f.closed,1);
});
test('three in-flight DNS requests and the shared eight-resource authority limit are hard caps',()=>{
 const f=fixture();for(let i=1;i<=3;i++)f.dns.request(request(i));assert.equal(f.calls,3);assert.equal(f.resources.size,3);f.dns.request(request(4));assert.equal(f.calls,3);assert.equal(f.closed,1);assert.ok(f.pending.every(p=>p.signal.aborted));
 const g=fixture();for(let i=0;i<8;i++)g.authority.track(()=>{});g.dns.request(request());assert.equal(g.calls,0);assert.equal(g.closed,1);
});
test('lease revocation, explicit close and DNS timeout abort active work and suppress late answers',async()=>{
 for(const mode of ['lease','close','timeout','delayed-timer']){
  const f=fixture();f.dns.request(request());if(mode==='lease')f.authority.close();if(mode==='close')f.dns.close();if(mode==='timeout')f.advance(5000);if(mode==='delayed-timer')f.advance(5000,false);
  f.pending[0].resolve({hostname:'github.com',port:443,address:'140.82.112.3',family:4});await flush();assert.deepEqual(f.answers,[]);assert.equal(f.pending[0].signal.aborted,true);assert.equal(f.resources.size,0);
 }
});
test('resolver errors, nonpublic addresses, IPv6-only and callback failures fail closed without an answer',async()=>{
 for(const result of [new Error('private DNS text'),{hostname:'github.com',port:443,address:'127.0.0.1',family:4},{hostname:'github.com',port:443,address:'2606:4700::1',family:6},{hostname:'evil.test',port:443,address:'140.82.112.3',family:4}]){
  const f=fixture();f.dns.request(request());if(result instanceof Error)f.pending[0].reject(result);else f.pending[0].resolve(result);await flush();assert.deepEqual(f.answers,[]);assert.equal(f.closed,1);
 }
 const f=fixture({onAnswer:()=>{throw new Error('broken receiver');}});f.dns.request(request());f.pending[0].resolve({hostname:'github.com',port:443,address:'140.82.112.3',family:4});await flush();assert.equal(f.closed,1);
});

test('each DNS reservation counts against TCP resources, and completion frees exactly its own slot',async()=>{
 const f=fixture();for(let i=0;i<6;i++)f.authority.track(()=>{});
 f.dns.request(request(1));f.dns.request(request(2));assert.equal(f.resources.size,8);
 f.pending[0].resolve({hostname:'github.com',port:443,address:'140.82.112.3',family:4});await flush();assert.equal(f.resources.size,7);
 f.dns.request(request(3));assert.equal(f.calls,3);assert.equal(f.resources.size,8);
 f.dns.request(request(4));assert.equal(f.calls,3);assert.equal(f.closed,1);assert.equal(f.resources.size,0);
});
