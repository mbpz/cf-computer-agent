/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  applyD1Migrations,
  createExecutionContext,
  env,
  reset,
  waitOnExecutionContext,
} from "cloudflare:test";
import { createLocalJWKSet } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerAi } from "../../src/ai/answer-service";
import { createApp } from "../../src/app";
import { verifyAccessJwt } from "../../src/identity/access-jwt";
import type { AccessEnvironment } from "../../src/identity/access-jwt";
import { createAccessJwtFixture, ACCESS_AUDIENCE, ACCESS_TEAM_DOMAIN, type AccessJwtFixture } from "../fixtures/access-jwt";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-13T00:00:00.000Z";
const jwtBySubject = new Map<string, string>();
let access: AccessJwtFixture;
let serviceJwt: string;

const fakeAi: AnswerAi = {
  async run(): Promise<unknown> {
    return { response: "local answer" };
  },
};

beforeAll(async () => {
  access = await createAccessJwtFixture();
  serviceJwt = await access.signService();
  for (const [subject, email] of [
    ["sub-contributor", "contributor@example.test"],
    ["sub-admin", "admin@example.test"],
    ["sub-other", "other@example.test"],
    ["sub-disabled", "disabled@example.test"],
  ]) {
    jwtBySubject.set(subject, await access.sign({ sub: subject, email }));
  }
});

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
  await seedMembers();
});

describe("Phase 1 API permission matrix", () => {
  it("allows a contributor session, spaces, owned submissions, and legacy reads but not legacy writes", async () => {
    await expectApiError(memberApi("sub-contributor", "/api/health"), 403, "FORBIDDEN");
    const session = await memberApi("sub-contributor", "/api/session");
    expect(session.status).toBe(200);
    const sessionBody = await session.json<Record<string, unknown>>();
    expect(sessionBody).toEqual({
      member: { id: "member-contributor", email: "contributor@example.test", role: "contributor" },
      capabilities: ["legacy:read", "submission:create", "submission:read-own"],
      logoutUrl: "https://example.test/cdn-cgi/access/logout",
    });
    expect(JSON.stringify(sessionBody)).not.toMatch(/sub-contributor|jwt|token|bootstrap/i);

    await expectOk(memberApi("sub-contributor", "/api/spaces"));
    await expectOk(memberApi("sub-contributor", "/api/spaces/default/collections"));
    const otherSubmission = await memberApi("sub-other", "/api/submissions", {
      method: "POST",
      body: JSON.stringify({ requestedSpaceId: "default", kind: "text", title: "Other", content: "Other body" }),
    });
    expect(otherSubmission.status).toBe(201);
    const created = await memberApi("sub-contributor", "/api/submissions", {
      method: "POST",
      body: JSON.stringify({ requestedSpaceId: "default", kind: "text", title: "Owned", content: "Body" }),
    });
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ submission: { submitterId: "member-contributor", status: "review_pending" } });
    const own = await memberApi("sub-contributor", "/api/submissions/mine?limit=1");
    const ownBody = await own.json<{ items: Array<{ submitterId: string }>; nextCursor?: string }>();
    expect(ownBody.items).toEqual([expect.objectContaining({ submitterId: "member-contributor" })]);
    expect(ownBody.nextCursor).toBeUndefined();
    expect(JSON.stringify(ownBody)).not.toContain("member-other");
    const copiedAdminCursor = (await (await memberApi("sub-admin", "/api/admin/submissions?limit=1")).json<{
      nextCursor?: string;
    }>()).nextCursor;
    expect(copiedAdminCursor).toBeTruthy();
    const ownFromAdminCursor = await memberApi(
      "sub-contributor",
      `/api/submissions/mine?limit=20&cursor=${encodeURIComponent(copiedAdminCursor!)}`,
    );
    const cursorBody = await ownFromAdminCursor.json<{ items: Array<{ submitterId: string }> }>();
    expect(cursorBody.items.every((item) => item.submitterId === "member-contributor")).toBe(true);
    expect(JSON.stringify(cursorBody)).not.toContain("member-other");

    await expectOk(memberApi("sub-contributor", "/api/notes"));
    await expectOk(memberApi("sub-contributor", "/api/search?q=owned"));
    await expectOk(memberApi("sub-contributor", "/api/chat", { method: "POST", body: JSON.stringify({ question: "owned" }) }));
    await expectApiError(memberApi("sub-contributor", "/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "forbidden-note", title: "Forbidden", content: "Body" }),
    }), 403, "FORBIDDEN");
  });

  it("allows an admin contributor APIs, legacy writes, and every Phase 1 admin API", async () => {
    await expectApiError(memberApi("sub-admin", "/api/health"), 403, "FORBIDDEN");
    await expectOk(memberApi("sub-admin", "/api/session"));
    await expectOk(memberApi("sub-admin", "/api/spaces"));
    await expectOk(memberApi("sub-admin", "/api/spaces/default/collections"));
    await expectOk(memberApi("sub-admin", "/api/notes"));
    await expectOk(memberApi("sub-admin", "/api/search?q=admin"));
    await expectOk(memberApi("sub-admin", "/api/chat", {
      method: "POST",
      body: JSON.stringify({ question: "admin" }),
    }));
    const note = await memberApi("sub-admin", "/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "admin-note", title: "Admin note", content: "Body" }),
    });
    expect(note.status).toBe(201);

    const submission = await memberApi("sub-admin", "/api/submissions", {
      method: "POST",
      body: JSON.stringify({ requestedSpaceId: "default", kind: "markdown", title: "Admin owned", content: "Body" }),
    });
    expect(submission.status).toBe(201);
    await expectOk(memberApi("sub-admin", "/api/submissions/mine"));

    await expectOk(memberApi("sub-admin", "/api/admin/submissions?status=review_pending"));
    const members = await memberApi("sub-admin", "/api/admin/members?status=active");
    expect(members.status).toBe(200);
    const memberBody = await members.json<Record<string, unknown>>();
    expect(JSON.stringify(memberBody)).not.toContain("sub-admin");
    expect(JSON.stringify(memberBody)).not.toContain("identitySubject");

    const space = await memberApi("sub-admin", "/api/admin/spaces", {
      method: "POST",
      body: JSON.stringify({ slug: "engineering", name: "Engineering", position: 2 }),
    });
    expect(space.status).toBe(201);
    const { space: createdSpace } = await space.json<{ space: { id: string } }>();
    await expectOk(memberApi("sub-admin", `/api/admin/spaces/${createdSpace.id}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Updated" }),
    }));

    const collection = await memberApi("sub-admin", "/api/admin/collections", {
      method: "POST",
      body: JSON.stringify({ spaceId: createdSpace.id, name: "Runbooks", position: 0 }),
    });
    expect(collection.status).toBe(201);
    const { collection: createdCollection } = await collection.json<{ collection: { id: string } }>();
    await expectOk(memberApi("sub-admin", `/api/admin/collections/${createdCollection.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Operational runbooks" }),
    }));
    await expectOk(memberApi("sub-admin", `/api/spaces/${createdSpace.id}/collections`));
    await expectOk(memberApi("sub-admin", "/api/admin/audit-events?action=submission.created"));

    const status = await memberApi("sub-admin", "/api/admin/members/member-disabled/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    expect(status.status).toBe(200);
    await expect(status.json()).resolves.toMatchObject({ member: { id: "member-disabled", status: "active" } });

    const protectedAdmin = await memberApi("sub-admin", "/api/admin/members/member-admin/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });
    await expectApiError(Promise.resolve(protectedAdmin), 403, "ADMIN_PROTECTED");

    for (const action of [
      "member.status_updated", "space.created", "space.updated", "collection.created", "collection.updated", "submission.created",
    ]) {
      const filtered = await memberApi("sub-admin", `/api/admin/audit-events?action=${action}`);
      expect(filtered.status).toBe(200);
      const body = await filtered.json<{ items: Array<{ action: string; metadata: Record<string, unknown> }> }>();
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items.every((event) => event.action === action)).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/admin@example|sub-admin|Admin note|Operational runbooks/);
    }

    await expectApiError(memberApi("sub-admin", "/api/admin/audit-events?action=not.allowed"), 400, "FILTER_INVALID");
  });

  it("exposes a first-account member.login through the filtered admin audit API", async () => {
    const firstJwt = await access.sign({ sub: "first-login-sub", email: "first-login@example.test" });
    const firstLogin = await execute(request("/api/session", { jwt: firstJwt }));
    expect(firstLogin.status).toBe(200);

    const filtered = await memberApi("sub-admin", "/api/admin/audit-events?action=member.login");
    expect(filtered.status).toBe(200);
    const body = await filtered.json<{ items: Array<{ action: string; actorId: string; resourceId: string; metadata: unknown }> }>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ action: "member.login", metadata: { role: "contributor" } });
    expect(body.items[0]!.actorId).toBe(body.items[0]!.resourceId);
    expect(JSON.stringify(body)).not.toMatch(/first-login@example|first-login-sub/);
  });

  it("allows automation only health and legacy read/write/search/chat", async () => {
    await expectOk(automationApi("/api/health"));
    const created = await automationApi("/api/notes", {
      method: "POST",
      body: JSON.stringify({ id: "automation-note", title: "Automation", content: "Body" }),
    });
    expect(created.status).toBe(201);
    await expectOk(automationApi("/api/notes"));
    await expectOk(automationApi("/api/search?q=automation"));
    await expectOk(automationApi("/api/chat", { method: "POST", body: JSON.stringify({ question: "automation" }) }));

    for (const [path, init] of phase1Requests()) {
      await expectApiError(automationApi(path, init), 403, "FORBIDDEN");
    }
  });

  it("requires a signed service assertion and APP_TOKEN while member JWT plus APP_TOKEN stays a member", async () => {
    await expectOk(execute(request("/api/health", { automation: true })));
    await expectApiError(execute(request("/api/health", {
      authorization: "Bearer worker-test-token",
      headers: {
        "cf-access-client-id": "untrusted-client-id",
        "cf-access-client-secret": "untrusted-client-secret",
      },
    })), 401, "ACCESS_TOKEN_REQUIRED");
    await expectApiError(execute(request("/api/health", { jwt: serviceJwt })), 401, "AUTH_REQUIRED");
    await expectApiError(execute(request("/api/health", { jwt: serviceJwt, authorization: "Bearer wrong-token" })), 401, "AUTH_REQUIRED");

    const member = await execute(request("/api/session", {
      jwt: jwtBySubject.get("sub-contributor"),
      authorization: "Bearer worker-test-token",
    }));
    expect(member.status).toBe(200);
    await expect(member.json()).resolves.toMatchObject({ member: { id: "member-contributor", role: "contributor" } });
  });

  it("denies a disabled Access member every business API before dispatch", async () => {
    for (const [path, init] of [
      ["/api/health", undefined],
      ["/api/session", undefined],
      ["/api/notes", undefined],
      ["/api/search?q=x", undefined],
      ["/api/chat", { method: "POST", body: JSON.stringify({ question: "x" }) }],
      ...phase1Requests(),
    ] satisfies Array<[string, RequestInit | undefined]>) {
      await expectApiError(memberApi("sub-disabled", path, init), 403, "MEMBER_DISABLED");
    }
  });

  it("denies a contributor direct access to every admin endpoint", async () => {
    const adminRequests: Array<[string, RequestInit | undefined]> = [
      ["/api/admin/submissions", undefined],
      ["/api/admin/members", undefined],
      ["/api/admin/members/member-disabled/status", { method: "PATCH", body: JSON.stringify({ status: "active" }) }],
      ["/api/admin/spaces", { method: "POST", body: JSON.stringify({ slug: "x", name: "X", position: 0 }) }],
      ["/api/admin/spaces/default", { method: "PATCH", body: JSON.stringify({ name: "X" }) }],
      ["/api/admin/collections", { method: "POST", body: JSON.stringify({ spaceId: "default", name: "X", position: 0 }) }],
      ["/api/admin/collections/collection-id", { method: "PATCH", body: JSON.stringify({ name: "X" }) }],
      ["/api/admin/audit-events", undefined],
    ];
    for (const [path, init] of adminRequests) {
      await expectApiError(memberApi("sub-contributor", path, init), 403, "FORBIDDEN");
    }
  });
});

describe("Phase 1 request boundary", () => {
  it("verifies one member principal exactly once and uses real waitUntil", async () => {
    const verify = vi.fn(localVerifyAccessJwt);
    const app = createApp({ verifyAccessJwt: verify });
    const ctx = createExecutionContext();
    const response = await app.fetch!(incomingRequest("/api/session", { jwt: jwtBySubject.get("sub-contributor") }), localEnv(), ctx);
    expect(response.status).toBe(200);
    expect(verify).toHaveBeenCalledTimes(1);
    await waitOnExecutionContext(ctx);
    const member = await env.DB.prepare("SELECT last_seen_at FROM members WHERE id = 'member-contributor'").first<{ last_seen_at: string | null }>();
    expect(member?.last_seen_at).not.toBeNull();
  });

  it.each([
    ["/api/session", "POST", "GET"],
    ["/api/spaces", "POST", "GET"],
    ["/api/spaces/default/collections", "POST", "GET"],
    ["/api/submissions", "GET", "POST"],
    ["/api/submissions/mine", "POST", "GET"],
    ["/api/admin/submissions", "POST", "GET"],
    ["/api/admin/members", "POST", "GET"],
    ["/api/admin/members/member-disabled/status", "POST", "PATCH"],
    ["/api/admin/spaces", "GET", "POST"],
    ["/api/admin/spaces/default", "POST", "PATCH"],
    ["/api/admin/collections", "GET", "POST"],
    ["/api/admin/collections/collection-id", "POST", "PATCH"],
    ["/api/admin/audit-events", "POST", "GET"],
    ["/api/notes", "PUT", "GET, POST"],
    ["/api/search", "POST", "GET"],
    ["/api/chat", "GET", "POST"],
  ])("returns a stable 405 and exact Allow for %s", async (path, method, allow) => {
    const response = await memberApi("sub-admin", path, { method });
    await expectApiError(Promise.resolve(response), 405, "METHOD_NOT_ALLOWED");
    expect(response.headers.get("allow")).toBe(allow);
  });

  it("returns the exact health Allow header to its automation principal", async () => {
    const response = await automationApi("/api/health", { method: "POST" });
    await expectApiError(Promise.resolve(response), 405, "METHOD_NOT_ALLOWED");
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("matches paths exactly and redacts credentials from request-scoped errors", async () => {
    for (const path of ["/api/session/", "/api/submissions/mine/", "/api/admin/spaces/default/extra"]) {
      await expectApiError(memberApi("sub-admin", path), 404, "NOT_FOUND");
    }
    const response = await memberApi("sub-admin", "/api/submissions", {
      method: "POST",
      body: "{jwt-secret-marker",
    });
    const body = await expectApiError(Promise.resolve(response), 400, "INVALID_JSON");
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(JSON.stringify(body)).not.toContain("jwt-secret-marker");
    expect(JSON.stringify(body)).not.toContain(jwtBySubject.get("sub-admin"));
  });

  it.each([
    ["/api/spaces?cursor=", "empty"],
    [`/api/spaces?cursor=${encodeURIComponent(pageCursor(-1, "space"))}`, "negative-position"],
    [`/api/spaces?cursor=${encodeURIComponent(pageCursor(1_000_001, "space"))}`, "oversized-position"],
    [`/api/submissions/mine?cursor=${encodeURIComponent(pageCursor(-1, "submission"))}`, "negative-submission-time"],
    [`/api/admin/submissions?cursor=${encodeURIComponent(pageCursor(8_640_000_000_000_001, "submission"))}`, "invalid-submission-date"],
    [`/api/admin/audit-events?cursor=${encodeURIComponent(pageCursor(-1, "event"))}`, "negative-audit-time"],
    [`/api/admin/audit-events?cursor=${encodeURIComponent(pageCursor(8_640_000_000_000_001, "event"))}`, "invalid-audit-date"],
  ])("returns stable 400 for %s (%s)", async (path) => {
    await expectApiError(memberApi("sub-admin", path), 400, "PAGE_CURSOR_INVALID");
  });
});

function pageCursor(sort: number, id: string): string {
  return btoa(JSON.stringify({ v: 1, sort, id })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function phase1Requests(): Array<[string, RequestInit | undefined]> {
  return [
    ["/api/session", undefined],
    ["/api/spaces", undefined],
    ["/api/spaces/default/collections", undefined],
    ["/api/submissions", { method: "POST", body: JSON.stringify({ requestedSpaceId: "default", kind: "text", title: "X", content: "X" }) }],
    ["/api/submissions/mine", undefined],
    ["/api/admin/submissions", undefined],
    ["/api/admin/members", undefined],
    ["/api/admin/members/member-disabled/status", { method: "PATCH", body: JSON.stringify({ status: "active" }) }],
    ["/api/admin/spaces", { method: "POST", body: JSON.stringify({ slug: "automation", name: "Automation", position: 0 }) }],
    ["/api/admin/spaces/default", { method: "PATCH", body: JSON.stringify({ name: "Automation" }) }],
    ["/api/admin/collections", { method: "POST", body: JSON.stringify({ spaceId: "default", name: "Automation", position: 0 }) }],
    ["/api/admin/collections/collection-id", { method: "PATCH", body: JSON.stringify({ name: "Automation" }) }],
    ["/api/admin/audit-events", undefined],
  ];
}

async function memberApi(subject: string, path: string, init?: RequestInit): Promise<Response> {
  return execute(request(path, { ...init, jwt: jwtBySubject.get(subject) }));
}

async function automationApi(path: string, init?: RequestInit): Promise<Response> {
  return execute(request(path, { ...init, automation: true }));
}

async function execute(req: Request): Promise<Response> {
  const app = createApp({ verifyAccessJwt: localVerifyAccessJwt });
  const ctx = createExecutionContext();
  const response = await app.fetch!(req as Request<unknown, IncomingRequestCfProperties<unknown>>, localEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function request(path: string, options: RequestInit & { jwt?: string; automation?: boolean; authorization?: string } = {}): Request {
  const { jwt, automation, authorization, ...init } = options;
  return new Request(`https://example.test${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(jwt ? { "cf-access-jwt-assertion": jwt } : {}),
      ...(automation ? {
        "cf-access-jwt-assertion": serviceJwt,
        authorization: "Bearer worker-test-token",
      } : {}),
      ...(authorization ? { authorization } : {}),
      ...init.headers,
    },
  });
}

function incomingRequest(
  path: string,
  options: RequestInit & { jwt?: string; automation?: boolean } = {},
): Request<unknown, IncomingRequestCfProperties<unknown>> {
  return request(path, options) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}

function localEnv(): Env {
  return {
    ...env,
    AI: fakeAi,
    ACCESS_TEAM_DOMAIN,
    ACCESS_AUD: ACCESS_AUDIENCE,
    BOOTSTRAP_ADMIN_EMAIL: "bootstrap-only@example.test",
  } as Env;
}

function localVerifyAccessJwt(req: Request, environment: AccessEnvironment) {
  return verifyAccessJwt(req, environment, { jwks: createLocalJWKSet({ keys: [access.publicJwk] }) });
}

async function seedMembers(): Promise<void> {
  for (const member of [
    ["member-contributor", "sub-contributor", "contributor@example.test", "contributor", "active"],
    ["member-admin", "sub-admin", "admin@example.test", "admin", "active"],
    ["member-other", "sub-other", "other@example.test", "contributor", "active"],
    ["member-disabled", "sub-disabled", "disabled@example.test", "contributor", "disabled"],
  ] as const) {
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(...member, now, now).run();
  }
}

async function expectOk(response: Promise<Response>): Promise<void> {
  expect((await response).status).toBe(200);
}

async function expectApiError(
  response: Promise<Response>,
  status: number,
  code: string,
): Promise<{ error: { code: string; message: string; retryable: boolean; requestId: string } }> {
  const resolved = await response;
  expect(resolved.status).toBe(status);
  expect(resolved.headers.get("x-request-id")).toBeTruthy();
  const body = await resolved.json<{ error: { code: string; message: string; retryable: boolean; requestId: string } }>();
  expect(body).toMatchObject({ error: { code, requestId: expect.any(String) } });
  return body;
}
