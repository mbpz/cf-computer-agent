export type MemberInvitationStatus = "pending" | "redeemed" | "revoked";

/** An invitation is now an authorization grant: the invited address may request emailed sign-in codes. */
export interface MemberInvitation {
  id: string;
  /** Canonical (trimmed, lowercased) email the invitation authorizes. */
  email: string;
  status: MemberInvitationStatus;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
}

export interface CreateMemberInvitation {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}
