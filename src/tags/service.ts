import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import { TagsRepositoryConflictError } from "./repository";
import type { CreateTagInput, Tag, TagPage, TagsRepositoryPort } from "./types";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

export interface TagsServiceOptions {
  id?: () => string;
  now?: () => Date;
}

export class TagsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: TagsRepositoryPort, options: TagsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const normalized = normalizeTag(input);
    const timestamp = this.now().toISOString();
    try {
      return await this.repository.create({
        id: this.id(),
        ...normalized,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } catch (error) {
      if (error instanceof TagsRepositoryConflictError) {
        if (error.kind === "target_invalid") {
          throw new AppError("TAG_TARGET_INVALID", "Tag target must be an active writable Space", 400);
        }
        throw new AppError("TAG_SLUG_CONFLICT", "Tag slug already exists in this Space", 409);
      }
      throw error;
    }
  }

  listActive(spaceId: string): Promise<Tag[]> {
    validateSpaceId(spaceId);
    return this.repository.listActive(spaceId);
  }

  async listActivePage(spaceId: string, request?: PageRequest): Promise<TagPage> {
    validateSpaceId(spaceId);
    const page = parsePageRequest(request?.limit, request?.cursor);
    if (this.repository.listActivePage) return this.repository.listActivePage(spaceId, page);
    return { items: (await this.repository.listActive(spaceId)).slice(0, page.limit) };
  }
}

function validateSpaceId(spaceId: string): void {
  if (typeof spaceId !== "string" || spaceId.length === 0 || CONTROL_CHARACTERS.test(spaceId)) throw invalidTag();
}

function normalizeTag(input: CreateTagInput): CreateTagInput {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!input || typeof input.spaceId !== "string" || input.spaceId.length === 0 || CONTROL_CHARACTERS.test(input.spaceId)
    || typeof input.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.slug) || input.slug.length > 80
    || !name || [...name].length > 120 || CONTROL_CHARACTERS.test(name)) {
    throw invalidTag();
  }
  return { spaceId: input.spaceId, slug: input.slug, name };
}

function invalidTag(): AppError { return new AppError("TAG_INVALID", "Tag fields are invalid", 400); }
