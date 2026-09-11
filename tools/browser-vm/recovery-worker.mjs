import { V86 } from './engine/libv86.mjs';
import { prepareAlpineIso, readImageResponse } from './alpine-iso.mjs';
import { createAuthenticatedProbeSocket } from './authenticated-probe-socket.mjs';
import { runRecoveryProbe } from './recovery-core.mjs';

let started = false;
let resume;
const NativeWebSocket = self.WebSocket;
self.addEventListener('message', async ({ data }) => {
  if (data?.type === 'fresh-grant' && resume) {
    const proceed = resume;
    resume = undefined;
    proceed();
    return;
  }
  if (data?.type !== 'run' || started) return;
  started = true;
  try {
    const profile = await prepareAlpineIso({ Engine: V86, readAsset: async artifact =>
      readImageResponse(await fetch(`/${artifact.location}/${artifact.name}`), artifact) });
    let grants = 0;
    const evidence = await runRecoveryProbe({ profile,
      authorize: async () => {
        const response = await fetch('/relay-ticket', { method: 'POST' });
        if (!response.ok) throw new Error('Local recovery authorization unavailable');
        const capability = await response.json();
        self.WebSocket = createAuthenticatedProbeSocket({ ...capability, NativeWebSocket, onDisconnect: error => {
          self.postMessage({ type: 'failure', message: error.message });
          self.close();
        } });
        grants++;
        return { type: 'ne2k', dns_method: 'static', relay_url: capability.url.replace('ws:', 'wisp:') };
      },
      inspect: async run => {
        const response = await fetch(`/recovery-inspect?run=${run}`);
        if (!response.ok) throw new Error('Recovery fixture observation unavailable');
        return response.json();
      },
      waitForFreshGrant: evidence => new Promise(resolve => {
        resume = resolve;
        self.postMessage({ type: 'offline-ready', evidence: { ...evidence, grants } });
      }),
      onProgress: stage => self.postMessage({ type: 'progress', stage }),
    });
    self.postMessage({ type: 'result', evidence: { ...evidence, grants, executionHost: 'browser-worker' } });
  } catch (error) {
    self.postMessage({ type: 'failure', message: error instanceof Error ? error.message : 'Recovery failed', diagnostic: error?.diagnostic });
  }
});
