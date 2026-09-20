import { parseArgs } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { collect, restore, sha256, json, fail, validateIdentity } from './core.mjs';
import { writeArchive, readArchive, checkDestination } from './archive.mjs';
import { createReadSource } from './transport.mjs';

const safeErrors=new Set(['USAGE','CAPTURE_APPROVAL_REQUIRED','READ_TOKEN_REQUIRED','IDENTITY_REQUIRED','IDENTITY_MISMATCH','MIGRATION_MISMATCH','QUIESCENCE_REQUIRED','INVALID_LIMIT','SOURCE_QUERY_FAILED','SOURCE_CHANGED','ROW_LIMIT','BYTE_LIMIT','SCHEMA_LIMIT','SQL_LIMIT','UNSUPPORTED_SCHEMA','VALUE_ENCODING','TARGET_NOT_EMPTY','RESTORE_FAILED','ARCHIVE_WRITE_FAILED','ARCHIVE_INVALID','READ_QUERY_REJECTED','READ_REQUEST_FAILED','READ_BUDGET_EXCEEDED']);
const stringOptions=['account','database','output','archive','manifest-sha256','migration-manifest-sha256','maintenance-reference'];
const booleanOptions=['acknowledge-remote-read','acknowledge-quiescence'];
const accepted={
  capture:['account','database','output','migration-manifest-sha256','maintenance-reference',...booleanOptions],
  verify:['account','database','archive','manifest-sha256'],
  'restore-check':['account','database','archive','manifest-sha256'],
  'migration-manifest':[],
};
async function migrationFiles() {
  const directory=new URL('../../migrations/',import.meta.url);
  const names=(await readdir(directory)).filter(n=>n.endsWith('.sql')).sort();
  const files=[];
  for(const [i,name] of names.entries()) {
    if(!new RegExp(`^${String(i+1).padStart(4,'0')}_[A-Za-z0-9_]+\\.sql$`).test(name)) fail('MIGRATION_MISMATCH');
    files.push({name,sha256:sha256(await readFile(new URL(name,directory)))});
  }
  if(!files.length) fail('MIGRATION_MISMATCH');
  return files;
}
async function main() {
  const [command,...args]=process.argv.slice(2);
  if(!Object.hasOwn(accepted,command)) fail('USAGE');
  let values;
  try {
    ({values}=parseArgs({args,strict:true,allowPositionals:false,options:Object.fromEntries([...stringOptions.map(k=>[k,{type:'string'}]),...booleanOptions.map(k=>[k,{type:'boolean'}])])}));
  } catch { fail('USAGE'); }
  if(Object.keys(values).some(key=>!accepted[command].includes(key))) fail('USAGE');
  if(command==='migration-manifest') {
    const files=await migrationFiles();
    return {mode:command,files,sha256:sha256(json(files))};
  }
  const identity={accountId:values.account,databaseId:values.database};
  if(command==='capture') {
    if(!values['acknowledge-remote-read'] || !values['acknowledge-quiescence'] || !values['maintenance-reference'] || !values['migration-manifest-sha256']) fail('CAPTURE_APPROVAL_REQUIRED');
    if(!values.output) fail('USAGE');
    validateIdentity(identity);
    const migrations=await migrationFiles();
    if(sha256(json(migrations))!==values['migration-manifest-sha256']) fail('MIGRATION_MISMATCH');
    await checkDestination(values.output);
    const source=createReadSource({identity,token:process.env.CLOUDFLARE_D1_BACKUP_READ_TOKEN});
    const quiescence={acknowledged:true,reference:values['maintenance-reference']};
    const backup=await collect(source,{identity,migrations,quiescence});
    return {mode:command,...await writeArchive(values.output,backup,{identity,quiescence})};
  }
  if(!values.archive || !values['manifest-sha256'] || !values.account || !values.database) fail('USAGE');
  const {backup,manifest}=await readArchive(values.archive,{identity,manifestSha256:values['manifest-sha256']});
  if(command==='verify') return {mode:command,logicalSha256:manifest.logicalSha256,tables:backup.tables.length,rows:backup.rows.length};
  // Intentionally no target/persist/remote option, no application bindings, and no source credentials.
  const require=createRequire(import.meta.url);
  const {Miniflare,Log,LogLevel}=require('miniflare');
  const runtime=new Miniflare({modules:true,compatibilityDate:'2026-07-26',log:new Log(LogLevel.NONE),script:'export default {fetch(){return new Response("isolated restore check")}}',d1Databases:{DB:'restore-check'}});
  try { return {mode:command,...await restore(await runtime.getD1Database('DB'),backup)}; }
  finally { await runtime.dispose(); }
}

try { console.log(JSON.stringify(await main())); }
catch(error) {
  console.error(safeErrors.has(error?.message)?error.message:'BACKUP_FAILED');
  process.exitCode=1;
}
