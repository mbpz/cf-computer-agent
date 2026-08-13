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

  it("uses gap-free keyset pages for 55 Collections without a count query", async () => {
    let nextId = 0;
    const service = new SpacesService(new SpacesRepository(env.DB), new SpacesRepository(env.DB), {
      id: () => `collection-${String(nextId++).padStart(2, "0")}`,
      now: () => new Date("2026-08-12T00:00:00.000Z"),
    });
    for (let position = 0; position < 55; position++) {
      await service.createCollection({ spaceId: "default", name: `Collection ${position}`, position });
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
