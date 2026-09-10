import assert from 'node:assert/strict';
import test from 'node:test';
import * as checkpoints from '../tools/browser-vm/probe-checkpoint.mjs';

const identity = { engineVersion: 'test-engine-1', imageVersion: 'test-image-1', memoryBytes: 268435456, filesystem: 'ram-9p' };
const payload = () => new TextEncoder().encode('abc').buffer;

test('checkpoint stores the digest of the actual bytes, not a caller assertion', async () => {
  assert.equal(typeof checkpoints.sealCheckpoint, 'function');
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  assert.equal(record.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(record.bytes, 3);
  assert.equal(record.schemaVersion, 1);
});

test('restoration delivers verified bytes and propagates engine failure', async () => {
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  const restored = [];
  await checkpoints.restoreCheckpoint({ restore_state: async bytes => restored.push(new TextDecoder().decode(bytes)) }, record, identity);
  assert.deepEqual(restored, ['abc']);
  await assert.rejects(checkpoints.restoreCheckpoint({ restore_state: async () => { throw new Error('engine rejected state'); } }, record, identity), /engine rejected state/);
});

test('corruption is rejected before invoking the engine', async () => {
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  new Uint8Array(record.state)[1] ^= 1;
  let calls = 0;
  await assert.rejects(checkpoints.restoreCheckpoint({ restore_state: () => { calls++; } }, record, identity), /digest/i);
  assert.equal(calls, 0);
});

test('each incompatible engine, image, memory or filesystem is refused', async () => {
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  let calls = 0;
  for (const mismatch of [{ engineVersion: 'v2' }, { imageVersion: 'other' }, { memoryBytes: 134217728 }, { filesystem: 'disk' }]) {
    await assert.rejects(checkpoints.restoreCheckpoint({ restore_state: () => { calls++; } }, record, { ...identity, ...mismatch }), /compatib/i);
  }
  assert.equal(calls, 0);
});

test('malformed, empty, truncated and unknown-schema records never reach restoration', async () => {
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  let calls = 0;
  for (const invalid of [null, {}, { ...record, schemaVersion: 2 }, { ...record, bytes: 4 }, { ...record, state: new ArrayBuffer(0) }, { ...record, sha256: 'x' }, { ...record, identity: {} }]) {
    await assert.rejects(checkpoints.restoreCheckpoint({ restore_state: () => { calls++; } }, invalid, identity));
  }
  assert.equal(calls, 0);
  await assert.rejects(checkpoints.sealCheckpoint(new ArrayBuffer(0), identity));
  await assert.rejects(checkpoints.sealCheckpoint(payload(), { ...identity, engineVersion: '' }));
});

test('oversize records are refused without allocating or restoring their declared size', async () => {
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  await assert.rejects(checkpoints.restoreCheckpoint({ restore_state: () => assert.fail('must not restore') }, { ...record, bytes: 536870913 }, identity), /size/i);
});

test('checkpoint creation takes ownership of state and identity before hashing', async () => {
  const input = payload();
  const version = { ...identity };
  const pending = checkpoints.sealCheckpoint(input, version);
  new Uint8Array(input).fill(0);
  version.imageVersion = 'changed';
  const record = await pending;
  assert.equal(new TextDecoder().decode(record.state), 'abc');
  assert.equal(record.identity.imageVersion, 'test-image-1');
});

test('mutation while verification is awaiting its digest cannot change restored bytes', async () => {
  const record = await checkpoints.sealCheckpoint(payload(), identity);
  let actual;
  const pending = checkpoints.restoreCheckpoint({ restore_state: async state => { actual = new TextDecoder().decode(state); } }, record, identity);
  new Uint8Array(record.state).fill(0);
  record.identity.imageVersion = 'changed';
  await pending;
  assert.equal(actual, 'abc');
});
