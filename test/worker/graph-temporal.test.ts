/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-20T12:00:00.000Z");

describe("temporal graph worker contract", () => {
  let sessionA = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('temporal-a', 'subject-temporal-a', 'temporal-a@example.test', 'contributor', 'active', ?, ?), ('temporal-b', 'subject-temporal-b', 'temporal-b@example.test', 'contributor', 'active', ?, ?)").bind(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('temporal-recent', 'temporal-a', 'Recent', '', 'todo', 0, 'medium', NULL, ?, ?), ('temporal-old', 'temporal-a', 'Old', '', 'todo', 0, 'medium', NULL, ?, ?), ('temporal-other', 'temporal-b', 'Other', '', 'todo', 0, 'medium', NULL, ?, ?)").bind(
      Date.parse("2026-09-18T12:00:00.000Z"), Date.parse("2026-09-18T12:00:00.000Z"),
      Date.parse("2026-09-01T12:00:00.000Z"), Date.parse("2026-09-01T12:00:00.000Z"),
      Date.parse("2026-09-18T12:00:00.000Z"), Date.parse("2026-09-18T12:00:00.000Z"),
    ).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-temporal-a"))!)).token;
  });

  it("returns only recent owned objects and enforces temporal range bounds", async () => {
    const recent = await api("/api/graph?from=2026-09-13T00:00:00.000Z&to=2026-09-20T12:00:00.000Z&changeKind=added", sessionA);
    expect(recent.status).toBe(200);
    expect((await recent.json() as { nodes: Array<{ id: string; metadata: Record<string, unknown> }> }).nodes).toEqual([
      expect.objectContaining({ id: "task:temporal-recent", metadata: expect.objectContaining({ changeKind: "added" }) }),
    ]);

    const invalid = await api("/api/graph?from=2026-01-01T00:00:00.000Z&to=2026-09-20T12:00:00.000Z", sessionA);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "GRAPH_QUERY_INVALID" } });
  });
});

async function api(path: string, session: string): Promise<Response> {
  const headers = new Headers({ cookie: `__Host-memory-session=${session}`, origin: "https://memory.crgmhrc.asia" });
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
