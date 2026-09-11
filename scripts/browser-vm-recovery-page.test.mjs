import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../tools/browser-vm/recovery-browser.mjs', import.meta.url), 'utf8');
function page({ constructorFails = false } = {}) {
  const elements = Object.fromEntries(['start', 'grant', 'cancel', 'status', 'evidence'].map(id => [id, Object.assign(new EventTarget(), { disabled: id === 'grant' || id === 'cancel', textContent: '' })]));
  const workers = [];
  const timers = new Map();
  let timerId = 0;
  const window = new EventTarget();
  class Worker extends EventTarget {
    messages = [];
    terminated = false;
    constructor() { super(); if (constructorFails) throw new Error('unavailable'); workers.push(this); }
    postMessage(data) { this.messages.push(data); }
    terminate() { this.terminated = true; }
    reply(data) { this.dispatchEvent(new MessageEvent('message', { data })); }
  }
  runInNewContext(source, {
    document: { querySelector: selector => elements[selector.slice(1)] }, window, Worker,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  return { elements, workers, timers, window, click: id => elements[id].dispatchEvent(new Event('click')) };
}

test('fresh grant requires the offline boundary and one explicit click, never replaying on duplicate click', () => {
  const p = page();
  p.click('start'); p.click('start'); p.click('grant');
  assert.equal(p.workers.length, 1);
  const w = p.workers[0];
  assert.equal(w.messages.length, 1);
  w.reply({ type: 'offline-ready', evidence: { activeSessions: 0 } });
  assert.equal(p.elements.grant.disabled, false);
  assert.equal(w.messages.length, 1);
  p.click('grant'); p.click('grant');
  assert.deepEqual(w.messages.map(m => m.type), ['run', 'fresh-grant']);
});

test('cancel terminates the worker and stale replies cannot enable grants in a new run', () => {
  const p = page(); p.click('start');
  const old = p.workers[0]; p.click('cancel');
  assert.equal(old.terminated, true);
  assert.equal(p.timers.size, 0);
  p.click('start'); old.reply({ type: 'offline-ready', evidence: {} });
  assert.equal(p.elements.grant.disabled, true);
  assert.equal(p.workers.length, 2);
  p.window.dispatchEvent(new Event('pagehide'));
  assert.equal(p.workers[1].terminated, true);
});

test('deadline and worker error both restore controls without retry', () => {
  for (const failure of ['timeout', 'error', 'messageerror']) {
    const p = page(); p.click('start');
    if (failure === 'timeout') [...p.timers.values()][0]();
    else p.workers[0].dispatchEvent(new Event(failure));
    assert.equal(p.elements.start.disabled, false);
    assert.equal(p.elements.grant.disabled, true);
    assert.equal(p.workers[0].terminated, true);
    assert.equal(p.workers[0].messages.length, 1);
  }
});

test('successful result closes the worker and preserves visible evidence', () => {
  const p = page(); p.click('start');
  p.workers[0].reply({ type: 'result', evidence: { completed: true } });
  assert.equal(p.workers[0].terminated, true);
  assert.equal(JSON.parse(p.elements.evidence.textContent).completed, true);
  assert.match(p.elements.status.textContent, /不代表公网验收/);
});

test('worker construction failure leaves the page retryable', () => {
  const p = page({ constructorFails: true }); p.click('start');
  assert.equal(p.elements.start.disabled, false);
  assert.equal(p.elements.cancel.disabled, true);
  assert.match(p.elements.status.textContent, /失败/);
});

test('command failure preserves bounded diagnostics while closing the worker', () => {
  const p = page(); p.click('start');
  p.workers[0].reply({ type: 'failure', message: 'command timeout', diagnostic: { beginSeen: false, receivedBytes: 0 } });
  assert.deepEqual(JSON.parse(p.elements.evidence.textContent), { beginSeen: false, receivedBytes: 0 });
  assert.equal(p.workers[0].terminated, true);
  assert.equal(p.elements.start.disabled, false);
});
