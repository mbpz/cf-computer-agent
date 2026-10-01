import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { V86 } from 'v86';
import { ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
import { exportImageBundle, createPinnedSourceReader } from './image-bundle.mjs';
import { startImageAcceptanceServer } from './image-acceptance-server.mjs';
import { runImageAcceptance } from './image-acceptance-core.mjs';
import { bootAcceptedImage } from './image-acceptance-boot.mjs';
const boot=process.env.BROWSER_VM_PROBE_ASSETS,iso=process.env.BROWSER_VM_PROBE_ISO_ASSETS;
test('real offline Alpine cannot boot partial/corrupt images and recovers only through explicit actions',{
  skip:(!boot||!iso)&&'Explicit pinned development assets required',timeout:180000,
},async t=>{
  const root=await mkdtemp(join(tmpdir(),'vm-real-image-failures-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const artifacts=ALPINE_ISO_ARTIFACTS;
  const readAsset=await createPinnedSourceReader({artifacts,roots:{boot,iso,engine:fileURLToPath(new URL('../../node_modules/v86/build/',import.meta.url))}});
  const directory=join(root,'public');await exportImageBundle({output:directory,artifacts,readAsset});
  const server=await startImageAcceptanceServer({directory,artifacts});t.after(()=>server.close());
  const stores=new Map();
  // Native Node HTTP transport, but intentionally a Cache API test adapter.
  // This does not certify native browser CacheStorage/Worker behavior.
  const cacheStorage={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async key=>{
    if(!stores.has(key))stores.set(key,new Map());const map=stores.get(key);
    return {keys:async()=>[...map.keys()].map(url=>({url})),match:async key=>map.get(key)?.clone(),put:async(key,value)=>map.set(key,value.clone()),delete:async key=>map.delete(key)};
  }};
  let bootCalls=0;const receipts=[];
  for(const action of ['interrupt','resume','corrupt','retry','upgrade','warm']) {
    const started=performance.now();
    const receipt=await runImageAcceptance({action,artifacts,origin:server.url,cacheStorage,
      // Node does not add browser Origin automatically to same-origin POST.
      fetchImpl:(url,init)=>fetch(url,{...init,headers:init?.method==='POST'?{Origin:server.url}:init?.headers}),
      boot:async read=>{bootCalls++;return bootAcceptedImage(read,V86);},
    });
    if(action==='interrupt'){assert.equal(receipt.result,'expected-failure');assert.equal(bootCalls,0);assert.equal(receipt.retainedEntries,12);assert.equal(receipt.requests,13);}
    if(action==='resume'){assert.equal(receipt.requests,6);assert.equal(receipt.cacheHits,12);}
    if(action==='corrupt'){assert.equal(receipt.result,'expected-failure');assert.equal(bootCalls,1);assert.equal(receipt.requests,0);}
    if(action==='retry'){assert.equal(receipt.requests,1);assert.equal(receipt.cacheHits,17);}
    if(action==='upgrade'){assert.equal(receipt.requests,18);assert.equal(receipt.obsoleteGenerationRemoved,true);assert.equal(receipt.unrelatedCachePreserved,true);}
    if(action==='warm'){assert.equal(receipt.requests,0);assert.equal(receipt.cacheHits,18);}
    if(receipt.booted){assert.equal(receipt.verifiedImages,6);assert.equal(receipt.guest.kernel,'6.18.35-0-virt');}
    receipts.push({...receipt,elapsedMs:Math.round(performance.now()-started)});console.log(JSON.stringify(receipts.at(-1)));
  }
  assert.equal(bootCalls,4);assert.equal(server.inspect().interruptions,1);
  console.log(JSON.stringify({bootCalls,nativeBrowserAcceptance:false,productionAcceptance:false,guestNetworking:'off'}));
});
