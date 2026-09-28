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
      expect(snapshot.overdue.map(row => row.id)).toEqual(period === "weekly" ? [`review-blocked-${own}`] : []);
      expect(snapshot.blocked.map(row => row.id)).toEqual([`review-blocked-${own}`]);
      expect(snapshot.inbox.map(row => row.id)).toEqual([`review-inbox-${own}`]);
      expect(snapshot.projects.map(row => row.id)).toEqual([`review-project-${own}`]);
      expect(snapshot.focusElapsedMs).toBe(0); // paused sessions are not attributed to a finished period
      expect(snapshot.taskSummary).toMatchObject({todo:1,blocked:1,done:1,overdue:period === "weekly" ? 1 : 0});
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
    expect(cached.completed).toEqual([]); // each GET refreshes the persisted projection
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

  it("uses a stable Monday ISO week range including the previous ISO year", async () => {
    vi.setSystemTime(new Date("2021-01-01T10:00:00.000Z"));
    const members = new MembersRepository(env.DB);
    const token = (await new SessionService(env.DB, members, {waitUntil: () => undefined, now: () => new Date()}).create((await members.findByIdentitySubject("subject-review-a"))!)).token;
    const snapshot = await loadWorkbenchReview("weekly", input => api(String(input),token));
    expect(snapshot.periodKey).toBe("2020-W53");
    expect(snapshot.from).toBe("2020-12-28T00:00:00.000Z");
    expect(snapshot.to).toBe("2021-01-04T00:00:00.000Z");
  });

  it("filters before limiting and counts the entire period, excluding future and foreign rows", async () => {
    const start = Date.parse("2026-09-09T00:00:00.000Z"), end = start + 86400000;
    for (const [id, at] of [["before",start-1],["start",start],["end",end],["future",NOW.getTime()+1]] as const) {
      await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, completed_at, created_at, updated_at) VALUES (?, 'review-a', ?, '', 'done', 100, 'medium', ?, ?, ?)").bind(id,id,at,at,at).run();
    }
    // More than a sample of old rows: a post-LIMIT filter would hide the relevant ones.
    await env.DB.batch(Array.from({length:25},(_,i) => env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, completed_at, created_at, updated_at) VALUES (?, 'review-a', 'Old', '', 'done', 100, 'medium', ?, ?, ?)").bind(`old-${i}`,start-1,NOW.getTime(),NOW.getTime())));
    const snapshot = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(snapshot.completed.map(row => row.id).sort()).toEqual(["review-done-a","start"]);
    expect(snapshot.taskSummary.done).toBe(2);
    expect(snapshot.overdue).toEqual([]); // yesterday's deadline belongs to the weekly report, not today
    const weekly = await loadWorkbenchReview("weekly",input => api(String(input),sessionA));
    expect(weekly.taskSummary.done).toBe(28);
    expect(weekly.completed).toHaveLength(20);
    expect(weekly.overdue.map(row => row.id)).toEqual(["review-blocked-a"]);
  });

  it("refreshes changed and deleted sources on repeated reads without creating a second period row", async () => {
    const first = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    await env.DB.prepare("UPDATE tasks SET title = 'Changed after first read' WHERE id = 'review-done-a'").run();
    const second = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(second.id).toBe(first.id);
    expect(second.completed[0]?.title).toBe("Changed after first read");
    await env.DB.prepare("DELETE FROM tasks WHERE id = 'review-done-a'").run();
    const third = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(third.completed).toEqual([]); expect(third.taskSummary.done).toBe(0);
    const rows = await env.DB.prepare("SELECT id FROM workbench_review_snapshots WHERE member_id = 'review-a' AND period = 'daily'").all();
    expect(rows.results).toEqual([{id:first.id}]);
  });

  it("counts ended focus sessions by end time rather than the current paused session", async () => {
    const start = Date.parse("2026-09-09T00:00:00.000Z");
    for (const [id,ended,elapsed] of [["prior",start-1,90000],["boundary",start,30000],["within",NOW.getTime(),60000],["future",NOW.getTime()+1,90000]] as const) {
      await env.DB.prepare("INSERT INTO focus_sessions (id, member_id, task_id, client_key, status, started_at, ended_at, elapsed_ms, created_at, updated_at) VALUES (?, 'review-a', 'review-task-a', ?, 'completed', ?, ?, ?, ?, ?)").bind(id,id,ended-120000,ended,elapsed,ended-120000,ended).run();
    }
    const daily = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(daily.focusElapsedMs).toBe(90000);
    const weekly = await loadWorkbenchReview("weekly",input => api(String(input),sessionA));
    expect(weekly.focusElapsedMs).toBe(180000);
  });

  it("filters every activity collection and uses deterministic top-20 ordering", async () => {
    const prior = Date.parse("2026-09-08T23:59:59.999Z");
    await env.DB.prepare("UPDATE tasks SET updated_at = ? WHERE id = 'review-blocked-a'").bind(prior).run();
    await env.DB.prepare("UPDATE inbox_items SET created_at = ? WHERE id = 'review-inbox-a'").bind(prior).run();
    await env.DB.prepare("UPDATE projects SET created_at = ?, updated_at = ? WHERE id = 'review-project-a'").bind(prior,prior).run();
    const daily = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(daily.blocked).toEqual([]); expect(daily.taskSummary.blocked).toBe(0);
    expect(daily.inbox).toEqual([]); expect(daily.projects).toEqual([]);
    const weekly = await loadWorkbenchReview("weekly",input => api(String(input),sessionA));
    expect(weekly.blocked.map(row => row.id)).toEqual(["review-blocked-a"]);
    expect(weekly.inbox.map(row => row.id)).toEqual(["review-inbox-a"]);
    expect(weekly.projects.map(row => row.id)).toEqual(["review-project-a"]);
    await env.DB.batch(Array.from({length:25},(_,i) => env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, completed_at, created_at, updated_at) VALUES (?, 'review-a', 'Tie', '', 'done', 100, 'medium', ?, ?, ?)").bind(`tie-${String(i).padStart(2,"0")}`,NOW.getTime(),NOW.getTime(),NOW.getTime())));
    const tied = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(tied.completed.map(row => row.id)).toEqual(["review-done-a",...Array.from({length:19},(_,i)=>`tie-${String(i).padStart(2,"0")}`)]);
    expect(tied.taskSummary.done).toBe(26);
  });

  it("serializes concurrent refreshes into one row with matching counts and monotonic receipts", async () => {
    const responses = await Promise.all(Array.from({length:8},() => api("/api/workbench/review?period=daily",sessionA)));
    const snapshots = await Promise.all(responses.map(async response => {expect(response.status).toBe(200); return await response.json() as any;}));
    expect(new Set(snapshots.map(s => s.id)).size).toBe(1);
    expect(new Set(snapshots.map(s => s.updatedAt)).size).toBe(8);
    for (const snapshot of snapshots) { expect(snapshot.completed).toHaveLength(1); expect(snapshot.taskSummary.done).toBe(1); }
    const rows = await env.DB.prepare("SELECT updated_at, created_at, payload_json FROM workbench_review_snapshots WHERE member_id='review-a' AND period='daily'").all<any>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].updated_at).toBe(NOW.getTime()+7);
    expect(rows.results[0].created_at).toBe(NOW.getTime());
    expect(JSON.parse(rows.results[0].payload_json).completed).toHaveLength(1);
    // Source writes racing refresh cannot create a mixed aggregate receipt.
    const changes = await Promise.all(Array.from({length:4},async (_,i) => {
      await env.DB.prepare("INSERT INTO tasks (id,member_id,title,notes,status,progress,priority,completed_at,created_at,updated_at) VALUES (?, 'review-a', 'Race', '', 'done', 100, 'medium', ?, ?, ?)").bind(`race-${i}`,NOW.getTime(),NOW.getTime(),NOW.getTime()).run();
      return loadWorkbenchReview("daily",input => api(String(input),sessionA));
    }));
    for (const snapshot of changes) expect(snapshot.completed.length).toBe(snapshot.taskSummary.done);
    const final = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(final.taskSummary.done).toBe(5); expect(final.completed).toHaveLength(5);
  });

  it("does not let a delayed older observation overwrite a newer period projection", async () => {
    const {WorkbenchReviewRepository} = await import("../../src/workbench-review/repository");
    const {reviewRange} = await import("../../shared/workbench-review-period");
    const repository = new WorkbenchReviewRepository(env.DB);
    const newer = new Date(NOW.getTime()+60000);
    await env.DB.prepare("UPDATE tasks SET completed_at=?, updated_at=? WHERE id='review-done-a'").bind(newer.getTime(),newer.getTime()).run();
    await repository.refresh("review-a","daily",reviewRange("daily",newer),newer);
    const storedClock = await env.DB.prepare("SELECT json_type(payload_json, '$.observedAt') AS kind, json_extract(payload_json, '$.observedAt') AS value FROM workbench_review_snapshots WHERE member_id='review-a'").first();
    expect(storedClock).toMatchObject({value: newer.getTime()});
    expect(["integer", "real"]).toContain(storedClock?.kind);
    const delayed = await repository.refresh("review-a","daily",reviewRange("daily",NOW),NOW);
    expect(delayed.completed.map(row => row.id)).toEqual(["review-done-a"]);
    expect(delayed.taskSummary.done).toBe(1);
  });

  it("keeps the old stored snapshot on write failure and repairs it only on an explicit retry", async () => {
    const initial = await api("/api/workbench/review?period=daily",sessionA);
    expect(initial.status).toBe(200);
    const saved = await env.DB.prepare("SELECT * FROM workbench_review_snapshots WHERE member_id='review-a'").first();
    await env.DB.prepare("UPDATE tasks SET title='Changed' WHERE id='review-done-a'").run();
    await env.DB.exec("CREATE TRIGGER review_fail BEFORE UPDATE ON workbench_review_snapshots BEGIN SELECT RAISE(ABORT, 'review refresh injection'); END;");
    expect((await api("/api/workbench/review?period=daily",sessionA)).status).toBe(500);
    expect(await env.DB.prepare("SELECT * FROM workbench_review_snapshots WHERE member_id='review-a'").first()).toEqual(saved);
    await env.DB.exec("DROP TRIGGER review_fail;");
    const recovered = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(recovered.completed[0]?.title).toBe("Changed");
  });

  it("repairs a malformed legacy payload instead of treating it as authoritative", async () => {
    await api("/api/workbench/review?period=daily",sessionA);
    await env.DB.prepare("UPDATE workbench_review_snapshots SET payload_json = 'broken' WHERE member_id='review-a'").run();
    const snapshot = await loadWorkbenchReview("daily",input => api(String(input),sessionA));
    expect(snapshot.periodKey).toBe("2026-09-09");
    expect(snapshot.completed[0]?.id).toBe("review-done-a");
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
