import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkerProbe } from '../tools/browser-vm/probe-worker-client.mjs';

// Fault injection at the browser Worker boundary; real Linux runs in probe.test.mjs and the browser page.
class WorkerStub extends EventTarget {
  messages = [];
  terminated = false;
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

test('returns Worker evidence and releases the Worker after completion', async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker });
  assert.deepEqual(worker.messages, [{ type: 'run-probe' }]);
  const evidence = { architecture: 'i686', executionHost: 'browser-worker' };
  worker.reply({ type: 'result', evidence });
  assert.deepEqual(await result, evidence);
  assert.equal(worker.terminated, true);
});

test('Alpine validation is an explicit per-run option, not enabled by default', async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker, alpine: true });
  const observed = worker.messages[0];
  worker.reply({ type: 'result', evidence: { executionHost: 'browser-worker' } });
  await result;
  assert.deepEqual(observed, { type: 'run-probe', alpine: true });
});

test('complete Alpine ISO selection reaches the Worker without pretending it is a chroot', async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker, image: 'alpine-iso', network: true });
  const observed = worker.messages[0];
  worker.reply({ type: 'result', evidence: { executionHost: 'browser-worker' } });
  await result;
  assert.deepEqual(observed, { type: 'run-probe', image: 'alpine-iso', network: true });
});

test('unknown image profiles and conflicting chroot options fail before Worker creation', async () => {
  const createWorker = () => { assert.fail('Worker must not start'); };
  await assert.rejects(runWorkerProbe({ createWorker, image: 'other' }), /image/);
  await assert.rejects(runWorkerProbe({ createWorker, image: 'alpine-iso', alpine: true }), /chroot/);
});

test('network verification is passed to the Worker only after an explicit request with Alpine', async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker, alpine: true, network: true });
  const observed = worker.messages[0];
  worker.reply({ type: 'result', evidence: { executionHost: 'browser-worker' } });
  await result;
  assert.deepEqual(observed, { type: 'run-probe', alpine: true, network: true });
});

test('networking without its pinned guest prerequisites is rejected before starting a Worker', async () => {
  await assert.rejects(runWorkerProbe({
    network: true, createWorker: () => { throw new Error('Worker must not start'); },
  }), /Alpine/);
});

test('abort forcibly terminates the Worker; a late success cannot replace cancellation', async () => {
  const worker = new WorkerStub();
  const controller = new AbortController();
  const result = runWorkerProbe({ createWorker: () => worker, signal: controller.signal });
  controller.abort();
  worker.reply({ type: 'result', evidence: { executionHost: 'browser-worker' } });
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(worker.terminated, true);
});

test('an already canceled run never constructs or starts an engine', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runWorkerProbe({
    createWorker: () => { assert.fail('must not construct Worker'); }, signal: controller.signal,
  }), { name: 'AbortError' });
});

test('unresponsive Worker is terminated by the host deadline', { timeout: 1000 }, async () => {
  const worker = new WorkerStub();
  await assert.rejects(runWorkerProbe({ createWorker: () => worker, timeoutMs: 10 }), /timed out/i);
  assert.equal(worker.terminated, true);
});

for (const [label, data] of [
  ['guest failure', { type: 'failure', message: 'guest did not boot' }],
  ['invalid reply', { type: 'success' }],
  ['non-worker evidence', { type: 'result', evidence: { executionHost: 'browser' } }],
]) test(`${label} does not return successful evidence`, async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker });
  worker.reply(data);
  await assert.rejects(result);
  assert.equal(worker.terminated, true);
});

test('module loading errors reject and terminate the Worker', async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker });
  worker.dispatchEvent(new Event('error'));
  await assert.rejects(result, /Worker/);
  assert.equal(worker.terminated, true);
});

test('postMessage failure also releases the Worker', async () => {
  const worker = new WorkerStub();
  worker.postMessage = () => { throw new Error('closed port'); };
  await assert.rejects(runWorkerProbe({ createWorker: () => worker }), /closed port/);
  assert.equal(worker.terminated, true);
});

test('intermediate progress reaches the page without completing or terminating the run', async () => {
  const worker = new WorkerStub();
  const observed = [];
  const result = runWorkerProbe({ createWorker: () => worker, onProgress: event => observed.push(event) });
  const event = { stage: 'packages', status: 'running', elapsedMs: 1500, instructions: 65000 };
  worker.reply({ type: 'progress', progress: event });
  const terminatedBeforeResult = worker.terminated;
  worker.reply({ type: 'result', evidence: { executionHost: 'browser-worker' } });
  await result;
  assert.equal(terminatedBeforeResult, false);
  assert.deepEqual(observed, [event]);
});

test('progress cannot extend the absolute Worker deadline', { timeout: 1000 }, async () => {
  const worker = new WorkerStub();
  const result = runWorkerProbe({ createWorker: () => worker, timeoutMs: 10 });
  worker.reply({ type: 'progress', progress: { stage: 'packages', status: 'running', elapsedMs: 1, instructions: 0 } });
  await assert.rejects(result, /timed out/);
  assert.equal(worker.terminated, true);
});
