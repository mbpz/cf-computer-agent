import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const source = await readFile(new URL('../tools/browser-vm/connector/control.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function ui(onPost = async () => ({ pairingCode: 'one-use-code', expiresAtMs: 130_000 })) {
  const elements = Object.fromEntries(['pair', 'stop', 'code', 'status', 'origin', 'identity', 'policy'].map(id => [id, {
    textContent: '', disabled: id === 'pair', events: {}, addEventListener(name, fn) { this.events[name] = fn; },
  }]));
  const events = {}, timers = new Map(), requests = []; let nextTimer = 0;
  runInNewContext(source, { document: { getElementById: id => elements[id] }, Date: { now: () => 100_000 },
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); },
    addEventListener: (name, fn) => { events[name] = fn; },
    fetch: async (path, init) => {
      requests.push({ path, init });
      if (path === '/identity') return { ok: true, json: async () => ({ allowedOrigin: 'https://approved.test', connectorId: 'public-id', policyVersion: 'p1' }) };
      return { ok: true, json: () => onPost(path) };
    },
  });
  await tick();
  return { elements, events, timers, requests, click: id => elements[id].events.click() };
}
test('control page loads public identity only and pairing requires an explicit click', async () => {
  const f = await ui();
  assert.deepEqual(f.requests.map(r => r.path), ['/identity']);
  assert.equal(f.elements.origin.textContent, 'https://approved.test');
  assert.equal(f.elements.identity.textContent, 'public-id');
  assert.equal(f.elements.pair.disabled, false);
  await f.click('pair');
  assert.equal(f.elements.code.textContent, 'one-use-code');
  assert.equal(f.requests[1].init.credentials, 'omit');
  assert.equal(f.requests[1].init.method, 'POST');
  assert.equal(f.requests[1].path, '/pair');
  const timer = [...f.timers.values()][0]; assert.equal(timer.ms, 30_000);
  timer.fn(); assert.equal(f.elements.code.textContent, '');
});
test('pagehide invalidates a late pairing response and pageshow permits a fresh explicit request', async () => {
  let complete;
  const f = await ui(() => new Promise(resolve => { complete = resolve; }));
  const pending = f.click('pair'); await tick();
  f.events.pagehide();
  complete({ pairingCode: 'must-not-appear', expiresAtMs: 130_000 }); await pending;
  assert.equal(f.elements.code.textContent, ''); assert.equal(f.timers.size, 0);
  assert.equal(typeof f.events.pageshow, 'function'); f.events.pageshow();
  assert.equal(f.elements.pair.disabled, false);
  assert.deepEqual(f.requests.map(r => r.path), ['/identity', '/pair']);
});
test('local stop clears displayed secrets and cannot be undone by a pending pair response', async () => {
  let complete;
  const f = await ui(path => path === '/pair' ? new Promise(resolve => { complete = resolve; }) : Promise.resolve({ stopped: true }));
  const pending = f.click('pair'); await tick();
  await f.click('stop');
  complete({ pairingCode: 'late-secret', expiresAtMs: 130_000 }); await pending;
  assert.equal(f.elements.code.textContent, ''); assert.equal(f.elements.pair.disabled, true);
  assert.equal(f.elements.stop.disabled, true); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.requests.map(r => r.path), ['/identity', '/pair', '/stop']);
});
test('pairing failure remains unknown, does not echo error details, and never retries automatically', async () => {
  const f = await ui(async () => { throw new Error('secret-material-must-not-echo'); });
  await f.click('pair'); await tick();
  assert.equal(f.elements.code.textContent, ''); assert.equal(f.elements.pair.disabled, false);
  assert.match(f.elements.status.textContent, /未自动重试/);
  assert.ok(!f.elements.status.textContent.includes('secret-material'));
  assert.deepEqual(f.requests.map(r => r.path), ['/identity', '/pair']);
});
