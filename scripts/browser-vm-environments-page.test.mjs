import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
import React,{act} from 'react';
import {Window} from 'happy-dom';
let dir,createManager,App;
before(async()=>{
 dir=await mkdtemp(new URL('./.environment-page-',import.meta.url).pathname);
 await build({stdin:{contents:`export {getEnvironmentManager} from './frontend/features/environments/environment-manager'; export {App} from './frontend/app';`,resolveDir:process.cwd(),loader:'ts'},outfile:dir+'/module.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env.DEV':'false'}});
 const m=await import(dir+'/module.mjs');createManager=m.getEnvironmentManager;App=m.App;
});
after(async()=>{if(dir)await rm(dir,{recursive:true,force:true});});
const owners=[];afterEach(()=>{for(const x of owners.splice(0))x.dispose();});
const env={id:'env-a',memberId:'member-a',name:'Linux',type:'personal',taskId:null,version:1,createdAt:'2026-09-30T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z'};
const page=(items=[env],n=1,total=items.length)=>({items,pagination:{page:n,pageSize:20,total,totalPages:Math.ceil(total/20)}});
function setup(requester){const owner=createAccountNetworkOwner({origin:'https://workbench.example',memberId:'member-a'});owners.push(owner);return{owner,manager:createManager(owner,requester)};}
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
  return requester(path,init);
 }})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(host);t.after(async()=>{await act(async()=>root.unmount());await window.happyDOM.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 await act(async()=>root.render(React.createElement(App)));return{host,window,root};
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
 });
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
test('actual App keeps unknown operation across route changes and explicitly retries the same body',async t=>{
 const bodies=[];let lost=true,rows=[];
 const {host,window}=await renderApp(t,async(path,init)=>{
  if(init.method==='GET')return Response.json(page(rows));
  bodies.push(init.body);const body=JSON.parse(init.body);rows=[{...env,name:body.name}];
  if(lost){lost=false;throw Error('lost response');}return Response.json({environment:rows[0]});
 });
 const form=host.querySelector('[data-environment-create]');await fill(window,form.querySelector('[name=name]'),'Keep intent');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.ok(host.querySelector('[data-environment-retry]'));assert.equal(bodies.length,1);
 await act(async()=>{window.history.pushState({},'', '/not-found');window.dispatchEvent(new window.PopStateEvent('popstate'));});
 assert.equal(host.querySelector('[data-environments-page]'),null);
 await act(async()=>{window.history.pushState({},'', '/environments');window.dispatchEvent(new window.PopStateEvent('popstate'));});
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
