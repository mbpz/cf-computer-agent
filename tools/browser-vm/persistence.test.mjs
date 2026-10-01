import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {IDBFactory} from 'fake-indexeddb';
import {V86} from 'v86';
import {prepareAlpineIso} from './alpine-iso.mjs';
import {connectTerminal} from './terminal-client.mjs';
import {createAccountNetworkOwner} from '../../frontend/features/environments/account-network-owner.mjs';
import {createAccountVmRuntime} from '../../frontend/features/environments/account-vm-runtime.mjs';
import {createCheckpointStore} from '../../frontend/features/environments/storage/checkpoints.mjs';
const boot=process.env.BROWSER_VM_PROBE_ASSETS,iso=process.env.BROWSER_VM_PROBE_ISO_ASSETS;
const environment={id:'saved-alpine',memberId:'diagnostic',type:'personal'};
test('real Alpine: persist full checkpoint, destroy Worker/account, restore root and shared files offline in a new instance',{
 skip:(!boot||!iso)&&'Explicit development BIOS and ISO assets required',timeout:120000,
},async t=>{
 const engine=resolve('node_modules/v86/build');
 const profile=await prepareAlpineIso({Engine:V86,readAsset:artifact=>readFile(join({boot,iso,engine}[artifact.location],artifact.name))});
 const indexedDB=new IDBFactory(),workers=[];
 t.after(async()=>{await Promise.all(workers.map(w=>w.native.terminate()));});
 function pair(){
  const owner=createAccountNetworkOwner({origin:'http://localhost:12345',memberId:'diagnostic'});
  const checkpoints=createCheckpointStore({owner,indexedDB,identity:profile.checkpointIdentity,estimate:async()=>({quota:2**31,usage:0})});
  const runtime=createAccountVmRuntime({owner,checkpoints,autoSaveMs:0,createSession(callbacks){
   const native=new Worker(new URL('./acceptance/terminal-node-worker.mjs',import.meta.url),{workerData:{boot,iso,engine}});
   const record={native,exited:false};workers.push(record);native.once('exit',()=>{record.exited=true;});
   const listeners=new Map();let termination;
   const worker={addEventListener(type,fn){const handler=data=>fn(type==='message'?{data}:data);if(!listeners.has(type))listeners.set(type,new Map());listeners.get(type).set(fn,handler);native.on(type,handler);},removeEventListener(type,fn){native.off(type,listeners.get(type).get(fn));listeners.get(type).delete(fn);},postMessage:data=>native.postMessage(data),terminate:()=>termination??=native.terminate()};
   const terminal=connectTerminal({...callbacks,createWorker:()=>worker,checkpointTimeoutMs:30000});
   return{ready:terminal.ready,write:terminal.write,file:terminal.file,checkpoint:terminal.checkpoint,async close(){terminal.close();await worker.terminate();}};
  }});
  t.after(async()=>{owner.dispose();await runtime.stop();checkpoints.close();});return{owner,runtime,checkpoints};
 }
 async function until(runtime,pattern){const end=performance.now()+10000;while(performance.now()<end){if(pattern.test(runtime.getSnapshot().output))return;await new Promise(r=>setTimeout(r,20));}assert.fail('Guest result not received: '+JSON.stringify(runtime.getSnapshot().output.slice(-800)));}
 const first=pair();await first.runtime.start(environment);
 await first.runtime.write("printf 'shared survives' > /mnt/work/persisted.txt; printf 'root survives' > /root/persisted.txt; printf '\\nWRITTEN-OK\\n'\n");await until(first.runtime,/\r?\nWRITTEN-OK\r?\n/);
 // A stream lease has paused the guest: reject checkpoint rather than resuming it behind the lease.
 const download=await first.runtime.file({op:'downloadBegin',path:'/persisted.txt'});await assert.rejects(first.runtime.save(),/CHECKPOINT_SAVE_FAILED/);await first.runtime.file({op:'downloadEnd',path:'/persisted.txt',token:download.token});
 const receipt=await first.runtime.saveAndStop();assert.equal(receipt.revision,1);assert.equal(workers[0].exited,true);first.owner.dispose();first.checkpoints.close();
 const second=pair();await second.runtime.start(environment,{restore:true});
 assert.equal((await second.runtime.file({op:'readText',path:'/persisted.txt'})).text,'shared survives');
 await second.runtime.write("cat /root/persisted.txt; printf '\\nRESTORED-OK\\n'; cat /etc/alpine-release\n");await until(second.runtime,/root survives\r?\nRESTORED-OK\r?\n3\.24\.1/);
 assert.equal((await second.runtime.save()).revision,2);await second.runtime.stop();assert.equal(workers.length,2);assert.equal(workers.every(w=>w.exited),true);
 console.log(JSON.stringify({realAlpine:true,rootAndSharedFilesRestored:true,newWorkerAndOwner:true,offline:true,checkpointBytes:receipt.bytes,checkpoints:2,workersExited:2,indexedDB:'fake-indexeddb boundary, not native browser acceptance',productionAcceptance:false}));
});
