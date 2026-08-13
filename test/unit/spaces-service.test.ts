import { describe, expect, it } from "vitest";
import { SpacesService } from "../../src/spaces/service";
import { SpacesRepositoryConflictError, type CollectionsRepositoryPort, type SpacesRepositoryPort } from "../../src/spaces/repository";
import type { Collection, CreateCollection, CreateSpace, Space, UpdateCollection, UpdateSpace } from "../../src/spaces/types";

describe("SpacesService", () => {
  it("normalizes valid Space input and rejects invalid names, slugs, and positions", async () => {
    const repository = new FakeSpacesRepository([space()]);
    const service = createService(repository);

    await expect(service.createSpace({ name: "  Engineering  ", slug: "engineering", position: 2 }))
      .resolves.toMatchObject({ name: "Engineering", slug: "engineering", description: "", position: 2 });
    await expect(service.createSpace({ name: "", slug: "engineering", position: 0 }))
      .rejects.toMatchObject({ code: "SPACE_INVALID", status: 400 });
    await expect(service.createSpace({ name: "Engineering", slug: "Bad Slug", position: 0 }))
      .rejects.toMatchObject({ code: "SPACE_INVALID", status: 400 });
    await expect(service.createSpace({ name: "Engineering", slug: "engineering", position: 1.5 }))
      .rejects.toMatchObject({ code: "SPACE_INVALID", status: 400 });
  });

  it("translates a duplicate Space slug into a stable conflict", async () => {
    const repository = new FakeSpacesRepository([space()]);
    const service = createService(repository);
    await service.createSpace({ name: "Engineering", slug: "engineering", position: 0 });

    await expect(service.createSpace({ name: "Again", slug: "engineering", position: 1 }))
      .rejects.toMatchObject({ code: "SPACE_SLUG_CONFLICT", status: 409 });

    await expect(service.updateSpace("new-id", { slug: "default" }))
      .rejects.toMatchObject({ code: "SPACE_SLUG_CONFLICT", status: 409 });
  });

  it("keeps legacy Spaces and their Collections immutable", async () => {
    const repository = new FakeSpacesRepository([space({ id: "legacy", kind: "legacy", readOnly: true })]);
    const service = createService(repository);

    await expect(service.updateSpace("legacy", { name: "Changed" })).rejects.toMatchObject({ code: "SPACE_READ_ONLY", status: 409 });
    await expect(service.createCollection({ spaceId: "legacy", name: "Nope", position: 0 })).rejects.toMatchObject({ code: "SPACE_READ_ONLY", status: 409 });
  });

  it("requires an active same-Space parent Collection", async () => {
    const shared = space({ id: "shared" });
    const other = space({ id: "other" });
    const repository = new FakeSpacesRepository([shared, other], [
      collection({ id: "cross-space", spaceId: "other" }),
      collection({ id: "disabled", spaceId: "shared", status: "disabled" }),
    ]);
    const service = createService(repository);

    await expect(service.createCollection({ spaceId: "shared", parentId: "cross-space", name: "Child", position: 1 }))
      .rejects.toMatchObject({ code: "COLLECTION_PARENT_INVALID", status: 400 });
    await expect(service.createCollection({ spaceId: "shared", parentId: "disabled", name: "Child", position: 1 }))
      .rejects.toMatchObject({ code: "COLLECTION_PARENT_INVALID", status: 400 });
  });

  it("orders listed Spaces and Collections by position then id", async () => {
    const repository = new FakeSpacesRepository([
      space({ id: "default", position: 0 }),
      space({ id: "space-b", position: 1 }),
      space({ id: "space-a", position: 1 }),
      space({ id: "space-z", position: 2 }),
    ], [
      collection({ id: "collection-b", position: 1 }),
      collection({ id: "collection-a", position: 1 }),
      collection({ id: "collection-z", position: 2 }),
    ]);
    const service = createService(repository);

    await expect(service.listSpaces({ limit: 50 })).resolves.toMatchObject({ items: [{ id: "default" }, { id: "space-a" }, { id: "space-b" }, { id: "space-z" }] });
    await expect(service.listCollections("default", { limit: 50 })).resolves.toMatchObject({ items: [{ id: "collection-a" }, { id: "collection-b" }, { id: "collection-z" }] });
  });
});

function createService(repository: FakeSpacesRepository): SpacesService {
  return new SpacesService(repository, repository, { id: () => "new-id", now: () => new Date("2026-08-12T00:00:00.000Z") });
}

function space(overrides: Partial<Space> = {}): Space {
  return { id: "default", slug: "default", name: "Default", description: "", kind: "shared", status: "active", position: 0, readOnly: false, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", ...overrides };
}

function collection(overrides: Partial<Collection> = {}): Collection {
  return { id: "collection", spaceId: "default", parentId: null, name: "Collection", description: "", status: "active", position: 0, createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", ...overrides };
}

class FakeSpacesRepository implements SpacesRepositoryPort, CollectionsRepositoryPort {
  constructor(private readonly spaces: Space[] = [], private readonly collections: Collection[] = []) {}
  async findSpaceById(id: string): Promise<Space | null> { return this.spaces.find((space) => space.id === id) ?? null; }
  async createSpace(input: CreateSpace): Promise<Space> {
    if (this.spaces.some((space) => space.slug === input.slug)) throw new SpacesRepositoryConflictError("slug");
    const created = { ...input, kind: "shared" as const, readOnly: false };
    this.spaces.push(created);
    return created;
  }
  async updateSpace(id: string, input: UpdateSpace): Promise<Space | null> {
    const existing = await this.findSpaceById(id); if (!existing) return null;
    if (input.slug !== undefined && this.spaces.some((space) => space.id !== id && space.slug === input.slug)) throw new SpacesRepositoryConflictError("slug");
    const updated = { ...existing, ...input }; this.spaces.splice(this.spaces.indexOf(existing), 1, updated); return updated;
  }
  async listSpaces(): Promise<{ items: Space[]; nextCursor?: string }> { return { items: [...this.spaces].sort(byPositionThenId) }; }
  async findCollectionById(id: string): Promise<Collection | null> { return this.collections.find((item) => item.id === id) ?? null; }
  async createCollection(input: CreateCollection): Promise<Collection> {
    const space = await this.findSpaceById(input.spaceId);
    if (!space || space.kind === "legacy" || space.readOnly) throw new SpacesRepositoryConflictError("space_read_only");
    const parent = input.parentId === null ? null : await this.findCollectionById(input.parentId);
    if (input.parentId !== null && (!parent || parent.spaceId !== input.spaceId || parent.status !== "active")) throw new SpacesRepositoryConflictError("invalid_parent");
    const created = { ...input }; this.collections.push(created); return created;
  }
  async updateCollection(id: string, input: UpdateCollection): Promise<Collection | null> { const existing = await this.findCollectionById(id); if (!existing) return null; const updated = { ...existing, ...input }; this.collections.splice(this.collections.indexOf(existing), 1, updated); return updated; }
  async listCollections(): Promise<{ items: Collection[]; nextCursor?: string }> { return { items: [...this.collections].sort(byPositionThenId) }; }
}

function byPositionThenId<T extends { position: number; id: string }>(a: T, b: T): number { return a.position - b.position || a.id.localeCompare(b.id); }
