import { describe, expect, it } from "vitest";
import { SavedViewsService } from "../../src/saved-views/service";
import { SavedViewsRepositoryConflictError, type SavedViewsRepositoryPort } from "../../src/saved-views/repository";
import type { SavedView, SavedViewCreate, SavedViewUpdate } from "../../src/saved-views/types";

describe("SavedViewsService", () => {
  it("normalizes a bounded search view and keeps its schema version explicit", async () => {
    const repository = new FakeSavedViewsRepository();
    const service = createService(repository);

    await expect(service.create("member-a", {
      name: "  Platform docs  ",
      filters: { q: "  Durable Objects  ", spaceId: "space-a", tagIds: ["tag-b", "tag-a", "tag-a"], tagMode: "and" },
    })).resolves.toMatchObject({
      id: "view-1",
      memberId: "member-a",
      name: "Platform docs",
      schemaVersion: 1,
      filters: { v: 1, q: "Durable Objects", spaceId: "space-a", collectionId: null, tagIds: ["tag-b", "tag-a"], tagMode: "and" },
    });
  });

  it("rejects unknown, oversized, and malformed filter values", async () => {
    const service = createService(new FakeSavedViewsRepository());
    await expect(service.create("member-a", { name: "", filters: {} })).rejects.toMatchObject({ code: "SAVED_VIEW_INVALID", status: 400 });
    await expect(service.create("member-a", { name: "x", filters: { q: "q".repeat(513) } })).rejects.toMatchObject({ code: "SAVED_VIEW_INVALID", status: 400 });
    await expect(service.create("member-a", { name: "x", filters: { q: "q", unsupported: true } })).rejects.toMatchObject({ code: "SAVED_VIEW_INVALID", status: 400 });
    await expect(service.create("member-a", { name: "x", filters: { q: "q", tagIds: ["tag-a"], tagMode: "invalid" as "and" } })).rejects.toMatchObject({ code: "SAVED_VIEW_INVALID", status: 400 });
  });

  it("maps an owner name conflict and never updates another owner's view", async () => {
    const repository = new FakeSavedViewsRepository([view({ id: "view-a", memberId: "member-a", name: "Shared" })]);
    const service = createService(repository);
    await expect(service.create("member-a", { name: "Shared", filters: { q: "same" } })).rejects.toMatchObject({ code: "SAVED_VIEW_NAME_CONFLICT", status: 409 });
    await expect(service.update("member-b", "view-a", { name: "Changed", filters: { q: "changed" } })).rejects.toMatchObject({ code: "SAVED_VIEW_NOT_FOUND", status: 404 });
    await expect(service.delete("member-b", "view-a")).rejects.toMatchObject({ code: "SAVED_VIEW_NOT_FOUND", status: 404 });
    await expect(service.get("member-a", "view-a")).resolves.toMatchObject({ name: "Shared" });
  });

  it("returns a bounded owner-scoped page and opaque continuation cursor", async () => {
    const repository = new FakeSavedViewsRepository([
      view({ id: "view-1", memberId: "member-a", updatedAt: "2026-08-26T00:00:00.000Z" }),
      view({ id: "view-2", memberId: "member-a", updatedAt: "2026-08-25T00:00:00.000Z" }),
      view({ id: "view-other", memberId: "member-b", updatedAt: "2026-08-24T00:00:00.000Z" }),
    ]);
    const service = createService(repository);
    const first = await service.list("member-a", { limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual(["view-1"]);
    expect(first.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    await expect(service.list("member-a", { limit: 1, cursor: first.nextCursor })).resolves.toMatchObject({ items: [{ id: "view-2" }] });
  });
});

function createService(repository: FakeSavedViewsRepository): SavedViewsService {
  return new SavedViewsService(repository, { id: (() => { let n = 0; return () => `view-${++n}`; })(), now: () => new Date("2026-08-26T00:00:00.000Z") });
}

function view(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: "view-default",
    memberId: "member-a",
    name: "Default",
    schemaVersion: 1,
    filters: { v: 1, q: "", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" },
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

class FakeSavedViewsRepository implements SavedViewsRepositoryPort {
  constructor(private readonly items: SavedView[] = []) {}
  async create(input: SavedViewCreate): Promise<SavedView> {
    if (this.items.some((item) => item.memberId === input.memberId && item.name === input.name)) throw new SavedViewsRepositoryConflictError("name");
    const created = { ...input };
    this.items.push(created);
    return created;
  }
  async list(memberId: string, request: { limit: number; cursor?: string }): Promise<{ items: SavedView[]; nextCursor?: string }> {
    const sorted = this.items.filter((item) => item.memberId === memberId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    const start = request.cursor ? Number.parseInt(request.cursor, 10) : 0;
    const items = sorted.slice(start, start + request.limit);
    return { items, ...(start + request.limit < sorted.length ? { nextCursor: String(start + request.limit) } : {}) };
  }
  async findOwned(memberId: string, id: string): Promise<SavedView | null> { return this.items.find((item) => item.memberId === memberId && item.id === id) ?? null; }
  async update(memberId: string, id: string, input: SavedViewUpdate): Promise<SavedView | null> {
    const current = await this.findOwned(memberId, id); if (!current) return null;
    if (input.name !== undefined && this.items.some((item) => item.memberId === memberId && item.id !== id && item.name === input.name)) throw new SavedViewsRepositoryConflictError("name");
    Object.assign(current, input); return current;
  }
  async delete(memberId: string, id: string): Promise<boolean> {
    const index = this.items.findIndex((item) => item.memberId === memberId && item.id === id); if (index < 0) return false;
    this.items.splice(index, 1); return true;
  }
}
