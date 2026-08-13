/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { SpacesRepository } from "../../src/spaces/repository";
import { SpacesService } from "../../src/spaces/service";
import { AuditRepository } from "../../src/audit/repository";
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

  it("rejects self-parenting and descendant cycles at the D1 write boundary", async () => {
    const repository = new SpacesRepository(env.DB);
    const now = "2026-08-12T01:00:00.000Z";
    await repository.createCollection(collectionInput({ id: "collection-a", updatedAt: now }));
    await repository.createCollection(collectionInput({ id: "collection-b", parentId: "collection-a", updatedAt: now }));

    await expect(repository.updateCollection("collection-a", { parentId: "collection-a", updatedAt: "2026-08-12T01:01:00.000Z" }))
      .rejects.toMatchObject({ kind: "invalid_parent" });
    await expect(repository.updateCollection("collection-a", { parentId: "collection-b", updatedAt: "2026-08-12T01:02:00.000Z" }))
      .rejects.toMatchObject({ kind: "invalid_parent" });

    await expect(repository.findCollectionById("collection-a")).resolves.toMatchObject({ parentId: null, updatedAt: now });
    await expect(repository.findCollectionById("collection-b")).resolves.toMatchObject({ parentId: "collection-a" });
  });

  it("rejects self-parenting and descendant cycles through the audited service path", async () => {
    const audit = new AuditRepository(env.DB);
    const repository = new SpacesRepository(env.DB, audit);
    let nextAudit = 0;
    const service = new SpacesService(repository, repository, {
      id: () => `audited-cycle-${nextAudit}`,
      auditId: () => `audited-cycle-event-${nextAudit++}`,
      now: () => new Date(`2026-08-12T01:10:0${nextAudit}.000Z`),
    });
    const a = await service.createCollection({ spaceId: "default", name: "A", position: 0 }, "member-admin");
    const b = await service.createCollection({ spaceId: "default", parentId: a.id, name: "B", position: 1 }, "member-admin");

    await expect(service.updateCollection(a.id, { parentId: a.id }, "member-admin"))
      .rejects.toMatchObject({ code: "COLLECTION_PARENT_INVALID", status: 400 });
    await expect(service.updateCollection(a.id, { parentId: b.id }, "member-admin"))
      .rejects.toMatchObject({ code: "COLLECTION_PARENT_INVALID", status: 400 });

    await expect(repository.findCollectionById(a.id)).resolves.toMatchObject({ parentId: null });
    const cycleUpdates = await audit.listAudit({ limit: 20 }, "collection.updated");
    expect(cycleUpdates.items).toEqual([]);
  });

  it("serializes competing parent updates without creating a two-node cycle", async () => {
    const repository = new SpacesRepository(env.DB);
    const now = "2026-08-12T02:00:00.000Z";
    await repository.createCollection(collectionInput({ id: "race-a", updatedAt: now }));
    await repository.createCollection(collectionInput({ id: "race-b", updatedAt: now }));

    const updates = await Promise.allSettled([
      repository.updateCollection("race-a", { parentId: "race-b", updatedAt: "2026-08-12T02:01:00.000Z" }),
      repository.updateCollection("race-b", { parentId: "race-a", updatedAt: "2026-08-12T02:02:00.000Z" }),
    ]);
    expect(updates.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);

    const [a, b] = await Promise.all([
      repository.findCollectionById("race-a"),
      repository.findCollectionById("race-b"),
    ]);
    expect(a?.parentId === "race-b" && b?.parentId === "race-a").toBe(false);
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

  it("writes minimal allowlisted audit events for every Space and Collection mutation", async () => {
    let next = 0;
    const audit = new AuditRepository(env.DB);
    const repository = new SpacesRepository(env.DB, audit);
    const service = new SpacesService(repository, repository, {
      id: () => `mutation-${next++}`,
      now: () => new Date(`2026-08-13T00:00:0${next}.000Z`),
    });

    const space = await service.createSpace({ slug: "audited", name: "Sensitive name", position: 2 }, "member-admin");
    await service.updateSpace(space.id, { name: "Changed sensitive name", status: "disabled" }, "member-admin");
    const other = await service.createSpace({ slug: "collections", name: "Collections", position: 3 }, "member-admin");
    const collection = await service.createCollection({ spaceId: other.id, name: "Sensitive collection", position: 0 }, "member-admin");
    await service.updateCollection(collection.id, { name: "Changed collection", status: "disabled" }, "member-admin");

    const events = await audit.listAudit({ limit: 20 });
    expect(events.items.map(({ action, actorId, resourceType, resourceId, metadata }) => ({ action, actorId, resourceType, resourceId, metadata })))
      .toEqual(expect.arrayContaining([
        { action: "space.created", actorId: "member-admin", resourceType: "space", resourceId: space.id, metadata: { status: "active" } },
        { action: "space.updated", actorId: "member-admin", resourceType: "space", resourceId: space.id, metadata: { previousStatus: "active", newStatus: "disabled" } },
        { action: "space.created", actorId: "member-admin", resourceType: "space", resourceId: other.id, metadata: { status: "active" } },
        { action: "collection.created", actorId: "member-admin", resourceType: "collection", resourceId: collection.id, metadata: { spaceId: other.id, status: "active" } },
        { action: "collection.updated", actorId: "member-admin", resourceType: "collection", resourceId: collection.id, metadata: { spaceId: other.id, previousStatus: "active", newStatus: "disabled" } },
      ]));
    expect(JSON.stringify(events)).not.toMatch(/Sensitive|Changed/);
  });

  it("rolls back every Space and Collection mutation when its paired audit insert fails", async () => {
    const now = "2026-08-13T00:00:00.000Z";
    const audit = new AuditRepository(env.DB);
    await audit.writeAudit({
      id: "duplicate-audit", actorKind: "member", actorId: "member-admin", action: "space.created",
      resourceType: "space", resourceId: "existing-space", metadata: { status: "active" }, createdAt: now,
    });
    const repository = new SpacesRepository(env.DB, audit);
    const service = new SpacesService(repository, repository, {
      id: () => "failed-space", auditId: () => "duplicate-audit",
      now: () => new Date(now),
    });

    await expect(service.createSpace({ slug: "failed", name: "Failed", position: 2 }, "member-admin")).rejects.toThrow();
    await expect(env.DB.prepare("SELECT id FROM spaces WHERE id = 'failed-space'").first()).resolves.toBeNull();

    await repository.createSpace({ id: "update-space", slug: "update-space", name: "Original", description: "", status: "active", position: 2, createdAt: now, updatedAt: now });
    await expect(service.updateSpace("update-space", { name: "Changed", status: "disabled" }, "member-admin")).rejects.toThrow();
    await expect(repository.findSpaceById("update-space")).resolves.toMatchObject({ name: "Original", status: "active" });

    await expect(service.createCollection({ spaceId: "update-space", name: "Failed collection", position: 0 }, "member-admin")).rejects.toThrow();
    await expect(env.DB.prepare("SELECT id FROM collections WHERE space_id = 'update-space'").first()).resolves.toBeNull();

    await repository.createCollection(collectionInput({ id: "update-collection", spaceId: "update-space" }));
    await expect(service.updateCollection("update-collection", { name: "Changed", status: "disabled" }, "member-admin")).rejects.toThrow();
    await expect(repository.findCollectionById("update-collection")).resolves.toMatchObject({ name: "Direct", status: "active" });
  });
});

function collectionInput(overrides: Partial<{
  id: string; spaceId: string; parentId: string | null; name: string; description: string; status: "active" | "disabled"; position: number; createdAt: string; updatedAt: string;
}> = {}) {
  return { id: "direct", spaceId: "default", parentId: null, name: "Direct", description: "", status: "active" as const, position: 0, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", ...overrides };
}
