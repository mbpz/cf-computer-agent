import { restoreCheckpoint } from '../../../../tools/browser-vm/probe-checkpoint.mjs';

export const CHECKPOINT_DATABASE = 'memory-garden-vm-checkpoints-v1';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const revision = value => Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;

/** Local, unencrypted storage. Account partitioning is not protection against
 * same-origin code or device access. Two complete generations, no cloud backup.
 * Only the fixed RAM-root/in-memory-9p/read-only-ISO profile is supported. */
export function createCheckpointStore({owner,identity,indexedDB=globalThis.indexedDB,
  estimate=()=>globalThis.navigator?.storage?.estimate(),openTimeoutMs=5000}) {
  if(!owner?.signal||!owner.scope||identity?.filesystem!=='ram-root+in-memory-9p+readonly-iso' || !Number.isSafeInteger(openTimeoutMs)||openTimeoutMs<=0) throw Error('INVALID_CHECKPOINT_STORE');
  const compatibility=Object.freeze({...identity});
  let closed=false, database, opening;
  const transactions=new Map(), removals=new Map();
  const key=environmentId=>[owner.scope.origin,owner.scope.memberId,environmentId];
  function current(signal){if(owner.signal.aborted)throw Error('ACCOUNT_CLOSED');if(closed)throw Error('CHECKPOINT_CLOSED');if(signal?.aborted)throw Error('CHECKPOINT_CANCELLED');}
  function check(environment,signal){
    current(signal);
    if(!environment||environment.memberId!==owner.scope.memberId||!id(environment.id))throw Error('INVALID_ENVIRONMENT');
    owner.assertEnvironment(environment.id);
    if(environment.type!=='personal')throw Error('PERSISTENCE_PERSONAL_ONLY');
  }
  function open(){
    current();if(database)return Promise.resolve(database);if(opening)return opening;
    if(!indexedDB?.open)return Promise.reject(Error('CHECKPOINT_STORAGE_UNAVAILABLE'));
    opening=new Promise((resolve,reject)=>{
      let settled=false;
      const request=indexedDB.open(CHECKPOINT_DATABASE,1);
      const timer=setTimeout(()=>finish(Error('CHECKPOINT_STORAGE_BLOCKED')),openTimeoutMs);
      function finish(error,db){if(settled){db?.close();return;}settled=true;clearTimeout(timer);if(error)reject(error);else resolve(db);}
      request.onupgradeneeded=()=>{request.result.createObjectStore('heads');request.result.createObjectStore('states');};
      request.onerror=()=>finish(Error('CHECKPOINT_STORAGE_UNAVAILABLE'));
      request.onblocked=()=>finish(Error('CHECKPOINT_STORAGE_BLOCKED'));
      request.onsuccess=()=>{
        const db=request.result;if(settled||closed||owner.signal.aborted){db.close();finish(Error('CHECKPOINT_CLOSED'));return;}
        database=db;db.onversionchange=()=>close();finish(null,db);
      };
    }).finally(()=>{opening=undefined;});
    return opening;
  }
  async function transact(environmentId,mode,signal,body,allowRemoved=false){
    current(signal);if(!allowRemoved)owner.assertEnvironment(environmentId);
    const db=await open();current(signal);if(!allowRemoved)owner.assertEnvironment(environmentId);
    return new Promise((resolve,reject)=>{
      let value,error;
      const tx=db.transaction(['heads','states'],mode,mode==='readwrite'?{durability:'strict'}:undefined);
      const abort=()=>{error=Error('CHECKPOINT_CANCELLED');try{tx.abort();}catch{}};
      transactions.set(tx,environmentId);signal?.addEventListener('abort',abort,{once:true});
      const finish=()=>{transactions.delete(tx);signal?.removeEventListener('abort',abort);};
      tx.onabort=()=>{finish();reject(error??Error(tx.error?.name==='QuotaExceededError'?'CHECKPOINT_QUOTA':'CHECKPOINT_TRANSACTION_FAILED'));};
      tx.onerror=()=>{};
      tx.oncomplete=()=>{finish();try{current(signal);if(!allowRemoved)owner.assertEnvironment(environmentId);resolve(value);}catch(e){reject(e);}};
      const fail=e=>{error=e;try{tx.abort();}catch{}};
      const head=tx.objectStore('heads').get(key(environmentId));
      head.onsuccess=()=>{try{body({tx,head:head.result,set:valueIn=>{value=valueIn;},fail});}catch(e){fail(e);}};
    });
  }
  async function verified(record){
    // Capture metadata before hashing; the checkpoint validator owns the bytes.
    const metadata={schemaVersion:record?.schemaVersion,identity:{...record?.identity},bytes:record?.bytes,sha256:record?.sha256};
    let state;await restoreCheckpoint({restore_state:async value=>{state=value;}},record,compatibility);
    return {...metadata,state};
  }
  function headCheck(head){
    if(head?.deleted)throw Error('ENVIRONMENT_REMOVED');
    if(head&&(!revision(head.revision)||head.revision<1||!Array.isArray(head.revisions)||head.revisions.length<1||head.revisions.length>2||head.revisions.some((v,i)=>v!==head.revision-i)))throw Error('CHECKPOINT_CORRUPT');
  }
  async function save(environment,record,{expectedRevision,signal}={}){
    check(environment,signal);if(!revision(expectedRevision))throw Error('CHECKPOINT_REVISION_REQUIRED');
    const checkpoint=await verified(record);check(environment,signal);
    const usage=await estimate();check(environment,signal);
    if(!usage||!Number.isFinite(usage.quota)||!Number.isFinite(usage.usage)||usage.quota<0||usage.usage<0||usage.quota-usage.usage<checkpoint.bytes+1048576)throw Error('CHECKPOINT_QUOTA');
    const savedAt=new Date().toISOString();
    return transact(environment.id,'readwrite',signal,({tx,head,set})=>{
      headCheck(head);if((head?.revision??0)!==expectedRevision)throw Error('CHECKPOINT_CONFLICT');
      const next=expectedRevision+1, revisions=[next,...(head?.revisions??[])].slice(0,2);
      tx.objectStore('states').put({revision:next,savedAt,checkpoint},[...key(environment.id),next]);
      tx.objectStore('heads').put({revision:next,revisions,deleted:false},key(environment.id));
      for(const old of head?.revisions??[])if(!revisions.includes(old))tx.objectStore('states').delete([...key(environment.id),old]);
      set({revision:next,savedAt,bytes:checkpoint.bytes});
    });
  }
  async function load(environment,{revision:requested,signal}={}){
    check(environment,signal);if(requested!==undefined&&(!revision(requested)||requested<1))throw Error('CHECKPOINT_NOT_FOUND');
    const result=await transact(environment.id,'readonly',signal,({tx,head,set,fail})=>{
      headCheck(head);if(!head){if(requested!==undefined)throw Error('CHECKPOINT_NOT_FOUND');set(null);return;}
      const wanted=requested??head.revision;if(!head.revisions.includes(wanted))throw Error('CHECKPOINT_NOT_FOUND');
      const read=tx.objectStore('states').get([...key(environment.id),wanted]);
      read.onsuccess=()=>{const value=read.result;if(!value||value.revision!==wanted||typeof value.savedAt!=='string'||!Number.isFinite(Date.parse(value.savedAt)))fail(Error('CHECKPOINT_CORRUPT'));else set({...value,headRevision:head.revision});};
    });
    if(!result)return null;
    const checkpoint=await verified(result.checkpoint);check(environment,signal);return {...result,checkpoint};
  }
  function remove(environmentId){
    try{current();if(!id(environmentId))throw Error('INVALID_ENVIRONMENT');}catch(error){return Promise.reject(error);}
    if(removals.has(environmentId))return removals.get(environmentId);
    for(const [tx,target] of transactions)if(target===environmentId){try{tx.abort();}catch{}}
    const pending=transact(environmentId,'readwrite',undefined,({tx,head,set})=>{
      for(const old of head?.revisions??[])tx.objectStore('states').delete([...key(environmentId),old]);
      tx.objectStore('heads').put({deleted:true},key(environmentId));set({removed:true});
    },true).finally(()=>removals.delete(environmentId));removals.set(environmentId,pending);return pending;
  }
  function close(){if(closed)return;closed=true;unsubscribe();owner.signal.removeEventListener('abort',close);for(const tx of transactions.keys()){try{tx.abort();}catch{}}database?.close();database=undefined;}
  const unsubscribe=owner.onEnvironmentRemoved(environmentId=>{void remove(environmentId).catch(()=>{});});
  owner.signal.addEventListener('abort',close,{once:true});
  return Object.freeze({save,load,remove,close});
}
