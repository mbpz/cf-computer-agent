import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as core from './core.mjs';
import { createReadSource } from './transport.mjs';
import { writeArchive, readArchive } from './archive.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { Miniflare } = require('miniflare');
const migrations = await readD1Migrations(new URL('../../migrations/', import.meta.url).pathname);
const files = await Promise.all(migrations.map(async m => ({name:m.name, sha256:createHash('sha256').update(await readFile(new URL('../../migrations/'+m.name,import.meta.url))).digest('hex')})));
const identity = {accountId:'a'.repeat(32), databaseId:'00000000-0000-4000-8000-000000000001'};
const options = {identity, migrations:files, quiescence:{acknowledged:true,reference:'synthetic-offline-only'}};
async function fixture(t, prefix=32) {
  const mf = new Miniflare({modules:true,compatibilityDate:'2026-07-26',script:'export default {fetch(){return new Response("local-only")}}',d1Databases:{DB:'source',TARGET:'target'}});
  t.after(()=>mf.dispose());
  const db = await mf.getD1Database('DB'), target = await mf.getD1Database('TARGET');
  await db.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT NOT NULL)').run();
  for(const m of migrations.slice(0,prefix)) await db.batch([...m.queries.map(q=>db.prepare(q)),db.prepare('INSERT INTO d1_migrations(name,applied_at) VALUES(?,?)').bind(m.name,'2026-09-18')]);
  return {db,target,source:{query:async sql=>(await db.prepare(sql).all()).results}};
}
test('missing quiescence rejects before reading a source',async()=>{
  let reads=0;
  await assert.rejects(()=>core.collect({query:async()=>{reads++;return[]}}, {...options,quiescence:null}), /QUIESCENCE_REQUIRED/);
  assert.equal(reads,0);
});
test('mismatched transport identity rejects before any source request',async()=>{
  let reads=0;
  const source={identity:{...identity,databaseId:'00000000-0000-4000-8000-000000000002'},query:async()=>{reads++;throw new Error('must not query')}};
  await assert.rejects(()=>core.collect(source,options),/IDENTITY_MISMATCH/);
  assert.equal(reads,0);
});
for(const prefix of [32,51]) test(`prefix ${prefix}: lossless paginated collect/restore including FTS and value types`,async t=>{
  const {db,target,source}=await fixture(t,prefix);
  await db.prepare('CREATE TABLE codec_values(i,r,t,b,n)').run();
  await db.prepare("INSERT INTO codec_values(rowid,i,r,t,b,n) VALUES(-9,-9223372036854775808,0.1,CAST(X'410042' AS TEXT),X'00FF',NULL),(1,9223372036854775807,4.9406564584124654e-324,'中文',X'',NULL),(7,9007199254740993,1.7976931348623157e308,'quote''',X'FEED',NULL),(300,42,-1.7976931348623157e308,'last',X'01',NULL)").run();
  await db.prepare('CREATE TABLE highwater(id INTEGER PRIMARY KEY AUTOINCREMENT,n TEXT)').run();
  await db.prepare("INSERT INTO highwater VALUES(9007199254740993,'gone'),(3,'retained')").run();
  await db.prepare('DELETE FROM highwater WHERE id>3').run();
  await db.prepare("INSERT INTO chunks_fts(rowid,chunk_id,title,summary,tags,body,code) VALUES(99,'s','Sharedalpha','','','Sharedalpha',''),(201,'p','Privatebeta','','','Privatebeta','')").run();
  await db.prepare("INSERT INTO chunks_fts_shared(rowid,chunk_id,title,summary,tags,body,code) VALUES(99,'s','Sharedalpha','','','Sharedalpha','')").run();
  const backup=await core.collect(source,{...options,pageSize:2});
  assert.equal(backup.migrations.length,prefix);
  assert.equal(backup.tables.some(t=>t.name==='chunks_fts_data'),false);
  await core.restore(target,backup);
  const values=(await target.prepare('SELECT CAST(i AS TEXT) i,typeof(r) rtype,hex(t) t,hex(b) b,n FROM codec_values WHERE rowid=-9').all()).results;
  assert.deepEqual(values,[{i:'-9223372036854775808',rtype:'real',t:'410042',b:'00FF',n:null}]);
  assert.equal((await target.prepare('SELECT CAST(i AS TEXT) i FROM codec_values WHERE rowid=7').first()).i,'9007199254740993');
  const shared=await target.prepare("SELECT rowid FROM chunks_fts_shared WHERE chunks_fts_shared MATCH 'Privatebeta'").all();
  assert.deepEqual(shared.results,[]);
  assert.deepEqual((await target.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'Privatebeta'").all()).results,[{rowid:201}]);
  await target.prepare("INSERT INTO highwater(n) VALUES('next')").run();
  assert.equal((await target.prepare('SELECT CAST(MAX(id) AS TEXT) id FROM highwater').first()).id,'9007199254740994');
  await assert.rejects(()=>core.restore(target,backup),/TARGET_NOT_EMPTY/);
  assert.deepEqual(await core.collect(source,{...options,pageSize:2}),backup);
});
test('schema and value exclusions fail closed',async t=>{
  const {db,source}=await fixture(t);
  for(const [ddl,code] of [
    ['CREATE TABLE unsupported(k TEXT PRIMARY KEY) WITHOUT ROWID','UNSUPPORTED_SCHEMA'],
    ['CREATE TABLE unsupported(k TEXT, g TEXT GENERATED ALWAYS AS (k) VIRTUAL)','UNSUPPORTED_SCHEMA'],
    ["CREATE VIRTUAL TABLE unsupported USING fts5(body, content='')",'UNSUPPORTED_SCHEMA'],
    ['CREATE TABLE unsupported(_rowid_ TEXT)','UNSUPPORTED_SCHEMA'],
  ]) {
    await db.prepare(ddl).run();
    await assert.rejects(()=>core.collect(source,options),new RegExp(code));
    await db.prepare('DROP TABLE unsupported').run();
  }
  await db.prepare('CREATE TABLE too_large(v TEXT)').run();
  await db.prepare("INSERT INTO too_large VALUES(replace(hex(zeroblob(40000)),'0','x'))").run();
  await assert.rejects(()=>core.collect(source,options),/ROW_LIMIT/);
});
test('ledger mismatch, row budget, non-finite real and source drift are rejected',async t=>{
  const {db,source}=await fixture(t);
  await assert.rejects(()=>core.collect(source,{...options,maxRows:1}),/ROW_LIMIT/);
  await assert.rejects(()=>core.collect(source,{...options,migrations:files.slice(0,31)}),/MIGRATION_MISMATCH/);
  await db.prepare('CREATE TABLE drift(v)').run();
  await db.prepare('INSERT INTO drift VALUES(1e999)').run();
  await assert.rejects(()=>core.collect(source,options),/VALUE_ENCODING/);
  await db.prepare('DELETE FROM drift').run();
  await db.prepare("INSERT INTO drift(rowid,v) VALUES(1,'old'),(2,'old'),(3,'old')").run();
  let changed=false;
  const changing={query:async sql=>{const rows=await source.query(sql); if(!changed && sql.includes('FROM "drift"') && sql.includes('ORDER BY')) {changed=true; await db.prepare("UPDATE drift SET v='new' WHERE rowid IN(1,3)").run();} return rows;}};
  await assert.rejects(()=>core.collect(changing,{...options,pageSize:2}),/SOURCE_CHANGED/);
});
test('51: HTTP-shaped synthetic collection, sealed archive and restored triggers preserve owner separation',async t=>{
  const {db,target}=await fixture(t,51);
  for(const owner of ['a','b']) {
    await db.prepare("INSERT INTO members(id,access_sub,email,role,status,created_at,updated_at) VALUES(?,?,?,'contributor','active','2026-09-18','2026-09-18')").bind(owner,'sub-'+owner,owner+'@example.test').run();
    await db.prepare("INSERT INTO tasks(id,member_id,title,notes,status,progress,priority,created_at,updated_at) VALUES(?,?,?,'','todo',0,'medium',1000,1000)").bind('task-'+owner,owner,'private-'+owner).run();
  }
  await db.prepare("INSERT INTO calendar_events(id,member_id,client_key,kind,title,starts_at,ends_at,timezone,status,task_id,created_at,updated_at) VALUES('event','a','event-key','event','Keep title',1000,2000,'UTC','scheduled','task-a',1000,1000)").run();
  await db.prepare("INSERT INTO discussion_threads(id,context_kind,context_id,creator_member_id,created_at,updated_at) VALUES('thread','task','task-a','a',1000,1000)").run();
  let calls=0;
  // The HTTP boundary is a test double; SQL execution and encoding use real local Workerd/D1.
  const source=createReadSource({identity,token:'synthetic-only',fetch:async(_url,init)=>{
    calls++;
    const {sql}=JSON.parse(init.body);
    return Response.json({success:true,errors:[],result:[{...(await db.prepare(sql).all()),meta:{rows_written:0,changed_db:false}}]});
  }});
  const snapshot=await core.collect(source,options);
  assert.ok(calls>100);
  const parent=await mkdtemp(join(tmpdir(),'d1-roundtrip-test-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const directory=join(parent,'archive');
  const result=await writeArchive(directory,snapshot,options);
  const {backup}=await readArchive(directory,{identity,manifestSha256:result.manifestSha256});
  await core.restore(target,backup);
  assert.deepEqual((await target.prepare('SELECT principal_id,thread_id FROM discussion_thread_access').all()).results,[{principal_id:'a',thread_id:'thread'}]);
  assert.equal((await target.prepare('SELECT count(*) n FROM task_status_notification_intents').first()).n,0);
  await target.prepare("UPDATE tasks SET status='doing',status_version=1 WHERE id='task-a'").run();
  assert.deepEqual((await target.prepare('SELECT recipient_member_id,status FROM task_status_notification_intents').all()).results,[{recipient_member_id:'a',status:'doing'}]);
  await target.prepare("DELETE FROM tasks WHERE id='task-a' AND member_id='a'").run();
  assert.deepEqual(await target.prepare('SELECT member_id,title,task_id FROM calendar_events').first(),{member_id:'a',title:'Keep title',task_id:null});
  assert.equal((await target.prepare('SELECT count(*) n FROM discussion_thread_access').first()).n,0);
  assert.deepEqual(await target.prepare('SELECT id,member_id,title FROM tasks').first(),{id:'task-b',member_id:'b',title:'private-b'});
  assert.deepEqual((await target.prepare('PRAGMA foreign_key_check').all()).results,[]);
});
test('broken foreign key rolls back the whole restore data batch; disposable schema is not reused',async t=>{
  const {db,target,source}=await fixture(t);
  await db.prepare("INSERT INTO members(id,access_sub,email,role,status,created_at,updated_at) VALUES('a','a','a@example.test','contributor','active','2026-09-18','2026-09-18')").run();
  await db.prepare("INSERT INTO tasks(id,member_id,title,notes,status,progress,priority,created_at,updated_at) VALUES('t','a','title','','todo',0,'medium',1,1)").run();
  const backup=await core.collect(source,options);
  const index=backup.tables.findIndex(t=>t.name==='tasks');
  const member=backup.tables[index].columns.indexOf('member_id');
  backup.rows.find(r=>r.table===index).values[member+1]='t6D697373696E67';
  await assert.rejects(()=>core.restore(target,backup),/RESTORE_FAILED/);
  assert.equal((await target.prepare('SELECT count(*) n FROM members').first()).n,0);
  assert.equal((await target.prepare('SELECT count(*) n FROM d1_migrations').first()).n,0);
  await assert.rejects(()=>core.restore(target,backup),/TARGET_NOT_EMPTY/);
});
