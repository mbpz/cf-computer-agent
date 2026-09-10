import { resolve4 as systemResolve4 } from 'node:dns/promises';
import { isIP } from 'node:net';

// Local G0 proof only. Synthetic guest IPs are identifiers, NEVER network dial targets.
// The eventual relay must use the returned address verbatim, without a second DNS lookup.
const destinations = new Map([
  ['203.0.113.10', 'dl-cdn.alpinelinux.org'],
  ['203.0.113.11', 'github.com'],
  ['203.0.113.12', 'api.github.com'],
]);

function isPublicIPv4(address) {
  if (typeof address !== 'string' || isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99)))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

export async function resolveProbeDestination(virtualAddress, port, resolve4 = systemResolve4) {
  const hostname = destinations.get(virtualAddress);
  if (!hostname) throw new Error('Unapproved probe destination');
  if (port !== 80 && port !== 443) throw new Error('Unapproved probe port');
  let timer;
  let addresses;
  try {
    addresses = await Promise.race([
      resolve4(hostname),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS resolution timed out')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > 32) {
    throw new Error('Invalid DNS result');
  }
  // Fail closed for mixed answers. IPv6 is deliberately unsupported by this bounded proof.
  if (!addresses.every(isPublicIPv4)) throw new Error('DNS result must contain only public IPv4 addresses');
  return { hostname, address: addresses[0], port };
}
