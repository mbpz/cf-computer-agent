import { constants } from 'node:fs';
import { lstat, realpath, mkdir, open, readdir, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { LIMITS, VERSION, fail, sha256, json, identifier, literal, validateIdentity, ledger } from './core.mjs';

const files=['schema.json','data.ndjson'];
const encoding='sqlite-tagged-hex-v1';
const tool='workbench-d1-logical-backup/1';

function validateBackup(backup) {
  if(!backup || !['objects','tables','sequences','rows','migrations'].every(k=>Array.isArray(backup[k]))) fail('FORMAT');
  if(backup.objects.length>LIMITS.maxObjects || !backup.tables.length || backup.tables.length>LIMITS.maxObjects || backup.rows.length>LIMITS.maxRows) fail('LIMIT');
  if(Buffer.byteLength(json(backup))>LIMITS.maxBytes) fail('LIMIT');
  const objectNames=new Set();
  for(const object of backup.objects) {
    identifier(object.name); identifier(object.tbl_name);
    if(objectNames.has(object.name) || !['table','index','view','trigger'].includes(object.type) || typeof object.sql!=='string' || Buffer.byteLength(object.sql)>LIMITS.maxSqlBytes) fail('SCHEMA');
    objectNames.add(object.name);
  }
  let previousName='';
  for(const table of backup.tables) {
    identifier(table.name);
    if(table.name<=previousName || typeof table.virtual!=='boolean' || !Array.isArray(table.columns) || !table.columns.length || table.columns.length>LIMITS.maxColumns || new Set(table.columns).size!==table.columns.length) fail('TABLE');
    table.columns.forEach(identifier);
    if(table.columns.some(n=>['rowid','_rowid_','oid'].includes(n.toLowerCase()))) fail('TABLE');
    if(!backup.objects.some(o=>o.type==='table' && o.name===table.name && o.tbl_name===table.name)) fail('TABLE');
    previousName=table.name;
  }
  if(backup.objects.filter(o=>o.type==='table').length!==backup.tables.length) fail('TABLE');
  let previousTable=-1, previousRow=null;
  const counts=backup.tables.map(t=>({name:t.name,rows:0}));
  for(const row of backup.rows) {
    if(!Number.isSafeInteger(row.table) || row.table<previousTable || !backup.tables[row.table] || !Array.isArray(row.values) || row.values.length!==backup.tables[row.table].columns.length+1 || Buffer.byteLength(json(row))>LIMITS.maxRowBytes) fail('ROW');
    row.values.forEach(literal);
    if(row.values[0][0]!=='i') fail('ROW');
    const rowid=BigInt(row.values[0].slice(1));
    if(row.table===previousTable && rowid<=previousRow) fail('ROW');
    previousTable=row.table; previousRow=rowid;
    counts[row.table].rows++;
  }
  const sequenceNames=new Set();
  for(const sequence of backup.sequences) {
    if(!backup.tables.some(t=>t.name===sequence.name) || sequenceNames.has(sequence.name)) fail('SEQUENCE');
    literal('i'+sequence.seq);
    sequenceNames.add(sequence.name);
  }
  if(ledger(backup,backup.migrations).length!==backup.migrations.length) fail('LEDGER');
  return counts;
}
function validateMetadata(metadata) {
  validateIdentity(metadata.identity);
  if(metadata.quiescence?.acknowledged!==true || !/^[A-Za-z0-9_.:-]{1,128}$/.test(metadata.quiescence?.reference??'')) fail('QUIESCENCE_REQUIRED');
}
async function outsideRepository(directory) {
  let current=await realpath(directory);
  while(true) {
    try { await lstat(join(current,'.git')); fail('REPO_DESTINATION'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    const parent=dirname(current);
    if(parent===current) return;
    current=parent;
  }
}
async function privateFile(path,content) {
  const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try { await handle.writeFile(content); await handle.sync(); }
  finally { await handle.close(); }
}
export async function checkDestination(directory) {
  try {
    directory=resolve(directory);
    await outsideRepository(dirname(directory));
    try { await lstat(directory); fail('DESTINATION_EXISTS'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  } catch { fail('ARCHIVE_WRITE_FAILED'); }
}
async function protectedRead(directory,name,maxBytes) {
  const handle=await open(join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const info=await handle.stat();
    if(!info.isFile() || info.nlink!==1 || (info.mode&0o077)!==0 || info.uid!==process.getuid() || info.size>maxBytes) fail('FILE');
    // Bounded reads also reject a file that grows after stat().
    const buffer=Buffer.alloc(Math.min(info.size+1,maxBytes+1));
    let offset=0;
    while(offset<buffer.length) {
      const {bytesRead}=await handle.read(buffer,offset,buffer.length-offset,null);
      if(!bytesRead) break;
      offset+=bytesRead;
    }
    if(offset!==info.size || (await handle.stat()).size!==info.size) fail('FILE');
    return buffer.subarray(0,offset);
  } finally { await handle.close(); }
}
export async function writeArchive(directory,backup,metadata) {
  try {
    validateMetadata(metadata);
    const tables=validateBackup(backup);
    directory=resolve(directory);
    await checkDestination(directory);
    const schema=json({objects:backup.objects,tables:backup.tables,sequences:backup.sequences});
    const data=backup.rows.map(json).join('');
    if(Buffer.byteLength(schema)>LIMITS.maxSchemaBytes || Buffer.byteLength(schema)+Buffer.byteLength(data)>LIMITS.maxBytes) fail('LIMIT');
    const manifest={
      format:'d1-logical-backup',version:VERSION,encoding,tool,
      createdAt:new Date().toISOString(),runtime:process.version,
      identity:metadata.identity,quiescence:metadata.quiescence,
      consistency:'operator-quiescence-required;two-scans-equal',
      files:[schema,data].map((body,i)=>({name:files[i],bytes:Buffer.byteLength(body),sha256:sha256(body)})),
      tables,migrations:backup.migrations,logicalSha256:sha256(json(backup)),
    };
    const manifestBody=json(manifest);
    await mkdir(directory,{mode:0o700}); // No recursive creation, no reuse and no overwrite.
    await privateFile(join(directory,files[0]),schema);
    await privateFile(join(directory,files[1]),data);
    await privateFile(join(directory,'manifest.pending'),manifestBody);
    await rename(join(directory,'manifest.pending'),join(directory,'manifest.json'));
    const handle=await open(directory,constants.O_RDONLY);
    try { await handle.sync(); } finally { await handle.close(); }
    return {manifestSha256:sha256(manifestBody),logicalSha256:manifest.logicalSha256,tables:tables.length,rows:backup.rows.length};
  } catch { fail('ARCHIVE_WRITE_FAILED'); } // Leave incomplete private directory for explicit disposition.
}
export async function readArchive(directory,{identity,manifestSha256}={}) {
  try {
    validateIdentity(identity);
    if(!/^[a-f0-9]{64}$/.test(manifestSha256)) fail('DIGEST');
    directory=resolve(directory);
    const info=await lstat(directory);
    if(!info.isDirectory() || info.isSymbolicLink() || (info.mode&0o077)!==0 || info.uid!==process.getuid()) fail('DIRECTORY');
    await outsideRepository(directory);
    if(json((await readdir(directory)).sort())!==json([...files,'manifest.json'].sort())) fail('FILES');
    const manifestBytes=await protectedRead(directory,'manifest.json',LIMITS.maxSchemaBytes);
    if(sha256(manifestBytes)!==manifestSha256) fail('DIGEST');
    const manifest=JSON.parse(manifestBytes.toString('utf8'));
    validateMetadata(manifest);
    if(manifest.format!=='d1-logical-backup' || manifest.version!==VERSION || manifest.encoding!==encoding || manifest.tool!==tool || manifest.consistency!=='operator-quiescence-required;two-scans-equal' || manifest.identity.accountId!==identity.accountId || manifest.identity.databaseId!==identity.databaseId || !Array.isArray(manifest.files) || manifest.files.length!==2) fail('MANIFEST');
    const bodies=[];
    for(const [i,name] of files.entries()) {
      const item=manifest.files[i];
      if(item.name!==name || !Number.isSafeInteger(item.bytes) || item.bytes<0 || item.bytes>LIMITS.maxBytes || !/^[a-f0-9]{64}$/.test(item.sha256)) fail('FILES');
      const body=await protectedRead(directory,name,i===0?LIMITS.maxSchemaBytes:LIMITS.maxBytes);
      if(body.length!==item.bytes || sha256(body)!==item.sha256) fail('DIGEST');
      bodies.push(body.toString('utf8'));
    }
    if(Buffer.byteLength(bodies.join(''))>LIMITS.maxBytes || !bodies[1].endsWith('\n')) fail('LIMIT');
    const backup={...JSON.parse(bodies[0]),rows:bodies[1].slice(0,-1).split('\n').map(line=>JSON.parse(line)),migrations:manifest.migrations};
    const tables=validateBackup(backup);
    if(json(tables)!==json(manifest.tables) || sha256(json(backup))!==manifest.logicalSha256) fail('LOGICAL_DIGEST');
    return {backup,manifest};
  } catch { fail('ARCHIVE_INVALID'); }
}
