import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { FavoritePage, FavoriteScope, FavoritesRepositoryPort, KnowledgeFavorite } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export class FavoritesService {
  constructor(private readonly repository: FavoritesRepositoryPort, private readonly now: () => Date = () => new Date()) {}

  async get(scope: FavoriteScope, knowledgeItemId: string): Promise<{ favorite: boolean }> {
    assertId(knowledgeItemId);
    if (!await this.repository.isReadable(scope, knowledgeItemId)) return { favorite: false };
    return { favorite: (await this.repository.get(scope, knowledgeItemId)) !== null };
  }

  async list(scope: FavoriteScope, request?: PageRequest): Promise<FavoritePage> {
    return this.repository.list(scope, parsePageRequest(request?.limit, request?.cursor));
  }

  async add(scope: FavoriteScope, knowledgeItemId: string): Promise<KnowledgeFavorite> {
    assertId(knowledgeItemId);
    if (!await this.repository.isReadable(scope, knowledgeItemId)) throw notFound();
    return this.repository.add(scope, knowledgeItemId, this.now().toISOString());
  }

  async remove(scope: FavoriteScope, knowledgeItemId: string): Promise<void> {
    assertId(knowledgeItemId);
    await this.repository.remove(scope, knowledgeItemId);
  }
}

function assertId(value: string): void { if (typeof value !== "string" || !ID_PATTERN.test(value)) throw invalid(); }
function invalid(): AppError { return new AppError("FAVORITE_INVALID", "Favorite identifier is invalid", 400); }
function notFound(): AppError { return new AppError("FAVORITE_NOT_FOUND", "Knowledge item is not readable", 404); }

