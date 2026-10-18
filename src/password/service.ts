import { AppError } from "../http";
import { canonicalEmail } from "../identity/email";
import type { Member } from "../members/types";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./hash";
import type { PasswordRepositoryPort } from "./repository";

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
 * Open self-registration with an email and password, plus password login.
 *
 * Registration rejects any email already owned by a member (including a
 * GitHub-only member), so an unverified public form can never claim an
 * existing account. Password login is limited to five failures per account;
 * the account then locks for fifteen minutes.
 *
 * A forgotten password is replaced directly from the canonical email and a new
 * password. There is no email or recovery-code proof, so anyone who knows a
 * password account's email can replace its password and revoke its sessions.
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
    options: PasswordAuthServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.auditId = options.auditId || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.registrationLimit = options.registrationLimit ?? 5;
    this.loginFailureThreshold = options.loginFailureThreshold ?? 5;
    this.lockMs = options.lockMs ?? 15 * 60 * 1_000;
  }

  async register(input: { email: string; password: string; ip: string }): Promise<{ member: Member }> {
    const email = canonicalEmail(input.email);
    if (!email || !this.passwordAllowed(input.password)) {
      throw new AppError("PASSWORD_POLICY_INVALID", "Enter a valid email and a password of 12-128 characters", 400);
    }
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
      }, {
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

  async resetPassword(input: { email: string; password: string }): Promise<void> {
    const email = canonicalEmail(input.email);
    if (!email) {
      throw new AppError("PASSWORD_RESET_REQUEST_INVALID", "Password reset request is invalid", 400);
    }
    if (!this.passwordAllowed(input.password)) {
      throw new AppError("PASSWORD_POLICY_INVALID", "Enter a valid email and a password of 12-128 characters", 400);
    }
    const now = this.currentTime();
    const record = await this.repository.findByCanonicalEmail(email);
    // Always pay the PBKDF2 cost so an unknown email is not visibly faster.
    const newPasswordHash = await hashPassword(input.password);
    if (!record?.passwordHash) {
      throw new AppError("PASSWORD_RESET_INVALID", "This email is not registered for password sign-in", 401);
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
