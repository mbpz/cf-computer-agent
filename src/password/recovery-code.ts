/**
 * One-time password-recovery credentials.
 *
 * These are deliberately independent of registration invitation codes: an
 * invitation proves who may create an account, while a recovery code proves a
 * short-lived, single-use right to replace an existing account password. Codes
 * are stored only as a SHA-256 hash and are shown to an administrator exactly
 * once, at issue time.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 20;
const GROUPS = 5;

export const RECOVERY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{20}$/u;
export const RECOVERY_CODE_TTL_MS = 30 * 60 * 1_000;

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** Accepts grouped or lowercase input; returns the canonical code or null. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/[\s-]/gu, "").toUpperCase();
  return RECOVERY_CODE_PATTERN.test(code) ? code : null;
}

export function formatRecoveryCode(code: string): string {
  if (!RECOVERY_CODE_PATTERN.test(code)) return code;
  return Array.from({ length: GROUPS }, (_, index) => code.slice(index * 4, index * 4 + 4)).join("-");
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
