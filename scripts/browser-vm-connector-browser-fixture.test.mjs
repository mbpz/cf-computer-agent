import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { fixture, pair } from './helpers/connector-authority-fixture.mjs';
import { createConnectorEgressClient } from '../tools/browser-vm/connector/egress-client.mjs';

// A ignored caller-selected test origin, fake clock or fake consume ACK must fail.
test('HTTPS browser fixture binds the real signed authority to its explicit origin and real clock', {timeout:20000}, async t=>{
 const allowedOrigin='https://browser-acceptance.example';
 const f=await fixture(t,undefined,{allowedOrigin,realtime:true});
 const identity=await(await fetch(f.server.url+'/identity')).json();assert.equal(identity.allowedOrigin,allowedOrigin);
 const before=f.clock.wallNow();await new Promise(resolve=>setTimeout(resolve,20));assert.ok(f.clock.wallNow()>before);
 await new Promise(resolve=>f.clock.setTimer(resolve,1));
 let readyResolve,readyReject;const ready=new Promise((res,rej)=>{readyResolve=res;readyReject=rej;});
 const client=createConnectorEgressClient({url:f.server.url.replace('http:','ws:')+'/connector',pairingCode:await pair(f),ticket:f.ticket,
 NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin:allowedOrigin}});}},
 renewTicket:lease=>f.renewal(lease.leaseId),onReady:readyResolve,onFrame(){},onClose:()=>readyReject(Error('closed before ready'))});
 t.after(()=>client.close());const lease=await ready;assert.ok(lease.expiresAtMs>Date.now());assert.ok(lease.expiresAtMs<=Date.now()+60000);assert.equal(await f.count(),1);
});
