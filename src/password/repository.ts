import type { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { INVITATION_CODE_PATTERN } from "../invitations/types";
import type { Member, MemberRole, MemberStatus } from "../members/types";

export interface PasswordMemberRecord {
  member: Member;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
}

export interface InsertPasswordMember {
  id: string;
  accessSub: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  registrationIpHash: string;
}

/**
 * The invitation was already used (or otherwise unavailable) when the guarded
 * registration batch ran. D1 reported no member insert and no code claim, so
 * the caller maps this to the single registration-invitation error code.
 */
export class RegistrationInvitationConflictError extends Error {
  constructor() {
    super("Registration invitation is not available");
  }
}

export interface PasswordRepositoryPort {
  findByCanonicalEmail(email: string): Promise<PasswordMemberRecord | null>;
  findById(id: string): Promise<PasswordMemberRecord | null>;
  countRegistrationAttempts(ipHash: string, since: string): Promise<number>;
  /**
   * Inserts the member and claims the invitation code in one D1 batch.
   * Consuming the code and creating the member are both required.
   */
  insertMember(member: InsertPasswordMember, invitationCode: string, audit: CreateAuditEvent): Promise<PasswordMemberRecord>;
  recordLoginFailure(id: string, threshold: number, lockedUntil: string): Promise<{ locked: boolean }>;
  resetLoginFailures(id: string): Promise<void>;
  /** Replaces the password for an authenticated member and clears login locks. */
  updatePassword(
    id: string,
    expectedPasswordHash: string | null,
    passwordHash: string,
    now: string,
    audit: CreateAuditEvent,
  ): Promise<boolean>;
  /** Replaces the password, clears login locks and revokes sessions. */
  resetPassword(
    id: string,
    expectedPasswordHash: string | null,
    passwordHash: string,
    now: string,
    audit: CreateAuditEvent,
  ): Promise<boolean>;
}

type PasswordMemberRow = {
  id: string;
  access_sub: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  password_hash: string | null;
  failed_login_count: number;
  locked_until: string | null;
};

export class PasswordRepository implements PasswordRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit: AuditRepository) {}

  async findByCanonicalEmail(email: string): Promise<PasswordMemberRecord | null> {
    const row = await this.db.prepare(
      `${passwordMemberSelect} WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
    ).bind(email).first<PasswordMemberRow>();
    return row === null ? null : mapRecord(row);
  }

  async findById(id: string): Promise<PasswordMemberRecord | null> {
    const row = await this.db.prepare(
      `${passwordMemberSelect} WHERE id = ? LIMIT 1`,
    ).bind(id).first<PasswordMemberRow>();
    return row === null ? null : mapRecord(row);
  }

  async countRegistrationAttempts(ipHash: string, since: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS total FROM password_registration_attempts WHERE ip_hash = ? AND created_at > ?",
    ).bind(ipHash, since).first<{ total: number }>();
    return row?.total ?? 0;
  }

  async insertMember(member: InsertPasswordMember, invitationCode: string, audit: CreateAuditEvent): Promise<PasswordMemberRecord> {
    if (audit.action !== "member.login" || audit.resourceId !== member.id || audit.actorId !== member.id) {
      throw new TypeError("Password member audit binding is invalid");
    }
    if (!INVITATION_CODE_PATTERN.test(invitationCode)) {
      throw new TypeError("Password member invitation binding is invalid");
    }
    // The guarded INSERT and the conditional UPDATE both run in one batch:
    // either the member is created and the code is claimed, or neither happens.
    // D1 serializes batches, so the EXISTS guard and the UPDATE see one
    // consistent invitation state even when two registrations race for a code.
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at, password_hash)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM invitations WHERE code = ? AND status = 'unused')`,
      ).bind(
        member.id,
        member.accessSub,
        member.email,
        member.role,
        member.status,
        member.createdAt,
        member.updatedAt,
        member.passwordHash,
        invitationCode,
      ),
      this.audit.prepareResourceWriteAudit(audit, { table: "members", id: member.id }),
      this.db.prepare(
        `UPDATE invitations
         SET status = 'used', bound_member_id = ?, used_at = ?
         WHERE code = ? AND status = 'unused'`,
      ).bind(member.id, member.createdAt, invitationCode),
      this.db.prepare(
        "DELETE FROM password_registration_attempts WHERE created_at < ?",
      ).bind(new Date(Date.parse(member.createdAt) - 24 * 60 * 60 * 1_000).toISOString()),
      this.db.prepare(
        "INSERT INTO password_registration_attempts (ip_hash, created_at) VALUES (?, ?)",
      ).bind(member.registrationIpHash, member.createdAt),
    ]);
    if (results[0]?.meta.changes !== 1 || results[2]?.meta.changes !== 1) {
      // No member row and no audit row were written: the guarded INSERT saw a
      // consumed/missing code, so the invitation was not spent by this attempt.
      throw new RegistrationInvitationConflictError();
    }
    const created = await this.findByCanonicalEmail(member.email);
    if (!created) throw new Error("Password member registration did not persist");
    return created;
  }

  async recordLoginFailure(id: string, threshold: number, lockedUntil: string): Promise<{ locked: boolean }> {
    const row = await this.db.prepare(
      `UPDATE members
       SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN failed_login_count + 1 >= ? THEN ? ELSE locked_until END
       WHERE id = ?
       RETURNING failed_login_count, locked_until`,
    ).bind(threshold, lockedUntil, id).first<{ failed_login_count: number; locked_until: string | null }>();
    return { locked: Boolean(row?.locked_until) };
  }

  async resetLoginFailures(id: string): Promise<void> {
    await this.db.prepare(
      "UPDATE members SET failed_login_count = 0, locked_until = NULL WHERE id = ?",
    ).bind(id).run();
  }

  async updatePassword(
    id: string,
    expectedPasswordHash: string | null,
    passwordHash: string,
    now: string,
    audit: CreateAuditEvent,
  ): Promise<boolean> {
    if (audit.action !== "member.password_reset" || audit.resourceId !== id || audit.resourceType !== "member") {
      throw new TypeError("Password change audit binding is invalid");
    }
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE members
         SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ?
         WHERE id = ? AND password_hash IS ?`,
      ).bind(passwordHash, now, id, expectedPasswordHash),
      this.audit.prepareChangedRowAudit(audit),
    ]);
    return results[0]?.meta.changes === 1;
  }

  async resetPassword(
    id: string,
    expectedPasswordHash: string | null,
    passwordHash: string,
    now: string,
    audit: CreateAuditEvent,
  ): Promise<boolean> {
    if (audit.action !== "member.password_reset" || audit.resourceId !== id || audit.resourceType !== "member") {
      throw new TypeError("Password reset audit binding is invalid");
    }
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE members
         SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ?
         WHERE id = ? AND password_hash IS ?`,
      ).bind(passwordHash, now, id, expectedPasswordHash),
      this.audit.prepareChangedRowAudit(audit),
      this.db.prepare(
        `DELETE FROM auth_sessions
         WHERE member_id = ? AND EXISTS (
           SELECT 1 FROM members WHERE id = ? AND password_hash IS ? AND updated_at = ?
         )`,
      ).bind(id, id, passwordHash, now),
    ]);
    return results[0]?.meta.changes === 1;
  }
}

const passwordMemberSelect = `SELECT id, access_sub, email, role, status, created_at, updated_at, last_seen_at,
  password_hash, failed_login_count, locked_until FROM members`;

function mapRecord(row: PasswordMemberRow): PasswordMemberRecord {
  return {
    member: {
      id: row.id,
      identitySubject: row.access_sub,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSeenAt: row.last_seen_at,
    },
    passwordHash: row.password_hash,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
  };
}
