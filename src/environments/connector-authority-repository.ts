import { hasPermission, parsePermissionMask, PERMISSION_BITS } from "../authorization/permission-bitmap";
import { AppError } from "../http";

export interface ConnectorPolicy { origin: string; policyVersion: string; }
export interface ConnectorAuthorityAccess extends ConnectorPolicy {
  memberId: string; environmentId: string; sessionHash: string; nowMs: number;
}
export interface ConnectorAuthority {
  runtimeId: string; generation: number; connectorId: string; origin: string; policyVersion: string; state: "active" | "revoked";
}
interface Head {
  member_id: string; environment_id: string; runtime_id: string; generation: number;
  connector_id: string; origin: string; policy_version: string; state: "active" | "revoked"; session_hash: string;
}
interface Receipt {
  request_hash: string; runtime_id: string; generation: number; key_id: string | null; response_json: string;
}
interface RoleGrant { id: string; allow_bits: string; }
interface Intent { operationId: string; requestHash: string; }

/** Authority is a server-created networking reservation, never a lifecycle report.
 * D1 batches atomically claim an intent and mutate its head. Unsigned receipts
 * survive environment deletion, but every replay checks current ownership/access.
 */
export class ConnectorAuthorityRepository {
  constructor(private readonly db: D1Database) {}

  async current(a: ConnectorAuthorityAccess): Promise<ConnectorAuthority | null> {
    const grant = await this.access(a, true);
    const head = await this.head(a, grant);
    return head ? authority(head) : null;
  }

  async reserve(a: ConnectorAuthorityAccess, intent: Intent, expectedGeneration: number, connectorId: string): Promise<ConnectorAuthority> {
    const grant = await this.access(a, true);
    const claimId = crypto.randomUUID();
    const runtimeId = crypto.randomUUID();
    const guard = this.eligible(a, grant);
    await this.db.batch([
      this.db.prepare(`${guard.sql}
        INSERT INTO connector_authorization_receipts
          (member_id, operation_id, request_hash, kind, environment_id, runtime_id, generation, claim_id, response_json, created_at)
        SELECT e.member_id, ?, ?, 'reserve', e.id, ?, COALESCE(h.generation, 0) + 1, ?,
          json_object('runtimeId', ?, 'generation', COALESCE(h.generation, 0) + 1,
            'connectorId', ?, 'origin', ?, 'policyVersion', ?, 'state', 'active'), ?
        FROM eligible e LEFT JOIN connector_authority_heads h ON h.environment_id = e.id
        WHERE COALESCE(h.generation, 0) = ? AND COALESCE(h.generation, 0) < 9007199254740990
        ON CONFLICT DO NOTHING`).bind(...guard.values, intent.operationId, intent.requestHash, runtimeId, claimId,
        runtimeId, connectorId, a.origin, a.policyVersion, a.nowMs, expectedGeneration),
      this.db.prepare(`INSERT INTO connector_authority_heads
        (environment_id, member_id, runtime_id, generation, connector_id, origin, policy_version, session_hash, state, updated_at)
        SELECT environment_id, member_id, runtime_id, generation,
          json_extract(response_json, '$.connectorId'), json_extract(response_json, '$.origin'),
          json_extract(response_json, '$.policyVersion'), ?, 'active', created_at
        FROM connector_authorization_receipts WHERE claim_id = ? AND kind = 'reserve'
        ON CONFLICT(environment_id) DO UPDATE SET
          member_id = excluded.member_id, runtime_id = excluded.runtime_id, generation = excluded.generation,
          connector_id = excluded.connector_id, origin = excluded.origin, policy_version = excluded.policy_version,
          session_hash = excluded.session_hash, state = 'active', updated_at = excluded.updated_at`).bind(a.sessionHash, claimId),
    ]);
    const receipt = await this.receipt(a, intent);
    return this.assertCurrent(a, receipt.runtime_id, receipt.generation);
  }

  async connect(a: ConnectorAuthorityAccess, intent: Intent, runtimeId: string, generation: number, keyId: string) {
    const grant = await this.access(a, true);
    const guard = this.eligible(a, grant);
    const ticketId = crypto.randomUUID();
    await this.db.prepare(`${guard.sql}
      INSERT INTO connector_authorization_receipts
        (member_id, operation_id, request_hash, kind, environment_id, runtime_id, generation, claim_id, key_id, response_json, created_at)
      SELECT e.member_id, ?, ?, 'connect', e.id, h.runtime_id, h.generation, ?, ?,
        json_object('purpose', 'connect', 'origin', h.origin, 'connectorId', h.connector_id,
          'memberId', e.member_id, 'environmentId', e.id, 'runtimeId', h.runtime_id,
          'generation', h.generation, 'policyVersion', h.policy_version, 'leaseId', NULL,
          'version', 1, 'ticketId', ?, 'issuedAtMs', ?,
          'expiresAtMs', MIN(? + 60000, CAST(strftime('%s', e.expires_at) AS INTEGER) * 1000)), ?
      FROM eligible e JOIN connector_authority_heads h ON h.environment_id = e.id AND h.member_id = e.member_id
      WHERE h.runtime_id = ? AND h.generation = ? AND h.session_hash = ? AND h.state = 'active'
        AND h.origin = ? AND h.policy_version = ?
        AND CAST(strftime('%s', e.expires_at) AS INTEGER) * 1000 > ?
      ON CONFLICT DO NOTHING`).bind(...guard.values, intent.operationId, intent.requestHash, crypto.randomUUID(), keyId,
      ticketId, a.nowMs, a.nowMs, a.nowMs, runtimeId, generation, a.sessionHash, a.origin, a.policyVersion, a.nowMs).run();
    const receipt = await this.receipt(a, intent);
    const current = await this.assertCurrent(a, runtimeId, generation);
    if (receipt.key_id !== keyId || receipt.runtime_id !== runtimeId || receipt.generation !== generation) throw conflict();
    return { claims: JSON.parse(receipt.response_json) as unknown, authority: current };
  }

  async revoke(a: ConnectorAuthorityAccess, intent: Intent, runtimeId: string, generation: number): Promise<ConnectorAuthority> {
    await this.access(a, false);
    const guard = this.eligible(a, undefined, false);
    const claimId = crypto.randomUUID();
    await this.db.batch([
      this.db.prepare(`${guard.sql}
        INSERT INTO connector_authorization_receipts
          (member_id, operation_id, request_hash, kind, environment_id, runtime_id, generation, claim_id, response_json, created_at)
        SELECT e.member_id, ?, ?, 'revoke', e.id, h.runtime_id, h.generation, ?,
          json_object('runtimeId', h.runtime_id, 'generation', h.generation, 'connectorId', h.connector_id,
            'origin', h.origin, 'policyVersion', h.policy_version, 'state', 'revoked'), ?
        FROM eligible e JOIN connector_authority_heads h ON h.environment_id = e.id AND h.member_id = e.member_id
        WHERE h.runtime_id = ? AND h.generation = ? AND h.state = 'active'
        ON CONFLICT DO NOTHING`).bind(...guard.values, intent.operationId, intent.requestHash, claimId, a.nowMs, runtimeId, generation),
      this.db.prepare(`UPDATE connector_authority_heads SET state = 'revoked', updated_at = ?
        WHERE environment_id = ? AND member_id = ? AND runtime_id = ? AND generation = ?
          AND EXISTS (SELECT 1 FROM connector_authorization_receipts WHERE claim_id = ? AND kind = 'revoke')`)
        .bind(a.nowMs, a.environmentId, a.memberId, runtimeId, generation, claimId),
    ]);
    await this.access(a, false);
    return JSON.parse((await this.receipt(a, intent)).response_json) as ConnectorAuthority;
  }

  async assertCurrent(a: ConnectorAuthorityAccess, runtimeId: string, generation: number): Promise<ConnectorAuthority> {
    const grant = await this.access(a, true);
    const h = await this.head(a, grant);
    if (!h || h.state !== "active" || h.runtime_id !== runtimeId || h.generation !== generation
      || h.session_hash !== a.sessionHash || h.origin !== a.origin || h.policy_version !== a.policyVersion) throw conflict();
    return authority(h);
  }

  private async receipt(a: ConnectorAuthorityAccess, intent: Intent): Promise<Receipt> {
    const row = await this.db.prepare(`SELECT request_hash, runtime_id, generation, key_id, response_json
      FROM connector_authorization_receipts WHERE member_id = ? AND operation_id = ?`)
      .bind(a.memberId, intent.operationId).first<Receipt>();
    if (!row || row.request_hash !== intent.requestHash) throw conflict();
    return row;
  }

  private async head(a: ConnectorAuthorityAccess, grant: RoleGrant | undefined): Promise<Head | null> {
    const guard = this.eligible(a, grant);
    return this.db.prepare(`${guard.sql} SELECT h.* FROM connector_authority_heads h
      JOIN eligible e ON e.id = h.environment_id AND e.member_id = h.member_id`).bind(...guard.values).first<Head>();
  }

  private async access(a: ConnectorAuthorityAccess, needsPolicy: boolean): Promise<RoleGrant | undefined> {
    if (!await this.db.prepare("SELECT id FROM browser_environments WHERE id = ? AND member_id = ?")
      .bind(a.environmentId, a.memberId).first()) throw new AppError("ENVIRONMENT_NOT_FOUND", "Environment not found", 404);
    if (!await this.db.prepare(`SELECT s.member_id FROM auth_sessions s JOIN members m ON m.id = s.member_id
      WHERE s.token_hash = ? AND s.member_id = ? AND s.expires_at > ? AND m.status = 'active'`)
      .bind(a.sessionHash, a.memberId, new Date(a.nowMs).toISOString()).first()) throw new AppError("AUTH_REQUIRED", "Authentication required", 401);
    if (!needsPolicy) return undefined;
    const rows = await this.db.prepare(`SELECT r.id, r.allow_bits FROM roles r
      JOIN role_members rm ON rm.role_id = r.id WHERE rm.member_id = ? AND r.status = 'active'`)
      .bind(a.memberId).all<RoleGrant>();
    const grant = rows.results.find((r) => hasPermission(parsePermissionMask(r.allow_bits), PERMISSION_BITS["workspace.vm"]));
    if (!grant) throw new AppError("FORBIDDEN", "VM permission required", 403);
    if (!await this.db.prepare(`SELECT singleton FROM connector_authorization_policy
      WHERE singleton = 1 AND enabled = 1 AND origin = ? AND policy_version = ?`)
      .bind(a.origin, a.policyVersion).first()) throw unavailable();
    return grant;
  }

  private eligible(a: ConnectorAuthorityAccess, grant: RoleGrant | undefined, needsPolicy = true) {
    // The role row used in JS bitmask evaluation must still be identical at the
    // write's linearization point. Never authorize an insert using a stale mask.
    const sql = `WITH eligible AS (
      SELECT e.id, e.member_id, s.expires_at FROM browser_environments e
      JOIN members m ON m.id = e.member_id JOIN auth_sessions s ON s.member_id = m.id
      WHERE e.id = ? AND e.member_id = ? AND m.status = 'active' AND s.token_hash = ? AND s.expires_at > ?
      ${needsPolicy ? `AND EXISTS (SELECT 1 FROM roles r JOIN role_members rm ON rm.role_id = r.id
        WHERE rm.member_id = e.member_id AND r.id = ? AND r.allow_bits = ? AND r.status = 'active')
        AND EXISTS (SELECT 1 FROM connector_authorization_policy p
        WHERE p.singleton = 1 AND p.enabled = 1 AND p.origin = ? AND p.policy_version = ?)` : ""}
    )`;
    const values = [a.environmentId, a.memberId, a.sessionHash, new Date(a.nowMs).toISOString(),
      ...(needsPolicy ? [grant?.id ?? "", grant?.allow_bits ?? "", a.origin, a.policyVersion] : [])];
    return { sql, values };
  }
}

function authority(h: Head): ConnectorAuthority {
  return { runtimeId: h.runtime_id, generation: h.generation, connectorId: h.connector_id,
    origin: h.origin, policyVersion: h.policy_version, state: h.state };
}
export function connectorAuthorizationConflict(): AppError { return conflict(); }
function conflict() { return new AppError("CONNECTOR_AUTHORIZATION_CONFLICT", "Authorization changed or operation conflicts", 409); }
export function connectorAuthorizationUnavailable(): AppError { return unavailable(); }
function unavailable() { return new AppError("CONNECTOR_AUTHORIZATION_UNAVAILABLE", "Connector authorization is not configured", 503); }
