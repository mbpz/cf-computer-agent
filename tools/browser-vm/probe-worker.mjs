import { V86 } from './engine/libv86.mjs';
import { runMachineProbe } from './probe-core.mjs';
import { ALPINE_FILE } from './alpine-artifact.mjs';
import { prepareAlpineIso, readImageResponse } from './alpine-iso.mjs';
import { createAuthenticatedProbeSocket } from './authenticated-probe-socket.mjs';

// Only this dedicated Worker owns the engine. The page can terminate it even if Linux hangs.
let started = false;
self.addEventListener('message', async ({ data }) => {
  if (started || data?.type !== 'run-probe') return;
  started = true;
  try {
    const image = data.image ?? 'buildroot';
    if (!['buildroot', 'alpine-iso'].includes(image)) throw new Error('Unknown image profile');
    if (image === 'alpine-iso' && data.alpine === true) throw new Error('ISO and chroot options conflict');
    const bootProfile = image === 'alpine-iso' ? await prepareAlpineIso({ Engine: V86, readAsset: async artifact => {
      const response = await fetch(`/${artifact.location}/${artifact.name}`);
      return readImageResponse(response, artifact);
    } }) : undefined;
    let alpineRootfs;
    if (data.alpine === true) {
      const response = await fetch(`/boot/${ALPINE_FILE}`);
      if (!response.ok) throw new Error('Pinned Alpine archive is unavailable');
      alpineRootfs = new Uint8Array(await response.arrayBuffer());
    }
    let capability;
    if (data.network === true) {
      if (!alpineRootfs && !bootProfile) throw new Error('Networking verification requires Alpine');
      const response = await fetch('/relay-ticket', { method: 'POST' });
      if (!response.ok) throw new Error('Local relay capability unavailable');
      capability = await response.json();
      self.WebSocket = createAuthenticatedProbeSocket({
        ...capability, NativeWebSocket: self.WebSocket,
        onDisconnect: error => {
          self.postMessage({ type: 'failure', message: error.message });
          self.close(); // Never run offline silently after a lost network authorization.
        },
      });
    }
    let created = 0;
    const evidence = await runMachineProbe({ alpineRootfs, image, bootProfile, network: data.network === true,
      onProgress: progress => self.postMessage({ type: 'progress', progress }),
      timeoutMs: data.network === true ? 90_000 : 30_000, createMachine: () => {
      const netDevice = created++ === 0 && capability ? {
        type: 'ne2k', dns_method: 'static', relay_url: capability.url.replace('ws:', 'wisp:'),
      } : undefined;
      if (bootProfile) return bootProfile.createMachine(netDevice);
      return new V86({
      wasm_path: '/engine/v86.wasm',
      bios: { url: '/boot/seabios.bin' },
      vga_bios: { url: '/boot/vgabios.bin' },
      bzimage: { url: '/boot/buildroot-bzimage68.bin' },
      cmdline: 'console=ttyS0', memory_size: 256 * 1024 * 1024,
      filesystem: {}, autostart: false, disable_speaker: true,
      ...(netDevice ? { net_device: netDevice } : {}),
    }); } });
    self.postMessage({ type: 'result', evidence: { ...evidence, executionHost: 'browser-worker' } });
  } catch (error) {
    self.postMessage({ type: 'failure', message: error instanceof Error ? error.message : String(error) });
  }
});
