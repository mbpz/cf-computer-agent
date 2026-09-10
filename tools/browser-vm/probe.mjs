import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { V86 } from 'v86';
import { runMachineProbe } from './probe-core.mjs';
import { ALPINE_FILE } from './alpine-artifact.mjs';
import { prepareAlpineIso } from './alpine-iso.mjs';

export async function runProbe({ assets, isoAssets, image = 'buildroot', timeoutMs = 30_000, alpine = false }) {
  if (typeof assets !== 'string' || !assets) throw new Error('An explicit development asset directory is required');
  if (!['buildroot', 'alpine-iso'].includes(image)) throw new Error('Unknown image profile');
  if (image === 'alpine-iso') {
    if (alpine) throw new Error('ISO and chroot options conflict');
    if (typeof isoAssets !== 'string' || !isoAssets) throw new Error('An explicit ISO asset directory is required');
    const bootProfile = await prepareAlpineIso({ Engine: V86, readAsset: artifact => readFile(join(
      artifact.location === 'engine' ? resolve('node_modules/v86/build') : artifact.location === 'iso' ? isoAssets : assets,
      artifact.name,
    )) });
    const evidence = await runMachineProbe({ createMachine: bootProfile.createMachine, image, bootProfile, timeoutMs });
    return { ...evidence, executionHost: 'node' };
  }
  const options = {
    wasm_path: resolve('node_modules/v86/build/v86.wasm'),
    bios: { url: join(assets, 'seabios.bin') },
    vga_bios: { url: join(assets, 'vgabios.bin') },
    bzimage: { url: join(assets, 'buildroot-bzimage68.bin') },
    cmdline: 'console=ttyS0',
    memory_size: 256 * 1024 * 1024,
    filesystem: {},
    autostart: false,
    disable_speaker: true,
  };
  const alpineRootfs = alpine ? new Uint8Array(await readFile(join(assets, ALPINE_FILE))) : undefined;
  const evidence = await runMachineProbe({ createMachine: () => new V86(options), timeoutMs, alpineRootfs });
  return { ...evidence, executionHost: 'node' };
}
