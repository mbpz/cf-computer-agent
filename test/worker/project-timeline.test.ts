/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-09T10:00:00.000Z");

describe("project timeline route", () => {
  let token = "";
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS); vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('timeline-a', 'subject-timeline-a', 'timeline-a@example.test', 'contributor', 'active', ?, ?), ('timeline-b', 'subject-timeline-b', 'timeline-b@example.test', 'contributor', 'active', ?, ?)").bind(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()).run();
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES ('project-a', 'timeline-a', 'project-a', 'Private project', '', 'active', 10, NULL, ?, ?), ('project-b', 'timeline-b', 'project-b', 'Other project', '', 'active', 10, NULL, ?, ?)").bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    const members = new MembersRepository(env.DB); const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    token = (await sessions.create((await members.findByIdentitySubject("subject-timeline-a"))!)).token;
  });

  it("creates, lists, replays and isolates timeline items", async () => {
    const app = createApp();
    const create = await api(app, "/api/projects/project-a/timeline", token, { method: "POST", body: JSON.stringify({ id: "timeline-item-a", clientKey: "timeline-client-a", kind: "meeting", title: "Kickoff", body: "Align scope" }) });
    expect(create.status).toBe(201);
    const replay = await api(app, "/api/projects/project-a/timeline", token, { method: "POST", body: JSON.stringify({ id: "ignored", clientKey: "timeline-client-a", kind: "decision", title: "Ignored" }) });
    expect(replay.status).toBe(200); expect((await replay.json() as any).item.kind).toBe("meeting");
    const list = await api(app, "/api/projects/project-a/timeline?limit=20", token);
    expect(list.status).toBe(200); expect((await list.json() as any).items).toHaveLength(1);
    const cross = await api(app, "/api/projects/project-b/timeline?limit=20", token);
    expect(cross.status).toBe(404);
    await waitOnExecutionContext(createExecutionContext());
  });
});

describe("workbench project timeline convergence", () => {
  let tokenA = "";
  let tokenB = "";
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS); vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('timeline-a', 'subject-timeline-a', 'timeline-a@example.test', 'contributor', 'active', ?, ?), ('timeline-b', 'subject-timeline-b', 'timeline-b@example.test', 'contributor', 'active', ?, ?)").bind(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()).run();
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES ('project-a', 'timeline-a', 'project-a', 'Private project', '', 'active', 10, NULL, ?, ?), ('project-a2', 'timeline-a', 'project-a2', 'Second project', '', 'active', 10, NULL, ?, ?), ('project-b', 'timeline-b', 'project-b', 'Other project', '', 'active', 10, NULL, ?, ?)").bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    const members = new MembersRepository(env.DB); const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    tokenA = (await sessions.create((await members.findByIdentitySubject("subject-timeline-a"))!)).token;
    tokenB = (await sessions.create((await members.findByIdentitySubject("subject-timeline-b"))!)).token;
  });

  it("workbench-project-timeline:query_or_idempotency:create-timeline-item — concurrent double-submit and lost-response retry converge on one item while cross-project reuse is rejected and members stay isolated", async () => {
    const app = createApp();
    const [first, second] = await Promise.all([
      api(app, "/api/projects/project-a/timeline", tokenA, { method: "POST", body: JSON.stringify({ id: "timeline-race-1", clientKey: "timeline-race-key", kind: "meeting", title: "Race one" }) }),
      api(app, "/api/projects/project-a/timeline", tokenA, { method: "POST", body: JSON.stringify({ id: "timeline-race-2", clientKey: "timeline-race-key", kind: "decision", title: "Race two" }) }),
    ]);
    expect([first.status, second.status].sort((left, right) => left - right)).toEqual([200, 201]);
    const bodies = await Promise.all([first.json(), second.json()]) as Array<{ item: { id: string }; created: boolean }>;
    expect(bodies.filter(body => body.created)).toHaveLength(1);
    expect(new Set(bodies.map(body => body.item.id)).size).toBe(1);
    const winnerId = bodies[0]!.item.id;
    const raced = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_timeline_items WHERE member_id = 'timeline-a' AND client_key = 'timeline-race-key'").first<{ count: number }>();
    expect(raced?.count).toBe(1);

    const retry = await api(app, "/api/projects/project-a/timeline", tokenA, { method: "POST", body: JSON.stringify({ id: "timeline-race-3", clientKey: "timeline-race-key", kind: "action_item", title: "Lost response retry" }) });
    expect(retry.status).toBe(200);
    const retryBody = await retry.json() as { item: { id: string; kind: string }; created: boolean };
    expect(retryBody.created).toBe(false);
    expect(retryBody.item.id).toBe(winnerId);
    expect(retryBody.item.kind).not.toBe("action_item");
    const afterRetry = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_timeline_items WHERE member_id = 'timeline-a' AND client_key = 'timeline-race-key'").first<{ count: number }>();
    expect(afterRetry?.count).toBe(1);

    const cross = await api(app, "/api/projects/project-a2/timeline", tokenA, { method: "POST", body: JSON.stringify({ id: "timeline-cross", clientKey: "timeline-race-key", kind: "meeting", title: "Cross project reuse" }) });
    expect(cross.status).toBe(409);
    expect((await cross.json() as { error: { code: string } }).error.code).toBe("PROJECT_TIMELINE_CLIENT_KEY_CONFLICT");
    const afterCross = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_timeline_items WHERE member_id = 'timeline-a' AND client_key = 'timeline-race-key'").first<{ count: number }>();
    expect(afterCross?.count).toBe(1);

    const other = await api(app, "/api/projects/project-b/timeline", tokenB, { method: "POST", body: JSON.stringify({ id: "timeline-b-item", clientKey: "timeline-race-key", kind: "meeting", title: "Other member" }) });
    expect(other.status).toBe(201);
    const otherBody = await other.json() as { item: { id: string }; created: boolean };
    expect(otherBody.created).toBe(true);
    expect(otherBody.item.id).not.toBe(winnerId);
    const isolated = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_timeline_items WHERE member_id = 'timeline-b' AND client_key = 'timeline-race-key'").first<{ count: number }>();
    expect(isolated?.count).toBe(1);
    expect((await api(app, "/api/projects/project-b/timeline?limit=20", tokenA)).status).toBe(404);
    expect((await api(app, `/api/projects/project-b/timeline/${otherBody.item.id}`, tokenA)).status).toBe(404);
    const ownList = await api(app, "/api/projects/project-a/timeline?limit=20", tokenA);
    expect((await ownList.json() as { items: Array<{ id: string }> }).items.map(item => item.id)).toEqual([winnerId]);
  });

  it("workbench-project-timeline:query_or_idempotency:transition-timeline-status — concurrent transitions converge on one winner, retries refuse stale versions and foreign members are locked out", async () => {
    const app = createApp();
    const create = await api(app, "/api/projects/project-a/timeline", tokenA, { method: "POST", body: JSON.stringify({ id: "timeline-status-item", clientKey: "timeline-status-key", kind: "milestone", title: "Status item" }) });
    const created = await create.json() as { item: { id: string; updatedAt: string } };
    const path = `/api/projects/project-a/timeline/${created.item.id}/status`;
    const initialVersion = created.item.updatedAt;

    const [done, archived] = await Promise.all([
      api(app, path, tokenA, { method: "POST", body: JSON.stringify({ status: "done", expectedUpdatedAt: initialVersion }) }),
      api(app, path, tokenA, { method: "POST", body: JSON.stringify({ status: "archived", expectedUpdatedAt: initialVersion }) }),
    ]);
    expect([done.status, archived.status].sort((left, right) => left - right)).toEqual([200, 409]);
    const loser = done.status === 409 ? done : archived;
    const winner = done.status === 200 ? done : archived;
    expect((await loser.json() as { error: { code: string } }).error.code).toBe("PROJECT_TIMELINE_VERSION_CONFLICT");
    const winnerBody = await winner.json() as { status: string; updatedAt: string };
    const loserStatus = winnerBody.status === "done" ? "archived" : "done";

    const reread = await api(app, `/api/projects/project-a/timeline/${created.item.id}`, tokenA);
    const authoritative = await reread.json() as { status: string; updatedAt: string };
    expect(authoritative.status).toBe(winnerBody.status);
    expect(authoritative.updatedAt).toBe(winnerBody.updatedAt);

    const staleRetry = await api(app, path, tokenA, { method: "POST", body: JSON.stringify({ status: loserStatus, expectedUpdatedAt: initialVersion }) });
    expect(staleRetry.status).toBe(409);
    expect((await staleRetry.json() as { error: { code: string } }).error.code).toBe("PROJECT_TIMELINE_VERSION_CONFLICT");
    const afterStale = await env.DB.prepare("SELECT COUNT(*) AS count, MAX(status) AS status FROM project_timeline_items WHERE member_id = 'timeline-a' AND id = 'timeline-status-item'").first<{ count: number; status: string }>();
    expect(afterStale?.count).toBe(1);
    expect(afterStale?.status).toBe(winnerBody.status);

    const converge = await api(app, path, tokenA, { method: "POST", body: JSON.stringify({ status: loserStatus, expectedUpdatedAt: authoritative.updatedAt }) });
    expect(converge.status).toBe(200);
    expect((await converge.json() as { status: string }).status).toBe(loserStatus);

    const foreign = await api(app, path, tokenB, { method: "POST", body: JSON.stringify({ status: "archived", expectedUpdatedAt: authoritative.updatedAt }) });
    expect(foreign.status).toBe(404);
    expect((await foreign.json() as { error: { code: string } }).error.code).toBe("PROJECT_NOT_FOUND");
  });
});

async function api(app: ReturnType<typeof createApp>, path: string, session: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${session}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  if (init.body) headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await app.fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
