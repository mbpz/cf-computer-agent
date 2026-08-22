/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  applyD1Migrations,
  createExecutionContext,
  env,
  reset,
  waitOnExecutionContext,
} from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AnswerAi } from "../../src/ai/answer-service";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const now = "2026-08-13T00:00:00.000Z";
const sessionBySubject = new Map<string, string>();
const AUTOMATION_ID = "fake-automation-client-id";
const AUTOMATION_SECRET = "fake-automation-secret";
const APP_TOKEN = "worker-test-token";
let automationNonce = 0;

const fakeAi: AnswerAi = {
  async run(): Promise<unknown> {
    return { response: "local answer" };
  },
};

const m1Boundaries = [
  ["GET", "/api/knowledge"],
  ["GET", "/api/knowledge/search?q=alpha"],
  ["POST", "/api/knowledge/chat"],
  ["GET", "/api/admin/submissions/submission-id"],
  ["POST", "/api/admin/submissions/submission-id/publish"],
  ["POST", "/api/admin/submissions/submission-id/reject"],
] as const;

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
  await seedMembers();
  automationNonce = 0;
  sessionBySubject.clear();
  const repository = new MembersRepository(env.DB);
  const sessions = new SessionService(env.DB, repository, { waitUntil: () => undefined });
  for (const subject of ["sub-contributor", "sub-admin", "sub-other"]) {
    const member = await repository.findByIdentitySubject(identitySubject(subject));
    sessionBySubject.set(subject, (await sessions.create(member!)).token);
  }
  const disabled = await repository.findByIdentitySubject(identitySubject("sub-disabled"));
  await env.DB.prepare("UPDATE members SET status = 'active' WHERE id = ?").bind(disabled!.id).run();
  sessionBySubject.set("sub-disabled", (await sessions.create({ ...disabled!, status: "active" })).token);
  await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = ?").bind(disabled!.id).run();
});

describe("Phase 1 API permission matrix", () => {
  it("never grants M1 routes to signed automation", async () => {
    for (const [method, path] of m1Boundaries) {
      await expectApiError(automationApi(path, {
        method,
        ...(method === "POST" ? { body: "{}" } : {}),
      }), 403, "FORBIDDEN");
    }
  });

  it("allows active contributors through final M1 knowledge-read routes only", async () => {
    await expectOk(memberApi("sub-contributor", "/api/knowledge"));
    await expectOk(memberApi("sub-contributor", "/api/knowledge/search?q=alpha"));
    await expectOk(memberApi("sub-contributor", "/api/knowledge/chat", {
      method: "POST",
      body: JSON.stringify({ question: "alpha" }),
    }));
    for (const [method, path] of m1Boundaries.slice(3)) {
      await expectApiError(memberApi("sub-contributor", path, {
        method,
        ...(method === "POST" ? { body: "{}" } : {}),
      }), 403, "FORBIDDEN");
    }
  });

  it("allows active administrators through final M1 review routes", async () => {
    await expectApiError(
      memberApi("sub-admin", "/api/admin/submissions/submission-id"),
      404,
      "SUBMISSION_NOT_FOUND",
    );
    await expectApiError(memberApi("sub-admin", "/api/admin/submissions/submission-id/publish", {
      method: "POST",
      body: JSON.stringify({
        title: "Missing",
        visibility: "shared",
        spaceId: "default",
        collectionId: null,
        tagIds: [],
      }),
    }), 404, "SUBMISSION_NOT_FOUND");
    await expectApiError(memberApi("sub-admin", "/api/admin/submissions/submission-id/reject", {
      method: "POST",
      body: JSON.stringify({ reasonCode: "not_relevant", note: "Missing" }),
    }), 409, "REVIEW_STATE_CONFLICT");
  });

  it("allows a contributor session, spaces, owned submissions, and legacy reads but not legacy writes", async () => {
    await expectApiError(memberApi("sub-contributor", "/api/health"), 403, "FORBIDDEN");
    const session = await memberApi("sub-contributor", "/api/session");
    expect(session.status).toBe(200);
    const sessionBody = await session.json<Record<string, unknown>>();
    expect(sessionBody).toEqual({
      member: { id: "member-contributor", email: "contributor@example.test", role: "contributor" },
      capabilities: ["legacy:read", "submission:create", "submission:read-own", "knowledge:read"],
      logoutUrl: "/auth/logout",
    });
    expect(JSON.stringify(sessionBody)).not.toMatch(/sub-contributor|jwt|token|bootstrap/i);

    await expectOk(memberApi("sub-contributor", "/api/spaces"));
    await expectOk(memberApi("sub-contributor", "/api/spaces/default/collections"));
    const otherSubmission = await memberApi("sub-other", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "phase1-other-key1" },
      body: JSON.stringify({ requestedSpaceId: "default", kind: "text", title: "Other", content: "Other body" }),
    });
    expect(otherSubmission.status).toBe(201);
    const created = await memberApi("sub-contributor", "/api/submissions", {
      method: "POST",
      headers: { "idempotency-key": "phase1-owned-key1" },
      body: JSON.stringify({ requestedSpaceId: "default", kind: "text", title: "Owned", content: "Body" }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json<{ submission: Record<string, unknown> }>();
    expect(createdBody).toEqual({
      submission: {
        id: expect.any(String),
        submitterId: "member-contributor",
        requestedSpaceId: "default",
        requestedCollectionId: null,
        requestedVisibility: "shared",
        kind: "text",
        status: "review_pending",
        title: "Owned",
        content: "Body",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      duplicateCandidate: null,
    });
    const own = await memberApi("sub-contributor", "/api/submissions/mine?limit=1");
    const ownBody = await own.json<{ items: Array<{ submitterId: string }>; nextCursor?: string }>();
    expect(ownBody.items).toEqual([createdBody.submission]);
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
      headers: { "idempotency-key": "phase1-admin-key1" },
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
    const oauthApp = createApp({ githubFetch: fakeGitHubFetch("first-login@example.test", 501) });
    const start = await execute(request("/auth/github"), oauthApp, localEnv({
      ALLOWED_MEMBER_EMAILS: "bootstrap-only@example.test,first-login@example.test",
    }));
    const cookies = setCookies(start);
    const state = cookieValue(cookies, "__Host-oauth-state");
    const firstLogin = await execute(request(`/auth/github/callback?code=first-login-code&state=${state}`, {
      headers: { cookie: cookies.map(cookiePair).join("; ") },
    }), oauthApp, localEnv({
      ALLOWED_MEMBER_EMAILS: "bootstrap-only@example.test,first-login@example.test",
    }));
    expect(firstLogin.status).toBe(302);

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

  it("requires the complete automation scheme and rejects member-cookie ambiguity", async () => {
    await expectOk(automationApi("/api/health"));
    await expectApiError(execute(request("/api/health", {
      headers: { authorization: `Bearer ${APP_TOKEN}` },
    })), 401, "AUTH_REQUIRED");

    const wrongToken = await signedAutomationRequest("/api/health");
    const wrongTokenHeaders = new Headers(wrongToken.headers);
    wrongTokenHeaders.set("authorization", "Bearer wrong-token");
    await expectApiError(execute(new Request(wrongToken, { headers: wrongTokenHeaders })), 401, "AUTH_REQUIRED");

    const signed = await signedAutomationRequest("/api/session");
    const ambiguousHeaders = new Headers(signed.headers);
    ambiguousHeaders.set("cookie", `__Host-memory-session=${sessionBySubject.get("sub-contributor")}`);
    await expectApiError(execute(new Request(signed, { headers: ambiguousHeaders })), 401, "AUTH_REQUIRED");
  });

  it("denies a disabled session member every business API before dispatch", async () => {
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
  it("resolves a member session and uses real waitUntil for bounded cleanup", async () => {
    await env.DB.prepare(
      "INSERT INTO auth_sessions (token_hash, member_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      "expired-session-hash",
      "member-contributor",
      "2026-01-01T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ).run();
    const app = createApp();
    const ctx = createExecutionContext();
    const response = await app.fetch!(incomingRequest("/api/session", {
      headers: { cookie: `__Host-memory-session=${sessionBySubject.get("sub-contributor")}` },
    }), localEnv(), ctx);
    expect(response.status).toBe(200);
    await waitOnExecutionContext(ctx);
    await expect(env.DB.prepare(
      "SELECT token_hash FROM auth_sessions WHERE token_hash = 'expired-session-hash'",
    ).first()).resolves.toBeNull();
  });

  it.each([
    ["/api/session", "POST"],
    ["/api/spaces", "POST"],
    ["/api/spaces/default/collections", "POST"],
    ["/api/submissions", "POST"],
    ["/api/submissions/mine", "POST"],
    ["/api/admin/submissions", "POST"],
    ["/api/admin/members", "POST"],
    ["/api/admin/members/member-disabled/status", "PATCH"],
    ["/api/admin/spaces", "POST"],
    ["/api/admin/spaces/default", "PATCH"],
    ["/api/admin/collections", "POST"],
    ["/api/admin/collections/collection-id", "PATCH"],
    ["/api/admin/audit-events", "POST"],
    ["/api/notes", "POST"],
    ["/api/search", "POST"],
    ["/api/chat", "POST"],
  ])("requires exact same-origin for the unsafe member request %s", async (path, method) => {
    for (const origin of [undefined, "https://foreign.example"]) {
      const headers = new Headers({
        cookie: `__Host-memory-session=${sessionBySubject.get("sub-admin")}`,
        "content-type": "application/json",
      });
      if (origin) headers.set("origin", origin);
      await expectApiError(execute(request(path, { method, headers, body: "{}" })), 403, "FORBIDDEN");
    }
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
      body: "{session-secret-marker",
    });
    const body = await expectApiError(Promise.resolve(response), 400, "INVALID_JSON");
    expect(response.headers.get("x-request-id")).toBe(body.error.requestId);
    expect(JSON.stringify(body)).not.toContain("session-secret-marker");
    expect(JSON.stringify(body)).not.toContain(sessionBySubject.get("sub-admin"));
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
  const headers = new Headers(init?.headers);
  headers.set("cookie", `__Host-memory-session=${sessionBySubject.get(subject)}`);
  if (!isSafeMethod(init?.method || "GET") && !headers.has("origin")) {
    headers.set("origin", APP_CONFIG.canonicalOrigin);
  }
  return execute(request(path, { ...init, headers }));
}

async function automationApi(path: string, init?: RequestInit): Promise<Response> {
  return execute(await signedAutomationRequest(path, init));
}

async function execute(req: Request, app = createApp(), environment = localEnv()): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await app.fetch!(req as Request<unknown, IncomingRequestCfProperties<unknown>>, environment, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

function request(path: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(`https://example.test${path}`, {
    ...init,
    headers,
  });
}

function incomingRequest(
  path: string,
  options: RequestInit = {},
): Request<unknown, IncomingRequestCfProperties<unknown>> {
  return request(path, options) as Request<unknown, IncomingRequestCfProperties<unknown>>;
}

function localEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    AI: fakeAi,
    BOOTSTRAP_ADMIN_EMAIL: "bootstrap-only@example.test",
    ALLOWED_MEMBER_EMAILS: "bootstrap-only@example.test",
    AUTOMATION_CLIENT_ID: AUTOMATION_ID,
    AUTOMATION_SECRET,
    APP_TOKEN,
    ...overrides,
  } as Env;
}

async function signedAutomationRequest(path: string, init: RequestInit = {}): Promise<Request> {
  const unsigned = request(path, init);
  const bodyBytes = new Uint8Array(await unsigned.clone().arrayBuffer());
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const nonceBytes = new Uint8Array(16);
  new DataView(nonceBytes.buffer).setUint32(12, automationNonce += 1);
  const nonce = base64Url(nonceBytes);
  const parsed = new URL(unsigned.url);
  const bodyHash = await sha256Hex(bodyBytes);
  const canonical = [unsigned.method, `${parsed.pathname}${parsed.search}`, timestamp, nonce, bodyHash].join("\n");
  const headers = new Headers(unsigned.headers);
  headers.set("authorization", `Bearer ${APP_TOKEN}`);
  headers.set("x-automation-id", AUTOMATION_ID);
  headers.set("x-automation-timestamp", timestamp);
  headers.set("x-automation-nonce", nonce);
  headers.set("x-automation-signature", await hmacHex(AUTOMATION_SECRET, canonical));
  return new Request(unsigned, { headers });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes))));
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function identitySubject(alias: string): string {
  return ({
    "sub-contributor": "github:201",
    "sub-admin": "github:202",
    "sub-other": "github:203",
    "sub-disabled": "github:204",
  } as Record<string, string>)[alias]!;
}

function fakeGitHubFetch(email: string, id: number): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const outgoing = new Request(String(input), init);
    if (outgoing.url === "https://github.com/login/oauth/access_token") {
      return responseAt(Response.json({ access_token: "local_test_token" }), outgoing.url);
    }
    if (outgoing.url === "https://api.github.com/user") return responseAt(Response.json({ id }), outgoing.url);
    if (outgoing.url === "https://api.github.com/user/emails") {
      return responseAt(Response.json([{ email, primary: true, verified: true, visibility: "private" }]), outgoing.url);
    }
    throw new Error("unexpected local GitHub fake URL");
  }) as unknown as typeof fetch;
}

function responseAt(response: Response, url: string): Response {
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function setCookies(response: Response): string[] {
  const extended = response.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof extended.getSetCookie === "function") return extended.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/, (?=__Host-)/u) : [];
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((candidate) => candidate.startsWith(`${name}=`));
  if (!cookie) throw new Error(`missing ${name} cookie`);
  return cookiePair(cookie).slice(name.length + 1);
}

function cookiePair(cookie: string): string {
  return cookie.split(";", 1)[0]!;
}

async function seedMembers(): Promise<void> {
  for (const member of [
    ["member-contributor", identitySubject("sub-contributor"), "contributor@example.test", "contributor", "active"],
    ["member-admin", identitySubject("sub-admin"), "admin@example.test", "admin", "active"],
    ["member-other", identitySubject("sub-other"), "other@example.test", "contributor", "active"],
    ["member-disabled", identitySubject("sub-disabled"), "disabled@example.test", "contributor", "disabled"],
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
