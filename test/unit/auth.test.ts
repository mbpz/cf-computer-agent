import { describe, expect, it } from "vitest";
import { verifyAutomationToken } from "../../src/auth";

const request = (token?: string) => new Request("https://example.test/api/health", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe("verifyAutomationToken", () => {
  it("accepts the configured token", async () => {
    await expect(verifyAutomationToken(request("secret"), {
      APP_TOKEN: "secret",
    })).resolves.toBeUndefined();
  });

  it("rejects missing and incorrect credentials", async () => {
    const env = { APP_TOKEN: "secret" };
    await expect(verifyAutomationToken(request(), env)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(verifyAutomationToken(request("wrong"), env)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("fails closed when the secret is missing", async () => {
    await expect(verifyAutomationToken(request(), {})).rejects.toMatchObject({ code: "AUTH_MISCONFIGURED" });
  });
});
