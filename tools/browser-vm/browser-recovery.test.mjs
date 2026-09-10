import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { V86 } from 'v86';
import { WebSocket } from 'ws';
import { prepareAlpineIso } from './alpine-iso.mjs';
import { startProbeServer } from './server.mjs';
import { createAuthenticatedProbeSocket } from './authenticated-probe-socket.mjs';
import { runRecoveryProbe } from './recovery-core.mjs';

const assets = process.env.BROWSER_VM_PROBE_ASSETS;
const isoAssets = process.env.BROWSER_VM_PROBE_ISO_ASSETS;
test('browser recovery core waits at the offline boundary and uses a separate fresh grant without replaying the POST', {
  skip: (!assets || !isoAssets) && 'Explicit BIOS and ISO assets required', timeout: 90_000,
}, async () => {
  const server = await startProbeServer({ assets, isoAssets, recovery: true });
  const original = globalThis.WebSocket;
  let grants = 0;
  let checkpoints = 0;
  try {
    const profile = await prepareAlpineIso({ Engine: V86, readAsset: artifact => readFile(join(
      artifact.location === 'engine' ? resolve('node_modules/v86/build') : artifact.location === 'boot' ? assets : isoAssets, artifact.name,
    )) });
    const result = await runRecoveryProbe({ profile,
      authorize: async () => {
        const reply = await fetch(server.url + '/relay-ticket', { method: 'POST', headers: { Origin: server.url } });
        assert.equal(reply.status, 200);
        const capability = await reply.json();
        class NativeWebSocket extends WebSocket { constructor(url) { super(url, { origin: server.url }); } }
        globalThis.WebSocket = createAuthenticatedProbeSocket({ ...capability, NativeWebSocket, onDisconnect: error => { throw error; } });
        grants++;
        return { type: 'ne2k', dns_method: 'static', relay_url: capability.url.replace('ws:', 'wisp:') };
      },
      inspect: async run => (await fetch(`${server.url}/recovery-inspect?run=${run}`)).json(),
      waitForFreshGrant: async evidence => {
        checkpoints++;
        assert.equal(grants, 1);
        assert.equal(evidence.activeSessions, 0);
        assert.equal(evidence.holdClosed, true);
        assert.deepEqual(evidence.requests, [{ method: 'POST', path: '/once' }, { method: 'GET', path: '/hold' }]);
      },
    });
    assert.equal(result.completed, true);
    assert.equal(checkpoints, 1);
    assert.equal(grants, 2);
    assert.equal(result.oldRequestExitCode, 1);
    assert.equal(result.activeSessions, 0);
    assert.deepEqual(result.requests, [{ method: 'POST', path: '/once' }, { method: 'GET', path: '/hold' }, { method: 'GET', path: '/after' }]);
  } finally { globalThis.WebSocket = original; await server.close(); }
});
