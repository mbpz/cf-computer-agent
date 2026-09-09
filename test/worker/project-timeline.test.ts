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
