// Test-only Node Worker adapter for the SAME terminal endpoint and real Alpine.
import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { V86 } from 'v86';
import { prepareAlpineIso } from '../alpine-iso.mjs';
import { createTerminalSession } from '../terminal-session.mjs';
import { attachTerminalWorker } from '../terminal-worker-endpoint.mjs';
const listeners = new Map();
const port = {
  addEventListener(type, fn) { const listener = data => fn({data}); listeners.set(fn, listener); parentPort.on(type, listener); },
  removeEventListener(type, fn) { parentPort.off(type, listeners.get(fn)); listeners.delete(fn); },
  postMessage: (value, transfers) => parentPort.postMessage(value, transfers), close: () => parentPort.close(),
};
attachTerminalWorker(port, async checkpoint => {
  const profile = await prepareAlpineIso({ Engine: V86, readAsset: artifact => readFile(join(workerData[artifact.location], artifact.name)) });
  return createTerminalSession({ checkpoint, checkpointIdentity:profile.checkpointIdentity, createMachine: () => profile.createMachine() });
});
