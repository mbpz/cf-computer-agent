import type { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import type { Member, MemberRole, MemberStatus } from "../members/types";

export interface PasswordMemberRecord {
  member: Member;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  recoveryCodeHash: string | null;
  recoveryAttemptCount: number;
  recoveryLockedUntil: string | null;
}

export interface InsertPasswordMember {
  id: string;
  accessSub: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  passwordHash: string;
  recoveryCodeHash: string;
  createdAt: string;
  updatedAt: string;
  registrationIpHash: string;
}

export interface PasswordRepositoryPort {
  findByCanonicalEmail(email: string): Promise<PasswordMemberRecord | null>;
  countRegistrationAttempts(ipHash: string, since: string): Promise<number>;
  insertMember(member: InsertPasswordMember, audit: CreateAuditEvent): Promise<PasswordMemberRecord>;
  recordLoginFailure(id: string, threshold: number, lockedUntil: string): Promise<{ locked: boolean }>;
  resetLoginFailures(id: string): Promise<void>;
  recordRecoveryFailure(id: string, threshold: number, lockedUntil: string): Promise<{ locked: boolean }>;
  /** Conditional single-use reset: rotates the password and recovery code and clears sessions. */
  resetPassword(
    id: string,
    expectedRecoveryHash: string,
    passwordHash: string,
    recoveryCodeHash: string,
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
  recovery_code_hash: string | null;
  recovery_attempt_count: number;
  recovery_locked_until: string | null;
};

export class PasswordRepository implements PasswordRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit: AuditRepository) {}

  async findByCanonicalEmail(email: string): Promise<PasswordMemberRecord | null> {
    const row = await this.db.prepare(
      `${passwordMemberSelect} WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
    ).bind(email).first<PasswordMemberRow>();
    return row === null ? null : mapRecord(row);
  }

  async countRegistrationAttempts(ipHash: string, since: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS total FROM password_registration_attempts WHERE ip_hash = ? AND created_at > ?",
    ).bind(ipHash, since).first<{ total: number }>();
    return row?.total ?? 0;
  }

  async insertMember(member: InsertPasswordMember, audit: CreateAuditEvent): Promise<PasswordMemberRecord> {
    if (audit.action !== "member.login" || audit.resourceId !== member.id || audit.actorId !== member.id) {
      throw new TypeError("Password member audit binding is invalid");
    }
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at, password_hash, recovery_code_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(member.id, member.accessSub, member.email, member.role, member.status, member.createdAt, member.updatedAt, member.passwordHash, member.recoveryCodeHash),
      this.audit.prepareResourceWriteAudit(audit, { table: "members", id: member.id }),
      this.db.prepare(
        "DELETE FROM password_registration_attempts WHERE created_at < ?",
      ).bind(new Date(Date.parse(member.createdAt) - 24 * 60 * 60 * 1_000).toISOString()),
      this.db.prepare(
        "INSERT INTO password_registration_attempts (ip_hash, created_at) VALUES (?, ?)",
      ).bind(member.registrationIpHash, member.createdAt),
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
      throw new Error("Password member registration did not persist");
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

  async recordRecoveryFailure(id: string, threshold: number, lockedUntil: string): Promise<{ locked: boolean }> {
    const row = await this.db.prepare(
      `UPDATE members
       SET recovery_attempt_count = recovery_attempt_count + 1,
           recovery_locked_until = CASE WHEN recovery_attempt_count + 1 >= ? THEN ? ELSE recovery_locked_until END
       WHERE id = ?
       RETURNING recovery_attempt_count, recovery_locked_until`,
    ).bind(threshold, lockedUntil, id).first<{ recovery_attempt_count: number; recovery_locked_until: string | null }>();
    return { locked: Boolean(row?.recovery_locked_until) };
  }

  async resetPassword(
    id: string,
    expectedRecoveryHash: string,
    passwordHash: string,
    recoveryCodeHash: string,
    now: string,
    audit: CreateAuditEvent,
  ): Promise<boolean> {
    if (audit.action !== "member.password_reset" || audit.resourceId !== id || audit.resourceType !== "member") {
      throw new TypeError("Password reset audit binding is invalid");
    }
    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE members
         SET password_hash = ?, recovery_code_hash = ?, recovery_attempt_count = 0,
             recovery_locked_until = NULL, failed_login_count = 0, locked_until = NULL, updated_at = ?
         WHERE id = ? AND recovery_code_hash = ?
           AND (recovery_locked_until IS NULL OR recovery_locked_until <= ?)`,
      ).bind(passwordHash, recoveryCodeHash, now, id, expectedRecoveryHash, now),
      this.audit.prepareChangedRowAudit(audit),
      this.db.prepare(
        `DELETE FROM auth_sessions
         WHERE member_id = ? AND EXISTS (
           SELECT 1 FROM members WHERE id = ? AND recovery_code_hash = ? AND updated_at = ?
         )`,
      ).bind(id, id, recoveryCodeHash, now),
    ]);
    return results[0]?.meta.changes === 1;
  }
}

const passwordMemberSelect = `SELECT id, access_sub, email, role, status, created_at, updated_at, last_seen_at,
  password_hash, failed_login_count, locked_until,
  recovery_code_hash, recovery_attempt_count, recovery_locked_until FROM members`;

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
    recoveryCodeHash: row.recovery_code_hash,
    recoveryAttemptCount: row.recovery_attempt_count,
    recoveryLockedUntil: row.recovery_locked_until,
  };
}
