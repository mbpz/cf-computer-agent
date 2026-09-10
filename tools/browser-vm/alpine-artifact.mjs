// Development-only pinned userspace, not approval to distribute a composite Linux image.
export const ALPINE_FILE = 'alpine-minirootfs-3.24.1-x86.tar.gz';
export const ALPINE_BYTES = 3_538_048;
export const ALPINE_SHA256 = '634355e2245c9d56186d1b86fb6e034453eb303aea15b573ca250b343376fffd';

export async function verifyAlpineArchive(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== ALPINE_BYTES) {
    throw new Error('Alpine development archive has an unexpected size');
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  if (hex !== ALPINE_SHA256) throw new Error('Alpine development archive digest mismatch');
  return bytes;
}
