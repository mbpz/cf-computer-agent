import test from 'node:test';
import assert from 'node:assert/strict';
import { createReadSource } from './transport.mjs';

const identity={accountId:'a'.repeat(32),databaseId:'00000000-0000-4000-8000-000000000001'};
const envelope=(rows=[])=>({success:true,errors:[],result:[{success:true,meta:{rows_written:0,changed_db:false},results:rows}]});
test('read transport pins account/database, disables redirect and preserves string encodings',async()=>{
  let call;
  const source=createReadSource({identity,token:'synthetic-token',fetch:async(url,init)=>{call={url,init};return Response.json(envelope([{c0:'i9223372036854775807'}]))}});
  assert.deepEqual(await source.query('SELECT 1'),[{c0:'i9223372036854775807'}]);
  assert.equal(call.url,`https://api.cloudflare.com/client/v4/accounts/${identity.accountId}/d1/database/${identity.databaseId}/query`);
  assert.equal(call.init.method,'POST');
  assert.equal(call.init.redirect,'error');
  assert.deepEqual(JSON.parse(call.init.body),{sql:'SELECT 1'});
  assert.equal(call.init.headers.Authorization,'Bearer synthetic-token');
});
test('mutation, multiple statements and unapproved PRAGMAs never reach transport',async()=>{
  let calls=0;
  const source=createReadSource({identity,token:'synthetic-token',fetch:async()=>{calls++;return Response.json(envelope())}});
  for(const sql of ['DELETE FROM x','SELECT 1; DELETE FROM x','PRAGMA foreign_keys=OFF','PRAGMA wal_checkpoint','WITH x AS (SELECT 1) DELETE FROM x','SELECT load_extension(1)','SELECT 1 -- comment']) await assert.rejects(()=>source.query(sql),/READ_QUERY_REJECTED/);
  assert.equal(calls,0);
});
test('HTTP/envelope/SQL errors expose no diagnostics and are not retried',async()=>{
  const secret='PRIVATE-DATA-DO-NOT-PRINT';
  for(const response of [
    ()=>new Response(secret,{status:403}),
    ()=>new Response(secret,{status:429}),
    ()=>new Response(secret),
    ()=>Response.json({success:false,errors:[{message:secret}]}),
    ()=>Response.json({...envelope(),result:[{success:false,error:secret}]}),
    ()=>Response.json({...envelope(),result:[]}),
    ()=>Response.json({...envelope(),result:[{success:true,results:[],meta:{rows_written:1,changed_db:true}}]}),
  ]) {
    let calls=0;
    const source=createReadSource({identity,token:secret,fetch:async()=>{calls++;return response()}});
    await assert.rejects(()=>source.query('SELECT 1'),e=>e.message==='READ_REQUEST_FAILED' && !e.stack.includes(secret));
    assert.equal(calls,1);
  }
});
test('response stream and request count have enforced bounds',async()=>{
  const source=createReadSource({identity,token:'synthetic-token',maxResponseBytes:100,fetch:async()=>new Response('x'.repeat(101))});
  await assert.rejects(()=>source.query('SELECT 1'),/READ_REQUEST_FAILED/);
  let calls=0;
  const limited=createReadSource({identity,token:'synthetic-token',maxRequests:1,fetch:async()=>{calls++;return Response.json(envelope())}});
  await limited.query('SELECT 1');
  await assert.rejects(()=>limited.query('SELECT 1'),/READ_BUDGET_EXCEEDED/);
  assert.equal(calls,1);
});
test('timeout aborts a stalled request and redacts the error',async()=>{
  const source=createReadSource({identity,token:'synthetic-token',timeoutMs:20,fetch:async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('sensitive transport error')),{once:true}))});
  await assert.rejects(()=>source.query('SELECT 1'),e=>e.message==='READ_REQUEST_FAILED');
});
