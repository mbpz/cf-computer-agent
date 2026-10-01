// Local acceptance harness only. Explicit actions, no implicit recovery retry.
import { createChunkedImageReader } from './chunked-image.mjs';
const PREFIX='memory-garden-public-images-v1-';
const UNRELATED='image-acceptance-unrelated';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export async function runImageAcceptance({action,artifacts,origin,cacheStorage,fetchImpl=fetch,boot}) {
  check(['interrupt','resume','corrupt','retry','upgrade','warm'].includes(action),'Unknown acceptance action');
  check(cacheStorage && typeof cacheStorage.keys==='function','Native CacheStorage unavailable');
  const reader=async set=>{
    const read=await createChunkedImageReader({artifacts:set,origin,cacheStorage,fetchImpl});
    check(read.cacheStatus==='persistent','CacheStorage is unavailable; not accepted');return read;
  };
  const inspect=async()=>{const r=await fetchImpl(origin+'/inspect',{cache:'no-store'});check(r.ok,'Inspection unavailable');return r.json();};
  const cacheKeys=async()=>{
    const names=(await cacheStorage.keys()).filter(n=>n.startsWith(PREFIX));
    check(names.length===1,'Expected one public-image cache generation');
    const cache=await cacheStorage.open(names[0]);return {name:names[0],cache,keys:(await cache.keys()).map(k=>k.url)};
  };
  const load=async read=>{for(const artifact of artifacts)await read(artifact);};
  const before=await inspect();let read,extras={};
  if(action==='interrupt') {
    // This page lives on a fresh, dedicated loopback origin and warns explicitly.
    for(const name of await cacheStorage.keys())if(name.startsWith(PREFIX))await cacheStorage.delete(name);
    const armed=await fetchImpl(origin+'/fault/interrupt',{method:'POST'});
    check(armed.status===204,'Could not arm the one-shot transport fault');
    read=await reader(artifacts);let failure;
    try{await load(read);}catch(error){failure=error;}
    const after=await inspect(),state=await cacheKeys();
    check(failure && after.interruptions===before.interruptions+1,'Expected actual server-side interruption was not observed');
    check((after.counts[after.faultPath]??0)-(before.counts[after.faultPath]??0)===1,'Interrupted request was retried');
    check(!state.keys.includes(origin+after.faultPath),'Partial response entered CacheStorage');
    check(state.keys.includes(origin+after.firstPath),'Completed chunk was not retained');
    return {action,result:'expected-failure',booted:false,...read.diagnostics,retainedEntries:state.keys.length,partialCached:false,interruptions:after.interruptions-before.interruptions};
  }
  if(action==='corrupt') {
    const state=await cacheKeys(),key=origin+before.firstPath;
    const response=await state.cache.match(key);check(response,'Run successful resume before corrupting a cached chunk');
    const bytes=new Uint8Array(await response.arrayBuffer());check(bytes.length>0,'Empty cached fixture');bytes[0]^=1;
    await state.cache.put(key,new Response(bytes,{headers:{'Content-Length':String(bytes.length)}}));
    read=await reader(artifacts);let failure;
    try{await load(read);}catch(error){failure=error;}
    check(failure && /digest/.test(failure.message),'Corrupt chunk did not fail its digest');
    check(read.diagnostics.requests===0,'Corrupt cache triggered an implicit network retry');
    check(!await state.cache.match(key),'Corrupt cache entry was not evicted');
    return {action,result:'expected-failure',booted:false,...read.diagnostics,corruptEntryEvicted:true};
  }
  if(action==='upgrade') {
    check(artifacts.length>1,'Generation fixture requires multiple approved artifacts');
    // Controlled approved-set transition, NOT proof of a new OS version release.
    const old=await reader(artifacts.slice(0,-1));await old(artifacts[0]);
    const oldName=(await cacheKeys()).name;
    const other=await cacheStorage.open(UNRELATED);await other.put(origin+'/unrelated-sentinel',new Response('preserve'));
    read=await reader(artifacts);
    const names=await cacheStorage.keys();
    check(!names.includes(oldName),'Obsolete image generation survived');
    check((await other.match(origin+'/unrelated-sentinel')) && names.includes(UNRELATED),'Unrelated cache was deleted');
    extras={obsoleteGenerationRemoved:true,unrelatedCachePreserved:true,upgradeScope:'controlled approved-set transition; not OS-version acceptance'};
  }
  read??=await reader(artifacts);
  check(typeof boot==='function','A real boot operation is required');
  const guest=await boot(read);
  check(read.diagnostics.verifiedImages===artifacts.length,'Boot did not verify all approved artifacts');
  if(action==='warm')check(read.diagnostics.requests===0,'Warm boot fetched unexpectedly');
  const after=await inspect();
  return {action,result:'booted',booted:true,...read.diagnostics,...extras,guest,serverRequests:after.requests-before.requests};
}
