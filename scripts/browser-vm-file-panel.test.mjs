import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import React,{act} from 'react';
import {Window} from 'happy-dom';
let dir,FilesPanel;
before(async()=>{dir=await mkdtemp(new URL('./.vm-files-',import.meta.url).pathname);await build({entryPoints:['frontend/features/environments/files/files-panel.tsx'],outfile:dir+'/module.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});({FilesPanel}=await import(dir+'/module.mjs'));});
after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
async function render(t,handler,locale='en',nativeDownload=false,onOpenDownload,submission){
 const window=new Window({url:'http://localhost'});const saved=new Map();
 for(const [key,value]of Object.entries({window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,IS_REACT_ACT_ENVIRONMENT:true})){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});}
 const {createRoot}=await import('react-dom/client');const host=window.document.createElement('main');window.document.body.append(host);const root=createRoot(host);let snapshot={status:'running',environmentId:'a'};const subs=new Set(),calls=[],downloads=[];
 const runtime={getSnapshot:()=>snapshot,subscribe(fn){subs.add(fn);return()=>subs.delete(fn);},async file(input){calls.push(input);return handler(input);}};
 await act(async()=>root.render(React.createElement(FilesPanel,{runtime,locale,onOpenDownload,submission,onDownload:nativeDownload?undefined:(...args)=>downloads.push(args)})));
 t.after(async()=>{await act(async()=>root.unmount());window.happyDOM.abort();for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}});
 return{host,window,calls,downloads,async switchEnvironment(){await act(async()=>{snapshot={status:'running',environmentId:'b'};for(const fn of subs)fn();});},async close(){await act(async()=>{snapshot={status:'closed',environmentId:null};for(const fn of subs)fn();});}};
}
const list=()=>({path:'/',page:1,pageSize:20,total:1,pages:1,entries:[{name:'a.txt',type:'file',bytes:4}]});
async function fill(window,input,value){await act(async()=>{const proto=input.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});}
test('file panel renders real directory receipts, confirms removal and rejects anonymous runtime state',async t=>{
 const f=await render(t,input=>input.op==='list'?list():{ok:true});assert.ok(f.host.textContent.includes('a.txt'));
 await act(async()=>f.host.querySelector('[data-file-remove]').click());assert.equal(f.calls.filter(x=>x.op==='remove').length,0);
 const dialog=f.host.querySelector('[role=dialog]');assert.ok(dialog);await act(async()=>dialog.querySelector('[data-file-confirm]').click());assert.equal(f.calls.filter(x=>x.op==='remove').length,1);
 await f.close();assert.equal(f.host.querySelector('[data-file-entry]'),null);assert.ok(f.host.textContent.includes('Start an environment'));
});
test('actual editor preserves conflict draft, blocks old save and offers reload or save-as',async t=>{
 const f=await render(t,input=>{if(input.op==='list')return list();if(input.op==='readText')return{text:'base',version:'v'};if(input.op==='saveText')throw Error('FILE_CONFLICT');return{ok:true};});
 await act(async()=>f.host.querySelector('[data-file-edit]').click());await fill(f.window,f.host.querySelector('textarea'),'draft');
 await act(async()=>f.host.querySelector('[data-file-save]').click());assert.equal(f.host.querySelector('textarea').value,'draft');assert.equal(f.host.querySelector('[data-file-save]').disabled,true);assert.ok(f.host.querySelector('[data-file-reload]'));assert.ok(f.host.querySelector('[data-file-save-as]'));
 await f.close();assert.equal(f.host.querySelector('textarea'),null);assert.equal(f.host.textContent.includes('draft'),false);
});
test('page size and bounded download invoke file RPC, with no shell or automatic network',async t=>{
 const f=await render(t,input=>input.op==='list'?{...list(),pageSize:input.pageSize}:{bytes:new Uint8Array([1,2])});
 const select=f.host.querySelector('select');await act(async()=>{select.value='50';select.dispatchEvent(new f.window.Event('change',{bubbles:true}));});assert.equal(f.calls.at(-1).pageSize,50);
 await act(async()=>f.host.querySelector('[data-file-download]').click());assert.equal(f.downloads.length,1);assert.equal(f.downloads[0][0],'a.txt');assert.equal(f.calls.at(-1).op,'download');
});
test('Chinese labels and cancellation UI do not claim rollback of sent operations',async t=>{
 const f=await render(t,()=>list(),'zh-CN');assert.ok(f.host.textContent.includes('共享文件'));assert.ok(f.host.textContent.includes('20 MiB'));assert.ok(f.host.textContent.includes('取消不会回滚'));
});

test('running environment change clears open dialogs and reloads the new scope',async t=>{
 const f=await render(t,input=>list());
 await act(async()=>[...f.host.querySelectorAll('button')].find(x=>x.textContent==='Rename').click());
 assert.ok(f.host.querySelector('[role=dialog]'));const count=f.calls.length;
 await f.switchEnvironment();assert.equal(!!f.host.querySelector('[role=dialog]'),false);
 assert.equal(f.calls.length,count+1);assert.equal(f.calls.at(-1).op,'list');
});

test('browser download exposes an explicit user-gesture link and revokes its bytes on account close',async t=>{
 const f=await render(t,input=>input.op==='list'?list():{bytes:new Uint8Array([1,2])},'en',true);
 const revoked=[],original=URL.revokeObjectURL;URL.revokeObjectURL=url=>{revoked.push(url);original(url);};t.after(()=>{URL.revokeObjectURL=original;});
 await act(async()=>f.host.querySelector('[data-file-download]').click());
 const link=f.host.querySelector('a[download]');assert.equal(!!link,true);assert.equal(link.download,'a.txt');assert.match(link.href,/^blob:/);
 const url=link.href;await f.close();assert.equal(!!f.host.querySelector('a[download]'),false);assert.deepEqual(revoked,[url]);
});


test('large file offers streaming save with progress and explicit local export warning',async t=>{
 let writes=0,closed=0,picked=0;const size=21*1048576+1;
 const f=await render(t,input=>{
  if(input.op==='list')return{...list(),entries:[{name:'large.bin',type:'file',bytes:size}]};
  if(input.op==='downloadBegin')return{token:'lease',size,chunkSize:1048576};
  if(input.op==='downloadChunk'){const length=Math.min(1048576,size-input.offset);return{offset:input.offset,bytes:new Uint8Array(length),done:input.offset+length===size};}
  return{ok:true};
 },'en',false,async name=>{picked++;assert.equal(name,'large.bin');return{async write(bytes){writes+=bytes.length;},async close(){closed++;},async abort(){throw Error('unexpected abort');}};});
 assert.equal(f.host.querySelector('[data-file-download]').disabled,true);
 const button=f.host.querySelector('[data-file-stream]');assert.ok(button);assert.equal(button.disabled,false);
 assert.match(f.host.textContent,/survive account logout/);
 await act(async()=>button.click());assert.equal(picked,1);assert.equal(writes,size);assert.equal(closed,1);assert.match(f.host.textContent,/File saved/);assert.equal(f.host.querySelector('progress').value,size);
});
test('unsupported browser does not pretend large file streaming or enable its action',async t=>{
 const f=await render(t,()=>({...list(),entries:[{name:'large',type:'file',bytes:22*1048576}]}));
 assert.ok(f.host.querySelector('[data-file-stream]'));assert.equal(f.host.querySelector('[data-file-stream]').disabled,true);assert.match(f.host.textContent,/Streaming save is unavailable/);
});

test('selected VM file confirmation renders hostile markup as text and submits only after acknowledgement',async t=>{
 const posts=[];const f=await render(t,input=>input.op==='list'?list():{text:'<img src=x onerror=alert(1)>',version:'v1'},'en',false,undefined,{memberId:'member-a',requester:async(url,init)=>{posts.push({url,init});return Response.json({submission:{id:'submission-ui'}});}});
 await act(async()=>f.host.querySelector('[data-file-import]').click());assert.equal(posts.length,0);assert.equal(f.host.querySelector('[data-import-preview]').textContent,'<img src=x onerror=alert(1)>');assert.equal(f.host.querySelector('[data-import-preview] img'),null);
 assert.equal(f.host.querySelector('[data-import-confirm]').disabled,true);
 await fill(f.window,f.host.querySelector('[data-import-space]'),'team-notes');
 await act(async()=>f.host.querySelector('[data-import-ack]').click());
 await act(async()=>f.host.querySelector('[data-import-confirm]').click());assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].init.body).requestedSpaceId,'team-notes');assert.ok(f.host.textContent.includes('submission-ui'));assert.equal(f.host.querySelector('[data-import-preview]'),null);
});
test('VM import is gated without authenticated integration',async t=>{
 const f=await render(t,()=>list());assert.equal(f.host.querySelector('[data-file-import]').disabled,true);
});
test('VM import clears selected content on runtime exit',async t=>{
 const g=await render(t,input=>input.op==='list'?list():{text:'old owner content',version:'v1'},'zh-CN',false,undefined,{memberId:'member-a',requester:()=>{throw Error('must not post');}});
 await act(async()=>g.host.querySelector('[data-file-import]').click());assert.ok(g.host.textContent.includes('old owner content'));await g.close();assert.equal(g.host.textContent.includes('old owner content'),false);
});
