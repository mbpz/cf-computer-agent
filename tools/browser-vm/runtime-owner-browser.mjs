import { createAccountNetworkOwner } from '../../frontend/features/environments/account-network-owner.mjs';
import { createAccountVmRuntime } from '../../frontend/features/environments/account-vm-runtime.mjs';
import { connectTerminal } from './terminal-client.mjs';
const owner = createAccountNetworkOwner({origin:location.origin,memberId:'diagnostic',events:window});
const environment = Object.freeze({id:'diagnostic-alpine',memberId:'diagnostic',type:'personal'});
const runtime = createAccountVmRuntime({owner,createSession:callbacks=>connectTerminal({
  ...callbacks,createWorker:()=>new Worker('/terminal-worker.mjs',{type:'module'}),
})});
const element = id=>document.getElementById(id);
let removed=false, action=0;
function render(){
  const state=runtime.getSnapshot();element('status').textContent=state.status;element('reason').textContent=state.reason;
  element('terminal').textContent=state.output;
  element('start').disabled=removed||owner.signal.aborted||state.status!=='idle';
  element('send').disabled=element('interrupt').disabled=state.status!=='running';
  element('remove').disabled=removed||owner.signal.aborted;element('logout').disabled=owner.signal.aborted;
}
async function perform(fn){const ticket=++action;element('result').textContent='执行中';try{await fn();if(ticket===action)element('result').textContent='操作完成';}catch(error){if(ticket===action)element('result').textContent=`失败（未验收）：${error.message}`;}finally{render();}}
function clearInput(){element('command').value='';}
element('start').onclick=()=>perform(()=>runtime.start(environment));
element('stop').onclick=()=>perform(()=>{clearInput();return runtime.stop();});
element('remove').onclick=()=>perform(()=>{removed=true;clearInput();owner.removeEnvironment(environment.id);return runtime.stop();});
element('logout').onclick=()=>perform(()=>{clearInput();owner.dispose();return runtime.stop();});
element('send').onclick=()=>perform(async()=>{const input=element('command').value;if(!input)throw Error('EMPTY_INPUT');clearInput();await runtime.write(input+'\n');});
element('interrupt').onclick=()=>perform(()=>runtime.write('\x03'));
window.addEventListener('pagehide',clearInput);runtime.subscribe(render);render();
