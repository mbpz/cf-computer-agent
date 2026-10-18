/** Six digits keeps the emailed code easy to retype while the HMAC pepper and attempt ceiling bound guessing. */
export const EMAIL_LOGIN_CODE_PATTERN = /^\d{6}$/u;
export const EMAIL_LOGIN_CODE_TTL_MS = 10 * 60 * 1_000;
export const EMAIL_LOGIN_RESEND_INTERVAL_MS = 60 * 1_000;
export const EMAIL_LOGIN_HOURLY_LIMIT = 5;
export const EMAIL_LOGIN_MAX_ATTEMPTS = 5;

export interface EmailLoginChallenge {
  id: string;
  email: string;
  /** HMAC-SHA-256 hex of `email \0 code`; the plaintext code is never persisted. */
  codeHash: string;
  attemptCount: number;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface CreateEmailLoginChallenge {
  id: string;
  email: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
}

/** Sends one sign-in code. Implementations must not log the plaintext code. */
export interface EmailLoginMailer {
  send(input: { to: string; code: string; expiresAt: string }): Promise<void>;
}
