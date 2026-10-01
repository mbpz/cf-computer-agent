import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
let createRuntime;
before(async()=>{const {outputFiles}=await build({entryPoints:['frontend/features/environments/authenticated-vm-runtime.ts'],bundle:true,write:false,platform:'node',format:'esm'});({createAuthenticatedVmRuntime:createRuntime}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64')));});
const env={id:'env',memberId:'alice',type:'personal'};
const metadata={...env,name:'VM',taskId:null,version:1,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
const session={member:{id:'alice',email:'alice@example.com',role:'admin'},capabilities:['vm:use'],logoutUrl:'/logout'};
function fixture(t,{requester,timeoutMs=100}={}) {
 const owner=createAccountNetworkOwner({origin:'https://example.com',memberId:'alice'}),events=[];
 const runtime=createRuntime({owner,timeoutMs,autoSaveMs:0,locks:{request:async(n,o,fn)=>fn({})},requester:async(path,init)=>{events.push(path);assert.equal(init.credentials,'same-origin');assert.equal(init.cache,'no-store');assert.equal(init.redirect,'error');return requester?requester(path,init):Response.json(path==='/api/session'?session:{environment:metadata});},checkpoints:{load:async()=>{events.push('load');return {checkpoint:{},headRevision:1,revision:1};}},createSession:()=>{events.push('boot');return {ready:Promise.resolve(),write:async()=>{},close:async()=>events.push('close')};}});
 t.after(async()=>{owner.dispose();await runtime.stop();});return {owner,runtime,events};
}
test('each explicit start and restore revalidate authority before reading bytes or creating Worker',async t=>{
 const a=fixture(t);await a.runtime.start(env,{restore:true});assert.deepEqual(a.events,['/api/session','/api/environments/env','load','boot']);await a.runtime.stop();await a.runtime.start(env);assert.deepEqual(a.events.slice(-3),['/api/session','/api/environments/env','boot']);
});
for(const [label,payload] of [['switched account',{...session,member:{...session.member,id:'bob'}}],['revoked permission',{...session,capabilities:[]}]])test(label+' closes authority without loading local bytes',async t=>{
 const a=fixture(t,{requester:async()=>Response.json(payload)});await assert.rejects(a.runtime.start(env,{restore:true}));assert.equal(a.owner.signal.aborted,true);assert.deepEqual(a.events,['/api/session']);
});
for(const status of [401,403,404,500])test('metadata HTTP '+status+' refuses boot and never infers local deletion',async t=>{
 const a=fixture(t,{requester:async path=>path==='/api/session'?Response.json(session):new Response('',{status})});await assert.rejects(a.runtime.start(env,{restore:true}));assert.equal(a.events.includes('load'),false);assert.equal(a.events.includes('boot'),false);assert.equal(a.owner.signal.aborted,status===401||status===403);
});
for(const bad of [{...metadata,memberId:'bob'},{...metadata,id:'other'},{...metadata,type:'temporary'},{...metadata,version:0}])test('mismatching metadata refuses stale environment '+JSON.stringify(bad),async t=>{
 const a=fixture(t,{requester:async path=>Response.json(path==='/api/session'?session:{environment:bad})});await assert.rejects(a.runtime.start(env));assert.equal(a.events.includes('boot'),false);
});
test('uncooperative request is bounded and explicit retry does not reuse authorization',async t=>{
 let hang=true,signal;const a=fixture(t,{timeoutMs:10,requester:async(path,init)=>{signal=init.signal;if(hang)return new Promise(()=>{});return Response.json(path==='/api/session'?session:{environment:metadata});}});
 await assert.rejects(a.runtime.start(env),/STARTUP_REVALIDATION_FAILED/);assert.equal(signal.aborted,true);await a.runtime.stop();hang=false;await a.runtime.start(env);assert.equal(a.events.filter(x=>x==='/api/session').length,2);
});
test('stop cancels pending startup and late success cannot read bytes or boot',async t=>{
 let release;const a=fixture(t,{requester:()=>new Promise(r=>release=r)});const pending=assert.rejects(a.runtime.start(env,{restore:true}));while(!release)await new Promise(r=>setTimeout(r,1));await a.runtime.stop();await pending;release(Response.json(session));await new Promise(r=>setTimeout(r,5));assert.deepEqual(a.events,['/api/session']);
});
test('metadata already in flight is canceled by owner invalidation; no late restore',async t=>{
 let release;const a=fixture(t,{requester:async path=>path==='/api/session'?Response.json(session):new Promise(r=>release=r)});const rejected=assert.rejects(a.runtime.start(env,{restore:true}));while(!release)await new Promise(r=>setTimeout(r,1));a.owner.revoke();await rejected;await a.runtime.stop();release(Response.json({environment:metadata}));await new Promise(r=>setTimeout(r,5));assert.deepEqual(a.events,['/api/session','/api/environments/env']);
});
test('invalid session response and transport failure fail closed without retry or deletion',async t=>{
 for(const requester of [async()=>Response.json({}),async()=>{throw Error('offline');}]) {const a=fixture(t,{requester});await assert.rejects(a.runtime.start(env,{restore:true}));assert.deepEqual(a.events,['/api/session']);}
});
