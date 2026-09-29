import test from 'node:test';
import assert from 'node:assert/strict';
import { V86 } from 'v86';
import { attachConnectorGuestNetwork } from '../tools/browser-vm/connector/guest-network.mjs';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
import { checksum, dns, tcp, arp, dhcp } from './helpers/connector-guest-packets.mjs';
async function fixture(t,options={}){
 const machine=new V86({wasm_path:process.cwd()+'/node_modules/v86/build/v86.wasm',autostart:false,disable_speaker:true,memory_size:16*1024*1024,net_device:{type:'ne2k',relay_url:'fetch',dns_method:'static'}});
 await new Promise(resolve=>machine.add_listener('emulator-ready',resolve));t.after(()=>machine.destroy());
 const frames=[],sent=[],queries=[];let time=0,closed=0,active=true;
 machine.bus.pair.register('net0-receive',frame=>frames.push(Buffer.from(frame)));
 const client={get readyState(){return active?1:3;},send(frame){sent.push(Buffer.from(frame));return active;},async resolve(name){queries.push(name);return{hostname:name,address:'140.82.112.3'};},close(){closed++;active=false;},...options};
 const network=attachConnectorGuestNetwork({machine,client,clock:{monotonicNow:()=>time}});t.after(()=>network.close());
 const mac=machine.network_adapter.vm_mac;
 return{machine,network,frames,sent,queries,mac,client,get closed(){return closed;},advance(ms){time+=ms;},input(b){machine.bus.pair.send('net0-send',b);}};
}
test('actual pinned v86 DNS uses leased resolver and returns a real A reply, not its static private address',async t=>{
 const f=await fixture(t);f.input(dns(f.mac));await flush();assert.deepEqual(f.queries,['github.com']);assert.equal(f.frames.length,1);
 const b=f.frames[0];assert.equal(b.readUInt16BE(34),53);assert.equal(b.readUInt16BE(36),12000);assert.equal(b.readUInt16BE(42),0x1234);assert.equal(b.readUInt16BE(44),0x8180);assert.equal(b.readUInt16BE(48),1);assert.equal(b.readUInt32BE(b.length-10),30);assert.deepEqual([...b.subarray(-4)],[140,82,112,3]);assert.equal(checksum(b.subarray(14,34)),0);assert.equal(f.sent.length,0);
});
test('AAAA returns empty and unknown names are refused without host DNS or HTTP fetch',async t=>{
 const f=await fixture(t);f.input(dns(f.mac,'github.com',28));f.input(dns(f.mac,'evil.test'));await flush();assert.deepEqual(f.queries,[]);assert.equal(f.frames.length,2);assert.equal(f.frames[0].readUInt16BE(48),0);assert.equal(f.frames[1].readUInt16BE(44),0x8185);
 assert.throws(()=>f.machine.network_adapter.fetch('https://evil.test'),/disabled/);assert.throws(()=>f.machine.network_adapter.connect(80),/disabled/);
});
test('real v86 TCP hook sends the associated domain, passes bytes both ways, and never its native HTTP handler',async t=>{
 const f=await fixture(t);f.input(dns(f.mac));await flush();f.frames.length=0;
 f.input(tcp(f.mac,{port:80}));assert.equal(f.sent.length,1);assert.equal(f.sent[0].toString('hex'),'01010000000150006769746875622e636f6d');assert.equal(f.frames.length,1);assert.equal(f.frames[0][47],18);
 f.input(tcp(f.mac,{port:80,seq:101,ack:1338,flags:16}));
 f.input(tcp(f.mac,{port:80,seq:101,ack:1338,flags:24,data:'GET / HTTP/1.0\r\n\r\n'}));assert.equal(f.sent[1].subarray(0,5).toString('hex'),'0201000000');assert.equal(f.sent[1].subarray(5).toString(),'GET / HTTP/1.0\r\n\r\n');
 f.network.receive(Buffer.from('02010000007265706c79','hex'));assert.equal(f.frames.at(-1).subarray(54).toString(),'reply');
 f.network.close();assert.equal(f.closed,1);assert.equal(Object.keys(f.machine.network_adapter.tcp_conn).length,0);
});
test('unassociated, expired, conflicting DNS or disallowed TCP destinations cannot open a WISP stream',async t=>{
 for(const kind of ['missing','expired','collision','port']){
  const f=await fixture(t);if(kind!=='missing'){f.input(dns(f.mac));await flush();}
  if(kind==='expired')f.advance(30_000);if(kind==='collision'){f.input(dns(f.mac,'api.github.com'));await flush();}
  f.input(tcp(f.mac,{port:kind==='port'?22:443}));assert.equal(f.sent.length,0);assert.equal(Object.keys(f.machine.network_adapter.tcp_conn).length,0);
 }
});
test('close suppresses pending DNS replies and permanently disables guest transmission',async t=>{
 let answer;const f=await fixture(t,{resolve:()=>new Promise(resolve=>{answer=resolve;})});f.input(dns(f.mac));f.network.close();answer({hostname:'github.com',address:'140.82.112.3'});await flush();f.input(tcp(f.mac));assert.equal(f.frames.length,0);assert.equal(f.sent.length,0);assert.equal(f.closed,1);
});
async function open(f,source=12001){f.input(dns(f.mac));await flush();f.input(tcp(f.mac,{source}));f.input(tcp(f.mac,{source,seq:101,ack:1338,flags:16}));}
test('upstream close drains already received TCP bytes before FIN instead of truncating the guest response',async t=>{
 const f=await fixture(t);await open(f);f.frames.length=0;
 f.network.receive(Buffer.concat([Buffer.from('0201000000','hex'),Buffer.alloc(3000,97)]));
 f.network.receive(Buffer.from('040100000002','hex'));
 assert.equal(Object.keys(f.machine.network_adapter.tcp_conn).length,1);
 for(const ack of [2798,4258,4338])f.input(tcp(f.mac,{seq:101,ack,flags:16}));
 const data=f.frames.filter(b=>b.length>54).map(b=>b.subarray(54));assert.deepEqual(Buffer.concat(data),Buffer.alloc(3000,97));assert.ok(f.frames.some(b=>(b[47]&1)!==0));
 f.input(tcp(f.mac,{seq:101,ack:4339,flags:17}));assert.equal(Object.keys(f.machine.network_adapter.tcp_conn).length,0);
});
test('per-stream credit queues are bounded and flush only their owning stream',async t=>{
 const f=await fixture(t);await open(f);await open(f,12002);
 for(let i=0;i<19;i++){f.input(tcp(f.mac,{seq:101+i,ack:1338,flags:24,data:'a'}));f.input(tcp(f.mac,{source:12002,seq:101+i,ack:1338,flags:24,data:'b'}));}
 assert.equal(f.sent.filter(b=>b[0]===2).length,32);
 f.network.receive(Buffer.from('030100000010000000','hex'));
 assert.deepEqual(f.sent.slice(-3).map(b=>b.toString('hex')),Array(3).fill('020100000061'));
 f.network.receive(Buffer.from('030200000010000000','hex'));
 assert.deepEqual(f.sent.slice(-3).map(b=>b.toString('hex')),Array(3).fill('020200000062'));
});
test('a non-reading guest cannot grow the native v86 downstream ring without bound',async t=>{
 const f=await fixture(t);await open(f);
 const frame=Buffer.concat([Buffer.from('0201000000','hex'),Buffer.alloc(16384,97)]);
 for(let i=0;i<16;i++)f.network.receive(frame);assert.equal(f.closed,0);
 f.network.receive(frame);assert.equal(f.closed,1);assert.equal(Object.keys(f.machine.network_adapter.tcp_conn).length,0);
});
test('malformed, fragmented and off-router DNS packets never reach a resolver or native static DNS',async t=>{
 const f=await fixture(t),q=dns(f.mac);
 for(const alter of [b=>b.subarray(0,33),b=>{b[20]=0x20;return b;},b=>{b[30]=8;return b;},b=>{b[54]=0xc0;return b;},b=>{b[16]=0xff;return b;},b=>{b[38]=0xff;return b;},b=>{b[44]=0x81;return b;}]){
  const b=alter(Buffer.from(q));if(b.length>=34){b.writeUInt16BE(0,24);b.writeUInt16BE(checksum(b.subarray(14,34)),24);}f.input(b);
 }
 await flush();assert.deepEqual(f.queries,[]);assert.deepEqual(f.frames,[]);assert.equal(f.closed,0);
});
test('expiry is checked before an old TCP flow can send more bytes even when timers were delayed',async t=>{
 const f=await fixture(t);await open(f);f.advance(15_000);f.input(tcp(f.mac,{seq:101,ack:1338,flags:24,data:'late'}));assert.equal(f.sent.filter(b=>b[0]===2).length,0);assert.equal(f.closed,1);
});

test('upload overflow, ninth stream, repeated SYN and exhausted DNS concurrency fail closed',async t=>{
 for(const kind of ['upload','streams','syn']){
  const f=await fixture(t);await open(f);
  if(kind==='upload')for(let i=0;i<273;i++)f.input(tcp(f.mac,{seq:101+i,ack:1338,flags:24,data:'a'}));
  if(kind==='streams')for(let i=1;i<=8;i++)f.input(tcp(f.mac,{source:12001+i}));
  if(kind==='syn')f.input(tcp(f.mac));
  assert.equal(f.closed,1);assert.equal(Object.keys(f.machine.network_adapter.tcp_conn).length,0);
 }
 let calls=0;const f=await fixture(t,{resolve:()=>{calls++;return new Promise(()=>{});}});
 for(let i=0;i<4;i++)f.input(dns(f.mac));assert.equal(calls,3);assert.equal(f.closed,1);
});
test('name address replacement retires old associations and invalid resolver answers cannot authorize TCP',async t=>{
 let address='140.82.112.3';const f=await fixture(t,{resolve:async hostname=>({hostname,address})});
 f.input(dns(f.mac));await flush();address='140.82.112.4';f.input(dns(f.mac));await flush();
 f.input(tcp(f.mac));assert.equal(f.sent.length,0);f.input(tcp(f.mac,{dest:[140,82,112,4]}));assert.equal(f.sent.length,1);
 const g=await fixture(t,{resolve:async hostname=>({hostname,address:'127.0.0.1'})});g.input(dns(g.mac));await flush();assert.equal(g.closed,1);assert.deepEqual(g.frames,[]);
});
test('duplicate attachment and reattachment after close cannot replace the lifecycle guard',async t=>{
 const f=await fixture(t);assert.throws(()=>attachConnectorGuestNetwork({machine:f.machine,client:f.client}),/Fresh paused/);
 f.network.close();assert.throws(()=>attachConnectorGuestNetwork({machine:f.machine,client:f.client}),/Fresh paused/);
});

test('local ARP and DHCP work without a transport or resolver; off-router DHCP is dropped',async t=>{
 const f=await fixture(t);f.input(arp(f.mac));assert.equal(f.frames.length,1);assert.equal(f.frames[0].readUInt16BE(20),2);assert.deepEqual([...f.frames[0].subarray(28,32)],[192,168,86,1]);
 f.frames.length=0;f.input(dhcp(f.mac));assert.equal(f.frames.length,1);const offer=f.frames[0];assert.equal(offer.readUInt16BE(34),67);assert.equal(offer.readUInt16BE(36),68);assert.equal(offer.readUInt32BE(46),0x12345678);assert.deepEqual([...offer.subarray(58,62)],[192,168,86,100]);
 f.frames.length=0;f.input(dhcp(f.mac,[8,8,8,8]));assert.deepEqual(f.frames,[]);assert.deepEqual(f.queries,[]);assert.deepEqual(f.sent,[]);assert.equal(f.closed,0);
});
test('guest FIN waits for queued upload credit before sending formal CLOSE',async t=>{
 const f=await fixture(t);await open(f);for(let i=0;i<19;i++)f.input(tcp(f.mac,{seq:101+i,ack:1338,flags:24,data:'a'}));
 f.input(tcp(f.mac,{seq:120,ack:1338,flags:17}));assert.equal(f.sent.filter(b=>b[0]===4).length,0);
 f.network.receive(Buffer.from('030100000010000000','hex'));assert.deepEqual(f.sent.slice(-4).map(b=>b.toString('hex')),[...Array(3).fill('020100000061'),'040100000002']);
});
