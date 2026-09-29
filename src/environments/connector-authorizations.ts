import { readConnectorAuthorizationClaims, type ConnectorAuthorizationBinding } from "../../shared/connector-authorization";
import { AppError } from "../http";
import type { SessionService } from "../identity/session";
import { ConnectorAuthorityRepository, connectorAuthorizationConflict as conflict,
  connectorAuthorizationUnavailable as unavailable, type ConnectorAuthorityAccess } from "./connector-authority-repository";
import { createConnectorAuthorizationSigner, isConnectorSigningKey, type ConnectorSigningKey } from "./connector-signing";

export interface ConnectorAuthorizationConfig {
  origin: string;
  policyVersion: string;
  signingKey: ConnectorSigningKey;
  now?: () => number;
}
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/** Session-bound reservations are not assertions that a VM is running or paired.
 * Only unsigned idempotency receipts are stored; live authority is rechecked
 * after signing. Consumption/renewal must independently check live authority.
 */
export class ConnectorAuthorizationsService {
  constructor(private readonly repository: ConnectorAuthorityRepository,
    private readonly sessions: SessionService, private readonly config?: ConnectorAuthorizationConfig) {}

  private now = () => (this.config?.now ?? Date.now)();

  private configured(): ConnectorAuthorizationConfig {
    const c = this.config;
    try {
      if (!c || !isConnectorSigningKey(c.signingKey) || !identifier.test(c.policyVersion)
        || new URL(c.origin).protocol !== "https:" || new URL(c.origin).origin !== c.origin) throw unavailable();
    } catch { throw unavailable(); }
    return c;
  }

  private async access(request: Request, memberId: string, environmentId: string): Promise<ConnectorAuthorityAccess> {
    const session = await this.sessions.resolvePrincipal(request);
    if (session.member.id !== memberId) throw new AppError("FORBIDDEN", "Member access required", 403);
    return { memberId, environmentId, sessionHash: session.tokenHash, nowMs: this.now(),
      origin: this.config?.origin ?? "", policyVersion: this.config?.policyVersion ?? "" };
  }

  private async intent(a: ConnectorAuthorityAccess, kind: string, body: Record<string, unknown>) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({
      kind, memberId: a.memberId, environmentId: a.environmentId, sessionHash: a.sessionHash, ...body,
    })));
    return { operationId: body.operationId as string,
      requestHash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("") };
  }

  async current(request: Request, memberId: string, environmentId: string) {
    this.configured();
    return { authority: await this.repository.current(await this.access(request, memberId, environmentId)) };
  }

  async reserve(request: Request, memberId: string, environmentId: string, value: unknown) {
    const body = parse(value, true);
    this.configured();
    const a = await this.access(request, memberId, environmentId);
    return { authority: await this.repository.reserve(a, await this.intent(a, "reserve", body),
      body.expectedGeneration as number, body.connectorId as string) };
  }

  async issue(request: Request, memberId: string, environmentId: string, value: unknown) {
    const body = parse(value, false);
    const config = this.configured();
    const a = await this.access(request, memberId, environmentId);
    const runtimeId = body.runtimeId as string, generation = body.generation as number;
    const saved = await this.repository.connect(a, await this.intent(a, "connect", body), runtimeId, generation, config.signingKey.keyId);
    const expected: ConnectorAuthorizationBinding = { purpose: "connect", memberId, environmentId, runtimeId, generation,
      connectorId: saved.authority.connectorId, origin: saved.authority.origin,
      policyVersion: saved.authority.policyVersion, leaseId: null };
    if (!readConnectorAuthorizationClaims(saved.claims, expected, this.now())) throw conflict();
    const ticket = await createConnectorAuthorizationSigner(config.signingKey)(saved.claims, expected, this.now);
    if (!ticket) throw unavailable();
    await this.repository.assertCurrent({ ...a, nowMs: this.now() }, runtimeId, generation);
    if (!readConnectorAuthorizationClaims(saved.claims, expected, this.now())) throw conflict();
    return { ticket };
  }

  async revoke(request: Request, memberId: string, environmentId: string, value: unknown) {
    const body = parse(value, false);
    // Revocation remains available after permission/policy/signing-key removal.
    const a = await this.access(request, memberId, environmentId);
    return { authority: await this.repository.revoke(a, await this.intent(a, "revoke", body),
      body.runtimeId as string, body.generation as number) };
  }
}

function parse(value: unknown, reserve: boolean): Record<string, unknown> {
  const keys = reserve ? ["operationId", "connectorId", "expectedGeneration"] : ["operationId", "runtimeId", "generation"];
  const invalid = () => new AppError("CONNECTOR_AUTHORIZATION_INVALID", "Invalid connector authorization request", 400);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== keys.length || Object.keys(input).some((k) => !keys.includes(k))) throw invalid();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const item = input[key];
    if (key === "generation" || key === "expectedGeneration") {
      if (typeof item !== "number" || !Number.isSafeInteger(item) || item < (reserve ? 0 : 1)
        || item > Number.MAX_SAFE_INTEGER - (reserve ? 2 : 1)) throw invalid();
    } else if (typeof item !== "string" || !identifier.test(item)) throw invalid();
    result[key] = item;
  }
  return result;
}
