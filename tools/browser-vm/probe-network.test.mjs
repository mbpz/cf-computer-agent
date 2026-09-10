import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { WebSocket } from 'ws';
import { V86 } from 'v86';
import { runMachineProbe } from './probe-core.mjs';
import { startProbeServer } from './server.mjs';
import { createAuthenticatedProbeSocket } from './authenticated-probe-socket.mjs';
import { ALPINE_FILE } from './alpine-artifact.mjs';
import { prepareAlpineIso } from './alpine-iso.mjs';

const assets = process.env.BROWSER_VM_PROBE_ASSETS;
const isoAssets = process.env.BROWSER_VM_PROBE_ISO_ASSETS;
const image = isoAssets ? 'alpine-iso' : 'buildroot';
const enabled = process.env.BROWSER_VM_PROBE_NETWORK === '1';
const require = createRequire(import.meta.url);

test(`real ${image} Linux installs packages and uses verified HTTPS Git/API through the authenticated local relay`, {
  skip: !assets || !enabled, timeout: 180_000,
}, async () => {
  const server = await startProbeServer({ assets });
  const original = globalThis.WebSocket;
  let socketFailure;
  try {
    const bootProfile = isoAssets ? await prepareAlpineIso({ Engine: V86, readAsset: artifact => readFile(
      artifact.location === 'engine' ? require.resolve(`v86/build/${artifact.name}`)
        : join(artifact.location === 'iso' ? isoAssets : assets, artifact.name),
    ) }) : undefined;
    const response = await fetch(server.url + '/relay-ticket', { method: 'POST', headers: { Origin: server.url } });
    assert.equal(response.status, 200);
    const capability = await response.json();
    class NativeWebSocket extends WebSocket {
      constructor(url) { super(url, { origin: server.url }); }
    }
    globalThis.WebSocket = createAuthenticatedProbeSocket({
      ...capability, NativeWebSocket, onDisconnect: error => { socketFailure = error; },
    });
    let created = 0;
    let machine;
    let diagnosticBucket = -1;
    const evidence = await runMachineProbe({
      timeoutMs: 90_000,
      image, bootProfile,
      alpineRootfs: isoAssets ? undefined : new Uint8Array(await readFile(join(assets, ALPINE_FILE))),
      network: true,
      onProgress: event => {
        const bucket = Math.floor(event.elapsedMs / 15_000);
        if (event.status !== 'running' || (event.stage === 'packages' && bucket > diagnosticBucket)) {
          diagnosticBucket = bucket;
          // Pinned-engine internal counters are diagnostic evidence only,
          // not a product adapter contract. Never emit packets or credentials.
          const guest = Object.values(machine?.network_adapter?.tcp_conn ?? {}).map(connection => ({
            state: connection.state, pending: connection.pending,
            bufferedBytes: connection.send_buffer?.length,
          }));
          console.log(JSON.stringify({ ...event, relay: server.inspectRelay(), guest }));
        }
      },
      createMachine: () => {
        const netDevice = created++ === 0 ? { type: 'ne2k', dns_method: 'static', relay_url: capability.url.replace('ws:', 'wisp:') } : undefined;
        if (bootProfile) return (machine = bootProfile.createMachine(netDevice));
        return (machine = new V86({
        wasm_path: require.resolve('v86/build/v86.wasm'),
        bios: { url: join(assets, 'seabios.bin') },
        vga_bios: { url: join(assets, 'vgabios.bin') },
        bzimage: { url: join(assets, 'buildroot-bzimage68.bin') },
        memory_size: 256 * 1024 * 1024,
        filesystem: {}, cmdline: 'console=ttyS0', autostart: false, disable_speaker: true,
        // Restoring a checkpoint MUST NOT restore or reconnect a network lease.
        ...(netDevice ? { net_device: netDevice } : {}),
      })); },
    });
    assert.equal(socketFailure, undefined);
    assert.equal(evidence.networkVerified, true);
    assert.match(evidence.network.gitVersion, /^git version /);
    assert.match(evidence.network.gitCommit, /^[0-9a-f]{40}$/);
    assert.equal(evidence.network.apiStatus, '200');
    assert.equal(evidence.network.apiRepository, 'octocat/Hello-World');
    assert.ok(evidence.network.packageInstall.length > 0);
    // Only public test evidence is emitted. Capabilities/URLs with credentials are never printed.
    console.log(JSON.stringify({ network: evidence.network, snapshotBytes: evidence.snapshotBytes }));
  } finally {
    globalThis.WebSocket = original;
    await server.close();
  }
});
