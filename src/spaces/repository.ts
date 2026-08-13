import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import type { Collection, CollectionPage, CreateCollection, CreateSpace, Space, SpacePage, UpdateCollection, UpdateSpace } from "./types";

export interface SpacesRepositoryPort {
  findSpaceById(id: string): Promise<Space | null>;
  createSpace(input: CreateSpace): Promise<Space>;
  updateSpace(id: string, input: UpdateSpace): Promise<Space | null>;
  listSpaces(request: PageRequest): Promise<SpacePage>;
}

export interface CollectionsRepositoryPort {
  findCollectionById(id: string): Promise<Collection | null>;
  createCollection(input: CreateCollection): Promise<Collection>;
  updateCollection(id: string, input: UpdateCollection): Promise<Collection | null>;
  listCollections(spaceId: string, request: PageRequest): Promise<CollectionPage>;
}

type SpaceRow = { id: string; slug: string; name: string; description: string; kind: Space["kind"]; status: Space["status"]; position: number; read_only: number; created_at: string; updated_at: string };
type CollectionRow = { id: string; space_id: string; parent_id: string | null; name: string; description: string; status: Collection["status"]; position: number; created_at: string; updated_at: string };

export class SpacesRepository implements SpacesRepositoryPort, CollectionsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findSpaceById(id: string): Promise<Space | null> { return mapSpace(await this.db.prepare(`${spaceSelect} WHERE id = ?`).bind(id).first<SpaceRow>()); }
  async createSpace(input: CreateSpace): Promise<Space> {
    await this.db.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES (?, ?, ?, ?, 'shared', ?, ?, 0, ?, ?)")
      .bind(input.id, input.slug, input.name, input.description, input.status, input.position, input.createdAt, input.updatedAt).run();
    return { ...input, kind: "shared", readOnly: false };
  }
  async updateSpace(id: string, input: UpdateSpace): Promise<Space | null> {
    const current = await this.findSpaceById(id); if (!current) return null;
    const next = { ...current, ...defined(input) };
    await this.db.prepare("UPDATE spaces SET slug = ?, name = ?, description = ?, status = ?, position = ?, updated_at = ? WHERE id = ?")
      .bind(next.slug, next.name, next.description, next.status, next.position, input.updatedAt, id).run();
    return { ...next, updatedAt: input.updatedAt };
  }
  async listSpaces(request: PageRequest): Promise<SpacePage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor);
    const rows = cursor
      ? await this.db.prepare(`${spaceSelect} WHERE (position > ? OR (position = ? AND id > ?)) ORDER BY position ASC, id ASC LIMIT ?`).bind(cursor.sort, cursor.sort, cursor.id, request.limit + 1).all<SpaceRow>()
      : await this.db.prepare(`${spaceSelect} ORDER BY position ASC, id ASC LIMIT ?`).bind(request.limit + 1).all<SpaceRow>();
    return page(rows.results.map(mapSpaceRow), request.limit);
  }

  async findCollectionById(id: string): Promise<Collection | null> { return mapCollection(await this.db.prepare(`${collectionSelect} WHERE id = ?`).bind(id).first<CollectionRow>()); }
  async createCollection(input: CreateCollection): Promise<Collection> {
    await this.db.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(input.id, input.spaceId, input.parentId, input.name, input.description, input.status, input.position, input.createdAt, input.updatedAt).run();
    return input;
  }
  async updateCollection(id: string, input: UpdateCollection): Promise<Collection | null> {
    const current = await this.findCollectionById(id); if (!current) return null;
    const next = { ...current, ...defined(input) };
    await this.db.prepare("UPDATE collections SET parent_id = ?, name = ?, description = ?, status = ?, position = ?, updated_at = ? WHERE id = ?")
      .bind(next.parentId, next.name, next.description, next.status, next.position, input.updatedAt, id).run();
    return { ...next, updatedAt: input.updatedAt };
  }
  async listCollections(spaceId: string, request: PageRequest): Promise<CollectionPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor);
    const rows = cursor
      ? await this.db.prepare(`${collectionSelect} WHERE space_id = ? AND (position > ? OR (position = ? AND id > ?)) ORDER BY position ASC, id ASC LIMIT ?`).bind(spaceId, cursor.sort, cursor.sort, cursor.id, request.limit + 1).all<CollectionRow>()
      : await this.db.prepare(`${collectionSelect} WHERE space_id = ? ORDER BY position ASC, id ASC LIMIT ?`).bind(spaceId, request.limit + 1).all<CollectionRow>();
    return page(rows.results.map(mapCollectionRow), request.limit);
  }
}

const spaceSelect = "SELECT id, slug, name, description, kind, status, position, read_only, created_at, updated_at FROM spaces";
const collectionSelect = "SELECT id, space_id, parent_id, name, description, status, position, created_at, updated_at FROM collections";
const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
function page<T extends { position: number; id: string }>(items: T[], limit: number): { items: T[]; nextCursor?: string } { const result = items.slice(0, limit); return { items: result, ...(items.length > limit ? { nextCursor: encodePageCursor({ sort: result.at(-1)!.position, id: result.at(-1)!.id }) } : {}) }; }
function mapSpace(row: SpaceRow | null): Space | null { return row ? mapSpaceRow(row) : null; }
function mapSpaceRow(row: SpaceRow): Space { return { id: row.id, slug: row.slug, name: row.name, description: row.description, kind: row.kind, status: row.status, position: row.position, readOnly: row.read_only === 1, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapCollection(row: CollectionRow | null): Collection | null { return row ? mapCollectionRow(row) : null; }
function mapCollectionRow(row: CollectionRow): Collection { return { id: row.id, spaceId: row.space_id, parentId: row.parent_id, name: row.name, description: row.description, status: row.status, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at }; }
