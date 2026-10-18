import type { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import type { CreateMemberInvitation, MemberInvitation } from "./types";

/**
 * Persistence for email authorization grants.
 *
 * Every mutating method pairs its conditional single-row write with the audit
 * statement from `AuditRepository.prepareChangedRowAudit`, which only inserts
 * when the preceding statement changed exactly one row: a losing conditional
 * write must never produce a success event.
 */
export interface MemberInvitationsRepositoryPort {
  findById(id: string): Promise<MemberInvitation | null>;
  findPendingByEmail(email: string): Promise<MemberInvitation | null>;
  list(): Promise<MemberInvitation[]>;
  /** Active administrators may not be handed an invitation. */
  hasActiveAdminMember(email: string): Promise<boolean>;
  /** Conditional insert: null when a pending invitation already exists. */
  insert(invitation: CreateMemberInvitation, audit: CreateAuditEvent): Promise<MemberInvitation | null>;
  /** Conditional pending -> revoked: null when the invitation is not pending. */
  revoke(id: string, revokedAt: string, audit: CreateAuditEvent): Promise<MemberInvitation | null>;
  /** Conditional pending -> redeemed within expiry. */
  redeem(id: string, now: string, audit: CreateAuditEvent): Promise<boolean>;
}

type InvitationRow = {
  id: string;
  email: string;
  status: MemberInvitation["status"];
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  revoked_at: string | null;
};

export class MemberInvitationsRepository implements MemberInvitationsRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit?: AuditRepository) {}

  async findById(id: string): Promise<MemberInvitation | null> {
    const row = await this.db.prepare(`${invitationSelect} WHERE id = ?`).bind(id).first<InvitationRow>();
    return row === null ? null : mapInvitationRow(row);
  }

  async findPendingByEmail(email: string): Promise<MemberInvitation | null> {
    const row = await this.db.prepare(`${invitationSelect} WHERE email = ? AND status = 'pending'`)
      .bind(email).first<InvitationRow>();
    return row === null ? null : mapInvitationRow(row);
  }

  async list(): Promise<MemberInvitation[]> {
    const rows = await this.db.prepare(`${invitationSelect} ORDER BY created_at DESC, id DESC`).all<InvitationRow>();
    return rows.results.map(mapInvitationRow);
  }

  async hasActiveAdminMember(email: string): Promise<boolean> {
    return Boolean(await this.db.prepare(
      "SELECT 1 AS present FROM members WHERE LOWER(TRIM(email)) = ? AND role = 'admin' AND status = 'active' LIMIT 1",
    ).bind(email).first());
  }

  async insert(invitation: CreateMemberInvitation, audit: CreateAuditEvent): Promise<MemberInvitation | null> {
    assertInvitationAudit("member.invitation_issued", invitation.id, audit);
    let results: D1Result[];
    try {
      results = await this.writeWithAudit(this.db.prepare(
        `INSERT INTO member_login_invitations (id, email, status, created_at, expires_at)
         SELECT ?, ?, 'pending', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM member_login_invitations WHERE email = ? AND status = 'pending')`,
      ).bind(invitation.id, invitation.email, invitation.createdAt, invitation.expiresAt, invitation.email), audit);
    } catch (error) {
      // The conditional insert already refuses a second pending row; a racing
      // writer can still reach the partial unique index first.
      if (error instanceof Error && /UNIQUE constraint failed: member_login_invitations/iu.test(error.message)) return null;
      throw error;
    }
    if (results[0]?.meta.changes !== 1) return null;
    return { ...invitation, status: "pending", redeemedAt: null, revokedAt: null };
  }

  async revoke(id: string, revokedAt: string, audit: CreateAuditEvent): Promise<MemberInvitation | null> {
    assertInvitationAudit("member.invitation_revoked", id, audit);
    const results = await this.writeWithAudit(this.db.prepare(
      "UPDATE member_login_invitations SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(revokedAt, id), audit);
    if (results[0]?.meta.changes !== 1) return null;
    return this.findById(id);
  }

  async redeem(id: string, now: string, audit: CreateAuditEvent): Promise<boolean> {
    assertInvitationAudit("member.code_login", id, audit);
    const results = await this.writeWithAudit(this.db.prepare(
      `UPDATE member_login_invitations SET status = 'redeemed', redeemed_at = ?
       WHERE id = ? AND status = 'pending' AND expires_at > ?`,
    ).bind(now, id, now), audit);
    return results[0]?.meta.changes === 1;
  }

  private async writeWithAudit(statement: D1PreparedStatement, audit: CreateAuditEvent): Promise<D1Result[]> {
    if (!this.audit) return this.db.batch([statement]);
    const results = await this.db.batch([statement, this.audit.prepareChangedRowAudit(audit)]);
    // A losing conditional write must leave no audited state change behind.
    if (results[0]?.meta.changes === 1 && results[1]?.meta.changes !== 1) {
      throw new Error("Member invitation audit did not persist");
    }
    return results;
  }
}

const invitationSelect = "SELECT id, email, status, created_at, expires_at, redeemed_at, revoked_at FROM member_login_invitations";

function mapInvitationRow(row: InvitationRow): MemberInvitation {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    revokedAt: row.revoked_at,
  };
}

function assertInvitationAudit(
  action: "member.invitation_issued" | "member.invitation_revoked" | "member.code_login",
  resourceId: string,
  audit: CreateAuditEvent,
): void {
  if (audit.action !== action || audit.resourceType !== "member_invitation" || audit.resourceId !== resourceId) {
    throw new TypeError("Invitation audit binding is invalid");
  }
}
