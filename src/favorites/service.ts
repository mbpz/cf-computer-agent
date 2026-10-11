import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type {
  FavoritePage,
  FavoriteScope,
  FavoritesRepositoryPort,
  KnowledgeFavorite,
  KnowledgeFavoriteOperation,
  KnowledgeFavoriteOperationResult,
  KnowledgeFavoriteWriteResult,
} from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
// The caller's operation number: one frozen intent, retried by number.
const OPERATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

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

  async add(scope: FavoriteScope, knowledgeItemId: string, operationId: string): Promise<KnowledgeFavoriteWriteResult> {
    assertId(knowledgeItemId);
    assertOperationId(operationId);
    if (!await this.repository.isReadable(scope, knowledgeItemId)) throw notFound();
    const requestHash = await hashRequest({ kind: "knowledge.favorite.add", memberId: scope.memberId, knowledgeItemId });
    return this.repository.add(scope, knowledgeItemId, operationId, requestHash, this.now().toISOString());
  }

  async remove(scope: FavoriteScope, knowledgeItemId: string, operationId: string): Promise<KnowledgeFavoriteOperationResult> {
    assertId(knowledgeItemId);
    assertOperationId(operationId);
    const requestHash = await hashRequest({ kind: "knowledge.favorite.remove", memberId: scope.memberId, knowledgeItemId });
    return this.repository.remove(scope, knowledgeItemId, operationId, requestHash, this.now().toISOString());
  }

  async operationResult(memberId: string, operationId: string): Promise<KnowledgeFavoriteOperation> {
    assertOperationId(operationId);
    return this.repository.operationResult(memberId, operationId);
  }
}

function assertId(value: unknown): void { if (typeof value !== "string" || !ID_PATTERN.test(value)) throw invalid(); }
function assertOperationId(value: unknown): void { if (typeof value !== "string" || !OPERATION_PATTERN.test(value)) throw invalid(); }
function invalid(): AppError { return new AppError("FAVORITE_INVALID", "Favorite identifier is invalid", 400); }
function notFound(): AppError { return new AppError("FAVORITE_NOT_FOUND", "Knowledge item is not readable", 404); }

async function hashRequest(value: Record<string, unknown>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
