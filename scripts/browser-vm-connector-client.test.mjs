import assert from 'node:assert/strict';
import test from 'node:test';
import { connectProbe } from '../tools/browser-vm/connector-probe/client.mjs';
import { bindProbePage } from '../tools/browser-vm/connector-probe/page.mjs';

class Socket extends EventTarget {
  static instances = [];
  sent = []; closes = 0;
  constructor(url) { super(); this.url = url; Socket.instances.push(this); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.closes++; }
  emit(type, data = {}) { this.dispatchEvent(Object.assign(new Event(type), data)); }
}
const token = 'a'.repeat(43);
function start(options = {}) {
  const states = [];
  const session = connectProbe({ port: 9876, token, WebSocketImpl: Socket, onState: state => states.push(state), ...options });
  return { states, session, ws: Socket.instances.at(-1) };
}

test('requires explicit single loopback port and well-formed credential; does not scan', () => {
  const count = Socket.instances.length;
  for (const port of [0, 65536, '9876', NaN]) assert.throws(() => start({ port }));
  assert.throws(() => start({ token: 'invalid' }));
  assert.equal(Socket.instances.length, count);
});

test('credential travels only in the first frame and successful handshake stays observable until exit', () => {
  const { ws, states } = start();
  assert.equal(ws.url, 'ws://127.0.0.1:9876/probe');
  assert.deepEqual(ws.sent, []);
  ws.emit('open');
  assert.deepEqual(ws.sent, [{ type: 'probe-authenticate', token }]);
  ws.emit('message', { data: JSON.stringify({ type: 'probe-ready', version: 1, forwarding: false }) });
  assert.equal(states.at(-1), 'ready');
  ws.emit('close', { code: 1001 });
  assert.equal(states.at(-1), 'offline');
  assert.equal(JSON.stringify(states).includes(token), false);
});

test('cancel detaches listeners, prevents late auth and never starts another connection', () => {
  const { ws, session, states } = start();
  const count = Socket.instances.length;
  session.cancel(); session.cancel();
  ws.emit('open'); ws.emit('message', { data: '{}' }); ws.emit('error');
  assert.deepEqual(ws.sent, []);
  assert.deepEqual(states, ['connecting', 'cancelled']);
  assert.equal(ws.closes, 1);
  assert.equal(Socket.instances.length, count);
});

test('denied auth and unknown browser transport failure remain different bounded results', () => {
  const rejected = start(); rejected.ws.emit('close', { code: 1008 });
  assert.equal(rejected.states.at(-1), 'pairing-rejected');
  const failed = start(); failed.ws.emit('error');
  assert.equal(failed.states.at(-1), 'connection-unavailable');
  const protocol = start(); protocol.ws.emit('message', { data: JSON.stringify({ type: 'probe-ready', forwarding: true }) });
  assert.equal(protocol.states.at(-1), 'protocol-error');
  const blocked = start({ WebSocketImpl: class { constructor() { throw new Error('sensitive internal data'); } } });
  assert.equal(blocked.states.at(-1), 'connection-unavailable');
});

test('timeout closes pending connection without automatic retry', async () => {
  const { ws, states } = start({ timeoutMs: 5 });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(states.at(-1), 'timed-out');
  assert.equal(ws.closes, 1);
});

test('ready client also has a local lifetime bound if the peer never closes', async () => {
  const { ws, states } = start({ sessionMs: 5 });
  ws.emit('open');
  ws.emit('message', { data: JSON.stringify({ type: 'probe-ready', version: 1, forwarding: false }) });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(states.at(-1), 'offline');
  assert.equal(ws.closes, 1);
});

class Element extends EventTarget {
  value = ''; textContent = ''; disabled = false;
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}
function pageFixture() {
  const elements = Object.fromEntries(['port', 'credential', 'connect', 'cancel', 'status', 'context'].map(id => [id, new Element()]));
  const window = Object.assign(new EventTarget(), { location: { origin: 'http://localhost', protocol: 'http:' }, navigator: { userAgent: 'Test browser' }, isSecureContext: true });
  const runs = [];
  bindProbePage({ document: { getElementById: id => elements[id] }, window, connect: options => {
    const run = { ...options, cancelled: false }; runs.push(run); options.onState('connecting');
    return { cancel() { run.cancelled = true; options.onState('cancelled'); } };
  } });
  elements.port.value = '9876'; elements.credential.value = token;
  return { ...elements, window, runs };
}

test('page requires click, clears credential immediately, disables duplicate start and labels HTTP evidence honestly', () => {
  const page = pageFixture();
  assert.equal(page.runs.length, 0);
  assert.match(page.context.textContent, /不计准入验收/);
  page.connect.click(); page.connect.click();
  assert.equal(page.runs.length, 1);
  assert.equal(page.runs[0].token, token);
  assert.equal(page.credential.value, '');
  assert.equal(page.cancel.disabled, false);
  page.runs[0].onState('ready');
  assert.match(page.status.textContent, /握手成功/);
  assert.doesNotMatch(page.status.textContent, new RegExp(token));
});

test('cancel and leaving release page session; old callbacks cannot overwrite a new attempt', () => {
  const page = pageFixture(); page.connect.click(); page.cancel.click();
  assert.equal(page.runs[0].cancelled, true);
  page.credential.value = token; page.connect.click();
  page.runs[0].onState('offline');
  assert.match(page.status.textContent, /正在连接/);
  page.window.dispatchEvent(new Event('pagehide'));
  assert.equal(page.runs[1].cancelled, true);
  assert.equal(page.credential.value, '');
});
