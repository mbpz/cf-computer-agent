// Node-only local public-template export. No deployment or release approval.
import { constants } from 'node:fs';
import { lstat, realpath, open, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildChunkedImage, createChunkedImageReader, MAX_CHUNK_BYTES } from './chunked-image.mjs';

// Conservative Free-plan ceiling, checked 2026-10-01 against Pages limits.
// https://developers.cloudflare.com/pages/platform/limits/
export const STATIC_ASSET_LIMITS = Object.freeze({maxFiles:20000,maxFileBytes:25*1024*1024});
const INDEX = 'image-bundle.json';
const INDEX_LIMIT = 1024*1024;
const HEADERS = '/image-chunks/*\n  Content-Type: application/octet-stream\n  Cache-Control: public, max-age=0, must-revalidate, no-transform\n  X-Content-Type-Options: nosniff\n';
const hashPattern = /^[a-f0-9]{64}$/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value,null,2)+'\n');
function safePath(path) {
  if(typeof path!=='string' || !/^[A-Za-z0-9_.\/-]+$/.test(path) || path.split('/').some(p=>!p || p==='.' || p==='..')) throw Error('Invalid bundle path');
  return path;
}
function pins(input) {
  if(!Array.isArray(input) || input.length<1 || input.length>16) throw Error('Invalid approved pin bounds');
  const hashes=new Set(), names=new Set(); let total=0;
  const result=input.map(a=>{
    if(!a || !Number.isSafeInteger(a.bytes) || a.bytes<1 || a.bytes>128*1024*1024 || !hashPattern.test(a.sha256)) throw Error('Invalid approved image pin');
    safePath(a.name); safePath(a.location); safePath(a.role);
    if(a.location.includes('/') || a.role.includes('/')) throw Error('Invalid approved pin path');
    const key=`${a.location}/${a.name}`;
    if(hashes.has(a.sha256) || names.has(key)) throw Error('Duplicate approved pin');
    hashes.add(a.sha256); names.add(key); total+=a.bytes;
    return {name:a.name,location:a.location,role:a.role,bytes:a.bytes,sha256:a.sha256};
  });
  if(total>256*1024*1024) throw Error('Approved pin set exceeds bounds');
  return result;
}
function budget(input={}) {
  const out={...STATIC_ASSET_LIMITS,reservedFiles:0,...input};
  if(!Number.isSafeInteger(out.maxFiles) || out.maxFiles<1 || out.maxFiles>STATIC_ASSET_LIMITS.maxFiles ||
     !Number.isSafeInteger(out.maxFileBytes) || out.maxFileBytes<1 || out.maxFileBytes>STATIC_ASSET_LIMITS.maxFileBytes ||
     !Number.isSafeInteger(out.reservedFiles) || out.reservedFiles<0 || out.reservedFiles>out.maxFiles) throw Error('Invalid static asset limit');
  return out;
}
function receipt(artifacts,files,limits) {
  const sizes=[...files.values()].map(b=>b.byteLength);
  if(sizes.length+limits.reservedFiles>limits.maxFiles || sizes.some(n=>n>limits.maxFileBytes)) throw Error('Static asset budget exceeded');
  return {artifacts:artifacts.length,files:sizes.length,bytes:sizes.reduce((a,b)=>a+b,0),maxFileBytes:Math.max(...sizes),reservedFiles:limits.reservedFiles,productionAcceptance:false};
}
// Roots are explicit local inputs. Resolve OS aliases once; reject symlinks below
// the chosen root, never glob a directory (which might contain guest/private data).
async function rootDirectory(path) {
  const absolute=resolve(path), stat=await lstat(absolute);
  if(!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Expected regular directory, not symlink');
  return realpath(absolute);
}
async function boundedRead(root,path,limit) {
  safePath(path);
  let current=root; const parts=path.split('/');
  for(const part of parts.slice(0,-1)) {
    current=join(current,part); const stat=await lstat(current);
    if(!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Expected regular directory, not symlink');
  }
  const handle=await open(join(root,path),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try {
    const stat=await handle.stat();
    if(!stat.isFile()) throw Error('Expected regular file, not symlink');
    if(stat.size>limit) throw Error('Unexpected file size');
    const bytes=Buffer.alloc(stat.size); let offset=0;
    while(offset<bytes.length) {
      const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
      if(!bytesRead) throw Error('Unexpected file size');
      offset+=bytesRead;
    }
    const extra=Buffer.alloc(1);
    if((await handle.read(extra,0,1,offset)).bytesRead) throw Error('Unexpected file size');
    return bytes;
  } finally { await handle.close(); }
}
export async function createPinnedSourceReader({artifacts,roots}) {
  const approved=pins(artifacts), directories=new Map();
  for(const a of approved) {
    if(!roots || typeof roots[a.location]!=='string') throw Error('Missing approved source root');
    if(!directories.has(a.location)) directories.set(a.location,await rootDirectory(roots[a.location]));
  }
  return async artifact=>{
    const matched=approved.find(a=>a.name===artifact?.name && a.location===artifact.location && a.role===artifact.role && a.bytes===artifact.bytes && a.sha256===artifact.sha256);
    if(!matched) throw Error('Source is not an approved pin');
    return boundedRead(directories.get(matched.location),matched.name,matched.bytes);
  };
}
export async function exportImageBundle({output,artifacts,readAsset,chunkBytes=MAX_CHUNK_BYTES,limits:input}) {
  const approved=pins(artifacts), limits=budget(input), target=resolve(output);
  // Reject existing destinations before expensive hashing, including symlinks.
  try { await lstat(target); throw Error('Bundle destination already exists'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  const files=new Map();
  for(const artifact of approved) {
    const built=await buildChunkedImage(await readAsset(artifact),artifact,{chunkBytes});
    for(const [path,bytes] of built.files) files.set(safePath(path.slice(1)),bytes);
  }
  files.set('_headers',Buffer.from(HEADERS));
  const index={version:1,purpose:'local-public-template-distribution',artifacts:approved,files:[...files].sort(([a],[b])=>a.localeCompare(b)).map(([path,bytes])=>({path,bytes:bytes.byteLength,sha256:sha(bytes)}))};
  files.set(INDEX,encode(index));
  if(files.get(INDEX).length>INDEX_LIMIT) throw Error('Index size limit exceeded');
  const result=receipt(approved,files,limits);
  const parent=await rootDirectory(dirname(target));
  const destination=join(parent,target.split('/').at(-1));
  await mkdir(destination); // Exclusive; never clean up another export's directory.
  try {
    for(const [path,bytes] of files) {
      const file=join(destination,path);
      await mkdir(dirname(file),{recursive:true}); await writeFile(file,bytes,{flag:'wx'});
    }
    await verifyImageBundle({directory:destination,artifacts:approved,limits});
    return result;
  } catch(error) { await rm(destination,{recursive:true,force:true}); throw error; }
}
async function inventory(root) {
  const files=new Set(); let entries=0;
  async function walk(path='',depth=0) {
    if(depth>4) throw Error('Unexpected inventory depth');
    for(const entry of await readdir(join(root,path),{withFileTypes:true})) {
      if(++entries>22000) throw Error('Inventory limit exceeded');
      const child=safePath(path ? `${path}/${entry.name}` : entry.name);
      if(entry.isSymbolicLink()) throw Error('Inventory symlink is not a regular file');
      if(entry.isDirectory()) {
        if(child!=='image-chunks' && !/^image-chunks\/[a-f0-9]{64}$/.test(child)) throw Error('Unexpected inventory directory');
        await walk(child,depth+1);
      }
      else if(entry.isFile()) files.add(child);
      else throw Error('Inventory contains a non-regular file');
    }
  }
  await walk(); return files;
}
export async function verifyImageBundle({directory,artifacts,limits:input}) {
  const approved=pins(artifacts), limits=budget(input), root=await rootDirectory(directory);
  const actual=await inventory(root);
  if(!actual.has(INDEX)) throw Error('Missing index in inventory');
  const indexBytes=await boundedRead(root,INDEX,Math.min(INDEX_LIMIT,limits.maxFileBytes));
  const index=JSON.parse(indexBytes);
  if(index.version!==1 || index.purpose!=='local-public-template-distribution' || JSON.stringify(index.artifacts)!==JSON.stringify(approved)) throw Error('Bundle does not match trusted pins');
  if(!Array.isArray(index.files) || index.files.length>16*65+1) throw Error('Invalid inventory');
  const expected=new Set([INDEX]); let declaredBytes=indexBytes.length;
  for(const item of index.files) {
    const path=safePath(item?.path);
    if(expected.has(path)) throw Error('Duplicate inventory path');
    if(path!=='_headers' && !/^image-chunks\/[a-f0-9]{64}\/(manifest\.json|[0-9]+-[a-f0-9]{64}\.bin)$/.test(path)) throw Error('Unexpected inventory path');
    if(!Number.isSafeInteger(item.bytes) || item.bytes<1 || item.bytes>limits.maxFileBytes || !hashPattern.test(item.sha256)) throw Error('Invalid inventory size or digest');
    declaredBytes+=item.bytes;
    if(declaredBytes>258*1024*1024) throw Error('Inventory byte budget exceeded');
    expected.add(path);
  }
  if(actual.size!==expected.size || [...expected].some(path=>!actual.has(path))) throw Error('Missing or unexpected inventory file');
  const files=new Map([[INDEX,indexBytes]]);
  for(const item of index.files) {
    const bytes=await boundedRead(root,item.path,item.bytes);
    if(bytes.length!==item.bytes) throw Error('Unexpected file size');
    if(sha(bytes)!==item.sha256) throw Error('Invalid file digest');
    files.set(item.path,bytes);
  }
  if(files.get('_headers')?.toString()!==HEADERS) throw Error('Invalid image headers');
  const used=new Set([INDEX,'_headers']);
  const reader=await createChunkedImageReader({artifacts:approved,origin:'https://images.invalid',cacheStorage:null,fetchImpl:async url=>{
    const path=new URL(url).pathname.slice(1), bytes=files.get(path);
    if(!bytes) throw Error('Missing image inventory file');
    used.add(path); return new Response(bytes,{headers:{'Content-Length':String(bytes.byteLength)}});
  }});
  // Index hashes are NOT trust anchors. Reconstruct through the production
  // loader and verify every original digest against caller-supplied code pins.
  for(const artifact of approved) await reader(artifact);
  if(used.size!==files.size) throw Error('Unexpected unreferenced inventory file');
  return receipt(approved,files,limits);
}
