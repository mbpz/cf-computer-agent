import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectorConsumeClient } from '../tools/browser-vm/connector/consume-client.ts';

const origin = 'https://workbench.example.test';
const input = { ticketId: 'ticket', ticket: 'a.b.c', consumerId: 'consumer' };
const ack = { lease: { leaseId: 'lease', revision: 1, expiresAtMs: 160_000, renewAfterMs: 130_000 } };
const response = () => new Response(JSON.stringify(ack), { status: 201, headers: { 'content-type': 'application/json' } });

test('fixed HTTPS issuer path, no ambient credentials, no redirects or caller-selected URL', async () => {
  const requests = [];
  const consume = createConnectorConsumeClient({ issuerOrigin: origin, fetch: async request => {
    requests.push(request); return response();
  } });
  assert.deepEqual(await consume(input, new AbortController().signal), ack);
  const req = requests[0];
  assert.equal(req.url, origin + '/api/connector/consume'); assert.equal(req.method, 'POST');
  assert.equal(req.credentials, 'omit'); assert.equal(req.redirect, 'manual'); assert.equal(req.cache, 'no-store');
  assert.equal(req.headers.get('cookie'), null); assert.equal(req.headers.get('origin'), null); assert.equal(req.headers.get('authorization'), null);
  assert.deepEqual(await req.json(), input);
  await assert.rejects(consume({ ...input, url: 'https://attacker.example.test' }, new AbortController().signal));
  assert.equal(requests.length, 1);
});

test('invalid configuration and oversized ticket rejected without any request', async () => {
  for (const issuerOrigin of ['http://localhost', origin + '/', origin + '/other', 'https://user:pass@example.test', 'null']) {
    assert.throws(() => createConnectorConsumeClient({ issuerOrigin }));
  }
  const consume = createConnectorConsumeClient({ issuerOrigin: origin, fetch: () => { throw Error('must not fetch'); } });
  await assert.rejects(consume({ ...input, ticket: 'x'.repeat(8193) }, new AbortController().signal), /Invalid consumption/);
});

test('HTTP failure, wrong content type, malformed/oversized response rejected once, never retried', async () => {
  for (const makeResponse of [
    () => new Response('', { status: 409 }),
    () => new Response('', { status: 302, headers: { location: 'https://other.example.test' } }),
    () => new Response('{}', { status: 201 }),
    () => new Response('{', { status: 201, headers: { 'content-type': 'application/json' } }),
    () => new Response(' '.repeat(4097), { status: 201, headers: { 'content-type': 'application/json' } }),
  ]) {
    let requests = 0;
    const consume = createConnectorConsumeClient({ issuerOrigin: origin, fetch: async () => { requests++; return makeResponse(); } });
    await assert.rejects(consume(input, new AbortController().signal)); assert.equal(requests, 1);
  }
});

test('abort before request and during streaming fail closed and cancel the response body', async () => {
  let requests = 0, canceled = 0;
  const abort = new AbortController(); abort.abort();
  const consume = createConnectorConsumeClient({ issuerOrigin: origin, fetch: async () => {
    requests++; return new Response(new ReadableStream({ cancel() { canceled++; } }), { status: 201, headers: { 'content-type': 'application/json' } });
  } });
  await assert.rejects(consume(input, abort.signal)); assert.equal(requests, 0);
  const running = new AbortController();
  const pending = consume(input, running.signal);
  await new Promise(r => setImmediate(r)); running.abort();
  await assert.rejects(pending); assert.equal(requests, 1); assert.equal(canceled, 1);
});

test('empty chunk flood cannot evade response work bounds', async () => {
  let chunks = 0, canceled = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (chunks++ < 5000) controller.enqueue(new Uint8Array());
      else { controller.enqueue(new TextEncoder().encode(JSON.stringify(ack))); controller.close(); }
    },
    cancel() { canceled++; },
  });
  const consume = createConnectorConsumeClient({ issuerOrigin: origin, fetch: async () => new Response(body, { status: 201, headers: { 'content-type': 'application/json' } }) });
  await assert.rejects(consume(input, new AbortController().signal));
  assert.ok(chunks < 5000); assert.equal(canceled, 1);
});
