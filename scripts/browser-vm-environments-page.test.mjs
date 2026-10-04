import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
import React,{act} from 'react';
import {Window} from 'happy-dom';
let dir,createManager,App,navigate;
before(async()=>{
 dir=await mkdtemp(new URL('./.environment-page-',import.meta.url).pathname);
 await build({stdin:{contents:`export {getEnvironmentManager} from './frontend/features/environments/environment-manager'; export {App} from './frontend/app'; export {writeWorkspaceHistory} from './frontend/lib/workspace-location';`,resolveDir:process.cwd(),loader:'ts'},outfile:dir+'/module.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env.DEV':'false'}});
 const m=await import(dir+'/module.mjs');createManager=m.getEnvironmentManager;App=m.App;navigate=m.writeWorkspaceHistory;
});
after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
const owners=[];afterEach(()=>{for(const x of owners.splice(0))x.dispose();});
const env={id:'env-a',memberId:'member-a',name:'Linux',type:'personal',taskId:null,version:1,createdAt:'2026-09-30T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z'};
const page=(items=[env],n=1,total=items.length)=>({items,pagination:{page:n,pageSize:20,total,totalPages:Math.ceil(total/20)}});
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};}
function setup(requester,storage=memoryStorage(),scope={origin:'https://workbench.example',memberId:'member-a'}){const owner=createAccountNetworkOwner(scope);owners.push(owner);return{owner,manager:createManager(owner,requester,storage)};}
test('member-owned list uses same-origin fixed endpoint; wrong member clears visible data',async()=>{
 let bad=false;const requests=[];const {manager}=setup(async(path,init)=>{requests.push([path,init.credentials]);return Response.json(page([{...env,memberId:bad?'other':'member-a'}]));});
 await manager.load();assert.equal(manager.getSnapshot().items[0].name,'Linux');assert.deepEqual(requests,[['/api/environments?page=1&pageSize=20','same-origin']]);
 bad=true;await manager.load();assert.equal(manager.getSnapshot().items.length,0);assert.equal(manager.getSnapshot().error,'INVALID_RESPONSE');
});
test('unknown create preserves exact operation and forbids replacement; explicit retry does not duplicate intent',async()=>{
 const requests=[];let fail=true;const {owner,manager}=setup(async(path,init)=>{if(init.method==='GET')return Response.json(page());requests.push(init.body);if(fail)throw Error('lost response');return Response.json({environment:{...env,name:'New'}});});
 await manager.create({name:'New',type:'personal'});assert.equal(manager.getSnapshot().pending.kind,'create');assert.equal(manager.getSnapshot().error,'WRITE_UNKNOWN');
 await assert.rejects(manager.create({name:'Other',type:'personal'}),/WRITE_PENDING/);assert.equal(createManager(owner),manager);
 fail=false;await manager.retry();assert.equal(requests.length,2);assert.equal(requests[0],requests[1]);assert.equal(manager.getSnapshot().pending,null);assert.equal(JSON.parse(requests[0]).memberId,undefined);
});
for (const kind of ['rename','delete']) test(`unknown ${kind} retries the frozen target, method, operation ID and complete body`,async()=>{
 const requests=[];const item={...env};const {manager}=setup(async(path,init)=>{
  if(init.method==='GET')return Response.json(page());
  requests.push({path,method:init.method,body:init.body,redirect:init.redirect,cache:init.cache});
  if(requests.length===1)throw Error('lost response');
  return kind==='rename' ? Response.json({environment:{...env,name:'Renamed',version:2}})
   : Response.json({tombstone:{environmentId:env.id,version:2,deletedAt:env.updatedAt}});
 });
 await (kind==='rename' ? manager.rename(item,'Renamed') : manager.remove(item));
 assert.equal(manager.getSnapshot().error,'WRITE_UNKNOWN');
 item.id='other';item.version=99;
 await manager.retry();
 assert.equal(requests.length,2);assert.deepEqual(requests[1],requests[0]);
 assert.equal(requests[1].path,'/api/environments/env-a');assert.equal(requests[1].method,kind==='rename'?'PATCH':'DELETE');
 assert.equal(requests[1].redirect,'error');assert.equal(requests[1].cache,'no-store');
 const body=JSON.parse(requests[1].body);assert.equal(body.version,1);assert.match(body.operationId,/^[0-9a-f-]{36}$/u);
 assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().error,null);
});
test('confirmed deletion closes old network before HTTP and validates the tombstone',async()=>{
 let owner;const x=setup(async(path,init)=>{if(init.method==='GET')return Response.json(page());assert.equal(owner.network('other').state.status,'offline');assert.throws(()=>owner.network('env-a'),/ENVIRONMENT_REMOVED/);return Response.json({tombstone:{environmentId:'wrong',version:2,deletedAt:env.updatedAt}});});owner=x.owner;const network=owner.network('env-a');
 await x.manager.remove(env);assert.equal(network.state.status,'closed');assert.equal(x.manager.getSnapshot().error,'WRITE_UNKNOWN');assert.equal(x.manager.getSnapshot().pending.kind,'delete');
});
test('superseded read and owner disposal cannot publish private late responses',async()=>{
 const deferred=[];const {owner,manager}=setup(()=>new Promise(resolve=>deferred.push(resolve)));
 const first=manager.load(1),second=manager.load(2);deferred[1](Response.json(page([],2,0)));await second;deferred[0](Response.json(page()));await first;assert.equal(manager.getSnapshot().pagination.page,2);assert.equal(manager.getSnapshot().items.length,0);
 const third=manager.load(1);owner.dispose();deferred[2](Response.json(page()));await third;assert.equal(manager.getSnapshot().items.length,0);assert.equal(manager.getSnapshot().closed,true);
});
test('403 during a write clears private state and terminates account network owner',async()=>{
 const {owner,manager}=setup(async(path,init)=>init.method==='GET'?Response.json(page()):Response.json({error:{code:'FORBIDDEN',message:'denied',retryable:false}},{status:403}));
 await manager.load();await manager.rename(env,'Changed');assert.equal(manager.getSnapshot().items.length,0);assert.equal(manager.getSnapshot().closed,true);assert.equal(owner.signal.aborted,true);
});
test('malformed pagination and invalid user input fail without issuing mutations',async()=>{
 let writes=0;const {manager}=setup(async(path,init)=>{if(init.method!=='GET')writes++;return Response.json({...page(),pagination:{page:1,pageSize:20,total:2,totalPages:1}});});
 await manager.load();assert.equal(manager.getSnapshot().error,'INVALID_RESPONSE');await assert.rejects(manager.create({name:' ',type:'personal'}),/INVALID_INPUT/);assert.equal(writes,0);
});

async function renderApp(t, requester, permissionMask='0x200000') {
 const window=new Window({url:'https://workbench.example/environments'}), originals=new Map();
 const host=window.document.createElement('div');window.document.body.append(host);
 for(const [key,value] of Object.entries({window,document:window.document,navigator:window.navigator,history:window.history,location:window.location,HTMLElement:window.HTMLElement,MutationObserver:window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,fetch:async(path,init={})=>{
  if(path==='/api/session')return Response.json({member:{id:'member-a',email:'a@example.test',role:'contributor'},capabilities:[],permissionMask,logoutUrl:'/auth/logout'});
  if(path==='/api/navigation')return Response.json({tree:[]});
  if(path==='/api/telemetry/pageview')return new Response(null,{status:204});
  if(path==='/api/notifications/summary'){assert.ok(!init.method || init.method==='GET');return Response.json({unread:0});}
  return requester(path,init);
 }})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const {createRoot}=await import('react-dom/client');
 let root=createRoot(host);t.after(async()=>{await act(async()=>root.unmount());await window.happyDOM.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 await act(async()=>root.render(React.createElement(App)));return{host,window,root,remount:async()=>{await act(async()=>root.unmount());root=createRoot(host);await act(async()=>root.render(React.createElement(App)));}};
}
test('actual App exposes member environment list and no fake running or automatic network',async t=>{
 const calls=[];const {host}=await renderApp(t,async(path,init)=>{calls.push(path);return Response.json(page());});
 assert.ok(host.querySelector('[data-environments-page]'),'actual environment page must render');assert.ok(host.textContent.includes('Linux'));
 assert.deepEqual(calls,['/api/environments?page=1&pageSize=20']);assert.equal(host.querySelector('[data-vm-start]'),null);
});
test('VM permission cannot be inferred from task permission or direct route access',async t=>{
 let calls=0;const {host}=await renderApp(t,async()=>{calls++;return Response.json(page());},'0x80000');
 assert.equal(calls,0);assert.equal(host.querySelector('[data-environments-page]'),null);assert.ok(host.querySelector('[data-page-state=forbidden]'));
});

async function fill(window,input,value){await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});}
test('actual App creates, renames and confirms deletion using versioned writes',async t=>{
 let rows=[],version=1;const writes=[];
 const {host,window}=await renderApp(t,async(path,init)=>{
  if(init.method==='GET')return Response.json(page(rows));
  const body=JSON.parse(init.body);writes.push({path,method:init.method,body});
  if(init.method==='POST')rows=[{...env,name:body.name,type:body.type,taskId:body.taskId}];
  if(init.method==='PATCH')rows=[{...rows[0],name:body.name,version:++version}];
  if(init.method==='DELETE'){rows=[];return Response.json({tombstone:{environmentId:'env-a',version:++version,deletedAt:env.updatedAt}});}
  return Response.json({environment:rows[0]},{status:init.method==='POST'?201:200});
 });
 const form=host.querySelector('[data-environment-create]');await fill(window,form.querySelector('[name=name]'),'My Linux');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(writes.length,1);assert.ok(host.textContent.includes('My Linux'));
 await act(async()=>host.querySelector('[data-environment-rename]').click());
 const edit=host.querySelector('[role=dialog] form');assert.ok(edit);await fill(window,edit.querySelector('input'),'Renamed Linux');
 await act(async()=>edit.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(host.textContent.includes('Renamed Linux'));assert.equal(writes[1].body.version,1);
 await act(async()=>host.querySelector('[data-environment-delete]').click());assert.equal(writes.length,2);
 await act(async()=>host.querySelector('[data-environment-confirm-delete]').click());assert.equal(writes.length,3);assert.equal(writes[2].body.version,2);assert.equal(host.querySelector('[data-environment-id]'),null);
 assert.equal(new Set(writes.map(x=>x.body.operationId)).size,3);assert.ok(writes.every(x=>!('memberId' in x.body)));
});

test('actual Worker/D1 metadata CRUD preserves lost-response idempotency and delete ordering',async t=>{
 const {fixture,origin}=await import('./helpers/connector-authority-fixture.mjs');const f=await fixture(t);
 const owner=createAccountNetworkOwner({origin,memberId:'member-a'});t.after(()=>owner.dispose());
 let lose=true;const bodies=[];
 const manager=createManager(owner,async(path,init)=>{
  if(init.method==='POST')bodies.push(init.body);
  const result=await f.requester(path,init);
  if(init.method==='POST' && lose){lose=false;assert.equal(result.status,201);await result.body.cancel();throw Error('committed response lost');}
  return result;
 },memoryStorage());
 await f.db.prepare("INSERT INTO members(id,access_sub,email,role,status,created_at,updated_at) VALUES('member-b','subject-b','b@example.test','contributor','active',?,?)").bind(env.createdAt,env.updatedAt).run();
 await f.db.prepare("INSERT INTO browser_environments(id,member_id,name,type,version,created_at,updated_at) VALUES('env-b','member-b','Private B','personal',1,?,?)").bind(Date.parse(env.createdAt),Date.parse(env.updatedAt)).run();
 await manager.load();assert.equal(manager.getSnapshot().error,null);assert.deepEqual(manager.getSnapshot().items.map(x=>x.name),['A']);
 await manager.rename({...env,id:'env-b'},'Intrusion');assert.equal(manager.getSnapshot().error,'WRITE_REJECTED');
 assert.equal(await f.db.prepare("SELECT name FROM browser_environments WHERE id='env-b'").first('name'),'Private B');
 await manager.create({name:'Actual D1',type:'temporary'});assert.equal(manager.getSnapshot().error,'WRITE_UNKNOWN');
 await manager.retry();assert.equal(manager.getSnapshot().error,null);assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);
 assert.equal(await f.db.prepare("SELECT COUNT(*) AS n FROM browser_environments WHERE name='Actual D1'").first('n'),1);
 let item=manager.getSnapshot().items.find(x=>x.name==='Actual D1');assert.ok(item);assert.equal(item.version,1);
 await manager.rename(item,'Renamed D1');assert.equal(manager.getSnapshot().error,null);item=manager.getSnapshot().items.find(x=>x.id===item.id);assert.equal(item.version,2);
 const network=owner.network(item.id);await manager.remove(item);assert.equal(manager.getSnapshot().error,null);assert.equal(network.state.status,'closed');
 assert.equal(await f.db.prepare('SELECT COUNT(*) AS n FROM browser_environments WHERE id=?').bind(item.id).first('n'),0);
 assert.equal(await f.db.prepare('SELECT version FROM environment_tombstones WHERE environment_id=?').bind(item.id).first('version'),3);
});
test('actual App blocks leaving an unknown operation and explicitly retries the same body',async t=>{
 const bodies=[];let lost=true,rows=[];
 const {host,window}=await renderApp(t,async(path,init)=>{
  if(init.method==='GET')return Response.json(page(rows));
  bodies.push(init.body);const body=JSON.parse(init.body);rows=[{...env,name:body.name}];
  if(lost){lost=false;throw Error('lost response');}return Response.json({environment:rows[0]});
 });
 const form=host.querySelector('[data-environment-create]');await fill(window,form.querySelector('[name=name]'),'Keep intent');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(host.querySelector('[data-environment-retry]'));assert.equal(bodies.length,1);
 await act(async()=>navigate('push','/not-found'));
 assert.equal(window.location.pathname,'/environments');
 assert.ok(host.querySelector('[data-environments-page]'));
 assert.ok(host.querySelector('[data-environment-retry]'));assert.equal(bodies.length,1);
 await act(async()=>host.querySelector('[data-environment-retry]').click());
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.equal(host.querySelector('[data-environment-retry]'),null);
});
test('conflict requires explicit reread, never silently retries a newer version',async()=>{
 let writes=0;const {manager}=setup(async(path,init)=>{if(init.method==='GET')return Response.json(page());writes++;return Response.json({error:{code:'ENVIRONMENT_VERSION_CONFLICT',message:'stale'}},{status:409});});
 await manager.load();await manager.rename(env,'Changed');assert.equal(writes,1);assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().error,'WRITE_REJECTED');assert.equal(manager.getSnapshot().items.length,0);
 await manager.load();assert.equal(manager.getSnapshot().items[0].version,1);assert.equal(writes,1);
});
test('page and type selection use bounded explicit requests and reject mismatched types',async()=>{
 const requests=[];const {manager}=setup(async(path)=>{requests.push(path);return Response.json(page([{...env,type:'temporary'}],2,21));});
 await manager.load(2,'temporary');assert.equal(manager.getSnapshot().error,null);assert.deepEqual(requests,['/api/environments?page=2&pageSize=20&type=temporary']);
 await manager.load(2,'personal');assert.equal(manager.getSnapshot().error,'INVALID_RESPONSE');
});

test('create rejects a receipt with a non-initial version',async()=>{
 const {manager}=setup(async()=>Response.json({environment:{...env,version:2}}));
 await manager.create({name:'Linux',type:'personal'});assert.equal(manager.getSnapshot().error,'WRITE_UNKNOWN');assert.ok(manager.getSnapshot().pending);
});
test('large valid totals do not hide the first page or invent an account quota',async()=>{
 const items=Array.from({length:20},(_,n)=>({...env,id:'env-'+n}));
 const {manager}=setup(async()=>Response.json(page(items,1,10001)));await manager.load();assert.equal(manager.getSnapshot().error,null);assert.equal(manager.getSnapshot().items.length,20);
});
test('account cancellation prevents a late mutation response from repopulating data',async()=>{
 let resolve;const {owner,manager}=setup(()=>new Promise(r=>resolve=r));const write=manager.create({name:'Linux',type:'personal'});owner.dispose();
 resolve(Response.json({environment:env}));await write;assert.equal(manager.getSnapshot().closed,true);assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().items.length,0);
});

for (const kind of ['create','rename','delete']) test(`exact ${kind} lookup resolves only its frozen receipt and sends no second mutation`,async()=>{
 let intent,writes=0;const reads=[];
 const result=kind==='delete'?{tombstone:{environmentId:env.id,version:2,deletedAt:env.updatedAt}}:{environment:{...env,name:kind==='rename'?'Renamed':'Linux',version:kind==='rename'?2:1}};
 const {manager}=setup(async(path,init)=>{
  if(init.method!=='GET'){writes++;intent=JSON.parse(init.body);throw Error('lost');}
  reads.push([path,init.cache,init.redirect]);
  if(path.startsWith('/api/environments/operations/'))return Response.json({operationId:intent.operationId,kind:kind==='rename'?'environment.update':`environment.${kind}`,environmentId:env.id,result});
  return Response.json(page());
 });
 await(kind==='create'?manager.create({name:'Linux',type:'personal'}):kind==='rename'?manager.rename(env,'Renamed'):manager.remove(env));
 assert.equal(manager.getSnapshot().pending.operationId,intent.operationId);
 await manager.lookup();assert.equal(writes,1);assert.equal(manager.getSnapshot().pending,null);
 assert.deepEqual(reads[0],[`/api/environments/operations/${intent.operationId}`,'no-store','error']);
 assert.equal(manager.getSnapshot().confirmed.operationId,intent.operationId);assert.equal(manager.getSnapshot().confirmed.environmentId,env.id);
 assert.equal(manager.getSnapshot().confirmed.version,kind==='create'?1:2);
});
for(const failure of ['missing','transport','wrong-id','wrong-kind','wrong-target','wrong-member','wrong-payload']) test(`exact lookup ${failure} retains the same pending intent`,async()=>{
 let op;const {manager}=setup(async(path,init)=>{
  if(init.method!=='GET'){op=JSON.parse(init.body).operationId;throw Error('lost');}
  if(failure==='missing')return Response.json({error:{code:'NOT_FOUND',message:'missing'}},{status:404});
  if(failure==='transport')throw Error('offline');
  return Response.json({operationId:failure==='wrong-id'?'other':op,kind:failure==='wrong-kind'?'environment.delete':'environment.update',environmentId:failure==='wrong-target'?'other':env.id,result:{environment:{...env,name:failure==='wrong-payload'?'Other':'Renamed',version:2,memberId:failure==='wrong-member'?'other':env.memberId}}});
 });
 await manager.rename(env,'Renamed');const pending=manager.getSnapshot().pending;
 await manager.lookup();assert.equal(manager.getSnapshot().pending,pending);assert.equal(manager.getSnapshot().writing,false);
 assert.equal(manager.getSnapshot().error,failure==='missing'?'RESULT_NOT_FOUND':'RESULT_UNKNOWN');
});
test('lookup and retry are mutually exclusive and an account close rejects late query results',async()=>{
 let resolve,op,writes=0;const {owner,manager}=setup(async(path,init)=>{
  if(init.method!=='GET'){writes++;op=JSON.parse(init.body).operationId;throw Error('lost');}
  return new Promise(r=>resolve=r);
 });
 await manager.create({name:'Linux',type:'personal'});const lookup=manager.lookup();
 await assert.rejects(manager.retry(),/WRITE_PENDING/);await assert.rejects(manager.lookup(),/WRITE_PENDING/);
 owner.dispose();resolve(Response.json({operationId:op,kind:'environment.create',environmentId:env.id,result:{environment:env}}));await lookup;
 assert.equal(writes,1);assert.equal(manager.getSnapshot().closed,true);assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().items.length,0);
});
test('actual App exposes frozen operation ID and explicit read-only result lookup',async t=>{
 let op,writes=0,queries=0;const {host,window}=await renderApp(t,async(path,init)=>{
  if(init.method!=='GET'){writes++;op=JSON.parse(init.body).operationId;throw Error('lost');}
  if(path.startsWith('/api/environments/operations/')){queries++;return Response.json({operationId:op,kind:'environment.create',environmentId:env.id,result:{environment:env}});}
  return Response.json(page());
 });
 const form=host.querySelector('[data-environment-create]');await fill(window,form.querySelector('[name=name]'),'Linux');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(host.querySelector('[data-environment-operation-id]')?.textContent,op);assert.equal(queries,0);
 await act(async()=>host.querySelector('[data-environment-lookup]').click());
 assert.equal(queries,1);assert.equal(writes,1);assert.equal(host.querySelector('[data-environment-lookup]'),null);
 const receipt=host.querySelector('[data-environment-confirmed-result]');assert.ok(receipt);assert.ok(receipt.textContent.includes(op));assert.ok(receipt.textContent.includes(env.id));assert.ok(receipt.textContent.includes('Linux'));
});

for(const status of [401,403]) test(`exact lookup ${status} revokes account and clears private pending data`,async()=>{
 const {owner,manager}=setup(async(path,init)=>{
  if(init.method!=='GET')throw Error('lost');
  return Response.json({error:{code:'DENIED',message:'denied'}},{status});
 });
 await manager.create({name:'Linux',type:'personal'});await manager.lookup();
 assert.equal(owner.signal.aborted,true);assert.equal(manager.getSnapshot().pending,null);assert.deepEqual(manager.getSnapshot().items,[]);
});
test('not-found lookup then explicit retry keeps the identical operation ID and full request',async()=>{
 const bodies=[];const {manager}=setup(async(path,init)=>{
  if(path.startsWith('/api/environments/operations/'))return Response.json({error:{code:'NOT_FOUND',message:'missing'}},{status:404});
  if(init.method==='GET')return Response.json(page());
  bodies.push(init.body);if(bodies.length===1)throw Error('lost');return Response.json({environment:env});
 });
 await manager.create({name:'Linux',type:'personal'});const intent=manager.getSnapshot().pending;
 await manager.lookup();assert.equal(manager.getSnapshot().pending,intent);assert.equal(bodies.length,1);
 await manager.retry();assert.equal(bodies.length,2);assert.equal(bodies[1],bodies[0]);assert.equal(manager.getSnapshot().pending,null);
});
test('actual Worker/D1 refresh and exact lookup recover committed create rename and delete without replaying writes',async t=>{
 const {fixture,origin}=await import('./helpers/connector-authority-fixture.mjs');const f=await fixture(t);
 let owner=createAccountNetworkOwner({origin,memberId:'member-a'});t.after(()=>owner.dispose());
 let writes=0;const queries=[];
 const storage=memoryStorage();
 const requester=async(path,init)=>{
  const response=await f.requester(path,init);
  if(init.method!=='GET'){writes++;assert.ok(response.ok);await response.body.cancel();throw Error('committed response lost');}
  if(path.startsWith('/api/environments/operations/'))queries.push(path);
  return response;
 };
 let manager=createManager(owner,requester,storage);
 const refresh=()=>{owner.dispose();owner=createAccountNetworkOwner({origin,memberId:'member-a'});manager=createManager(owner,requester,storage);};
 await manager.create({name:'Exact D1',type:'personal'});const first=manager.getSnapshot().pending.operationId;
 refresh();await manager.lookup();assert.equal(manager.getSnapshot().error,null);assert.equal(writes,1);
 let item=manager.getSnapshot().items.find(x=>x.name==='Exact D1');assert.ok(item);assert.equal(item.version,1);
 await manager.rename(item,'Renamed exact D1');const second=manager.getSnapshot().pending.operationId;
 refresh();await manager.lookup();assert.equal(manager.getSnapshot().error,null);assert.equal(writes,2);
 item=manager.getSnapshot().items.find(x=>x.id===item.id);assert.equal(item.version,2);assert.equal(item.name,'Renamed exact D1');
 await manager.remove(item);const third=manager.getSnapshot().pending.operationId;
 refresh();await manager.lookup();assert.equal(manager.getSnapshot().error,null);assert.equal(writes,3);assert.equal(manager.getSnapshot().pending,null);
 assert.deepEqual(queries,[first,second,third].map(id=>`/api/environments/operations/${id}`));
 assert.equal(new Set([first,second,third]).size,3);
 assert.equal(await f.db.prepare('SELECT COUNT(*) AS n FROM browser_environments WHERE id=?').bind(item.id).first('n'),0);
 assert.equal(await f.db.prepare('SELECT COUNT(*) AS n FROM environment_operation_receipts WHERE environment_id=?').bind(item.id).first('n'),3);
 const response=await f.requester(`/api/environments/operations/${first}`,{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store'});
 assert.equal(response.status,200);const receipt=await response.json();assert.equal(receipt.result.environment.name,'Exact D1');assert.equal(receipt.result.environment.version,1);
});

test('verified historical receipt survives a failed list refresh but is cleared when the account closes',async()=>{
 let op;const {owner,manager}=setup(async(path,init)=>{
  if(init.method!=='GET'){op=JSON.parse(init.body).operationId;throw Error('lost');}
  if(path.startsWith('/api/environments/operations/'))return Response.json({operationId:op,kind:'environment.create',environmentId:env.id,result:{environment:env}});
  return Response.json({error:{code:'UNAVAILABLE',message:'list unavailable'}},{status:503});
 },memoryStorage());
 await manager.create({name:'Linux',type:'personal'});await manager.lookup();
 assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().confirmed.operationId,op);assert.equal(manager.getSnapshot().error,'READ_FAILED');
 owner.dispose();assert.equal(manager.getSnapshot().confirmed,null);assert.deepEqual(manager.getSnapshot().items,[]);
});

test('refresh restores the frozen pending operation without automatic query or resend',async()=>{
 const storage=memoryStorage(), sent=[];
 const first=setup(async(path,init)=>{sent.push(init.body);throw Error('lost');},storage);
 await first.manager.create({name:'Refresh',type:'personal'});
 const pending=first.manager.getSnapshot().pending;first.owner.dispose();
 const second=setup(async(path,init)=>{sent.push(init.body);throw Error('lost');},storage);
 assert.deepEqual(second.manager.getSnapshot().pending,pending);
 assert.equal(sent.length,1);
 await second.manager.retry();assert.equal(sent.length,2);assert.equal(sent[1],sent[0]);
});

test('storage quota blocks writes before transport and same-ID retry recovers after repair',async()=>{
 const storage=memoryStorage();const set=storage.setItem;let calls=0;
 storage.setItem=()=>{throw Error('quota');};
 const {manager}=setup(async()=>{calls++;throw Error('lost');},storage);
 await manager.create({name:'Safe',type:'personal'});
 const intent=manager.getSnapshot().pending;
 assert.equal(calls,0);assert.equal(manager.getSnapshot().recoveryBlocked,true);
 await assert.rejects(manager.create({name:'Replacement',type:'personal'}),/WRITE_PENDING/);
 storage.setItem=set;await manager.retry();assert.equal(calls,1);
 assert.deepEqual(manager.getSnapshot().pending,intent);assert.equal(manager.getSnapshot().recoveryBlocked,false);
});
test('corrupt journal fails closed, survives list refresh, and only explicit recheck can unlock',async()=>{
 const storage=memoryStorage();const first=setup(async()=>{throw Error('lost');},storage);
 await first.manager.create({name:'Safe',type:'personal'});first.owner.dispose();
 const key=[...storage.data.keys()][0];storage.setItem(key,'{corrupt');let writes=0;
 const {manager}=setup(async(path,init)=>{if(init.method!=='GET')writes++;return Response.json(page());},storage);
 assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().recoveryBlocked,true);
 await manager.load();assert.equal(manager.getSnapshot().error,'RECOVERY_BLOCKED');
 await assert.rejects(manager.create({name:'Other',type:'personal'}),/RECOVERY_BLOCKED/);
 await manager.recheckRecovery();assert.equal(storage.getItem(key),'{corrupt');assert.equal(writes,0);
 storage.removeItem(key);await manager.recheckRecovery();assert.equal(manager.getSnapshot().recoveryBlocked,false);assert.equal(writes,0);
});
for(const mode of ['silent-save','clear-failure'])test(`journal ${mode} does not lose or replace pending identity`,async()=>{
 const storage=memoryStorage();let calls=0;
 if(mode==='silent-save')storage.setItem=()=>{};else storage.removeItem=()=>{};
 const {manager}=setup(async(path,init)=>{calls++;return Response.json({environment:{...env,name:'Safe'}});},storage);
 await manager.create({name:'Safe',type:'personal'});
 assert.equal(manager.getSnapshot().recoveryBlocked,true);assert.ok(manager.getSnapshot().pending);
 assert.equal(calls,mode==='silent-save'?0:1);
 if(mode==='clear-failure')assert.equal(manager.getSnapshot().confirmed.name,'Safe');
});
test('stored operations are isolated by member and origin and malformed bodies never become requests',async()=>{
 const storage=memoryStorage(),first=setup(async()=>{throw Error('lost');},storage);
 await first.manager.create({name:'Private',type:'personal'});first.owner.dispose();
 for(const scope of [{origin:'https://workbench.example',memberId:'member-b'},{origin:'https://other.example',memberId:'member-a'}]){
  const other=setup(async()=>assert.fail('no request on restore'),storage,scope);
  assert.equal(other.manager.getSnapshot().pending,null);assert.equal(other.manager.getSnapshot().recoveryBlocked,false);
 }
 const key=[...storage.data.keys()][0],saved=JSON.parse(storage.getItem(key));
 saved.intent.body=JSON.stringify({...JSON.parse(saved.intent.body),memberId:'member-b'});storage.setItem(key,JSON.stringify(saved));
 const restored=setup(async()=>assert.fail('no request on restore'),storage);
 assert.equal(restored.manager.getSnapshot().pending,null);assert.equal(restored.manager.getSnapshot().recoveryBlocked,true);
});
test('restored delete closes network and exact lookup clears journal only after validated receipt',async()=>{
 const storage=memoryStorage(),first=setup(async()=>{throw Error('lost');},storage);
 await first.manager.remove(env);const intent=first.manager.getSnapshot().pending;first.owner.dispose();const calls=[];
 const second=setup(async(path,init)=>{calls.push([path,init.method]);return Response.json(path.includes('/operations/')
  ? {operationId:intent.operationId,kind:'environment.delete',environmentId:env.id,result:{tombstone:{environmentId:env.id,version:2,deletedAt:env.updatedAt}}}:page([]));},storage);
 assert.throws(()=>second.owner.network(env.id),/ENVIRONMENT_REMOVED/);assert.equal(calls.length,0);
 await second.manager.lookup();assert.equal(second.manager.getSnapshot().pending,null);assert.equal(storage.data.size,0);
 assert.ok(calls.every(([,method])=>method==='GET'));
 const third=setup(async()=>assert.fail('no automatic request'),storage);assert.equal(third.manager.getSnapshot().pending,null);
});
test('late old-account response cannot clear the restored operation',async()=>{
 const storage=memoryStorage();let resolve;
 const first=setup(()=>new Promise(r=>{resolve=r;}),storage);
 const write=first.manager.create({name:'Safe',type:'personal'});first.owner.dispose();
 const second=setup(async()=>assert.fail('no automatic request'),storage),intent=second.manager.getSnapshot().pending;
 resolve(Response.json({environment:{...env,name:'Safe'}}));await write;
 assert.deepEqual(second.manager.getSnapshot().pending,intent);assert.equal(storage.data.size,1);
 assert.equal(first.manager.getSnapshot().pending,null);
});

test('actual App remount restores operation ID without resend and exposes blocked recovery controls',async t=>{
 const calls=[];const app=await renderApp(t,async(path,init)=>{calls.push(init.method);if(init.method==='GET')return Response.json(page());throw Error('lost');});
 const form=app.host.querySelector('[data-environment-create]');await fill(app.window,form.querySelector('[name=name]'),'Refresh UI');
 await act(async()=>form.dispatchEvent(new app.window.Event('submit',{bubbles:true,cancelable:true})));
 const id=app.host.querySelector('[data-environment-operation-id]').textContent;
 await app.remount();assert.equal(app.host.querySelector('[data-environment-operation-id]').textContent,id);assert.equal(calls.filter(m=>m==='POST').length,1);
 const key=app.window.sessionStorage.key(0);assert.ok(key.startsWith('memory-garden:environment-operation:'));app.window.sessionStorage.setItem(key,'bad');
 await app.remount();assert.equal(app.host.querySelector('[data-environment-operation-id]'),null);
 assert.equal(app.host.querySelector('[data-environment-create] [name=name]').disabled,true);
 const recheck=app.host.querySelector('[data-environment-recheck-recovery]');assert.ok(recheck);
 app.window.sessionStorage.removeItem(key);await act(async()=>recheck.click());
 assert.equal(app.host.querySelector('[data-environment-create] [name=name]').disabled,false);assert.equal(calls.filter(m=>m==='POST').length,1);
});

test('verified lookup retains its pending ID on clear failure and a second explicit lookup can finish',async()=>{
 const storage=memoryStorage(),remove=storage.removeItem;let intent,queries=0;
 const {manager}=setup(async(path,init)=>{
  if(init.method!=='GET')throw Error('lost');
  if(!path.includes('/operations/'))return Response.json(page());
  queries++;return Response.json({operationId:intent.operationId,kind:'environment.create',environmentId:env.id,result:{environment:{...env,name:'Safe'}}});
 },storage);
 await manager.create({name:'Safe',type:'personal'});intent=manager.getSnapshot().pending;storage.removeItem=()=>{throw Error('denied');};
 await manager.lookup();assert.equal(manager.getSnapshot().pending.operationId,intent.operationId);assert.equal(manager.getSnapshot().recoveryBlocked,true);
 storage.removeItem=remove;await manager.lookup();assert.equal(manager.getSnapshot().pending,null);assert.equal(manager.getSnapshot().recoveryBlocked,false);assert.equal(queries,2);assert.equal(storage.data.size,0);
});
test('a conflicting stored intent is neither overwritten by retry nor cleared by another receipt',async()=>{
 const storage=memoryStorage();let intent,calls=0;
 const {manager}=setup(async(path,init)=>{calls++;if(init.method!=='GET')throw Error('lost');return Response.json({operationId:intent.operationId,kind:'environment.create',environmentId:env.id,result:{environment:{...env,name:'Safe'}}});},storage);
 await manager.create({name:'Safe',type:'personal'});intent=manager.getSnapshot().pending;
 const key=[...storage.data.keys()][0],saved=JSON.parse(storage.getItem(key));
 const replacement=crypto.randomUUID();saved.intent.operationId=replacement;saved.intent.body=JSON.stringify({...JSON.parse(saved.intent.body),operationId:replacement});
 const raw=JSON.stringify(saved);storage.setItem(key,raw);
 await manager.retry();assert.equal(calls,1);assert.equal(storage.getItem(key),raw);
 await manager.lookup();assert.equal(calls,2);assert.equal(storage.getItem(key),raw);assert.equal(manager.getSnapshot().recoveryBlocked,true);
 await manager.recheckRecovery();assert.equal(manager.getSnapshot().pending.operationId,intent.operationId);
});
for(const [label,mutate] of [
 ['scope',x=>{x.memberId='member-b';}],['version',x=>{x.version=2;}],['extra-envelope',x=>{x.token='forbidden';}],
 ['expected',x=>{x.intent.expected.version=8;}],['body',x=>{x.intent.body='not json';}],['kind',x=>{x.intent.kind='start';}],
])test(`invalid journal ${label} is not trusted or silently deleted`,async()=>{
 const storage=memoryStorage(),first=setup(async()=>{throw Error('lost');},storage);
 await first.manager.create({name:'Safe',type:'personal'});first.owner.dispose();
 const key=[...storage.data.keys()][0],saved=JSON.parse(storage.getItem(key));mutate(saved);const raw=JSON.stringify(saved);storage.setItem(key,raw);
 const second=setup(async()=>assert.fail('no transport'),storage);assert.equal(second.manager.getSnapshot().recoveryBlocked,true);assert.equal(second.manager.getSnapshot().pending,null);assert.equal(storage.getItem(key),raw);
});

test('environment create draft requires explicit discard and unload warns without sending writes',async t=>{
 let writes=0;const {host,window}=await renderApp(t,async(path,init)=>{if(init.method!=='GET')writes++;return Response.json(page());});
 await fill(window,host.querySelector('[data-environment-create] [name=name]'),'Unsent environment');
 const unload=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 await act(async()=>{assert.equal(navigate('push','/not-found'),'deferred');});
 assert.equal(window.location.pathname,'/environments');assert.ok(host.querySelector('[role=alertdialog]'));
 await act(async()=>host.querySelector('[data-cancel-action]').click());assert.equal(host.querySelector('[data-environment-create] [name=name]').value,'Unsent environment');
 await act(async()=>navigate('push','/not-found'));await act(async()=>host.querySelector('[data-confirm-action]').click());
 assert.equal(window.location.pathname,'/not-found');assert.equal(writes,0);
});

for(const exit of ['cancel','escape','route'])test(`environment rename ${exit} preserves dirty input until explicit discard`,async t=>{
 let writes=0;const {host,window}=await renderApp(t,async(path,init)=>{if(init.method!=='GET')writes++;return Response.json(page());});
 await act(async()=>host.querySelector('[data-environment-rename]').click());
 await fill(window,host.querySelector('[role=dialog] input'),'Unsent rename');
 const unload=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 const leave=async()=>act(async()=>{if(exit==='route')navigate('push','/not-found');else if(exit==='escape')host.querySelector('[role=dialog]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));else host.querySelector('[role=dialog] button[type=button]').click();});
 await leave();assert.ok(host.querySelector('[role=alertdialog]'));assert.equal(host.querySelector('[role=dialog] input').value,'Unsent rename');
 await act(async()=>host.querySelector('[data-cancel-action]').click());assert.equal(host.querySelector('[role=dialog] input').value,'Unsent rename');
 await leave();await act(async()=>host.querySelector('[data-confirm-action]').click());
 assert.equal(host.querySelector('[role=dialog]'),null);assert.equal(window.location.pathname,exit==='route'?'/not-found':'/environments');assert.equal(writes,0);
});

test('environment delete confirmation blocks navigation and stale double confirmation sends one delete',async t=>{
 let writes=0;const {host,window}=await renderApp(t,async(path,init)=>{if(init.method==='GET')return Response.json(page());writes++;throw Error('lost');});
 await act(async()=>host.querySelector('[data-environment-delete]').click());
 const unload=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 await act(async()=>{assert.equal(navigate('push','/not-found'),'blocked');});assert.equal(window.location.pathname,'/environments');
 const confirm=host.querySelector('[data-environment-confirm-delete]');await act(async()=>{confirm.click();confirm.click();});
 assert.equal(writes,1);assert.ok(host.querySelector('[data-environment-operation-id]'));
 await act(async()=>{assert.equal(navigate('push','/not-found'),'blocked');});
});
test('resolved unknown create clears its submitted draft and permits clean navigation',async t=>{
 let id,writes=0;const {host,window}=await renderApp(t,async(path,init)=>{
  if(path.includes('/operations/'))return Response.json({operationId:id,kind:'environment.create',environmentId:env.id,result:{environment:{...env,name:'Accepted'}}});
  if(init.method==='GET')return Response.json(page());writes++;id=JSON.parse(init.body).operationId;throw Error('lost');
 });
 const form=host.querySelector('[data-environment-create]');await fill(window,form.querySelector('[name=name]'),'Accepted');await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 await act(async()=>host.querySelector('[data-environment-lookup]').click());assert.equal(form.querySelector('[name=name]').value,'');
 await act(async()=>{assert.equal(navigate('push','/not-found'),'committed');});assert.equal(writes,1);
});
test('a late create list refresh cannot erase a newer local draft',async t=>{
 let refresh,created=false;const {host,window}=await renderApp(t,async(path,init)=>{
  if(init.method==='GET'){if(created)return new Promise(resolve=>{refresh=resolve;});return Response.json(page());}
  created=true;return Response.json({environment:{...env,name:'First'}});
 });
 const form=host.querySelector('[data-environment-create]');await fill(window,form.querySelector('[name=name]'),'First');await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(refresh);await fill(window,form.querySelector('[name=name]'),'New local draft');await act(async()=>refresh(Response.json(page())));
 assert.equal(form.querySelector('[name=name]').value,'New local draft');
});

test('rename invalid input keeps editor and dirty discard cannot submit a hidden write',async t=>{
 let writes=0;const {host,window}=await renderApp(t,async(path,init)=>{if(init.method==='GET')return Response.json(page([env]));writes++;throw Error('unexpected');});
 await act(async()=>host.querySelector('[data-environment-rename]').click());
 const form=host.querySelector('[role=dialog] form'),input=form.querySelector('input');
 await fill(window,input,'   ');await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(host.querySelector('[role=dialog] form'));assert.equal(input.value,'   ');assert.equal(writes,0);
 await fill(window,input,'Unsaved');await act(async()=>form.querySelector('button[type=button]').click());
 assert.ok(host.querySelector('[role=alertdialog]'));
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(writes,0);
 await act(async()=>host.querySelector('[data-cancel-action]').click());assert.equal(input.value,'Unsaved');
});

test('rename retains its original version after a list refresh and hands unknown result to the same-ID owner',async t=>{
 let reads=0;const writes=[];const {host,window}=await renderApp(t,async(path,init)=>{if(init.method==='GET')return Response.json(page([{...env,version:++reads}]));writes.push(JSON.parse(init.body));throw Error('lost');});
 await act(async()=>host.querySelector('[data-environment-rename]').click());
 const form=host.querySelector('[role=dialog] form');await fill(window,form.querySelector('input'),'Frozen rename');
 // The row can be refreshed independently; the mounted editor retains version 1.
 const refresh=[...host.querySelectorAll('button')].find(button=>button.textContent.includes('刷新') || button.textContent.includes('Refresh'));
 assert.ok(refresh);await act(async()=>refresh.click());assert.equal(reads,2);
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(writes.length,1);assert.equal(writes[0].version,1);assert.equal(writes[0].name,'Frozen rename');
 assert.equal(host.querySelector('[role=dialog] form'),null);
 await act(async()=>navigate('push','/not-found'));assert.equal(window.location.pathname,'/environments');
 await act(async()=>host.querySelector('[data-environment-retry]').click());assert.deepEqual(writes[1],writes[0]);
});

const environmentDraftKey=`memory-garden:environment-draft:v1:${encodeURIComponent('https://workbench.example')}:${encodeURIComponent('member-a')}`;
async function choose(window,select,value){await act(async()=>{select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));});}
test('unsent environment create survives remount without a write',async t=>{
 let writes=0;const app=await renderApp(t,async(path,init)=>{if(init.method!=='GET')writes++;return Response.json(page());});
 const form=()=>app.host.querySelector('[data-environment-create]');
 await fill(app.window,form().querySelector('[name=name]'),'Keep this environment');
 await choose(app.window,form().querySelector('[name=type]'),'temporary');
 await fill(app.window,form().querySelector('[name=taskId]'),'task-1');
 const unload=new app.window.Event('beforeunload',{cancelable:true});app.window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,true);
 assert.equal(writes,0);assert.ok(app.window.sessionStorage.getItem(environmentDraftKey).includes('Keep this environment'));
 await app.remount();
 assert.equal(form().querySelector('[name=name]').value,'Keep this environment');
 assert.equal(form().querySelector('[name=type]').value,'temporary');
 assert.equal(form().querySelector('[name=taskId]').value,'task-1');
 assert.equal(writes,0);
 const again=new app.window.Event('beforeunload',{cancelable:true});app.window.dispatchEvent(again);assert.equal(again.defaultPrevented,true);
});
test('unsent environment stays on screen when the tab cannot record it',async t=>{
 let writes=0;const {host,window}=await renderApp(t,async(path,init)=>{if(init.method!=='GET')writes++;return Response.json(page());});
 const storage=window.sessionStorage,original=storage.setItem;
 Object.defineProperty(storage,'setItem',{configurable:true,writable:true,value(key,value){if(String(key).includes('environment-draft'))throw Error('full');return original.call(storage,key,value);}});
 await fill(window,host.querySelector('[data-environment-create] [name=name]'),'Unrecorded environment');
 assert.equal(host.querySelector('[data-environment-create] [name=name]').value,'Unrecorded environment');
 assert.ok(host.textContent.includes('could not record'));assert.equal(writes,0);
});
test('a blocked environment draft allows leave and records only after discard',async t=>{
 const app=await renderApp(t,async()=>Response.json(page()));
 app.window.sessionStorage.setItem(environmentDraftKey,'{');
 await app.remount();
 assert.ok(app.host.textContent.includes("can't be read"));
 const unload=new app.window.Event('beforeunload',{cancelable:true});app.window.dispatchEvent(unload);assert.equal(unload.defaultPrevented,false);
 await act(async()=>{assert.equal(navigate('push','/not-found'),'committed');});
 await act(async()=>{assert.equal(navigate('push','/environments'),'committed');});
 const discard=app.host.querySelector('[data-environment-draft-blocked] button');assert.ok(discard);
 await act(async()=>discard.click());
 await fill(app.window,app.host.querySelector('[data-environment-create] [name=name]'),'After discard');
 assert.ok(app.window.sessionStorage.getItem(environmentDraftKey).includes('After discard'));
});
test('confirmed leave drops the stored environment draft',async t=>{
 const {host,window}=await renderApp(t,async()=>Response.json(page()));
 await fill(window,host.querySelector('[data-environment-create] [name=name]'),'Keep this environment');
 assert.ok(window.sessionStorage.getItem(environmentDraftKey).includes('Keep this environment'));
 await act(async()=>{assert.equal(navigate('push','/not-found'),'deferred');});
 await act(async()=>host.querySelector('[data-confirm-action]').click());
 assert.equal(window.sessionStorage.getItem(environmentDraftKey),null);
 await act(async()=>{assert.equal(navigate('push','/environments'),'committed');});
 assert.equal(host.querySelector('[data-environment-create] [name=name]').value,'');
});
test('unsent environment rename survives remount without a write',async t=>{
 let writes=0;const app=await renderApp(t,async(path,init)=>{if(init.method!=='GET')writes++;return Response.json(page());});
 await act(async()=>app.host.querySelector('[data-environment-rename]').click());
 await fill(app.window,app.host.querySelector('[role=dialog] input'),'Keep rename');
 assert.equal(writes,0);
 await app.remount();
 assert.equal(app.host.querySelector('[role=dialog] input').value,'Keep rename');
 assert.equal(writes,0);
});
