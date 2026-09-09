/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-09T10:00:00.000Z");

describe("today workbench route", () => {
  let sessionA = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)")
      .bind("today-a", "subject-today-a", "today-a@example.test", NOW.toISOString(), NOW.toISOString(), "today-b", "subject-today-b", "today-b@example.test", NOW.toISOString(), NOW.toISOString()).run();
    const sessions = new SessionService(env.DB, new MembersRepository(env.DB), { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await new MembersRepository(env.DB).findByIdentitySubject("subject-today-a"))!)).token;
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('today-task-a', 'today-a', 'Today task', '', 'todo', 0, 'medium', ?, ?, ?), ('today-task-b', 'today-b', 'Other task', '', 'todo', 0, 'medium', ?, ?, ?)")
      .bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    await env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, status, created_at, updated_at) VALUES ('today-inbox-a', 'today-a', 'today-a', 'text', 'Capture', 'inbox', ?, ?), ('today-inbox-b', 'today-b', 'today-b', 'text', 'Private', 'inbox', ?, ?)")
      .bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES ('today-project-a', 'today-a', 'today-project-a', 'Active project', 'active', 20, ?, ?), ('today-project-b', 'today-b', 'today-project-b', 'Other project', 'active', 80, ?, ?)")
      .bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    await env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, description, starts_at, ends_at, timezone, all_day, status, created_at, updated_at) VALUES ('today-event-a', 'today-a', 'today-event-a', 'event', 'Today event', '', ?, ?, 'UTC', 0, 'scheduled', ?, ?), ('today-event-b', 'today-b', 'today-event-b', 'event', 'Other event', '', ?, ?, 'UTC', 0, 'scheduled', ?, ?)")
      .bind(NOW.getTime(), NOW.getTime() + 3_600_000, NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime() + 3_600_000, NOW.getTime(), NOW.getTime()).run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns one bounded member-private snapshot", async () => {
    const response = await api("/api/today", sessionA);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      date: "2026-09-09",
      tasks: { items: [{ id: "today-task-a" }] },
      inbox: [{ id: "today-inbox-a" }],
      projects: [{ id: "today-project-a" }],
      calendar: [{ id: "today-event-a" }],
    });
    expect((await api("/api/today?unexpected=1", sessionA)).status).toBe(400);
  });
});

async function api(path: string, token: string): Promise<Response> {
  const headers = new Headers({ cookie: `__Host-memory-session=${token}`, origin: "https://memory.crgmhrc.asia" });
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
