// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, PASSWORD_ITERATIONS, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "../../src/password/hash";

const PASSWORD = "correct horse battery staple";

describe("password hashing", () => {
  it("stores a versioned PBKDF2 record with a fresh salt", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);
    expect(first).toMatch(new RegExp(`^pbkdf2-sha256\\$${PASSWORD_ITERATIONS}\\$[A-Za-z0-9_-]+\\$[A-Za-z0-9_-]+$`, "u"));
    expect(first).not.toBe(second);
    expect(first).not.toContain(PASSWORD);
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it("verifies only the matching password", async () => {
    const stored = await hashPassword(PASSWORD);
    await expect(verifyPassword(PASSWORD, stored)).resolves.toBe(true);
    await expect(verifyPassword(`${PASSWORD}!`, stored)).resolves.toBe(false);
    await expect(verifyPassword("", stored)).resolves.toBe(false);
  });

  it("fails closed for malformed or unsupported records", async () => {
    for (const stored of [
      "",
      "plain-text",
      "pbkdf2-sha256$0$c2FsdA$aGFzaA",
      "pbkdf2-sha256$100000$not-base64!$aGFzaA",
      "pbkdf2-sha256$100000$c2FsdA$",
      "scrypt$100000$c2FsdA$aGFzaA",
    ]) {
      await expect(verifyPassword(PASSWORD, stored), stored).resolves.toBe(false);
    }
  });
});
