/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { deriveCursorScopeKey, encodeOpaqueCursor } from "../../src/pagination";
import { routeGraphApi } from "../../src/routes/graph";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-17T10:00:00.000Z");

describe("private work graph route", () => {
  let app: ReturnType<typeof createApp>;
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", NOW.toISOString(), NOW.toISOString(),
      "member-b", "subject-b", "b@example.test", NOW.toISOString(), NOW.toISOString(),
    ).run();
    await env.DB.prepare(
      "INSERT INTO projects (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, '', 'active', 10, NULL, ?, ?), (?, ?, ?, ?, '', 'active', 10, NULL, ?, ?)",
    ).bind(
      "project-a", "member-a", "project-a", "Private project", NOW.getTime(), NOW.getTime(),
      "project-b", "member-b", "project-b", "Other project", NOW.getTime(), NOW.getTime(),
    ).run();

    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
    app = createApp();
  });

  it("requires authentication and returns request-correlated JSON errors", async () => {
    const response = await api(app, "/api/graph?scope=project&rootId=project-a", "");
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const body = await response.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe("AUTH_REQUIRED");
    expect(body.error.requestId).toBe(response.headers.get("x-request-id"));
  });

  it("rejects principals without tasks capability", async () => {
    await expect(routeGraphApi(
      new Request("https://memory.crgmhrc.asia/api/graph"),
      new URL("https://memory.crgmhrc.asia/api/graph"),
      { requestId: "graph-test" },
      { kind: "automation", role: "automation" },
      { graph: { get: async () => ({ nodes: [], edges: [], rootId: null, depth: 1, truncated: false }) } as never },
    )).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("returns an owned project graph and hides another member root as not found", async () => {
    const owned = await api(app, "/api/graph?scope=project&rootId=project-a&depth=1&limit=50", sessionA);
    expect(owned.status).toBe(200);
    expect(owned.headers.get("x-request-id")).toBeTruthy();
    await expect(owned.json()).resolves.toMatchObject({ rootId: "project-a", nodes: [{ id: "project:project-a" }] });

    const crossMember = await api(app, "/api/graph?scope=project&rootId=project-b&depth=1&limit=50", sessionA);
    expect(crossMember.status).toBe(404);
    await expect(crossMember.json()).resolves.toMatchObject({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  it("rejects unknown, duplicate, and out-of-range graph query parameters", async () => {
    for (const path of [
      "/api/graph?unknown=value",
      "/api/graph?scope=project&scope=workspace",
      "/api/graph?depth=3",
      "/api/graph?limit=101",
      "/api/graph?limit=0",
      "/api/graph?cursor=",
    ]) {
      const response = await api(app, path, sessionA);
      expect(response.status, path).toBe(400);
      await expect(response.json(), path).resolves.toMatchObject({ error: { code: "GRAPH_QUERY_INVALID" } });
    }
  });

  it("binds cursors to member, scope, root, depth, and types", async () => {
    const scope = { memberId: "member-a", scope: "project", rootId: "project-a", depth: 1, types: "" };
    const scopeKey = await deriveCursorScopeKey("graph", scope);
    const cursor = encodeOpaqueCursor({ v: 1, kind: "graph", scopeKey, offset: 50 });
    const accepted = await api(app, `/api/graph?scope=project&rootId=project-a&depth=1&limit=50&cursor=${cursor}`, sessionA);
    expect(accepted.status).toBe(200);

    const tampered = encodeOpaqueCursor({ v: 1, kind: "graph", scopeKey, offset: 50, rootId: "project-b" });
    const rejected = await api(app, `/api/graph?scope=project&rootId=project-a&depth=1&limit=50&cursor=${tampered}`, sessionA);
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toMatchObject({ error: { code: "GRAPH_PAGE_INVALID" } });

    const memberBound = await api(app, `/api/graph?scope=project&rootId=project-a&depth=1&limit=50&cursor=${cursor}`, sessionB);
    expect(memberBound.status).toBe(400);
    await expect(memberBound.json()).resolves.toMatchObject({ error: { code: "GRAPH_PAGE_INVALID" } });
  });
});

async function api(app: ReturnType<typeof createApp>, path: string, session: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (session) headers.set("cookie", `__Host-memory-session=${session}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  const context = createExecutionContext();
  const response = await app.fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
