import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/http";
import { resolvePrincipal, type ResolvePrincipalDependencies } from "../../src/identity/principal";
import type { Member } from "../../src/members/types";

const member = (): Member => ({
  id: "member-1",
  accessSub: "access-subject-1",
  email: "member@example.test",
  role: "contributor",
  status: "active",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
  lastSeenAt: null,
});

const request = (headers: HeadersInit = {}) => new Request("https://example.test/api/session", { headers });
const env = { APP_TOKEN: "automation-token", ACCESS_TEAM_DOMAIN: "access.example.test", ACCESS_AUD: "audience" };

describe("resolvePrincipal", () => {
  it("resolves a verified Access assertion as a member even with a valid APP_TOKEN", async () => {
    const dependencies = dependenciesFor(member());

    await expect(resolvePrincipal(request({
      "cf-access-jwt-assertion": "test-assertion",
      authorization: "Bearer automation-token",
    }), env, dependencies))
      .resolves.toEqual({
        kind: "member",
        memberId: "member-1",
        accessSub: "access-subject-1",
        email: "member@example.test",
        role: "contributor",
      });
  });

  it("rejects APP_TOKEN and untrusted Access client headers without a signed assertion", async () => {
    await expect(resolvePrincipal(request({
      authorization: "Bearer automation-token",
      "cf-access-client-id": "untrusted-client-id",
      "cf-access-client-secret": "untrusted-client-secret",
    }), env, dependenciesFor(member())))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_REQUIRED", status: 401 });
  });

  it("resolves a verified service assertion plus APP_TOKEN as automation", async () => {
    const dependencies = dependenciesFor(member(), undefined, undefined, { kind: "service" });

    await expect(resolvePrincipal(request({
      "cf-access-jwt-assertion": "service-assertion",
      authorization: "Bearer automation-token",
    }), env, dependencies)).resolves.toEqual({ kind: "automation", role: "automation" });
    expect(dependencies.members.resolveFirstLogin).not.toHaveBeenCalled();
  });

  it("rejects a verified service assertion with a missing or incorrect APP_TOKEN", async () => {
    for (const authorization of [undefined, "Bearer wrong-token"]) {
      await expect(resolvePrincipal(request({
        "cf-access-jwt-assertion": "service-assertion",
        ...(authorization ? { authorization } : {}),
      }), env, dependenciesFor(member(), undefined, undefined, { kind: "service" })))
        .rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 });
    }
  });

  it("fails closed when the member lifecycle rejects a disabled Access identity", async () => {
    const dependencies = dependenciesFor(member(), new AppError("MEMBER_DISABLED", "Member access is disabled", 403));

    await expect(resolvePrincipal(request({ "cf-access-jwt-assertion": "disabled-assertion" }), env, dependencies))
      .rejects.toMatchObject({ code: "MEMBER_DISABLED", status: 403 });
  });

  it("propagates invalid Access assertions without trying APP_TOKEN", async () => {
    const dependencies = dependenciesFor(member(), undefined, new AppError("ACCESS_TOKEN_INVALID", "Access authentication failed", 401));

    await expect(resolvePrincipal(request({
      "cf-access-jwt-assertion": "invalid-assertion",
      authorization: "Bearer automation-token",
    }), env, dependencies)).rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID", status: 401 });
  });

  it("requires a signed Access assertion before evaluating an incorrect APP_TOKEN", async () => {
    await expect(resolvePrincipal(request({ authorization: "Bearer wrong-token" }), env, dependenciesFor(member())))
      .rejects.toMatchObject({ code: "ACCESS_TOKEN_REQUIRED", status: 401 });
  });

  it("always selects the member path when an assertion and APP_TOKEN are both supplied", async () => {
    const dependencies = dependenciesFor(member(), undefined, new AppError("ACCESS_TOKEN_INVALID", "Access authentication failed", 401));

    await expect(resolvePrincipal(request({
      "cf-access-jwt-assertion": "invalid-assertion",
      authorization: "Bearer automation-token",
    }), env, dependencies)).rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID", status: 401 });
    expect(dependencies.members.resolveFirstLogin).not.toHaveBeenCalled();
  });

  it("rejects an empty assertion instead of falling back to a valid APP_TOKEN", async () => {
    const dependencies = dependenciesFor(member());

    await expect(resolvePrincipal(request({
      "cf-access-jwt-assertion": "",
      authorization: "Bearer automation-token",
    }), env, { members: dependencies.members })).rejects.toMatchObject({ code: "ACCESS_TOKEN_REQUIRED", status: 401 });
    expect(dependencies.members.resolveFirstLogin).not.toHaveBeenCalled();
  });

  it("rejects a malformed assertion instead of falling back to a valid APP_TOKEN", async () => {
    const dependencies = dependenciesFor(member());

    await expect(resolvePrincipal(request({
      "cf-access-jwt-assertion": "malformed",
      authorization: "Bearer automation-token",
    }), env, { members: dependencies.members })).rejects.toMatchObject({ code: "ACCESS_TOKEN_INVALID", status: 401 });
    expect(dependencies.members.resolveFirstLogin).not.toHaveBeenCalled();
  });
});

function dependenciesFor(
  resolvedMember: Member,
  memberError?: Error,
  verificationError?: Error,
  assertion: { kind: "member"; sub: string; email: string } | { kind: "service" } = {
    kind: "member", sub: "access-subject-1", email: "member@example.test",
  },
): ResolvePrincipalDependencies & { members: { resolveFirstLogin: ReturnType<typeof vi.fn> } } {
  return {
    members: {
      resolveFirstLogin: vi.fn(async () => {
        if (memberError) throw memberError;
        return resolvedMember;
      }),
    },
    verifyAccessJwt: async (verifiedRequest) => {
      if (!verifiedRequest.headers.get("cf-access-jwt-assertion")) {
        throw new AppError("ACCESS_TOKEN_REQUIRED", "Access authentication required", 401);
      }
      if (verificationError) throw verificationError;
      return assertion;
    },
  };
}
