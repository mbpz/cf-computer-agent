import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { V86 } from 'v86';
import { prepareAlpineIso } from './alpine-iso.mjs';
import { createTerminalSession } from './terminal-session.mjs';

const assets = process.env.BROWSER_VM_PROBE_ASSETS;
const isoAssets = process.env.BROWSER_VM_PROBE_ISO_ASSETS;
test('interactive Alpine accepts raw UTF-8 commands, exposes real files and interrupts a running guest command', {
  skip: (!assets || !isoAssets) && 'Explicit development BIOS and ISO assets required', timeout: 90_000,
}, async () => {
  const profile = await prepareAlpineIso({ Engine: V86, readAsset: artifact => readFile(join(
    artifact.location === 'engine' ? resolve('node_modules/v86/build') : artifact.location === 'boot' ? assets : isoAssets,
    artifact.name,
  )) });
  let engine;
  const session = createTerminalSession({ createMachine: () => (engine = profile.createMachine()) });
  const decoder = new TextDecoder();
  async function until(pattern, timeoutMs = 5000) {
    let text = '';
    const start = performance.now();
    while (performance.now() - start < timeoutMs) {
      const output = session.drain();
      assert.equal(output.droppedBytes, 0);
      text += decoder.decode(output.bytes, { stream: true });
      if (pattern.test(text)) return text;
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    assert.fail(`No expected serial reply: ${JSON.stringify(text.slice(-1000))}`);
  }
  try {
    await session.ready;
    session.drain();
    session.write("printf '独立 Linux 文件' > /mnt/work/manual.txt\nuname -r\n");
    await until(/\r?\n6\.18\.35-0-virt\r?\n/);
    assert.equal(new TextDecoder().decode(await engine.read_file('manual.txt')), '独立 Linux 文件');
    // Wait for foreground process output, not the terminal's input echo: an
    // echoed command can arrive before the shell has launched the process.
    session.write('sh -c "printf \'\\nSLEEP-STARTED\\n\'; exec sleep 30"\n');
    await until(/\r?\nSLEEP-STARTED\r?\n/);
    session.write('\x03');
    await until(/localhost:~# /);
    session.write("printf '\\nAFTER-INTERRUPT\\n'\n");
    await until(/\r?\nAFTER-INTERRUPT\r?\n/);
  } finally { await session.close(); }
  assert.throws(() => session.write('echo should-not-run\n'), /closed/i);
});
