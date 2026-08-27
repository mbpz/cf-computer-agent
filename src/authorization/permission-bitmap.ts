/**
 * Versioned permission registry for the workspace UI and admin APIs.
 *
 * Bit indexes are append-only: changing an existing index would silently
 * change the meaning of persisted role masks. Legacy capabilities remain a
 * separate compatibility projection in policy.ts.
 */
export const PERMISSION_BITS = Object.freeze({
  "knowledge:read": 0,
  "knowledge:create": 1,
  "knowledge:edit": 2,
  "knowledge:review": 3,
  "knowledge:publish": 4,
  "knowledge:delete": 5,
  "submission:create": 6,
  "submission:read-own": 7,
  "submission:read-all": 8,
  "member:manage": 9,
  "role:manage": 10,
  "menu:manage": 11,
  "space:manage": 12,
  "audit:read": 13,
  "analytics:read": 14,
  "asset:manage": 15,
  "duplicate:review": 16,
  "agent:use": 17,
  "search:use": 18,
  "workspace.tasks": 20,
} as const);

export type PermissionKey = keyof typeof PERMISSION_BITS;
const PERMISSION_ENTRIES = Object.entries(PERMISSION_BITS) as readonly [PermissionKey, number][];
const MAX_MASK = (1n << 64n) - 1n;

function permissionKey(value: string): PermissionKey {
  if (Object.prototype.hasOwnProperty.call(PERMISSION_BITS, value)) return value as PermissionKey;
  throw new Error("PERMISSION_UNKNOWN");
}

export function permissionMaskFor(keys: readonly string[]): bigint {
  if (!Array.isArray(keys)) throw new TypeError("PERMISSION_KEYS_INVALID");
  return keys.reduce((mask, key) => {
    const bit = PERMISSION_BITS[permissionKey(key)];
    return mask | (1n << BigInt(bit));
  }, 0n);
}

export function parsePermissionMask(value: unknown): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) throw new Error("PERMISSION_MASK_INVALID");
  let mask: bigint;
  try {
    mask = BigInt(value);
  } catch {
    throw new Error("PERMISSION_MASK_INVALID");
  }
  if (mask < 0n || mask > MAX_MASK) throw new Error("PERMISSION_MASK_INVALID");
  return mask;
}

export function hasPermission(mask: bigint, bit: number): boolean {
  if (typeof mask !== "bigint") throw new TypeError("PERMISSION_MASK_INVALID");
  if (!Number.isSafeInteger(bit) || bit < 0 || bit > 63) throw new Error("PERMISSION_BIT_INVALID");
  return (mask & (1n << BigInt(bit))) !== 0n;
}

export function capabilitiesForMask(mask: bigint): PermissionKey[] {
  parsePermissionMask(`0x${mask.toString(16)}`);
  return PERMISSION_ENTRIES.filter(([, bit]) => hasPermission(mask, bit)).map(([key]) => key);
}

export function serializePermissionMask(mask: bigint): string {
  parsePermissionMask(`0x${mask.toString(16)}`);
  return `0x${mask.toString(16)}`;
}
