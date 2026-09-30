import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {fixture,pair,origin} from './helpers/connector-authority-fixture.mjs';
import {createAccountVmNetwork} from '../frontend/features/environments/account-network.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
async function connected(t){
 const f=await fixture(t);let sockets=0,current=true;const calls=[],events=new EventTarget();
 const runtime=createAccountVmNetwork({environmentId:'env-a',scope:{origin,memberId:'member-a',sessionEpoch:1},isCurrent:()=>current,
  events,clock:f.clock,requester:(path,init)=>{calls.push({path,method:init.method});return f.requester(path,init);},
  NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin}});sockets++;}},
 });t.after(()=>runtime.dispose());
 const identity=await(await fetch(f.server.url+'/identity')).json();
 const connect=async()=>runtime.connect({port:Number(new URL(f.server.url).port),connectorId:identity.connectorId,pairingCode:await pair(f)});
 await connect();return{f,runtime,calls,events,connect,get sockets(){return sockets;},switchAccount(){current=false;}};
}
test('account runtime reserves/signs/consumes via real Worker/D1 and renews once without re-pairing',{timeout:20000},async t=>{
 const x=await connected(t);assert.equal(x.runtime.state.status,'connected');assert.equal(await x.f.count(),1);
 const before=await x.f.db.prepare('SELECT generation FROM connector_authority_heads').first('generation');assert.equal(before,2);
 await x.f.advance(30000);
 for(let i=0;i<100&&await x.f.count()<2;i++)await tick();
 assert.equal(await x.f.count(),2);assert.equal(x.sockets,1);assert.equal(x.runtime.state.status,'connected');
 assert.equal(x.calls.filter(r=>r.path.endsWith('/connector-renewals')).length,1);
 x.runtime.beforeRestore();assert.equal(x.runtime.state.status,'offline');x.events.dispatchEvent(new Event('online'));assert.equal(x.sockets,1);
 await x.connect();assert.equal(x.runtime.state.status,'connected');assert.equal(x.sockets,2);assert.equal(await x.f.count(),3);
 assert.equal(await x.f.db.prepare('SELECT generation FROM connector_authority_heads').first('generation'),3);
});
test('account change before renewal closes the network without issuing using the new account cookie',{timeout:20000},async t=>{
 const x=await connected(t);x.switchAccount();await x.f.advance(30000);
 for(let i=0;i<100&&x.runtime.state.status!=='closed';i++)await tick();
 assert.equal(x.runtime.state.status,'closed');assert.equal(x.runtime.state.reason,'account-changed');
 assert.equal(x.calls.filter(r=>r.path.endsWith('/connector-renewals')).length,0);assert.equal(await x.f.count(),1);
 await assert.rejects(x.connect(),/NETWORK_CLOSED/);
});
test('deleted environment denies new authority and cannot be reopened by the UI',{timeout:20000},async t=>{
 const x=await connected(t);x.runtime.disconnect();
 const removed=await x.f.requester('/api/environments/env-a',{method:'DELETE',credentials:'same-origin',redirect:'error',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({operationId:'delete-from-product',version:1})});assert.equal(removed.status,200);
 await assert.rejects(x.connect(),/NETWORK_API_404/);assert.equal(x.sockets,1);assert.equal(await x.f.count(),1);
});
