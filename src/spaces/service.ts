import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { CollectionsRepositoryPort, SpacesRepositoryPort } from "./repository";
import type { Collection, CollectionPage, RecordStatus, Space, SpacePage } from "./types";

export interface SpacesServiceOptions { id?: () => string; now?: () => Date; }
export interface CreateSpaceInput { slug: string; name: string; description?: string; status?: RecordStatus; position: number; }
export interface UpdateSpaceInput { slug?: string; name?: string; description?: string; status?: RecordStatus; position?: number; }
export interface CreateCollectionInput { spaceId: string; parentId?: string | null; name: string; description?: string; status?: RecordStatus; position: number; }
export interface UpdateCollectionInput { parentId?: string | null; name?: string; description?: string; status?: RecordStatus; position?: number; }

export class SpacesService {
  private readonly id: () => string;
  private readonly now: () => Date;
  constructor(private readonly spaces: SpacesRepositoryPort, private readonly collections: CollectionsRepositoryPort, options: SpacesServiceOptions = {}) { this.id = options.id || (() => crypto.randomUUID()); this.now = options.now || (() => new Date()); }
  listSpaces(request?: PageRequest): Promise<SpacePage> { return this.spaces.listSpaces(parsePageRequest(request?.limit, request?.cursor)); }
  async createSpace(input: CreateSpaceInput): Promise<Space> {
    const normalized = normalizeSpace(input); const now = this.now().toISOString();
    try { return await this.spaces.createSpace({ id: this.id(), ...normalized, createdAt: now, updatedAt: now }); }
    catch (error) { if (isSlugConflict(error)) throw new AppError("SPACE_SLUG_CONFLICT", "Space slug already exists", 409); throw error; }
  }
  async updateSpace(id: string, input: UpdateSpaceInput): Promise<Space> {
    const current = await this.requireSpace(id); this.requireWritable(current);
    const normalized = normalizeSpaceUpdate(input);
    try {
      const updated = await this.spaces.updateSpace(id, { ...normalized, updatedAt: this.now().toISOString() });
      if (!updated) throw new AppError("SPACE_NOT_FOUND", "Space not found", 404);
      return updated;
    } catch (error) {
      if (isSlugConflict(error)) throw new AppError("SPACE_SLUG_CONFLICT", "Space slug already exists", 409);
      throw error;
    }
  }
  async listCollections(spaceId: string, request?: PageRequest): Promise<CollectionPage> { await this.requireSpace(spaceId); return this.collections.listCollections(spaceId, parsePageRequest(request?.limit, request?.cursor)); }
  async createCollection(input: CreateCollectionInput): Promise<Collection> {
    const target = await this.requireSpace(input.spaceId); this.requireWritable(target); const normalized = await this.normalizeCollection(input); const now = this.now().toISOString();
    return this.collections.createCollection({ id: this.id(), ...normalized, createdAt: now, updatedAt: now });
  }
  async updateCollection(id: string, input: UpdateCollectionInput): Promise<Collection> {
    const current = await this.collections.findCollectionById(id); if (!current) throw new AppError("COLLECTION_NOT_FOUND", "Collection not found", 404);
    this.requireWritable(await this.requireSpace(current.spaceId)); const normalized = await this.normalizeCollection({ ...current, ...input, spaceId: current.spaceId });
    const updated = await this.collections.updateCollection(id, { parentId: normalized.parentId, name: normalized.name, description: normalized.description, status: normalized.status, position: normalized.position, updatedAt: this.now().toISOString() });
    if (!updated) throw new AppError("COLLECTION_NOT_FOUND", "Collection not found", 404); return updated;
  }
  private async requireSpace(id: string): Promise<Space> { const space = await this.spaces.findSpaceById(id); if (!space) throw new AppError("SPACE_NOT_FOUND", "Space not found", 404); return space; }
  private requireWritable(space: Space): void { if (space.readOnly || space.kind === "legacy") throw new AppError("SPACE_READ_ONLY", "Space is read-only", 409); }
  private async normalizeCollection(input: CreateCollectionInput): Promise<{ spaceId: string; parentId: string | null; name: string; description: string; status: RecordStatus; position: number }> {
    const base = normalizeCollectionFields(input); if (base.parentId === null) return base;
    const parent = await this.collections.findCollectionById(base.parentId);
    if (!parent || parent.spaceId !== base.spaceId || parent.status !== "active") throw new AppError("COLLECTION_PARENT_INVALID", "Collection parent must be active and in the same Space", 400);
    return base;
  }
}

function normalizeSpace(input: CreateSpaceInput): { slug: string; name: string; description: string; status: RecordStatus; position: number } { return { slug: validateSlug(input.slug), name: validateText(input.name, "Space"), description: validateDescription(input.description), status: validateStatus(input.status), position: validatePosition(input.position) }; }
function normalizeSpaceUpdate(input: UpdateSpaceInput): { slug?: string; name?: string; description?: string; status?: RecordStatus; position?: number } { return { ...(input.slug === undefined ? {} : { slug: validateSlug(input.slug) }), ...(input.name === undefined ? {} : { name: validateText(input.name, "Space") }), ...(input.description === undefined ? {} : { description: validateDescription(input.description) }), ...(input.status === undefined ? {} : { status: validateStatus(input.status) }), ...(input.position === undefined ? {} : { position: validatePosition(input.position) }) }; }
function normalizeCollectionFields(input: CreateCollectionInput): { spaceId: string; parentId: string | null; name: string; description: string; status: RecordStatus; position: number } { return { spaceId: input.spaceId, parentId: input.parentId ?? null, name: validateText(input.name, "Collection"), description: validateDescription(input.description), status: validateStatus(input.status), position: validatePosition(input.position) }; }
function validateText(value: string, label: string): string { const result = typeof value === "string" ? value.trim() : ""; if (!result || result.length > 120) throw new AppError("SPACE_INVALID", `${label} name must be 1 to 120 characters`, 400); return result; }
function validateSlug(value: string): string { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) throw new AppError("SPACE_INVALID", "Space slug is invalid", 400); return value; }
function validateDescription(value: string | undefined): string { if (value === undefined) return ""; if (typeof value !== "string" || value.length > 1000) throw new AppError("SPACE_INVALID", "Description must be at most 1000 characters", 400); return value.trim(); }
function validateStatus(value: RecordStatus | undefined): RecordStatus { if (value === undefined) return "active"; if (value !== "active" && value !== "disabled") throw new AppError("SPACE_INVALID", "Status is invalid", 400); return value; }
function validatePosition(value: number): number { if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new AppError("SPACE_INVALID", "Position must be an integer from 0 to 1000000", 400); return value; }
function isSlugConflict(error: unknown): boolean { return error instanceof Error && error.message.includes("UNIQUE constraint failed: spaces.slug"); }
