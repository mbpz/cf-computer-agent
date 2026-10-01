import test from 'node:test';
import assert from 'node:assert/strict';
import { startProbeServer } from './server.mjs';
import { ALPINE_ISO_ARTIFACTS, prepareAlpineIso } from './alpine-iso.mjs';
import { createChunkedImageReader, MAX_CHUNK_BYTES } from './chunked-image.mjs';
import { createTerminalSession } from './terminal-session.mjs';
import { V86 } from 'v86';
const assets=process.env.BROWSER_VM_PROBE_ASSETS, isoAssets=process.env.BROWSER_VM_PROBE_ISO_ASSETS;

test('actual pinned Alpine cold/warm boot from bounded local HTTP chunks', {
  skip:(!assets||!isoAssets)&&'Explicit development BIOS and ISO assets required',timeout:120000,
},async t=>{
  const server=await startProbeServer({assets,isoAssets,chunkedImages:true});
  t.after(()=>server.close());
  const stores=new Map();
  // Deliberate Cache API test adapter, NOT evidence of native browser persistence.
  const cacheStorage={keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
    if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);
    return {keys:async()=>[...map.keys()].map(url=>({url})),match:async key=>map.get(key)?.clone(),put:async(key,response)=>{map.set(key,response.clone());},delete:async key=>map.delete(key)};
  }};
  for(const path of ['/terminal-worker.mjs?chunked=1','/chunked-image.mjs']) assert.equal((await fetch(server.url+path)).status,200);
  const iso=ALPINE_ISO_ARTIFACTS.find(a=>a.role==='iso');
  const manifestPath=`/image-chunks/${iso.sha256}/manifest.json`;
  const manifest=await(await fetch(server.url+manifestPath)).json();
  assert.equal(manifest.chunks.length,7);assert.ok(manifest.chunks.every(c=>c.bytes<=MAX_CHUNK_BYTES));
  assert.equal((await fetch(server.url+manifestPath,{headers:{Origin:'https://other.example'}})).status,403);
  assert.equal((await fetch(server.url+manifestPath,{method:'POST'})).status,405);
  assert.equal((await fetch(server.url+manifest.chunks[0].path,{method:'HEAD'})).headers.get('content-length'),String(MAX_CHUNK_BYTES));
  assert.equal((await fetch(server.url+manifestPath+'?unlisted=1')).status,404);
  assert.equal((await fetch(server.url+`/image-chunks/${iso.sha256}/unknown.bin`)).status,404);
  const runs=[];
  for(const mode of ['cold','warm']) {
    const calls=[];let transferredBytes=0;
    const read=await createChunkedImageReader({artifacts:ALPINE_ISO_ARTIFACTS,origin:server.url,cacheStorage,fetchImpl:async(url,init)=>{
      calls.push(url);if(mode==='warm')throw Error('Warm boot unexpectedly fetched');
      const response=await fetch(url,init);transferredBytes+=Number(response.headers.get('content-length'));return response;
    }});
    const started=performance.now();
    const profile=await prepareAlpineIso({Engine:V86,readAsset:read});
    const loadedMs=Math.round(performance.now()-started);
    const session=createTerminalSession({createMachine:()=>profile.createMachine()});
    try {
      await session.ready;session.drain();
      session.write("printf '分块真实客体' > /mnt/work/chunks.txt\nuname -r; cat /mnt/work/chunks.txt; printf '\nCHUNK-BOOT-DONE\n'\n");
      let output='';const decoder=new TextDecoder(), end=performance.now()+10000;
      while(performance.now()<end) {
        const chunk=session.drain();assert.equal(chunk.droppedBytes,0);output+=decoder.decode(chunk.bytes,{stream:true});
        if(/\r?\n6\.18\.35-0-virt\r?\n分块真实客体\r?\nCHUNK-BOOT-DONE\r?\n/.test(output))break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.match(output,/\r?\n6\.18\.35-0-virt\r?\n分块真实客体\r?\nCHUNK-BOOT-DONE\r?\n/);
      runs.push({mode,requests:calls.length,transferredBytes,loadedMs,bootAndCommandMs:Math.round(performance.now()-started),cache:read.cacheStatus});
    } finally {await session.close();}
    assert.equal(calls.length,mode==='cold'?18:0);
  }
  console.log(JSON.stringify({runs,kernel:'6.18.35-0-virt',maxChunkBytes:MAX_CHUNK_BYTES,network:'off',nativeBrowserCache:false,productionAcceptance:false}));
});
