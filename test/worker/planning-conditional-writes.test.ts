/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { GoalsRepository } from "../../src/goals/repository";
import { GoalsService } from "../../src/goals/service";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";
import { routeGoalsApi } from "../../src/routes/goals";
import { routeProjectsApi } from "../../src/routes/projects";
const now = new Date("2026-09-27T00:00:00.000Z");
for (const kind of ["goals", "projects"] as const) describe(`${kind} conditional writes`, () => {
  const service = () => kind === "goals" ? new GoalsService(new GoalsRepository(env.DB), { now: () => now }) : new ProjectsService(new ProjectsRepository(env.DB), { now: () => now });
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const id of ["a", "b"]) await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(id, id, `${id}@test.example`).run();
    await service().create("a", { id: "row", clientKey: "row", title: "Original" });
  });
  it("increments the version under a frozen clock and rejects a stale writer, including stale no-ops", async () => {
    const s = service(); const initial = await s.get("a", "row");
    const first = await s.setStatus("a", "row", "paused", initial.updatedAt);
    expect(first.updatedAt).toBe("2026-09-27T00:00:00.001Z");
    await expect(s.setStatus("a", "row", "completed", initial.updatedAt)).rejects.toMatchObject({ status: 409, retryable: false });
    await expect(s.setStatus("a", "row", "paused", initial.updatedAt)).rejects.toMatchObject({ status: 409 });
    const second = await s.update("a", "row", { title: "Edited", expectedUpdatedAt: first.updatedAt });
    expect(second.updatedAt).toBe("2026-09-27T00:00:00.002Z");
    expect((await s.get("a", "row")).status).toBe("paused");
  });
  it("does not reuse a version when the clock moves backwards or status returns to its original value", async () => {
    const future = Date.parse(now.toISOString()) + 1000;
    await env.DB.prepare(`UPDATE ${kind} SET updated_at = ? WHERE member_id = ? AND id = ?`).bind(future, "a", "row").run();
    const s = service(); const initial = await s.get("a", "row");
    const paused = await s.setStatus("a", "row", "paused", initial.updatedAt);
    const restored = await s.setStatus("a", "row", initial.status, paused.updatedAt);
    expect(Date.parse(restored.updatedAt)).toBe(future + 2);
    await expect(s.setStatus("a", "row", "completed", initial.updatedAt)).rejects.toMatchObject({ status: 409 });
  });
  it("permits only one competing writer from the same snapshot", async () => {
    const s = service(); const row = await s.get("a", "row");
    const results = await Promise.allSettled([
      s.setStatus("a", "row", "paused", row.updatedAt),
      s.update("a", "row", { title: "Concurrent edit", expectedUpdatedAt: row.updatedAt }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
  });
  it.each([undefined, null, 123, "bad", "2026-09-27", "2026-09-27T00:00:00Z"])("rejects missing or non-canonical versions %s without writing", async version => {
    const s = service();
    await expect(s.setStatus("a", "row", "paused", version)).rejects.toMatchObject({ status: 400 });
    expect((await s.get("a", "row")).updatedAt).toBe(now.toISOString());
  });
  it("hides ownership before exposing a version conflict", async () => {
    await expect(service().setStatus("b", "row", "paused", now.toISOString())).rejects.toMatchObject({ status: 404 });
  });
  async function route(method: string, suffix: string, body: Record<string, unknown>) {
    const request = new Request(`https://app.test/api/${kind}/row${suffix}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const principal = { kind: "member", memberId: "a", identitySubject: "a", email: "a@test.example", role: "contributor" } as const;
    const context = { requestId: "conditional" };
    return kind === "goals" ? routeGoalsApi(request, new URL(request.url), context, principal, { goals: service() as GoalsService }) : routeProjectsApi(request, new URL(request.url), context, principal, { projects: service() as ProjectsService });
  }
  it("carries the version through status, patch and archive API routes", async () => {
    const status = await route("POST", "/status", { status: "paused", expectedUpdatedAt: now.toISOString() });
    expect(status?.status).toBe(200);
    await expect(route("PATCH", "", { title: "Stale", expectedUpdatedAt: now.toISOString() })).rejects.toMatchObject({ status: 409 });
    const patched = await route("PATCH", "", { title: "Current", expectedUpdatedAt: "2026-09-27T00:00:00.001Z" });
    expect(patched?.status).toBe(200);
    await expect(route("DELETE", "", {})).rejects.toMatchObject({ status: 400 });
    const deleted = await route("DELETE", "", { expectedUpdatedAt: "2026-09-27T00:00:00.002Z" });
    expect(deleted?.status).toBe(200);
    expect((await service().get("a", "row")).status).toBe("archived");
  });
});
describe("goal progress conditional writes", () => {
  it("rejects a stale progress snapshot after a status change", async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('a', 'a', 'a@test.example', 'contributor', 'active', '2026-01-01', '2026-01-01')").run();
    const s = new GoalsService(new GoalsRepository(env.DB), { now: () => now });
    const { goal } = await s.create("a", { id: "row", clientKey: "row", title: "Original" });
    const paused = await s.setStatus("a", "row", "paused", goal.updatedAt);
    await expect(s.setProgress("a", "row", 50, goal.updatedAt)).rejects.toMatchObject({ status: 409 });
    expect((await s.setProgress("a", "row", 50, paused.updatedAt)).progress).toBe(50);
  });
});
