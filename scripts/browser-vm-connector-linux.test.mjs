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
import { fixture, pair, origin } from './helpers/connector-authority-fixture.mjs';
import { prepareAlpineIso } from '../tools/browser-vm/alpine-iso.mjs';
import { sealCheckpoint, restoreCheckpoint } from '../tools/browser-vm/probe-checkpoint.mjs';
import { createTerminalSession } from '../tools/browser-vm/terminal-session.mjs';
import { encodeProbeCommand, parseProbeReply } from '../tools/browser-vm/serial-protocol.mjs';
import { createDestinationResolver } from '../tools/browser-vm/connector/destination-policy.mjs';
import { createAccountVmNetwork } from '../frontend/features/environments/account-network.mjs';

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
for (const boundary of ['snapshot-restore','download-cancel','browser-offline']) test(`booted Alpine ${boundary}, offline restore and explicit fresh generation do not replay requests`, {timeout:120000},async t=>{
 const assets=process.env.BROWSER_VM_PROBE_ASSETS,isoAssets=process.env.BROWSER_VM_PROBE_ISO_ASSETS;
 assert.ok(assets&&isoAssets,'BROWSER_VM_PROBE_ASSETS and BROWSER_VM_PROBE_ISO_ASSETS are required');
 const profile=await prepareAlpineIso({Engine:V86,readAsset:a=>readFile(join(a.location==='engine'?resolve('node_modules/v86/build'):a.location==='boot'?assets:isoAssets,a.name))});
 const requests=[];let dns=0,dials=0,holdClosed=false;let holdClose;const heldClosed=new Promise(resolve=>{holdClose=resolve;});
 const upstream=createServer((req,res)=>{requests.push({method:req.method,path:req.url});res.writeHead(200,{'Content-Type':'text/plain',Connection:'close'});if(req.url==='/hold'){res.on('close',()=>{holdClosed=true;holdClose();});res.write('FORMAL-HELD\n');}else res.end(req.url==='/after'?'FRESH-FORMAL-ACK':'FORMAL-LINUX-ACK');});
 upstream.listen(0,'127.0.0.1');await once(upstream,'listening');t.after(()=>{upstream.closeAllConnections();return new Promise(resolve=>upstream.close(resolve));});
 const resolveDestination=createDestinationResolver({createResolver:()=>({async resolve4(name){assert.equal(name,'github.com');dns++;return ['140.82.112.3'];},async resolve6(name){assert.equal(name,'github.com');return [];},cancel(){}})});
 const f=await fixture(t,{resolveDestination,dial(options){assert.equal(options.host,'140.82.112.3');assert.equal(options.port,80);assert.equal(options.family,4);assert.equal(options.autoSelectFamily,false);dials++;return connect({...options,host:'127.0.0.1',port:upstream.address().port});}});
 let machine,sockets=0;
 const events=new EventTarget();let onSocketClosed;
 const lifecycle=createAccountVmNetwork({events,clock:f.clock,environmentId:'env-a',
  scope:{origin,memberId:'member-a',sessionEpoch:1},isCurrent:()=>true,requester:f.requester,
  NativeWebSocket:class extends WebSocket{constructor(url){super(url,{headers:{origin}});sockets++;this.once('close',onSocketClosed);}},
 });t.after(()=>lifecycle.dispose());
 async function authorize(){
  const identity=await(await fetch(f.server.url+'/identity')).json();
  const closed=new Promise(resolve=>{onSocketClosed=resolve;});
  await lifecycle.connect({port:Number(new URL(f.server.url).port),connectorId:identity.connectorId,pairingCode:await pair(f)});
  return {connection:lifecycle,closed};
 }
 const first=await authorize();
 let attachError;
 const session=createTerminalSession({bootTimeoutMs:60000,createMachine(){
  machine=profile.createMachine({type:'ne2k',relay_url:'fetch',dns_method:'static'});
  machine.add_listener('emulator-ready',()=>{try{first.connection.attach(machine);}catch(e){attachError=e;}});return machine;
 }});t.after(()=>session.close());await session.ready;if(attachError)throw attachError;
 const setup=await command(machine,'ifconfig eth0 up && udhcpc -i eth0 -n -q -t 3 -T 1 && printf "nameserver 192.168.86.1\\n" > /etc/resolv.conf');assert.equal(setup.exitCode,0,setup.output);
 const response=await command(machine,'wget -T 3 -qO /tmp/formal-result --post-data=once http://github.com/once && cat /tmp/formal-result');assert.equal(response.exitCode,0,response.output+JSON.stringify({dns,dials,requests,state:lifecycle.state.status}));assert.equal(response.output.trim(),'FORMAL-LINUX-ACK');
 assert.deepEqual(requests,[{method:'POST',path:'/once'}]);assert.equal(dns,2);assert.equal(dials,1);assert.equal(await f.count(),1);
 for(const target of ['http://192.168.86.1/denied','http://github.com:8080/denied','http://not-allowed.invalid/denied']){
  const denied=await command(machine,`wget -T 1 -qO /tmp/formal-denied ${target}`);assert.notEqual(denied.exitCode,0,target);assert.equal(dials,1);assert.equal(requests.length,1);
 }
 const launched=await command(machine,'(wget -T 8 -qO /tmp/formal-held http://github.com/hold >/tmp/formal-held-log 2>&1; echo $? > /tmp/formal-held-status) &');assert.equal(launched.exitCode,0);
 const held=await command(machine,'for n in 1 2 3 4 5; do test -s /tmp/formal-held && break; sleep 1; done; cat /tmp/formal-held');assert.equal(held.output.trim(),'FORMAL-HELD');assert.equal(holdClosed,false);
 if(boundary==='download-cancel')lifecycle.disconnect();
 if(boundary==='browser-offline')events.dispatchEvent(new Event('offline'));
 if(boundary!=='snapshot-restore'){
  await first.closed;await heldClosed;assert.equal(machine.is_running(),true);
  assert.equal(lifecycle.state.reason,boundary==='download-cancel'?'user-disconnect':'browser-offline');
  events.dispatchEvent(new Event('online'));assert.equal(sockets,1);
 }
 let stopped=event(machine,'emulator-stopped');machine.stop();await stopped;
 const checkpoint=await sealCheckpoint(await machine.save_state(),profile.checkpointIdentity);
 lifecycle.beforeRestore();await first.closed;await heldClosed;assert.equal(holdClosed,true);assert.equal(lifecycle.state.status,'offline');
 // Prove network teardown precedes engine teardown rather than relying on destroy.
 await session.close();
 machine=profile.createMachine();t.after(()=>machine.destroy());await event(machine,'emulator-ready');await restoreCheckpoint(machine,checkpoint,profile.checkpointIdentity);machine.run();
 assert.equal((await command(machine,'cat /tmp/formal-result')).output.trim(),'FORMAL-LINUX-ACK');
 const offline=await command(machine,'wget -T 1 -qO /tmp/formal-offline http://github.com/offline');assert.notEqual(offline.exitCode,0);assert.equal(sockets,1);assert.equal(dials,2);assert.equal(requests.length,2);
 stopped=event(machine,'emulator-stopped');machine.stop();await stopped;const offlineCheckpoint=await sealCheckpoint(await machine.save_state(),profile.checkpointIdentity);await machine.destroy();
 const second=await authorize();
 machine=profile.createMachine({type:'ne2k',relay_url:'fetch',dns_method:'static'});await event(machine,'emulator-ready');await restoreCheckpoint(machine,offlineCheckpoint,profile.checkpointIdentity);
 second.connection.attach(machine);machine.run();
 const after=await command(machine,'wget -T 3 -qO /tmp/formal-after http://github.com/after && cat /tmp/formal-after');assert.equal(after.exitCode,0,after.output);assert.equal(after.output.trim(),'FRESH-FORMAL-ACK');
 const old=await command(machine,'for n in 1 2 3 4 5 6 7 8 9 10; do test -s /tmp/formal-held-status && break; sleep 1; done; test -s /tmp/formal-held-status && cat /tmp/formal-held-status',12000);assert.equal(old.exitCode,0,old.output);assert.match(old.output.trim(),/^[1-9][0-9]*$/);
 assert.deepEqual(requests,[{method:'POST',path:'/once'},{method:'GET',path:'/hold'},{method:'GET',path:'/after'}]);assert.equal(sockets,2);assert.equal(dials,3);assert.equal(await f.count(),2);
 if(boundary==='browser-offline')await f.server.close();else await f.advance(60000);await second.closed;assert.equal(lifecycle.state.status,'offline');assert.equal(machine.is_running(),true);const closed=await command(machine,'wget -T 1 -qO /tmp/formal-closed http://github.com/closed');assert.notEqual(closed.exitCode,0);assert.equal(requests.length,3);assert.equal(dials,3);
 console.log(JSON.stringify({image:'alpine-iso',authorization:'real-Worker-D1',controller:'account-network-runtime',boundary,finalDisconnect:boundary==='browser-offline'?'connector-exit':'lease-expiry',recovery:'offline-then-explicit-new-generation',sockets,requests:requests.length,originalPostCount:requests.filter(r=>r.method==='POST').length,oldStreamClosed:holdClosed,oldGuestExit:Number(old.output.trim())}));
});
