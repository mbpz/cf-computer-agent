import assert from 'node:assert/strict';
import test from 'node:test';
import { ALPINE_ISO_ARTIFACTS, prepareAlpineIso, verifyImageBytes, readImageResponse } from '../tools/browser-vm/alpine-iso.mjs';

const abc = { name: 'fixture', bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };

test('image verification owns the exact bytes whose digest it checks', async () => {
  const source = new TextEncoder().encode('abc');
  const pending = verifyImageBytes(source, abc);
  source.fill(0);
  assert.equal(new TextDecoder().decode(await pending), 'abc');
});

test('image verification rejects corrupt, truncated and incorrectly typed bytes', async () => {
  await assert.rejects(verifyImageBytes(new TextEncoder().encode('abd'), abc), /digest/);
  await assert.rejects(verifyImageBytes(new Uint8Array(2), abc), /size/);
  await assert.rejects(verifyImageBytes([97, 98, 99], abc), /Uint8Array/);
});

test('the development ISO profile pins all six boot resources and cannot be edited at runtime', () => {
  assert.deepEqual(ALPINE_ISO_ARTIFACTS.map(asset => asset.role), ['wasm', 'bios', 'vga-bios', 'kernel', 'initrd', 'iso']);
  for (const artifact of ALPINE_ISO_ARTIFACTS) {
    assert.ok(Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0);
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    assert.ok(Object.isFrozen(artifact));
  }
  assert.ok(Object.isFrozen(ALPINE_ISO_ARTIFACTS));
  const iso = ALPINE_ISO_ARTIFACTS.find(asset => asset.role === 'iso');
  assert.equal(iso.bytes, 51_380_224);
  assert.equal(iso.sha256, '9895695d27eabc1e2782598ff0190f7966df8317cc2afe2a6d25360e148a4209');
});

test('missing or invalid image bytes never reach the engine constructor', async () => {
  let created = 0;
  const Engine = class { constructor() { created++; } };
  await assert.rejects(prepareAlpineIso({ Engine, readAsset: async () => new Uint8Array(0) }), /size/);
  await assert.rejects(prepareAlpineIso({ Engine, readAsset: async () => { throw new Error('unavailable'); } }), /unavailable/);
  assert.equal(created, 0);
});

test('image response loading checks both the declared and actual byte count', async () => {
  const response = (body, bytes = '3') => new Response(body, { headers: { 'content-length': bytes } });
  assert.equal(new TextDecoder().decode(await readImageResponse(response('abc'), abc)), 'abc');
  await assert.rejects(readImageResponse(response('ab'), abc), /size/);
  await assert.rejects(readImageResponse(response('abcd'), abc), /size/);
  await assert.rejects(readImageResponse(response('abc', '9000000000'), abc), /size/);
  await assert.rejects(readImageResponse(new Response(null, { status: 404 }), abc), /unavailable/);
});

test('an oversized image stream is canceled instead of consumed to completion', async () => {
  let canceled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4)); },
    cancel() { canceled = true; },
  });
  await assert.rejects(readImageResponse(new Response(stream, { headers: { 'content-length': '3' } }), abc), /size/);
  assert.equal(canceled, true);
});

test('an HTTP failure cancels its body before reporting an unavailable image', async () => {
  let canceled = false;
  const stream = new ReadableStream({ cancel() { canceled = true; } });
  await assert.rejects(readImageResponse(new Response(stream, { status: 404 }), abc), /unavailable/);
  assert.equal(canceled, true);
});
