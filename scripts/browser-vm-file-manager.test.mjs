import test from 'node:test';
import assert from 'node:assert/strict';
import {createFileManager} from '../frontend/features/environments/files/file-manager.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
const listing=(path='/',page=1,pageSize=20)=>({path,page,pageSize,total:0,pages:1,entries:[]});
function fixture(handler){let state={status:'running',environmentId:'a'};const listeners=new Set(),calls=[];
 const runtime={getSnapshot:()=>state,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async file(input){calls.push(input);return handler(input);}};
 const manager=createFileManager(runtime);return{manager,calls,change(patch){state={...state,...patch};for(const fn of listeners)fn();}};
}
test('manager paginates the shared root and serializes mutation then refresh without shell commands',async()=>{
 const f=fixture(input=>input.op==='list'?listing(input.path,input.page,input.pageSize):{ok:true});
 await f.manager.load('/',1,50);assert.equal(f.manager.getSnapshot().pageSize,50);
 await f.manager.mkdir('文档');assert.deepEqual(f.calls[1],{op:'mkdir',path:'/文档'});assert.equal(f.calls[2].op,'list');
 await f.manager.rename('a','b');assert.deepEqual(f.calls[3],{op:'rename',path:'/a',destination:'/b'});
 await f.manager.remove('b');assert.equal(f.calls[5].op,'remove');
 await f.manager.mkdir('../escape');assert.equal(f.calls.length,7);assert.equal(f.manager.getSnapshot().error,'INVALID_PATH');
 f.manager.dispose();
});
test('editing conflict preserves draft, forbids stale save and allows explicit reload or save as',async()=>{
 let reads=0;const f=fixture(input=>{if(input.op==='list')return listing();if(input.op==='readText')return{text:++reads===1?'first':'guest',version:'v'+reads};if(input.op==='saveText')throw Error('FILE_CONFLICT');return{ok:true};});
 await f.manager.open('a');f.manager.edit('my draft');await f.manager.save();assert.equal(f.manager.getSnapshot().editor.text,'my draft');assert.equal(f.manager.getSnapshot().editor.conflict,true);
 const count=f.calls.length;await f.manager.save();assert.equal(f.calls.length,count);
 await f.manager.saveAs('copy');assert.equal(f.calls.at(-2).op,'upload');assert.equal(new TextDecoder().decode(f.calls.at(-2).bytes),'my draft');
 await f.manager.open('a');assert.equal(f.manager.getSnapshot().editor.text,'guest');f.manager.dispose();
});
test('canceled read never repopulates private content; account invalidation clears everything',async()=>{
 const read=deferred();const f=fixture(()=>read.promise);const task=f.manager.open('private');await Promise.resolve();f.manager.cancel();read.resolve({text:'secret',version:'v'});await task;
 assert.equal(f.manager.getSnapshot().editor,null);assert.equal(f.manager.getSnapshot().busy,false);
 const read2=deferred();const g=fixture(()=>read2.promise);const task2=g.manager.open('private');g.change({status:'stopping'});read2.resolve({text:'secret',version:'v'});await task2;
 assert.equal(g.manager.getSnapshot().available,false);assert.equal(g.manager.getSnapshot().editor,null);assert.deepEqual(g.manager.getSnapshot().entries,[]);g.manager.dispose();f.manager.dispose();
});
test('batch cancel settles the sent write once, does not start the next file or promise rollback',async()=>{
 const write=deferred();const f=fixture(input=>input.op==='upload'?write.promise:listing());
 const files=['a','b'].map(name=>({name,size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer}));const work=f.manager.upload(files);
 await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.length,1);f.manager.cancel();write.resolve({ok:true});await work;
 assert.equal(f.calls.filter(x=>x.op==='upload').length,1);assert.deepEqual(f.manager.getSnapshot().results.map(x=>x.status),['done','cancelled']);f.manager.dispose();
});
test('upload reports per-item size/space failures and never sends oversized or changed data',async()=>{
 const f=fixture(input=>{if(input.op==='upload')throw Error('NO_SPACE');return listing();});
 await f.manager.upload([{name:'large',size:20971521,arrayBuffer:()=>assert.fail('must not load oversized')},{name:'a',size:1,arrayBuffer:async()=>new Uint8Array([1]).buffer}]);
 assert.deepEqual(f.manager.getSnapshot().results.map(x=>x.error),['FILE_TOO_LARGE','NO_SPACE']);assert.equal(f.calls.filter(x=>x.op==='upload').length,1);f.manager.dispose();
});
test('failed write is not replayed and successful write with failed refresh remains acknowledged',async()=>{
 let writes=0;const f=fixture(input=>{if(input.op==='list')throw Error('unsafe private detail');writes++;return{ok:true};});
 await f.manager.mkdir('a');assert.equal(writes,1);assert.equal(f.manager.getSnapshot().notice,'WRITE_DONE_REFRESH_FAILED');assert.equal(f.manager.getSnapshot().error,'FILE_OPERATION_FAILED');await f.manager.load();assert.equal(writes,1);f.manager.dispose();
});

test('stream download progress is account-owned, cancellation aborts sink and clears on invalidation',async()=>{
 const pending=deferred();let aborts=0,closes=0;
 const f=fixture(input=>input.op==='downloadBegin'?{token:'lease',size:1,chunkSize:1048576}:input.op==='downloadChunk'?{offset:0,bytes:new Uint8Array([42]),done:true}:{ok:true});
 const task=f.manager.downloadTo('a',()=>({write:()=>pending.promise,async close(){closes++;},async abort(){aborts++;}}));await new Promise(r=>setImmediate(r));assert.deepEqual(f.manager.getSnapshot().download,{written:0,total:1});
 f.manager.cancel();await task;assert.equal(aborts,1);assert.equal(closes,0);assert.equal(f.manager.getSnapshot().notice,'DOWNLOAD_CANCELLED');assert.equal(f.calls.at(-1).op,'downloadEnd');
 f.change({status:'closed',environmentId:null});assert.equal(f.manager.getSnapshot().download,null);pending.resolve();f.manager.dispose();
});
test('account closes pending picker: late sink is aborted without file reads or completion notice',async()=>{
 const picker=deferred();let aborted=0;const f=fixture(()=>{throw Error('must not read');});
 const task=f.manager.downloadTo('a',()=>picker.promise);f.change({status:'closed',environmentId:null});picker.resolve({async write(){},async close(){throw Error('must not commit');},async abort(){aborted++;}});await task;
 assert.equal(aborted,1);assert.equal(f.calls.length,0);assert.equal(f.manager.getSnapshot().notice,'');f.manager.dispose();
});
