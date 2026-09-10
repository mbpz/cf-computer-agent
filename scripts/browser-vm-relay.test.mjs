import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createServer as createTcpServer, connect } from 'node:net';
import { once } from 'node:events';
import { WebSocket } from 'ws';

const implementation = await import('../tools/browser-vm/relay/local-relay.mjs').catch(() => ({}));

// Real WS + TCP exercise protocol ordering. Only public DNS/dial are replaced so
// tests never contact the internet: the dial target is a private echo fixture.
async function fixture(t, options = {}) {
  assert.equal(typeof implementation.attachLocalProbeRelay, 'function', 'local authenticated relay is implemented');
  const echo = createTcpServer(socket => socket.pipe(socket));
  echo.listen(0, '127.0.0.1');
  await once(echo, 'listening');
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const dials = [];
  const relay = implementation.attachLocalProbeRelay(server, {
    origin: () => origin,
    resolve4: async () => ['93.184.215.14'],
    dial: target => {
      dials.push(target);
      return connect({ host: '127.0.0.1', port: echo.address().port });
    },
    ...options,
  });
  t.after(async () => {
    await relay.close();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => echo.close(resolve));
  });
  const open = async (token, authenticate = true) => {
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/relay', { origin });
    ws.on('error', () => {});
    await once(ws, 'open');
    if (authenticate) ws.send(JSON.stringify({ type: 'authenticate', ticket: token }));
    return ws;
  };
  return { ...relay, origin, dials, open };
}

function packet(type, id, body = Buffer.alloc(0)) {
  const result = Buffer.alloc(5 + body.length);
  result[0] = type;
  result.writeUInt32LE(id, 1);
  body.copy(result, 5);
  return result;
}

function request(id = 1, address = '203.0.113.10', port = 443, protocol = 1) {
  const body = Buffer.alloc(3 + Buffer.byteLength(address));
  body[0] = protocol;
  body.writeUInt16LE(port, 1);
  body.write(address, 3);
  return packet(1, id, body);
}

const next = ws => once(ws, 'message').then(([data]) => data);

async function authorized(f) {
  const ws = await f.open(f.issueTicket());
  const first = await next(ws);
  assert.equal(first[0], 3, 'first authenticated frame initializes native WISP flow control');
  assert.equal(first.readUInt32LE(1), 0);
  assert.ok(first.readUInt32LE(5) > 0);
  return ws;
}

test('no TCP or DNS work occurs before the first-frame credential is accepted', { timeout: 5000 }, async t => {
  let lookups = 0;
  const f = await fixture(t, { resolve4: async () => { lookups++; return ['93.184.215.14']; } });
  const ws = await f.open(undefined, false);
  const closed = once(ws, 'close');
  ws.send(request());
  assert.equal((await closed)[0], 1008);
  assert.equal(lookups, 0);
  assert.equal(f.dials.length, 0);
});

test('one-time tickets cannot be replayed even after the original session closes', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const token = f.issueTicket();
  const first = await f.open(token);
  await next(first);
  const closed = once(first, 'close');
  first.close();
  await closed;
  const replay = await f.open(token);
  assert.equal((await once(replay, 'close'))[0], 1008);
  assert.equal(f.dials.length, 0);
});

test('expired and unknown tickets cannot open a relay session', { timeout: 5000 }, async t => {
  let now = 1000;
  const f = await fixture(t, { now: () => now });
  const token = f.issueTicket();
  now += 60_001;
  for (const value of [token, 'unknown-ticket']) {
    const ws = await f.open(value);
    assert.equal((await once(ws, 'close'))[0], 1008);
  }
  assert.equal(f.dials.length, 0);
});

test('rejects cross-origin upgrades and URL credentials before authentication', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  for (const [path, origin] of [['/relay', 'https://unrelated.example'], ['/relay?ticket=secret', f.origin]]) {
    const ws = new WebSocket(f.origin.replace('http:', 'ws:') + path, { origin });
    ws.on('error', () => {});
    const status = await new Promise(resolve => ws.once('unexpected-response', (_, response) => {
      response.resume();
      resolve(response.statusCode);
      ws.terminate();
    }));
    assert.equal(status, 403);
  }
  assert.equal(f.dials.length, 0);
});

test('authenticated native WISP CONNECT/DATA reaches only the vetted numeric DNS address', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const ws = await authorized(f);
  const reply = next(ws);
  ws.send(request());
  // The native adapter sends data before DNS/connect completes; preserve its order.
  ws.send(packet(2, 1, Buffer.from('real-tcp-echo')));
  const data = await reply;
  assert.equal(data[0], 2);
  assert.equal(data.readUInt32LE(1), 1);
  assert.equal(data.subarray(5).toString(), 'real-tcp-echo');
  assert.deepEqual(f.dials, [{ host: '93.184.215.14', port: 443 }]);
});

test('relay diagnostics count real traffic without exposing capabilities or payloads', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  assert.equal(typeof f.inspect, 'function', 'bounded read-only relay diagnostics are available');
  const token = f.issueTicket();
  assert.deepEqual(f.inspect(), []);
  const ws = await f.open(token);
  await next(ws);
  const reply = next(ws);
  ws.send(request());
  ws.send(packet(2, 1, Buffer.from('private-test-payload')));
  await reply;
  const snapshot = f.inspect();
  assert.equal(snapshot.length, 1);
  assert.equal(snapshot[0].streams.length, 1);
  assert.equal(snapshot[0].streams[0].readBytes, 20);
  assert.equal(snapshot[0].streams[0].writtenBytes, 20);
  assert.equal(snapshot[0].streams[0].ready, true);
  assert.equal(snapshot[0].streams[0].pendingWrites, 0);
  const encoded = JSON.stringify(snapshot);
  assert.equal(encoded.includes(token), false);
  assert.equal(encoded.includes('private-test-payload'), false);
  snapshot[0].streams[0].readBytes = -1;
  assert.equal(f.inspect()[0].streams[0].readBytes, 20, 'inspection cannot mutate live counters');
  const closed = once(ws, 'close');
  ws.close();
  await closed;
  // Client close can precede the server's close event by one I/O turn.
  for (let turn = 0; turn < 20 && f.inspect().length; turn++) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(f.inspect(), [], 'closed sessions retain no diagnostic state');
});

test('domain, port, UDP and private DNS denials cannot create TCP sockets', { timeout: 5000 }, async t => {
  const f = await fixture(t, { resolve4: async () => ['127.0.0.1'] });
  const ws = await authorized(f);
  for (const [id, address, port, protocol] of [
    [1, '127.0.0.1', 443, 1], [2, '203.0.113.10', 22, 1],
    [3, '203.0.113.10', 443, 2], [4, '203.0.113.10', 443, 1],
  ]) {
    const denied = next(ws);
    ws.send(request(id, address, port, protocol));
    const frame = await denied;
    assert.equal(frame[0], 4);
    assert.equal(frame.readUInt32LE(1), id);
  }
  assert.equal(f.dials.length, 0);
});

test('closing a session while DNS is pending prevents a late socket from being created', { timeout: 5000 }, async t => {
  let finishDns;
  let started;
  const resolving = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { resolve4: () => {
    started();
    return new Promise(resolve => { finishDns = resolve; });
  } });
  const ws = await authorized(f);
  ws.send(request());
  await resolving;
  const closed = once(ws, 'close');
  ws.close();
  await closed;
  finishDns(['93.184.215.14']);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dials.length, 0);
});

test('stream limit counts unresolved connections, not only live TCP sockets', { timeout: 5000 }, async t => {
  const pending = [];
  const f = await fixture(t, { resolve4: () => new Promise(resolve => pending.push(resolve)) });
  const ws = await authorized(f);
  const denied = next(ws);
  for (let id = 1; id <= 9; id++) ws.send(request(id));
  const frame = await denied;
  assert.equal(frame[0], 4);
  assert.equal(frame.readUInt32LE(1), 9);
  const closed = once(ws, 'close');
  ws.close();
  await closed;
  for (const resolve of pending) resolve(['93.184.215.14']);
  assert.equal(f.dials.length, 0);
});

test('malformed WISP frames close the session without unbounded parsing or sockets', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  const ws = await authorized(f);
  const closed = once(ws, 'close');
  ws.send(Buffer.from([1, 2]));
  assert.equal((await closed)[0], 1008);
  assert.equal(f.dials.length, 0);
});

test('a second authenticated session cannot reset the one-session limit', { timeout: 5000 }, async t => {
  const f = await fixture(t);
  await authorized(f);
  const second = await f.open(f.issueTicket());
  assert.equal((await once(second, 'close'))[0], 1008);
  assert.equal(f.dials.length, 0);
});

test('sending beyond the advertised flow-control window cannot grow a pending DNS buffer', { timeout: 5000 }, async t => {
  let finishDns;
  const f = await fixture(t, { resolve4: () => new Promise(resolve => { finishDns = resolve; }) });
  const ws = await authorized(f);
  const closed = once(ws, 'close');
  ws.send(request());
  for (let index = 0; index < 17; index++) ws.send(packet(2, 1, Buffer.from('x')));
  assert.equal((await closed)[0], 1008);
  finishDns(['93.184.215.14']);
  assert.equal(f.dials.length, 0);
});
