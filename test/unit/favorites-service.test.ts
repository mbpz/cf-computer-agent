import { describe, expect, it } from "vitest";
import { AppError } from "../../src/http";
import { FavoritesService } from "../../src/favorites/service";
import type {
  FavoritePage,
  FavoriteScope,
  FavoritesRepositoryPort,
  KnowledgeFavorite,
  KnowledgeFavoriteOperation,
  KnowledgeFavoriteOperationResult,
  KnowledgeFavoriteWriteResult,
} from "../../src/favorites/types";

const scope: FavoriteScope = { memberId: "member-a", role: "contributor" };
const createdAt = "2026-08-26T00:00:00.000Z";

describe("FavoritesService", () => {
  it("keeps add/read/remove private to a readable member edge", async () => {
    const repository = new FakeFavoritesRepository();
    const service = new FavoritesService(repository, () => new Date(createdAt));
    await expect(service.add(scope, "knowledge-1", "operation-1")).resolves.toMatchObject({
      favorite: { knowledgeItemId: "knowledge-1", createdAt },
      operation: { operationId: "operation-1", kind: "knowledge.favorite.add", knowledgeItemId: "knowledge-1", favorited: true, createdAt },
    });
    await expect(service.get(scope, "knowledge-1")).resolves.toEqual({ favorite: true });
    await expect(service.get({ memberId: "member-b", role: "contributor" }, "knowledge-1")).resolves.toEqual({ favorite: false });
    await expect(service.remove(scope, "knowledge-1", "operation-2")).resolves.toMatchObject({
      operation: { operationId: "operation-2", kind: "knowledge.favorite.remove", favorited: false },
    });
    await expect(service.get(scope, "knowledge-1")).resolves.toEqual({ favorite: false });
    await expect(service.operationResult("member-a", "operation-1")).resolves.toMatchObject({ operationId: "operation-1", favorited: true });
    await expect(service.operationResult("member-a", "operation-2")).resolves.toMatchObject({ operationId: "operation-2", favorited: false });
  });

  it("rejects unreadable or malformed knowledge IDs without creating rows", async () => {
    const repository = new FakeFavoritesRepository();
    repository.readable = false;
    const service = new FavoritesService(repository);
    await expect(service.add(scope, "knowledge-1", "operation-1")).rejects.toMatchObject({ code: "FAVORITE_NOT_FOUND", status: 404 });
    await expect(service.add(scope, "../secret", "operation-1")).rejects.toMatchObject({ code: "FAVORITE_INVALID", status: 400 });
    expect(repository.items).toHaveLength(0);
    expect(repository.receipts).toHaveLength(0);
  });

  it("bounds the operation number and never queries another member's receipt", async () => {
    const repository = new FakeFavoritesRepository();
    const service = new FavoritesService(repository, () => new Date(createdAt));
    for (const operationId of ["", "not a valid id", "a".repeat(129), "..", "-leading"]) {
      await expect(service.add(scope, "knowledge-1", operationId)).rejects.toMatchObject({ code: "FAVORITE_INVALID", status: 400 });
      await expect(service.remove(scope, "knowledge-1", operationId)).rejects.toMatchObject({ code: "FAVORITE_INVALID", status: 400 });
      await expect(service.operationResult("member-a", operationId)).rejects.toMatchObject({ code: "FAVORITE_INVALID", status: 400 });
    }
    await service.add(scope, "knowledge-1", "operation-1");
    await expect(service.operationResult("member-b", "operation-1")).rejects.toMatchObject({ code: "FAVORITE_OPERATION_NOT_FOUND", status: 404 });
    expect(repository.items).toHaveLength(1);
    expect(repository.receipts).toHaveLength(1);
  });

  it("freezes one request hash per intent so a reused number cannot change meaning", async () => {
    const repository = new FakeFavoritesRepository();
    const service = new FavoritesService(repository, () => new Date(createdAt));
    const first = await service.add(scope, "knowledge-1", "operation-1");
    // A retry of the identical intent replays the original receipt and one row.
    await expect(service.add(scope, "knowledge-1", "operation-1")).resolves.toEqual(first);
    expect(repository.items).toHaveLength(1);
    expect(repository.receipts).toHaveLength(1);
    // The same number with a different intent is refused, never silently changed.
    await expect(service.remove(scope, "knowledge-1", "operation-1")).rejects.toMatchObject({ code: "FAVORITE_OPERATION_CONFLICT", status: 409 });
    await service.add(scope, "knowledge-1", "operation-2");
    await service.add(scope, "knowledge-2", "operation-3");
    const [original, retry, conflicting, secondNumber, otherTarget] = repository.writes;
    expect(original).toMatchObject({ kind: "knowledge.favorite.add", operationId: "operation-1" });
    expect(retry!.requestHash).toBe(original!.requestHash);
    // The hash freezes the intent, not the number: a different number for the same
    // intent is still the same request, while a different intent is not.
    expect(secondNumber!.requestHash).toBe(original!.requestHash);
    expect(conflicting!.requestHash).not.toBe(original!.requestHash);
    expect(otherTarget!.requestHash).not.toBe(original!.requestHash);
  });
});

class FakeFavoritesRepository implements FavoritesRepositoryPort {
  items: KnowledgeFavorite[] = [];
  receipts: { memberId: string; operationId: string; requestHash: string; receipt: KnowledgeFavoriteOperation }[] = [];
  writes: { kind: string; operationId: string; requestHash: string }[] = [];
  readable = true;

  async isReadable(): Promise<boolean> { return this.readable; }

  async get(scopeValue: FavoriteScope, knowledgeItemId: string): Promise<KnowledgeFavorite | null> {
    return this.items.find((item) => item.knowledgeItemId === knowledgeItemId && scopeValue.memberId === "member-a") ?? null;
  }

  async list(): Promise<FavoritePage> { return { items: this.items }; }

  async add(scopeValue: FavoriteScope, knowledgeItemId: string, operationId: string, requestHash: string, receivedAt: string): Promise<KnowledgeFavoriteWriteResult> {
    this.writes.push({ kind: "knowledge.favorite.add", operationId, requestHash });
    const replay = this.replay(scopeValue, operationId, requestHash);
    const existing = this.items.find((item) => item.knowledgeItemId === knowledgeItemId);
    if (existing) return { favorite: existing, operation: replay ?? this.record(scopeValue, operationId, requestHash, this.receipt(operationId, "knowledge.favorite.add", knowledgeItemId, true, receivedAt)) };
    const item: KnowledgeFavorite = { knowledgeItemId, spaceId: "default", collectionId: null, revisionId: "revision-1", title: "Guide", visibility: "shared", publishedAt: receivedAt, createdAt: receivedAt, completed: false };
    this.items.push(item);
    const operation = replay ?? this.record(scopeValue, operationId, requestHash, this.receipt(operationId, "knowledge.favorite.add", knowledgeItemId, true, receivedAt));
    return { favorite: item, operation };
  }

  async remove(scopeValue: FavoriteScope, knowledgeItemId: string, operationId: string, requestHash: string, receivedAt: string): Promise<KnowledgeFavoriteOperationResult> {
    this.writes.push({ kind: "knowledge.favorite.remove", operationId, requestHash });
    const replay = this.replay(scopeValue, operationId, requestHash);
    if (replay) return { operation: replay };
    const index = this.items.findIndex((item) => item.knowledgeItemId === knowledgeItemId);
    if (index >= 0) this.items.splice(index, 1);
    return { operation: this.record(scopeValue, operationId, requestHash, this.receipt(operationId, "knowledge.favorite.remove", knowledgeItemId, false, receivedAt)) };
  }

  async operationResult(memberId: string, operationId: string): Promise<KnowledgeFavoriteOperation> {
    const stored = this.receipts.find((row) => row.memberId === memberId && row.operationId === operationId);
    if (!stored) throw new AppError("FAVORITE_OPERATION_NOT_FOUND", "Operation result not found", 404);
    return stored.receipt;
  }

  private replay(scopeValue: FavoriteScope, operationId: string, requestHash: string): KnowledgeFavoriteOperation | undefined {
    const stored = this.receipts.find((row) => row.memberId === scopeValue.memberId && row.operationId === operationId);
    if (!stored) return undefined;
    if (stored.requestHash !== requestHash) throw new AppError("FAVORITE_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
    return stored.receipt;
  }

  private record(scopeValue: FavoriteScope, operationId: string, requestHash: string, receipt: KnowledgeFavoriteOperation): KnowledgeFavoriteOperation {
    this.receipts.push({ memberId: scopeValue.memberId, operationId, requestHash, receipt });
    return receipt;
  }

  private receipt(operationId: string, kind: KnowledgeFavoriteOperation["kind"], knowledgeItemId: string, favorited: boolean, receivedAt: string): KnowledgeFavoriteOperation {
    return { operationId, kind, knowledgeItemId, favorited, createdAt: receivedAt };
  }
}
