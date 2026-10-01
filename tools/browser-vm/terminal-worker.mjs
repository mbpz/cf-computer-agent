import { V86 } from './engine/libv86.mjs';
import { prepareAlpineIso, readImageResponse, ALPINE_ISO_ARTIFACTS } from './alpine-iso.mjs';
import { createTerminalSession } from './terminal-session.mjs';
import { attachTerminalWorker } from './terminal-worker-endpoint.mjs';

attachTerminalWorker(self, async checkpoint => {
  let readAsset = async artifact => readImageResponse(await fetch(`/${artifact.location}/${artifact.name}`), artifact);
  // Explicit local diagnostic opt-in. The ordinary path remains unchanged.
  if (new URL(self.location.href).search === '?chunked=1') {
    const { createChunkedImageReader } = await import('./chunked-image.mjs');
    readAsset = await createChunkedImageReader({artifacts:ALPINE_ISO_ARTIFACTS, origin:self.location.origin});
  }
  const profile = await prepareAlpineIso({ Engine: V86, readAsset });
  // This G0 terminal is explicitly offline: no relay, ticket or network device.
  const session = createTerminalSession({ checkpoint, checkpointIdentity:profile.checkpointIdentity, createMachine: () => profile.createMachine() });
  // Public template counters only; preserve the session's live state getter.
  if (readAsset.diagnostics) session.imageLoad = {cache:readAsset.cacheStatus,...readAsset.diagnostics};
  return session;
});
