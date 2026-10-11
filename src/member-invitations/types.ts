export type MemberInvitationStatus = "pending" | "redeemed" | "revoked";

export interface MemberInvitation {
  id: string;
  /** Canonical (trimmed, lowercased) email the invitation authorizes. */
  email: string;
  /** sha256 hex of the one-time code; the plaintext code is never persisted. */
  codeHash: string;
  status: MemberInvitationStatus;
  attemptCount: number;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  revokedAt: string | null;
}

export interface CreateMemberInvitation {
  id: string;
  email: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
}

/** The persisted attempt counter locks an invitation once it reaches this ceiling. */
export const MAX_CODE_LOGIN_ATTEMPTS = 5;

/** One-time codes are exactly as long as session tokens: 32 random bytes in base64url. */
export const CODE_LENGTH = 43;

export const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
