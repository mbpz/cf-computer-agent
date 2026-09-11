import assert from 'node:assert/strict';
import test from 'node:test';
import { downloadDirect } from '../tools/browser-vm/direct-download.mjs';

test('unknown targets and invalid deadlines are rejected before any outgoing request', async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error('unexpected'); };
  for (const targetId of ['https://other.example/file', '../relay-ticket', '__proto__', null]) {
    await assert.rejects(downloadDirect({ targetId, fetchImpl }), /Invalid download target/);
  }
  for (const timeoutMs of [0, -1, 30_001, Infinity]) {
    await assert.rejects(downloadDirect({ targetId: 'alpine-main', timeoutMs, fetchImpl }), /deadline/);
  }
  assert.equal(calls, 0);
});

test('reads a complete public body and hashes its actual bytes with no credentials, redirect or relay fallback', async () => {
  const calls = [];
  const progress = [];
  const result = await downloadDirect({ targetId: 'alpine-main', onProgress: value => progress.push(value), fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response('abc', { headers: { 'Content-Length': '3' } });
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86/APKINDEX.tar.gz');
  assert.equal(calls[0].options.mode, 'cors');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(result.bytes, 3);
  assert.equal(result.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(result.integrity, 'hash-recorded-only');
  assert.equal(result.transport, 'browser-fetch-direct');
  assert.equal(result.downloadCompleted, true);
  assert.equal(result.vmNetworkVerified, false);
  assert.ok(progress.some(value => value.receivedBytes === 3));
});

test('non-success HTTP and opaque responses cannot be reported as readable downloads', async () => {
  for (const [response, code] of [[new Response('not found', { status: 404 }), 'http-error'], [{ type: 'opaque', status: 0, body: null }, 'unreadable-response']]) {
    await assert.rejects(downloadDirect({ targetId: 'alpine-main', fetchImpl: async () => response }), error => error.code === code);
  }
});

test('declared oversize bodies are canceled before being consumed', async () => {
  let canceled = false;
  const response = new Response(new ReadableStream({ cancel() { canceled = true; } }), { headers: { 'Content-Length': '9000000' } });
  await assert.rejects(downloadDirect({ targetId: 'alpine-main', fetchImpl: async () => response }), error => error.code === 'size-limit');
  assert.equal(canceled, true);
});

test('actual streaming limit stops unadvertised oversized data and cancels its producer', async () => {
  let canceled = false;
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); }, cancel() { canceled = true; } }));
  await assert.rejects(downloadDirect({ targetId: 'alpine-main', fetchImpl: async () => response }), error => error.code === 'size-limit');
  assert.equal(canceled, true);
});

test('truncated declared content and empty content are not complete downloads', async () => {
  for (const response of [new Response('abc', { headers: { 'Content-Length': '4' } }), new Response('')]) {
    await assert.rejects(downloadDirect({ targetId: 'alpine-main', fetchImpl: async () => response }), error => error.code === 'incomplete-body');
  }
});

test('an HTTP 200 API response must identify the intended public repository', async () => {
  for (const body of ['not-json', '{"full_name":"another/repository"}']) {
    await assert.rejects(downloadDirect({ targetId: 'github-api', fetchImpl: async () => new Response(body) }), error => error.code === 'content-mismatch');
  }
  const result = await downloadDirect({ targetId: 'github-api', fetchImpl: async () => new Response('{"full_name":"octocat/Hello-World"}') });
  assert.equal(result.apiRepository, 'octocat/Hello-World');
});

test('same-size tampering of the pinned rootfs fails its trusted digest check', async () => {
  await assert.rejects(downloadDirect({ targetId: 'alpine-rootfs', fetchImpl: async () => new Response(new Uint8Array(3_538_048)) }), error => error.code === 'integrity-mismatch');
});

test('an opaque fetch failure is reported as network-or-CORS, never diagnosed as CORS alone or retried', async () => {
  let calls = 0;
  await assert.rejects(downloadDirect({ targetId: 'github-git', fetchImpl: async () => { calls++; throw new TypeError('private raw details'); } }), error => {
    assert.equal(error.code, 'network-or-cors');
    assert.doesNotMatch(JSON.stringify(error.diagnostic), /private raw details/);
    return true;
  });
  assert.equal(calls, 1);
});

test('deadline aborts an unresponsive request without needing the provider to settle', async () => {
  let signal;
  await assert.rejects(downloadDirect({ targetId: 'alpine-main', timeoutMs: 5, fetchImpl: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } }), error => error.code === 'timeout');
  assert.equal(signal.aborted, true);
});

test('deadline cancels a stalled response body as well as the network request', async () => {
  let canceled = false;
  await assert.rejects(downloadDirect({ targetId: 'alpine-main', timeoutMs: 5, fetchImpl: async () => new Response(new ReadableStream({ cancel() { canceled = true; } })) }), error => error.code === 'timeout');
  assert.equal(canceled, true);
});

test('explicit cancellation prevents pre-aborted requests and stops an active body without replay', async () => {
  const canceled = new AbortController(); canceled.abort();
  let calls = 0;
  await assert.rejects(downloadDirect({ targetId: 'alpine-main', signal: canceled.signal, fetchImpl: async () => { calls++; } }), error => error.code === 'canceled');
  assert.equal(calls, 0);
  const active = new AbortController();
  let stopped = false;
  await assert.rejects(downloadDirect({ targetId: 'alpine-main', signal: active.signal, onProgress: value => { if (value.receivedBytes > 0) active.abort(); }, fetchImpl: async () => {
    calls++;
    return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); }, cancel() { stopped = true; } }));
  } }), error => error.code === 'canceled');
  assert.equal(calls, 1);
  assert.equal(stopped, true);
});
