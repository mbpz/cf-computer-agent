import { describe, expect, it } from "vitest";
import { FavoritesService } from "../../src/favorites/service";
import type { FavoritePage, FavoriteScope, FavoritesRepositoryPort, KnowledgeFavorite } from "../../src/favorites/types";

const scope: FavoriteScope = { memberId: "member-a", role: "contributor" };

describe("FavoritesService", () => {
  it("keeps add/read/remove private to a readable member edge", async () => {
    const repository = new FakeFavoritesRepository();
    const service = new FavoritesService(repository, () => new Date("2026-08-26T00:00:00.000Z"));
    await expect(service.add(scope, "knowledge-1")).resolves.toMatchObject({ knowledgeItemId: "knowledge-1", createdAt: "2026-08-26T00:00:00.000Z" });
    await expect(service.get(scope, "knowledge-1")).resolves.toEqual({ favorite: true });
    await expect(service.get({ memberId: "member-b", role: "contributor" }, "knowledge-1")).resolves.toEqual({ favorite: false });
    await expect(service.remove(scope, "knowledge-1")).resolves.toBeUndefined();
    await expect(service.get(scope, "knowledge-1")).resolves.toEqual({ favorite: false });
  });

  it("rejects unreadable or malformed knowledge IDs without creating rows", async () => {
    const repository = new FakeFavoritesRepository();
    repository.readable = false;
    const service = new FavoritesService(repository);
    await expect(service.add(scope, "knowledge-1")).rejects.toMatchObject({ code: "FAVORITE_NOT_FOUND", status: 404 });
    await expect(service.add(scope, "../secret")).rejects.toMatchObject({ code: "FAVORITE_INVALID", status: 400 });
    expect(repository.items).toHaveLength(0);
  });
});

class FakeFavoritesRepository implements FavoritesRepositoryPort {
  items: KnowledgeFavorite[] = [];
  readable = true;
  async isReadable(): Promise<boolean> { return this.readable; }
  async get(scopeValue: FavoriteScope, knowledgeItemId: string): Promise<KnowledgeFavorite | null> {
    return this.items.find((item) => item.knowledgeItemId === knowledgeItemId && scopeValue.memberId === "member-a") ?? null;
  }
  async list(): Promise<FavoritePage> { return { items: this.items }; }
  async add(_scope: FavoriteScope, knowledgeItemId: string, createdAt: string): Promise<KnowledgeFavorite> {
    const item: KnowledgeFavorite = { knowledgeItemId, spaceId: "default", collectionId: null, revisionId: "revision-1", title: "Guide", visibility: "shared", publishedAt: createdAt, createdAt, completed: false };
    this.items.push(item); return item;
  }
  async remove(_scope: FavoriteScope, knowledgeItemId: string): Promise<boolean> {
    const index = this.items.findIndex((item) => item.knowledgeItemId === knowledgeItemId);
    if (index < 0) return false;
    this.items.splice(index, 1); return true;
  }
}
