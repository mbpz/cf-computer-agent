import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { exportImageBundle, verifyImageBundle, createPinnedSourceReader, STATIC_ASSET_LIMITS } from '../tools/browser-vm/image-bundle.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(),'vm-image-bundle-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const bytes = Buffer.from('public image fixture, no guest data');
  const artifacts = [{name:'image.iso',location:'iso',role:'iso',bytes:bytes.length,sha256:sha(bytes)}];
  return {root,output:join(root,'bundle'),artifacts,readAsset:async()=>bytes,chunkBytes:8};
}
const options = f => ({output:f.output,artifacts:f.artifacts,readAsset:f.readAsset,chunkBytes:f.chunkBytes});
async function index(f) { return JSON.parse(await readFile(join(f.output,'image-bundle.json'),'utf8')); }

test('deterministic public bundle is independently verified from disk using trusted pins',async t=>{
  const f=await fixture(t); const result=await exportImageBundle(options(f));
  assert.equal(result.artifacts,1); assert.equal(result.files,8); // 5 chunks + manifest + index + headers
  assert.equal(result.productionAcceptance,false);
  assert.equal(result.maxFileBytes<=STATIC_ASSET_LIMITS.maxFileBytes,true);
  assert.deepEqual(await verifyImageBundle({directory:f.output,artifacts:f.artifacts}),result);
  const first=await index(f);
  await exportImageBundle({...options(f),output:join(f.root,'second')});
  assert.deepEqual(JSON.parse(await readFile(join(f.root,'second/image-bundle.json'),'utf8')),first);
  const headers=await readFile(join(f.output,'_headers'),'utf8');
  assert.match(headers,/^\/image-chunks\/\*/m); assert.match(headers,/no-transform/);
  assert.doesNotMatch(headers,/Access-Control|Content-Security|COOP|COEP|^\/\*$/m);
});

test('bad pins fail without a ready bundle; existing destination is never overwritten',async t=>{
  const f=await fixture(t);
  await assert.rejects(exportImageBundle({...options(f),readAsset:async()=>Buffer.alloc(f.artifacts[0].bytes)}),/digest/);
  assert.deepEqual(await readdir(f.root),[]);
  await mkdir(f.output); await writeFile(join(f.output,'keep.txt'),'existing');
  await assert.rejects(exportImageBundle(options(f)),/exist/i);
  assert.equal(await readFile(join(f.output,'keep.txt'),'utf8'),'existing');
});

test('file count and size budgets include metadata, cannot be expanded beyond free tier',async t=>{
  const f=await fixture(t);
  for(const limits of [{maxFiles:7},{maxFileBytes:7},{reservedFiles:19999},{maxFiles:20001},{maxFileBytes:25*1024*1024+1},{reservedFiles:-1}]) {
    await assert.rejects(exportImageBundle({...options(f),limits}),/limit|budget/i);
    assert.deepEqual(await readdir(f.root),[]);
  }
});

test('extra, missing, truncated and modified public files fail disk verification',async t=>{
  const f=await fixture(t);await exportImageBundle(options(f));
  const receipt=await index(f);const chunk=receipt.files.find(item=>item.path.endsWith('.bin'));
  const path=join(f.output,chunk.path),original=await readFile(path);
  await writeFile(join(f.output,'private.env'),'MUST_NOT_BE_READ');
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/unexpected|inventory/i);
  await rm(join(f.output,'private.env'));await truncate(path,0);
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/size|digest/);
  await writeFile(path,Buffer.alloc(original.length));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/digest/);
  await rm(path);
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/missing|inventory/i);
});

test('rewriting the index cannot bless a changed chunk or change trusted original pins',async t=>{
  const f=await fixture(t);await exportImageBundle(options(f));const receipt=await index(f);
  const chunk=receipt.files.find(item=>item.path.endsWith('.bin')),path=join(f.output,chunk.path);
  const bytes=Buffer.alloc(chunk.bytes);await writeFile(path,bytes);chunk.sha256=sha(bytes);
  await writeFile(join(f.output,'image-bundle.json'),JSON.stringify(receipt));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/digest/);
  receipt.artifacts[0].sha256='a'.repeat(64);await writeFile(join(f.output,'image-bundle.json'),JSON.stringify(receipt));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/pin/);
});

test('bundle paths cannot escape, use symlinks, introduce duplicates or alter headers',async t=>{
  const f=await fixture(t);await exportImageBundle(options(f));const receipt=await index(f);
  for(const badPath of ['../outside','/absolute','image-chunks/%2e%2e/x','image-chunks\\x']) {
    const changed=structuredClone(receipt);changed.files[0].path=badPath;
    await writeFile(join(f.output,'image-bundle.json'),JSON.stringify(changed));
    await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/path|inventory/);
  }
  const changed=structuredClone(receipt);changed.files.push(changed.files[0]);
  await writeFile(join(f.output,'image-bundle.json'),JSON.stringify(changed));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/duplicate|inventory/);
  await writeFile(join(f.output,'image-bundle.json'),JSON.stringify(receipt));
  const headers=await readFile(join(f.output,'_headers'));await writeFile(join(f.output,'_headers'),'/*\n Access-Control-Allow-Origin: *\n');
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/header|digest|size/);
  await writeFile(join(f.output,'_headers'),headers);
  const chunk=receipt.files.find(item=>item.path.endsWith('.bin'));
  await rm(join(f.output,chunk.path));await symlink(join(f.output,'_headers'),join(f.output,chunk.path));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/symlink|regular/i);
});

test('source reader reads exact public pins only and rejects source symlinks or traversal',async t=>{
  const f=await fixture(t);const iso=join(f.root,'iso');await mkdir(iso);
  await writeFile(join(iso,'image.iso'),await f.readAsset());await writeFile(join(iso,'private.env'),'not an image');
  const reader=await createPinnedSourceReader({artifacts:f.artifacts,roots:{iso}});
  assert.deepEqual(await reader(f.artifacts[0]),await f.readAsset());
  await assert.rejects(reader({...f.artifacts[0],name:'private.env'}),/approved|pin/);
  await rm(join(iso,'image.iso'));await symlink(join(iso,'private.env'),join(iso,'image.iso'));
  await assert.rejects(reader(f.artifacts[0]),/symlink|regular|ELOOP/);
  await assert.rejects(createPinnedSourceReader({artifacts:[{...f.artifacts[0],name:'../private.env'}],roots:{iso}}),/path/);
});

test('export rejects symlink destination and duplicate or overlarge approved sets',async t=>{
  const f=await fixture(t);const elsewhere=join(f.root,'elsewhere');await mkdir(elsewhere);await symlink(elsewhere,f.output);
  await assert.rejects(exportImageBundle(options(f)),/exist|symlink/i);
  assert.deepEqual(await readdir(elsewhere),[]);
  for(const artifacts of [[...f.artifacts,...f.artifacts],Array(17).fill(f.artifacts[0]),[{...f.artifacts[0],bytes:129*1024*1024}]]) {
    await assert.rejects(exportImageBundle({...options(f),output:join(f.root,'new'),artifacts}),/approved|pin|duplicate|bound/i);
  }
});

test('rewriting every generated chunk digest still cannot replace the original trusted image',async t=>{
  const f=await fixture(t);await exportImageBundle(options(f));const receipt=await index(f);
  const chunk=receipt.files.find(item=>item.path.endsWith('.bin'));
  const manifestEntry=receipt.files.find(item=>item.path.endsWith('manifest.json'));
  const manifest=JSON.parse(await readFile(join(f.output,manifestEntry.path)));
  const part=manifest.chunks.find(c=>c.path.slice(1)===chunk.path);
  const bytes=Buffer.alloc(chunk.bytes),digest=sha(bytes),oldPath=chunk.path;
  chunk.path=chunk.path.replace(chunk.sha256,digest);chunk.sha256=digest;
  part.path='/'+chunk.path;part.sha256=digest;
  await rm(join(f.output,oldPath));await writeFile(join(f.output,chunk.path),bytes);
  const manifestBytes=Buffer.from(JSON.stringify(manifest));
  manifestEntry.bytes=manifestBytes.length;manifestEntry.sha256=sha(manifestBytes);
  await writeFile(join(f.output,manifestEntry.path),manifestBytes);
  await writeFile(join(f.output,'image-bundle.json'),JSON.stringify(receipt));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/digest/);
});

test('disk verification independently enforces budgets and rejects unexpected empty directories',async t=>{
  const f=await fixture(t);await exportImageBundle(options(f));
  for(const limits of [{maxFiles:7},{reservedFiles:19999},{maxFileBytes:7}]) {
    await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts,limits}),/budget|size/);
  }
  await mkdir(join(f.output,'private'));
  await assert.rejects(verifyImageBundle({directory:f.output,artifacts:f.artifacts}),/inventory/);
});
