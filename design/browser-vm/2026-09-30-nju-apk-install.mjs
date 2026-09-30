// Explicit one-shot public diagnostic. Not browser acceptance; installs git/curl only in the disposable guest,
// no production data, no TLS/signature bypass, no retry. Requires pinned assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {connect} from 'node:net';
import {V86} from 'v86';
import {WebSocket} from 'ws';
import {fixture,pair,origin} from '../../scripts/helpers/connector-authority-fixture.mjs';
import {prepareAlpineIso} from '../../tools/browser-vm/alpine-iso.mjs';
import {createTerminalSession} from '../../tools/browser-vm/terminal-session.mjs';
import {ACCEPTANCE_SETUP_COMMAND,acceptPackages} from '../../tools/browser-vm/acceptance/commands.mjs';
import {runGuestCommand} from '../../tools/browser-vm/acceptance/serial-command.mjs';
import {createDestinationResolver} from '../../tools/browser-vm/connector/destination-policy.mjs';
import {createConnectorEgressClient} from '../../tools/browser-vm/connector/egress-client.mjs';
import {attachConnectorGuestNetwork} from '../../tools/browser-vm/connector/guest-network.mjs';
test('one-shot real Alpine NJU package installation',{timeout:780000},async t=>{
 assert.equal(process.env.BROWSER_VM_PUBLIC_DIAGNOSTIC,'1','Explicit public diagnostic opt-in required');
 const assets=process.env.BROWSER_VM_PROBE_ASSETS,iso=process.env.BROWSER_VM_PROBE_ISO_ASSETS;
 assert.ok(assets&&iso,'Explicit pinned asset directories required');
 const started=performance.now(),sockets=[];let machine,network,client,downBytes=0,downFrames=0;
 const report=(event,extra={})=>console.log(JSON.stringify({event,elapsedMs:Math.round(performance.now()-started),...extra}));
 const resolver=createDestinationResolver();
 const f=await fixture(t,{async resolveDestination(target,signal){
  const start=performance.now();try{const pin=await resolver(target,signal);report('dns-ok',{hostname:target.hostname,port:target.port,ms:Math.round(performance.now()-start)});return pin;}
  catch(error){report('dns-failed',{hostname:target.hostname,message:error.message});throw error;}
 },dial(options){
  const socket=connect(options),id=sockets.length+1;sockets.push(socket);
  socket.once('connect',()=>report('tcp-connected',{id}));socket.once('error',error=>report('tcp-error',{id,code:error.code}));
  socket.once('close',()=>report('tcp-closed',{id,bytesRead:socket.bytesRead,bytesWritten:socket.bytesWritten}));return socket;
 }},{realtime:true});
 let readyResolve,readyReject;const ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;});
 client=createConnectorEgressClient({url:f.server.url.replace('http:','ws:')+'/connector',pairingCode:await pair(f),ticket:f.ticket,clock:f.clock,
  NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin}});}},
  renewTicket:async lease=>{const res=await f.api('connector-renewals',{...f.binding,leaseId:lease.leaseId,operationId:crypto.randomUUID()});assert.equal(res.status,201);report('renewed');return(await res.json()).ticket;},
  onReady:readyResolve,onFrame:frame=>{const b=new Uint8Array(frame);if(b[0]===2){downBytes+=b.length-5;downFrames++;}network?.receive(frame);},
  onClose:()=>{report('channel-closed');network?.close();readyReject(Error('Formal channel closed'));}});
 t.after(()=>client.close());await ready;
 const profile=await prepareAlpineIso({Engine:V86,readAsset:a=>readFile(join(a.location==='engine'?resolve('node_modules/v86/build'):a.location==='boot'?assets:iso,a.name))});
 let attachError;const session=createTerminalSession({bootTimeoutMs:60000,createMachine(){
  machine=profile.createMachine({type:'ne2k',relay_url:'fetch',dns_method:'static'});
  machine.add_listener('emulator-ready',()=>{try{network=attachConnectorGuestNetwork({machine,client});}catch(error){attachError=error;}});return machine;
 }});t.after(()=>session.close());await session.ready;if(attachError)throw attachError;
 const metrics=()=>report('transport-sample',{downBytes,downFrames,channelState:client.readyState,sockets:sockets.map((s,i)=>({id:i+1,read:s.bytesRead,written:s.bytesWritten,buffered:s.readableLength,closed:s.destroyed})),guestConnections:Object.values(machine.network_adapter.tcp_conn).map(c=>({buffered:c.send_buffer.length,state:c.state}))});
 const timer=setInterval(metrics,15000);t.after(()=>clearInterval(timer));
 const setup=await runGuestCommand(machine,ACCEPTANCE_SETUP_COMMAND);
 assert.equal(setup.exitCode,0,setup.output);report('setup',{exitCode:setup.exitCode});
 try{const result=await acceptPackages(async command=>{report('command-start',{command});const r=await runGuestCommand(machine,command);report('command-result',{command,...r});return r;});report('packages-installed',{...result,actualBrowserGuest:false,production:false});}
 finally{metrics();}
});
