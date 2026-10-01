import test from 'node:test';
import assert from 'node:assert/strict';
import {BroadcastChannel} from 'node:worker_threads';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
import {createAccountVmRuntime} from '../frontend/features/environments/account-vm-runtime.mjs';
const wait=async(fn)=>{for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,5));assert.ok(fn());};
function fixture(t){const name='authority-'+crypto.randomUUID(),channels=[];const createChannel=()=>{const c=new BroadcastChannel(name);channels.push(c);return c;};const owner=(memberId='alice',origin='https://example.com')=>createAccountNetworkOwner({origin,memberId,createChannel});t.after(()=>channels.forEach(c=>c.close()));return {owner,createChannel};}
test('explicit revoke stops same-account runtime; another member/origin remains live and no deletion fires',async t=>{
 const f=fixture(t),a=f.owner(),b=f.owner(),other=f.owner('bob'),foreign=f.owner('alice','https://other.example');let deleted=0,closed=0;b.onEnvironmentRemoved(()=>deleted++);
 const runtime=createAccountVmRuntime({owner:b,autoSaveMs:0,locks:{request:async(n,o,cb)=>cb({})},createSession:()=>({ready:Promise.resolve(),write:async()=>{},close:()=>closed++})});
 t.after(async()=>{[a,b,other,foreign].forEach(x=>x.dispose());await runtime.stop();});await runtime.start({id:'env',memberId:'alice',type:'personal'});a.revoke();await wait(()=>b.signal.aborted&&closed===1);assert.equal(deleted,0);assert.equal(other.signal.aborted,false);assert.equal(foreign.signal.aborted,false);
});
test('ordinary disposal is local, while explicit environment removal sends invalidation only',async t=>{
 const f=fixture(t),a=f.owner(),b=f.owner(),c=f.owner();t.after(()=>[a,b,c].forEach(x=>x.dispose()));let deletions=0;b.onEnvironmentRemoved(()=>deletions++);a.dispose();await new Promise(r=>setTimeout(r,25));assert.equal(b.signal.aborted,false);c.removeEnvironment('env');await wait(()=>b.signal.aborted);assert.equal(deletions,0);
});
test('malformed or foreign messages cannot authorize, delete or invalidate the owner',async t=>{
 const f=fixture(t),a=f.owner(),sender=f.createChannel();t.after(()=>a.dispose());for(const data of [null,{}, {v:1,kind:'invalidate',origin:'https://example.com',memberId:'bob'},{v:2,kind:'invalidate',origin:'https://example.com',memberId:'alice'},{v:1,kind:'delete',origin:'https://example.com',memberId:'alice'}])sender.postMessage(data);await new Promise(r=>setTimeout(r,25));assert.equal(a.signal.aborted,false);
});
test('native broadcast invalidation preserves the persisted checkpoint for a fresh account lifetime',async t=>{
 const {IDBFactory}=await import('fake-indexeddb');const {createCheckpointStore}=await import('../frontend/features/environments/storage/checkpoints.mjs');const {sealCheckpoint}=await import('../tools/browser-vm/probe-checkpoint.mjs');
 const f=fixture(t),a=f.owner(),b=f.owner(),indexedDB=new IDBFactory();const identity={engineVersion:'v1',imageVersion:'v1',memoryBytes:268435456,filesystem:'ram-root+in-memory-9p+readonly-iso'},env={id:'env',memberId:'alice',type:'personal'};
 const store=createCheckpointStore({owner:b,indexedDB,identity,estimate:async()=>({quota:2**31,usage:0})});t.after(()=>{a.dispose();b.dispose();store.close();});await store.save(env,await sealCheckpoint(new TextEncoder().encode('keep').buffer,identity),{expectedRevision:0});a.revoke();await wait(()=>b.signal.aborted);
 const next=f.owner(),reopened=createCheckpointStore({owner:next,indexedDB,identity});t.after(()=>{next.dispose();reopened.close();});assert.equal((await reopened.load(env)).revision,1);
});
test('failed broadcast cannot prevent local revocation',t=>{
 const owner=createAccountNetworkOwner({origin:'https://example.com',memberId:'alice',createChannel:()=>({addEventListener(){},removeEventListener(){},postMessage(){throw Error('delivery failed');},close(){}})});t.after(()=>owner.dispose());owner.revoke();assert.equal(owner.signal.aborted,true);
});
