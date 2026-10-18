import { fixedLengthBytesEqual } from "../auth";
import { AppError } from "../http";
import { canonicalEmail } from "../identity/email";
import type { Member } from "../members/types";
import type { EmailLoginRepositoryPort } from "./repository";
import {
  EMAIL_LOGIN_CODE_PATTERN,
  EMAIL_LOGIN_CODE_TTL_MS,
  EMAIL_LOGIN_HOURLY_LIMIT,
  EMAIL_LOGIN_MAX_ATTEMPTS,
  EMAIL_LOGIN_RESEND_INTERVAL_MS,
  type CreateEmailLoginChallenge,
  type EmailLoginMailer,
} from "./types";

const encoder = new TextEncoder();
const HOUR_MS = 60 * 60 * 1_000;

export interface EmailLoginMembersPort {
  findByCanonicalEmail(email: string): Promise<Member | null>;
  isEmailAllowed(email: string): boolean;
  resolveEmailCodeLogin(input: { email: string }): Promise<Member>;
}

export interface EmailLoginInvitationsPort {
  findPendingByEmail(email: string): Promise<{ id: string; email: string; expiresAt: string } | null>;
  redeemForLogin(id: string, email: string): Promise<boolean>;
}

export interface EmailLoginServiceOptions {
  mailer: EmailLoginMailer | undefined;
  /** Verified sender address; email login stays unavailable without it. */
  from: string | undefined;
  /** HMAC pepper for the short numeric code; a database leak alone cannot enumerate it. */
  pepper: string | undefined;
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
  id?: () => string;
  /** Server-side diagnostic; never receives the recipient or plaintext code. */
  onDeliveryFailure?: (diagnostic: { code?: string; name?: string }) => void;
  resendIntervalMs?: number;
  hourlyLimit?: number;
  codeTtlMs?: number;
  maxAttempts?: number;
}

/**
 * Self-service email one-time-code login.
 *
 * Requesting never reveals whether an address is authorized: malformed input is
 * a 400, but an unknown address, an expired invitation and a resend inside the
 * cooldown all resolve as accepted without sending. Only a configured-mailer
 * delivery failure is visible, because the user otherwise waits for a code that
 * will never arrive.
 */
export class EmailLoginService {
  private readonly now: () => Date;
  private readonly randomBytes: (length: number) => Uint8Array;
  private readonly id: () => string;
  private readonly resendIntervalMs: number;
  private readonly hourlyLimit: number;
  private readonly codeTtlMs: number;
  private readonly maxAttempts: number;
  private signingKey?: Promise<CryptoKey>;

  constructor(
    private readonly repository: EmailLoginRepositoryPort,
    private readonly members: EmailLoginMembersPort,
    private readonly invitations: EmailLoginInvitationsPort,
    private readonly options: EmailLoginServiceOptions,
  ) {
    this.now = options.now || (() => new Date());
    this.randomBytes = options.randomBytes || ((length) => crypto.getRandomValues(new Uint8Array(length)));
    this.id = options.id || (() => crypto.randomUUID());
    this.resendIntervalMs = options.resendIntervalMs ?? EMAIL_LOGIN_RESEND_INTERVAL_MS;
    this.hourlyLimit = options.hourlyLimit ?? EMAIL_LOGIN_HOURLY_LIMIT;
    this.codeTtlMs = options.codeTtlMs ?? EMAIL_LOGIN_CODE_TTL_MS;
    this.maxAttempts = options.maxAttempts ?? EMAIL_LOGIN_MAX_ATTEMPTS;
  }

  configured(): boolean {
    return Boolean(this.options.mailer && canonicalEmail(this.options.from) && this.options.pepper);
  }

  async requestCode(emailInput: string): Promise<void> {
    const mailer = this.options.mailer;
    if (!mailer || !this.configured()) throw new AppError("EMAIL_LOGIN_UNAVAILABLE", "Email sign-in is not configured", 503);
    const email = canonicalEmail(emailInput);
    if (!email) throw new AppError("EMAIL_LOGIN_REQUEST_INVALID", "Email login request is invalid", 400);
    const now = this.currentTime();
    if (!(await this.isEligible(email, now))) return;

    const createdAt = now.toISOString();
    const code = this.newCode();
    const challenge: CreateEmailLoginChallenge = {
      id: this.id(),
      email,
      codeHash: await this.codeHash(email, code),
      createdAt,
      expiresAt: new Date(now.getTime() + this.codeTtlMs).toISOString(),
    };
    const inserted = await this.repository.insert(challenge, {
      notBefore: new Date(now.getTime() - this.resendIntervalMs).toISOString(),
      hourlySince: new Date(now.getTime() - HOUR_MS).toISOString(),
      hourlyLimit: this.hourlyLimit,
    });
    if (!inserted) return;

    try {
      await mailer.send({ to: email, code, expiresAt: challenge.expiresAt });
    } catch (error) {
      const providerCode = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
      this.options.onDeliveryFailure?.({ code: providerCode, name: error instanceof Error ? error.name : undefined });
      // A stored challenge that was never delivered must not stay redeemable.
      await this.repository.consume(challenge.id, createdAt, this.maxAttempts);
      // Sender/onboarding problems are configuration, not a transient outage:
      // the page should stop asking the user to retry blindly.
      if (providerCode === "E_SENDER_NOT_VERIFIED"
        || providerCode === "E_SENDER_DOMAIN_NOT_AVAILABLE"
        || providerCode === "E_RECIPIENT_NOT_ALLOWED") {
        throw new AppError("EMAIL_LOGIN_UNAVAILABLE", "Email sign-in is not configured", 503);
      }
      throw error instanceof AppError ? error : new AppError("EMAIL_LOGIN_DELIVERY_FAILED", "The sign-in email could not be sent", 503, true);
    }
  }

  async verifyCode(input: { email: string; code: string }): Promise<Member> {
    if (!this.configured()) throw new AppError("EMAIL_LOGIN_UNAVAILABLE", "Email sign-in is not configured", 503);
    const email = canonicalEmail(input.email);
    if (!email || !EMAIL_LOGIN_CODE_PATTERN.test(input.code)) throw new AppError("EMAIL_LOGIN_REQUEST_INVALID", "Email login request is invalid", 400);
    const challenge = await this.repository.findLatest(email);
    if (!challenge || challenge.consumedAt || challenge.attemptCount >= this.maxAttempts) throw new AppError("EMAIL_LOGIN_INVALID", "Login code is invalid", 401);

    const now = this.currentTime();
    const expiresAt = Date.parse(challenge.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) throw new AppError("EMAIL_LOGIN_INVALID", "Login code is invalid", 401);

    const matches = fixedLengthBytesEqual(
      encoder.encode(challenge.codeHash),
      encoder.encode(await this.codeHash(email, input.code)),
    );
    if (!matches) {
      await this.repository.recordFailedAttempt(challenge.id, this.maxAttempts);
      throw new AppError("EMAIL_LOGIN_INVALID", "Login code is invalid", 401);
    }
    if (!(await this.repository.consume(challenge.id, now.toISOString(), this.maxAttempts))) throw new AppError("EMAIL_LOGIN_INVALID", "Login code is invalid", 401);

    const member = await this.members.findByCanonicalEmail(email);
    if (member) {
      if (member.status !== "active") throw new AppError("MEMBER_DISABLED", "Member access is disabled", 403);
      await this.redeemInvitation(email);
      return member;
    }

    const invitation = await this.pendingInvitation(email, now);
    const allowed = this.members.isEmailAllowed(email);
    if (!invitation && !allowed) throw new AppError("EMAIL_LOGIN_INVALID", "Login code is invalid", 401);
    // An invitation is the sole authorization for a new address: the winner of
    // the conditional pending -> redeemed update creates the member, so a
    // concurrent revoke cannot both redeem and still open an account.
    if (invitation && !(await this.invitations.redeemForLogin(invitation.id, invitation.email))) {
      throw new AppError("EMAIL_LOGIN_INVALID", "Login code is invalid", 401);
    }
    return this.members.resolveEmailCodeLogin({ email });
  }

  private async isEligible(email: string, now: Date): Promise<boolean> {
    const member = await this.members.findByCanonicalEmail(email);
    if (member) return member.status === "active";
    if (this.members.isEmailAllowed(email)) return true;
    return (await this.pendingInvitation(email, now)) !== null;
  }

  private async pendingInvitation(email: string, now: Date): Promise<{ id: string; email: string; expiresAt: string } | null> {
    const invitation = await this.invitations.findPendingByEmail(email);
    if (!invitation) return null;
    const expiresAt = Date.parse(invitation.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now.getTime() ? invitation : null;
  }

  private async redeemInvitation(email: string): Promise<void> {
    const invitation = await this.invitations.findPendingByEmail(email);
    if (invitation) await this.invitations.redeemForLogin(invitation.id, invitation.email);
  }

  private newCode(): string {
    // 0-999999 has a tiny modulo bias; rejecting the top partial range keeps it uniform.
    const range = 900_000;
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % range);
    for (;;) {
      const random = this.randomBytes(4);
      if (!(random instanceof Uint8Array) || random.byteLength !== 4) throw new Error("Email login code generation failed");
      const value = new DataView(random.buffer, random.byteOffset, 4).getUint32(0, false);
      if (value < limit) return String(100_000 + (value % range));
    }
  }

  private async codeHash(email: string, code: string): Promise<string> {
    const pepper = this.options.pepper;
    if (!pepper) throw new Error("Email login pepper is missing");
    const key = await (this.signingKey ??= crypto.subtle.importKey(
      "raw",
      encoder.encode(`email-login:v1:${pepper}`),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ));
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${email}\u0000${code}`)));
    return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  private currentTime(): Date {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Email login clock is invalid");
    return now;
  }
}

