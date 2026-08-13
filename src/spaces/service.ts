import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import { SpacesRepositoryConflictError, type CollectionsRepositoryPort, type SpacesRepositoryPort } from "./repository";
import type { Collection, CollectionPage, RecordStatus, Space, SpacePage } from "./types";

export interface SpacesServiceOptions { id?: () => string; auditId?: () => string; now?: () => Date; }
export interface CreateSpaceInput { slug: string; name: string; description?: string; status?: RecordStatus; position: number; }
export interface UpdateSpaceInput { slug?: string; name?: string; description?: string; status?: RecordStatus; position?: number; }
export interface CreateCollectionInput { spaceId: string; parentId?: string | null; name: string; description?: string; status?: RecordStatus; position: number; }
export interface UpdateCollectionInput { parentId?: string | null; name?: string; description?: string; status?: RecordStatus; position?: number; }

export class SpacesService {
  private readonly id: () => string;
  private readonly auditId: () => string;
  private readonly now: () => Date;
  constructor(private readonly spaces: SpacesRepositoryPort, private readonly collections: CollectionsRepositoryPort, options: SpacesServiceOptions = {}) { this.id = options.id || (() => crypto.randomUUID()); this.auditId = options.auditId || (() => crypto.randomUUID()); this.now = options.now || (() => new Date()); }
  listSpaces(request?: PageRequest): Promise<SpacePage> { return this.spaces.listSpaces(parsePageRequest(request?.limit, request?.cursor)); }
  async createSpace(input: CreateSpaceInput, actorId?: string): Promise<Space> {
    const normalized = normalizeSpace(input); const now = this.now().toISOString();
    const space = { id: this.id(), ...normalized, createdAt: now, updatedAt: now };
    try { return actorId && this.spaces.createSpaceWithAudit ? await this.spaces.createSpaceWithAudit(space, { id: this.auditId(), actorKind: "member", actorId, action: "space.created", resourceType: "space", resourceId: space.id, metadata: { status: space.status }, createdAt: now }) : await this.spaces.createSpace(space); }
    catch (error) { throwServiceConflict(error); }
  }
  async updateSpace(id: string, input: UpdateSpaceInput, actorId?: string): Promise<Space> {
    const current = await this.requireSpace(id); this.requireWritable(current);
    const normalized = normalizeSpaceUpdate(input);
    try {
      const now = this.now().toISOString(); const nextStatus = normalized.status ?? current.status;
      const update = { ...normalized, updatedAt: now };
      const updated = actorId && this.spaces.updateSpaceWithAudit ? await this.spaces.updateSpaceWithAudit(id, update, { id: this.auditId(), actorKind: "member", actorId, action: "space.updated", resourceType: "space", resourceId: id, metadata: { previousStatus: current.status, newStatus: nextStatus }, createdAt: now }) : await this.spaces.updateSpace(id, update);
      if (!updated) throw new AppError("SPACE_NOT_FOUND", "Space not found", 404);
      return updated;
    } catch (error) { throwServiceConflict(error); }
  }
  async listCollections(spaceId: string, request?: PageRequest): Promise<CollectionPage> { await this.requireSpace(spaceId); return this.collections.listCollections(spaceId, parsePageRequest(request?.limit, request?.cursor)); }
  async createCollection(input: CreateCollectionInput, actorId?: string): Promise<Collection> {
    const target = await this.requireSpace(input.spaceId); this.requireWritable(target); const normalized = normalizeCollectionFields(input); const now = this.now().toISOString();
    const collection = { id: this.id(), ...normalized, createdAt: now, updatedAt: now };
    try { return actorId && this.collections.createCollectionWithAudit ? await this.collections.createCollectionWithAudit(collection, { id: this.auditId(), actorKind: "member", actorId, action: "collection.created", resourceType: "collection", resourceId: collection.id, metadata: { spaceId: collection.spaceId, status: collection.status }, createdAt: now }) : await this.collections.createCollection(collection); } catch (error) { throwServiceConflict(error); }
  }
  async updateCollection(id: string, input: UpdateCollectionInput, actorId?: string): Promise<Collection> {
    const current = await this.collections.findCollectionById(id); if (!current) throw new AppError("COLLECTION_NOT_FOUND", "Collection not found", 404);
    this.requireWritable(await this.requireSpace(current.spaceId)); const normalized = normalizeCollectionFields({ ...current, ...input, spaceId: current.spaceId });
    try { const now = this.now().toISOString(); const update = { parentId: normalized.parentId, name: normalized.name, description: normalized.description, status: normalized.status, position: normalized.position, updatedAt: now }; const updated = actorId && this.collections.updateCollectionWithAudit ? await this.collections.updateCollectionWithAudit(id, update, { id: this.auditId(), actorKind: "member", actorId, action: "collection.updated", resourceType: "collection", resourceId: id, metadata: { spaceId: current.spaceId, previousStatus: current.status, newStatus: normalized.status }, createdAt: now }) : await this.collections.updateCollection(id, update); if (!updated) throw new AppError("COLLECTION_NOT_FOUND", "Collection not found", 404); return updated; } catch (error) { throwServiceConflict(error); }
  }
  private async requireSpace(id: string): Promise<Space> { const space = await this.spaces.findSpaceById(id); if (!space) throw new AppError("SPACE_NOT_FOUND", "Space not found", 404); return space; }
  private requireWritable(space: Space): void { if (space.readOnly || space.kind === "legacy") throw new AppError("SPACE_READ_ONLY", "Space is read-only", 409); }
}

function normalizeSpace(input: CreateSpaceInput): { slug: string; name: string; description: string; status: RecordStatus; position: number } { return { slug: validateSlug(input.slug), name: validateText(input.name, "Space"), description: validateDescription(input.description), status: validateStatus(input.status), position: validatePosition(input.position) }; }
function normalizeSpaceUpdate(input: UpdateSpaceInput): { slug?: string; name?: string; description?: string; status?: RecordStatus; position?: number } { return { ...(input.slug === undefined ? {} : { slug: validateSlug(input.slug) }), ...(input.name === undefined ? {} : { name: validateText(input.name, "Space") }), ...(input.description === undefined ? {} : { description: validateDescription(input.description) }), ...(input.status === undefined ? {} : { status: validateStatus(input.status) }), ...(input.position === undefined ? {} : { position: validatePosition(input.position) }) }; }
function normalizeCollectionFields(input: CreateCollectionInput): { spaceId: string; parentId: string | null; name: string; description: string; status: RecordStatus; position: number } { return { spaceId: input.spaceId, parentId: input.parentId ?? null, name: validateText(input.name, "Collection"), description: validateDescription(input.description), status: validateStatus(input.status), position: validatePosition(input.position) }; }
function validateText(value: string, label: string): string { const result = typeof value === "string" ? value.trim() : ""; if (!result || result.length > 120) throw new AppError("SPACE_INVALID", `${label} name must be 1 to 120 characters`, 400); return result; }
function validateSlug(value: string): string { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 80) throw new AppError("SPACE_INVALID", "Space slug is invalid", 400); return value; }
function validateDescription(value: string | undefined): string { if (value === undefined) return ""; if (typeof value !== "string" || value.length > 1000) throw new AppError("SPACE_INVALID", "Description must be at most 1000 characters", 400); return value.trim(); }
function validateStatus(value: RecordStatus | undefined): RecordStatus { if (value === undefined) return "active"; if (value !== "active" && value !== "disabled") throw new AppError("SPACE_INVALID", "Status is invalid", 400); return value; }
function validatePosition(value: number): number { if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) throw new AppError("SPACE_INVALID", "Position must be an integer from 0 to 1000000", 400); return value; }
function throwServiceConflict(error: unknown): never { if (error instanceof SpacesRepositoryConflictError) { if (error.kind === "slug") throw new AppError("SPACE_SLUG_CONFLICT", "Space slug already exists", 409); if (error.kind === "space_read_only") throw new AppError("SPACE_READ_ONLY", "Space is read-only", 409); if (error.kind === "invalid_parent") throw new AppError("COLLECTION_PARENT_INVALID", "Collection parent must be active and in the same Space", 400); } throw error; }
