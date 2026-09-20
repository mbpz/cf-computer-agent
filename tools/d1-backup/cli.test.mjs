import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeArchive } from './archive.mjs';

const identity={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001'};
const cli=new URL('./cli.mjs',import.meta.url).pathname;
function run(args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,...args],{env:{...process.env,CLOUDFLARE_D1_BACKUP_READ_TOKEN:'synthetic-token'},timeout:40_000});
    let stdout='',stderr='';
    child.stdout.on('data',part=>stdout+=part);
    child.stderr.on('data',part=>stderr+=part);
    child.on('error',reject);
    child.on('close',status=>resolve({status,stdout,stderr}));
  });
}
test('CLI rejects remote restore, unsafe flags and unacknowledged capture before network use',async()=>{
  for(const args of [['restore-remote'],['restore-check','--target','production'],['capture','--account',identity.accountId,'--database',identity.databaseId,'--output','/not-used'],['verify','--secret','PRIVATE-CONTENT']]) {
    const result=await run(args);
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.match(result.stderr,/^(USAGE|CAPTURE_APPROVAL_REQUIRED)\n$/);
    assert.equal(result.stderr.includes('PRIVATE-CONTENT'),false);
  }
});
test('CLI verifies a sealed archive and restores only to a fresh disposable local D1',async t=>{
  const parent=await mkdtemp(join(tmpdir(),'d1-cli-test-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const directory=join(parent,'backup');
  const backup={objects:[{type:'table',name:'d1_migrations',tbl_name:'d1_migrations',sql:'CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT)'}],tables:[{name:'d1_migrations',virtual:false,columns:['id','name']}],sequences:[],rows:[{table:0,values:['i1','i1','t303030315F696E69742E73716C']}],migrations:[{name:'0001_init.sql',sha256:'0'.repeat(64)}]};
  const sealed=await writeArchive(directory,backup,{identity,quiescence:{acknowledged:true,reference:'synthetic-only'}});
  const args=['--archive',directory,'--manifest-sha256',sealed.manifestSha256,'--account',identity.accountId,'--database',identity.databaseId];
  for(const command of ['verify','restore-check']) {
    const result=await run([command,...args]);
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stderr,'');
    const report=JSON.parse(result.stdout);
    assert.equal(report.rows,1); assert.equal(report.tables,1);
    assert.equal(report.logicalSha256,sealed.logicalSha256);
    assert.equal(report.mode,command);
    assert.equal(result.stdout.includes('0001_init.sql'),false);
  }
});
