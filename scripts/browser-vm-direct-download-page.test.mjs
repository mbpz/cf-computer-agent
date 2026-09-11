import assert from 'node:assert/strict';
import test from 'node:test';
import { bindDownloadPage } from '../tools/browser-vm/direct-download-page.mjs';

class Element extends EventTarget {
  disabled = false;
  textContent = '';
  dataset = {};
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
function fixture(runDownload) {
  const targets = ['alpine-main', 'github-api'].map(id => Object.assign(new Element(), { dataset: { target: id } }));
  const elements = Object.fromEntries(['cancel', 'status', 'result'].map(id => [id, new Element()]));
  const window = new EventTarget();
  bindDownloadPage({ document: { querySelectorAll: () => targets, getElementById: id => elements[id] }, window, runDownload });
  return { targets, ...elements, window };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('download is user initiated, single flight, and completed evidence stays distinct from VM connectivity', async () => {
  let calls = 0; let finish;
  const page = fixture(async () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  assert.equal(calls, 0);
  page.targets[0].click(); page.targets[1].click();
  assert.equal(calls, 1);
  assert.equal(page.cancel.disabled, false);
  finish({ bytes: 3, vmNetworkVerified: false }); await flush();
  assert.equal(page.targets[0].disabled, false);
  assert.equal(page.cancel.disabled, true);
  assert.match(page.status.textContent, /不代表 VM/);
  assert.match(page.result.textContent, /"bytes": 3/);
});

test('cancel enables retry immediately and late completion cannot overwrite the next run', async () => {
  const runs = [];
  const page = fixture(options => new Promise(resolve => runs.push({ options, resolve })));
  page.targets[0].click(); page.cancel.click();
  assert.equal(runs[0].options.signal.aborted, true);
  assert.match(page.status.textContent, /取消/);
  page.targets[1].click();
  runs[0].options.onProgress({ receivedBytes: 999 });
  runs[0].resolve({ stale: true }); await flush();
  assert.doesNotMatch(page.result.textContent, /stale|999/);
  runs[1].resolve({ fresh: true }); await flush();
  assert.match(page.result.textContent, /fresh/);
});

test('failure shows only bounded diagnostics and leaving the page aborts active requests', async () => {
  const page = fixture(async () => { throw Object.assign(new Error('private'), { diagnostic: { code: 'network-or-cors' } }); });
  page.targets[0].click(); await flush();
  assert.match(page.result.textContent, /network-or-cors/);
  assert.doesNotMatch(page.result.textContent, /private/);
  let signal;
  const active = fixture(options => { signal = options.signal; return new Promise(() => {}); });
  active.targets[0].click(); active.window.dispatchEvent(new Event('pagehide'));
  assert.equal(signal.aborted, true);
});
