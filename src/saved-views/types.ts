import type { Page, PageRequest } from "../pagination";

export type SavedViewTagMode = "and" | "or";

export interface SavedViewFilters {
  v: 1;
  q: string;
  spaceId: string | null;
  collectionId: string | null;
  tagIds: string[];
  tagMode: SavedViewTagMode;
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

