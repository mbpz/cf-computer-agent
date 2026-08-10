import { describe, expect, it } from "vitest";
import { authorizeRequest } from "../../src/auth";

const request = (token?: string) => new Request("https://example.test/api/health", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

describe("authorizeRequest", () => {
  it("accepts the configured token", async () => {
    await expect(authorizeRequest(request("secret"), {
      APP_TOKEN: "secret",
      ALLOW_INSECURE_LOCAL: "false",
    })).resolves.toBeUndefined();
  });

  it("rejects missing and incorrect credentials", async () => {
    const env = { APP_TOKEN: "secret", ALLOW_INSECURE_LOCAL: "false" };
    await expect(authorizeRequest(request(), env)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(authorizeRequest(request("wrong"), env)).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("fails closed when the secret is missing", async () => {
    await expect(authorizeRequest(request(), {
      ALLOW_INSECURE_LOCAL: "false",
    })).rejects.toMatchObject({ code: "AUTH_MISCONFIGURED" });
  });

  it("allows an explicit insecure local mode", async () => {
    await expect(authorizeRequest(request(), {
      ALLOW_INSECURE_LOCAL: "true",
    })).resolves.toBeUndefined();
  });
});
