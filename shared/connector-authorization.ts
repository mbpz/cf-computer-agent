/** Shared claims contract and pinned-key signature verifier.
 * Parsing/matching alone is NOT authentication. Even a valid signature requires
 * current server authority, local pairing and atomic one-time consumption before
 * granting network use. Neither function below starts a network connection.
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


export interface ConnectorVerificationKey {
  keyId: string;
  publicKey: CryptoKey;
}

export const CONNECTOR_AUTHORIZATION_TYPE = "memory-garden-connector+jws";

/** Strict compact JWS encoding shared by the server and local verifier.
 * This encodes data only; it does not sign or authorize anything.
 */
export function encodeConnectorAuthorizationPart(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

/** Trust must be supplied out of band by the connector, never by a ticket/browser.
 * Keep at most active + retiring public keys; replacing this verifier removes old
 * trust. No key fetching, algorithm negotiation, or embedded key material.
 * A verified ticket STILL needs current authority, pairing and atomic consumption.
 */
export function createConnectorAuthorizationVerifier(keys?: readonly ConnectorVerificationKey[]) {
  const trusted = new Map<string, CryptoKey>();
  if (keys && keys.length > 0 && keys.length <= 2) {
    for (const entry of keys) {
      const key = entry.publicKey;
      if (!validId(entry.keyId) || trusted.has(entry.keyId) || !key
        || key.type !== "public" || key.algorithm.name !== "Ed25519"
        || key.usages.length !== 1 || key.usages[0] !== "verify") {
        trusted.clear();
        break;
      }
      trusted.set(entry.keyId, key);
    }
  }
  return async (
    token: unknown, expected: ConnectorAuthorizationBinding, now: () => number,
  ): Promise<Readonly<ConnectorAuthorizationClaims> | undefined> => {
    try {
      if (!trusted.size || typeof token !== "string" || token.length > 8192) return undefined;
      const parts = token.split(".");
      if (parts.length !== 3) return undefined;
      const [protectedPart, payloadPart, signaturePart] = parts;
      const headerBytes = decodeAuthorizationPart(protectedPart);
      const payloadBytes = decodeAuthorizationPart(payloadPart);
      const signature = decodeAuthorizationPart(signaturePart);
      if (!headerBytes || !payloadBytes || !signature || signature.length !== 64) return undefined;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const headerText = decoder.decode(headerBytes);
      const header: unknown = JSON.parse(headerText);
      const fields = ownJsonFields(header, ["alg", "typ", "kid"]);
      if (!fields || fields.alg !== "EdDSA" || fields.typ !== CONNECTOR_AUTHORIZATION_TYPE
        || !validId(fields.kid)) return undefined;
      // A single canonical form also rejects duplicate JSON header keys.
      if (headerText !== JSON.stringify({ alg: "EdDSA", typ: CONNECTOR_AUTHORIZATION_TYPE, kid: fields.kid })) return undefined;
      const key = trusted.get(fields.kid);
      if (!key) return undefined;
      const binding = ownJsonFields(expected, bindingKeys);
      if (!binding || !validBinding(binding)) return undefined;
      const snapshot = Object.freeze(binding) as unknown as ConnectorAuthorizationBinding;
      const payloadText = decoder.decode(payloadBytes);
      const claims = readConnectorAuthorizationClaims(JSON.parse(payloadText), snapshot, now());
      // Only this protocol's canonical claims, including no duplicate JSON keys.
      if (!claims || JSON.stringify(claims) !== payloadText) return undefined;
      const verified = await crypto.subtle.verify("Ed25519", key, signature,
        new TextEncoder().encode(`${protectedPart}.${payloadPart}`));
      if (!verified) return undefined;
      // Do not accept a ticket which expired while crypto was pending.
      return readConnectorAuthorizationClaims(claims, snapshot, now());
    } catch {
      // Malformed input, unsupported crypto, or clock failure never grants access.
      return undefined;
    }
  };
}

function decodeAuthorizationPart(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return undefined;
  const decoded = atob(value.replace(/-/gu, "+").replace(/_/gu, "/"));
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return encodeConnectorAuthorizationPart(bytes) === value ? bytes : undefined;
}

/** Device bootstrap: only the issuer signature can supply member/runtime identity.
 * The three local constraints come from operator configuration and this process,
 * never from a browser message. Decoding here does NOT authenticate the payload;
 * nothing is returned until the complete canonical signature check has passed.
 * Renewals must instead use the full binding retained from the accepted lease.
 */
export function createConnectorDeviceVerifier(
  keys: readonly ConnectorVerificationKey[] | undefined,
  local: Pick<ConnectorAuthorizationBinding, "origin" | "connectorId" | "policyVersion">,
) {
  const scope = { origin: local.origin, connectorId: local.connectorId, policyVersion: local.policyVersion };
  const verify = createConnectorAuthorizationVerifier(keys);
  return async (token: unknown, now: () => number): Promise<Readonly<ConnectorAuthorizationClaims> | undefined> => {
    try {
      if (typeof token !== "string" || token.length > 8192) return undefined;
      const parts = token.split(".");
      if (parts.length !== 3) return undefined;
      const bytes = decodeAuthorizationPart(parts[1]);
      if (!bytes) return undefined;
      const candidate = ownJsonFields(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), claimKeys);
      if (!candidate) return undefined;
      const binding = Object.fromEntries(bindingKeys.map(key => [key, candidate[key]]));
      return await verify(token, { ...binding, ...scope, purpose: "connect", leaseId: null } as ConnectorAuthorizationBinding, now);
    } catch { return undefined; }
  };
}
