// Development-only boot profile. These pins do not authorize redistribution,
// certify the imported JS engine module, or replace a signed release manifest.
export const ALPINE_ISO_ARTIFACTS = Object.freeze([
  { role: 'wasm', name: 'v86.wasm', location: 'engine', bytes: 2_101_621, sha256: '6121632f6d657d03f2286341ed87edcafd4945fa65ae765b4c7fd0bf2554a9c7' },
  { role: 'bios', name: 'seabios.bin', location: 'boot', bytes: 131_072, sha256: '73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98' },
  { role: 'vga-bios', name: 'vgabios.bin', location: 'boot', bytes: 36_352, sha256: 'a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880' },
  { role: 'kernel', name: 'boot/vmlinuz-virt', location: 'iso', bytes: 8_040_960, sha256: 'e800b7f48ccc9f2a9471d29eb152565905b5f3f1ed247b3c5a6f1f2d09fb29bd' },
  { role: 'initrd', name: 'boot/initramfs-virt', location: 'iso', bytes: 7_755_250, sha256: '167958367c7ba4c8293011982b444a55a98768e239f263b849855d055763e4b3' },
  { role: 'iso', name: 'alpine-virt-3.24.1-x86.iso', location: 'iso', bytes: 51_380_224, sha256: '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209' },
].map(Object.freeze));

// The guest retains its NIC identity across snapshots. Restore both the NE2K
// MAC and device RAM, and bind this behavior into checkpoint compatibility.
const checkpointDeviceOptions = Object.freeze({ preserve_mac_from_state_image: true });

const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');

export async function readImageResponse(response, artifact) {
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Pinned image resource unavailable: ${artifact.name}`);
  }
  if (response.headers.get('content-length') !== String(artifact.bytes)) {
    await response.body.cancel();
    throw new Error(`Unexpected image size: ${artifact.name}`);
  }
  const output = new Uint8Array(artifact.bytes);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.byteLength > output.byteLength - offset) throw new Error(`Unexpected image size: ${artifact.name}`);
      output.set(value, offset);
      offset += value.byteLength;
    }
    if (offset !== output.byteLength) throw new Error(`Unexpected image size: ${artifact.name}`);
    return output;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

export async function verifyImageBytes(input, artifact) {
  if (!(input instanceof Uint8Array)) throw new Error('Image bytes must be a Uint8Array');
  if (input.byteLength !== artifact.bytes) throw new Error(`Unexpected image size: ${artifact.name}`);
  // Own the bytes before awaiting crypto, including inputs backed by a Node Buffer.
  const owned = new Uint8Array(input);
  const digest = hex(await crypto.subtle.digest('SHA-256', owned));
  if (digest !== artifact.sha256) throw new Error(`Unexpected image digest: ${artifact.name}`);
  return owned;
}

export async function prepareAlpineIso({ readAsset, Engine }) {
  if (typeof readAsset !== 'function' || typeof Engine !== 'function') throw new Error('An image reader and engine are required');
  const buffers = new Map();
  for (const artifact of ALPINE_ISO_ARTIFACTS) {
    buffers.set(artifact.role, await verifyImageBytes(await readAsset(artifact), artifact));
  }
  // Compile verified bytes, not a URL that the engine would fetch again later.
  // Do this before construction so a compilation failure cannot strand an engine.
  const wasmModule = await WebAssembly.compile(buffers.get('wasm'));
  const identityDigest = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({
    artifacts: ALPINE_ISO_ARTIFACTS, checkpointDeviceOptions,
  }))));
  const checkpointIdentity = Object.freeze({
    engineVersion: 'v86-0.5.458', imageVersion: `alpine-virt-3.24.1-x86@${identityDigest}`,
    memoryBytes: 256 * 1024 * 1024, filesystem: 'ram-root+in-memory-9p+readonly-iso',
  });
  const copy = role => ({ buffer: new Uint8Array(buffers.get(role)).buffer });
  return Object.freeze({
    checkpointIdentity,
    bootArtifacts: ALPINE_ISO_ARTIFACTS,
    createMachine: netDevice => new Engine({
      wasm_fn: async imports => (await WebAssembly.instantiate(wasmModule, imports)).exports,
      bios: copy('bios'), vga_bios: copy('vga-bios'), bzimage: copy('kernel'), initrd: copy('initrd'), cdrom: copy('iso'),
      cmdline: 'console=ttyS0,115200 modules=loop,squashfs,sd-mod,usb-storage quiet',
      memory_size: checkpointIdentity.memoryBytes, filesystem: {}, autostart: false, disable_speaker: true,
      ...checkpointDeviceOptions,
      ...(netDevice ? { net_device: netDevice } : {}),
    }),
  });
}
