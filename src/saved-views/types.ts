import type { Page, PageRequest } from "../pagination";

export type SavedViewTagMode = "and" | "or";

export interface SavedViewFilters {
  v: 1;
  q: string;
  spaceId: string | null;
  collectionId: string | null;
  tagIds: string[];
  tagMode: SavedViewTagMode;
  kind: "text" | "markdown" | "code" | null;
  authorId: string | null;
  publishedFrom: string | null;
  publishedTo: string | null;
}

export interface SavedView {
  id: string;
  memberId: string;
  name: string;
  schemaVersion: 1;
  filters: SavedViewFilters;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewCreate {
  id: string;
  memberId: string;
  /** Stable key of the creating request: a replay resolves to the same view. */
  clientKey: string;
  name: string;
  schemaVersion: 1;
  filters: SavedViewFilters;
  createdAt: string;
  updatedAt: string;
}

export interface SavedViewUpdate {
  name: string;
  filters: SavedViewFilters;
  updatedAt: string;
}

export type SavedViewPage = Page<SavedView>;
export type SavedViewPageRequest = PageRequest;

