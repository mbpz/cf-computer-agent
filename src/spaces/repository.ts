import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import type { Collection, CollectionPage, CreateCollection, CreateSpace, Space, SpacePage, UpdateCollection, UpdateSpace } from "./types";

export type SpacesRepositoryConflictKind = "slug" | "space_read_only" | "invalid_parent";
export class SpacesRepositoryConflictError extends Error { constructor(readonly kind: SpacesRepositoryConflictKind) { super(`Space conflict: ${kind}`); } }

export interface SpacesRepositoryPort { findSpaceById(id: string): Promise<Space | null>; createSpace(input: CreateSpace): Promise<Space>; createSpaceWithAudit?(input: CreateSpace, audit: CreateAuditEvent): Promise<Space>; updateSpace(id: string, input: UpdateSpace): Promise<Space | null>; updateSpaceWithAudit?(id: string, input: UpdateSpace, audit: CreateAuditEvent): Promise<Space | null>; listSpaces(request: PageRequest): Promise<SpacePage>; }
export interface CollectionsRepositoryPort { findCollectionById(id: string): Promise<Collection | null>; createCollection(input: CreateCollection): Promise<Collection>; createCollectionWithAudit?(input: CreateCollection, audit: CreateAuditEvent): Promise<Collection>; updateCollection(id: string, input: UpdateCollection): Promise<Collection | null>; updateCollectionWithAudit?(id: string, input: UpdateCollection, audit: CreateAuditEvent): Promise<Collection | null>; listCollections(spaceId: string, request: PageRequest): Promise<CollectionPage>; }

type SpaceRow = { id: string; slug: string; name: string; description: string; kind: Space["kind"]; status: Space["status"]; position: number; read_only: number; created_at: string; updated_at: string };
type CollectionRow = { id: string; space_id: string; parent_id: string | null; name: string; description: string; status: Collection["status"]; position: number; created_at: string; updated_at: string };
const positionCursorBounds = { minSort: 0, maxSort: 1_000_000 } as const;

export class SpacesRepository implements SpacesRepositoryPort, CollectionsRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit?: AuditRepository) {}
  async findSpaceById(id: string): Promise<Space | null> { return mapSpace(await this.db.prepare(`${spaceSelect} WHERE id = ?`).bind(id).first<SpaceRow>()); }
  async createSpace(input: CreateSpace): Promise<Space> {
    try { await this.db.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES (?, ?, ?, ?, 'shared', ?, ?, 0, ?, ?)").bind(input.id, input.slug, input.name, input.description, input.status, input.position, input.createdAt, input.updatedAt).run(); }
    catch (error) { throwKnownSpaceConflict(error); }
    return { ...input, kind: "shared", readOnly: false };
  }
  async createSpaceWithAudit(input: CreateSpace, audit: CreateAuditEvent): Promise<Space> {
    if (!this.audit) return this.createSpace(input);
    assertSpaceCreateAudit(input, audit);
    try {
      const results = await this.db.batch([
        this.prepareCreateSpace(input),
        this.audit.prepareResourceWriteAudit(audit, { table: "spaces", id: input.id }),
      ]);
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) throw new Error("Space audit write did not persist");
    } catch (error) { throwKnownSpaceConflict(error); }
    return { ...input, kind: "shared", readOnly: false };
  }
  async updateSpace(id: string, input: UpdateSpace): Promise<Space | null> {
    const current = await this.findSpaceById(id); if (!current) return null;
    const next = { ...current, ...defined(input) };
    try {
      const update = this.db.prepare("UPDATE spaces SET slug = ?, name = ?, description = ?, status = ?, position = ?, updated_at = ? WHERE id = ? AND kind != 'legacy' AND read_only = 0")
        .bind(next.slug, next.name, next.description, next.status, next.position, input.updatedAt, id);
      const result = current.status === next.status
        ? await update.run()
        : (await this.db.batch([
          ...this.prepareSpaceSearchInvalidation(id, input.updatedAt), update, this.changeGuard(),
        ])).at(-2)!;
      if (!result.meta.changes) throw new SpacesRepositoryConflictError("space_read_only");
    } catch (error) { throwKnownSpaceConflict(error); }
    return { ...next, updatedAt: input.updatedAt };
  }
  async updateSpaceWithAudit(id: string, input: UpdateSpace, audit: CreateAuditEvent): Promise<Space | null> {
    if (!this.audit) return this.updateSpace(id, input);
    const current = await this.findSpaceById(id); if (!current) return null;
    const next = { ...current, ...defined(input) };
    assertSpaceUpdateAudit(current, next, audit);
    try {
      const invalidation = current.status === next.status
        ? []
        : this.prepareSpaceSearchInvalidation(id, input.updatedAt);
      const results = await this.db.batch([
        ...invalidation,
        this.prepareUpdateSpace(id, current, next, input.updatedAt),
        ...(invalidation.length > 0 ? [this.changeGuard()] : []),
        this.audit.prepareResourceWriteAudit(audit, { table: "spaces", id }),
      ]);
      if (results[invalidation.length]?.meta.changes !== 1) throw new SpacesRepositoryConflictError("space_read_only");
      if (results.at(-1)?.meta.changes !== 1) throw new Error("Space audit write did not persist");
    } catch (error) { throwKnownSpaceConflict(error); }
    return { ...next, updatedAt: input.updatedAt };
  }
  async listSpaces(request: PageRequest): Promise<SpacePage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor, positionCursorBounds);
    const rows = cursor ? await this.db.prepare(`${spaceSelect} WHERE (position > ? OR (position = ? AND id > ?)) ORDER BY position ASC, id ASC LIMIT ?`).bind(cursor.sort, cursor.sort, cursor.id, request.limit + 1).all<SpaceRow>() : await this.db.prepare(`${spaceSelect} ORDER BY position ASC, id ASC LIMIT ?`).bind(request.limit + 1).all<SpaceRow>();
    return page(rows.results.map(mapSpaceRow), request.limit);
  }
  async findCollectionById(id: string): Promise<Collection | null> { return mapCollection(await this.db.prepare(`${collectionSelect} WHERE id = ?`).bind(id).first<CollectionRow>()); }
  async createCollection(input: CreateCollection): Promise<Collection> {
    const result = await this.db.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0) AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))")
      .bind(input.id, input.spaceId, input.parentId, input.name, input.description, input.status, input.position, input.createdAt, input.updatedAt, input.spaceId, input.parentId, input.parentId, input.spaceId).run();
    if (!result.meta.changes) throw await this.classifyBlockedCollectionWrite(input.spaceId, input.parentId);
    return input;
  }
  async createCollectionWithAudit(input: CreateCollection, audit: CreateAuditEvent): Promise<Collection> {
    if (!this.audit) return this.createCollection(input);
    assertCollectionCreateAudit(input, audit);
    const results = await this.db.batch([
      this.prepareCreateCollection(input),
      this.audit.prepareResourceWriteAudit(audit, { table: "collections", id: input.id }),
    ]);
    if (!results[0]?.meta.changes) throw await this.classifyBlockedCollectionWrite(input.spaceId, input.parentId);
    if (results[1]?.meta.changes !== 1) throw new Error("Collection audit write did not persist");
    return input;
  }
  async updateCollection(id: string, input: UpdateCollection): Promise<Collection | null> {
    const current = await this.findCollectionById(id); if (!current) return null;
    const next = { ...current, ...defined(input) };
    const update = this.prepareCycleSafeCollectionUpdate(id, next, input.updatedAt);
    let result: D1Result<unknown>;
    if (current.status === next.status) result = await update.run();
    else {
      try {
        result = (await this.db.batch([
          ...this.prepareCollectionSearchInvalidation(id, input.updatedAt),
          update,
          this.collectionChangeGuard(),
        ])).at(-2)!;
      } catch (error) {
        if (!isCollectionChangeGuardFailure(error)) throw error;
        throw await this.classifyBlockedCollectionWrite(current.spaceId, next.parentId);
      }
    }
    if (!result.meta.changes) throw await this.classifyBlockedCollectionWrite(current.spaceId, next.parentId);
    return { ...next, updatedAt: input.updatedAt };
  }
  async updateCollectionWithAudit(id: string, input: UpdateCollection, audit: CreateAuditEvent): Promise<Collection | null> {
    if (!this.audit) return this.updateCollection(id, input);
    const current = await this.findCollectionById(id); if (!current) return null;
    const next = { ...current, ...defined(input) };
    assertCollectionUpdateAudit(current, next, audit);
    const invalidation = current.status === next.status
      ? []
      : this.prepareCollectionSearchInvalidation(id, input.updatedAt);
    let results: D1Result<unknown>[];
    try {
      results = await this.db.batch([
        ...invalidation,
        this.prepareUpdateCollection(id, current, next, input.updatedAt),
        this.audit.prepareResourceWriteAudit(audit, { table: "collections", id }),
        ...(invalidation.length > 0 ? [this.collectionChangeGuard()] : []),
      ]);
    } catch (error) {
      if (!isCollectionChangeGuardFailure(error)) throw error;
      throw await this.classifyBlockedCollectionWrite(current.spaceId, next.parentId);
    }
    if (!results[invalidation.length]?.meta.changes) throw await this.classifyBlockedCollectionWrite(current.spaceId, next.parentId);
    if (results.at(invalidation.length + 1)?.meta.changes !== 1) throw new Error("Collection audit write did not persist");
    return { ...next, updatedAt: input.updatedAt };
  }
  async listCollections(spaceId: string, request: PageRequest): Promise<CollectionPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor, positionCursorBounds);
    const rows = cursor ? await this.db.prepare(`${collectionSelect} WHERE space_id = ? AND (position > ? OR (position = ? AND id > ?)) ORDER BY position ASC, id ASC LIMIT ?`).bind(spaceId, cursor.sort, cursor.sort, cursor.id, request.limit + 1).all<CollectionRow>() : await this.db.prepare(`${collectionSelect} WHERE space_id = ? ORDER BY position ASC, id ASC LIMIT ?`).bind(spaceId, request.limit + 1).all<CollectionRow>();
    return page(rows.results.map(mapCollectionRow), request.limit);
  }
  private async classifyBlockedCollectionWrite(spaceId: string, parentId: string | null): Promise<SpacesRepositoryConflictError> {
    const space = await this.findSpaceById(spaceId);
    if (!space || space.readOnly || space.kind === "legacy") return new SpacesRepositoryConflictError("space_read_only");
    if (parentId !== null) return new SpacesRepositoryConflictError("invalid_parent");
    return new SpacesRepositoryConflictError("space_read_only");
  }
  private prepareCreateSpace(input: CreateSpace): D1PreparedStatement {
    return this.db.prepare("INSERT INTO spaces (id, slug, name, description, kind, status, position, read_only, created_at, updated_at) VALUES (?, ?, ?, ?, 'shared', ?, ?, 0, ?, ?)")
      .bind(input.id, input.slug, input.name, input.description, input.status, input.position, input.createdAt, input.updatedAt);
  }
  private prepareSpaceSearchInvalidation(spaceId: string, timestamp: string): D1PreparedStatement[] {
    return this.prepareSearchInvalidation("k.space_id = ?", spaceId, timestamp);
  }
  private prepareCollectionSearchInvalidation(collectionId: string, timestamp: string): D1PreparedStatement[] {
    return this.prepareSearchInvalidation("k.collection_id = ?", collectionId, timestamp);
  }
  private prepareSearchInvalidation(
    predicate: "k.space_id = ?" | "k.collection_id = ?",
    targetId: string,
    timestamp: string,
  ): D1PreparedStatement[] {
    const currentRowids = `SELECT c.rowid FROM knowledge_items k
      JOIN chunks c ON c.revision_id = k.current_revision_id
      WHERE k.status = 'active' AND ${predicate}`;
    const currentRevisions = `SELECT k.current_revision_id FROM knowledge_items k
      WHERE k.status = 'active' AND k.current_revision_id IS NOT NULL AND ${predicate}`;
    return [
      this.db.prepare(`DELETE FROM chunks_fts WHERE rowid IN (${currentRowids})`).bind(targetId),
      this.db.prepare(`DELETE FROM chunks_fts_shared WHERE rowid IN (${currentRowids})`).bind(targetId),
      this.db.prepare(
        `UPDATE knowledge_items AS k SET search_status = 'pending'
         WHERE k.status = 'active' AND k.current_revision_id IS NOT NULL AND ${predicate}`,
      ).bind(targetId),
      this.db.prepare(
        `UPDATE jobs SET state = 'pending', attempts = 0, available_at = ?, last_error_code = NULL,
           lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE kind = 'index_revision' AND resource_id IN (${currentRevisions})`,
      ).bind(timestamp, timestamp, targetId),
    ];
  }
  private changeGuard(): D1PreparedStatement {
    return this.db.prepare(
      "SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('space-change-guard', '$') END AS ok",
    );
  }
  private collectionChangeGuard(): D1PreparedStatement {
    return this.db.prepare(
      `INSERT INTO collections (
         id, space_id, parent_id, name, description, status, position, created_at, updated_at
       )
       SELECT '__collection_status_change_guard__', NULL, NULL, '', '', 'active', 0, '', ''
       WHERE changes() != 1`,
    );
  }
  private prepareUpdateSpace(id: string, current: Space, next: Space, updatedAt: string): D1PreparedStatement {
    return this.db.prepare("UPDATE spaces SET slug = ?, name = ?, description = ?, status = ?, position = ?, updated_at = ? WHERE id = ? AND kind != 'legacy' AND read_only = 0 AND updated_at = ?")
      .bind(next.slug, next.name, next.description, next.status, next.position, updatedAt, id, current.updatedAt);
  }
  private prepareCreateCollection(input: CreateCollection): D1PreparedStatement {
    return this.db.prepare("INSERT INTO collections (id, space_id, parent_id, name, description, status, position, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM spaces WHERE id = ? AND kind != 'legacy' AND read_only = 0) AND (? IS NULL OR EXISTS (SELECT 1 FROM collections WHERE id = ? AND space_id = ? AND status = 'active'))")
      .bind(input.id, input.spaceId, input.parentId, input.name, input.description, input.status, input.position, input.createdAt, input.updatedAt, input.spaceId, input.parentId, input.parentId, input.spaceId);
  }
  private prepareUpdateCollection(id: string, current: Collection, next: Collection, updatedAt: string): D1PreparedStatement {
    return this.prepareCycleSafeCollectionUpdate(id, next, updatedAt, current.updatedAt);
  }
  private prepareCycleSafeCollectionUpdate(id: string, next: Collection, updatedAt: string, expectedUpdatedAt?: string): D1PreparedStatement {
    return this.db.prepare(`WITH RECURSIVE descendants(id) AS (
      SELECT id FROM collections WHERE parent_id = ?
      UNION
      SELECT child.id FROM collections AS child JOIN descendants ON child.parent_id = descendants.id
    )
    UPDATE collections SET parent_id = ?, name = ?, description = ?, status = ?, position = ?, updated_at = ?
    WHERE id = ?${expectedUpdatedAt === undefined ? "" : " AND updated_at = ?"}
      AND EXISTS (SELECT 1 FROM spaces WHERE id = collections.space_id AND kind != 'legacy' AND read_only = 0)
      AND (? IS NULL OR (
        ? != collections.id
        AND EXISTS (SELECT 1 FROM collections AS parent WHERE parent.id = ? AND parent.space_id = collections.space_id AND parent.status = 'active')
        AND NOT EXISTS (SELECT 1 FROM descendants WHERE id = ?)
      ))`).bind(
      id,
      next.parentId, next.name, next.description, next.status, next.position, updatedAt, id,
      ...(expectedUpdatedAt === undefined ? [] : [expectedUpdatedAt]),
      next.parentId, next.parentId, next.parentId, next.parentId,
    );
  }
}

const spaceSelect = "SELECT id, slug, name, description, kind, status, position, read_only, created_at, updated_at FROM spaces";
const collectionSelect = "SELECT id, space_id, parent_id, name, description, status, position, created_at, updated_at FROM collections";
const defined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
function throwKnownSpaceConflict(error: unknown): never { if (error instanceof SpacesRepositoryConflictError) throw error; if (isSlugConflict(error)) throw new SpacesRepositoryConflictError("slug"); throw error; }
function isSlugConflict(error: unknown): boolean { return error instanceof Error && ["UNIQUE constraint failed: spaces.slug", "D1_ERROR: UNIQUE constraint failed: spaces.slug: SQLITE_CONSTRAINT", "D1_ERROR: UNIQUE constraint failed: spaces.slug: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)"].includes(error.message); }
function isCollectionChangeGuardFailure(error: unknown): boolean { return error instanceof Error && error.message.includes("NOT NULL constraint failed: collections.space_id"); }
function page<T extends { position: number; id: string }>(items: T[], limit: number): { items: T[]; nextCursor?: string } { const result = items.slice(0, limit); return { items: result, ...(items.length > limit ? { nextCursor: encodePageCursor({ sort: result.at(-1)!.position, id: result.at(-1)!.id }) } : {}) }; }
function mapSpace(row: SpaceRow | null): Space | null { return row ? mapSpaceRow(row) : null; }
function mapSpaceRow(row: SpaceRow): Space { return { id: row.id, slug: row.slug, name: row.name, description: row.description, kind: row.kind, status: row.status, position: row.position, readOnly: row.read_only === 1, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapCollection(row: CollectionRow | null): Collection | null { return row ? mapCollectionRow(row) : null; }
function mapCollectionRow(row: CollectionRow): Collection { return { id: row.id, spaceId: row.space_id, parentId: row.parent_id, name: row.name, description: row.description, status: row.status, position: row.position, createdAt: row.created_at, updatedAt: row.updated_at }; }
function assertSpaceCreateAudit(space: CreateSpace, audit: CreateAuditEvent): void { if (audit.actorKind !== "member" || audit.action !== "space.created" || audit.resourceType !== "space" || audit.resourceId !== space.id || audit.metadata.status !== space.status) throw new TypeError("Space audit binding is invalid"); }
function assertSpaceUpdateAudit(current: Space, next: Space, audit: CreateAuditEvent): void { if (audit.actorKind !== "member" || audit.action !== "space.updated" || audit.resourceType !== "space" || audit.resourceId !== current.id || audit.metadata.previousStatus !== current.status || audit.metadata.newStatus !== next.status) throw new TypeError("Space audit binding is invalid"); }
function assertCollectionCreateAudit(collection: CreateCollection, audit: CreateAuditEvent): void { if (audit.actorKind !== "member" || audit.action !== "collection.created" || audit.resourceType !== "collection" || audit.resourceId !== collection.id || audit.metadata.spaceId !== collection.spaceId || audit.metadata.status !== collection.status) throw new TypeError("Collection audit binding is invalid"); }
function assertCollectionUpdateAudit(current: Collection, next: Collection, audit: CreateAuditEvent): void { if (audit.actorKind !== "member" || audit.action !== "collection.updated" || audit.resourceType !== "collection" || audit.resourceId !== current.id || audit.metadata.spaceId !== current.spaceId || audit.metadata.previousStatus !== current.status || audit.metadata.newStatus !== next.status) throw new TypeError("Collection audit binding is invalid"); }
