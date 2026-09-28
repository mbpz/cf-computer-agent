/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";
import { loadWorkbenchReview } from "../../frontend/lib/workbench-review-data";

const NOW = new Date("2026-09-09T10:00:00.000Z");

describe("review workbench route", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)")
      .bind("review-a", "subject-review-a", "review-a@example.test", NOW.toISOString(), NOW.toISOString(), "review-b", "subject-review-b", "review-b@example.test", NOW.toISOString(), NOW.toISOString()).run();
    const sessions = new SessionService(env.DB, new MembersRepository(env.DB), { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await new MembersRepository(env.DB).findByIdentitySubject("subject-review-a"))!)).token;
    sessionB = (await sessions.create((await new MembersRepository(env.DB).findByIdentitySubject("subject-review-b"))!)).token;
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at) VALUES ('review-task-a', 'review-a', 'Today task', '', 'todo', 0, 'medium', ?, ?, ?), ('review-task-b', 'review-b', 'Other task', '', 'todo', 0, 'medium', ?, ?, ?)")
      .bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    await env.DB.prepare("INSERT INTO inbox_items (id, member_id, client_key, kind, content, status, created_at, updated_at) VALUES ('review-inbox-a', 'review-a', 'review-a', 'text', 'Capture', 'inbox', ?, ?), ('review-inbox-b', 'review-b', 'review-b', 'text', 'Private', 'inbox', ?, ?)")
      .bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES ('review-project-a', 'review-a', 'review-project-a', 'Active project', 'active', 20, ?, ?), ('review-project-b', 'review-b', 'review-project-b', 'Other project', 'active', 80, ?, ?)")
      .bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    for (const member of ["a", "b"]) {
      await env.DB.prepare("INSERT INTO focus_sessions (id, member_id, task_id, client_key, status, started_at, paused_at, elapsed_ms, created_at, updated_at) VALUES (?, ?, ?, ?, 'paused', ?, ?, ?, ?, ?)")
        .bind(`review-focus-${member}`, `review-${member}`, `review-task-${member}`, `review-focus-${member}`, NOW.getTime()-120000, NOW.getTime(), member === "a" ? 60000 : 120000, NOW.getTime()-120000, NOW.getTime()).run();
      for (const status of ["done", "blocked"]) {
        await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, '', ?, 0, 'medium', ?, ?, ?, ?)")
          .bind(`review-${status}-${member}`, `review-${member}`, `Private ${status} ${member}`, status, NOW.getTime() - 86400000, status === "done" ? NOW.getTime() : null, NOW.getTime(), NOW.getTime()).run();
      }
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(["daily", "weekly"])("round-trips real %s D1 snapshots without leaking either member", async period => {
    for (const [token, own, other] of [[sessionA,"a","b"],[sessionB,"b","a"]]) {
      const snapshot = await loadWorkbenchReview(period as "daily"|"weekly", input => api(String(input),token!));
      expect(snapshot.completed.map(row => row.id)).toEqual([`review-done-${own}`]);
      expect(snapshot.overdue.map(row => row.id)).toEqual([`review-blocked-${own}`]);
      expect(snapshot.blocked.map(row => row.id)).toEqual([`review-blocked-${own}`]);
      expect(snapshot.inbox.map(row => row.id)).toEqual([`review-inbox-${own}`]);
      expect(snapshot.projects.map(row => row.id)).toEqual([`review-project-${own}`]);
      expect(snapshot.focusElapsedMs).toBe(own === "a" ? 60000 : 120000);
      expect(snapshot.taskSummary).toMatchObject({todo:1,blocked:1,done:1,overdue:1});
      expect(JSON.stringify(snapshot)).not.toContain(`-${other}"`);
    }
    const rows = await env.DB.prepare("SELECT member_id FROM workbench_review_snapshots WHERE period = ? ORDER BY member_id").bind(period).all();
    expect(rows.results).toEqual([{member_id:"review-a"},{member_id:"review-b"}]);
  });

  it("re-authorizes all target kinds and returns the same 404 for foreign and absent IDs", async () => {
    for (const [token,own,other] of [[sessionA,"a","b"],[sessionB,"b","a"]]) {
      for (const prefix of ["tasks/review-done","inbox/review-inbox","projects/review-project"]) {
        expect((await api(`/api/${prefix}-${own}`,token!)).status).toBe(200);
        const foreign = await api(`/api/${prefix}-${other}`,token!);
        const absent = await api(`/api/${prefix}-missing`,token!);
        expect(foreign.status).toBe(404); expect(absent.status).toBe(404);
        const foreignError = (await foreign.json() as {error: Record<string, unknown>}).error;
        const absentError = (await absent.json() as {error: Record<string, unknown>}).error;
        const {requestId: foreignRequest, ...foreignPublic} = foreignError;
        const {requestId: absentRequest, ...absentPublic} = absentError;
        expect(typeof foreignRequest).toBe("string"); expect(typeof absentRequest).toBe("string");
        expect(foreignPublic).toEqual(absentPublic);
      }
    }
  });

  it("does not authorize a deleted target merely because it remains in a saved snapshot", async () => {
    const snapshot = await loadWorkbenchReview("daily", input => api(String(input),sessionA));
    expect(snapshot.completed[0]?.id).toBe("review-done-a");
    await env.DB.prepare("DELETE FROM tasks WHERE id = 'review-done-a' AND member_id = 'review-a'").run();
    expect((await api("/api/tasks/review-done-a",sessionA)).status).toBe(404);
    const cached = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(cached.completed[0]?.id).toBe("review-done-a"); // historical title is not a detail authorization receipt
  });

  it("caps completed rows at 20 while preserving the member's actual summary count", async () => {
    const statements = Array.from({length:25},(_,i) => env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, completed_at, created_at, updated_at) VALUES (?, 'review-a', 'Bounded task', '', 'done', 100, 'medium', ?, ?, ?)").bind(`bounded-${i}`,NOW.getTime(),NOW.getTime(),NOW.getTime()));
    await env.DB.batch(statements);
    const snapshot = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(snapshot.completed).toHaveLength(20); expect(snapshot.taskSummary.done).toBe(26);
    expect(snapshot.completed.every(row => row.id !== "review-done-b")).toBe(true);
    const other = await loadWorkbenchReview("daily",input => api(String(input),sessionB));
    expect(other.completed).toHaveLength(1); expect(other.taskSummary.done).toBe(1);
  });

  it("rejects member overrides, unknown/duplicate period parameters and anonymous reads", async () => {
    for (const query of ["period=daily&memberId=review-b","period=weekly&x=1","period=daily&period=weekly","period=monthly"]) {
      expect((await api(`/api/workbench/review?${query}`,sessionA)).status).toBe(400);
    }
    expect((await api("/api/workbench/review?period=daily", "")).status).toBe(401);
  });
});

async function api(path: string, token: string): Promise<Response> {
  const headers = new Headers({ cookie: `__Host-memory-session=${token}`, origin: "https://memory.crgmhrc.asia" });
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
