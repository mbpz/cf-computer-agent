import assert from 'node:assert/strict';
import test from 'node:test';
import { Resolver } from 'node:dns/promises';
import { createSocket } from 'node:dgram';
import { createDestinationResolver, isPublicDestinationAddress } from '../tools/browser-vm/connector/destination-policy.mjs';

const target = { hostname: 'github.com', port: 443 };
const noData = () => Promise.reject(Object.assign(new Error('no data'), { code: 'ENODATA' }));
function fixture(a = ['140.82.112.3'], aaaa = ['2606:50c0:8000::153']) {
  const requests = [], instances = [];
  const createResolver = options => {
    const instance = {
      options, canceled: 0,
      resolve4(host) { requests.push(['A', host]); return typeof a === 'function' ? a() : Promise.resolve(a); },
      resolve6(host) { requests.push(['AAAA', host]); return typeof aaaa === 'function' ? aaaa() : Promise.resolve(aaaa); },
      cancel() { this.canceled++; },
    };
    instances.push(instance);
    return instance;
  };
  return { createResolver, requests, instances };
}
function clockFixture() {
  const timers = new Map(); let id = 0;
  return {
    setTimer(fn, delay) { timers.set(++id, { fn, delay }); return id; },
    clearTimer(id) { timers.delete(id); },
    expire() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } },
    timers,
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

// Removing exact-name/shape checks would permit DNS for a browser-selected destination.
test('only exact approved names and ports reach DNS; results are normalized frozen pins', async () => {
  const f = fixture(), resolve = createDestinationResolver(f);
  for (const hostname of ['dl-cdn.alpinelinux.org', 'github.com', 'api.github.com', 'GITHUB.COM']) {
    for (const port of [80, 443]) {
      const result = await resolve({ hostname, port });
      assert.deepEqual(result, { hostname: hostname.toLowerCase(), address: '140.82.112.3', family: 4, port });
      assert.equal(Object.isFrozen(result), true);
    }
  }
  assert.equal(f.instances.length, 8);
  assert.ok(f.instances.every(instance => instance.options.timeout === 5000 && instance.options.tries === 1));
  assert.equal(f.requests.length, 16);
  assert.ok(f.requests.every(([, host]) => ['github.com', 'api.github.com', 'dl-cdn.alpinelinux.org'].includes(host)));
  assert.ok(f.instances.every(instance => instance.canceled === 1));
});

test('unapproved, malformed and ambiguous targets cannot start a resolver', async () => {
  const f = fixture(), resolve = createDestinationResolver(f);
  for (const hostname of ['example.com', 'github.com.evil.test', ' github.com', 'github.com.', 'github.com\n',
    'https://github.com', 'user@github.com', 'github%2ecom', 'gıthub.com', '127.0.0.1', '2130706433',
    '0x7f000001', '[::1]', '::ffff:127.0.0.1', '', null, {}, 1]) {
    await assert.rejects(resolve({ hostname, port: 443 }), /destination/);
  }
  for (const port of [0, 22, 53, 8080, 65536, '443', NaN, null, 443.5]) {
    await assert.rejects(resolve({ hostname: 'github.com', port }), /destination/);
  }
  for (const value of [null, [], {}, { ...target, address: '127.0.0.1' }, { ...target, proxy: true },
    { ...target, [Symbol('hidden')]: true }, Object.assign(Object.create(target), {})]) {
    await assert.rejects(resolve(value), /destination/);
  }
  assert.equal(f.instances.length, 0);
});

const forbidden = [
  '0.0.0.0', '0.255.255.255', '10.0.0.1', '10.255.255.255', '100.64.0.0', '100.127.255.255',
  '127.0.0.1', '169.254.169.254', '172.16.0.0', '172.31.255.255',
  '192.0.0.9', '192.0.0.255', '192.0.2.1', '192.31.196.1', '192.52.193.1', '192.88.99.2',
  '192.168.1.1', '192.175.48.1', '198.18.0.0', '198.19.255.255', '198.51.100.1', '203.0.113.1',
  '224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.255',
  '::', '::1', '::ffff:8.8.8.8', '::ffff:0808:0808', '64:ff9b::808:808', '64:ff9b:1::1',
  '100::1', '100:0:0:1::1', '2001::1', '2001:1::3', '2001:1ff:ffff::1', '2001:db8::1',
  '2002:808:808::1', '2620:4f:8000::1', '3fff::1', '3fff:fff:ffff::1', '5f00::1',
  'fc00::1', 'fdff::1', 'fe80::1', 'ff02::1', '2606:4700::1111%en0', '2606:4700::8.8.8.8',
  '4000::1', '1.2.3.999', '01.2.3.4', '127.1', '0x7f000001', '', null, {},
];
test('special-use, mapped, multicast and malformed address answers fail closed', async () => {
  for (const address of forbidden) {
    assert.equal(isPublicDestinationAddress(address), false, String(address));
    const family = typeof address === 'string' && address.includes(':') ? 6 : 4;
    const f = family === 6 ? fixture(noData, [address]) : fixture([address], noData);
    await assert.rejects(createDestinationResolver(f)(target), /DNS/, String(address));
    assert.equal(f.instances[0].canceled, 1);
  }
});
test('ordinary public IPv4/IPv6 and boundaries outside special ranges remain usable', async () => {
  for (const address of ['8.8.8.8', '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0',
    '192.31.195.255', '192.31.197.0', '198.17.255.255', '198.20.0.0', '223.255.255.255',
    '2001:200::1', '2001:db7::1', '2001:db9::1', '2606:4700:4700::1111', '2620:4f:7fff::1',
    '2620:4f:8001::1', '3ffe:ffff::1', '3fff:1000::1']) {
    assert.equal(isPublicDestinationAddress(address), true, address);
    const family = address.includes(':') ? 6 : 4;
    const f = family === 6 ? fixture(noData, [address]) : fixture([address], noData);
    assert.deepEqual(await createDestinationResolver(f)(target), { ...target, address, family });
  }
});
test('a public first answer cannot hide unsafe same-family or other-family answers', async () => {
  for (const [a, aaaa] of [
    [['140.82.112.3', '127.0.0.1'], noData],
    [['140.82.112.3'], ['fe80::1']],
    [noData, ['2606:4700:4700::1111', '::ffff:7f00:1']],
    [['2606:4700:4700::1111'], noData],
    [noData, ['8.8.8.8']],
  ]) await assert.rejects(createDestinationResolver(fixture(a, aaaa))(target), /DNS/);
});
test('only ENODATA allows a missing family, not errors, malformed or oversized responses', async () => {
  for (const [a, aaaa] of [
    [noData, noData], [[], []], [null, noData], ['8.8.8.8', noData],
    [[{ address: '8.8.8.8', ttl: 30 }], noData],
    [Array(33).fill('8.8.8.8'), noData],
    [Array(17).fill('8.8.8.8'), Array(16).fill('2606:4700::1111')],
    [() => Promise.reject(Object.assign(new Error('detail must not escape'), { code: 'ENOTFOUND' })), ['2606:4700::1111']],
    [['8.8.8.8'], () => Promise.reject(new Error('detail must not escape'))],
  ]) {
    const f = fixture(a, aaaa);
    await assert.rejects(createDestinationResolver(f)(target), error => /DNS/.test(error.message) && !error.message.includes('detail'));
    assert.equal(f.instances[0].canceled, 1);
  }
});
test('new requests re-resolve independently and cannot reuse a previously public pin', async () => {
  let calls = 0;
  const f = fixture(() => Promise.resolve(++calls === 1 ? ['8.8.8.8'] : ['10.0.0.1']), noData);
  const resolve = createDestinationResolver(f);
  assert.equal((await resolve(target)).address, '8.8.8.8');
  await assert.rejects(resolve(target), /DNS/);
  assert.equal(f.instances.length, 2);
});
test('abort before DNS allocates nothing; abort during DNS cancels, with no late result', async () => {
  const controller = new AbortController(); controller.abort();
  const untouched = fixture();
  await assert.rejects(createDestinationResolver(untouched)(target, controller.signal), /canceled/);
  assert.equal(untouched.instances.length, 0);
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }), noData), clock = clockFixture();
  const active = new AbortController();
  const pending = createDestinationResolver({ ...f, clock })(target, active.signal);
  const rejected = assert.rejects(pending, /canceled/);
  await tick(); active.abort(); await rejected;
  assert.equal(f.instances[0].canceled, 1);
  assert.equal(clock.timers.size, 0);
  finish(['8.8.8.8']); await tick();
});
test('DNS deadline cancels both families, clears timers, and absorbs late rejection', async () => {
  let fail;
  const f = fixture(() => new Promise((_, reject) => { fail = reject; }), () => new Promise(() => {}));
  const clock = clockFixture();
  const pending = createDestinationResolver({ ...f, clock })(target);
  const rejected = assert.rejects(pending, /timeout/);
  await tick();
  assert.deepEqual([...clock.timers.values()].map(timer => timer.delay), [5000]);
  clock.expire(); await rejected;
  assert.equal(f.instances[0].canceled, 1);
  assert.equal(clock.timers.size, 0);
  fail(new Error('late')); await tick();
});
test('success cleans timer and abort hook; canceling one request leaves another alive', async () => {
  const f = fixture(), clock = clockFixture(), controller = new AbortController();
  await createDestinationResolver({ ...f, clock })(target, controller.signal);
  assert.equal(clock.timers.size, 0);
  controller.abort(); assert.equal(f.instances[0].canceled, 1);
  let finish;
  const concurrent = fixture(() => new Promise(resolve => { finish = resolve; }), noData);
  const resolve = createDestinationResolver(concurrent), one = new AbortController();
  const first = resolve(target, one.signal), rejected = assert.rejects(first, /canceled/);
  const second = resolve(target);
  await tick(); one.abort(); await rejected;
  assert.equal(concurrent.instances[1].canceled, 0);
  finish(['8.8.8.8']);
  assert.equal((await second).address, '8.8.8.8');
  assert.equal(concurrent.instances[1].canceled, 1);
});

test('target mutation while resolving cannot alter the returned destination or port', async () => {
  let finish;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }), noData);
  const mutable = { ...target };
  const pending = createDestinationResolver(f)(mutable);
  mutable.hostname = '127.0.0.1'; mutable.port = 22;
  await tick(); finish(['8.8.8.8']);
  assert.deepEqual(await pending, { hostname: 'github.com', port: 443, address: '8.8.8.8', family: 4 });
});
test('deadline is enforced even if the event loop has not dispatched the timer', async () => {
  let finish, time = 0;
  const f = fixture(() => new Promise(resolve => { finish = resolve; }), noData);
  const clock = { ...clockFixture(), monotonicNow: () => time };
  const pending = createDestinationResolver({ ...f, clock })(target);
  const rejected = assert.rejects(pending, /timeout/);
  await tick(); time = 5000; finish(['8.8.8.8']); await rejected;
  assert.equal(clock.timers.size, 0);
  assert.equal(f.instances[0].canceled, 1);
});
test('accessors and sparse answers fail closed; resolver exceptions do not leak host diagnostics', async () => {
  const f = fixture();
  await assert.rejects(createDestinationResolver(f)({ get hostname() { assert.fail('must not evaluate browser getter'); }, port: 443 }), /destination/);
  assert.equal(f.instances.length, 0);
  for (const answers of [Array(1), ['8.8.8.8', ...Array(1)]]) {
    await assert.rejects(createDestinationResolver(fixture(answers, noData))(target), /DNS denied/);
  }
  await assert.rejects(createDestinationResolver({ createResolver() { throw new Error('host diagnostic'); } })(target), /^Error: DNS denied$/);
  const throwing = fixture(() => { throw new Error('host diagnostic'); }, noData);
  await assert.rejects(createDestinationResolver(throwing)(target), /^Error: DNS denied$/);
  assert.equal(throwing.instances[0].canceled, 1);
});

// Real c-ares UDP traffic to an explicit loopback fixture, never system/external DNS.
// This exercises family parsing + Resolver.cancel(), not public-domain connectivity.
async function localDns(t, respond) {
  const socket = createSocket('udp4');
  t.after(() => new Promise(resolve => socket.close(resolve)));
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.bind(0, '127.0.0.1', resolve); });
  const questions = [];
  let observed;
  const bothSeen = new Promise(resolve => { observed = resolve; });
  socket.on('message', (packet, peer) => {
    let offset = 12; const labels = [];
    while (packet[offset]) { const size = packet[offset++]; labels.push(packet.subarray(offset, offset + size).toString('ascii')); offset += size; }
    offset++;
    const type = packet.readUInt16BE(offset);
    questions.push({ name: labels.join('.'), type });
    if (questions.length >= 2) observed();
    if (!respond) return;
    const questionEnd = offset + 4;
    const header = Buffer.alloc(12);
    packet.copy(header, 0, 0, 2); header.writeUInt16BE(0x8180, 2); header.writeUInt16BE(1, 4);
    // A is public; AAAA is successful no-data, not NXDOMAIN.
    header.writeUInt16BE(type === 1 ? 1 : 0, 6);
    const answer = type === 1 ? Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 30, 0, 4, 140, 82, 112, 3]) : Buffer.alloc(0);
    socket.send(Buffer.concat([header, packet.subarray(12, questionEnd), answer]), peer.port, peer.address);
  });
  const createResolver = options => {
    const resolver = new Resolver(options);
    resolver.setServers([`127.0.0.1:${socket.address().port}`]);
    return resolver;
  };
  return { createResolver, questions, bothSeen };
}
test('actual Node Resolver parses A plus AAAA ENODATA into one public pin', { timeout: 8000 }, async t => {
  const dns = await localDns(t, true);
  assert.deepEqual(await createDestinationResolver(dns)(target), { ...target, address: '140.82.112.3', family: 4 });
  assert.deepEqual(dns.questions.sort((a, b) => a.type - b.type), [{ name: 'github.com', type: 1 }, { name: 'github.com', type: 28 }]);
});
test('actual pending Node Resolver queries are canceled without waiting for DNS retry', { timeout: 8000 }, async t => {
  const dns = await localDns(t, false), controller = new AbortController();
  let canceledQueries = 0;
  const resolve = createDestinationResolver({ createResolver(options) {
    const resolver = dns.createResolver(options);
    // Observe actual c-ares promises without substituting the resolver methods' behavior.
    for (const method of ['resolve4', 'resolve6']) {
      const original = resolver[method].bind(resolver);
      resolver[method] = (...args) => {
        const query = original(...args);
        query.catch(error => { if (error.code === 'ECANCELLED') canceledQueries++; });
        return query;
      };
    }
    return resolver;
  } });
  const pending = resolve(target, controller.signal), rejected = assert.rejects(pending, /canceled/);
  await dns.bothSeen; controller.abort(); await rejected; await tick();
  assert.equal(canceledQueries, 2);
});

test('a full 32-answer DNS response stays usable without selecting alternate addresses', async () => {
  const f = fixture(Array(16).fill('140.82.112.3'), Array(16).fill('2606:4700::1111'));
  assert.deepEqual(await createDestinationResolver(f)(target), { ...target, address: '140.82.112.3', family: 4 });
});
