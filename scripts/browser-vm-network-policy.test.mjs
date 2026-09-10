import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProbeDestination } from '../tools/browser-vm/relay/destination-policy.mjs';

test('only a fixed virtual destination maps to a server-owned domain and pinned address', async () => {
  const requests = [];
  const result = await resolveProbeDestination('203.0.113.10', 443, async hostname => {
    requests.push(hostname);
    return ['151.101.2.132', '151.101.66.132'];
  });
  assert.deepEqual(requests, ['dl-cdn.alpinelinux.org']);
  assert.deepEqual(result, { hostname: 'dl-cdn.alpinelinux.org', address: '151.101.2.132', port: 443 });
});

test('arbitrary domains, IPs, alternate numeric forms and unapproved ports never reach DNS', async () => {
  const resolve4 = async () => { assert.fail('denied target must not perform DNS'); };
  for (const target of ['127.0.0.1', '169.254.169.254', 'example.com', 'github.com', '2130706433', '0x7f000001', '127.1', '::1', '[::ffff:127.0.0.1]', '203.0.113.10.', '203.0.113.10\0', '203.0.113.99', null]) {
    await assert.rejects(resolveProbeDestination(target, 443, resolve4), /destination/);
  }
  for (const port of [0, 22, 53, 3000, 8080, 65536, '443', NaN]) {
    await assert.rejects(resolveProbeDestination('203.0.113.10', port, resolve4), /port/);
  }
});

test('private, metadata, multicast, reserved and IPv6 DNS answers fail closed', async () => {
  for (const answer of [
    '0.0.0.0', '0.1.2.3', '10.1.2.3', '100.64.0.1', '100.127.255.255', '127.0.0.2',
    '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.0.0.8',
    '192.0.2.1', '192.88.99.1', '198.18.0.1', '198.19.255.255', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    '::1', '::ffff:127.0.0.1', '2606:4700:4700::1111', '1.2.3.999', '01.2.3.4',
  ]) {
    await assert.rejects(resolveProbeDestination('203.0.113.10', 443, async () => [answer]), /public IPv4/, answer);
  }
});

test('a mixed public/private DNS answer is rejected, not filtered into permission', async () => {
  await assert.rejects(resolveProbeDestination('203.0.113.10', 443, async () => ['151.101.2.132', '127.0.0.1']), /public IPv4/);
});

test('every new connection re-resolves and rejects an answer that changed to private', async () => {
  let requests = 0;
  const resolve4 = async () => ++requests === 1 ? ['151.101.2.132'] : ['10.0.0.1'];
  const first = await resolveProbeDestination('203.0.113.10', 80, resolve4);
  assert.equal(first.address, '151.101.2.132');
  await assert.rejects(resolveProbeDestination('203.0.113.10', 80, resolve4), /public IPv4/);
});

test('empty and failed DNS do not produce connection parameters', async () => {
  for (const answer of [[], null, '151.101.2.132']) {
    await assert.rejects(resolveProbeDestination('203.0.113.10', 443, async () => answer), /DNS/);
  }
  await assert.rejects(resolveProbeDestination('203.0.113.10', 443, async () => { throw new Error('DNS unavailable'); }), /DNS/);
});
