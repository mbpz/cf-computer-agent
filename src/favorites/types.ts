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
}

export type FavoritePage = Page<KnowledgeFavorite>;

export interface FavoritesRepositoryPort {
  isReadable(scope: FavoriteScope, knowledgeItemId: string): Promise<boolean>;
  get(scope: FavoriteScope, knowledgeItemId: string): Promise<KnowledgeFavorite | null>;
  list(scope: FavoriteScope, request: PageRequest): Promise<FavoritePage>;
  add(scope: FavoriteScope, knowledgeItemId: string, createdAt: string): Promise<KnowledgeFavorite>;
  remove(scope: FavoriteScope, knowledgeItemId: string): Promise<boolean>;
}

