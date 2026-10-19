import { AppError } from "../http";
import { canonicalEmail } from "../identity/email";
import type { InvitationsRepositoryPort } from "../invitations/repository";
import { invitationCodesMatch, normalizeInvitationCode } from "../invitations/types";
import type { Member } from "../members/types";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./hash";
import { RegistrationInvitationConflictError, type PasswordRepositoryPort } from "./repository";

const encoder = new TextEncoder();
const HOUR_MS = 60 * 60 * 1_000;

export interface PasswordAuthServiceOptions {
  id?: () => string;
  auditId?: () => string;
  now?: () => Date;
  registrationLimit?: number;
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
 * A forgotten password is replaced only by presenting the invitation code that
 * created the member (the row whose `bound_member_id` is that member). Unknown
 * email, disabled member, missing binding and mismatched code are the same
 * `PASSWORD_RESET_INVALID` failure, so an attacker who only knows the email
 * cannot replace the password. GitHub/WeChat-only members have no bound code
 * and remain ineligible.
 */
export class PasswordAuthService {
  private readonly id: () => string;
  private readonly auditId: () => string;
  private readonly now: () => Date;
  private readonly registrationLimit: number;
  private readonly loginFailureThreshold: number;
  private readonly lockMs: number;

  constructor(
    private readonly repository: PasswordRepositoryPort,
    private readonly invitations: Pick<InvitationsRepositoryPort, "findBoundByMemberId">,
    options: PasswordAuthServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.auditId = options.auditId || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.registrationLimit = options.registrationLimit ?? 5;
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
    const attempts = await this.repository.countRegistrationAttempts(ipHash, new Date(now.getTime() - HOUR_MS).toISOString());
    if (attempts >= this.registrationLimit) {
      throw new AppError("REGISTRATION_RATE_LIMITED", "Too many registrations from this address", 429, true);
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

  async resetPassword(input: { email: string; password: string; invitationCode?: string | null }): Promise<void> {
    const email = canonicalEmail(input.email);
    if (!email) {
      throw new AppError("PASSWORD_RESET_REQUEST_INVALID", "Password reset request is invalid", 400);
    }
    if (!this.passwordAllowed(input.password)) {
      throw new AppError("PASSWORD_POLICY_INVALID", "Enter a valid email and a password of 12-128 characters", 400);
    }
    const providedCode = typeof input.invitationCode === "string"
      ? normalizeInvitationCode(input.invitationCode)
      : null;
    const now = this.currentTime();
    const record = await this.repository.findByCanonicalEmail(email);
    // Always pay the PBKDF2 cost so an unknown email is not visibly faster.
    const newPasswordHash = await hashPassword(input.password);
    if (!record || record.member.status !== "active" || providedCode === null) {
      throw new AppError("PASSWORD_RESET_INVALID", "Password reset could not be completed", 401);
    }
    // Only the invitation that created this member proves the caller is the
    // same person; there is no email/recovery-code fallback.
    const bound = await this.invitations.findBoundByMemberId(record.member.id);
    if (!bound || !invitationCodesMatch(bound.code, providedCode)) {
      throw new AppError("PASSWORD_RESET_INVALID", "Password reset could not be completed", 401);
    }
    const reset = await this.repository.resetPassword(
      record.member.id,
      record.passwordHash,
      newPasswordHash,
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
    if (!reset) throw new AppError("PASSWORD_RESET_INVALID", "Password reset could not be completed", 401);
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
