// Public immutable boot templates ONLY. Not guest files, checkpoints, or release signatures.
import { verifyImageBytes } from './alpine-iso.mjs';

export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_CHUNKS = 64;
const MANIFEST_LIMIT = 64 * 1024;
const PREFIX = 'memory-garden-public-images-v1-';
const hashPattern = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b=>b.toString(16).padStart(2,'0')).join('');
const manifestPath = artifact => `/image-chunks/${artifact.sha256}/manifest.json`;
const chunkPath = (artifact, index, hash) => `/image-chunks/${artifact.sha256}/${index}-${hash}.bin`;
function assertArtifact(a) {
  if (!a || typeof a.name !== 'string' || !a.name || !Number.isSafeInteger(a.bytes) || a.bytes < 1 || a.bytes > MAX_IMAGE_BYTES || !hashPattern.test(a.sha256)) throw Error('Invalid approved image pin');
}
function assertChunkSize(bytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_CHUNK_BYTES) throw Error('Invalid chunk size');
}
export async function buildChunkedImage(input, artifact, {chunkBytes = MAX_CHUNK_BYTES} = {}) {
  assertArtifact(artifact); assertChunkSize(chunkBytes);
  if (Math.ceil(artifact.bytes/chunkBytes) > MAX_CHUNKS) throw Error('Too many image chunks');
  const bytes = await verifyImageBytes(input, artifact);
  const manifest = {version:1, sha256:artifact.sha256, bytes:artifact.bytes, chunkBytes, chunks:[]};
  const files = new Map();
  for (let offset=0, index=0; offset<bytes.length; offset+=chunkBytes, index++) {
    const chunk = bytes.slice(offset, offset+chunkBytes), sha256 = await digest(chunk);
    const path = chunkPath(artifact, index, sha256);
    manifest.chunks.push({path, sha256, bytes:chunk.length}); files.set(path, chunk);
  }
  files.set(manifestPath(artifact), encoder.encode(JSON.stringify(manifest)));
  return {manifest, files};
}
function validateManifest(input, artifact) {
  let m;
  try { m=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input)); } catch { throw Error('Invalid image manifest'); }
  try { assertChunkSize(m.chunkBytes); } catch { throw Error('Invalid image manifest chunk size'); }
  if (m.version!==1 || m.sha256!==artifact.sha256 || m.bytes!==artifact.bytes || !Array.isArray(m.chunks) || m.chunks.length!==Math.ceil(m.bytes/m.chunkBytes) || m.chunks.length>MAX_CHUNKS) throw Error('Invalid image manifest pin or partition');
  m.chunks.forEach((c,i) => {
    if (!c || !hashPattern.test(c.sha256) || c.bytes!==Math.min(m.chunkBytes,m.bytes-i*m.chunkBytes) || c.path!==chunkPath(artifact,i,c.sha256)) throw Error('Invalid image manifest chunk');
  });
  return m;
}

// Bound both headers and body, including a fetch/stream implementation that does
// not itself react to AbortSignal. Cancellation never stores a partial response.
async function readResponse(response, {limit, exact, signal}) {
  if (!response.ok || response.redirected || !response.body) {
    await response.body?.cancel().catch(()=>{}); throw Error('Image resource unavailable');
  }
  const length = response.headers.get('content-length');
  if (!/^[1-9][0-9]*$/.test(length ?? '') || !Number.isSafeInteger(Number(length)) || Number(length)>limit || (exact!==undefined && Number(length)!==exact)) {
    await response.body.cancel().catch(()=>{}); throw Error('Unexpected image size');
  }
  signal.throwIfAborted();
  const reader=response.body.getReader(), output=new Uint8Array(Number(length)); let offset=0;
  const cancel=()=>{ void reader.cancel(signal.reason).catch(()=>{}); };
  signal.addEventListener('abort',cancel,{once:true});
  try {
    for (;;) {
      signal.throwIfAborted();
      const {value,done}=await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.length>output.length-offset) throw Error('Unexpected image size');
      output.set(value,offset); offset+=value.length;
    }
    if (offset!==output.length) throw Error('Unexpected image size');
    return output;
  } catch(error) { await reader.cancel().catch(()=>{}); throw error; }
  finally { signal.removeEventListener('abort',cancel); reader.releaseLock(); }
}
async function deadline(operation, external, timeoutMs) {
  const controller=new AbortController();
  const abort=()=>controller.abort(external.reason);
  if(external?.aborted) abort(); else external?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('Image request timed out')),timeoutMs);
  let rejectAbort;
  const aborted=new Promise((_,reject)=>{ rejectAbort=()=>reject(controller.signal.reason); controller.signal.addEventListener('abort',rejectAbort,{once:true}); });
  try { controller.signal.throwIfAborted(); return await Promise.race([operation(controller.signal),aborted]); }
  finally { clearTimeout(timer); external?.removeEventListener('abort',abort); controller.signal.removeEventListener('abort',rejectAbort); }
}

export async function createChunkedImageReader({artifacts, origin, fetchImpl=globalThis.fetch, cacheStorage=globalThis.caches, timeoutMs=30_000}) {
  if (!Array.isArray(artifacts) || !artifacts.length || artifacts.length>16) throw Error('Explicit approved image set required');
  // Own the allowlist so a caller cannot expand it after cache initialization.
  const approved=artifacts.map(a=>{assertArtifact(a); return {name:a.name,bytes:a.bytes,sha256:a.sha256};});
  if(approved.reduce((sum,a)=>sum+a.bytes,0)>256*1024*1024 || new Set(approved.map(a=>a.sha256)).size!==approved.length) throw Error('Invalid approved image set bounds');
  const base=new URL(origin);
  if(base.origin!==origin || !['https:','http:'].includes(base.protocol) || (base.protocol==='http:' && !['127.0.0.1','localhost','[::1]'].includes(base.hostname))) throw Error('Secure same-origin image source required');
  if(typeof fetchImpl!=='function' || !Number.isSafeInteger(timeoutMs) || timeoutMs<1 || timeoutMs>120_000) throw Error('Invalid image reader options');
  const generation=await digest(encoder.encode(JSON.stringify(approved.map(a=>[a.sha256,a.bytes]).sort())));
  let cache, cacheStatus='unavailable', busy=false;
  const diagnostics={requests:0,cacheHits:0,verifiedImages:0};
  const disableCache=()=>{cache=undefined;cacheStatus='unavailable';};
  if(cacheStorage) {
    try {
      await deadline(async signal=>{
        const name=PREFIX+generation;
        for(const old of await cacheStorage.keys()) {signal.throwIfAborted();if(old.startsWith(PREFIX) && old!==name) await cacheStorage.delete(old);}
        const opened=await cacheStorage.open(name); signal.throwIfAborted(); cache=opened; cacheStatus='persistent';
      },undefined,timeoutMs);
    } catch { disableCache(); }
  }
  const cacheCall=async(method,...args)=>{
    if(!cache) return undefined;
    try { return await cache[method](...args); } catch {disableCache();return undefined;}
  };
  const evict=path=>cacheCall('delete',origin+path);
  async function resource(path, exact, validate, signal) {
    return deadline(async active=>{
      const key=origin+path;
      let response=await cacheCall('match',key);
      const cached=Boolean(response);
      active.throwIfAborted();
      if(!response) {diagnostics.requests++; response=await fetchImpl(key,{signal:active,redirect:'error',credentials:'omit',cache:'no-store'});}
      if(active.aborted) {void response.body?.cancel().catch(()=>{}); active.throwIfAborted();}
      let bytes, result;
      try {
        bytes=await readResponse(response,{limit:exact??MANIFEST_LIMIT,exact,signal:active});
        result=await validate(bytes); active.throwIfAborted();
      } catch(error) {await evict(path);throw error;}
      if(!cached) await cacheCall('put',key,new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':'application/octet-stream'}}));
      active.throwIfAborted(); if(cached) diagnostics.cacheHits++; return result;
    },signal,timeoutMs);
  }
  async function read(artifact,{signal}={}) {
    const pin=approved.find(a=>a.sha256===artifact?.sha256 && a.bytes===artifact.bytes && a.name===artifact.name);
    if(!pin) throw Error('Image is not in approved set');
    if(busy) throw Error('Image reader already busy');
    signal?.throwIfAborted(); busy=true;
    try {
      const m=await resource(manifestPath(pin),undefined,bytes=>validateManifest(bytes,pin),signal);
      // Bound cache growth even after a changed/corrupt manifest was evicted.
      await deadline(async active=>{
        const keep=new Set([manifestPath(pin),...m.chunks.map(c=>c.path)].map(path=>origin+path));
        for(const key of await cacheCall('keys')??[]) {
          active.throwIfAborted();
          if(key.url.startsWith(origin+`/image-chunks/${pin.sha256}/`) && !keep.has(key.url)) await cacheCall('delete',key.url);
        }
      },signal,timeoutMs);
      const output=new Uint8Array(pin.bytes); let offset=0;
      for(const c of m.chunks) {
        const bytes=await resource(c.path,c.bytes,bytes=>verifyImageBytes(bytes,{...c,name:c.path}),signal);
        output.set(bytes,offset); offset+=bytes.length;
      }
      signal?.throwIfAborted();
      try {
        const verified=await verifyImageBytes(output,pin); signal?.throwIfAborted(); diagnostics.verifiedImages++; return verified;
      } catch(error) {
        // A malicious manifest with internally valid chunks must not poison future resumes.
        await evict(manifestPath(pin)); for(const c of m.chunks) await evict(c.path); throw error;
      }
    } finally {busy=false;}
  }
  Object.defineProperty(read,'cacheStatus',{get:()=>cacheStatus});
  Object.defineProperty(read,'diagnostics',{get:()=>({...diagnostics})});
  return read;
}
