import { AppError } from "../http";
import { canonicalEmail } from "../identity/email";
import { normalizeInvitationCode } from "../invitations/types";
import type { Member } from "../members/types";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./hash";
import { formatRecoveryCode, generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode, RECOVERY_CODE_TTL_MS } from "./recovery-code";
import { RegistrationInvitationConflictError, type PasswordRepositoryPort } from "./repository";

const encoder = new TextEncoder();
const HOUR_MS = 60 * 60 * 1_000;

export interface PasswordAuthServiceOptions {
  id?: () => string;
  auditId?: () => string;
  now?: () => Date;
  registrationLimit?: number;
  registrationFailureLimit?: number;
  recoveryLimit?: number;
  recoveryTtlMs?: number;
  loginFailureThreshold?: number;
  lockMs?: number;
}

/**
 * Invitation-only password registration, password login and binding-based
 * password reset.
 *
 * Registration requires an unused invitation code, and the member insert and
 * the code claim happen in one D1 batch: a failed registration never spends the
 * code and concurrent registrations for the same code create at most one
 * member. Registration still rejects any email already owned by a member
 * (including a GitHub-only member), so it can never claim an existing account.
 *
 * Password login is limited to five failures per account; the account then
 * locks for fifteen minutes.
 *
 * A forgotten password is replaced only by a short-lived, single-use recovery
 * code issued by an administrator for that member. Registration invitation
 * codes are provenance and are never accepted as recovery credentials. Unknown
 * email, disabled member, expired/reused code and a wrong code all return the
 * same failure, so an attacker who only knows the email cannot replace it.
 */
export class PasswordAuthService {
  private readonly id: () => string;
  private readonly auditId: () => string;
  private readonly now: () => Date;
  private readonly registrationLimit: number;
  private readonly registrationFailureLimit: number;
  private readonly recoveryLimit: number;
  private readonly recoveryTtlMs: number;
  private readonly loginFailureThreshold: number;
  private readonly lockMs: number;

  constructor(
    private readonly repository: PasswordRepositoryPort,
    options: PasswordAuthServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.auditId = options.auditId || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.registrationLimit = options.registrationLimit ?? 5;
    this.registrationFailureLimit = options.registrationFailureLimit ?? 20;
    this.recoveryLimit = options.recoveryLimit ?? 10;
    this.recoveryTtlMs = options.recoveryTtlMs ?? RECOVERY_CODE_TTL_MS;
    this.loginFailureThreshold = options.loginFailureThreshold ?? 5;
    this.lockMs = options.lockMs ?? 15 * 60 * 1_000;
  }

  async register(input: { email: string; password: string; invitationCode?: string | null; ip: string }): Promise<{ member: Member }> {
    const email = canonicalEmail(input.email);
    if (!email || !this.passwordAllowed(input.password)) {
      throw new AppError("PASSWORD_POLICY_INVALID", "Enter a valid email and a password of 12-128 characters", 400);
    }
    const invitationCode = this.requireRegistrationInvitation(input.invitationCode);
    const now = this.currentTime();
    const ipHash = await sha256Hex(input.ip || "unknown");
    const since = new Date(now.getTime() - HOUR_MS).toISOString();
    const attempts = await this.repository.countRegistrationAttempts(ipHash, since);
    if (attempts >= this.registrationLimit) {
      throw new AppError("REGISTRATION_RATE_LIMITED", "Too many registrations from this address", 429, true);
    }
    const failures = await this.repository.countRegistrationFailures(ipHash, since);
    if (failures >= this.registrationFailureLimit) {
      throw new AppError("REGISTRATION_RATE_LIMITED", "Too many rejected registrations from this address", 429, true);
    }
    if (await this.repository.findByCanonicalEmail(email)) {
      throw new AppError("REGISTRATION_EMAIL_TAKEN", "This email is already registered", 409);
    }

    const id = this.id();
    const createdAt = now.toISOString();
    try {
      const record = await this.repository.insertMember({
        id,
        accessSub: `password:${id}`,
        email,
        role: "contributor",
        status: "active",
        passwordHash: await hashPassword(input.password),
        createdAt,
        updatedAt: createdAt,
        registrationIpHash: ipHash,
      }, invitationCode, {
        id: this.auditId(),
        actorKind: "member",
        actorId: id,
        action: "member.login",
        resourceType: "member",
        resourceId: id,
        metadata: { role: "contributor" },
        createdAt,
      });
      return { member: record.member };
    } catch (error) {
      if (error instanceof RegistrationInvitationConflictError) {
        await this.repository.recordRegistrationFailure(ipHash, createdAt);
        throw new AppError("REGISTRATION_INVITATION_INVALID", "Invitation code is invalid", 400);
      }
      if (error instanceof Error && /members_canonical_email|UNIQUE constraint failed: members\.email/iu.test(error.message)) {
        throw new AppError("REGISTRATION_EMAIL_TAKEN", "This email is already registered", 409);
      }
      throw error;
    }
  }

  async login(input: { email: string; password: string }): Promise<Member> {
    const email = canonicalEmail(input.email);
    if (!email || typeof input.password !== "string" || input.password.length === 0) {
      throw new AppError("PASSWORD_LOGIN_INVALID", "Email or password is invalid", 401);
    }
    const record = await this.repository.findByCanonicalEmail(email);
    const now = this.currentTime();
    const lockedUntil = record?.lockedUntil ? Date.parse(record.lockedUntil) : Number.NaN;
    if (record && Number.isFinite(lockedUntil) && lockedUntil > now.getTime()) {
      throw new AppError("PASSWORD_LOGIN_LOCKED", "Too many sign-in attempts", 429, true, {
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil - now.getTime()) / 1_000)),
      });
    }
    if (!record?.passwordHash) {
      // Burn the same PBKDF2 cost so an unknown email is not visibly faster.
      await hashPassword(input.password);
      throw new AppError("PASSWORD_LOGIN_INVALID", "Email or password is invalid", 401);
    }
    if (!(await verifyPassword(input.password, record.passwordHash))) {
      const failure = await this.repository.recordLoginFailure(
        record.member.id,
        this.loginFailureThreshold,
        new Date(now.getTime() + this.lockMs).toISOString(),
      );
      if (failure.locked) {
        throw new AppError("PASSWORD_LOGIN_LOCKED", "Too many sign-in attempts", 429, true, {
          retryAfterSeconds: Math.ceil(this.lockMs / 1_000),
        });
      }
      throw new AppError("PASSWORD_LOGIN_INVALID", "Email or password is invalid", 401);
    }
    if (record.member.status !== "active") {
      throw new AppError("MEMBER_DISABLED", "Member access is disabled", 403);
    }
    await this.repository.resetLoginFailures(record.member.id);
    return record.member;
  }

  /** Issues a 30-minute, single-use recovery code and returns it once. */
  async issueRecoveryCode(actorMemberId: string, memberId: string): Promise<{ code: string; formattedCode: string; expiresAt: string }> {
    const target = await this.repository.findById(memberId);
    if (!target || target.member.status !== "active") {
      throw new AppError("MEMBER_NOT_FOUND", "Member not found", 404);
    }
    const now = this.currentTime();
    const code = generateRecoveryCode();
    const expiresAt = new Date(now.getTime() + this.recoveryTtlMs).toISOString();
    await this.repository.createRecoveryCode({
      id: this.id(),
      memberId,
      codeHash: await hashRecoveryCode(code),
      expiresAt,
      createdByMemberId: actorMemberId,
      createdAt: now.toISOString(),
    }, {
      id: this.auditId(),
      actorKind: "member",
      actorId: actorMemberId,
      action: "member.recovery_code_issued",
      resourceType: "member",
      resourceId: memberId,
      metadata: { expiresAt },
      createdAt: now.toISOString(),
    });
    return { code, formattedCode: formatRecoveryCode(code), expiresAt };
  }

  /** Replaces a password with a one-time recovery code and revokes sessions. */
  async recoverPassword(input: { email: string; password: string; recoveryCode: string; ip: string }): Promise<void> {
    const email = canonicalEmail(input.email);
    const code = normalizeRecoveryCode(input.recoveryCode);
    if (!email) throw new AppError("PASSWORD_RECOVERY_REQUEST_INVALID", "Password recovery request is invalid", 400);
    if (!this.passwordAllowed(input.password)) {
      throw new AppError("PASSWORD_POLICY_INVALID", "Enter a valid password of 12-128 characters", 400);
    }
    const now = this.currentTime();
    const ipHash = await sha256Hex(input.ip || "unknown");
    const attempts = await this.repository.countRecoveryAttempts(ipHash, new Date(now.getTime() - HOUR_MS).toISOString());
    if (attempts >= this.recoveryLimit) {
      throw new AppError("PASSWORD_RECOVERY_RATE_LIMITED", "Too many recovery attempts", 429, true);
    }
    const record = await this.repository.findByCanonicalEmail(email);
    // Always pay the password-hash cost, even for an unknown email or bad code.
    const passwordHash = await hashPassword(input.password);
    if (!record || record.member.status !== "active" || code === null) {
      await this.repository.recordRecoveryAttempt(ipHash, now.toISOString());
      throw new AppError("PASSWORD_RECOVERY_INVALID", "Password recovery could not be completed", 401);
    }
    const consumed = await this.repository.consumeRecoveryCode({
      memberId: record.member.id,
      codeHash: await hashRecoveryCode(code),
      expectedPasswordHash: record.passwordHash,
      passwordHash,
      now: now.toISOString(),
    }, {
      id: this.auditId(),
      actorKind: "member",
      actorId: record.member.id,
      action: "member.password_reset",
      resourceType: "member",
      resourceId: record.member.id,
      metadata: {},
      createdAt: now.toISOString(),
    });
    if (!consumed) {
      await this.repository.recordRecoveryAttempt(ipHash, now.toISOString());
      throw new AppError("PASSWORD_RECOVERY_INVALID", "Password recovery could not be completed", 401);
    }
  }

  /** Changes or sets the password for the authenticated member. Existing
   * password accounts must prove the current password; accounts without a
   * password (e.g. GitHub-only members) set their first one from a live session.
   * Lock counters are cleared and the caller revokes other sessions. */
  async changePassword(input: { memberId: string; currentPassword?: string | null; newPassword: string }): Promise<void> {
    if (!this.passwordAllowed(input.newPassword)) {
      throw new AppError("PASSWORD_POLICY_INVALID", "Enter a valid password of 12-128 characters", 400);
    }
    const record = await this.repository.findById(input.memberId);
    if (!record || record.member.status !== "active") {
      throw new AppError("PASSWORD_CHANGE_INVALID", "Password change could not be completed", 401);
    }
    if (record.passwordHash !== null) {
      if (typeof input.currentPassword !== "string" || input.currentPassword.length === 0
        || !(await verifyPassword(input.currentPassword, record.passwordHash))) {
        throw new AppError("PASSWORD_CHANGE_INVALID", "Current password is invalid", 401);
      }
    }
    const now = this.currentTime();
    const updated = await this.repository.updatePassword(
      record.member.id,
      record.passwordHash,
      await hashPassword(input.newPassword),
      now.toISOString(),
      {
        id: this.auditId(),
        actorKind: "member",
        actorId: record.member.id,
        action: "member.password_reset",
        resourceType: "member",
        resourceId: record.member.id,
        metadata: {},
        createdAt: now.toISOString(),
      },
    );
    if (!updated) throw new AppError("PASSWORD_CHANGE_INVALID", "Password change could not be completed", 409, true);
  }

  private requireRegistrationInvitation(value: unknown): string {
    if (value === undefined || value === null) {
      throw new AppError("REGISTRATION_INVITATION_REQUIRED", "An invitation code is required", 400);
    }
    if (typeof value !== "string") {
      throw new AppError("REGISTRATION_INVITATION_INVALID", "Invitation code is invalid", 400);
    }
    if (value.trim().length === 0) {
      throw new AppError("REGISTRATION_INVITATION_REQUIRED", "An invitation code is required", 400);
    }
    const code = normalizeInvitationCode(value);
    if (code === null) throw new AppError("REGISTRATION_INVITATION_INVALID", "Invitation code is invalid", 400);
    return code;
  }

  private passwordAllowed(password: unknown): boolean {
    return typeof password === "string"
      && password.length >= PASSWORD_MIN_LENGTH
      && password.length <= PASSWORD_MAX_LENGTH
      && password.trim().length > 0;
  }

  private currentTime(): Date {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Password auth clock is invalid");
    return now;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
