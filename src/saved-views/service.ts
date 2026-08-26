import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import { SavedViewsRepositoryConflictError, type SavedViewsRepositoryPort } from "./repository";
import type { SavedView, SavedViewFilters, SavedViewUpdate } from "./types";

export interface SavedViewInput {
  name: unknown;
  filters: unknown;
}

export interface SavedViewsServiceOptions {
  id?: () => string;
  now?: () => Date;
}

export class SavedViewsService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: SavedViewsRepositoryPort, options: SavedViewsServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: SavedViewInput): Promise<SavedView> {
    const normalized = normalizeInput(input);
    const timestamp = this.now().toISOString();
    try {
      return await this.repository.create({
        id: this.id(), memberId, name: normalized.name, schemaVersion: 1, filters: normalized.filters,
        createdAt: timestamp, updatedAt: timestamp,
      });
    } catch (error) { throwServiceConflict(error); }
  }

  async list(memberId: string, request?: PageRequest): Promise<Awaited<ReturnType<SavedViewsRepositoryPort["list"]>>> {
    return this.repository.list(memberId, parsePageRequest(request?.limit, request?.cursor));
  }

  async get(memberId: string, id: string): Promise<SavedView> {
    const view = await this.repository.findOwned(memberId, validateId(id));
    if (!view) throw notFound();
    return view;
  }

  async update(memberId: string, id: string, input: SavedViewInput): Promise<SavedView> {
    const normalized = normalizeInput(input);
    const timestamp = this.now().toISOString();
    let updated: SavedView | null;
    try {
      updated = await this.repository.update(memberId, validateId(id), {
        name: normalized.name, filters: normalized.filters, updatedAt: timestamp,
      });
    } catch (error) { throwServiceConflict(error); }
    if (!updated) throw notFound();
    return updated;
  }

  async delete(memberId: string, id: string): Promise<void> {
    if (!await this.repository.delete(memberId, validateId(id))) throw notFound();
  }
}

function normalizeInput(input: SavedViewInput): { name: string; filters: SavedViewFilters } {
  if (!input || typeof input !== "object") throw invalid();
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) throw invalid();
  return { name, filters: normalizeFilters(input.filters) };
}

function normalizeFilters(value: unknown): SavedViewFilters {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  const allowed = ["q", "spaceId", "collectionId", "tagIds", "tagMode"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw invalid();
  const q = record.q === undefined ? "" : record.q;
  const spaceId = record.spaceId === undefined || record.spaceId === null ? null : record.spaceId;
  const collectionId = record.collectionId === undefined || record.collectionId === null ? null : record.collectionId;
  const tagIds = record.tagIds === undefined ? [] : record.tagIds;
  const tagMode = record.tagMode === undefined ? "or" : record.tagMode;
  if (typeof q !== "string" || [...q.trim()].length > 512 || /[\u0000-\u001f\u007f-\u009f]/u.test(q)) throw invalid();
  if (!validOptionalId(spaceId) || !validOptionalId(collectionId)) throw invalid();
  if (!Array.isArray(tagIds) || tagIds.length > 20 || tagIds.some((tag) => typeof tag !== "string" || !validId(tag))) throw invalid();
  const uniqueTags = [...new Set(tagIds as string[])];
  if (tagMode !== "and" && tagMode !== "or") throw invalid();
  const filters: SavedViewFilters = { v: 1, q: q.trim(), spaceId, collectionId, tagIds: uniqueTags, tagMode: tagMode as "and" | "or" };
  if (JSON.stringify(filters).length > 4096) throw invalid();
  return filters;
}

function validateId(value: string): string { if (!validId(value)) throw invalid(); return value; }
function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value); }
function validOptionalId(value: unknown): value is string | null { return value === null || validId(value); }
function invalid(): AppError { return new AppError("SAVED_VIEW_INVALID", "Saved view fields are invalid", 400); }
function notFound(): AppError { return new AppError("SAVED_VIEW_NOT_FOUND", "Saved view not found", 404); }
function throwServiceConflict(error: unknown): never {
  if (error instanceof SavedViewsRepositoryConflictError && error.kind === "name") {
    throw new AppError("SAVED_VIEW_NAME_CONFLICT", "Saved view name already exists", 409);
  }
  throw error;
}
