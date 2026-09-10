import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { once } from 'node:events';
import { createHash, randomBytes } from 'node:crypto';
import { V86 } from 'v86';
import { WebSocket } from 'ws';
import { ALPINE_ISO_ARTIFACTS, prepareAlpineIso } from './alpine-iso.mjs';
import { createTerminalSession } from './terminal-session.mjs';
import { sealCheckpoint, restoreCheckpoint } from './probe-checkpoint.mjs';
import { encodeProbeCommand, parseProbeReply } from './serial-protocol.mjs';
import { attachLocalProbeRelay } from './relay/local-relay.mjs';
import { createAuthenticatedProbeSocket } from './authenticated-probe-socket.mjs';

const assets = process.env.BROWSER_VM_PROBE_ASSETS;
const isoAssets = process.env.BROWSER_VM_PROBE_ISO_ASSETS;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

async function closeServer(server) {
  server.closeAllConnections();
  await new Promise(resolveClose => server.close(resolveClose));
}

function event(machine, name) {
  return new Promise((resolveEvent, reject) => {
    const listener = () => { clearTimeout(timer); machine.remove_listener(name, listener); resolveEvent(); };
    const timer = setTimeout(() => {
      machine.remove_listener(name, listener);
      reject(new Error(`Engine event timed out: ${name}`));
    }, 10_000);
    machine.add_listener(name, listener);
  });
}

function command(machine, text, timeoutMs = 8000) {
  const id = randomBytes(8).toString('hex');
  return new Promise((resolveCommand, reject) => {
    let output = '';
    const finish = (error, result) => {
      clearTimeout(timer);
      machine.remove_listener('serial0-output-byte', receive);
      error ? reject(error) : resolveCommand(result);
    };
    const receive = byte => {
      output += String.fromCharCode(byte);
      if (output.length > 65536) return finish(new Error('Bounded test output exceeded'));
      const reply = parseProbeReply(output, id);
      if (reply) finish(null, reply);
    };
    const timer = setTimeout(() => finish(new Error(`Command timed out: ${text}; ${JSON.stringify(output.slice(-500))}`)), timeoutMs);
    machine.add_listener('serial0-output-byte', receive);
    machine.serial0_send(encodeProbeCommand(text, id));
  });
}

test('real Alpine checkpoint drops relay authorization and live TCP; only an explicit fresh grant allows new requests', {
  skip: (!assets || !isoAssets) && 'Explicit development BIOS and ISO assets required', timeout: 90_000,
}, async () => {
  // Exercise the real guest, TLS-independent TCP/WISP path and checkpoint.
  // Only the upstream DNS/dial boundary is replaced with a loopback HTTP
  // fixture. This does NOT establish Internet, TLS, Git or package acceptance.
  const requests = [];
  let holdResponse;
  let holdClosed = false;
  const upstream = createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    request.resume();
    if (request.url === '/hold') {
      holdResponse = response;
      response.on('close', () => { holdClosed = true; });
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.write('LIVE-STREAM\n');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' });
      response.end(request.url === '/once' ? 'ONCE-ACK' : 'FRESH-GRANT-ACK');
    }
  });
  const gateway = createServer((_, response) => { response.writeHead(404); response.end(); });
  let relay;
  let session;
  let machine;
  let socketsOpened = 0;
  let disconnected;
  const originalWebSocket = globalThis.WebSocket;
  try {
    await listen(upstream);
    const origin = await listen(gateway);
    relay = attachLocalProbeRelay(gateway, {
      origin: () => origin,
      resolve4: async hostname => {
        assert.equal(hostname, 'dl-cdn.alpinelinux.org');
        return ['93.184.216.34'];
      },
      dial: options => {
        assert.deepEqual(options, { host: '93.184.216.34', port: 80 });
        return connect({ host: '127.0.0.1', port: upstream.address().port });
      },
    });
    const profile = await prepareAlpineIso({ Engine: V86, readAsset: artifact => readFile(join(
      artifact.location === 'engine' ? resolve('node_modules/v86/build') : artifact.location === 'boot' ? assets : isoAssets,
      artifact.name,
    )) });
    // The old profile did not restore the NIC's MAC/device RAM. Even though
    // image bytes are unchanged, its checkpoint contract must not match.
    const legacyImageVersion = 'alpine-virt-3.24.1-x86@' + createHash('sha256').update(JSON.stringify(ALPINE_ISO_ARTIFACTS)).digest('hex');
    assert.notEqual(profile.checkpointIdentity.imageVersion, legacyImageVersion);
    function authorize() {
      class NativeWebSocket extends WebSocket {
        constructor(url) { super(url, { origin }); socketsOpened++; }
      }
      const url = origin.replace('http:', 'ws:') + '/relay';
      globalThis.WebSocket = createAuthenticatedProbeSocket({
        NativeWebSocket, url, ticket: relay.issueTicket(),
        onDisconnect: error => { disconnected = error; },
      });
      return { type: 'ne2k', dns_method: 'static', relay_url: url.replace('ws:', 'wisp:') };
    }
    const netDevice = authorize();
    session = createTerminalSession({ createMachine: () => (machine = profile.createMachine(netDevice)) });
    await session.ready;
    assert.equal((await command(machine, 'ifconfig eth0 192.168.86.100 netmask 255.255.255.0 up && ip route replace default via 192.168.86.1 dev eth0')).exitCode, 0);
    assert.equal((await command(machine, 'wget -T 3 -qO /tmp/once-result --post-data=once http://203.0.113.10/once && cat /tmp/once-result')).output.trim(), 'ONCE-ACK');
    assert.deepEqual(requests, [{ method: 'POST', path: '/once' }]);
    assert.equal((await command(machine, '(wget -T 8 -qO /tmp/live-stream http://203.0.113.10/hold >/tmp/hold-log 2>&1; echo $? > /tmp/hold-status) &')).exitCode, 0);
    // Wait for actual received guest data, not merely a submitted command.
    assert.equal((await command(machine, 'for n in 1 2 3 4 5; do test -s /tmp/live-stream && break; sleep 1; done; cat /tmp/live-stream')).output.trim(), 'LIVE-STREAM');
    assert.ok(holdResponse && !holdClosed);
    const stopped = event(machine, 'emulator-stopped');
    machine.stop();
    await stopped;
    const checkpoint = await sealCheckpoint(await machine.save_state(), profile.checkpointIdentity);
    await session.close();
    session = undefined;
    machine = undefined;

    // The previously consumed socket class deliberately remains installed:
    // any automatic reconnect during restoration would throw/fail the test.
    machine = profile.createMachine();
    await event(machine, 'emulator-ready');
    await assert.rejects(restoreCheckpoint(machine, {
      ...checkpoint, identity: { ...checkpoint.identity, imageVersion: legacyImageVersion },
    }, profile.checkpointIdentity), /compatibility mismatch/);
    await restoreCheckpoint(machine, checkpoint, profile.checkpointIdentity);
    machine.run();
    assert.equal((await command(machine, 'cat /tmp/once-result')).output.trim(), 'ONCE-ACK');
    assert.notEqual((await command(machine, 'wget -T 1 -qO /tmp/offline http://203.0.113.10/offline', 5000)).exitCode, 0);
    assert.equal(socketsOpened, 1);
    assert.equal(holdClosed, true);
    assert.deepEqual(requests, [{ method: 'POST', path: '/once' }, { method: 'GET', path: '/hold' }]);
    assert.equal(relay.inspect().length, 0);

    const offlineStopped = event(machine, 'emulator-stopped');
    machine.stop();
    await offlineStopped;
    const offlineCheckpoint = await sealCheckpoint(await machine.save_state(), profile.checkpointIdentity);
    await machine.destroy();
    machine = undefined;
    // Model the explicit new authorization boundary, not automatic reconnect.
    const newDevice = authorize();
    machine = profile.createMachine(newDevice);
    await event(machine, 'emulator-ready');
    await restoreCheckpoint(machine, offlineCheckpoint, profile.checkpointIdentity);
    machine.run();
    const after = await command(machine, 'wget -T 3 -qO /tmp/after http://203.0.113.10/after && cat /tmp/after');
    if (after.exitCode !== 0) {
      assert.fail(JSON.stringify({ output: after.output, relay: relay.inspect(), requests, network: await command(machine, 'ifconfig eth0; ip route; cat /proc/net/arp') }));
    }
    assert.equal(after.output.trim(), 'FRESH-GRANT-ACK');
    // Keep observing until the restored outstanding request actually fails.
    // Successful new traffic alone would not rule out a delayed old replay.
    const held = await command(machine, 'for n in 1 2 3 4 5 6 7 8 9 10; do test -s /tmp/hold-status && break; sleep 1; done; test -s /tmp/hold-status && cat /tmp/hold-status', 12_000);
    assert.equal(held.exitCode, 0);
    assert.match(held.output.trim(), /^[1-9][0-9]*$/);
    assert.equal(socketsOpened, 2);
    assert.equal(disconnected, undefined);
    assert.deepEqual(requests, [
      { method: 'POST', path: '/once' }, { method: 'GET', path: '/hold' }, { method: 'GET', path: '/after' },
    ]);
    console.log(JSON.stringify({ image: 'alpine-iso', profile: profile.checkpointIdentity.imageVersion, recovery: 'offline-then-explicit-fresh-grant', socketsOpened, upstreamRequests: requests.length, originalPostCount: requests.filter(request => request.method === 'POST').length, oldStreamClosed: holdClosed, oldGuestRequestExitCode: Number(held.output.trim()) }));
  } finally {
    if (session) await session.close();
    else if (machine) await machine.destroy();
    globalThis.WebSocket = originalWebSocket;
    await relay?.close();
    await closeServer(gateway);
    await closeServer(upstream);
  }
});
