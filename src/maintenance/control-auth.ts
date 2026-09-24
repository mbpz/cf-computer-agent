function decodeCanonical32(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (binary.length !== 32 || canonical !== value) return null;
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  } catch { return null; }
}

export function assertControlCapability(capability: unknown, configured: unknown): void {
  const expected = decodeCanonical32(configured);
  if (!expected) throw new Error('CONTROL_UNAVAILABLE');
  const actual = decodeCanonical32(capability);
  // Match the Workers extension masked by TypeScript's WebWorker library.
  // Its real runtime availability is covered by the local Workerd probe.
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
  };
  if (!actual || !subtle.timingSafeEqual(actual, expected)) throw new Error('CONTROL_UNAUTHORIZED');
}

export function authenticateControlRequest(request: Request, configured: unknown): string {
  if (!decodeCanonical32(configured)) throw new Error('CONTROL_UNAVAILABLE');
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.headers.get('Authorization') ?? '');
  assertControlCapability(match?.[1], configured);
  return match![1];
}
