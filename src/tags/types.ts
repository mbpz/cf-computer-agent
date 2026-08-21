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

export interface TagsRepositoryPort {
  create(tag: Tag): Promise<Tag>;
  listActive(spaceId: string): Promise<Tag[]>;
  findActiveByIds(spaceId: string, ids: string[]): Promise<Tag[]>;
}
