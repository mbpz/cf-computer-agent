import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

const HOSTS = new Set(['dl-cdn.alpinelinux.org', 'github.com', 'api.github.com']);
const DNS_TIMEOUT_MS = 5000;
const MAX_ANSWERS = 32;
// Conservative policy: special-purpose allocations are denied even when globally reachable.
// IANA IPv4/IPv6 Special-Purpose Address Registries, reviewed 2026-09-30.
const IPV4_DENIED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([address, bits]) => [ipv4Number(address), bits]);
const IPV6_DENIED = [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['2620:4f:8000::', 48], ['3fff::', 20],
].map(([address, bits]) => [ipv6Number(address), bits]);

function ipv4Number(address) {
  return address.split('.').reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}
function ipv6Number(address) {
  const [left, right] = address.split('::');
  const start = left ? left.split(':') : [];
  const end = right ? right.split(':') : [];
  const words = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill('0'), ...end];
  return words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
}
function contains(value, prefix, bits, width) {
  const shift = BigInt(width - bits);
  return value >> shift === prefix >> shift;
}

export function isPublicDestinationAddress(address) {
  if (typeof address !== 'string' || address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return !IPV4_DENIED.some(([prefix, bits]) => contains(value, prefix, bits, 32));
  }
  if (family !== 6 || address.includes('.')) return false;
  const value = ipv6Number(address);
  // Only ordinary global unicast; excludes mapped/translated, local, multicast and future ranges.
  return contains(value, ipv6Number('2000::'), 3, 128)
    && !IPV6_DENIED.some(([prefix, bits]) => contains(value, prefix, bits, 128));
}

function canonicalTarget(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)
      || Reflect.ownKeys(target).length !== 2) throw new Error('destination denied');
  const hostname = Object.getOwnPropertyDescriptor(target, 'hostname');
  const port = Object.getOwnPropertyDescriptor(target, 'port');
  if (!hostname || !port || !('value' in hostname) || !('value' in port)
      || typeof hostname.value !== 'string' || !/^[a-zA-Z0-9.-]+$/.test(hostname.value)
      || !HOSTS.has(hostname.value.toLowerCase()) || ![80, 443].includes(port.value)) {
    throw new Error('destination denied');
  }
  return { hostname: hostname.value.toLowerCase(), port: port.value };
}

/** Trusted host dependencies only. Browser messages supply target, never resolver configuration. */
export function createDestinationResolver({
  createResolver = options => new Resolver(options),
  clock = { setTimer: setTimeout, clearTimer: clearTimeout, monotonicNow: () => performance.now() },
} = {}) {
  return async function resolve(target, signal) {
    const { hostname, port } = canonicalTarget(target);
    if (signal?.aborted) throw new Error('DNS canceled');
    const now = clock.monotonicNow ? () => clock.monotonicNow() : () => performance.now();
    const deadline = now() + DNS_TIMEOUT_MS;
    let resolver, timer, onAbort;
    try {
      resolver = createResolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
      const stopped = new Promise((_, reject) => {
        onAbort = () => reject(new Error('DNS canceled'));
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = clock.setTimer(() => reject(new Error('DNS timeout')), DNS_TIMEOUT_MS);
        if (signal?.aborted) onAbort();
      });
      const query = async family => {
        let answers;
        try { answers = await (family === 4 ? resolver.resolve4(hostname) : resolver.resolve6(hostname)); }
        catch (error) { if (error?.code === 'ENODATA') return []; throw new Error('DNS failed'); }
        if (!Array.isArray(answers) || answers.length > MAX_ANSWERS) throw new Error('DNS answers denied');
        // Check every answer, not just the selected address, including family integrity.
        const pins = [];
        for (const address of answers) {
          if (typeof address !== 'string' || isIP(address) !== family || !isPublicDestinationAddress(address)) {
            throw new Error('DNS address denied');
          }
          pins.push({ address, family });
        }
        return pins;
      };
      const [v4, v6] = await Promise.race([Promise.all([query(4), query(6)]), stopped]);
      if (signal?.aborted) throw new Error('DNS canceled');
      if (now() >= deadline) throw new Error('DNS timeout');
      if (v4.length + v6.length === 0 || v4.length + v6.length > MAX_ANSWERS) throw new Error('DNS answers denied');
      const pin = v4[0] ?? v6[0];
      return Object.freeze({ hostname, address: pin.address, family: pin.family, port });
    } catch (error) {
      // Do not leak DNS diagnostics, host configuration or arbitrary upstream error text.
      if (error?.message === 'DNS canceled' || error?.message === 'DNS timeout') throw error;
      throw new Error('DNS denied');
    } finally {
      if (timer !== undefined) clock.clearTimer(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      try { resolver?.cancel(); } catch { /* cleanup must not replace fail-closed result */ }
    }
  };
}
