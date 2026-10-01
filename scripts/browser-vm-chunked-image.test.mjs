import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildChunkedImage, createChunkedImageReader, MAX_CHUNK_BYTES } from '../tools/browser-vm/chunked-image.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://vm.example';
function memoryCache() {
  const stores = new Map();
  return { stores, async keys() { return [...stores.keys()]; }, async delete(key) { return stores.delete(key); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return { async keys() {return [...entries.keys()].map(url=>({url}));}, async match(key) { return entries.get(key)?.clone(); }, async put(key, value) { entries.set(key, value.clone()); }, async delete(key) { return entries.delete(key); } };
    } };
}
async function fixture(options = {}) {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
  const artifact = {name:'test.iso', bytes:bytes.length, sha256:sha(bytes)};
  const built = await buildChunkedImage(bytes, artifact, {chunkBytes:3});
  const storage = memoryCache(), calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    const data = built.files.get(new URL(url).pathname);
    assert.ok(data, url);
    return new Response(data, {headers:{'content-length':String(data.byteLength)}});
  };
  const args = {artifacts:[artifact], origin, fetchImpl, cacheStorage:storage, ...options};
  return {bytes, artifact, built, storage, calls, args, read:await createChunkedImageReader(args)};
}

test('builder verifies original bytes, bounds chunks and creates content-addressed routes', async () => {
  const f = await fixture();
  assert.equal(MAX_CHUNK_BYTES, 8 * 1024 * 1024);
  assert.deepEqual(f.built.manifest.chunks.map(c => c.bytes), [3,3,1]);
  await assert.rejects(buildChunkedImage(new Uint8Array(7), f.artifact), /digest/);
  for (const chunkBytes of [0, -1, 1.5, MAX_CHUNK_BYTES+1]) await assert.rejects(buildChunkedImage(f.bytes, f.artifact, {chunkBytes}), /chunk/i);
});
test('cold read caches verified chunks; a new reader warms with zero fetches', async () => {
  const f = await fixture();
  assert.deepEqual(await f.read(f.artifact), f.bytes);
  assert.equal(f.calls.length, 4);
  assert.deepEqual(f.read.diagnostics,{requests:4,cacheHits:0,verifiedImages:1});
  const warm = await createChunkedImageReader({...f.args, fetchImpl:() => { throw Error('offline'); }});
  assert.deepEqual(await warm(f.artifact), f.bytes);
  assert.equal(warm.cacheStatus, 'persistent');
  assert.deepEqual(warm.diagnostics,{requests:0,cacheHits:4,verifiedImages:1});
  const copy=warm.diagnostics; copy.cacheHits=0; assert.equal(warm.diagnostics.cacheHits,4);
});
test('network interruption retains completed chunks only and resumes without automatic retry', async () => {
  const f = await fixture(); let requests = 0;
  const interrupted = await createChunkedImageReader({...f.args, fetchImpl:async (...args) => {
    if (++requests === 3) throw Error('interrupted'); return f.args.fetchImpl(...args);
  }});
  await assert.rejects(interrupted(f.artifact), /interrupted/);
  assert.equal(requests, 3);
  f.calls.length = 0;
  assert.deepEqual(await f.read(f.artifact), f.bytes);
  assert.equal(f.calls.length, 2);
});
test('manifest must agree with the caller pin before requesting any chunks', async () => {
  for (const mutate of [m=>m.bytes++, m=>m.sha256='0'.repeat(64), m=>m.chunks[0].path='https://evil.example/a', m=>m.chunks[0].bytes++, m=>m.chunks.push(m.chunks[0]), m=>m.version=2]) {
    const f = await fixture(); const m = structuredClone(f.built.manifest); mutate(m);
    const data = new TextEncoder().encode(JSON.stringify(m));
    f.built.files.set(`/image-chunks/${f.artifact.sha256}/manifest.json`, data);
    await assert.rejects(f.read(f.artifact), /manifest/i);
    assert.equal(f.calls.length, 1);
  }
});
test('network and cached chunk corruption fail closed, evict and do not silently retry', async () => {
  const f = await fixture(); await f.read(f.artifact);
  const entries = [...f.storage.stores.values()][0];
  const chunkKey = [...entries.keys()].find(k=>k.endsWith('.bin'));
  entries.set(chunkKey, new Response(new Uint8Array([9,9,9]), {headers:{'content-length':'3'}}));
  f.calls.length = 0;
  await assert.rejects(f.read(f.artifact), /digest/);
  assert.equal(f.calls.length, 0); assert.equal(entries.has(chunkKey), false);
  assert.deepEqual(await f.read(f.artifact), f.bytes); assert.equal(f.calls.length, 1);
  const g = await fixture(); const path = g.built.manifest.chunks[0].path;
  g.built.files.set(path, new Uint8Array([9,9,9]));
  await assert.rejects(g.read(g.artifact), /digest/);
  assert.equal([...g.storage.stores.values()][0].has(origin+path), false);
});
test('valid chunk hashes cannot replace the authoritative whole-image pin', async () => {
  const f = await fixture(); const m = f.built.manifest;
  const wrong = new Uint8Array([9,9,9]); const c=m.chunks[0];
  c.sha256=sha(wrong); c.path=`/image-chunks/${m.sha256}/0-${c.sha256}.bin`;
  f.built.files.set(c.path, wrong);
  f.built.files.set(`/image-chunks/${m.sha256}/manifest.json`, new TextEncoder().encode(JSON.stringify(m)));
  await assert.rejects(f.read(f.artifact), /digest/);
  assert.equal([...f.storage.stores.values()][0].size, 0);
});
test('oversized, truncated and failed HTTP bodies never become cached chunks', async () => {
  for (const kind of ['oversized','truncated','http','length']) {
    const f=await fixture(); let n=0;
    const read=await createChunkedImageReader({...f.args, fetchImpl:async (...args)=> {
      if (++n===1) return f.args.fetchImpl(...args);
      return new Response(new Uint8Array(kind==='oversized'?4:2), {status:kind==='http'?503:200, headers:{'content-length':kind==='length'?'999999999':'3'}});
    }});
    await assert.rejects(read(f.artifact), /size|unavailable/);
    assert.equal([...f.storage.stores.values()][0].size, 1);
  }
});
test('unavailable/quota-failing cache degrades explicitly without weakening pin verification', async () => {
  for (const cacheStorage of [null, {keys:async()=>{throw Error('denied');}}, {
    keys:async()=>[], open:async()=>({match:async()=>undefined, put:async()=>{throw Error('quota');}})
  }]) {
    const f=await fixture({cacheStorage});
    assert.deepEqual(await f.read(f.artifact), f.bytes);
    assert.equal(f.read.cacheStatus, 'unavailable');
  }
});
test('generation upgrade removes only owned obsolete caches; unapproved artifacts do not fetch', async () => {
  const f=await fixture();
  f.storage.stores.set('memory-garden-public-images-v1-old', new Map());
  f.storage.stores.set('other-app', new Map());
  await createChunkedImageReader(f.args);
  assert.equal(f.storage.stores.has('memory-garden-public-images-v1-old'), false);
  assert.equal(f.storage.stores.has('other-app'), true);
  await assert.rejects(f.read({...f.artifact, sha256:'0'.repeat(64)}), /approved/);
  assert.equal(f.calls.length, 0);
});
test('deadline and explicit abort stop a stalled response body; no retry or partial caching', async () => {
  for (const mode of ['deadline','abort']) {
    const f=await fixture(); let canceled=false;
    const read=await createChunkedImageReader({...f.args, timeoutMs:30, fetchImpl:async()=>new Response(new ReadableStream({cancel(){canceled=true;}}), {headers:{'content-length':'10'}})});
    const controller=new AbortController();
    const result=read(f.artifact, {signal:controller.signal});
    if(mode==='abort') setTimeout(()=>controller.abort(), 5);
    await assert.rejects(result, /abort|timed out/i);
    assert.equal(canceled,true);
    assert.equal([...f.storage.stores.values()][0].size,0);
  }
});


test('refreshing a manifest removes orphan chunks only for that artifact', async () => {
  const f=await fixture(); await f.read(f.artifact);
  const entries=[...f.storage.stores.values()][0];
  const orphan=origin+`/image-chunks/${f.artifact.sha256}/63-${'a'.repeat(64)}.bin`;
  entries.set(orphan,new Response('obsolete'));
  assert.deepEqual(await f.read(f.artifact),f.bytes);
  assert.equal(entries.has(orphan),false);
});
