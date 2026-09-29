import { createConnectorAuthorizationVerifier, readConnectorAuthorizationClaims, type ConnectorVerificationKey, type ConnectorAuthorizationBinding } from "../../shared/connector-authorization";
import { AppError } from "../http";
import type { SessionService } from "../identity/session";
import { ConnectorAuthorityRepository, connectorAuthorizationConflict as conflict,
  connectorAuthorizationUnavailable as unavailable, type ConnectorAuthorityAccess } from "./connector-authority-repository";
import { createConnectorAuthorizationSigner, isConnectorSigningKey, type ConnectorSigningKey } from "./connector-signing";

export interface ConnectorAuthorizationConfig {
  origin: string;
  policyVersion: string;
  signingKey: ConnectorSigningKey;
  verificationKeys?: readonly ConnectorVerificationKey[];
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

  async renew(request: Request, memberId: string, environmentId: string, value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRequest();
    const { leaseId, ...rest } = value as Record<string, unknown>;
    if (typeof leaseId !== "string" || !identifier.test(leaseId)) throw invalidRequest();
    const body: Record<string, unknown> = { ...parse(rest, false), leaseId };
    const config = this.configured(), a = await this.access(request, memberId, environmentId);
    const runtimeId = body.runtimeId as string, generation = body.generation as number;
    const saved = await this.repository.renewal(a, await this.intent(a, "renew", body), runtimeId, generation, leaseId, config.signingKey.keyId);
    const expected: ConnectorAuthorizationBinding = { purpose: "renew", memberId, environmentId, runtimeId, generation,
      connectorId: saved.authority.connectorId, origin: saved.authority.origin, policyVersion: saved.authority.policyVersion, leaseId };
    if (!readConnectorAuthorizationClaims(saved.claims, expected, this.now())) throw conflict();
    const ticket = await createConnectorAuthorizationSigner(config.signingKey)(saved.claims, expected, this.now);
    if (!ticket) throw unavailable();
    await this.repository.assertCurrent({ ...a, nowMs: this.now() }, runtimeId, generation);
    if (!readConnectorAuthorizationClaims(saved.claims, expected, this.now())) throw conflict();
    return { ticket };
  }

  /** Bearer capability authentication, never ambient browser authentication.
   * The native connector must still pair locally and bind this result to its
   * own live channel. A browser-supplied acknowledgement grants nothing.
   */
  async consume(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRequest();
    const body = value as Record<string, unknown>;
    if (Object.keys(body).sort().join(",") !== "consumerId,ticket,ticketId"
      || typeof body.ticket !== "string" || body.ticket.length > 8192
      || typeof body.ticketId !== "string" || !identifier.test(body.ticketId)
      || typeof body.consumerId !== "string" || !identifier.test(body.consumerId)) throw invalidRequest();
    const config = this.configured();
    if (!config.verificationKeys?.length || config.verificationKeys.length > 2) throw unavailable();
    const saved = await this.repository.ticket(body.ticketId);
    const denied = () => new AppError("CONNECTOR_TICKET_INVALID", "Invalid connector ticket", 403);
    if (!saved || saved.claims.origin !== config.origin || saved.claims.policyVersion !== config.policyVersion) throw denied();
    const { version: _version, ticketId: _id, issuedAtMs: _issued, expiresAtMs: _expires, ...binding } = saved.claims;
    const claims = await createConnectorAuthorizationVerifier(config.verificationKeys.filter((k) => k.keyId === saved.keyId))
      (body.ticket, binding, this.now);
    const expected = readConnectorAuthorizationClaims(saved.claims, binding, this.now());
    if (!claims || !expected || JSON.stringify(claims) !== JSON.stringify(expected)) throw denied();
    const access = await this.repository.accessForTicket(claims, this.now());
    const lease = await this.repository.consume(access, claims, body.consumerId);
    await this.repository.assertCurrent({ ...access, nowMs: this.now() }, claims.runtimeId, claims.generation);
    if (this.now() >= lease.expiresAtMs) throw conflict();
    return { lease };
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

function invalidRequest() { return new AppError("CONNECTOR_AUTHORIZATION_INVALID", "Invalid connector authorization request", 400); }
