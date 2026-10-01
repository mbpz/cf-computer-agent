import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createAccountNetworkOwner } from '../frontend/features/environments/account-network-owner.mjs';
import { createAccountVmRuntime } from '../frontend/features/environments/account-vm-runtime.mjs';
import { createCheckpointStore } from '../frontend/features/environments/storage/checkpoints.mjs';
import { sealCheckpoint } from '../tools/browser-vm/probe-checkpoint.mjs';
const identity={engineVersion:'v1',imageVersion:'v1',memoryBytes:268435456,filesystem:'ram-root+in-memory-9p+readonly-iso'};
const environment={id:'env',memberId:'alice',type:'personal'};
const record=()=>sealCheckpoint(new TextEncoder().encode('guest-private').buffer,identity);
function fixture(t,createSession,options={}){const owner=createAccountNetworkOwner({origin:'https://example.com',memberId:'alice'});const store=createCheckpointStore({owner,identity,indexedDB:options.indexedDB??new IDBFactory(),estimate:async()=>({quota:2**31,usage:0})});const runtime=createAccountVmRuntime({owner,checkpoints:store,createSession,autoSaveMs:0});t.after(async()=>{owner.dispose();await runtime.stop();store.close();});return{owner,store,runtime};}
const session=()=>({ready:Promise.resolve(),write:async()=>{},close:async()=>{},checkpoint:record});
test('explicit save, stop and restore use a fresh session and confirmed revision',async t=>{
 const calls=[];const a=fixture(t,options=>{calls.push(options);return session();});await a.runtime.start(environment);assert.equal(calls[0].checkpoint,undefined);
 const receipt=await a.runtime.save();assert.equal(receipt.revision,1);assert.equal(a.runtime.getSnapshot().savedAt,receipt.savedAt);await a.runtime.stop();await a.runtime.start(environment,{restore:true});
 assert.equal(calls.length,2);assert.equal(new TextDecoder().decode(calls[1].checkpoint.state),'guest-private');assert.equal(a.runtime.getSnapshot().status,'running');assert.equal((await a.runtime.save()).revision,2);
});
test('restore without a complete checkpoint does not boot or silently start fresh',async t=>{
 let boots=0;const a=fixture(t,()=>{boots++;return session();});await assert.rejects(a.runtime.start(environment,{restore:true}),/CHECKPOINT_NOT_FOUND/);await a.runtime.stop();assert.equal(boots,0);
});
test('temporary environment cannot save or restore',async t=>{
 const a=fixture(t,session);await a.runtime.start({...environment,type:'temporary'});await assert.rejects(a.runtime.save(),/PERSISTENCE_PERSONAL_ONLY/);await a.runtime.stop();await assert.rejects(a.runtime.start({...environment,type:'temporary'},{restore:true}),/PERSISTENCE_PERSONAL_ONLY/);
});
test('save serializes terminal/files and duplicate saves; owner exit rejects late checkpoint',async t=>{
 let resolve,captures=0;const a=fixture(t,()=>({...session(),checkpoint:()=>{captures++;return new Promise(r=>resolve=r);}}));await a.runtime.start(environment);const pending=a.runtime.save();const rejected=assert.rejects(pending,/VM_NOT_RUNNING/);
 while(!resolve)await new Promise(r=>setTimeout(r,1));assert.equal(a.runtime.getSnapshot().status,'saving');await assert.rejects(a.runtime.write('no'),/VM_NOT_RUNNING/);await assert.rejects(a.runtime.save(),/VM_NOT_RUNNING|VM_BUSY/);
 a.owner.dispose();await a.runtime.stop();await rejected;resolve(await record());await new Promise(r=>setTimeout(r,5));assert.equal(captures,1);assert.equal(a.runtime.getSnapshot().status,'closed');
});
test('snapshot failure leaves VM running and previous confirmed checkpoint untouched',async t=>{
 let fail=false;const a=fixture(t,()=>({...session(),checkpoint:()=>fail?Promise.reject(Error('internal private output')):record()}));await a.runtime.start(environment);await a.runtime.save();fail=true;
 await assert.rejects(a.runtime.save(),/CHECKPOINT_SAVE_FAILED/);assert.equal(a.runtime.getSnapshot().status,'running');assert.equal((await a.store.load(environment)).revision,1);assert.equal(a.runtime.getSnapshot().reason,'CHECKPOINT_SAVE_FAILED');
});
test('save-and-stop does not stop on failure, successful receipt precedes close',async t=>{
 let fail=true,closed=0;const a=fixture(t,()=>({...session(),checkpoint:()=>fail?Promise.reject(Error('bad')):record(),close:()=>{closed++;}}));await a.runtime.start(environment);await assert.rejects(a.runtime.saveAndStop(),/CHECKPOINT_SAVE_FAILED/);assert.equal(closed,0);fail=false;await a.runtime.saveAndStop();assert.equal(closed,1);assert.equal((await a.store.load(environment)).revision,1);
});
test('fresh boot cannot overwrite existing snapshot without explicit restore',async t=>{
 const a=fixture(t,session);await a.runtime.start(environment);await a.runtime.saveAndStop();await a.runtime.start(environment);
 await assert.rejects(a.runtime.save(),/CHECKPOINT_CONFLICT/);assert.equal((await a.store.load(environment)).revision,1);assert.equal(a.runtime.getSnapshot().status,'running');
});
test('restore cancellation releases the runtime lock without booting a late result',async t=>{
 let release,boots=0;const owner=createAccountNetworkOwner({origin:'https://example.com',memberId:'alice'});
 const runtime=createAccountVmRuntime({owner,checkpoints:{load:()=>new Promise(r=>release=r)},autoSaveMs:0,createSession:()=>{boots++;return session();}});
 t.after(async()=>{owner.dispose();await runtime.stop();});const pending=runtime.start(environment,{restore:true});const rejected=assert.rejects(pending,/STOPPED/);
 while(!release)await new Promise(r=>setTimeout(r,1));await runtime.stop();await rejected;release({headRevision:1,checkpoint:await record()});await new Promise(r=>setTimeout(r,5));assert.equal(boots,0);assert.equal(runtime.getSnapshot().status,'idle');
});
test('scheduled saves run only while a personal instance is live',async t=>{
 const owner=createAccountNetworkOwner({origin:'https://example.com',memberId:'alice'});let saves=0;
 const checkpoints={save:async()=>({revision:++saves,savedAt:new Date().toISOString(),bytes:13})};
 const runtime=createAccountVmRuntime({owner,checkpoints,autoSaveMs:10,createSession:session});t.after(async()=>{owner.dispose();await runtime.stop();});
 await runtime.start({...environment,type:'temporary'});await new Promise(r=>setTimeout(r,35));assert.equal(saves,0);await runtime.stop();
 await runtime.start(environment);const deadline=Date.now()+1000;while(!saves&&Date.now()<deadline)await new Promise(r=>setTimeout(r,5));assert.ok(saves>0);
 await runtime.stop();const stopped=saves;await new Promise(r=>setTimeout(r,35));assert.equal(saves,stopped);
});

test('explicit previous revision restores selected bytes while subsequent save CAS advances from newest head',async t=>{
 const calls=[];const a=fixture(t,options=>{calls.push(options);return session();});
 const item=text=>sealCheckpoint(new TextEncoder().encode(text).buffer,identity);
 await a.store.save(environment,await item('old'),{expectedRevision:0});await a.store.save(environment,await item('latest'),{expectedRevision:1});
 await a.runtime.start(environment,{restore:true,revision:1});
 assert.equal(new TextDecoder().decode(calls[0].checkpoint.state),'old');assert.equal(a.runtime.getSnapshot().restoredRevision,1);
 assert.equal((await a.runtime.save()).revision,3);await a.runtime.stop();
});
test('invalid or evicted recovery selection never falls back to latest or a fresh boot',async t=>{
 let boots=0;const a=fixture(t,()=>{boots++;return session();});
 for(const revision of [0,-1,1.5,'1',NaN,Number.MAX_SAFE_INTEGER]) await assert.rejects(a.runtime.start(environment,{restore:true,revision}),/INVALID_RESTORE/);
 await assert.rejects(a.runtime.start(environment,{revision:1}),/INVALID_RESTORE/);
 await a.store.save(environment,await record(),{expectedRevision:0});await a.store.save(environment,await record(),{expectedRevision:1});await a.store.save(environment,await record(),{expectedRevision:2});
 await assert.rejects(a.runtime.start(environment,{restore:true,revision:1}),/CHECKPOINT_NOT_FOUND|CHECKPOINT_RESTORE_FAILED/);await a.runtime.stop();assert.equal(boots,0);
});
