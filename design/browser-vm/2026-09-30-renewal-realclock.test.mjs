// Local real-clock Worker/D1 + WebSocket control. No VM or public TCP.
import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {fixture,pair,origin} from '../../scripts/helpers/connector-authority-fixture.mjs';
import {createConnectorEgressClient} from '../../tools/browser-vm/connector/egress-client.mjs';
test('real-clock formal channel survives three renewals', {timeout:115000}, async t=>{
 const f=await fixture(t,{resolveDestination(){throw Error('No DNS permitted in renewal control');},dial(){throw Error('No TCP permitted in renewal control');}},{realtime:true});
 let readyResolve,readyReject,client,renewals=0,closed=false,done=false;
 const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 const timer=setTimeout(()=>readyReject(Error('Ready timeout')),10000);
 t.after(()=>{done=true;clearTimeout(timer);client?.close();});
 client=createConnectorEgressClient({url:f.server.url.replace('http:','ws:')+'/connector',pairingCode:await pair(f),ticket:f.ticket,clock:f.clock,
  NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin}});}},
  renewTicket:async lease=>{const response=await f.api('connector-renewals',{...f.binding,leaseId:lease.leaseId,operationId:crypto.randomUUID()});assert.equal(response.status,201);renewals++;console.log(JSON.stringify({renewals,revision:lease.revision}));return(await response.json()).ticket;},
  onReady:readyResolve,onFrame:()=>{},onClose:()=>{if(!done){closed=true;readyReject(Error('Unexpected channel closure'));}}
 });
 await ready;clearTimeout(timer);console.log('ready');
 await new Promise(resolve=>{const wait=setTimeout(resolve,100000);t.after(()=>clearTimeout(wait));});
 assert.equal(closed,false);assert.equal(client.readyState,1);assert.equal(renewals,3);
 console.log(JSON.stringify({passed:true,durationMs:100000,renewals,noPublicTcp:true}));
});
