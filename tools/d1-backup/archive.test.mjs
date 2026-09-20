import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat, chmod, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, json } from './core.mjs';
import * as archive from './archive.mjs';

const identity={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001'};
const metadata={identity,quiescence:{acknowledged:true,reference:'synthetic-only'}};
const backup={
  objects:[{type:'table',name:'d1_migrations',tbl_name:'d1_migrations',sql:'CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)'}],
  tables:[{name:'d1_migrations',virtual:false,columns:['id','name']}],
  sequences:[],
  rows:[{table:0,values:['i1','i1','t303030315F696E69742E73716C']}],
  migrations:[{name:'0001_init.sql',sha256:'0'.repeat(64)}],
};
async function location(t) {
  const root=await mkdtemp(join(tmpdir(),'d1-backup-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return join(root,'archive');
}
test('private exclusive archive roundtrips only with pinned digest and source identity',async t=>{
  const directory=await location(t);
  const result=await archive.writeArchive(directory,backup,metadata);
  assert.match(result.manifestSha256,/^[a-f0-9]{64}$/);
  assert.equal((await stat(directory)).mode & 0o777,0o700);
  for(const name of ['schema.json','data.ndjson','manifest.json']) assert.equal((await stat(join(directory,name))).mode & 0o777,0o600);
  assert.deepEqual((await archive.readArchive(directory,{identity,manifestSha256:result.manifestSha256})).backup,backup);
  await assert.rejects(()=>archive.writeArchive(directory,backup,metadata),/ARCHIVE_WRITE_FAILED/);
  await assert.rejects(()=>archive.readArchive(directory,{identity,manifestSha256:'f'.repeat(64)}),/ARCHIVE_INVALID/);
  await assert.rejects(()=>archive.readArchive(directory,{identity:{...identity,databaseId:'00000000-0000-4000-8000-000000000002'},manifestSha256:result.manifestSha256}),/ARCHIVE_INVALID/);
});
test('truncation, missing completion marker and unexpected files cannot verify',async t=>{
  for(const mutation of ['truncate','missing','extra']) {
    const directory=await location(t), result=await archive.writeArchive(directory,backup,metadata);
    if(mutation==='truncate') await writeFile(join(directory,'data.ndjson'),'');
    if(mutation==='missing') await unlink(join(directory,'manifest.json'));
    if(mutation==='extra') await writeFile(join(directory,'partial'),'private-data-marker');
    await assert.rejects(()=>archive.readArchive(directory,{identity,manifestSha256:result.manifestSha256}),/ARCHIVE_INVALID/);
  }
});
test('permission exposure and symlink substitution reject without including private contents',async t=>{
  const directory=await location(t), result=await archive.writeArchive(directory,backup,metadata);
  await chmod(join(directory,'data.ndjson'),0o644);
  await assert.rejects(()=>archive.readArchive(directory,{identity,manifestSha256:result.manifestSha256}),e=>e.message==='ARCHIVE_INVALID');
  await chmod(join(directory,'data.ndjson'),0o600);
  const bytes=await readFile(join(directory,'data.ndjson'));
  await writeFile(join(directory,'outside'),bytes,{mode:0o600});
  await unlink(join(directory,'data.ndjson'));
  await symlink(join(directory,'outside'),join(directory,'data.ndjson'));
  await unlink(join(directory,'outside'));
  await assert.rejects(()=>archive.readArchive(directory,{identity,manifestSha256:result.manifestSha256}),e=>e.message==='ARCHIVE_INVALID');
});
test('even a re-pinned manifest cannot smuggle file paths or false counts',async t=>{
  for(const mutate of [m=>{m.files[0].name='../elsewhere'},m=>{m.tables=[]},m=>{m.version=999}]) {
    const directory=await location(t);
    await archive.writeArchive(directory,backup,metadata);
    const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
    mutate(manifest);
    const content=json(manifest);
    await writeFile(join(directory,'manifest.json'),content);
    await assert.rejects(()=>archive.readArchive(directory,{identity,manifestSha256:sha256(content)}),/ARCHIVE_INVALID/);
  }
});
test('repo destination and invalid row order/shape reject before any archive is published',async t=>{
  await assert.rejects(()=>archive.writeArchive(new URL('./forbidden-archive',import.meta.url).pathname,backup,metadata),/ARCHIVE_WRITE_FAILED/);
  for(const mutate of [b=>b.rows.push(b.rows[0]),b=>b.rows[0].values.pop(),b=>b.tables.pop(),b=>{b.sequences=[{name:'missing',seq:'1'}]}]) {
    const directory=await location(t), malformed=structuredClone(backup);
    mutate(malformed);
    await assert.rejects(()=>archive.writeArchive(directory,malformed,metadata),/ARCHIVE_WRITE_FAILED/);
    await assert.rejects(()=>stat(join(directory,'manifest.json')),{code:'ENOENT'});
  }
});
test('capture destination can be rejected before reading any source',async t=>{
  const directory=await location(t);
  assert.equal(typeof archive.checkDestination,'function');
  await archive.checkDestination(directory);
  await assert.rejects(()=>stat(directory),{code:'ENOENT'});
  await archive.writeArchive(directory,backup,metadata);
  await assert.rejects(()=>archive.checkDestination(directory),/ARCHIVE_WRITE_FAILED/);
  await assert.rejects(()=>archive.checkDestination(new URL('./forbidden-archive',import.meta.url).pathname),/ARCHIVE_WRITE_FAILED/);
});
