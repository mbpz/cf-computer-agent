import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
const inputs={port:61006,connectorId:'device-a',pairingCode:'a'.repeat(43)};
const options={origin:'https://workbench.example',memberId:'member-a'};
function fixture(){
 const requests=[],events=new EventTarget();
 const owner=createAccountNetworkOwner({...options,events,requester:async(path,init)=>{requests.push({path,...init});return new Promise(()=>{});}});
 return {owner,requests,events};
}
test('one account owns one network per environment and never connects implicitly',()=>{
 const {owner,requests}=fixture();assert.equal(owner.network('env-a'),owner.network('env-a'));assert.notEqual(owner.network('env-a'),owner.network('env-b'));assert.equal(requests.length,0);owner.dispose();
});
for(const action of ['dispose','pagehide'])test(`${action} synchronously cancels all authorization and permanently invalidates old handles`,async()=>{
 const f=fixture(),a=f.owner.network('env-a'),b=f.owner.network('env-b');
 const waiting=[assert.rejects(a.connect(inputs),/NETWORK_CANCELLED/),assert.rejects(b.connect(inputs),/NETWORK_CANCELLED/)];
 if(action==='dispose')f.owner.dispose();else f.events.dispatchEvent(new Event('pagehide'));
 assert.equal(f.owner.signal.aborted,true);assert.equal(a.state.status,'closed');assert.equal(b.state.status,'closed');assert.ok(f.requests.every(r=>r.signal.aborted));
 assert.throws(()=>f.owner.network('env-c'),/ACCOUNT_CLOSED/);await assert.rejects(a.connect(inputs),/NETWORK_CLOSED/);await Promise.all(waiting);f.owner.dispose();
});
test('environment removal immediately closes its old network without disrupting another environment',async()=>{
 const f=fixture(),a=f.owner.network('env-a'),b=f.owner.network('env-b');const pa=assert.rejects(a.connect(inputs),/NETWORK_CANCELLED/),pb=assert.rejects(b.connect(inputs),/NETWORK_CANCELLED/);
 f.owner.removeEnvironment('env-a');assert.equal(a.state.status,'closed');assert.equal(b.state.status,'connecting');assert.throws(()=>f.owner.network('env-a'),/ENVIRONMENT_REMOVED/);await pa;f.owner.dispose();await pb;
});
test('new account epochs do not reuse handles even for the same member',()=>{
 const a=fixture(),b=fixture();assert.notEqual(a.owner.scope.sessionEpoch,b.owner.scope.sessionEpoch);assert.ok(Object.isFrozen(a.owner.scope));a.owner.dispose();assert.equal(b.owner.signal.aborted,false);assert.equal(b.owner.network('env-a').state.status,'offline');b.owner.dispose();
});
test('invalid identities cannot allocate a usable owner or network',()=>{
 for(const patch of [{origin:'https://host/path'},{memberId:'../other'}])assert.throws(()=>createAccountNetworkOwner({...options,...patch}),/INVALID_SCOPE/);
 const {owner}=fixture();assert.throws(()=>owner.network('../other'),/INVALID_SCOPE/);owner.dispose();
});
