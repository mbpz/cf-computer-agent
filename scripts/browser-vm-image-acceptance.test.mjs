import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { get } from 'node:http';
import { exportImageBundle } from '../tools/browser-vm/image-bundle.mjs';
import { startImageAcceptanceServer } from '../tools/browser-vm/image-acceptance-server.mjs';
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'vm-image-acceptance-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const bytes=Buffer.alloc(2048,7),artifacts=[{name:'test.iso',location:'iso',role:'iso',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}];
  const directory=join(root,'public');await exportImageBundle({output:directory,artifacts,readAsset:async()=>bytes,chunkBytes:1024});
  const server=await startImageAcceptanceServer({directory,artifacts});t.after(()=>server.close());return server;
}
test('isolated acceptance host serves only verified public inventory and explicit local harness',async t=>{
  const server=await fixture(t), root=await fetch(server.url+'/');
  assert.equal(root.status,200);assert.match(root.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.equal(root.headers.has('access-control-allow-origin'),false);
  assert.match(await root.text(),/原生|native/i);
  for(const path of ['/image-acceptance-browser.mjs','/image-acceptance-worker.mjs','/image-acceptance-core.mjs','/chunked-image.mjs','/engine/libv86.mjs'])assert.equal((await fetch(server.url+path)).status,200);
  for(const path of ['/private.env','/image-bundle.json','/_headers','/relay-ticket','/iso/test.iso','/inspect?x=1'])assert.equal((await fetch(server.url+path)).status,404);
});
test('fault controls require exact local origin, fixed route, POST and empty body',async t=>{
  const server=await fixture(t);
  assert.equal((await fetch(server.url+'/fault/interrupt')).status,405);
  for(const origin of [undefined,'https://other.example'])assert.equal((await fetch(server.url+'/fault/interrupt',{method:'POST',headers:origin?{Origin:origin}:{}})).status,403);
  assert.equal((await fetch(server.url+'/fault/interrupt',{method:'POST',headers:{Origin:server.url},body:'arbitrary'})).status,400);
  assert.equal((await fetch(server.url+'/fault/unknown',{method:'POST',headers:{Origin:server.url}})).status,404);
  const status=await new Promise(resolve=>{get(server.url+'/',{headers:{Host:'foreign.example'}},r=>{r.resume();resolve(r.statusCode);});});assert.equal(status,403);
});
test('one-shot fault actually truncates the HTTP body, then a separate request succeeds',async t=>{
  const server=await fixture(t);const before=await(await fetch(server.url+'/inspect')).json();
  assert.equal((await fetch(server.url+'/fault/interrupt',{method:'POST',headers:{Origin:server.url}})).status,204);
  assert.equal((await fetch(server.url+'/fault/interrupt',{method:'POST',headers:{Origin:server.url}})).status,409);
  const response=await fetch(server.url+before.faultPath);assert.equal(response.status,200);
  await assert.rejects(response.arrayBuffer());
  const after=await(await fetch(server.url+'/inspect')).json();assert.equal(after.interruptions,1);assert.equal(after.requests,1);assert.equal(after.armed,false);
  assert.equal((await(await fetch(server.url+before.faultPath)).arrayBuffer()).byteLength,1024);
  assert.equal((await(await fetch(server.url+'/inspect')).json()).requests,2);
});

import { runImageAcceptance } from '../tools/browser-vm/image-acceptance-core.mjs';
function cacheAdapter(){
  const stores=new Map();return {keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
    if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);
    return {keys:async()=>[...store.keys()].map(url=>({url})),match:async key=>store.get(key)?.clone(),put:async(key,value)=>store.set(key,value.clone()),delete:async key=>store.delete(key)};
  }};
}
test('explicit actions reject interruption/corruption before boot, then independently resume and upgrade',async t=>{
  const root=await mkdtemp(join(tmpdir(),'vm-image-actions-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const buffers=[Buffer.alloc(2048,1),Buffer.alloc(2048,2),Buffer.alloc(2048,3)];
  const artifacts=buffers.map((b,i)=>({name:`image-${i}`,role:i===2?'iso':'bios',location:'iso',bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')}));
  const directory=join(root,'public');await exportImageBundle({output:directory,artifacts,readAsset:async a=>buffers[artifacts.indexOf(a)]??buffers[artifacts.findIndex(b=>a.sha256===b.sha256)],chunkBytes:1024});
  const server=await startImageAcceptanceServer({directory,artifacts});t.after(()=>server.close());
  const cacheStorage=cacheAdapter();let boots=0;
  const boot=async read=>{for(const [i,a] of artifacts.entries())assert.deepEqual(Buffer.from(await read(a)),buffers[i]);boots++;return {fixture:true};};
  const run=action=>runImageAcceptance({action,artifacts,origin:server.url,cacheStorage,boot,fetchImpl:(url,init)=>fetch(url,{...init,headers:init?.method==='POST'?{Origin:server.url}:init?.headers})});
  const interrupted=await run('interrupt');assert.equal(interrupted.result,'expected-failure');assert.equal(interrupted.retainedEntries,8);assert.equal(boots,0);
  const resumed=await run('resume');assert.equal(resumed.requests,1);assert.equal(resumed.cacheHits,8);assert.equal(boots,1);
  const corrupt=await run('corrupt');assert.equal(corrupt.corruptEntryEvicted,true);assert.equal(corrupt.requests,0);assert.equal(boots,1);
  const retry=await run('retry');assert.equal(retry.requests,1);assert.equal(boots,2);
  const upgraded=await run('upgrade');assert.equal(upgraded.obsoleteGenerationRemoved,true);assert.equal(upgraded.unrelatedCachePreserved,true);assert.equal(upgraded.requests,9);assert.equal(boots,3);
  const warm=await run('warm');assert.equal(warm.requests,0);assert.equal(warm.cacheHits,9);assert.equal(boots,4);
});
test('acceptance refuses unknown actions or unavailable cache rather than claiming success',async()=>{
  await assert.rejects(runImageAcceptance({action:'anything'}),/Unknown/);
  await assert.rejects(runImageAcceptance({action:'warm',cacheStorage:null}),/unavailable/);
});
