import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import { resolvePrincipal, type ResolvePrincipalDependencies } from "../../src/identity/principal";
import type { Member } from "../../src/members/types";

const activeMember = (): Member => ({
  id: "member-1",
  identitySubject: "github:101",
  email: "member@example.test",
  role: "contributor",
  status: "active",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
  lastSeenAt: null,
});

const automationHeaders = {
  authorization: "Bearer automation-token",
  "x-automation-id": "automation-client",
  "x-automation-timestamp": "1787068800",
  "x-automation-nonce": "MDEyMzQ1Njc4OWFiY2RlZg",
  "x-automation-signature": "a".repeat(64),
} as const;

describe("resolvePrincipal", () => {
  it("resolves a valid session cookie as a member principal", async () => {
    const request = apiRequest({ cookie: sessionCookie() });

    const resolved = await resolvePrincipal(request, dependencies());

    expect(resolved.principal).toEqual({
      kind: "member",
      memberId: "member-1",
      identitySubject: "github:101",
      email: "member@example.test",
      role: "contributor",
    });
    expect(resolved.request).toBe(request);
  });

  it("resolves a complete signed automation request and reconstructs its verified body bytes", async () => {
    const body = "{\"question\":\"exact bytes\"}";
    const request = apiRequest(automationHeaders, { method: "POST", body });

    const resolved = await resolvePrincipal(request, dependencies());

    expect(resolved.principal).toEqual({ kind: "automation", role: "automation" });
    await expect(resolved.request.text()).resolves.toBe(body);
  });

  it.each([
    ["no credentials", {}],
    ["only ignored Access assertion", { "cf-access-jwt-assertion": "ignored" }],
    ["only ignored Access client headers", {
      "cf-access-client-id": "ignored-id",
      "cf-access-client-secret": "ignored-secret",
    }],
  ])("returns stable authentication required for %s", async (_label, headers) => {
    await expect(resolvePrincipal(apiRequest(headers), dependencies()))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });

  it("propagates an invalid session without falling back to automation", async () => {
    const invalid = dependencies({ sessionError: new AppError("AUTH_REQUIRED", "Authentication required", 401) });

    await expect(resolvePrincipal(apiRequest({ cookie: "__Host-memory-session=invalid" }), invalid))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });

  it.each(Object.keys(automationHeaders))(
    "rejects a partial automation scheme containing only %s",
    async (header) => {
      await expect(resolvePrincipal(apiRequest({
        [header]: automationHeaders[header as keyof typeof automationHeaders],
      }), dependencies()))
        .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
    },
  );

  it.each(Object.keys(automationHeaders))(
    "rejects a member cookie combined with automation header %s",
    async (header) => {
      await expect(resolvePrincipal(apiRequest({
        cookie: sessionCookie(),
        [header]: automationHeaders[header as keyof typeof automationHeaders],
      }), dependencies()))
        .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
    },
  );

  it("ignores Access headers while resolving a valid browser session", async () => {
    const resolved = await resolvePrincipal(apiRequest({
      cookie: sessionCookie(),
      "cf-access-jwt-assertion": "ignored-assertion",
      "cf-access-client-id": "ignored-id",
      "cf-access-client-secret": "ignored-secret",
    }), dependencies());

    expect(resolved.principal).toMatchObject({ kind: "member", memberId: "member-1" });
  });

  it("propagates disabled-member rejection from session resolution", async () => {
    const disabled = dependencies({
      sessionError: new AppError("MEMBER_DISABLED", "Member access is disabled", 403),
    });

    await expect(resolvePrincipal(apiRequest({ cookie: sessionCookie() }), disabled))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
  });

  it("does not let a valid member cookie plus APP token become automation", async () => {
    await expect(resolvePrincipal(apiRequest({
      cookie: sessionCookie(),
      authorization: "Bearer automation-token",
    }), dependencies()))
      .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
  });
});

function apiRequest(headers: HeadersInit = {}, init: RequestInit = {}): Request {
  return new Request("https://memory.crgmhrc.asia/api/session", {
    ...init,
    headers: { "content-type": "application/json", ...headers },
  });
}

function sessionCookie(): string {
  return `__Host-memory-session=${"s".repeat(43)}`;
}

function dependencies(options: { sessionError?: Error } = {}): ResolvePrincipalDependencies {
  return {
    sessions: {
      async resolve(): Promise<Member> {
        if (options.sessionError) throw options.sessionError;
        return activeMember();
      },
    },
    automation: {
      async verify(request): Promise<{ bodyBytes: Uint8Array }> {
        return { bodyBytes: new Uint8Array(await request.arrayBuffer()) };
      },
    },
    maxBodyBytes: 1024,
  };
}
