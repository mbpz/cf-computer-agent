import {
  CONNECTOR_AUTHORIZATION_TYPE,
  encodeConnectorAuthorizationPart,
  readConnectorAuthorizationClaims,
  type ConnectorAuthorizationBinding,
} from "../../shared/connector-authorization";

export interface ConnectorSigningKey {
  keyId: string;
  privateKey: CryptoKey;
}

export function isConnectorSigningKey(config: ConnectorSigningKey | undefined): config is ConnectorSigningKey {
  const keyId = config?.keyId;
  const key = config?.privateKey;
  return typeof keyId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyId)
    && key?.type === "private" && key.algorithm.name === "Ed25519" && !key.extractable
    && key.usages.length === 1 && key.usages[0] === "sign";
}

/** Low-level server-only signing, NOT an issuance/authority service.
 * Callers must derive claims from current authenticated authority and persist an
 * idempotent issuance receipt before calling this function. Never pass browser
 * claims/bindings through directly. The private key stays on the server.
 * Ed25519 is deterministic: retrying an unchanged receipt/key produces exactly
 * the same ticket, but this alone is not request idempotency or single-use.
 */
export function createConnectorAuthorizationSigner(config?: ConnectorSigningKey) {
  const keyId = config?.keyId;
  const key = config?.privateKey;
  const configured = isConnectorSigningKey(config);
  return async (
    value: unknown, expected: ConnectorAuthorizationBinding, now: () => number,
  ): Promise<string | undefined> => {
    try {
      if (!configured || !key) return undefined;
      const claims = readConnectorAuthorizationClaims(value, expected, now());
      if (!claims) return undefined;
      const { version: _version, ticketId: _ticketId, issuedAtMs: _issuedAtMs, expiresAtMs: _expiresAtMs, ...binding } = claims;
      const header = encodeConnectorAuthorizationPart(JSON.stringify({
        alg: "EdDSA", typ: CONNECTOR_AUTHORIZATION_TYPE, kid: keyId,
      }));
      const input = `${header}.${encodeConnectorAuthorizationPart(JSON.stringify(claims))}`;
      const signature = await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(input));
      if (!readConnectorAuthorizationClaims(claims, binding, now())) return undefined;
      const token = `${input}.${encodeConnectorAuthorizationPart(new Uint8Array(signature))}`;
      return token.length <= 8192 ? token : undefined;
    } catch {
      // No unsigned fallback, token/secret logging, or automatic key generation.
      return undefined;
    }
  };
}
