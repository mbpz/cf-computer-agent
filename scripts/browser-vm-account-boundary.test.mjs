import {test, before, after, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {Window} from 'happy-dom';
let directory, Boundary, useOwner, closeBeforeLogout, App;
const mounted=[];
before(async()=>{
 directory=await mkdtemp(new URL('./.account-boundary-',import.meta.url).pathname);
 await build({stdin:{contents:`export {AccountNetworkBoundary,useAccountNetworkOwner} from './frontend/features/environments/account-network-boundary'; export {logoutAccount} from './frontend/lib/logout-account'; export {App} from './frontend/app';`,resolveDir:process.cwd(),loader:'tsx'},outfile:directory+'/boundary.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',define:{'import.meta.env.DEV':'false'}});
 const m=await import(directory+'/boundary.mjs');Boundary=m.AccountNetworkBoundary;useOwner=m.useAccountNetworkOwner;closeBeforeLogout=m.logoutAccount;App=m.App;
});
after(async()=>{if(directory)await rm(directory,{recursive:true,force:true});});
afterEach(async()=>{for(const x of mounted.splice(0)){await act(async()=>x.root.unmount());await x.browser.happyDOM.close();}for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}originals.clear();});
const originals=new Map();
function setup(url='https://workbench.example/settings'){
 const browser=new Window({url});
 for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,history:browser.history,location:browser.location,HTMLElement:browser.HTMLElement,MutationObserver:browser.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true,fetch:()=>new Promise(()=>{})})){
  originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 const host=browser.document.createElement('div');browser.document.body.append(host);const root=createRoot(host);mounted.push({root,browser});return{root,browser,host};
}
const input={port:61006,connectorId:'device-a',pairingCode:'a'.repeat(43)};
function Capture({owners}){const owner=useOwner();if(!owners.includes(owner))owners.push(owner);return React.createElement('span',null,owner.scope.memberId);}
const render=(memberId,owners)=>React.createElement(Boundary,{memberId},()=>React.createElement(Capture,{owners}));
test('actual React account boundary closes pending authorization before account replacement',async()=>{
 const f=setup(),owners=[];await act(async()=>f.root.render(render('member-a',owners)));const first=owners.at(-1),old=first.network('env-a');const pending=assert.rejects(old.connect(input),/NETWORK_CANCELLED/);
 await act(async()=>f.root.render(render('member-b',owners)));await pending;
 assert.equal(first.signal.aborted,true);assert.equal(old.state.status,'closed');assert.equal(f.host.textContent,'member-b');assert.equal(owners.at(-1).signal.aborted,false);assert.notEqual(first.scope.sessionEpoch,owners.at(-1).scope.sessionEpoch);
});
test('StrictMode effect replay leaves a live new owner and unmount closes it',async()=>{
 const f=setup(),owners=[];await act(async()=>f.root.render(React.createElement(React.StrictMode,null,render('member-a',owners))));const owner=owners.at(-1);assert.equal(owner.signal.aborted,false);
 const network=owner.network('env-a'),pending=assert.rejects(network.connect(input),/NETWORK_CANCELLED/);
 await act(async()=>f.root.render(null));await pending;assert.equal(owner.signal.aborted,true);assert.equal(network.state.status,'closed');
});
test('pagehide retires the owner and online does not revive it',async()=>{
 const f=setup(),owners=[];await act(async()=>f.root.render(render('member-a',owners)));const owner=owners.at(-1),network=owner.network('env-a');
 const pending=assert.rejects(network.connect(input),/NETWORK_CANCELLED/);f.browser.dispatchEvent(new f.browser.Event('pagehide'));await pending;f.browser.dispatchEvent(new f.browser.Event('online'));assert.equal(owner.signal.aborted,true);assert.throws(()=>owner.network('env-b'),/ACCOUNT_CLOSED/);
});
test('logout closes authorization before the HTTP request, and failed logout cannot restore it',async()=>{
 const f=setup(),owners=[];await act(async()=>f.root.render(render('member-a',owners)));const owner=owners.at(-1),network=owner.network('env-a');const pending=assert.rejects(network.connect(input),/NETWORK_CANCELLED/);
 let requested=0;await assert.rejects(closeBeforeLogout(owner,'/auth/logout',async()=>{requested++;assert.equal(network.state.status,'closed');assert.equal(owner.signal.aborted,true);return new Response(null,{status:503});}),/The request failed/);
 await pending;assert.equal(requested,1);assert.throws(()=>owner.network('env-a'),/ACCOUNT_CLOSED/);
});
test('confirmed logout requires an anonymous session check after server success',async()=>{
 const f=setup(),owners=[];await act(async()=>f.root.render(render('member-a',owners)));const owner=owners.at(-1),requests=[];
 await closeBeforeLogout(owner,'/auth/logout',async(path,init)=>{requests.push([path,init.method??'GET',init.credentials]);return path==='/auth/logout'?new Response(null,{status:204}):Response.json({error:{code:'AUTH_REQUIRED',message:'Sign in',retryable:false}},{status:401});});
 assert.deepEqual(requests,[['/auth/logout','POST','same-origin'],['/api/session','GET','same-origin']]);assert.equal(owner.signal.aborted,true);
});
test('logout cannot be reported successful if the session cookie remains authenticated',async()=>{
 const f=setup(),owners=[];await act(async()=>f.root.render(render('member-a',owners)));
 await assert.rejects(closeBeforeLogout(owners.at(-1),'/auth/logout',async(path)=>path==='/auth/logout'?new Response(null,{status:204}):Response.json({member:{id:'member-a',email:'a@test',role:'contributor'},capabilities:[],logoutUrl:'/auth/logout'})),/LOGOUT_NOT_CONFIRMED/);
});

test('HTTP development shell remains available but cannot open an insecure network',async()=>{
 const f=setup('http://localhost:5173/settings'),owners=[];await act(async()=>f.root.render(render('member-a',owners)));
 assert.equal(f.host.textContent,'member-a');assert.throws(()=>owners.at(-1).network('env-a'),/INVALID_SCOPE/);
});
test('actual App settings shell uses confirmed logout and renders anonymous state',async()=>{
 const f=setup(),requests=[];let loggedOut=false;
 globalThis.fetch=async(path,init={})=>{
  requests.push(String(path));
  if(path==='/auth/logout'){loggedOut=true;return new Response(null,{status:204});}
  if(path==='/api/session')return loggedOut?Response.json({error:{code:'AUTH_REQUIRED',message:'Sign in',retryable:false}},{status:401}):Response.json({member:{id:'member-a',email:'a@example.test',role:'contributor'},capabilities:[],logoutUrl:'/auth/logout'});
  if(path==='/api/navigation')return Response.json({items:[]});
  if(path==='/api/telemetry/pageview')return new Response(null,{status:204});
  throw new Error('Unexpected request: '+path);
 };
 await act(async()=>f.root.render(React.createElement(App)));
 assert.ok(f.host.textContent.includes('a@example.test'));
 const account=f.host.querySelector('[data-shell-account-footer] button');assert.ok(account,'account menu must render');
 await act(async()=>account.click());
 const logout=f.host.querySelector('[data-account-logout]');assert.ok(logout,'logout action must render');
 await act(async()=>logout.click());
 assert.equal(requests.filter(x=>x==='/auth/logout').length,1);assert.equal(requests.filter(x=>x==='/api/session').length,2);
 assert.equal(f.browser.location.pathname,'/');assert.equal(f.host.querySelector('[data-shell-account-footer]'),null);
});
