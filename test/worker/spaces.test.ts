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

  it.each([
    ["absent", "missing-parent"],
    ["self", "status-target"],
    ["cycle", "status-child"],
    ["disabled", "status-disabled-parent"],
  ] as const)("maps combined status plus %s parent conflicts and rolls back every side effect", async (caseName, parentId) => {
    const timestamp = "2026-08-22T00:00:00.000Z";
    const audit = new AuditRepository(env.DB);
    const repository = new SpacesRepository(env.DB, audit);
    await repository.createCollection(collectionInput({ id: "status-target", updatedAt: timestamp }));
    await repository.createCollection(collectionInput({
      id: "status-child", parentId: "status-target", position: 1, updatedAt: timestamp,
    }));
    await repository.createCollection(collectionInput({
      id: "status-disabled-parent", position: 2, updatedAt: timestamp,
    }));
    await repository.updateCollection("status-disabled-parent", {
      status: "disabled", updatedAt: "2026-08-22T00:00:01.000Z",
    });
    await seedSearchableCollectionItem("status-target", timestamp);

    await expect(repository.updateCollectionWithAudit("status-target", {
      status: "disabled", parentId, updatedAt: "2026-08-22T00:01:00.000Z",
    }, {
      id: `status-conflict-${caseName}`, actorKind: "member", actorId: "status-member",
      action: "collection.updated", resourceType: "collection", resourceId: "status-target",
      metadata: { spaceId: "default", previousStatus: "active", newStatus: "disabled" },
      createdAt: "2026-08-22T00:01:00.000Z",
    })).rejects.toMatchObject({ kind: "invalid_parent" });

    await expect(repository.findCollectionById("status-target")).resolves.toMatchObject({
      parentId: null, status: "active", updatedAt: timestamp,
    });
    await expect(searchableCollectionState()).resolves.toEqual({
      searchStatus: "indexed", jobState: "completed", adminRows: 1, sharedRows: 1,
    });
    await expect(audit.listAudit({ limit: 20 }, "collection.updated"))
      .resolves.toMatchObject({ items: [] });
  });

  it("propagates unrelated Collection status batch failures unchanged", async () => {
    const timestamp = "2026-08-22T00:00:00.000Z";
    await new SpacesRepository(env.DB).createCollection(collectionInput({
      id: "unrelated-failure-target", updatedAt: timestamp,
    }));
    const injected = new Error("injected unrelated D1 failure");
    const failingDb = new Proxy(env.DB, {
      get(target, property) {
        if (property === "batch") return async () => { throw injected; };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const repository = new SpacesRepository(failingDb, new AuditRepository(failingDb));

    await expect(repository.updateCollectionWithAudit("unrelated-failure-target", {
      status: "disabled", updatedAt: "2026-08-22T00:01:00.000Z",
    }, {
      id: "unrelated-failure-audit", actorKind: "member", actorId: "member",
      action: "collection.updated", resourceType: "collection", resourceId: "unrelated-failure-target",
      metadata: { spaceId: "default", previousStatus: "active", newStatus: "disabled" },
      createdAt: "2026-08-22T00:01:00.000Z",
    })).rejects.toBe(injected);
    await expect(new SpacesRepository(env.DB).findCollectionById("unrelated-failure-target"))
      .resolves.toMatchObject({ status: "active", updatedAt: timestamp });
  });
});

function collectionInput(overrides: Partial<{
  id: string; spaceId: string; parentId: string | null; name: string; description: string; status: "active" | "disabled"; position: number; createdAt: string; updatedAt: string;
}> = {}) {
  return { id: "direct", spaceId: "default", parentId: null, name: "Direct", description: "", status: "active" as const, position: 0, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", ...overrides };
}

async function seedSearchableCollectionItem(collectionId: string, timestamp: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('status-member', 'github:status-member', 'status@example.test', 'admin', 'active', ?, ?)",
    ).bind(timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, created_at, updated_at) VALUES ('status-submission', 'status-member', 'default', ?, 'markdown', 'published', 'Status', 'status body', ?, ?)",
    ).bind(collectionId, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('status-source', 'status-member', 'default', ?, 'markdown', 'Status', ?, ?)",
    ).bind(collectionId, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('status-version', 'status-source', 'status-submission', 1, 'status body', 'status-hash', 'm1-v1', ?)",
    ).bind(timestamp),
    env.DB.prepare(
      "INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('status-item', 'default', ?, NULL, 'active', 'indexed', ?, ?)",
    ).bind(collectionId, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('status-revision', 'status-item', 'status-version', '/status.md', 'status-hash', 'Status', '[]', 'shared', 'status-member', ?)",
    ).bind(timestamp),
    env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'status-revision' WHERE id = 'status-item'"),
    env.DB.prepare(
      "INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body, index_field) VALUES ('status-chunk', 'status-revision', 0, '[]', 1, 1, 'status body', 'Status', '', 'status body', 'body')",
    ),
    env.DB.prepare(
      "INSERT INTO jobs (id, kind, resource_id, state, attempts, available_at, created_at, updated_at) VALUES ('status-job', 'index_revision', 'status-revision', 'completed', 1, ?, ?, ?)",
    ).bind(timestamp, timestamp, timestamp),
    env.DB.prepare(
      "INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code) SELECT rowid, id, 'Status', '', '', search_body, '' FROM chunks WHERE id = 'status-chunk'",
    ),
    env.DB.prepare(
      "INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code) SELECT rowid, id, 'Status', '', '', search_body, '' FROM chunks WHERE id = 'status-chunk'",
    ),
  ]);
}

async function searchableCollectionState(): Promise<{
  searchStatus: string; jobState: string; adminRows: number; sharedRows: number;
}> {
  const [state, admin, shared] = await Promise.all([
    env.DB.prepare(
      "SELECT k.search_status, j.state AS job_state FROM knowledge_items k JOIN jobs j ON j.resource_id = k.current_revision_id WHERE k.id = 'status-item'",
    ).first<{ search_status: string; job_state: string }>(),
    env.DB.prepare("SELECT count(*) AS count FROM chunks_fts WHERE chunk_id = 'status-chunk'")
      .first<{ count: number }>(),
    env.DB.prepare("SELECT count(*) AS count FROM chunks_fts_shared WHERE chunk_id = 'status-chunk'")
      .first<{ count: number }>(),
  ]);
  if (!state) throw new Error("missing searchable Collection state");
  return {
    searchStatus: state.search_status,
    jobState: state.job_state,
    adminRows: admin?.count ?? -1,
    sharedRows: shared?.count ?? -1,
  };
}
