/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { parsePageRequest } from "../../src/pagination";
import { SavedViewsRepository } from "../../src/saved-views/repository";
import { SavedViewsService } from "../../src/saved-views/service";
import { MIGRATIONS } from "../fixtures/d1";

describe("Saved Views D1 persistence", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", NOW, NOW,
      "member-b", "subject-b", "b@example.test", NOW, NOW,
    ).run();
  });

  it("persists versioned filters and paginates only the requesting owner", async () => {
    const service = createService();
    await service.create("member-a", { name: "Docs", filters: { q: "durable", spaceId: "default", tagIds: ["tag-a"] } });
    await service.create("member-a", { name: "Incidents", filters: { q: "incident" } });
    await service.create("member-b", { name: "Private", filters: { q: "private" } });

    const first = await service.list("member-a", { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.memberId).toBe("member-a");
    expect(first.items[0]?.filters).toMatchObject({ v: 1, q: expect.any(String), collectionId: null, tagMode: "or" });
    expect(first.nextCursor).toBeTruthy();
    const second = await service.list("member-a", parsePageRequest(1, first.nextCursor));
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id))).toHaveLength(2);
    await expect(service.list("member-b", { limit: 20 })).resolves.toMatchObject({ items: [{ name: "Private" }] });
    const raw = await env.DB.prepare("SELECT schema_version, filters_json FROM saved_views WHERE member_id = 'member-a' ORDER BY name").all<{ schema_version: number; filters_json: string }>();
    expect(raw.results).toHaveLength(2);
    expect(raw.results.every((row) => row.schema_version === 1 && JSON.parse(row.filters_json).v === 1)).toBe(true);
  });

  it("enforces owner isolation and maps duplicate names", async () => {
    const service = createService();
    const created = await service.create("member-a", { name: "Shared", filters: { q: "one" } });
    await expect(service.create("member-a", { name: "Shared", filters: { q: "two" } })).rejects.toMatchObject({ code: "SAVED_VIEW_NAME_CONFLICT", status: 409 });
    await expect(service.get("member-b", created.id)).rejects.toMatchObject({ code: "SAVED_VIEW_NOT_FOUND", status: 404 });
    await expect(service.update("member-b", created.id, { name: "Hacked", filters: { q: "hacked" } })).rejects.toMatchObject({ code: "SAVED_VIEW_NOT_FOUND", status: 404 });
    await expect(service.delete("member-b", created.id)).rejects.toMatchObject({ code: "SAVED_VIEW_NOT_FOUND", status: 404 });
    await expect(service.get("member-a", created.id)).resolves.toMatchObject({ name: "Shared", filters: { q: "one" } });
  });
});

const NOW = "2026-08-26T00:00:00.000Z";

function createService(): SavedViewsService {
  let next = 0;
  return new SavedViewsService(new SavedViewsRepository(env.DB), {
    id: () => `saved-view-${++next}`,
    now: () => new Date(NOW),
  });
}
