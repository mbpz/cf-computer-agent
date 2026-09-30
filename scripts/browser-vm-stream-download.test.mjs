import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileDownload} from '../frontend/features/environments/files/stream-download.mjs';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function fixture({size=3*1048576+7,write=async()=>{},close=async()=>{}}={}){
 const calls=[],writes=[];let aborted=0,closed=0;
 return{calls,writes,get aborted(){return aborted;},get closed(){return closed;},
 sink:{async write(bytes){writes.push(bytes.length);await write(bytes);},async close(){closed++;await close();},async abort(){aborted++;}},
 async file(input){calls.push(input);if(input.op==='downloadBegin')return{token:'lease',size,chunkSize:1048576};if(input.op==='downloadChunk'){const length=Math.min(1048576,size-input.offset);return{offset:input.offset,bytes:new Uint8Array(length).fill(42),done:input.offset+length===size};}return{ok:true};}
 };
}
test('stream awaits each sink write, never collects whole file, and releases before commit',async()=>{
 const pending=deferred();const f=fixture({write:()=>pending.promise});const progress=[];
 const result=writeFileDownload({file:f.file,path:'/large',openSink:()=>f.sink,onProgress:p=>progress.push(p)});
 await new Promise(r=>setImmediate(r));assert.equal(f.calls.filter(x=>x.op==='downloadChunk').length,1);assert.equal(f.closed,0);
 pending.resolve();assert.deepEqual(await result,{bytes:3*1048576+7,committed:true});assert.deepEqual(f.writes,[1048576,1048576,1048576,7]);assert.equal(f.calls.at(-1).op,'downloadEnd');assert.equal(f.closed,1);assert.equal(f.aborted,0);assert.equal(progress.at(-1).written,3*1048576+7);
});
test('cancel during sink write aborts output and releases lease without another chunk',async()=>{
 const wait=deferred(),abort=new AbortController(),f=fixture({write:()=>wait.promise});
 const result=writeFileDownload({file:f.file,path:'/a',openSink:()=>f.sink,signal:abort.signal});
 await new Promise(r=>setImmediate(r));abort.abort();await assert.rejects(result,/DOWNLOAD_CANCELLED/);
 assert.equal(f.aborted,1);assert.equal(f.closed,0);assert.deepEqual(f.calls.map(x=>x.op),['downloadBegin','downloadChunk','downloadEnd']);wait.resolve();
});
test('picker cancellation or late account exit never starts a VM export',async()=>{
 const f=fixture(),wait=deferred(),abort=new AbortController();
 const result=writeFileDownload({file:f.file,path:'/a',openSink:()=>wait.promise,signal:abort.signal});abort.abort();wait.resolve(f.sink);await assert.rejects(result,/DOWNLOAD_CANCELLED/);assert.equal(f.calls.length,0);assert.equal(f.aborted,1);
 await assert.rejects(writeFileDownload({file:f.file,path:'/a',openSink:()=>Promise.reject(Object.assign(Error('dismissed'),{name:'AbortError'}))}),/DOWNLOAD_CANCELLED/);
});
test('disk write failure, expired lease and invalid chunk abort without committing partial output',async()=>{
 for(const mode of ['disk','expiry','wrong-offset','premature-eof']){
  const f=fixture({write:async()=>{if(mode==='disk')throw Error('quota');}});
  const file=async input=>{const result=await f.file(input);if(mode==='expiry'&&input.op==='downloadEnd')throw Error('FILE_DOWNLOAD_EXPIRED');if(input.op==='downloadChunk'&&mode==='wrong-offset')return{...result,offset:99};if(input.op==='downloadChunk'&&mode==='premature-eof')return{...result,done:true};return result;};
  await assert.rejects(writeFileDownload({file,path:'/a',openSink:()=>f.sink}));assert.equal(f.closed,0);assert.equal(f.aborted,1);assert.equal(f.calls.at(-1).op,'downloadEnd');
 }
});
test('empty file commits zero bytes; close failure aborts; revoked account on final release cannot close sink',async()=>{
 const f=fixture({size:0});await writeFileDownload({file:f.file,path:'/empty',openSink:()=>f.sink});assert.equal(f.writes.length,0);assert.equal(f.closed,1);
 const bad=fixture({close:async()=>{throw Error('disk');}});await assert.rejects(writeFileDownload({file:bad.file,path:'/a',openSink:()=>bad.sink}));assert.equal(bad.aborted,1);
 const revoked=fixture(),abort=new AbortController();await assert.rejects(writeFileDownload({file:async input=>{const result=await revoked.file(input);if(input.op==='downloadEnd')abort.abort();return result;},path:'/a',openSink:()=>revoked.sink,signal:abort.signal}),/DOWNLOAD_CANCELLED/);assert.equal(revoked.closed,0);
});
