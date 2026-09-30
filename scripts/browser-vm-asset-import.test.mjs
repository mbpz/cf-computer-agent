import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
let dir,createVmAssetImport;
before(async()=>{dir=await mkdtemp(new URL('./.vm-asset-',import.meta.url).pathname);await build({entryPoints:['frontend/features/environments/files/asset-import.ts'],outfile:dir+'/module.mjs',bundle:true,platform:'node',format:'esm'});({createVmAssetImport}=await import(dir+'/module.mjs'));});
after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
const storage=()=>{const values=new Map();return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const confirm={title:'Report',target:{requestedSpaceId:'research',requestedCollectionId:null,requestedVisibility:'admin_only'},acknowledged:true};
function fixture(t,{store=storage(),transport,read,enabled=true,maxBytes=1000}={}){
 let snapshot={status:'running',environmentId:'env-a'},record,status='queued';const subs=new Set(),calls=[],requests=[],raw=new Uint8Array([37,80,68,70,0,255]);
 const runtime={getSnapshot:()=>snapshot,subscribe(fn){subs.add(fn);return()=>subs.delete(fn);},async file(input){calls.push(input);return read?read(input):{bytes:raw.slice()};}};
 const requester=async(url,init)=>{requests.push({url,init});if(transport){const result=await transport(url,init);if(result)return result;}
  if(url==='/api/assets/availability')return Response.json({storageEnabled:enabled,reason:enabled?null:'ASSET_STORAGE_NOT_CONFIGURED',maxBytes});
  if(url==='/api/assets'){record={asset:{id:'asset-1',ownerId:'member-a',originalName:'report.pdf',byteSize:6,contentType:'application/pdf',contentSha256:createHash('sha256').update(raw).digest('hex'),idempotencyKey:init.headers['idempotency-key']},job:{assetId:'asset-1',status}};return Response.json(record);}
  if(url==='/api/assets/resume')return record?Response.json({...record,job:{assetId:'asset-1',status}}):Response.json({error:{code:'ASSET_NOT_FOUND',message:'missing',retryable:false}},{status:404});
  if(url==='/api/assets/asset-1'){status='succeeded';return Response.json({...record,job:{assetId:'asset-1',status}});}
  if(url.endsWith('/preview'))return Response.json({assetId:'asset-1',originalName:'report.pdf',markdown:'<img src=x onerror=alert(1)>',warnings:[],lineCount:1,codeMetadata:null,parserSchemaVersion:'1'});
  if(url.endsWith('/submit'))return Response.json({submission:{id:'submission-1'}});
  if(url.endsWith('/cancel')){record=undefined;return new Response(null,{status:204});}
  throw Error('unexpected '+url);
 };
 const options={runtime,memberId:'member-a',storage:store,requester};const model=createVmAssetImport(options);t.after(()=>model.dispose());
 return{model,options,calls,requests,store,setEnabled(v){enabled=v;},switch(){snapshot={status:'closed',environmentId:null};for(const fn of subs)fn();},posts:()=>requests.filter(r=>r.init.method==='POST')};
}
test('feature availability is read before VM bytes; disabled storage never reads or uploads',async t=>{const f=fixture(t,{enabled:false});await f.model.select('/report.pdf');assert.equal(f.calls.length,0);assert.equal(f.posts().length,0);assert.equal(f.model.getSnapshot().error,'ASSET_STORAGE_NOT_CONFIGURED');await f.model.upload(true);assert.equal(f.posts().length,0);});
test('selected binary stays local until upload consent; parse, literal preview and review are separate actions',async t=>{
 const f=fixture(t);await f.model.select('/report.pdf');assert.equal(f.model.getSnapshot().kind,'preview');assert.deepEqual(f.calls,[{op:'readSubmissionAsset',path:'/report.pdf',maxBytes:1000}]);assert.equal(f.posts().length,0);
 await f.model.upload(false);assert.equal(f.posts().length,0);await f.model.upload(true);assert.equal(f.posts().length,1);assert.equal(f.posts()[0].init.credentials,'same-origin');assert.deepEqual(new Uint8Array(await f.posts()[0].init.body.arrayBuffer()),new Uint8Array([37,80,68,70,0,255]));
 await f.model.submit(confirm);assert.equal(f.posts().length,1);await f.model.parse();assert.equal(f.model.getSnapshot().flow.record.job.status,'succeeded');assert.equal(f.posts().length,2);
 await f.model.submit(confirm);assert.equal(f.posts().length,2);await f.model.previewParsed();assert.equal(f.model.getSnapshot().parsed.markdown,'<img src=x onerror=alert(1)>');
 await f.model.submit({...confirm,acknowledged:false});assert.equal(f.posts().length,2);await f.model.submit(confirm);assert.equal(f.model.getSnapshot().flow.submissionId,'submission-1');
 assert.deepEqual(JSON.parse(f.posts()[2].init.body),{title:'Report',requestedSpaceId:'research',requestedCollectionId:null,requestedVisibility:'admin_only'});assert.equal(f.store.getItem('personal-workbench:asset-intent:v1:member-a'),null);
});
test('hidden, traversal, credential and unsupported paths cannot read or upload',async t=>{for(const path of ['/.env.pdf','/secret.pdf','/a/../b.pdf','/a//b.pdf','/id_rsa.pdf','/a.exe','/a.constructor']){const f=fixture(t);await f.model.select(path);assert.equal(f.calls.length,0,path);assert.equal(f.posts().length,0,path);}});
test('actual receipt size and server gate changes are rechecked before upload',async t=>{const f=fixture(t,{maxBytes:5});await f.model.select('/report.pdf');assert.equal(f.model.getSnapshot().kind,'error');await f.model.upload(true);assert.equal(f.posts().length,0);const g=fixture(t);await g.model.select('/report.pdf');g.setEnabled(false);await g.model.upload(true);assert.equal(g.posts().length,0);assert.equal(g.model.getSnapshot().error,'ASSET_STORAGE_NOT_CONFIGURED');});
test('readback and upload retry preserve exact key and file after lost response without automatic replay',async t=>{let lose=true;const f=fixture(t,{transport:async url=>{if(url==='/api/assets'&&lose){lose=false;throw Error('lost');}}});await f.model.select('/report.pdf');await f.model.upload(true);assert.equal(f.model.getSnapshot().flow.kind,'unknown');const key=f.posts()[0].init.headers['idempotency-key'];await f.model.refresh();assert.equal(f.posts().length,1);assert.equal(f.model.getSnapshot().flow.kind,'missing');await f.model.upload(true);assert.equal(f.posts()[1].init.headers['idempotency-key'],key);});
test('persisted review survives recreation; explicit retry keeps original space, visibility and key',async t=>{let lose=true;const f=fixture(t,{transport:async url=>{if(url.endsWith('/submit')&&lose){lose=false;throw Error('lost');}}});await f.model.select('/report.pdf');await f.model.upload(true);await f.model.parse();await f.model.previewParsed();await f.model.submit(confirm);assert.equal(f.model.getSnapshot().flow.kind,'unknown');const first=f.posts().at(-1);f.model.dispose();const restored=createVmAssetImport(f.options);t.after(()=>restored.dispose());await restored.recover();assert.equal(f.posts().length,3);await restored.retrySubmission();assert.equal(f.posts().length,4);assert.equal(f.posts().at(-1).init.body,first.init.body);assert.equal(f.posts().at(-1).init.headers['idempotency-key'],first.init.headers['idempotency-key']);assert.equal(restored.getSnapshot().flow.submissionId,'submission-1');});
test('owner loss cancels HTTP and drops late VM bytes and submission receipts',async t=>{let finish;const f=fixture(t,{read:()=>new Promise(resolve=>finish=resolve)});const pending=f.model.select('/report.pdf');while(!finish)await new Promise(r=>setImmediate(r));f.switch();finish({bytes:new Uint8Array([1])});await pending;assert.equal(f.model.getSnapshot().kind,'idle');assert.equal(f.posts().length,0);
 let response;const g=fixture(t,{transport:async(url,init)=>url.endsWith('/submit')?new Promise(resolve=>response={resolve,signal:init.signal}):undefined});await g.model.select('/report.pdf');await g.model.upload(true);await g.model.parse();await g.model.previewParsed();const submit=g.model.submit(confirm);while(!response)await new Promise(r=>setImmediate(r));g.switch();assert.equal(response.signal.aborted,true);response.resolve(Response.json({submission:{id:'late'}}));await submit;assert.equal(g.model.getSnapshot().kind,'idle');assert.equal(g.model.getSnapshot().flow,undefined);
});
test('unrelated or oversized parsed previews cannot authorize a review POST',async t=>{for(const body of [{assetId:'other',originalName:'report.pdf',markdown:'other'},{assetId:'asset-1',originalName:'report.pdf',markdown:'x'.repeat(131073)}]){const f=fixture(t,{transport:async url=>url.endsWith('/preview')?Response.json(body):undefined});await f.model.select('/report.pdf');await f.model.upload(true);await f.model.parse();await f.model.previewParsed();assert.equal(f.model.getSnapshot().parsed,undefined);await f.model.submit(confirm);assert.equal(f.posts().length,2);}});

test('stop waiting aborts transport, keeps member recovery metadata and ignores a late upload receipt',async t=>{
 let pending;const f=fixture(t,{transport:async(url,init)=>url==='/api/assets'?new Promise(resolve=>pending={resolve,signal:init.signal}):undefined});
 await f.model.select('/report.pdf');const task=f.model.upload(true);while(!pending)await new Promise(r=>setImmediate(r));
 f.model.stop();assert.equal(pending.signal.aborted,true);assert.equal(f.model.getSnapshot().kind,'idle');assert.ok(f.store.getItem('personal-workbench:asset-intent:v1:member-a'));
 pending.resolve(Response.json({}));await task;assert.equal(f.model.getSnapshot().kind,'idle');await f.model.recover();assert.equal(f.posts().length,1);assert.equal(f.model.getSnapshot().flow.kind,'missing');
});
test('duplicate upload clicks and another member recovery cannot replay or expose this member intent',async t=>{
 const f=fixture(t);await f.model.select('/report.pdf');await Promise.all([f.model.upload(true),f.model.upload(true)]);assert.equal(f.posts().length,1);
 const next=createVmAssetImport({...f.options,memberId:'member-b'});t.after(()=>next.dispose());await next.recover();assert.equal(next.getSnapshot().flow.intent,undefined);assert.equal(f.posts().length,1);
});
