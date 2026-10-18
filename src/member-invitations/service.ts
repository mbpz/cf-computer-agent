import { AppError } from "../http";
import { canonicalEmail } from "../identity/email";
import type { MemberInvitationsRepositoryPort } from "./repository";
import type { MemberInvitation } from "./types";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1_000;

export interface MemberInvitationsServiceOptions {
  id?: () => string;
  auditId?: () => string;
  now?: () => Date;
}

/**
 * Email authorization grants.
 *
 * The invitation no longer carries a code: redeeming it happens on the first
 * successful emailed sign-in for the invited address. The row still enforces a
 * single pending grant per email, a 24-hour window and administrator-only issue
 * and revoke operations.
 */
export class MemberInvitationsService {
  private readonly id: () => string;
  private readonly auditId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly repository: MemberInvitationsRepositoryPort,
    options: MemberInvitationsServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.auditId = options.auditId || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async issue(actorMemberId: string, input: { email: string }): Promise<MemberInvitation> {
    const email = canonicalEmail(input.email);
    if (!email) throw invalidInvitationRequest();
    if (await this.repository.hasActiveAdminMember(email)) throw adminEmailRefused();
    const now = this.currentTime();
    const id = this.id();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
    const invitation = await this.repository.insert(
      { id, email, createdAt, expiresAt },
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
    return invitation;
  }

  async findPendingByEmail(input: string): Promise<MemberInvitation | null> {
    const email = canonicalEmail(input);
    return email ? this.repository.findPendingByEmail(email) : null;
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
   * Flips the grant on the first successful emailed sign-in. The conditional
   * update makes a concurrent second redemption a no-op, and `member.code_login`
   * records the email that actually exercised the grant.
   */
  async redeemForLogin(id: string, inputEmail: string): Promise<boolean> {
    const email = canonicalEmail(inputEmail);
    if (!email) return false;
    const now = this.currentTime().toISOString();
    return this.repository.redeem(id, now, {
      id: this.auditId(),
      // The member row may not exist yet for a first redemption; the invitation
      // itself is the authorization, so this audit has no actor.
      actorKind: "member",
      actorId: null,
      action: "member.code_login",
      resourceType: "member_invitation",
      resourceId: id,
      metadata: { email },
      createdAt: now,
    });
  }

  private currentTime(): Date {
    const now = this.now();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Login invitation clock is invalid");
    return now;
  }
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
