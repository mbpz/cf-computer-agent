// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiRequestError, type Fetcher } from "../../frontend/lib/api";
import { loginPassword, passwordAuthFailure, registerPassword, resetPassword } from "../../frontend/lib/password-auth-data";

const MEMBER = { id: "m1", email: "new@example.test", role: "contributor" };
const RECOVERY = "ABC234-DEF567-GHI234-JKL567";

function requester(body: unknown, status = 200) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchStub: Fetcher = (path, init) => {
    calls.push({ path: String(path), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { calls, fetchStub };
}

describe("password auth data", () => {
  it("posts the exact registration body and returns the one-time recovery code", async () => {
    const { calls, fetchStub } = requester({ member: MEMBER, recoveryCode: RECOVERY }, 201);
    await expect(registerPassword("new@example.test", "correct horse battery staple", fetchStub))
      .resolves.toEqual({ member: MEMBER, recoveryCode: RECOVERY });
    expect(calls[0]!.path).toBe("/auth/register");
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ email: "new@example.test", password: "correct horse battery staple" }));
  });

  it("posts the exact login and reset bodies", async () => {
    const login = requester({ member: MEMBER });
    await expect(loginPassword("new@example.test", "correct horse battery staple", login.fetchStub)).resolves.toEqual(MEMBER);
    expect(login.calls[0]!.path).toBe("/auth/password");

    const reset = requester({ recoveryCode: RECOVERY });
    await expect(resetPassword("new@example.test", RECOVERY, "another password value", reset.fetchStub)).resolves.toBe(RECOVERY);
    expect(reset.calls[0]!.path).toBe("/auth/password/reset");
    expect(reset.calls[0]!.init?.body).toBe(JSON.stringify({
      email: "new@example.test",
      recoveryCode: RECOVERY,
      password: "another password value",
    }));
  });

  it("validates member, registration and reset envelopes", async () => {
    await expect(registerPassword("a@b.test", "password", requester({ member: MEMBER }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(registerPassword("a@b.test", "password", requester({ member: MEMBER, recoveryCode: "" }, 201).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(loginPassword("a@b.test", "password", requester({ member: { ...MEMBER, role: "owner" } }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(loginPassword("a@b.test", "password", requester({ member: { ...MEMBER, extra: 1 } }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(resetPassword("a@b.test", RECOVERY, "password", requester({}).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
    await expect(resetPassword("a@b.test", RECOVERY, "password", requester({ recoveryCode: "", extra: 1 }).fetchStub)).rejects.toThrow("PASSWORD_AUTH_RESPONSE_INVALID");
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
      [new ApiRequestError("PASSWORD_RESET_INVALID", "", 401, false), "reset_rejected"],
      [new ApiRequestError("PASSWORD_RESET_LOCKED", "", 429, true), "reset_locked"],
      [new ApiRequestError("API_ERROR", "", 500, true), "unknown"],
    ];
    for (const [error, expected] of cases) expect(passwordAuthFailure(error)).toBe(expected);
    expect(passwordAuthFailure(new Error("network"))).toBe("unknown");
  });
});
