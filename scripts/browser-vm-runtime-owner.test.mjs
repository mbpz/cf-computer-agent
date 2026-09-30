import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
import {createAccountVmRuntime, VM_RUNTIME_LOCK} from '../frontend/features/environments/account-vm-runtime.mjs';
const environment={id:'env-a',memberId:'member-a',type:'personal'};
function fixture(t, factory, options={}) {
 const owner=createAccountNetworkOwner({origin:'https://workbench.example',memberId:'member-a'});
 const runtime=createAccountVmRuntime({owner,locks:navigator.locks,createSession:factory,...options});
 t.after(async()=>{owner.dispose();await runtime.stop();});return{owner,runtime};
}
function session({onOutput,onClosed}, ready=Promise.resolve()) {let closes=0,writes=[];return {ready,write:async text=>writes.push(text),close(){closes++;},get closes(){return closes;},writes,onOutput,onClosed};}
test('runtime only starts explicitly; unavailable Web Locks and foreign member fail closed',async t=>{
 let calls=0;const {runtime}=fixture(t,()=>{calls++;},{locks:null});
 assert.equal(runtime.getSnapshot().status,'idle');await assert.rejects(runtime.start(environment),/LOCKS_UNAVAILABLE/);assert.equal(calls,0);
 await assert.rejects(runtime.start({...environment,memberId:'other'}),/INVALID_ENVIRONMENT/);
});
test('real LockManager allows one VM even for another account; stop releases it after cleanup',async t=>{
 let a,b;const first=fixture(t,args=>(a=session(args)));const second=fixture(t,args=>(b=session(args)));
 await first.runtime.start(environment);assert.equal(first.runtime.getSnapshot().status,'running');
 await assert.rejects(second.runtime.start(environment),/VM_BUSY/);assert.equal(b,undefined);
 assert.equal((await navigator.locks.query()).held.filter(x=>x.name===VM_RUNTIME_LOCK).length,1);
 a.onOutput('private');await first.runtime.write('uname -r\n');assert.deepEqual(a.writes,['uname -r\n']);
 await first.runtime.stop();assert.equal(a.closes,1);assert.equal(first.runtime.getSnapshot().output,'');
 await second.runtime.start(environment);assert.equal(second.runtime.getSnapshot().status,'running');
});
test('deletion cancels boot immediately, rejects readiness, ignores late output and forbids old environment',async t=>{
 let resolve,s;const {owner,runtime}=fixture(t,args=>(s=session(args,new Promise(r=>resolve=r))));
 const boot=runtime.start(environment);const rejected=assert.rejects(boot,/ENVIRONMENT_REMOVED/);
 while(!s)await new Promise(r=>setTimeout(r,1));owner.removeEnvironment('env-a');await rejected;await runtime.stop();
 resolve();s.onOutput('late secret');assert.equal(s.closes,1);assert.equal(runtime.getSnapshot().output,'');
 await assert.rejects(runtime.start(environment),/ENVIRONMENT_REMOVED/);
});
test('account disposal during run clears private output and rejects old input',async t=>{
 let s;const {owner,runtime}=fixture(t,args=>(s=session(args)));await runtime.start(environment);s.onOutput('private');owner.dispose();
 assert.equal(runtime.getSnapshot().output,'');await runtime.stop();assert.equal(s.closes,1);assert.equal(runtime.getSnapshot().status,'closed');await assert.rejects(runtime.write('replay'),/VM_NOT_RUNNING/);
});
test('lock is held until asynchronous Worker termination completes',async t=>{
 let finish,s;const first=fixture(t,args=>{s=session(args);s.close=()=>new Promise(r=>finish=r);return s;});const second=fixture(t,args=>session(args));
 await first.runtime.start(environment);const stopping=first.runtime.stop();assert.equal(first.runtime.getSnapshot().status,'stopping');
 await assert.rejects(second.runtime.start(environment),/VM_BUSY/);finish();await stopping;await second.runtime.start(environment);
});
test('output is bounded and spontaneous worker failure closes runtime without command replay',async t=>{
 let s;const {runtime}=fixture(t,args=>(s=session(args)));await runtime.start(environment);s.onOutput('x'.repeat(70000));assert.equal(runtime.getSnapshot().output.length,65536);
 s.onClosed(Error('private worker error'));await runtime.stop();assert.equal(runtime.getSnapshot().output,'');assert.equal(s.writes.length,0);assert.equal(s.closes,1);
});
test('cancel from a booting subscriber never allocates a Worker',async t=>{
 let calls=0;const {runtime}=fixture(t,args=>{calls++;return session(args);});
 runtime.subscribe(()=>{if(runtime.getSnapshot().status==='booting')void runtime.stop();});
 await assert.rejects(runtime.start(environment),/STOPPED/);await runtime.stop();assert.equal(calls,0);
});
test('synchronous factory close callback still terminates its returned resource',async t=>{
 let s;const {runtime}=fixture(t,args=>{args.onClosed();return s=session(args);});
 await assert.rejects(runtime.start(environment),/WORKER_CLOSED/);await runtime.stop();assert.equal(s.closes,1);
});
test('cancel before lock delivery never allocates and late acquisition releases cleanly',async t=>{
 let deliver,calls=0;const {runtime}=fixture(t,args=>{calls++;return session(args);},{locks:{request:(_name,_options,fn)=>new Promise(resolve=>{deliver=()=>resolve(fn({name:VM_RUNTIME_LOCK}));})}});
 const started=runtime.start(environment);const rejected=assert.rejects(started,/STOPPED/);await Promise.resolve();const stopped=runtime.stop();await rejected;deliver();await stopped;assert.equal(calls,0);
});
test('boot timeout closes resource and releases lock without retry',async t=>{
 let s;const {runtime}=fixture(t,args=>(s=session(args,new Promise(()=>{}))),{bootTimeoutMs:5});
 await assert.rejects(runtime.start(environment),/BOOT_TIMEOUT/);await runtime.stop();assert.equal(s.closes,1);
});
test('failed termination keeps exclusive lock until explicit successful cleanup retry',async t=>{
 let fail=true,closes=0;const first=fixture(t,args=>({...session(args),close(){closes++;if(fail)throw Error('private');}}));const second=fixture(t,args=>session(args));
 await first.runtime.start(environment);await assert.rejects(first.runtime.stop(),/CLEANUP_FAILED/);assert.equal(first.runtime.getSnapshot().status,'failed');
 await assert.rejects(second.runtime.start(environment),/VM_BUSY/);fail=false;await first.runtime.stop();await second.runtime.start(environment);assert.equal(closes,2);
});


test('account invalidation rejects in-flight file reads before a noncooperative session returns',async t=>{
 let resolve,calls=0;const {owner,runtime}=fixture(t,args=>({...session(args),file(){calls++;return new Promise(r=>{resolve=r;});}}));
 await runtime.start(environment);const pending=runtime.file({op:'readText',path:'/private'});
 const rejected=assert.rejects(pending,/VM_NOT_RUNNING/);await Promise.resolve();owner.dispose();await runtime.stop();
 await Promise.race([rejected,new Promise((_,reject)=>setTimeout(()=>reject(Error('file result retained across account exit')),100))]);
 resolve({text:'private',version:'old'});await Promise.resolve();assert.equal(calls,1);
 await assert.rejects(runtime.file({op:'list',path:'/'}),/VM_NOT_RUNNING/);
});
