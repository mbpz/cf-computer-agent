import assert from 'node:assert/strict';
import test from 'node:test';
import { attachTerminalWorker } from '../tools/browser-vm/terminal-worker-endpoint.mjs';

class Port extends EventTarget {
  messages = [];
  closed = false;
  postMessage(data) { this.messages.push(data); }
  close() { this.closed = true; }
  send(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('duplicate serial request cannot replay guest input and closes the session', async () => {
  const port = new Port();
  const inputs = [];
  let closed = false;
  attachTerminalWorker(port, async () => ({ ready: Promise.resolve(), write: text => inputs.push(text), close: async () => { closed = true; } }));
  port.send({ type: 'start', id: 1 });
  await tick();
  assert.deepEqual(port.messages[0], { type: 'ready', id: 1 });
  port.send({ type: 'input', id: 2, text: 'touch /tmp/once\n' });
  port.send({ type: 'input', id: 2, text: 'touch /tmp/once\n' });
  await tick();
  assert.deepEqual(inputs, ['touch /tmp/once\n']);
  assert.equal(port.messages.at(-1).type, 'failure');
  assert.equal(port.closed, true);
  assert.equal(closed, true);
});

test('closing while assets load destroys a late session instead of posting ready', async () => {
  const port = new Port();
  let finish;
  let closed = false;
  attachTerminalWorker(port, () => new Promise(resolve => { finish = resolve; }));
  port.send({ type: 'start', id: 1 });
  port.send({ type: 'start', id: 2 });
  finish({ ready: Promise.resolve(), close: async () => { closed = true; } });
  await tick();
  assert.equal(closed, true);
  assert.equal(port.messages.some(message => message.type === 'ready'), false);
});

test('a late session boot rejection is consumed after the endpoint already failed', async () => {
  const port = new Port();
  let finish;
  let rejectReady;
  attachTerminalWorker(port, () => new Promise(resolve => { finish = resolve; }));
  port.send({ type: 'start', id: 1 });
  port.send({ type: 'start', id: 2 });
  finish({
    ready: new Promise((_, reject) => { rejectReady = reject; }),
    close: async () => { rejectReady(new Error('Terminal closed during boot')); },
  });
  await tick();
  assert.equal(port.messages.filter(message => message.type === 'failure').length, 1);
  assert.equal(port.closed, true);
});

test('output is emitted only in response to an explicit poll with its matching request id', async () => {
  const port = new Port();
  attachTerminalWorker(port, async () => ({ ready: Promise.resolve(), drain: () => ({ bytes: new Uint8Array([65]), droppedBytes: 7 }), close: async () => {} }));
  port.send({ type: 'start', id: 1 });
  await tick();
  assert.equal(port.messages.length, 1);
  port.send({ type: 'poll', id: 2 });
  assert.deepEqual(port.messages[1], { type: 'output', id: 2, bytes: new Uint8Array([65]), droppedBytes: 7 });
});


test('file business errors are bounded receipts, not terminal failures; one operation at a time', async () => {
  const port = new Port(); let release, calls = 0;
  attachTerminalWorker(port, async () => ({ready:Promise.resolve(),close:async()=>{},
    file: async input => {calls++;if(input.op==='readText')throw Error('FILE_CONFLICT');return new Promise(r=>{release=r;});},
  }));
  port.send({type:'start',id:1});await tick();
  port.send({type:'file',id:2,input:{op:'readText',path:'/a'}});await tick();
  assert.deepEqual(port.messages.at(-1),{type:'file-result',id:2,error:'FILE_CONFLICT'});assert.equal(port.closed,false);
  port.send({type:'file',id:3,input:{op:'list',path:'/'}});
  port.send({type:'file',id:4,input:{op:'list',path:'/'}});await tick();
  assert.equal(port.messages.at(-1).error,'FILES_BUSY');assert.equal(calls,2);
  release({entries:[]});await tick();assert.equal(port.messages.at(-1).id,3);
});

test('worker passes explicit restore envelope, transfers checkpoint and sanitizes checkpoint errors',async()=>{
 const port=new Port();let restore,fail=false;const record={schemaVersion:1,identity:{engineVersion:'v1',imageVersion:'v1',memoryBytes:1,filesystem:'ram-root+in-memory-9p+readonly-iso'},state:new Uint8Array([1]).buffer,bytes:1,sha256:'a'.repeat(64)};
 attachTerminalWorker(port,async input=>{restore=input;return{ready:Promise.resolve(),close:async()=>{},checkpoint:async()=>{if(fail)throw Error('private data');return record;}};});
 port.send({type:'start',id:1,checkpoint:record});await tick();assert.equal(restore,record);port.send({type:'checkpoint',id:2});await tick();assert.equal(port.messages.at(-1).value,record);
 fail=true;port.send({type:'checkpoint',id:3});await tick();assert.deepEqual(port.messages.at(-1),{type:'checkpoint-result',id:3,error:'CHECKPOINT_SAVE_FAILED'});assert.equal(port.closed,false);
});
test('closed checkpoint session is a fatal sanitized failure, not a reusable business receipt',async()=>{
 const port=new Port();attachTerminalWorker(port,async()=>({ready:Promise.resolve(),state:'closed',close:async()=>{},checkpoint:async()=>{throw Error('private engine failure');}}));
 port.send({type:'start',id:1});await tick();port.send({type:'checkpoint',id:2});await tick();
 assert.equal(port.closed,true);assert.deepEqual(port.messages.at(-1),{type:'failure',message:'CHECKPOINT_SESSION_FAILED'});
});


test('ready forwards optional public image counters without changing ordinary receipts', async () => {
  const port = new Port();
  const imageLoad = {cache:'unavailable',requests:18,cacheHits:0,verifiedImages:6};
  attachTerminalWorker(port, async () => ({ready:Promise.resolve(),imageLoad,close:async()=>{}}));
  port.send({type:'start',id:1});
  await tick();
  assert.deepEqual(port.messages[0],{type:'ready',id:1,imageLoad});
});
