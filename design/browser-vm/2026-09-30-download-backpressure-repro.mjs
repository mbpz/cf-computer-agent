// Standalone RED diagnostic, excluded from the passing quick regression suite.
// Run from repository root with explicitly supplied pinned asset directories.
// 128 KiB is the passing control; 1 MiB currently exposes missing downstream backpressure.
// No public dial, no installation, no production data; NOT LC-009 browser acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { V86 } from 'v86';
import { WebSocket } from 'ws';
import { fixture, pair, origin } from '../../scripts/helpers/connector-authority-fixture.mjs';
import { prepareAlpineIso } from '../../tools/browser-vm/alpine-iso.mjs';
import { sealCheckpoint, restoreCheckpoint } from '../../tools/browser-vm/probe-checkpoint.mjs';
import { createTerminalSession } from '../../tools/browser-vm/terminal-session.mjs';
import { encodeProbeCommand, parseProbeReply } from '../../tools/browser-vm/serial-protocol.mjs';
import { createDestinationResolver } from '../../tools/browser-vm/connector/destination-policy.mjs';
import { createConnectorEgressClient } from '../../tools/browser-vm/connector/egress-client.mjs';
import { attachConnectorGuestNetwork } from '../../tools/browser-vm/connector/guest-network.mjs';

function event(machine,name){return new Promise((resolve,reject)=>{const listener=()=>{clearTimeout(timer);machine.remove_listener(name,listener);resolve();};const timer=setTimeout(()=>{machine.remove_listener(name,listener);reject(new Error('Engine event timeout: '+name));},10000);machine.add_listener(name,listener);});}
function command(machine,text,timeoutMs=10000){
 const id=randomBytes(8).toString('hex');return new Promise((resolve,reject)=>{
  let output='';const finish=(error,value)=>{clearTimeout(timer);machine.remove_listener('serial0-output-byte',receive);error?reject(error):resolve(value);};
  const receive=byte=>{output+=String.fromCharCode(byte);if(output.length>65536)return finish(new Error('Guest output limit exceeded'));const reply=parseProbeReply(output,id);if(reply)finish(null,reply);};
  const timer=setTimeout(()=>finish(new Error(`Guest command timed out: ${text}; ${JSON.stringify(output.slice(-500))}`)),timeoutMs);
  machine.add_listener('serial0-output-byte',receive);machine.serial0_send(encodeProbeCommand(text,id));
 });
}
// Explicit opt-in test: missing pinned assets is a failure, not skipped acceptance.
// No host DNS/public TCP: only the already-policy-validated destination is mapped
// to our loopback HTTP fixture. The Linux CPU and all authorization layers are real.
for (const downloadBytes of [128 * 1024, 1024 * 1024]) test(`diagnostic: ${downloadBytes} bytes reach the real guest without truncation`, {timeout:120000},async t=>{
 const assets=process.env.BROWSER_VM_PROBE_ASSETS,isoAssets=process.env.BROWSER_VM_PROBE_ISO_ASSETS;
 assert.ok(assets&&isoAssets,'BROWSER_VM_PROBE_ASSETS and BROWSER_VM_PROBE_ISO_ASSETS are required');
 const profile=await prepareAlpineIso({Engine:V86,readAsset:a=>readFile(join(a.location==='engine'?resolve('node_modules/v86/build'):a.location==='boot'?assets:isoAssets,a.name))});
 const requests=[];let dns=0,dials=0,holdClosed=false;let holdClose;const heldClosed=new Promise(resolve=>{holdClose=resolve;});
 const upstream=createServer((req,res)=>{requests.push({method:req.method,path:req.url});res.writeHead(200,{'Content-Type':'text/plain',Connection:'close'});if(req.url==='/hold'){res.on('close',()=>{holdClosed=true;holdClose();});res.write('FORMAL-HELD\n');}else res.end('X'.repeat(downloadBytes));});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();return new Promise(resolve=>upstream.close(resolve));});
 const resolveDestination=createDestinationResolver({createResolver:()=>({async resolve4(name){assert.equal(name,'github.com');dns++;return ['140.82.112.3'];},async resolve6(name){assert.equal(name,'github.com');return [];},cancel(){}})});
 const f=await fixture(t,{resolveDestination,dial(options){assert.equal(options.host,'140.82.112.3');assert.equal(options.port,80);assert.equal(options.family,4);assert.equal(options.autoSelectFamily,false);dials++;return connect({...options,host:'127.0.0.1',port:upstream.address().port});}});
 let network,machine,sockets=0;
 async function authorize(ticket,binding){
  let readyResolve,readyReject,closeResolve;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),closed=new Promise(resolve=>{closeResolve=resolve;});
  const client=createConnectorEgressClient({url:f.server.url.replace('http:','ws:')+'/connector',pairingCode:await pair(f),ticket,clock:f.clock,
   NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin}});sockets++;}},
   renewTicket:async lease=>{const res=await f.api('connector-renewals',{...binding,leaseId:lease.leaseId,operationId:crypto.randomUUID()});assert.equal(res.status,201);return(await res.json()).ticket;},
   onReady:readyResolve,onFrame:frame=>{const buffered=machine?Object.values(machine.network_adapter.tcp_conn).map(c=>c.send_buffer.length):[];network?.receive(frame);if(client.readyState===3)console.log(JSON.stringify({closedOnFrame:new Uint8Array(frame)[0],frameSize:frame.byteLength,buffered}));},onClose:()=>{network?.close();readyReject(new Error('Formal channel closed'));closeResolve();}});
  t.after(()=>client.close());await ready;return {client,closed};
 }
 const first=await authorize(f.ticket,f.binding),client=first.client;
 let attachError;
 const session=createTerminalSession({bootTimeoutMs:60000,createMachine(){
  machine=profile.createMachine({type:'ne2k',relay_url:'fetch',dns_method:'static'});
  machine.add_listener('emulator-ready',()=>{try{network=attachConnectorGuestNetwork({machine,client,clock:f.clock});}catch(e){attachError=e;}});return machine;
 }});t.after(()=>session.close());await session.ready;if(attachError)throw attachError;
 const setup=await command(machine,'ifconfig eth0 up && udhcpc -i eth0 -n -q -t 3 -T 1 && printf "nameserver 192.168.86.1\\n" > /etc/resolv.conf');assert.equal(setup.exitCode,0,setup.output);
 const response=await command(machine,'wget -T 5 -qO /tmp/formal-result http://github.com/large && wc -c < /tmp/formal-result',15000); console.log(JSON.stringify({exitCode:response.exitCode,output:response.output,dns,dials,clientState:client.readyState}));assert.equal(response.exitCode,0,response.output);assert.equal(Number(response.output.trim()),downloadBytes);
});
