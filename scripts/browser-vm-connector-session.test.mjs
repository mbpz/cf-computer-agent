import { test as nodeTest } from 'node:test';
const test = (name, run) => nodeTest(name, {timeout:2000}, run);
import assert from 'node:assert/strict';
import { createVmConnectorSession } from '../frontend/features/environments/connector-session.mjs';

function deferred() { let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject}; }
function fixture() {
 const authority=deferred(), abort=new AbortController();let callbacks,requested=0,sockets=0,closed=0,attached=0,networkClosed=0,notified=0;
 const frames=[];
 const session=createVmConnectorSession({signal:abort.signal,onClose(){notified++;},
  authorize(signal){assert.equal(signal,abort.signal);requested++;return authority.promise;},renewTicket:async()=>'',
  createClient(options){callbacks=options;sockets++;return{readyState:1,close(){closed++;options.onClose();}};},
  attachNetwork({machine,client}){assert.equal(machine,'paused-machine');assert.equal(client.readyState,1);attached++;return{receive(frame){frames.push(frame);},close(){networkClosed++;}};},
 });
 return {session,authority,abort,frames,grant(){authority.resolve({url:'ws://127.0.0.1:1/connector',pairingCode:'pair',ticket:'ticket'});},
  get callbacks(){return callbacks;},get stats(){return{requested,sockets,closed,attached,networkClosed,notified};}};
}

test('aborted authorization cannot create a late socket',async()=>{
 const f=fixture();const rejected=assert.rejects(f.session.ready,/NETWORK_CANCELLED/);f.abort.abort();await rejected;f.grant();await Promise.resolve();
 assert.equal(f.stats.sockets,0);assert.equal(f.stats.notified,1);assert.throws(()=>f.session.attach('paused-machine'),/NETWORK_NOT_READY/);
});

test('ready session attaches once; close clears guest and transport without destroying VM',async()=>{
 const f=fixture();f.grant();await Promise.resolve();f.callbacks.onReady();await f.session.ready;
 f.session.attach('paused-machine');f.callbacks.onFrame('bounded-frame');assert.deepEqual(f.frames,['bounded-frame']);
 assert.throws(()=>f.session.attach('paused-machine'),/NETWORK_ALREADY_ATTACHED/);
 f.session.close();f.session.close();f.callbacks.onFrame('late-frame');
 assert.deepEqual(f.stats,{requested:1,sockets:1,closed:1,attached:1,networkClosed:1,notified:1});assert.equal(f.frames.length,1);
});

test('connector exit closes guest and notifies owner once',async()=>{
 const f=fixture();f.grant();await Promise.resolve();f.callbacks.onReady();await f.session.ready;f.session.attach('paused-machine');f.callbacks.onClose();
 assert.equal(f.stats.networkClosed,1);assert.equal(f.stats.closed,1);assert.equal(f.stats.notified,1);
});

test('authorization failure is sanitized and never retried',async()=>{
 const f=fixture();f.authority.reject(Error('secret-ticket-value'));await assert.rejects(f.session.ready,{message:'NETWORK_AUTHORIZATION_FAILED'});
 assert.equal(f.stats.requested,1);assert.equal(f.stats.sockets,0);assert.equal(f.stats.notified,1);
});

test('preaborted sessions do not call authorization',async()=>{
 const abort=new AbortController();abort.abort();let called=0;
 const session=createVmConnectorSession({signal:abort.signal,authorize(){called++;},renewTicket:async()=>'',onClose(){}});
 await assert.rejects(session.ready,/NETWORK_CANCELLED/);assert.equal(called,0);
});

test('close before handshake rejects ready and late ready does not reopen it',async()=>{
 const f=fixture();f.grant();await Promise.resolve();f.callbacks.onClose();await assert.rejects(f.session.ready,/NETWORK_CANCELLED/);
 f.callbacks.onReady();assert.throws(()=>f.session.attach('paused-machine'),/NETWORK_NOT_READY/);assert.equal(f.stats.sockets,1);
});

test('synchronous client failure still closes the resource returned after its callback',async()=>{
 let closed=0,notice=0;const session=createVmConnectorSession({signal:new AbortController().signal,authorize:async()=>({}),renewTicket:async()=>'',onClose(){notice++;},
 createClient({onClose}){onClose();return{close(){closed++;},readyState:3};}});
 await assert.rejects(session.ready,/NETWORK_CANCELLED/);assert.equal(closed,1);assert.equal(notice,1);
});

test('adapter failure closes client and cannot be retried on the same session',async()=>{
 let ready,closed=0;const session=createVmConnectorSession({signal:new AbortController().signal,authorize:async()=>({}),renewTicket:async()=>'',onClose(){},
 createClient({onReady}){ready=onReady;return{readyState:1,close(){closed++;}};},attachNetwork(){throw Error('unsafe engine');}});
 await Promise.resolve();ready();await session.ready;assert.throws(()=>session.attach({}),/NETWORK_ATTACH_FAILED/);
 assert.equal(closed,1);assert.throws(()=>session.attach({}),/NETWORK_NOT_READY/);
});
