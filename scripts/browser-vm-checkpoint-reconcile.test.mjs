import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {IDBFactory, IDBObjectStore} from 'fake-indexeddb';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
import {createAccountVmRuntime} from '../frontend/features/environments/account-vm-runtime.mjs';
import {createCheckpointStore} from '../frontend/features/environments/storage/checkpoints.mjs';
import {sealCheckpoint} from '../tools/browser-vm/probe-checkpoint.mjs';
let reconcile;
before(async()=>{const {outputFiles}=await build({entryPoints:['frontend/features/environments/storage/reconcile-checkpoints.ts'],bundle:true,write:false,platform:'node',format:'esm'});({reconcileAccountCheckpoints:reconcile}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')));});
const identity={engineVersion:'v1',imageVersion:'v1',memoryBytes:268435456,filesystem:'ram-root+in-memory-9p+readonly-iso'};
const env={id:'env',memberId:'alice',type:'personal'};
const checkpoint=()=>sealCheckpoint(new TextEncoder().encode('private').buffer,identity);
const marker=(environmentId='env')=>({environmentId,version:2,deletedAt:'2026-10-01T00:00:00.000Z'});
const page=(items=[],page=1,total=items.length)=>Response.json({items,pagination:{page,pageSize:100,total,totalPages:Math.ceil(total/100)}});
function fixture(t,{indexedDB=new IDBFactory(),memberId='alice'}={}){const owner=createAccountNetworkOwner({origin:'https://example.com',memberId});const checkpoints=createCheckpointStore({owner,identity,indexedDB,estimate:async()=>({quota:2**31,usage:0})});const runtime=createAccountVmRuntime({owner,checkpoints,autoSaveMs:0,createSession:()=>({ready:Promise.resolve(),write:async()=>{},close:async()=>{}})});t.after(async()=>{owner.dispose();await runtime.stop();checkpoints.close();});return {owner,checkpoints,runtime,indexedDB};}
test('authenticated tombstone reconciliation stops the affected VM and commits account-scoped cleanup before receipt',async t=>{
 const a=fixture(t),b=fixture(t,{indexedDB:a.indexedDB,memberId:'bob'});await a.checkpoints.save(env,await checkpoint(),{expectedRevision:0});await b.checkpoints.save({...env,memberId:'bob'},await checkpoint(),{expectedRevision:0});await a.runtime.start(env);
 const requests=[];const requester=async(path,init)=>{requests.push({path,method:init.method,credentials:init.credentials,redirect:init.redirect,cache:init.cache});return page([marker()]);};
 assert.deepEqual(await reconcile({...a,requester}),{removed:1,pages:1,complete:true});assert.equal(a.runtime.getSnapshot().status,'idle');
 assert.deepEqual(requests,[{path:'/api/environments/tombstones?page=1&pageSize=100',method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store'}]);
 const reopened=fixture(t,{indexedDB:a.indexedDB});await assert.rejects(reopened.checkpoints.load(env),/ENVIRONMENT_REMOVED/);assert.equal((await b.checkpoints.load({...env,memberId:'bob'})).revision,1);
 assert.deepEqual(await reconcile({...a,requester}),{removed:1,pages:1,complete:true});
});
test('empty or invalid tombstone responses do not infer deletion from missing list entries',async t=>{
 const a=fixture(t);await a.checkpoints.save(env,await checkpoint(),{expectedRevision:0});await a.runtime.start(env);
 assert.equal((await reconcile({...a,requester:async()=>page()})).removed,0);
 await assert.rejects(reconcile({...a,requester:async()=>page([marker(),{...marker('bad'),version:0}])}),/INVALID_PAGE/);
 assert.equal((await a.checkpoints.load(env)).revision,1);assert.equal(a.runtime.getSnapshot().status,'running');
});
test('late response after owner disposal cannot delete a newly authenticated account copy',async t=>{
 const a=fixture(t);await a.checkpoints.save(env,await checkpoint(),{expectedRevision:0});let release;
 const pending=reconcile({...a,requester:()=>new Promise(r=>release=r)});const failure=assert.rejects(pending,/CANCELLED|ACCOUNT_CLOSED/);while(!release)await new Promise(r=>setTimeout(r,1));a.owner.dispose();await failure;release(page([marker()]));
 await new Promise(r=>setTimeout(r,5));const next=fixture(t,{indexedDB:a.indexedDB});assert.equal((await next.checkpoints.load(env)).revision,1);
});
test('authorization loss disposes owner without treating response as a deletion list',async t=>{
 const a=fixture(t);await a.checkpoints.save(env,await checkpoint(),{expectedRevision:0});await a.runtime.start(env);
 await assert.rejects(reconcile({...a,requester:async()=>Response.json({error:{code:'AUTH_REQUIRED',message:'denied',retryable:false}},{status:401})}));assert.equal(a.owner.signal.aborted,true);await a.runtime.stop();
 const next=fixture(t,{indexedDB:a.indexedDB});assert.equal((await next.checkpoints.load(env)).revision,1);
});
test('storage abort never returns complete; explicit retry replays tombstone and finishes cleanup',async t=>{
 const a=fixture(t);await a.checkpoints.save(env,await checkpoint(),{expectedRevision:0});const original=IDBObjectStore.prototype.put;t.after(()=>{IDBObjectStore.prototype.put=original;});
 IDBObjectStore.prototype.put=function(...args){const r=original.apply(this,args);if(this.name==='heads'&&args[0]?.deleted)queueMicrotask(()=>this.transaction.abort());return r;};
 await assert.rejects(reconcile({...a,requester:async()=>page([marker()])}),/CHECKPOINT_TRANSACTION_FAILED/);IDBObjectStore.prototype.put=original;
 const reopened=fixture(t,{indexedDB:a.indexedDB});assert.equal((await reopened.checkpoints.load(env)).revision,1);
 assert.equal((await reconcile({...a,requester:async()=>page([marker()])})).complete,true);await assert.rejects(reopened.checkpoints.load(env),/ENVIRONMENT_REMOVED/);
});
test('foreign store scope is rejected before requesting metadata or deleting anything',async t=>{
 const a=fixture(t),b=fixture(t,{indexedDB:a.indexedDB,memberId:'bob'});let requests=0;
 await assert.rejects(reconcile({...a,checkpoints:b.checkpoints,requester:async()=>{requests++;return page([marker()]);}}),/INVALID_CHECKPOINT_SCOPE/);assert.equal(requests,0);
});
test('hung metadata request is bounded and never infers successful cleanup',async t=>{
 const a=fixture(t);await a.checkpoints.save(env,await checkpoint(),{expectedRevision:0});let requestSignal;
 await assert.rejects(reconcile({...a,timeoutMs:10,requester:async(path,init)=>{requestSignal=init.signal;return new Promise(()=>{});}}),/CANCELLED/);assert.equal(requestSignal.aborted,true);assert.equal((await a.checkpoints.load(env)).revision,1);
});
