import { createTerminalSession } from './terminal-session.mjs';
import { sealCheckpoint, restoreCheckpoint } from './probe-checkpoint.mjs';
import { encodeProbeCommand, parseProbeReply } from './serial-protocol.mjs';

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Recovery evidence failed: ${message}`);
}

function engineEvent(machine, name) {
  return new Promise((resolve, reject) => {
    const listener = () => { clearTimeout(timer); machine.remove_listener(name, listener); resolve(); };
    const timer = setTimeout(() => { machine.remove_listener(name, listener); reject(new Error(`Engine event timed out: ${name}`)); }, 10_000);
    machine.add_listener(name, listener);
  });
}

export function runRecoveryCommand(machine, text, { stage, timeoutMs = 8000 } = {}) {
  const id = crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  return new Promise((resolve, reject) => {
    let output = '';
    const finish = (error, result) => {
      clearTimeout(timer);
      machine.remove_listener('serial0-output-byte', receive);
      error ? reject(error) : resolve(result);
    };
    const receive = byte => {
      output += String.fromCharCode(byte);
      if (output.length > 65536) return finish(new Error('Bounded recovery output exceeded'));
      const reply = parseProbeReply(output, id);
      if (reply) finish(null, reply);
    };
    const timer = setTimeout(() => finish(new Error(`Recovery guest command timed out: ${stage ?? 'unspecified'}`)), timeoutMs);
    machine.add_listener('serial0-output-byte', receive);
    machine.serial0_send(encodeProbeCommand(text, id));
  });
}

// Shared real-engine verification, not a product controller. No guest command is
// retried. Only read-only fixture observations are polled for asynchronous close.
export async function runRecoveryProbe({ profile, authorize, inspect, waitForFreshGrant, onProgress = () => {} }) {
  const run = crypto.randomUUID();
  const url = `http://203.0.113.10/${run}`;
  let machine;
  let session;
  const command = (stage, text, timeoutMs) => {
    onProgress(stage);
    return runRecoveryCommand(machine, text, { stage, timeoutMs });
  };
  const observeClosed = async () => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const evidence = await inspect(run);
      requireEvidence(evidence.mode === 'loopback-http-fixture', 'wrong server mode');
      if (evidence.activeSessions === 0 && evidence.holdClosed) return evidence;
      if (Date.now() >= deadline) throw new Error('Old relay session did not close');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const save = async () => {
    const stopped = engineEvent(machine, 'emulator-stopped');
    machine.stop();
    await stopped;
    return sealCheckpoint(await machine.save_state(), profile.checkpointIdentity);
  };
  const restore = async (checkpoint, device) => {
    machine = profile.createMachine(device);
    await engineEvent(machine, 'emulator-ready');
    await restoreCheckpoint(machine, checkpoint, profile.checkpointIdentity);
    machine.run();
  };
  try {
    onProgress('boot');
    const device = await authorize();
    session = createTerminalSession({ createMachine: () => (machine = profile.createMachine(device)) });
    await session.ready;
    requireEvidence((await command('guest-route', 'ifconfig eth0 192.168.86.100 netmask 255.255.255.0 up && ip route replace default via 192.168.86.1 dev eth0')).exitCode === 0, 'guest route');
    const once = await command('initial-post', `wget -T 3 -qO /tmp/once-result --post-data=once ${url}/once && cat /tmp/once-result`);
    requireEvidence(once.exitCode === 0 && once.output.trim() === 'ONCE-ACK', 'initial POST');
    requireEvidence((await command('held-request-start', `(wget -T 8 -qO /tmp/live-stream ${url}/hold >/tmp/hold-log 2>&1; echo $? > /tmp/hold-status) &`)).exitCode === 0, 'held request started');
    requireEvidence((await command('held-response', 'for n in 1 2 3 4 5; do test -s /tmp/live-stream && break; sleep 1; done; cat /tmp/live-stream')).output.trim() === 'LIVE-STREAM', 'guest received held response');
    onProgress('saving');
    let checkpoint = await save();
    await session.close();
    session = undefined;
    machine = undefined;
    await restore(checkpoint);
    checkpoint = undefined;
    requireEvidence((await command('restored-file', 'cat /tmp/once-result')).output.trim() === 'ONCE-ACK', 'restored guest file');
    requireEvidence((await command('offline-request', `wget -T 1 -qO /tmp/offline ${url}/offline`, 5000)).exitCode !== 0, 'restore must be offline');
    const offline = await observeClosed();
    requireEvidence(JSON.stringify(offline.requests) === JSON.stringify([{ method: 'POST', path: '/once' }, { method: 'GET', path: '/hold' }]), 'offline restore made a request');
    // Park the guest while a human decides. No authorization is requested until
    // this callback resolves; cancellation terminates the owning Worker.
    const offlineCheckpoint = await save();
    await machine.destroy();
    machine = undefined;
    await waitForFreshGrant(offline);
    onProgress('fresh-grant');
    await restore(offlineCheckpoint, await authorize());
    const fresh = await command('fresh-request', `wget -T 3 -qO /tmp/after ${url}/after && cat /tmp/after`);
    requireEvidence(fresh.exitCode === 0 && fresh.output.trim() === 'FRESH-GRANT-ACK', 'fresh grant request');
    const held = await command('old-request-exit', 'for n in 1 2 3 4 5 6 7 8 9 10; do test -s /tmp/hold-status && break; sleep 1; done; test -s /tmp/hold-status && cat /tmp/hold-status', 12_000);
    requireEvidence(held.exitCode === 0 && /^[1-9][0-9]*$/.test(held.output.trim()), 'old request did not fail');
    await machine.destroy();
    machine = undefined;
    const evidence = await observeClosed();
    requireEvidence(JSON.stringify(evidence.requests) === JSON.stringify([
      { method: 'POST', path: '/once' }, { method: 'GET', path: '/hold' }, { method: 'GET', path: '/after' },
    ]), 'unexpected or replayed request');
    return { completed: true, ...evidence, oldRequestExitCode: Number(held.output.trim()), imageVersion: profile.checkpointIdentity.imageVersion };
  } finally {
    if (session) await session.close();
    else if (machine) await machine.destroy();
  }
}
