import type { Page, PageRequest } from "../pagination";

export interface FavoriteScope {
  memberId: string;
  role: "admin" | "contributor";
}

export interface KnowledgeFavorite {
  knowledgeItemId: string;
  spaceId: string;
  collectionId: string | null;
  revisionId: string;
  title: string;
  visibility: "shared" | "admin_only";
  publishedAt: string;
  createdAt: string;
  completed: boolean;
}

export type FavoritePage = Page<KnowledgeFavorite>;

export type KnowledgeFavoriteOperationKind = "knowledge.favorite.add" | "knowledge.favorite.remove";

/** The frozen result of one favorite write, addressed by the caller's operation number. */
export interface KnowledgeFavoriteOperation {
  operationId: string;
  kind: KnowledgeFavoriteOperationKind;
  knowledgeItemId: string;
  favorited: boolean;
  createdAt: string;
}

export interface KnowledgeFavoriteWriteResult {
  /** The live edge of the winning attempt; absent when a replay's edge was already removed. */
  favorite?: KnowledgeFavorite;
  operation: KnowledgeFavoriteOperation;
}

export interface KnowledgeFavoriteOperationResult {
  operation: KnowledgeFavoriteOperation;
}

export interface FavoritesRepositoryPort {
  isReadable(scope: FavoriteScope, knowledgeItemId: string): Promise<boolean>;
  get(scope: FavoriteScope, knowledgeItemId: string): Promise<KnowledgeFavorite | null>;
  list(scope: FavoriteScope, request: PageRequest): Promise<FavoritePage>;
  add(
    scope: FavoriteScope,
    knowledgeItemId: string,
    operationId: string,
    requestHash: string,
    createdAt: string,
  ): Promise<KnowledgeFavoriteWriteResult>;
  remove(
    scope: FavoriteScope,
    knowledgeItemId: string,
    operationId: string,
    requestHash: string,
    createdAt: string,
  ): Promise<KnowledgeFavoriteOperationResult>;
  operationResult(memberId: string, operationId: string): Promise<KnowledgeFavoriteOperation>;
}
