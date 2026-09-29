/** Shared wire contract only. Parsing/matching is NOT authentication.
 * A caller must separately verify a trusted signature, current server authority,
 * local pairing and atomic one-time consumption before granting any network use.
 */
export interface ConnectorAuthorizationBinding {
  purpose: "connect" | "renew";
  origin: string;
  connectorId: string;
  memberId: string;
  environmentId: string;
  runtimeId: string;
  generation: number;
  policyVersion: string;
  leaseId: string | null;
}

export interface ConnectorAuthorizationClaims extends ConnectorAuthorizationBinding {
  version: 1;
  ticketId: string;
  issuedAtMs: number;
  expiresAtMs: number;
}

const bindingKeys = ["purpose", "origin", "connectorId", "memberId", "environmentId", "runtimeId", "generation", "policyVersion", "leaseId"] as const;
const claimKeys = [...bindingKeys, "version", "ticketId", "issuedAtMs", "expiresAtMs"] as const;
const identityKeys = ["connectorId", "memberId", "environmentId", "runtimeId", "policyVersion"] as const;

/** expected must come from trusted authority/local binding, not request fields.
 * nowMs is the caller's current clock. No clock-skew grace extends the lifetime.
 */
export function readConnectorAuthorizationClaims(
  value: unknown,
  expected: ConnectorAuthorizationBinding,
  nowMs: number,
): Readonly<ConnectorAuthorizationClaims> | undefined {
  const input = ownJsonFields(value, claimKeys);
  const binding = ownJsonFields(expected, bindingKeys);
  if (!input || !binding || !validBinding(input) || !validBinding(binding)) return undefined;
  if (bindingKeys.some((key) => input[key] !== binding[key])) return undefined;
  if (input.version !== 1 || !validId(input.ticketId)) return undefined;
  if (!safeTime(nowMs) || !safeTime(input.issuedAtMs) || !safeTime(input.expiresAtMs)) return undefined;
  if (input.expiresAtMs <= input.issuedAtMs || input.expiresAtMs - input.issuedAtMs > 60_000) return undefined;
  if (nowMs < input.issuedAtMs || nowMs >= input.expiresAtMs) return undefined;
  // All values have been narrowed to primitives; no caller-owned nested state.
  return Object.freeze(input) as unknown as Readonly<ConnectorAuthorizationClaims>;
}

function ownJsonFields(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))) return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function validBinding(value: Record<string, unknown>): boolean {
  if (identityKeys.some((key) => !validId(value[key]))) return false;
  if (typeof value.generation !== "number" || !Number.isSafeInteger(value.generation)
    || value.generation < 1 || value.generation >= Number.MAX_SAFE_INTEGER) return false;
  if (value.purpose === "connect") {
    if (value.leaseId !== null) return false;
  } else if (value.purpose === "renew") {
    if (!validId(value.leaseId)) return false;
  } else return false;
  if (typeof value.origin !== "string" || value.origin.length > 2048) return false;
  try {
    const url = new URL(value.origin);
    return url.protocol === "https:" && url.origin === value.origin;
  } catch { return false; }
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
}

function safeTime(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}
