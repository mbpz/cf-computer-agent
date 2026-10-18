// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ApiRequestError, type Fetcher } from "../../frontend/lib/api";
import { emailLoginFailure, requestLoginCode, submitEmailLoginCode } from "../../frontend/lib/email-login-data";

function requester(body: unknown, status = 200) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fetchStub: Fetcher = (path, init) => {
    calls.push({ path: String(path), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  };
  return { calls, fetchStub };
}

describe("email login data", () => {
  it("posts the exact request body and requires the accepted envelope", async () => {
    const { calls, fetchStub } = requester({ status: "accepted" }, 202);
    await expect(requestLoginCode("new@example.test", fetchStub)).resolves.toBeUndefined();
    expect(calls[0]!.path).toBe("/auth/email/code");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ email: "new@example.test" }));
    await expect(requestLoginCode("new@example.test", requester({ status: "sent" }, 202).fetchStub)).rejects.toThrow("EMAIL_LOGIN_RESPONSE_INVALID");
    await expect(requestLoginCode("new@example.test", requester({ status: "accepted", extra: 1 }, 202).fetchStub)).rejects.toThrow("EMAIL_LOGIN_RESPONSE_INVALID");
  });

  it("posts the exact verification body and validates both roles", async () => {
    for (const role of ["contributor", "admin"] as const) {
      const { calls, fetchStub } = requester({ member: { id: "m1", email: "new@example.test", role } });
      await expect(submitEmailLoginCode("new@example.test", "123456", fetchStub)).resolves.toEqual({ id: "m1", email: "new@example.test", role });
      expect(calls[0]!.path).toBe("/auth/email/code/verify");
      expect(calls[0]!.init?.body).toBe(JSON.stringify({ email: "new@example.test", code: "123456" }));
    }
    await expect(submitEmailLoginCode("new@example.test", "123456", requester({ member: { id: "m1", email: "new@example.test", role: "owner" } }).fetchStub)).rejects.toThrow("EMAIL_LOGIN_RESPONSE_INVALID");
    await expect(submitEmailLoginCode("new@example.test", "123456", requester({ member: { id: "m1", email: "new@example.test", role: "contributor", extra: 1 } }).fetchStub)).rejects.toThrow("EMAIL_LOGIN_RESPONSE_INVALID");
    await expect(submitEmailLoginCode("new@example.test", "12345", requester({}).fetchStub)).rejects.toThrow("EMAIL_LOGIN_CODE_INVALID");
  });

  it("maps the documented failures without treating an unknown error as a credential decision", () => {
    expect(emailLoginFailure(new ApiRequestError("EMAIL_LOGIN_REQUEST_INVALID", "", 400, false))).toBe("invalid");
    expect(emailLoginFailure(new ApiRequestError("EMAIL_LOGIN_INVALID", "", 401, false))).toBe("rejected");
    expect(emailLoginFailure(new ApiRequestError("MEMBER_DISABLED", "", 403, false))).toBe("disabled");
    expect(emailLoginFailure(new ApiRequestError("EMAIL_LOGIN_UNAVAILABLE", "", 503, false))).toBe("unavailable");
    expect(emailLoginFailure(new ApiRequestError("EMAIL_LOGIN_DELIVERY_FAILED", "", 503, true))).toBe("delivery");
    expect(emailLoginFailure(new ApiRequestError("API_ERROR", "", 500, true))).toBe("unknown");
    expect(emailLoginFailure(new Error("network"))).toBe("unknown");
  });
});
