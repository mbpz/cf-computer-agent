export const CONNECTOR_HOSTS = Object.freeze(['dl-cdn.alpinelinux.org', 'github.com', 'api.github.com']);

// Conservative policy: special-purpose allocations are denied even when globally reachable.
// IANA IPv4/IPv6 Special-Purpose Address Registries, reviewed 2026-09-30.
const IPV4_DENIED = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([address, bits]) => [ipv4Number(address), bits]);

function ipv4Number(address) {
  return address.split('.').reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

export function isPublicIpv4Destination(address) {
  if (typeof address !== 'string' || !/^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/u.test(address)
    || address.split('.').some(octet => Number(octet) > 255)) return false;
  const value = ipv4Number(address);
  return !IPV4_DENIED.some(([prefix, bits]) => value >> BigInt(32 - bits) === prefix >> BigInt(32 - bits));
}
