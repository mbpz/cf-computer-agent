import { createHash } from 'node:crypto';

export const VERSION = 1;
export const LIMITS = Object.freeze({maxRows:10_000,maxBytes:16*1024*1024,maxRowBytes:64*1024,maxSchemaBytes:1024*1024,maxSqlBytes:90_000,pageSize:20,maxObjects:1000,maxColumns:128});
export function fail(code) { throw new Error(code); }
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value)+'\n';
export function identifier(name) {
  if(typeof name!=='string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) fail('UNSUPPORTED_SCHEMA');
  return '"'+name+'"';
}
export function validateIdentity(identity) {
  if(!identity || !/^[a-f0-9]{32}$/.test(identity.accountId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(identity.databaseId)) fail('IDENTITY_REQUIRED');
}
function bounds(options) {
  const result={...LIMITS};
  for(const key of Object.keys(LIMITS)) if(options[key]!==undefined) {
    if(!Number.isSafeInteger(options[key]) || options[key]<1 || options[key]>LIMITS[key]) fail('INVALID_LIMIT');
    result[key]=options[key];
  }
  return result;
}
const internal = name => name.startsWith('sqlite_') || name==='_cf_KV' || name==='_cf_METADATA';
const int64 = value => typeof value==='string' && /^(0|-?[1-9][0-9]*)$/.test(value) && BigInt(value)>=-9223372036854775808n && BigInt(value)<=9223372036854775807n;
export function literal(cell) {
  if(typeof cell!=='string') fail('VALUE_ENCODING');
  const type=cell[0], value=cell.slice(1);
  if(type==='n' && value==='') return 'NULL';
  if(type==='i' && int64(value)) return value;
  if(type==='r' && /^-?(?:\d+\.\d*|\d+)(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value))) return `CAST(${value} AS REAL)`;
  if((type==='t' || type==='b') && /^(?:[A-F0-9]{2})*$/.test(value)) return type==='t'?`CAST(X'${value}' AS TEXT)`:`X'${value}'`;
  fail('VALUE_ENCODING');
}
function encoded(column) {
  return `CASE typeof(${column}) WHEN 'null' THEN 'n' WHEN 'integer' THEN 'i'||CAST(${column} AS TEXT) WHEN 'real' THEN 'r'||printf('%!.26g',${column}) WHEN 'text' THEN 't'||hex(CAST(${column} AS BLOB)) WHEN 'blob' THEN 'b'||hex(${column}) END`;
}
async function query(source,sql) {
  if(Buffer.byteLength(sql)>LIMITS.maxSqlBytes) fail('SQL_LIMIT');
  try {
    const rows=await source.query(sql);
    if(!Array.isArray(rows)) fail('SOURCE_QUERY_FAILED');
    return rows;
  } catch { fail('SOURCE_QUERY_FAILED'); } // Never propagate SQL, values or provider diagnostics.
}
async function discover(source,limits) {
  const schema=await query(source,'SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name');
  const tableList=await query(source,'PRAGMA table_list');
  if(schema.length>limits.maxObjects || Buffer.byteLength(json(schema))>limits.maxSchemaBytes) fail('SCHEMA_LIMIT');
  const shadows=new Set(tableList.filter(t=>t.schema==='main' && t.type==='shadow').map(t=>t.name));
  const objects=schema.filter(o=>!internal(o.name) && !shadows.has(o.name) && !internal(o.tbl_name) && !shadows.has(o.tbl_name));
  const tables=[];
  for(const object of objects) {
    identifier(object.name); identifier(object.tbl_name);
    if(!['table','index','view','trigger'].includes(object.type) || typeof object.sql!=='string') fail('UNSUPPORTED_SCHEMA');
    if(object.type!=='table') continue;
    const meta=tableList.find(t=>t.name===object.name && t.schema==='main');
    if(!meta || meta.wr!==0 || !['table','virtual'].includes(meta.type)) fail('UNSUPPORTED_SCHEMA');
    const virtual=meta.type==='virtual';
    // V1 intentionally supports only the current standalone FTS5 grammar; no external/contentless corpus.
    if(virtual && !/^CREATE VIRTUAL TABLE\s+[A-Za-z_][A-Za-z0-9_]*\s+USING fts5\(\s*(?:[A-Za-z_][A-Za-z0-9_]*(?:\s+UNINDEXED)?\s*,\s*)*[A-Za-z_][A-Za-z0-9_]*(?:\s+UNINDEXED)?\s*(?:,\s*tokenize='unicode61 remove_diacritics 2'\s*)?\)$/i.test(object.sql.trim().replace(/;$/,''))) fail('UNSUPPORTED_SCHEMA');
    const columns=await query(source,`PRAGMA table_xinfo(${identifier(object.name)})`);
    if(!columns.length || columns.length>limits.maxColumns || columns.some(c=>['rowid','_rowid_','oid'].includes(c.name.toLowerCase()) || (c.hidden!==0 && !(virtual && c.hidden===1 && [object.name,'rank'].includes(c.name))))) fail('UNSUPPORTED_SCHEMA');
    const names=columns.filter(c=>c.hidden===0).map(c=>c.name);
    names.forEach(identifier);
    tables.push({name:object.name,virtual,columns:names});
  }
  tables.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  const sequences=schema.some(o=>o.name==='sqlite_sequence') ? await query(source,"SELECT name,CAST(seq AS TEXT) AS seq FROM sqlite_sequence ORDER BY name") : [];
  if(sequences.some(s=>!tables.some(t=>t.name===s.name) || !int64(s.seq))) fail('UNSUPPORTED_SCHEMA');
  return {objects,tables,sequences};
}
export function ledger(backup,migrations) {
  const index=backup.tables.findIndex(t=>t.name==='d1_migrations');
  if(index<0 || !Array.isArray(migrations)) fail('MIGRATION_MISMATCH');
  const table=backup.tables[index], id=table.columns.indexOf('id'), name=table.columns.indexOf('name');
  const rows=backup.rows.filter(r=>r.table===index);
  if(id<0 || name<0 || !rows.length || rows.length>migrations.length) fail('MIGRATION_MISMATCH');
  rows.forEach((row,i)=>{
    const file=migrations[i];
    if(!file || !/^[0-9]{4}_[A-Za-z0-9_]+\.sql$/.test(file.name) || !/^[a-f0-9]{64}$/.test(file.sha256) || row.values[id+1]!==`i${i+1}` || row.values[name+1]!==`t${Buffer.from(file.name).toString('hex').toUpperCase()}`) fail('MIGRATION_MISMATCH');
  });
  return migrations.slice(0,rows.length);
}
async function scan(source,options,limits) {
  const discovered=await discover(source,limits), rows=[];
  let bytes=Buffer.byteLength(json(discovered));
  for(const [index,table] of discovered.tables.entries()) {
    const name=identifier(table.name), columns=['_rowid_',...table.columns.map(identifier)];
    const size=columns.map(c=>`coalesce(length(CAST(${c} AS BLOB))*2+40,4)`).join('+');
    const [stats]=await query(source,`SELECT CAST(count(*) AS TEXT) AS n, CAST(coalesce(max(${size}),0) AS TEXT) AS bytes FROM ${name}`);
    if(!stats || !/^\d+$/.test(stats.n) || !/^\d+$/.test(stats.bytes)) fail('SOURCE_QUERY_FAILED');
    if(BigInt(stats.n)+BigInt(rows.length)>BigInt(limits.maxRows) || BigInt(stats.bytes)>BigInt(limits.maxRowBytes)) fail('ROW_LIMIT');
    let cursor=null, count=0;
    while(true) {
      const page=await query(source,`SELECT ${columns.map((c,i)=>`${encoded(c)} AS c${i}`).join(',')} FROM ${name}${cursor===null?'':` WHERE _rowid_ > ${cursor}`} ORDER BY _rowid_ LIMIT ${limits.pageSize}`);
      if(page.length>limits.pageSize) fail('SOURCE_QUERY_FAILED');
      if(!page.length) break;
      for(const item of page) {
        const values=columns.map((_,i)=>item[`c${i}`]);
        values.forEach(literal);
        if(values[0][0]!=='i' || (cursor!==null && BigInt(values[0].slice(1))<=BigInt(cursor))) fail('SOURCE_CHANGED');
        cursor=values[0].slice(1);
        const row={table:index,values}, length=Buffer.byteLength(json(row));
        if(length>limits.maxRowBytes || rows.length>=limits.maxRows) fail('ROW_LIMIT');
        bytes+=length;
        if(bytes>limits.maxBytes) fail('BYTE_LIMIT');
        rows.push(row); count++;
      }
    }
    if(BigInt(count)!==BigInt(stats.n)) fail('SOURCE_CHANGED');
  }
  const backup={...discovered,rows};
  backup.migrations=ledger(backup,options.migrations);
  return backup;
}
export async function collect(source,options={}) {
  if(options.quiescence?.acknowledged!==true || !/^[A-Za-z0-9_.:-]{1,128}$/.test(options.quiescence?.reference??'')) fail('QUIESCENCE_REQUIRED');
  validateIdentity(options.identity);
  if(source.identity && (source.identity.accountId!==options.identity.accountId || source.identity.databaseId!==options.identity.databaseId)) fail('IDENTITY_MISMATCH');
  const limits=bounds(options);
  const first=await scan(source,options,limits), second=await scan(source,options,limits);
  if(sha256(json(first))!==sha256(json(second))) fail('SOURCE_CHANGED');
  // Equal scans detect common drift; they do NOT establish a multi-query snapshot.
  return first;
}
export async function restore(target,backup) {
  if((await target.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT IN ('_cf_KV','_cf_METADATA')").all()).results.length) fail('TARGET_NOT_EMPTY');
  try {
    for(const kind of ['table','index','view']) for(const object of backup.objects.filter(o=>o.type===kind)) await target.prepare(object.sql).run();
    const statements=[target.prepare('PRAGMA defer_foreign_keys=ON')];
    for(const row of backup.rows) {
      const table=backup.tables[row.table];
      const sql=`INSERT INTO ${identifier(table.name)}(_rowid_,${table.columns.map(identifier).join(',')}) VALUES(${row.values.map(literal).join(',')})`;
      if(Buffer.byteLength(sql)>LIMITS.maxSqlBytes) fail('SQL_LIMIT');
      statements.push(target.prepare(sql));
    }
    if(backup.sequences.length) {
      statements.push(target.prepare('DELETE FROM sqlite_sequence'));
      for(const sequence of backup.sequences) statements.push(target.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,CAST(? AS INTEGER))').bind(sequence.name,sequence.seq));
    }
    await target.batch(statements);
    if((await target.prepare('PRAGMA foreign_key_check').all()).results.length) fail('FOREIGN_KEY_CHECK');
    for(const table of backup.tables.filter(t=>t.virtual)) await target.prepare(`INSERT INTO ${identifier(table.name)}(${identifier(table.name)}) VALUES('integrity-check')`).run();
    for(const object of backup.objects.filter(o=>o.type==='trigger')) await target.prepare(object.sql).run();
    const actual=await scan({query:async sql=>(await target.prepare(sql).all()).results},{migrations:backup.migrations},LIMITS);
    if(sha256(json(actual))!==sha256(json(backup))) fail('RESTORE_MISMATCH');
    return {logicalSha256:sha256(json(actual)),tables:backup.tables.length,rows:backup.rows.length};
  } catch { fail('RESTORE_FAILED'); }
}
