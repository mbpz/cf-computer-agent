import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { createAccountNetworkOwner } from '../frontend/features/environments/account-network-owner.mjs';
import { sealCheckpoint } from '../tools/browser-vm/probe-checkpoint.mjs';
import { createCheckpointStore, CHECKPOINT_DATABASE } from '../frontend/features/environments/storage/checkpoints.mjs';
const identity={engineVersion:'v1',imageVersion:'iso-sha256',memoryBytes:268435456,filesystem:'ram-root+in-memory-9p+readonly-iso'};
const env={id:'env',memberId:'alice',type:'personal'};
const encoded=text=>new TextEncoder().encode(text).buffer;
const record=text=>sealCheckpoint(encoded(text),identity);
const text=value=>new TextDecoder().decode(value.checkpoint.state);
function pair(t,{indexedDB=new IDBFactory(),memberId='alice',origin='https://workbench.example',estimate=async()=>({quota:2**31,usage:0})}={}){
 const owner=createAccountNetworkOwner({origin,memberId});const store=createCheckpointStore({owner,indexedDB,estimate,identity});t.after(()=>{store.close();owner.dispose();});return{owner,store,indexedDB};
}
test('persistent roundtrip after reopening; newest two revisions retained and bytes detached',async t=>{
 const a=pair(t);assert.equal(await a.store.load(env),null);let item=await record('one');const first=await a.store.save(env,item,{expectedRevision:0});assert.equal(first.revision,1);new Uint8Array(item.state).fill(0);
 await a.store.save(env,await record('two'),{expectedRevision:1});await a.store.save(env,await record('three'),{expectedRevision:2});a.store.close();
 const b=pair(t,{indexedDB:a.indexedDB});assert.equal(text(await b.store.load(env)),'three');assert.equal(text(await b.store.load(env,{revision:2})),'two');await assert.rejects(b.store.load(env,{revision:1}),/CHECKPOINT_NOT_FOUND/);
 let loaded=await b.store.load(env);new Uint8Array(loaded.checkpoint.state).fill(0);assert.equal(text(await b.store.load(env)),'three');
});
test('member/origin partition, foreign and temporary environments are refused',async t=>{
 const a=pair(t);await a.store.save(env,await record('private'),{expectedRevision:0});
 const b=pair(t,{indexedDB:a.indexedDB,memberId:'bob'});await assert.rejects(b.store.load(env),/INVALID_ENVIRONMENT/);assert.equal(await b.store.load({...env,memberId:'bob'}),null);
 const c=pair(t,{indexedDB:a.indexedDB,origin:'https://other.example'});assert.equal(await c.store.load(env),null);
 await assert.rejects(a.store.save({...env,type:'temporary'},await record('no'),{expectedRevision:0}),/PERSISTENCE_PERSONAL_ONLY/);
});
test('concurrent stale writers cannot replace the confirmed head',async t=>{
 const a=pair(t),b=pair(t,{indexedDB:a.indexedDB});const results=await Promise.allSettled([a.store.save(env,await record('a'),{expectedRevision:0}),b.store.save(env,await record('b'),{expectedRevision:0})]);
 assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.match(results.find(v=>v.status==='rejected').reason.message,/CHECKPOINT_CONFLICT/);assert.equal((await a.store.load(env)).revision,1);
});
test('corrupt/incompatible/oversize envelopes and quota failure preserve the previous checkpoint',async t=>{
 let enough=true;const a=pair(t,{estimate:async()=>({quota:enough?2**31:1,usage:0})});await a.store.save(env,await record('old'),{expectedRevision:0});
 const bad=await record('new');new Uint8Array(bad.state)[0]^=1;await assert.rejects(a.store.save(env,bad,{expectedRevision:1}),/digest/i);
 await assert.rejects(a.store.save(env,await sealCheckpoint(encoded('bad'),{...identity,imageVersion:'other'}),{expectedRevision:1}),/compatibility/i);
 await assert.rejects(a.store.save(env,{...await record('bad'),bytes:536870913},{expectedRevision:1}),/size/i);
 enough=false;await assert.rejects(a.store.save(env,await record('new'),{expectedRevision:1}),/CHECKPOINT_QUOTA/);assert.equal(text(await a.store.load(env)),'old');
});
test('deletion tombstone prevents late or future account-owner resurrection',async t=>{
 const a=pair(t),b=pair(t,{indexedDB:a.indexedDB});await a.store.save(env,await record('old'),{expectedRevision:0});await a.store.remove(env.id);
 await assert.rejects(b.store.save(env,await record('late'),{expectedRevision:1}),/ENVIRONMENT_REMOVED/);await assert.rejects(b.store.load(env),/ENVIRONMENT_REMOVED/);
 const c=pair(t,{indexedDB:a.indexedDB});await assert.rejects(c.store.save(env,await record('late'),{expectedRevision:0}),/ENVIRONMENT_REMOVED/);
});
test('owner removal invalidates actions and explicitly awaited cleanup survives a fresh owner',async t=>{
 const a=pair(t);await a.store.save(env,await record('old'),{expectedRevision:0});a.owner.removeEnvironment(env.id);await a.store.remove(env.id);await assert.rejects(a.store.load(env),/ENVIRONMENT_REMOVED/);
 const b=pair(t,{indexedDB:a.indexedDB});await assert.rejects(b.store.load(env),/ENVIRONMENT_REMOVED/);
});
test('abort while quota check waits cannot write; closed owner never opens another database',async t=>{
 let release;const a=pair(t,{estimate:()=>new Promise(r=>release=r)});const saving=a.store.save(env,await record('late'),{expectedRevision:0});while(!release)await new Promise(r=>setTimeout(r,1));a.owner.dispose();release({quota:2**31,usage:0});await assert.rejects(saving,/ACCOUNT_CLOSED|CHECKPOINT_CLOSED/);
 const b=pair(t,{indexedDB:a.indexedDB});assert.equal(await b.store.load(env),null);await assert.rejects(a.store.load(env),/ACCOUNT_CLOSED|CHECKPOINT_CLOSED/);
});
test('pre-aborted request does not acknowledge or replace previous data',async t=>{
 const a=pair(t);await a.store.save(env,await record('old'),{expectedRevision:0});const signal=new AbortController();signal.abort();await assert.rejects(a.store.save(env,await record('late'),{expectedRevision:1,signal:signal.signal}),/CHECKPOINT_CANCELLED/);assert.equal(text(await a.store.load(env)),'old');
});
test('abort after queuing state/head writes atomically retains the last committed version',async t=>{
 const a=pair(t);await a.store.save(env,await record('old'),{expectedRevision:0});const original=IDBObjectStore.prototype.put;
 t.after(()=>{IDBObjectStore.prototype.put=original;});let injected=false;
 IDBObjectStore.prototype.put=function(...args){const result=original.apply(this,args);if(this.name==='states'&&!injected){injected=true;queueMicrotask(()=>this.transaction.abort());}return result;};
 await assert.rejects(a.store.save(env,await record('partial'),{expectedRevision:1}),/CHECKPOINT_TRANSACTION_FAILED/);IDBObjectStore.prototype.put=original;
 assert.equal(injected,true);assert.equal(text(await a.store.load(env)),'old');assert.equal((await a.store.load(env)).revision,1);
});
test('corrupted persisted bytes are rejected on load, without silently restoring older state',async t=>{
 const a=pair(t);await a.store.save(env,await record('old'),{expectedRevision:0});await a.store.save(env,await record('new'),{expectedRevision:1});
 const db=await new Promise((resolve,reject)=>{const request=a.indexedDB.open(CHECKPOINT_DATABASE,1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 await new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite'),store=tx.objectStore('states'),key=['https://workbench.example','alice','env',2],request=store.get(key);request.onsuccess=()=>{const value=request.result;new Uint8Array(value.checkpoint.state)[0]^=1;store.put(value,key);};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 await assert.rejects(a.store.load(env),/digest/i);assert.equal(text(await a.store.load(env,{revision:1})),'old');
});

async function rawDatabase(factory, body) {
 const db=await new Promise((resolve,reject)=>{const r=factory.open(CHECKPOINT_DATABASE,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try {return await body(db);}finally{db.close();}
}
test('revision catalog exposes only bounded metadata, preserves account isolation and needs no restore',async t=>{
 const a=pair(t);assert.deepEqual(await a.store.list(env),[]);
 const first=await a.store.save(env,await record('old'),{expectedRevision:0});const second=await a.store.save(env,await record('newest'),{expectedRevision:1});
 assert.deepEqual(await a.store.list(env),[{revision:2,savedAt:second.savedAt,bytes:6},{revision:1,savedAt:first.savedAt,bytes:3}]);
 const b=pair(t,{indexedDB:a.indexedDB,memberId:'bob'});assert.deepEqual(await b.store.list({...env,memberId:'bob'}),[]);
 await assert.rejects(b.store.list(env),/INVALID_ENVIRONMENT/);await assert.rejects(a.store.list({...env,type:'temporary'}),/PERSISTENCE_PERSONAL_ONLY/);
 await a.store.remove(env.id);await assert.rejects(a.store.list(env),/ENVIRONMENT_REMOVED/);
});
test('purge removes orphan revisions despite a corrupt head, without erasing another account or environment',async t=>{
 const a=pair(t),b=pair(t,{indexedDB:a.indexedDB,memberId:'bob'});const other={...env,id:'other'};
 await a.store.save(env,await record('secret'),{expectedRevision:0});await a.store.save(other,await record('keep-other'),{expectedRevision:0});await b.store.save({...env,memberId:'bob'},await record('keep-bob'),{expectedRevision:0});
 await rawDatabase(a.indexedDB,db=>new Promise((resolve,reject)=>{const tx=db.transaction(['states','heads'],'readwrite');tx.objectStore('states').put({orphan:'private'},['https://workbench.example','alice','env',99]);tx.objectStore('heads').put({revision:99,revisions:[]},['https://workbench.example','alice','env']);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);}));
 assert.deepEqual(await a.store.remove(env.id),{removed:true});
 const keys=await rawDatabase(a.indexedDB,db=>new Promise((resolve,reject)=>{const r=db.transaction('states').objectStore('states').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));
 assert.deepEqual(keys,[['https://workbench.example','alice','other',1],['https://workbench.example','bob','env',1]]);
 assert.equal(text(await a.store.load(other)),'keep-other');assert.equal(text(await b.store.load({...env,memberId:'bob'})),'keep-bob');
});

// External storage faults are injected below the real transaction/save logic.
for (const boundary of ['synchronous-put', 'asynchronous-abort']) {
 test(`quota at ${boundary} preserves both committed generations and permits explicit retry`,async t=>{
  const a=pair(t);await a.store.save(env,await record('one'),{expectedRevision:0});await a.store.save(env,await record('two'),{expectedRevision:1});
  const candidate=await record('uncommitted'),original=IDBObjectStore.prototype.put;let injected=false;
  t.after(()=>{IDBObjectStore.prototype.put=original;});
  IDBObjectStore.prototype.put=function(...args){
   if(this.name!=='states'||injected)return original.apply(this,args);
   injected=true;
   if(boundary==='synchronous-put')throw new DOMException('Full','QuotaExceededError');
   const result=original.apply(this,args),tx=this.transaction;
   queueMicrotask(()=>{Object.defineProperty(tx,'error',{value:new DOMException('Full','QuotaExceededError')});tx.abort();});
   return result;
  };
  await assert.rejects(a.store.save(env,candidate,{expectedRevision:2}),/^Error: CHECKPOINT_QUOTA$/);
  IDBObjectStore.prototype.put=original;
  assert.equal(injected,true);assert.equal(text(await a.store.load(env)),'two');assert.equal(text(await a.store.load(env,{revision:1})),'one');
  const retry=await a.store.save(env,await record('three'),{expectedRevision:2});assert.equal(retry.revision,3);assert.equal(text(await a.store.load(env)),'three');
 });
}
for(const boundary of ['cancel','revoke','store-close']) {
 test(`${boundary} after state/head/eviction queueing cannot publish a new head or evict retained state`,async t=>{
  const a=pair(t);await a.store.save(env,await record('one'),{expectedRevision:0});await a.store.save(env,await record('two'),{expectedRevision:1});
  const candidate=await record('partial'),controller=new AbortController(),original=IDBObjectStore.prototype.put;let injected=false;
  t.after(()=>{IDBObjectStore.prototype.put=original;});
  IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);
   if(this.name==='states'&&!injected){injected=true;queueMicrotask(()=>{
    if(boundary==='cancel')controller.abort();else if(boundary==='revoke')a.owner.revoke();else a.store.close();
   });}return request;
  };
  await assert.rejects(a.store.save(env,candidate,{expectedRevision:2,signal:controller.signal}),/CHECKPOINT_CANCELLED|CHECKPOINT_TRANSACTION_FAILED|ACCOUNT_CLOSED|CHECKPOINT_CLOSED/);
  IDBObjectStore.prototype.put=original;assert.equal(injected,true);a.store.close();
  const b=pair(t,{indexedDB:a.indexedDB});assert.equal(text(await b.store.load(env)),'two');assert.equal((await b.store.load(env)).revision,2);assert.equal(text(await b.store.load(env,{revision:1})),'one');
 });
}
