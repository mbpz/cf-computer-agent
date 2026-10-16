/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { GoalsRepository } from "../../src/goals/repository";
import { GoalsService } from "../../src/goals/service";
import type { Goal } from "../../src/goals/types";
import { routeGoalsApi } from "../../src/routes/goals";

describe("private Goals migration contract", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
  });

  it("creates a member-scoped goals schema with bounded states and stable pagination index", async () => {
    const table = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goals'").first<{ sql: string }>();
    expect(table?.sql).toContain("status TEXT NOT NULL");
    expect(table?.sql).toContain("progress INTEGER NOT NULL");
    expect(table?.sql).toContain("client_key TEXT NOT NULL");
    expect(table?.sql).toContain("status IN ('active', 'paused', 'completed', 'archived')");
    const columns = await env.DB.prepare("PRAGMA table_info('goals')").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id", "member_id", "client_key", "title", "description", "status", "progress", "target_at", "created_at", "updated_at",
    ]);
    const indexes = await env.DB.prepare("PRAGMA index_list('goals')").all<{ name: string }>();
    expect(indexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_goals_member_status_updated",
      "idx_goals_member_client_key",
    ]));
  });

  it("allows the same client key for different members but rejects a same-member replay", async () => {
    const row = ["goal-a", "member-a", "goal-1", "Launch v2", null, "active", 0, null, 1, 1];
    await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...row).run();
    await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-b", "member-b", ...row.slice(2)).run();
    await expect(env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-replay", ...row.slice(1)).run()).rejects.toThrow();
  });

  it("rejects invalid Goal status and progress values at the database boundary", async () => {
    await expect(env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-invalid", "member-a", "goal-invalid", "Bad", null, "deleted", 0, null, 1, 1).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, description, status, progress, target_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind("goal-invalid-progress", "member-a", "goal-invalid-progress", "Bad", null, "active", 101, null, 1, 1).run()).rejects.toThrow();
  });

  it("seeds the Goals workbench menu with task permission semantics", async () => {
    const menu = await env.DB.prepare("SELECT path, label_key, required_bits, status, visible FROM menus WHERE path = '/goals'").first<{ path: string; label_key: string; required_bits: string; status: string; visible: number }>();
    expect(menu).toEqual({ path: "/goals", label_key: "NAV_GOALS", required_bits: "0x100000", status: "active", visible: 1 });
  });
});

describe("goal write journeys", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const service = () => new GoalsService(new GoalsRepository(env.DB), { now: () => now });
  const countFor = async (memberId: string): Promise<number> =>
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM goals WHERE member_id = ?").bind(memberId).first<{ n: number }>())!.n;
  const storedTitle = async (id: string): Promise<string> =>
    (await env.DB.prepare("SELECT title FROM goals WHERE id = ?").bind(id).first<{ title: string }>())!.title;
  async function goalRoute(method: string, path: string, body?: Record<string, unknown>): Promise<Response | undefined> {
    const request = new Request(`https://app.test/api/goals${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const principal = { kind: "member", memberId: "member-a", identitySubject: "subject-a", email: "a@example.test", role: "contributor" } as const;
    return routeGoalsApi(request, new URL(request.url), { requestId: "goals-journey" }, principal, { goals: service() });
  }

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'), (?, ?, ?, 'contributor', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    ).bind("member-a", "subject-a", "a@example.test", "member-b", "subject-b", "b@example.test").run();
  });

  it("workbench-goals:query_or_idempotency:create-goal — double click and lost response converge to one goal while a re-keyed mismatch is refused and members stay isolated", async () => {
    const s = service();
    const [first, second] = await Promise.all([
      s.create("member-a", { id: "goal-a1", clientKey: "goal-key-1", title: "Launch v2" }),
      s.create("member-a", { id: "goal-a2", clientKey: "goal-key-1", title: "Launch v2" }),
    ]);
    expect(first.goal.id).toBe(second.goal.id);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(await countFor("member-a")).toBe(1);
    const goalId = first.goal.id;

    const retry = await s.create("member-a", { id: "goal-a3", clientKey: "goal-key-1", title: "Launch v2" });
    expect(retry.created).toBe(false);
    expect(retry.goal.id).toBe(goalId);
    expect(await countFor("member-a")).toBe(1);

    const mismatch = await s.create("member-a", { id: "goal-other", clientKey: "goal-key-1", title: "Completely different" });
    expect(mismatch.created).toBe(false);
    expect(mismatch.goal.id).toBe(goalId);
    expect(mismatch.goal.title).toBe("Launch v2");
    expect(await countFor("member-a")).toBe(1);
    expect(await storedTitle(goalId)).toBe("Launch v2");

    const other = await s.create("member-b", { id: "goal-b1", clientKey: "goal-key-1", title: "Launch v2" });
    expect(other.created).toBe(true);
    expect(other.goal.id).toBe("goal-b1");
    expect(await countFor("member-a")).toBe(1);
    expect(await countFor("member-b")).toBe(1);

    const responses = await Promise.all([
      goalRoute("POST", "", { id: "goal-h1", clientKey: "goal-key-http", title: "HTTP goal" }),
      goalRoute("POST", "", { id: "goal-h2", clientKey: "goal-key-http", title: "HTTP goal" }),
    ]);
    expect(responses.map((response) => response!.status).sort()).toEqual([200, 201]);
    const bodies: Array<{ created: boolean; goal: { id: string } }> = await Promise.all(
      responses.map(async (response) => (await response!.json()) as { created: boolean; goal: { id: string } }),
    );
    expect(bodies[0]!.goal.id).toBe(bodies[1]!.goal.id);
    expect(bodies.filter((body) => body.created)).toHaveLength(1);
    expect(await countFor("member-a")).toBe(2);
  });

  it("workbench-goals:query_or_idempotency:transition-goal-status — one concurrent status writer wins, the loser recovers, and a stale retry cannot overwrite", async () => {
    const s = service();
    const created = await s.create("member-a", { id: "goal-status", clientKey: "status-key", title: "Status goal" });
    const original = created.goal.updatedAt;

    const results = await Promise.allSettled([
      s.setStatus("member-a", "goal-status", "paused", original),
      s.setStatus("member-a", "goal-status", "completed", original),
    ]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<Goal> => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason as { status: number; code: string }).toMatchObject({ status: 409, code: "GOAL_VERSION_CONFLICT" });

    const current = await s.get("member-a", "goal-status");
    expect(current.status).toBe(fulfilled[0]!.value.status);
    const intended = fulfilled[0]!.value.status === "paused" ? "completed" : "paused";
    const recovered = await s.setStatus("member-a", "goal-status", intended, current.updatedAt);
    expect(recovered.status).toBe(intended);

    await expect(s.setStatus("member-a", "goal-status", "archived", original)).rejects.toMatchObject({ status: 409, code: "GOAL_VERSION_CONFLICT" });
    expect((await s.get("member-a", "goal-status")).status).toBe(intended);

    await expect(s.setStatus("member-b", "goal-status", "paused", current.updatedAt)).rejects.toMatchObject({ status: 404, code: "GOAL_NOT_FOUND" });
  });

  it("workbench-goals:query_or_idempotency:update-goal-progress — an out-of-order request cannot overwrite a newer value and a lost-response retry stays authoritative", async () => {
    const s = service();
    const created = await s.create("member-a", { id: "goal-progress", clientKey: "progress-key", title: "Progress goal" });
    const v0 = created.goal.updatedAt;

    const v1goal = await s.setProgress("member-a", "goal-progress", 10, v0);
    const v1 = v1goal.updatedAt;
    expect(v1).not.toBe(v0);

    await expect(s.setProgress("member-a", "goal-progress", 90, v0)).rejects.toMatchObject({ status: 409, code: "GOAL_VERSION_CONFLICT" });
    expect((await s.get("member-a", "goal-progress")).progress).toBe(10);

    const v2goal = await s.setProgress("member-a", "goal-progress", 60, v1);
    const v2 = v2goal.updatedAt;
    expect(v2).not.toBe(v1);
    expect((await s.get("member-a", "goal-progress")).progress).toBe(60);

    await expect(s.setProgress("member-a", "goal-progress", 60, v1)).rejects.toMatchObject({ status: 409, code: "GOAL_VERSION_CONFLICT" });
    expect((await s.get("member-a", "goal-progress")).progress).toBe(60);

    // Two progress requests that arrive simultaneously from one version: only one may land.
    const race = await Promise.allSettled([
      s.setProgress("member-a", "goal-progress", 20, v2),
      s.setProgress("member-a", "goal-progress", 80, v2),
    ]);
    const winners = race.filter((result): result is PromiseFulfilledResult<Goal> => result.status === "fulfilled");
    const losers = race.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]!.reason as { status: number; code: string }).toMatchObject({ status: 409, code: "GOAL_VERSION_CONFLICT" });
    expect((await s.get("member-a", "goal-progress")).progress).toBe(winners[0]!.value.progress);
    await expect(s.setProgress("member-a", "goal-progress", 20, v2)).rejects.toMatchObject({ status: 409 });
  });
});
