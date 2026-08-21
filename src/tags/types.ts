export type TagStatus = "active" | "disabled";

export interface Tag {
  id: string;
  spaceId: string;
  slug: string;
  name: string;
  status: TagStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTagInput {
  spaceId: string;
  slug: string;
  name: string;
}

export type TagPage = Page<Tag>;

export interface TagsRepositoryPort {
  create(tag: Tag): Promise<Tag>;
  listActive(spaceId: string): Promise<Tag[]>;
  listActivePage?(spaceId: string, request: PageRequest): Promise<TagPage>;
  findActiveByIds(spaceId: string, ids: string[]): Promise<Tag[]>;
}
import type { Page, PageRequest } from "../pagination";
