// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatRecoveryCode, generateRecoveryCode, hashRecoveryCode, normalizeRecoveryCode, recoveryCodeMatches } from "../../src/password/recovery";

describe("recovery codes", () => {
  it("generates a 24-character base32 code in four groups", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z2-7]{6}-[A-Z2-7]{6}-[A-Z2-7]{6}-[A-Z2-7]{6}$/u);
    expect(normalizeRecoveryCode(code)).toHaveLength(24);
    expect(generateRecoveryCode()).not.toBe(code);
  });

  it("normalizes hyphens, whitespace and case and rejects invalid shapes", () => {
    const code = "ABC234-DEF567-GHI234-JKL567";
    expect(normalizeRecoveryCode(" abc234 def567-ghi234 jkl567 ")).toBe("ABC234DEF567GHI234JKL567");
    expect(formatRecoveryCode("ABC234DEF567GHI234JKL567")).toBe(code);
    for (const invalid of ["", "short", "ABC234-DEF567-GHI234-JKL56", "ABC234-DEF567-GHI234-JKL568", "ABC234-DEF567-GHI234-JKL56!"]) {
      expect(normalizeRecoveryCode(invalid), invalid).toBeUndefined();
    }
  });

  it("hashes and compares the normalized code", async () => {
    const normalized = normalizeRecoveryCode("ABC234-DEF567-GHI234-JKL567")!;
    const hash = await hashRecoveryCode(normalized);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(recoveryCodeMatches(hash, await hashRecoveryCode(normalized))).toBe(true);
    expect(recoveryCodeMatches(hash, await hashRecoveryCode("ZZZZZZZZZZZZZZZZZZZZZZZZ"))).toBe(false);
  });
});
