import { test as nodeTest } from 'node:test';
const test = (name, run) => nodeTest(name, {timeout:2000}, run);
import assert from 'node:assert/strict';
import { createVmNetworkLifecycle } from '../frontend/features/environments/network-lifecycle.mjs';

function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function setup() {
 const events = new EventTarget(), states = [], sessions = [];
 const lifecycle = createVmNetworkLifecycle({events, onState: state => states.push(state)});
 const connect = (generation=1) => lifecycle.connect({runtimeId:'runtime-1',generation,open({signal,onClose}) {
  const ready=deferred(); const session={signal,onClose,ready,closed:0}; sessions.push(session);
  return {ready:ready.promise,close(){session.closed++;}};
 }});
 return {events,states,sessions,lifecycle,connect};
}

test('explicit connection only; disconnect aborts pending authorization and releases it exactly once', async () => {
 const f=setup(); assert.equal(f.lifecycle.state.status,'offline'); assert.equal(f.sessions.length,0);
 const pending=f.connect(); const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);
 assert.equal(f.lifecycle.state.status,'connecting'); f.lifecycle.disconnect(); await rejected;
 assert.equal(f.sessions[0].signal.aborted,true); assert.equal(f.sessions[0].closed,1);
 f.sessions[0].ready.resolve(); await Promise.resolve(); f.lifecycle.disconnect();
 assert.equal(f.sessions[0].closed,1); assert.equal(f.lifecycle.state.status,'offline');
});

for (const event of ['offline','pagehide']) test(`${event} releases active transport and never reconnects on online`, async () => {
 const f=setup();const pending=f.connect();f.sessions[0].ready.resolve();await pending;
 f.events.dispatchEvent(new Event(event));
 assert.equal(f.sessions[0].closed,1);assert.equal(f.sessions[0].signal.aborted,true);
 assert.equal(f.lifecycle.state.status,event==='pagehide'?'closed':'offline');
 f.events.dispatchEvent(new Event('online'));await Promise.resolve();assert.equal(f.sessions.length,1);
 if(event==='pagehide')await assert.rejects(f.connect(2),/NETWORK_CLOSED/);
});

test('connector exit leaves offline; old close callback cannot disconnect a newer generation', async () => {
 const f=setup();let pending=f.connect();f.sessions[0].ready.resolve();await pending;
 f.sessions[0].onClose();assert.equal(f.lifecycle.state.reason,'connector-closed');
 pending=f.connect(2);f.sessions[1].ready.resolve();await pending;
 f.sessions[0].onClose();assert.equal(f.lifecycle.state.status,'connected');assert.equal(f.sessions[1].closed,0);
 f.lifecycle.dispose();
});

test('snapshot boundary cancels pending work and requires strictly newer explicit generation', async () => {
 const f=setup();const pending=f.connect();const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);
 f.lifecycle.beforeRestore();await rejected;
 assert.equal(f.lifecycle.state.reason,'snapshot-restore');assert.equal(f.sessions[0].closed,1);
 await assert.rejects(f.connect(),/STALE_GENERATION/);assert.equal(f.sessions.length,1);
 const fresh=f.connect(2);f.sessions[0].ready.resolve();await Promise.resolve();assert.equal(f.lifecycle.state.status,'connecting');
 f.sessions[1].ready.resolve();await fresh;assert.equal(f.lifecycle.state.status,'connected');f.lifecycle.dispose();
});

test('busy connect neither opens another transport nor consumes the next generation', async () => {
 const f=setup();const pending=f.connect();await assert.rejects(f.connect(2),/NETWORK_BUSY/);
 assert.equal(f.sessions.length,1);f.sessions[0].ready.resolve();await pending;f.lifecycle.disconnect();
 const next=f.connect(2);f.sessions[1].ready.resolve();await next;f.lifecycle.dispose();
});

test('readiness failure is terminal for that generation and never retried', async () => {
 const f=setup();const pending=f.connect();f.sessions[0].ready.reject(new Error('sensitive upstream details'));
 await assert.rejects(pending,/NETWORK_CANCELLED/);assert.equal(f.lifecycle.state.reason,'connection-failed');
 assert.equal(f.sessions[0].closed,1);await assert.rejects(f.connect(),/STALE_GENERATION/);
 assert.equal(JSON.stringify(f.states).includes('sensitive'),false);f.lifecycle.dispose();
});

test('timeout aborts unresolved authorization and does not wait for ready to reject', async () => {
 let timer,cleared=0,signal,closed=0;
 const life=createVmNetworkLifecycle({clock:{monotonicNow:()=>0,setTimer(fn,ms){assert.equal(ms,10000);timer=fn;return 1;},clearTimer(){cleared++;}}});
 const pending=life.connect({runtimeId:'r',generation:1,open(options){signal=options.signal;return{ready:new Promise(()=>{}),close(){closed++;}};}});
 const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);timer();await rejected;
 assert.equal(signal.aborted,true);assert.equal(closed,1);assert.equal(life.state.reason,'connection-timeout');assert.equal(cleared,1);
 life.dispose();
});

test('synchronous close from open releases the returned resource, without resurrection', async () => {
 let closed=0;const life=createVmNetworkLifecycle();
 await assert.rejects(life.connect({runtimeId:'r',generation:1,open({onClose}){onClose();return{ready:Promise.resolve(),close(){closed++;}};}}),/NETWORK_CANCELLED/);
 assert.equal(closed,1);assert.equal(life.state.status,'offline');life.dispose();
});

test('state callback cancellation before open cannot allocate a transport', async () => {
 let opened=0,life;
 life=createVmNetworkLifecycle({onState(s){if(s.status==='connecting')life.disconnect();}});
 await assert.rejects(life.connect({runtimeId:'r',generation:1,open(){opened++;return{ready:Promise.resolve(),close(){}};}}),/NETWORK_CANCELLED/);
 assert.equal(opened,0);life.dispose();
});

test('dispose removes lifecycle listeners and is irreversible, including late events', async () => {
 const f=setup();f.lifecycle.dispose();const state=f.lifecycle.state;
 f.events.dispatchEvent(new Event('offline'));f.events.dispatchEvent(new Event('pagehide'));
 assert.equal(f.lifecycle.state,state);await assert.rejects(f.connect(),/NETWORK_CLOSED/);assert.equal(f.sessions.length,0);
 assert.ok(Object.isFrozen(state));
});

test('invalid binding or an old generation with a different runtime never invokes open', async () => {
 const f=setup();for(const generation of [0,-1,1.5,NaN,'1',Number.MAX_SAFE_INTEGER+1])await assert.rejects(f.connect(generation),/INVALID_BINDING/);
 const p=f.connect();f.sessions[0].ready.resolve();await p;f.lifecycle.disconnect();
 let opened=0;await assert.rejects(f.lifecycle.connect({runtimeId:'another',generation:1,open(){opened++;}}),/STALE_GENERATION/);
 assert.equal(opened,0);f.lifecycle.dispose();
});

test('cleanup exceptions fail closed instead of allowing a second potentially live transport', async () => {
 const life=createVmNetworkLifecycle();await life.connect({runtimeId:'r',generation:1,open(){return{ready:Promise.resolve(),close(){throw Error('cleanup broke');}};}});
 life.disconnect();assert.equal(life.state.status,'closed');assert.equal(life.state.reason,'cleanup-failed');
 await assert.rejects(life.connect({runtimeId:'r',generation:2,open(){throw Error('must not open');}}),/NETWORK_CLOSED/);
});

// The authority allocates a NEW runtimeId on each environment generation.
test('new server runtime ID is accepted only with a newer environment generation',async()=>{
 const f=setup();const first=f.connect();f.sessions[0].ready.resolve();await first;f.lifecycle.beforeRestore();
 await f.lifecycle.connect({runtimeId:'new-server-runtime',generation:2,open(){return{ready:Promise.resolve(),close(){}};}});
 assert.equal(f.lifecycle.state.status,'connected');f.lifecycle.dispose();
});

test('abort handlers cannot allocate a new session in the middle of teardown',async()=>{
 const life=createVmNetworkLifecycle();let reopened=0,reentrant;
 await life.connect({runtimeId:'r',generation:1,open({signal}){
  signal.addEventListener('abort',()=>{reentrant=life.connect({runtimeId:'new',generation:2,open(){reopened++;return{ready:Promise.resolve(),close(){}};}});});
  return{ready:Promise.resolve(),close(){}};
 }});
 life.disconnect();await assert.rejects(reentrant,/NETWORK_BUSY/);assert.equal(reopened,0);assert.equal(life.state.status,'offline');life.dispose();
});

test('delayed timer dispatch cannot accept readiness past its monotonic deadline',async()=>{
 let now=0;const ready=deferred();let closed=0;
 const life=createVmNetworkLifecycle({clock:{monotonicNow:()=>now,setTimer(){return 1;},clearTimer(){}}});
 const pending=life.connect({runtimeId:'r',generation:1,open(){return{ready:ready.promise,close(){closed++;}};}});
 const rejected=assert.rejects(pending,/NETWORK_CANCELLED/);now=10000;ready.resolve();await rejected;
 assert.equal(life.state.reason,'connection-timeout');assert.equal(closed,1);life.dispose();
});
