import { describe, expect, it } from 'vitest';
import { assertControlCapability, authenticateControlRequest } from '../../src/maintenance/control-auth';
import { CONTROL_TOKEN, OTHER_CONTROL_TOKEN, controlRequest } from './control-fixtures';

describe('dedicated maintenance control credentials', () => {
  it('provides a native constant-time comparison for equal-length byte arrays', () => {
    // WebWorker lib masks this Workers extension; signature matches worker-configuration.d.ts.
    // The assertion below checks the actual runtime function, not a polyfill or mock.
    const subtle = crypto.subtle as SubtleCrypto & {
      timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
    };
    const first = new Uint8Array(32);
    const lastByteDiffers = new Uint8Array(32);
    lastByteDiffers[31] = 1;
    expect(typeof subtle.timingSafeEqual).toBe('function');
    expect(subtle.timingSafeEqual(first, first)).toBe(true);
    expect(subtle.timingSafeEqual(first, lastByteDiffers)).toBe(false);
  });

  // Removing capability comparison must break acceptance/rejection independently.
  it('accepts the configured capability and rejects a different canonical value', () => {
    expect(() => assertControlCapability(CONTROL_TOKEN, CONTROL_TOKEN)).not.toThrow();
    expect(() => assertControlCapability(OTHER_CONTROL_TOKEN, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
  });

  it('returns the request capability for case-insensitive Bearer authentication', () => {
    const request = controlRequest('status');
    request.headers.set('Authorization', `bEaReR ${CONTROL_TOKEN}`);
    expect(authenticateControlRequest(request, CONTROL_TOKEN)).toBe(CONTROL_TOKEN);
  });

  const malformed = [undefined, null, 1, {}, '', 'A'.repeat(42), 'A'.repeat(44),
    `${CONTROL_TOKEN}=`, '+'.repeat(43), '/'.repeat(43), `${'A'.repeat(42)}B`];
  it.each(malformed)('rejects malformed capability %j', value => {
    expect(() => assertControlCapability(value, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
  });
  it.each(malformed)('fails closed for malformed configuration %j before checking credentials', value => {
    expect(() => assertControlCapability(CONTROL_TOKEN, value)).toThrow('CONTROL_UNAVAILABLE');
    expect(() => authenticateControlRequest(new Request('https://local.test'), value)).toThrow('CONTROL_UNAVAILABLE');
  });

  it.each(['', `Basic ${CONTROL_TOKEN}`, `Bearer  ${CONTROL_TOKEN}`, `Bearer ${CONTROL_TOKEN} extra`,
    `Bearer ${CONTROL_TOKEN}, Bearer ${CONTROL_TOKEN}`, `Bearer ${'A'.repeat(42)}B`])(
    'rejects non-single or non-canonical Bearer header %s', authorization => {
      const request = new Request('https://local.test', { headers: { authorization } });
      expect(() => authenticateControlRequest(request, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
    },
  );

  it('rejects duplicate headers after Headers merges them', () => {
    const request = controlRequest('status');
    request.headers.append('Authorization', `Bearer ${CONTROL_TOKEN}`);
    expect(() => authenticateControlRequest(request, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
  });

  it('does not accept business cookies, query parameters or body credentials', () => {
    const request = new Request(`https://local.test/?token=${CONTROL_TOKEN}`, {
      method: 'POST', headers: { Cookie: `session=${CONTROL_TOKEN}` }, body: CONTROL_TOKEN,
    });
    expect(() => authenticateControlRequest(request, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
    expect(request.bodyUsed).toBe(false);
  });

  it('rechecks request and configuration for every retry', () => {
    const request = controlRequest('status');
    expect(authenticateControlRequest(request, CONTROL_TOKEN)).toBe(CONTROL_TOKEN);
    expect(() => authenticateControlRequest(request, OTHER_CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
    request.headers.delete('Authorization');
    expect(() => authenticateControlRequest(request, CONTROL_TOKEN)).toThrow('CONTROL_UNAUTHORIZED');
  });
});
