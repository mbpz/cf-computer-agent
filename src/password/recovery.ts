import { fixedLengthBytesEqual } from "../auth";

const encoder = new TextEncoder();
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const CODE_BYTES = 15;
export const RECOVERY_CODE_LENGTH = 24;

/** 15 random bytes encode to exactly 24 base32 characters. */
export function generateRecoveryCode(): string {
  const random = crypto.getRandomValues(new Uint8Array(CODE_BYTES));
  let value = 0;
  let bits = 0;
  let encoded = "";
  for (const byte of random) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return formatRecoveryCode(encoded);
}

/** Uppercase, strip separators and whitespace, then require the base32 shape. */
export function normalizeRecoveryCode(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const normalized = input.toUpperCase().replace(/[\s-]+/gu, "");
  return normalized.length === RECOVERY_CODE_LENGTH && /^[A-Z2-7]+$/u.test(normalized) ? normalized : undefined;
}

export function formatRecoveryCode(normalized: string): string {
  return normalized.match(/.{1,6}/gu)?.join("-") ?? normalized;
}

export async function hashRecoveryCode(normalized: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(normalized)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function recoveryCodeMatches(storedHash: string, candidateHash: string): boolean {
  return fixedLengthBytesEqual(encoder.encode(storedHash), encoder.encode(candidateHash));
}
