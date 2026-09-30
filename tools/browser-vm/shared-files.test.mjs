import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { resolve, join } from 'node:path';
import { mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { writeFileDownload } from '../../frontend/features/environments/files/stream-download.mjs';
import { createAccountNetworkOwner } from '../../frontend/features/environments/account-network-owner.mjs';
import { createAccountVmRuntime, VM_RUNTIME_LOCK } from '../../frontend/features/environments/account-vm-runtime.mjs';
import { connectTerminal } from './terminal-client.mjs';
const boot = process.env.BROWSER_VM_PROBE_ASSETS, iso = process.env.BROWSER_VM_PROBE_ISO_ASSETS;
const environment = {id:'real-alpine',memberId:'diagnostic',type:'personal'};
const wait = ms => new Promise(r => setTimeout(r,ms));
test('actual Alpine Worker files: guest roundtrip, conflict, links, pagination, mutations and termination', {
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
      return {ready:terminal.ready,write:terminal.write,file:terminal.file,close(){terminal.close();return worker.terminate();}};
    }});
    t.after(async()=>{owner.dispose();await runtime.stop();});return {owner,runtime};
  }
  async function until(runtime,pattern){const deadline=performance.now()+10000;while(performance.now()<deadline){if(pattern.test(runtime.getSnapshot().output))return;await wait(20);}assert.fail('Expected guest result not received: '+JSON.stringify(runtime.getSnapshot().output.slice(-1500)));}
  const first=pair();await first.runtime.start(environment);
  const file=input=>first.runtime.file(input);
  await file({op:'mkdir',path:'/docs'});
  await file({op:'upload',path:'/docs/ui.txt',bytes:new TextEncoder().encode('前端真实上传')});
  await first.runtime.write("cat /mnt/work/docs/ui.txt; printf '\\nUI-READ-DONE\\n'\n");
  await until(first.runtime,/前端真实上传\r?\nUI-READ-DONE\r?\n/);
  const read=await file({op:'readText',path:'/docs/ui.txt'});assert.equal(read.text,'前端真实上传');
  assert.equal((await file({op:'readSubmissionText',path:'/docs/ui.txt'})).text,'前端真实上传');
  await first.runtime.write("printf '客体修改' > /mnt/work/docs/ui.txt; printf '\\nGUEST-EDIT-DONE\\n'\n");
  await until(first.runtime,/\r?\nGUEST-EDIT-DONE\r?\n/);
  await assert.rejects(file({op:'saveText',path:'/docs/ui.txt',version:read.version,text:'stale'}),/FILE_CONFLICT/);
  const fresh=await file({op:'readText',path:'/docs/ui.txt'});assert.equal(fresh.text,'客体修改');
  await file({op:'saveText',path:'/docs/ui.txt',version:fresh.version,text:'保存新版本'});
  await first.runtime.write("cat /mnt/work/docs/ui.txt; printf '\\nSAVED-READ-DONE\\n'\n");
  await until(first.runtime,/保存新版本\r?\nSAVED-READ-DONE\r?\n/);
  await first.runtime.write("ln -s /etc/passwd /mnt/work/escape; ln -s docs/ui.txt /mnt/work/safe; printf '\\nLINKS-DONE\\n'\n");
  await until(first.runtime,/\r?\nLINKS-DONE\r?\n/);
  await assert.rejects(file({op:'readText',path:'/escape'}),/SYMLINK_ESCAPE/);
  assert.equal((await file({op:'readText',path:'/safe'})).text,'保存新版本');
  await assert.rejects(file({op:'readSubmissionText',path:'/safe'}),/INVALID_PATH/);
  await assert.rejects(file({op:'readSubmissionText',path:'/escape'}),/INVALID_PATH/);
  await file({op:'remove',path:'/safe'});
  await file({op:'rename',path:'/docs/ui.txt',destination:'/docs/moved.txt'});
  assert.equal(new TextDecoder().decode((await file({op:'download',path:'/docs/moved.txt'})).bytes),'保存新版本');
  await first.runtime.write("test ! -e /mnt/work/docs/ui.txt && cat /mnt/work/docs/moved.txt; printf '\\nRENAMED-DONE\\n'\n");
  await until(first.runtime,/保存新版本\r?\nRENAMED-DONE\r?\n/);
  await assert.rejects(file({op:'remove',path:'/docs'}),/DIRECTORY_NOT_EMPTY/);
  await first.runtime.write("exec 9< /mnt/work/docs/moved.txt; printf '\\nOPEN-FID-DONE\\n'\n");
  await until(first.runtime,/\r?\nOPEN-FID-DONE\r?\n/);
  await assert.rejects(file({op:'remove',path:'/docs/moved.txt'}),/FILE_IN_USE/);
  await first.runtime.write("cat <&9; exec 9<&-; printf '\\nOPEN-FID-READ-DONE\\n'\n");
  await until(first.runtime,/保存新版本\r?\nOPEN-FID-READ-DONE\r?\n/);
  await file({op:'remove',path:'/docs/moved.txt'});
  await file({op:'remove',path:'/docs'});
  for(let i=0;i<23;i++)await file({op:'mkdir',path:'/d'+String(i).padStart(2,'0')});
  const page=await file({op:'list',path:'/',page:2,pageSize:20});assert.equal(page.total,24);assert.equal(page.entries.length,4);
  await assert.rejects(file({op:'upload',path:'/oversized',bytes:new Uint8Array(20*1024*1024+1)}),/FILE_TOO_LARGE/);
  // Real guest-created file exceeds the old 20 MiB RPC cap. The sink is a
  // disk-backed atomic temp/rename adapter, not a native browser picker claim.
  await first.runtime.write("dd if=/dev/zero of=/mnt/work/large.bin bs=1048576 count=24 2>/dev/null; printf 'stream-tail' >> /mnt/work/large.bin; sha256sum /mnt/work/large.bin; printf '\nLARGE-READY\n'\n");
  await until(first.runtime,/\r?\nLARGE-READY\r?\n/);
  const expectedHash=first.runtime.getSnapshot().output.match(/([0-9a-f]{64})  \/mnt\/work\/large.bin/)[1];
  await assert.rejects(file({op:'download',path:'/large.bin'}),/FILE_TOO_LARGE/);
  await assert.rejects(file({op:'readSubmissionText',path:'/large.bin'}),/FILE_TOO_LARGE/);
  const directory=await mkdtemp(join(tmpdir(),'vm-stream-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const destination=join(directory,'large.bin'),partial=join(directory,'large.part');
  let writes=0,maxChunk=0,total=0,handle;
  const receipt=await writeFileDownload({file,path:'/large.bin',async openSink(){
    handle=await open(partial,'wx');
    return {async write(bytes){writes++;maxChunk=Math.max(maxChunk,bytes.length);await handle.writeFile(bytes);total+=bytes.length;},async close(){await handle.close();await rename(partial,destination);},async abort(){await handle.close();await rm(partial,{force:true});}};
  }});
  assert.equal(receipt.committed,true);assert.equal(receipt.bytes,24*1024*1024+11);
  assert.equal(total,receipt.bytes);assert.equal((await stat(destination)).size,total);
  assert.equal(writes,25);assert.equal(maxChunk,1048576);
  const hash=createHash('sha256');for await(const chunk of createReadStream(destination))hash.update(chunk);
  assert.equal(hash.digest('hex'),expectedHash);
  await first.runtime.write("printf '\nSTREAM-RESUMED\n'\n");
  await until(first.runtime,/\r?\nSTREAM-RESUMED\r?\n/);
  // Cancel after one real chunk and ensure the genuine VM lease is released.
  const abort=new AbortController();let cancelledWrites=0,aborted=false,closed=false;
  await assert.rejects(writeFileDownload({file,path:'/large.bin',signal:abort.signal,openSink:async()=>({
    async write(){cancelledWrites++;abort.abort();},async close(){closed=true;},async abort(){aborted=true;}
  })}),/DOWNLOAD_CANCELLED/);
  assert.equal(cancelledWrites,1);assert.equal(closed,false);assert.equal(aborted,true);
  assert.equal((await file({op:'list',path:'/',page:1,pageSize:50})).entries.some(e=>e.name==='large.bin'),true);
  await first.runtime.write("printf '\nCANCEL-RESUMED\n'\n");
  await until(first.runtime,/\r?\nCANCEL-RESUMED\r?\n/);
  console.log(JSON.stringify({streamDownload:{bytes:total,writes,maxChunk,sha256:expectedHash,diskHashMatches:true,cancelStopsAfterOneChunk:true,guestResumesAfterSuccessAndCancel:true,nativePickerAcceptance:false}}));
  let exitWrites=0,exitAborted=false,exitClosed=false;
  await assert.rejects(writeFileDownload({file,path:'/large.bin',openSink:async()=>({
    async write(){exitWrites++;first.owner.dispose();await first.runtime.stop();},
    async close(){exitClosed=true;},async abort(){exitAborted=true;}
  })}),/VM_NOT_RUNNING|VM_ACCOUNT_CLOSED|VM_RUNTIME_CLOSED/);
  assert.equal(exitWrites,1);assert.equal(exitAborted,true);assert.equal(exitClosed,false);
  await first.runtime.stop();assert.equal(workers[0].exited,true);

  await assert.rejects(file({op:'list',path:'/'}),/VM_NOT_RUNNING/);
  console.log(JSON.stringify({sharedFilesRealAlpine:true,submissionReadBoundedAndNoSymlinks:true,guestRoundtrip:true,conflictRejected:true,escapingSymlinkRejected:true,mutations:true,allWorkersExited:workers.every(w=>w.exited),accountExitAbortsStream:true,productionAcceptance:false}));
});
