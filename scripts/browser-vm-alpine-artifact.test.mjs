import assert from 'node:assert/strict';
import test from 'node:test';
import { ALPINE_BYTES, verifyAlpineArchive } from '../tools/browser-vm/alpine-artifact.mjs';
import { runMachineProbe } from '../tools/browser-vm/probe-core.mjs';

test('incorrect archive size is rejected before Linux starts', async () => {
  await assert.rejects(runMachineProbe({
    createMachine: () => { assert.fail('invalid image must not start'); },
    alpineRootfs: new Uint8Array(4),
  }), /size/);
});

test('same-sized substituted archive is rejected by its digest', async () => {
  await assert.rejects(verifyAlpineArchive(new Uint8Array(ALPINE_BYTES)), /digest/);
});

test('arbitrary objects and string inputs cannot be extracted', async () => {
  for (const invalid of [null, {}, 'archive', new ArrayBuffer(ALPINE_BYTES)]) {
    await assert.rejects(verifyAlpineArchive(invalid), /size/);
  }
});
