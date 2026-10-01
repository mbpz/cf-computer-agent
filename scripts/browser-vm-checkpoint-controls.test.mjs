import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {createAccountNetworkOwner} from '../frontend/features/environments/account-network-owner.mjs';
import {createCheckpointStore} from '../frontend/features/environments/storage/checkpoints.mjs';
import {createAccountVmRuntime} from '../frontend/features/environments/account-vm-runtime.mjs';
import {sealCheckpoint} from '../tools/browser-vm/probe-checkpoint.mjs';
import {mountCheckpointControls} from '../tools/browser-vm/checkpoint-controls.mjs';
const identity={engineVersion:'v1',imageVersion:'v1',memoryBytes:268435456,filesystem:'ram-root+in-memory-9p+readonly-iso'};
const environment={id:'env',memberId:'alice',type:'personal'};
const tick=()=>new Promise(r=>setTimeout(r,1));
async function until(check){for(let i=0;i<1000;i++){if(check())return;await tick();}assert.fail('UI did not settle');}
async function setup(t){const window=new Window(),root=window.document.body;root.innerHTML='<button id="versions-refresh">版本</button><select id="versions"></select><button id="restore-selected">恢复所选</button><output id="versions-status"></output>';
 const owner=createAccountNetworkOwner({origin:'https://example.com',memberId:'alice'}),checkpoints=createCheckpointStore({owner,identity,indexedDB:new IDBFactory(),estimate:async()=>({quota:2**31,usage:0})});
 const calls=[];const runtime=createAccountVmRuntime({owner,checkpoints,autoSaveMs:0,createSession:options=>{calls.push(options);return {ready:Promise.resolve(),close:async()=>{},write:async()=>{}};}});
 const stop=mountCheckpointControls({root,owner,environment,checkpoints,runtime});t.after(async()=>{stop();owner.dispose();await runtime.stop();checkpoints.close();await window.happyDOM.close();});
 for(const [i,text] of ['previous','latest'].entries())await checkpoints.save(environment,await sealCheckpoint(new TextEncoder().encode(text).buffer,identity),{expectedRevision:i});
 return {root,owner,checkpoints,runtime,calls,window};}
test('catalog is explicit, shows both versions and restores the selected older bytes without default selection',async t=>{
 const a=await setup(t);const get=id=>a.root.querySelector('#'+id);assert.equal(a.calls.length,0);assert.equal(get('restore-selected').disabled,true);
 get('versions-refresh').click();await until(()=>get('versions').options.length===3);
 assert.match(get('versions').textContent,/v2/);assert.match(get('versions').textContent,/v1/);assert.equal(get('versions').value,'');assert.equal(get('restore-selected').disabled,true);
 get('versions').value='1';get('versions').dispatchEvent(new a.window.Event('change'));get('restore-selected').click();await until(()=>a.runtime.getSnapshot().status==='running');
 assert.equal(new TextDecoder().decode(a.calls[0].checkpoint.state),'previous');assert.equal(get('restore-selected').disabled,true);assert.match(get('versions-status').textContent,/v1/);
});
test('account closure while reading catalog clears private metadata and disables actions',async t=>{
 const a=await setup(t);a.root.querySelector('#versions-refresh').click();a.owner.dispose();await tick();await tick();
 assert.equal(a.root.querySelector('#versions').options.length,1);assert.equal(a.root.querySelector('#versions-refresh').disabled,true);assert.equal(a.calls.length,0);
});
test('stale selection that has been evicted fails without boot or silently choosing newest',async t=>{
 const a=await setup(t),get=id=>a.root.querySelector('#'+id);get('versions-refresh').click();await until(()=>get('versions').options.length===3);
 await a.checkpoints.save(environment,await sealCheckpoint(new TextEncoder().encode('third').buffer,identity),{expectedRevision:2});get('versions').value='1';get('versions').dispatchEvent(new a.window.Event('change'));get('restore-selected').click();await until(()=>/失败/.test(get('versions-status').textContent));
 assert.equal(a.calls.length,0);assert.match(get('versions-status').textContent,/重新读取/);
});
