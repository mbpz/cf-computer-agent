import { V86 } from 'v86';
import { prepareAlpineIso, readImageResponse } from '../alpine-iso.mjs';
import { createTerminalSession } from '../terminal-session.mjs';
import { runGuestCommand } from './serial-command.mjs';
import { attachConnectorGuestNetwork } from '../connector/guest-network.mjs';
import { createConnectorEgressClient } from '../connector/egress-client.mjs';
import { ACCEPTANCE_SETUP_COMMAND, acceptPackages, acceptGit } from './commands.mjs';
let machine,session,network,client,busy=false,started=false,packages=false,failed=false;
const progress=text=>postMessage({type:'progress',text});
async function fail(error){if(failed)return;failed=true;network?.close();client?.close();await session?.close().catch(()=>{});postMessage({type:'error',text:String(error.message).slice(-12000)});}
function command(text){
 progress(text);
 return runGuestCommand(machine,text).then(result=>{postMessage({type:'command',command:text,exitCode:result.exitCode,output:result.output.slice(-12000)});return result;});
}
async function start({endpoint,capability}){
 if(started)throw Error('Already started');started=true;
 if(!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint)||Number(new URL(endpoint).port)>65535||!/^[A-Za-z0-9_-]{43}$/.test(capability))throw Error('Invalid local capability');
 async function request(path,body,signal){const response=await fetch(endpoint+path,{method:body===undefined?'GET':'POST',headers:{'x-harness-key':capability,...(body!==undefined?{'content-type':'application/json'}:{})},body,signal:signal??AbortSignal.timeout(30000),credentials:'omit',redirect:'error',cache:'no-store'});if(!response.ok)throw Error('Local acceptance request failed: '+response.status);return response;}
 progress('加载并验证六项固定镜像资产（不上传）');
 const profile=await prepareAlpineIso({Engine:V86,readAsset:async a=>readImageResponse(await request('/asset/'+a.role),a)});
 const config=await(await request('/start','')).json();
 let readyResolve,readyReject;const ready=new Promise((res,rej)=>{readyResolve=res;readyReject=rej;});
 client=createConnectorEgressClient({...config,renewTicket:async(lease,signal)=>(await(await request('/renew',JSON.stringify({leaseId:lease.leaseId}),signal)).json()).ticket,
  onReady:readyResolve,onFrame:frame=>network?.receive(frame),onClose:()=>{readyReject(Error('Formal connector closed'));if(!failed)void fail(Error('Formal connector closed'));}});
 await ready;if(failed)return;let attachError;
 progress('正式授权已通过，启动真实 Alpine');
 session=createTerminalSession({bootTimeoutMs:60000,createMachine(){machine=profile.createMachine({type:'ne2k',relay_url:'fetch',dns_method:'static'});machine.add_listener('emulator-ready',()=>{try{network=attachConnectorGuestNetwork({machine,client});}catch(error){attachError=error;}});return machine;}});
 await session.ready;if(attachError)throw attachError;if(failed)return;
 const setup=await command(ACCEPTANCE_SETUP_COMMAND);
 if(setup.exitCode!==0)throw Error('Guest network/CA/key setup failed: '+setup.output);
 const result=await acceptPackages(command);if(failed)return;packages=true;postMessage({type:'result',stage:'packages',result:{...result,actualBrowserGuest:true,production:false,guestCertificateAndSignatureChecks:'enabled'}});
}
self.onmessage=async({data})=>{if(busy||failed)return;busy=true;try{if(data.type==='start')await start(data);else if(data.type==='git'&&packages){packages=false;const result=await acceptGit(command);if(!failed)postMessage({type:'result',stage:'git',result});}}catch(error){await fail(error);}finally{busy=false;}};
