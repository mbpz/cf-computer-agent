import { V86 } from './engine/libv86.mjs';
import { prepareAlpineIso, readImageResponse } from './alpine-iso.mjs';
import { createTerminalSession } from './terminal-session.mjs';
import { attachTerminalWorker } from './terminal-worker-endpoint.mjs';

attachTerminalWorker(self, async () => {
  const profile = await prepareAlpineIso({ Engine: V86, readAsset: async artifact =>
    readImageResponse(await fetch(`/${artifact.location}/${artifact.name}`), artifact),
  });
  // This G0 terminal is explicitly offline: no relay, ticket or network device.
  return createTerminalSession({ createMachine: () => profile.createMachine() });
});
