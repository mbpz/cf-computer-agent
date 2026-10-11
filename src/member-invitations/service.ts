import { fixedLengthBytesEqual } from "../auth";
import { AppError } from "../http";
import { canonicalEmail } from "../identity/email";
import type { MembersService } from "../members/service";
import type { Member } from "../members/types";
import type { MemberInvitationsRepositoryPort } from "./repository";
import { CODE_LENGTH, CODE_PATTERN, MAX_CODE_LOGIN_ATTEMPTS, type MemberInvitation } from "./types";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1_000;
const CODE_BYTES = 32;
const encoder = new TextEncoder();

export interface MemberInvitationsServiceOptions {
  id?: () => string;
  auditId?: () => string;
  now?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
}

export interface IssuedMemberInvitation {
  invitation: MemberInvitation;
  /** Plaintext one-time code: returned exactly once here and never persisted. */
  code: string;
}

/**
 * Admin-issued one-time login codes.
 *
 * Issuing stores only the sha256 hex of the code; redemption compares it in
 * constant time, keeps a persisted attempt counter and flips the invitation
 * with a conditional UPDATE so two simultaneous redemptions cannot both
 * succeed. Failure detail never reaches the client: every verification
 * failure is CODE_LOGIN_INVALID.
 */
export class MemberInvitationsService {
  private readonly id: () => string;
  private readonly auditId: () => string;
  private readonly now: () => Date;
  private readonly randomBytes: (length: number) => Uint8Array;

  constructor(
    private readonly repository: MemberInvitationsRepositoryPort,
    private readonly members: Pick<MembersService, "resolveCodeLogin">,
    options: MemberInvitationsServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.auditId = options.auditId || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.randomBytes = options.randomBytes || ((length) => crypto.getRandomValues(new Uint8Array(length)));
  }

  async issue(actorMemberId: string, input: { email: string }): Promise<IssuedMemberInvitation> {
    const email = canonicalEmail(input.email);
    if (!email) throw invalidInvitationRequest();
    if (await this.repository.hasActiveAdminMember(email)) throw adminEmailRefused();
    const now = this.currentTime();
    const id = this.id();
    const code = this.newCode();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
    const invitation = await this.repository.insert(
      { id, email, codeHash: await sha256Hex(code), createdAt, expiresAt },
      {
        id: this.auditId(),
        actorKind: "member",
        actorId: actorMemberId,
        action: "member.invitation_issued",
        resourceType: "member_invitation",
        resourceId: id,
        metadata: { email, expiresAt },
        createdAt,
      },
    );
    if (!invitation) throw invitationAlreadyPending();
    return { invitation, code };
  }

  async list(): Promise<MemberInvitation[]> {
    return this.repository.list();
  }

  async revoke(actorMemberId: string, id: string): Promise<MemberInvitation> {
    const current = await this.repository.findById(id);
    if (!current) throw invitationNotFound();
    const revokedAt = this.currentTime().toISOString();
    const revoked = await this.repository.revoke(id, revokedAt, {
      id: this.auditId(),
      actorKind: "member",
      actorId: actorMemberId,
      action: "member.invitation_revoked",
      resourceType: "member_invitation",
      resourceId: id,
      metadata: { email: current.email },
      createdAt: revokedAt,
    });
    if (!revoked) throw invitationNotPending();
    return revoked;
  }

  /**
   * Redeems a one-time code and returns the member to open a session for.
   *
   * The invitation is flipped first: only the single winner of the conditional
   * UPDATE resolves or creates the member, so two simultaneous redemptions
   * cannot mint two member rows for one email. The member then comes from the
   * shared GitHub-path resolution (existing match by canonical email, else a
   * fresh active contributor).
   */
  async redeem(input: { email: string; code: string }): Promise<Member> {
    const email = canonicalEmail(input.email);
    if (!email || !CODE_PATTERN.test(input.code)) throw codeLoginInvalid();
    const invitation = await this.repository.findPendingByEmail(email);
    if (!invitation) throw codeLoginInvalid();
    if (invitation.attemptCount >= MAX_CODE_LOGIN_ATTEMPTS) throw codeLoginInvalid();
    const now = this.currentTime();
    const matches = fixedLengthBytesEqual(
      encoder.encode(invitation.codeHash),
      encoder.encode(await sha256Hex(input.code)),
    );
    if (!matches) {
      await this.recordFailedAttempt(invitation.id, email, "code_mismatch", now.toISOString());
      throw codeLoginInvalid();
    }
    const expiresAt = Date.parse(invitation.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
      await this.recordFailedAttempt(invitation.id, email, "expired", now.toISOString());
      throw codeLoginInvalid();
    }
    const redeemed = await this.repository.redeem(invitation.id, now.toISOString(), MAX_CODE_LOGIN_ATTEMPTS, {
      id: this.auditId(),
      // The login is authenticated by the invitation itself; the member row
      // does not exist yet for a first redemption.
      actorKind: "member",
      actorId: null,
      action: "member.code_login",
      resourceType: "member_invitation",
      resourceId: invitation.id,
      metadata: { email },
      createdAt: now.toISOString(),
    });
    if (!redeemed) throw codeLoginInvalid();
    return this.members.resolveCodeLogin({ email });
  }

  private async recordFailedAttempt(
    id: string,
    email: string,
    reason: "code_mismatch" | "expired",
    createdAt: string,
  ): Promise<void> {
    await this.repository.recordFailedAttempt(id, MAX_CODE_LOGIN_ATTEMPTS, {
      id: this.auditId(),
      actorKind: "member",
      actorId: null,
      action: "member.code_login_denied",
      resourceType: "member_invitation",
      resourceId: id,
      metadata: { email, reason },
      createdAt,
    });
  }

  private newCode(): string {
    const bytes = this.randomBytes(CODE_BYTES);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== CODE_BYTES) {
      throw new Error("Login code generation failed");
    }
    const code = base64Url(bytes);
    if (code.length !== CODE_LENGTH || !CODE_PATTERN.test(code)) throw new Error("Login code generation failed");
    return code;
  }

  private currentTime(): Date {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Login invitation clock is invalid");
    return now;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function invalidInvitationRequest(): AppError {
  return new AppError("INVITATION_REQUEST_INVALID", "Invitation request is invalid", 400);
}

function invitationAlreadyPending(): AppError {
  return new AppError("INVITATION_ALREADY_PENDING", "An invitation is already pending for this email", 409);
}

function adminEmailRefused(): AppError {
  return new AppError("INVITATION_ADMIN_EMAIL", "An active administrator already owns this email", 409);
}

function invitationNotFound(): AppError {
  return new AppError("INVITATION_NOT_FOUND", "Invitation not found", 404);
}

function invitationNotPending(): AppError {
  return new AppError("INVITATION_NOT_PENDING", "Invitation is not pending", 409);
}

function codeLoginInvalid(): AppError {
  return new AppError("CODE_LOGIN_INVALID", "Login code is invalid", 401);
}
