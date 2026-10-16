import type { Page, PageRequest } from "../pagination";

export type SpaceKind = "shared" | "legacy";
export type RecordStatus = "active" | "disabled";

export interface Space {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: SpaceKind;
  status: RecordStatus;
  position: number;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
  description: string;
  status: RecordStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSpace {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: RecordStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSpace {
  expectedUpdatedAt?: string;
  slug?: string;
  name?: string;
  description?: string;
  status?: RecordStatus;
  position?: number;
  updatedAt: string;
}

export interface CreateCollection {
  id: string;
  spaceId: string;
  parentId: string | null;
  name: string;
  description: string;
  status: RecordStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCollection {
  expectedUpdatedAt?: string;
  parentId?: string | null;
  name?: string;
  description?: string;
  status?: RecordStatus;
  position?: number;
  updatedAt: string;
}

/** Grouped, DB-derived archive impact for one Space. Every field is a real row count. */
export interface SpaceImpact {
  collections: number;
  knowledgeItems: number;
  revisions: number;
  links: number;
}

/** A Space list item carries the impact the admin sees before archiving it. */
export interface SpaceListItem extends Space {
  impact: SpaceImpact;
}

export type SpacePage = Page<SpaceListItem>;
export type CollectionPage = Page<Collection>;
export type SpacePageRequest = PageRequest;
export type CollectionPageRequest = PageRequest;
