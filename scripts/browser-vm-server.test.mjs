import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { get } from 'node:http';
import { startProbeServer } from '../tools/browser-vm/server.mjs';

async function fixture(t, { iso = false, recovery = false } = {}) {
  const assets = await mkdtemp(join(tmpdir(), 'workbench-vm-server-'));
  t.after(() => rm(assets, { recursive: true, force: true }));
  await writeFile(join(assets, 'seabios.bin'), new Uint8Array([7, 8, 9]));
  if (iso) {
    await mkdir(join(assets, 'boot'));
    await writeFile(join(assets, 'boot/vmlinuz-virt'), new Uint8Array([1, 2]));
    await writeFile(join(assets, 'alpine-virt-3.24.1-x86.iso'), new Uint8Array([3, 4]));
    await writeFile(join(assets, 'private.txt'), 'not public');
  }
  const server = await startProbeServer({ assets, recovery, ...(iso ? { isoAssets: assets } : {}) });
  t.after(async () => {
    await server.close();
  });
  return server;
}

test('recovery fixture is explicitly opt-in, bounded and origin protected', async t => {
  const ordinary = await fixture(t);
  assert.equal((await fetch(ordinary.url + '/recovery-inspect')).status, 404);
  assert.equal((await fetch(ordinary.url + '/recovery.html')).status, 404);
  const server = await fixture(t, { iso: true, recovery: true });
  const response = await fetch(server.url + '/recovery-inspect');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { mode: 'loopback-http-fixture', requests: [], holdClosed: false, activeSessions: 0 });
  for (const path of ['/recovery-inspect', '/recovery.html', '/recovery-worker.mjs']) {
    assert.equal((await fetch(server.url + path, { headers: { Origin: 'https://other.example' } })).status, 403);
  }
  assert.equal((await fetch(server.url + '/recovery-inspect', { method: 'POST', headers: { Origin: server.url } })).status, 405);
  assert.equal((await fetch(server.url + '/recovery-inspect?target=127.0.0.1')).status, 404);
  assert.equal((await fetch(server.url + '/recovery.html')).status, 200);
});

test('serves explicit local boot resources without exposing the workspace directory', async t => {
  const server = await fixture(t);
  const response = await fetch(`${server.url}/boot/seabios.bin`);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([7, 8, 9]));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const checkpointModule = await fetch(`${server.url}/probe-checkpoint.mjs`);
  assert.equal(checkpointModule.status, 200);
  assert.match(checkpointModule.headers.get('content-type'), /javascript/);
  for (const path of ['/package.json', '/.env', '/@fs/etc/passwd', '/boot/..%2F..%2Fpackage.json']) {
    assert.equal((await fetch(server.url + path)).status, 404);
  }
});

test('complete ISO resources are explicitly opt-in and expose only pinned names', async t => {
  const server = await fixture(t, { iso: true });
  for (const [path, bytes] of [
    ['/iso/boot/vmlinuz-virt', [1, 2]], ['/iso/alpine-virt-3.24.1-x86.iso', [3, 4]],
  ]) {
    const response = await fetch(server.url + path);
    assert.equal(response.status, 200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(bytes));
    assert.equal((await fetch(server.url + path, { method: 'HEAD' })).headers.get('content-length'), '2');
  }
  assert.equal((await fetch(server.url + '/alpine-iso.mjs')).status, 200);
  for (const path of ['/iso/private.txt', '/iso/../private.txt', '/iso/boot/config-6.18.35-0-virt']) {
    assert.equal((await fetch(server.url + path)).status, 404);
  }
  const withoutIso = await fixture(t);
  assert.equal((await fetch(withoutIso.url + '/iso/boot/vmlinuz-virt')).status, 404);
});

test('interactive terminal modules are served locally but test files and source directories remain private', async t => {
  const server = await fixture(t);
  for (const path of ['/terminal-session.mjs', '/terminal-client.mjs', '/terminal-worker.mjs', '/terminal-worker-endpoint.mjs']) {
    const response = await fetch(server.url + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await fetch(server.url + '/terminal.test.mjs')).status, 404);
});

test('rejects cross-origin access and mutations to the verification server', async t => {
  const server = await fixture(t);
  assert.equal((await fetch(server.url + '/boot/seabios.bin', {
    headers: { Origin: 'https://unrelated.example' },
  })).status, 403);
  assert.equal((await fetch(server.url + '/boot/seabios.bin', { method: 'POST' })).status, 405);
  // Node fetch replaces Host with the URL authority; raw HTTP exercises rebinding protection.
  const status = await new Promise((resolve, reject) => {
    get(server.url + '/boot/seabios.bin', { headers: { Host: 'attacker.example' } }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    }).on('error', reject);
  });
  assert.equal(status, 403);
});

test('relay tickets require an explicit same-origin POST and never enter a URL', async t => {
  const server = await fixture(t);
  assert.equal((await fetch(server.url + '/relay-ticket', { method: 'POST' })).status, 403);
  assert.equal((await fetch(server.url + '/relay-ticket', {
    method: 'POST', headers: { Origin: 'https://unrelated.example' },
  })).status, 403);
  assert.equal((await fetch(server.url + '/relay-ticket')).status, 405);
  const response = await fetch(server.url + '/relay-ticket', {
    method: 'POST', headers: { Origin: server.url, 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.match(body.ticket, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(body.url, server.url.replace('http:', 'ws:') + '/relay');
  assert.equal((await fetch(server.url + '/relay-ticket?ticket=not-accepted', { method: 'POST' })).status, 405);
});

test('ticket capacity exhaustion returns a bounded error instead of crashing the local server', async t => {
  const server = await fixture(t);
  for (let index = 0; index < 8; index++) {
    assert.equal((await fetch(server.url + '/relay-ticket', {
      method: 'POST', headers: { Origin: server.url },
    })).status, 200);
  }
  assert.equal((await fetch(server.url + '/relay-ticket', {
    method: 'POST', headers: { Origin: server.url },
  })).status, 429);
  assert.equal((await fetch(server.url)).status, 200);
});
