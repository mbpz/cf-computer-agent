import React from 'react';
import {mountCheckpointControls} from './checkpoint-controls.mjs';
import { createRoot } from 'react-dom/client';
import { FilesPanel } from '../../frontend/features/environments/files/files-panel.tsx';
import { createAccountNetworkOwner } from '../../frontend/features/environments/account-network-owner.mjs';
import { createAccountVmRuntime } from '../../frontend/features/environments/account-vm-runtime.mjs';
import { createCheckpointStore } from '../../frontend/features/environments/storage/checkpoints.mjs';
import { alpineCheckpointIdentity } from './alpine-iso.mjs';
import { connectTerminal } from './terminal-client.mjs';
const owner = createAccountNetworkOwner({origin:location.origin,memberId:'diagnostic',events:window,createChannel:typeof BroadcastChannel==='function'?name=>new BroadcastChannel(name):undefined});
const environment = Object.freeze({id:'diagnostic-alpine',memberId:'diagnostic',type:'personal'});
const checkpoints = createCheckpointStore({owner,identity:await alpineCheckpointIdentity()});
const runtime = createAccountVmRuntime({owner,checkpoints,createSession:callbacks=>connectTerminal({
  ...callbacks,createWorker:()=>new Worker('/terminal-worker.mjs',{type:'module'}),
})});
const element = id=>document.getElementById(id);
let removed=false, cleanupComplete=false, action=0;
function render(){
  const state=runtime.getSnapshot();element('status').textContent=state.status;element('reason').textContent=state.reason;
  element('terminal').textContent=state.output;
  element('start').disabled=removed||owner.signal.aborted||state.status!=='idle';
  element('restore').disabled=element('start').disabled;
  element('save').disabled=element('save-stop').disabled=state.status!=='running';
  element('saved').textContent=state.savedAt?new Date(state.savedAt).toLocaleString():'本次会话尚无确认保存';
  element('send').disabled=element('interrupt').disabled=state.status!=='running';
  element('remove').disabled=cleanupComplete||owner.signal.aborted;element('logout').disabled=owner.signal.aborted;
}
async function perform(fn){const ticket=++action;element('result').textContent='执行中';try{await fn();if(ticket===action)element('result').textContent='操作完成';}catch(error){if(ticket===action)element('result').textContent=`失败（未验收）：${error.message}`;}finally{render();}}
function clearInput(){element('command').value='';}
element('start').onclick=()=>perform(()=>runtime.start(environment));
element('restore').onclick=()=>perform(()=>runtime.start(environment,{restore:true}));
element('save').onclick=()=>perform(()=>runtime.save());
element('save-stop').onclick=()=>perform(()=>runtime.saveAndStop());
element('stop').onclick=()=>perform(()=>{clearInput();return runtime.stop();});
element('remove').onclick=()=>perform(async()=>{removed=true;clearInput();owner.removeEnvironment(environment.id);await runtime.stop();await checkpoints.remove(environment.id);cleanupComplete=true;});
element('logout').onclick=()=>perform(()=>{clearInput();owner.revoke();return runtime.stop();});
element('send').onclick=()=>perform(async()=>{const input=element('command').value;if(!input)throw Error('EMPTY_INPUT');clearInput();await runtime.write(input+'\n');});
element('interrupt').onclick=()=>perform(()=>runtime.write('\x03'));
window.addEventListener('pagehide',clearInput);runtime.subscribe(render);render();

const filesRoot = createRoot(element('files'));
filesRoot.render(React.createElement(FilesPanel, {runtime, locale:'zh-CN'}));
window.addEventListener('pagehide', () => filesRoot.unmount(), {once:true});

const disposeCheckpointControls=mountCheckpointControls({root:document,owner,environment,checkpoints,runtime});
window.addEventListener('pagehide',disposeCheckpointControls,{once:true});
