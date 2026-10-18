// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiRequestError, type Fetcher } from "../../frontend/lib/api";
import { loginPassword, passwordAuthFailure, registerPassword } from "../../frontend/lib/password-auth-data";

function requester(body: unknown, status = 200) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchStub: Fetcher = (path, init) => {
    calls.push({ path: String(path), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { calls, fetchStub };
}

describe("password auth data", () => {
  it("posts the exact registration and login bodies", async () => {
    for (const [fn, path, status] of [
      [registerPassword, "/auth/register", 201],
      [loginPassword, "/auth/password", 200],
    ] as const) {
      const { calls, fetchStub } = requester({ member: { id: "m1", email: "new@example.test", role: "contributor" } }, status);
      await expect(fn("new@example.test", "correct horse battery staple", fetchStub))
        .resolves.toEqual({ id: "m1", email: "new@example.test", role: "contributor" });
      expect(calls[0]!.path).toBe(path);
      expect(calls[0]!.init?.method).toBe("POST");
      expect(calls[0]!.init?.body).toBe(JSON.stringify({ email: "new@example.test", password: "correct horse battery staple" }));
    }
  });

  it("validates the member envelope and role", async () => {
    for (const role of ["admin", "contributor"] as const) {
      await expect(loginPassword("a@b.test", "password", requester({ member: { id: "m1", email: "a@b.test", role } }).fetchStub))
        .resolves.toMatchObject({ role });
    }
    await expect(loginPassword("a@b.test", "password", requester({ member: { id: "m1", email: "a@b.test", role: "owner" } }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(loginPassword("a@b.test", "password", requester({ member: { id: "m1", email: "a@b.test", role: "contributor", extra: 1 } }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(loginPassword("a@b.test", "password", requester({ user: {} }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
  });

  it("maps every documented failure", () => {
    const cases: Array<[ApiRequestError, string]> = [
      [new ApiRequestError("PASSWORD_AUTH_REQUEST_INVALID", "", 400, false), "invalid"],
      [new ApiRequestError("PASSWORD_POLICY_INVALID", "", 400, false), "weak"],
      [new ApiRequestError("REGISTRATION_EMAIL_TAKEN", "", 409, false), "taken"],
      [new ApiRequestError("REGISTRATION_RATE_LIMITED", "", 429, true), "rate_limited"],
      [new ApiRequestError("PASSWORD_LOGIN_LOCKED", "", 429, true), "locked"],
      [new ApiRequestError("PASSWORD_LOGIN_INVALID", "", 401, false), "rejected"],
      [new ApiRequestError("MEMBER_DISABLED", "", 403, false), "disabled"],
      [new ApiRequestError("API_ERROR", "", 500, true), "unknown"],
    ];
    for (const [error, expected] of cases) expect(passwordAuthFailure(error)).toBe(expected);
    expect(passwordAuthFailure(new Error("network"))).toBe("unknown");
  });
});
