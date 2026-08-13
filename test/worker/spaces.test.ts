/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SpacesRepository } from "../../src/spaces/repository";
import { SpacesService } from "../../src/spaces/service";
import { MIGRATIONS } from "../fixtures/d1";

describe("Spaces D1 control plane", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
  });

  it("uses gap-free keyset pages through repeated-position ties without a count query", async () => {
    let nextId = 0;
    const service = new SpacesService(new SpacesRepository(env.DB), new SpacesRepository(env.DB), {
      id: () => `collection-${String(nextId++).padStart(2, "0")}`,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    for (let position = 0; position < 55; position++) {
      await service.createCollection({ spaceId: "default", name: `Collection ${position}`, position: Math.floor(position / 3) });
    }

    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.listCollections("default", { limit: 20, cursor });
      ids.push(...page.items.map((collection) => collection.id));
      cursor = page.nextCursor;
    } while (cursor);

    expect(ids).toHaveLength(55);
    expect(new Set(ids)).toHaveLength(55);
    expect(ids).toEqual(Array.from({ length: 55 }, (_, index) => `collection-${String(index).padStart(2, "0")}`));
  });

  it("refuses legacy and invalid-parent writes when called directly at the repository boundary", async () => {
    const repository = new SpacesRepository(env.DB);
    const now = "2026-08-12T00:00:00.000Z";
    await env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES (?, ?, NULL, ?, '', 'active', 0, ?, ?)")
      .bind("disabled-parent", "default", "Disabled", now, now).run();
    await env.DB.prepare("UPDATE collections SET status = 'disabled' WHERE id = 'disabled-parent'").run();

    await expect(repository.createCollection(collectionInput({ id: "legacy-direct", spaceId: "legacy-personal" })))
      .rejects.toMatchObject({ kind: "space_read_only" });
    await expect(repository.createCollection(collectionInput({ id: "invalid-parent", parentId: "disabled-parent" })))
      .rejects.toMatchObject({ kind: "invalid_parent" });
    await expect(repository.updateSpace("legacy-personal", { name: "Changed", updatedAt: now }))
      .rejects.toMatchObject({ kind: "space_read_only" });
    await env.DB.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES ('legacy-collection', 'legacy-personal', NULL, 'Legacy', '', 'active', 0, ?, ?)").bind(now, now).run();
    await expect(repository.updateCollection("legacy-collection", { name: "Changed", updatedAt: now }))
      .rejects.toMatchObject({ kind: "space_read_only" });
  });

  it("maps only the known D1 slug uniqueness constraint", async () => {
    const repository = new SpacesRepository(env.DB);
    const now = "2026-08-12T00:00:00.000Z";
    const input = { id: "engineering", slug: "engineering", name: "Engineering", description: "", status: "active" as const, position: 2, createdAt: now, updatedAt: now };
    await repository.createSpace(input);

    await expect(repository.createSpace({ ...input, id: "engineering-two" })).rejects.toMatchObject({ kind: "slug" });
    await expect(repository.createSpace({ ...input, slug: "different" })).rejects.toThrow(/spaces\.id/);
  });

  it("rejects a Collection create after its parent is disabled before the conditional insert", async () => {
    const repository = new SpacesRepository(env.DB);
    const now = "2026-08-12T00:00:00.000Z";
    await repository.createCollection(collectionInput({ id: "parent", parentId: null }));
    await env.DB.prepare("UPDATE collections SET status = 'disabled' WHERE id = 'parent'").run();

    await expect(repository.createCollection(collectionInput({ id: "child", parentId: "parent" })))
      .rejects.toMatchObject({ kind: "invalid_parent" });
    await expect(env.DB.prepare("SELECT id FROM collections WHERE id = 'child'").first()).resolves.toBeNull();
  });

  it("preserves the seeded legacy Space as immutable", async () => {
    const repository = new SpacesRepository(env.DB);
    const service = new SpacesService(repository, repository);

    await expect(service.updateSpace("legacy-personal", { status: "disabled" }))
      .rejects.toMatchObject({ code: "SPACE_READ_ONLY", status: 409 });
    await expect(service.createCollection({ spaceId: "legacy-personal", name: "Blocked", position: 0 }))
      .rejects.toMatchObject({ code: "SPACE_READ_ONLY", status: 409 });

    await expect(env.DB.prepare("SELECT kind, status, read_only FROM spaces WHERE id = 'legacy-personal'").first())
      .resolves.toEqual({ kind: "legacy", status: "active", read_only: 1 });
  });
});

function collectionInput(overrides: Partial<{
  id: string; spaceId: string; parentId: string | null; name: string; description: string; status: "active" | "disabled"; position: number; createdAt: string; updatedAt: string;
}> = {}) {
  return { id: "direct", spaceId: "default", parentId: null, name: "Direct", description: "", status: "active" as const, position: 0, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", ...overrides };
}
