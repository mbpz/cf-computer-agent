import test from 'node:test';
import { request } from 'node:http';
import assert from 'node:assert/strict';
import { startBrowserAcceptance } from './helpers/connector-browser-harness.mjs';
const origin='https://browser-acceptance.example';
const setup=async t=>{const h=await startBrowserAcceptance({allowedOrigin:origin,verifiedAssets:new Map([['wasm',new Uint8Array([1,2,3])]])});t.after(()=>h.close());return h;};
const headers=h=>({origin,'x-harness-key':h.capability});
// These are real HTTP boundaries. Tiny trusted asset bytes test transport, not image integrity.
test('only exact HTTPS origin plus an ephemeral capability can read the fixed asset route',async t=>{
 const h=await setup(t);
 for(const extra of [{},{origin},{...headers(h),origin:'https://foreign.example'},{...headers(h),'x-harness-key':'A'.repeat(43)}]){
  const r=await fetch(h.url+'/asset/wasm',{headers:extra});assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
 const r=await fetch(h.url+'/asset/wasm',{headers:headers(h)});assert.equal(r.status,200);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3]);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 for(const path of ['/asset/unknown','/asset/wasm?key=x','/api/anything'])assert.equal((await fetch(h.url+path,{headers:headers(h)})).status,404);
 const wrongHost=await new Promise((resolve,reject)=>{const req=request(h.url+'/asset/wasm',{headers:{...headers(h),host:'foreign.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(wrongHost,403);
});
test('preflight is bounded and capability control page cannot be read from the preview origin',async t=>{
 const h=await setup(t);
 const r=await fetch(h.url+'/start',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,x-harness-key'}});assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
 assert.equal((await fetch(h.url+'/start',{method:'OPTIONS',headers:{origin,'access-control-request-method':'DELETE'}})).status,403);
 assert.equal((await fetch(h.url+'/',{headers:{origin}})).status,403);
 const control=await fetch(h.url+'/');assert.equal(control.headers.get('access-control-allow-origin'),null);assert.ok((await control.text()).includes(h.capability));
});
test('one explicit start returns real authority; duplicate start and malformed renewal never replace it', {timeout:20000},async t=>{
 const h=await setup(t), opts={method:'POST',headers:{...headers(h),'content-type':'application/json'}};
 assert.equal((await fetch(h.url+'/start',{...opts,body:'{"unexpected":true}'})).status,400);
 const r=await fetch(h.url+'/start',opts);assert.equal(r.status,201);const config=await r.json();assert.match(config.url,/^ws:\/\/127\.0\.0\.1:\d+\/connector$/);assert.ok(config.ticket.length>100);assert.match(config.pairingCode,/^[A-Za-z0-9_-]{43}$/);
 assert.equal((await fetch(h.url+'/start',opts)).status,409);
 assert.equal((await fetch(h.url+'/renew',{...opts,body:JSON.stringify({leaseId:'x',extra:true})})).status,400);
 assert.equal((await fetch(h.url+'/renew',{...opts,body:'x'.repeat(513)})).status,413);
 await h.close();await assert.rejects(fetch(config.url.replace('ws:','http:').replace('/connector','/identity')));
});
