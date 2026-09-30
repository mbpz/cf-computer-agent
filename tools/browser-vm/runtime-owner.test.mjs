import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { createAccountNetworkOwner } from '../../frontend/features/environments/account-network-owner.mjs';
import { createAccountVmRuntime, VM_RUNTIME_LOCK } from '../../frontend/features/environments/account-vm-runtime.mjs';
import { connectTerminal } from './terminal-client.mjs';
const boot = process.env.BROWSER_VM_PROBE_ASSETS, iso = process.env.BROWSER_VM_PROBE_ISO_ASSETS;
const environment = {id:'real-alpine',memberId:'diagnostic',type:'personal'};
const wait = ms => new Promise(r => setTimeout(r,ms));
test('actual Alpine Worker runtime: command, interrupt, stop, deletion, account exit and boot cancellation', {
  skip: (!boot || !iso) && 'Explicit development BIOS and ISO assets required', timeout: 120000,
}, async t => {
  const workers = [];
  t.after(async()=>{await Promise.all(workers.map(worker=>worker.terminate()));});
  function pair() {
    const owner = createAccountNetworkOwner({origin:'http://localhost:12345',memberId:'diagnostic'});
    const runtime = createAccountVmRuntime({owner,createSession(callbacks){
      const native = new Worker(new URL('./acceptance/terminal-node-worker.mjs',import.meta.url),{workerData:{boot,iso,engine:resolve('node_modules/v86/build')}});
      const record = {exited:false,terminate:()=>native.terminate()};workers.push(record);native.once('exit',()=>{record.exited=true;});
      let termination;const listeners = new Map();
      const worker = {
        addEventListener(type,fn){const listener = data=>fn(type==='message'?{data}:data);if(!listeners.has(type))listeners.set(type,new Map());listeners.get(type).set(fn,listener);native.on(type,listener);},
        removeEventListener(type,fn){native.off(type,listeners.get(type).get(fn));listeners.get(type).delete(fn);},
        postMessage: value=>native.postMessage(value), terminate(){return termination??=native.terminate();},
      };
      const terminal = connectTerminal({createWorker:()=>worker,...callbacks});
      return {ready:terminal.ready,write:terminal.write,close(){terminal.close();return worker.terminate();}};
    }});
    t.after(async()=>{owner.dispose();await runtime.stop();});return {owner,runtime};
  }
  async function until(runtime,pattern){const deadline=performance.now()+10000;while(performance.now()<deadline){if(pattern.test(runtime.getSnapshot().output))return;await wait(20);}assert.fail('Expected guest result not received: '+JSON.stringify(runtime.getSnapshot().output.slice(-1500)));}
  const first=pair();await first.runtime.start(environment);
  await first.runtime.write("printf '运行所有者真实文件' > /mnt/work/owner.txt\nuname -r\ncat /mnt/work/owner.txt; printf '\\nFILE-DONE\\n'\n");
  await until(first.runtime,/\r?\n6\.18\.35-0-virt\r?\n/);await until(first.runtime,/运行所有者真实文件\r?\nFILE-DONE\r?\n/);
  await first.runtime.write('sh -c "printf \'\\nSLEEP-STARTED\\n\'; exec sleep 30"\n');await until(first.runtime,/\r?\nSLEEP-STARTED\r?\n/);
  await first.runtime.write('\x03');await first.runtime.write("printf '\\nINTERRUPTED-OK\\n'\n");await until(first.runtime,/\r?\nINTERRUPTED-OK\r?\n/);
  const second=pair();await assert.rejects(second.runtime.start(environment),/VM_BUSY/);assert.equal(workers.length,1);
  await first.runtime.stop();assert.equal(workers[0].exited,true);assert.equal(first.runtime.getSnapshot().output,'');
  await first.runtime.start(environment);first.owner.removeEnvironment(environment.id);await first.runtime.stop();assert.equal(workers[1].exited,true);
  await second.runtime.start(environment);second.owner.dispose();assert.equal(second.runtime.getSnapshot().output,'');await second.runtime.stop();assert.equal(workers[2].exited,true);
  const third=pair();const starting=third.runtime.start(environment);const rejection=assert.rejects(starting,/ACCOUNT_CLOSED/);
  while(workers.length<4)await wait(1);third.owner.dispose();await rejection;await third.runtime.stop();assert.equal(workers[3].exited,true);
  assert.equal((await navigator.locks.query()).held.filter(lock=>lock.name===VM_RUNTIME_LOCK).length,0);
  assert.equal(workers.length,4);console.log(JSON.stringify({realAlpineWorkers:4,allExited:workers.every(w=>w.exited),kernel:'6.18.35-0-virt',network:'off',productionAcceptance:false}));
});
