import { createConnectorEgressClient } from '../../../tools/browser-vm/connector/egress-client.mjs';
import { attachConnectorGuestNetwork } from '../../../tools/browser-vm/connector/guest-network.mjs';

/** Owns the real client and one fresh paused engine's network adapter, NOT the VM.
 * authorize must use the authenticated product API with this AbortSignal; the
 * caller supplies a newly reserved runtime generation. No auth retry or caching.
 * ready means transport authorization, not engine boot or application acceptance.
 */
export function createVmConnectorSession({signal, authorize, renewTicket, onClose,
 NativeWebSocket, clock, createClient = createConnectorEgressClient, attachNetwork = attachConnectorGuestNetwork}) {
 let client, network, closed=false, authorized=false, attached=false, resolveReady, rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 function finish(code='NETWORK_CANCELLED') {
  if(closed)return;
  closed=true;authorized=false;signal.removeEventListener('abort',abort);
  const oldNetwork=network,oldClient=client;network=undefined;client=undefined;
  rejectReady(new Error(code));
  // A failure releasing one resource must not prevent releasing the other.
  try { oldNetwork?.close(); } finally {
   try { oldClient?.close(); } finally { onClose(); }
  }
 }
 const abort=()=>finish();
 signal.addEventListener('abort',abort,{once:true});
 if(signal.aborted)finish();
 else {
  try {
   Promise.resolve(authorize(signal)).then(config=>{
    if(closed||signal.aborted)return;
    client=createClient({url:config.url,pairingCode:config.pairingCode,ticket:config.ticket,
     renewTicket,NativeWebSocket,clock,
     onReady(){if(!closed){authorized=true;resolveReady();}},
     onFrame(frame){if(!closed)network?.receive(frame);},onClose:()=>finish(),
    });
    if(closed){client.close();client=undefined;}
   }).catch(()=>{finish('NETWORK_AUTHORIZATION_FAILED');});
  } catch { finish('NETWORK_AUTHORIZATION_FAILED'); }
 }
 function attach(machine) {
  if(closed||!authorized||client?.readyState!==1)throw new Error('NETWORK_NOT_READY');
  if(attached)throw new Error('NETWORK_ALREADY_ATTACHED');
  attached=true;
  try {
   network=attachNetwork({machine,client,clock});
   if(closed){network.close();network=undefined;throw new Error('NETWORK_CANCELLED');}
  } catch {finish('NETWORK_ATTACH_FAILED');throw new Error('NETWORK_ATTACH_FAILED');}
 }
 return Object.freeze({ready,attach,close:()=>finish()});
}
