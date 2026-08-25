// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveFrontendAccess } from "../../frontend/lib/auth-boundary";
import { apiFetch, ApiRequestError } from "../../frontend/lib/api";

describe("frontend auth boundary", () => {
  it("redirects anonymous users to GitHub without accepting a client token", () => {
    expect(resolveFrontendAccess({ session: null, requiredCapability: "knowledge:read" })).toEqual({ kind: "redirect", href: "/auth/github" });
  });

  it("fails closed for contributors on admin capabilities", () => {
    expect(resolveFrontendAccess({ session: { member: { id: "m", email: "a@example.com", role: "contributor" }, capabilities: ["knowledge:read"], logoutUrl: "/auth/logout" }, requiredCapability: "member:manage" })).toEqual({ kind: "forbidden" });
  });

  it("allows only the capability returned by the server", () => {
    expect(resolveFrontendAccess({ session: { member: { id: "m", email: "a@example.com", role: "admin" }, capabilities: ["member:manage"], logoutUrl: "/auth/logout" }, requiredCapability: "member:manage" })).toEqual({ kind: "allow" });
    expect(resolveFrontendAccess({ session: { member: { id: "m", email: "a@example.com", role: "admin" }, capabilities: [], logoutUrl: "/auth/logout" }, requiredCapability: "member:manage" })).toEqual({ kind: "forbidden" });
  });

  it("maps API 401/403 to stable structured errors", async () => {
    const unauthorized = () => apiFetch("/api/session", { requester: async () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Sign in required", retryable: false } }), { status: 401, headers: { "content-type": "application/json", "x-request-id": "req-401" } }) });
    await expect(unauthorized()).rejects.toMatchObject({ code: "UNAUTHORIZED", status: 401, requestId: "req-401" });
    const forbidden = () => apiFetch("/api/admin/members", { requester: async () => new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Denied", retryable: false } }), { status: 403, headers: { "content-type": "application/json" } }) });
    await expect(forbidden()).rejects.toBeInstanceOf(ApiRequestError);
  });
});
