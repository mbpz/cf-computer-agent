/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { GoalsRepository } from "../../src/goals/repository";
import { GoalsService } from "../../src/goals/service";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";

for (const kind of ["goals", "projects"] as const) describe(`${kind} numbered D1 pages`, () => {
  beforeEach(async () => {
    await reset(); await applyD1Migrations(env.DB, MIGRATIONS);
    for (const member of ["a", "b"]) await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', '2026-01-01', '2026-01-01')").bind(member, member, `${member}@test.example`).run();
    const statements = Array.from({ length: 47 }, (_, i) => env.DB.prepare(`INSERT INTO ${kind} (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, 1)`).bind(`row-${String(i).padStart(3, "0")}`, i < 43 ? "a" : "b", `key-${i}`, `Title ${i}`, i === 42 ? "archived" : "active"));
    await env.DB.batch(statements);
  });
  const service = () => kind === "goals" ? new GoalsService(new GoalsRepository(env.DB)) : new ProjectsService(new ProjectsRepository(env.DB));
  it("counts only the owner/filter and uses deterministic page boundaries", async () => {
    const s = service();
    const one = await s.listNumbered("a", { status: "active" }, { page: 1, pageSize: 20 });
    const two = await s.listNumbered("a", { status: "active" }, { page: 2, pageSize: 20 });
    const three = await s.listNumbered("a", { status: "active" }, { page: 3, pageSize: 20 });
    expect(two.pagination).toEqual({ page: 2, pageSize: 20, total: 42, totalPages: 3 });
    expect(one.items[0]?.id).toBe("row-041"); expect(two.items[0]?.id).toBe("row-021");
    expect(three.items.map(x => x.id)).toEqual(["row-001", "row-000"]);
    expect(new Set([...one.items, ...two.items, ...three.items].map(x => x.id)).size).toBe(42);
    expect((await s.listNumbered("b", {}, { page: 1, pageSize: 100 })).pagination.total).toBe(4);
  });
  it("keeps requested out-of-range pages empty without leaking another owner count", async () => {
    const s = service();
    const empty = await s.listNumbered("b", { status: "archived" }, { page: 2, pageSize: 50 });
    expect(empty).toEqual({ items: [], pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 } });
    expect((await s.listNumbered("a", {}, { page: 4, pageSize: 20 })).items).toEqual([]);
  });
  it("validates direct service requests and preserves cursor consumers", async () => {
    const s = service();
    for (const page of [0, 1.5, 501]) await expect(s.listNumbered("a", {}, { page, pageSize: 20 })).rejects.toMatchObject({ status: 400 });
    await expect(s.listNumbered("a", { status: "unknown" as never }, {})).rejects.toMatchObject({ status: 400 });
    const one = await s.list("a", {}, { limit: 20 });
    expect(one.items).toHaveLength(20); expect(one.nextCursor).toBeTruthy();
    const two = await s.list("a", {}, { limit: 20, cursor: one.nextCursor });
    expect(two.items[0]?.id).not.toBe(one.items[0]?.id);
  });
});
