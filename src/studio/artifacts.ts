import type { CreateAuditEvent } from "../audit/types";
import { AppError } from "../http";
import type { LibraryService } from "../library/service";
import type { LibraryScope } from "../library/types";

export type StudioArtifactKind = "mindmap" | "flashcards" | "quiz";

export interface StudioArtifactSummary {
  id: string;
  kind: StudioArtifactKind;
  revisionId: string;
  createdAt: string;
}

export interface StudioArtifact extends StudioArtifactSummary {
  citationIds: string[];
  payload: unknown;
}

const ARTIFACT_KINDS: Record<StudioArtifactKind, true> = {
  mindmap: true,
  flashcards: true,
  quiz: true,
};
const MAX_PAYLOAD_BYTES = 256 * 1024;
const MAX_LIST = 50;
const encoder = new TextEncoder();

interface ArtifactRow {
  id: string;
  kind: StudioArtifactKind;
  revision_id: string;
  citation_ids_json: string;
  payload_json: string;
  created_at: string;
}

function invalidArtifact(): AppError {
  return new AppError("STUDIO_ARTIFACT_INVALID", "Studio artifact is invalid", 400);
}

function artifactNotFound(): AppError {
  return new AppError("STUDIO_ARTIFACT_NOT_FOUND", "Studio artifact was not found", 404);
}

function isKind(value: string): value is StudioArtifactKind {
  return Object.hasOwn(ARTIFACT_KINDS, value);
}

function parseCitationIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 8
    || parsed.some((entry) => typeof entry !== "string" || entry.length === 0 || entry.length > 512)
    || new Set(parsed).size !== parsed.length) throw invalidArtifact();
  return parsed as string[];
}

/** D1 persistence for owner-scoped artifacts and their audit entries. */
export class StudioArtifactRepository {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => Date,
  ) {}

  async create(input: {
    id: string;
    ownerId: string;
    knowledgeItemId: string;
    revisionId: string;
    kind: StudioArtifactKind;
    payload: unknown;
    citationIds: string[];
    audit: CreateAuditEvent;
  }): Promise<StudioArtifactSummary> {
    const payloadJson = JSON.stringify(input.payload);
    if (encoder.encode(payloadJson).byteLength > MAX_PAYLOAD_BYTES) throw invalidArtifact();
    const citationIdsJson = JSON.stringify(input.citationIds);
    if (encoder.encode(citationIdsJson).byteLength > 8 * 1024) throw invalidArtifact();
    const createdAt = this.now().toISOString();
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO studio_artifacts (
           id, knowledge_item_id, revision_id, owner_id, kind, payload_json, citation_ids_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(input.id, input.knowledgeItemId, input.revisionId, input.ownerId, input.kind, payloadJson, citationIdsJson, createdAt),
      this.db.prepare(
        `INSERT INTO audit_events (
           id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        input.audit.id, input.audit.actorKind, input.audit.actorId, input.audit.action,
        input.audit.resourceType, input.audit.resourceId, JSON.stringify(input.audit.metadata), input.audit.createdAt,
      ),
    ]);
    return { id: input.id, kind: input.kind, revisionId: input.revisionId, createdAt };
  }

  async list(ownerId: string, knowledgeItemId: string): Promise<StudioArtifactSummary[]> {
    const rows = await this.db.prepare(
      `SELECT id, kind, revision_id, created_at FROM studio_artifacts
       WHERE owner_id = ? AND knowledge_item_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(ownerId, knowledgeItemId, MAX_LIST).all<Pick<ArtifactRow, "id" | "kind" | "revision_id" | "created_at">>();
    return rows.results.map((row) => {
      if (!isKind(row.kind)) throw invalidArtifact();
      return { id: row.id, kind: row.kind, revisionId: row.revision_id, createdAt: row.created_at };
    });
  }

  async find(ownerId: string, knowledgeItemId: string, artifactId: string): Promise<StudioArtifact | null> {
    const row = await this.db.prepare(
      `SELECT id, kind, revision_id, citation_ids_json, payload_json, created_at FROM studio_artifacts
       WHERE owner_id = ? AND knowledge_item_id = ? AND id = ? LIMIT 1`,
    ).bind(ownerId, knowledgeItemId, artifactId).first<ArtifactRow>();
    if (!row) return null;
    if (!isKind(row.kind)) throw invalidArtifact();
    return {
      id: row.id,
      kind: row.kind,
      revisionId: row.revision_id,
      createdAt: row.created_at,
      citationIds: parseCitationIds(row.citation_ids_json),
      payload: JSON.parse(row.payload_json) as unknown,
    };
  }

  async remove(
    ownerId: string,
    knowledgeItemId: string,
    artifactId: string,
    audit: CreateAuditEvent,
  ): Promise<boolean> {
    const results = await this.db.batch([
      this.db.prepare(
        `DELETE FROM studio_artifacts WHERE owner_id = ? AND knowledge_item_id = ? AND id = ?`,
      ).bind(ownerId, knowledgeItemId, artifactId),
      this.db.prepare(
        `INSERT INTO audit_events (
           id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at
         ) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
      ).bind(
        audit.id, audit.actorKind, audit.actorId, audit.action,
        audit.resourceType, audit.resourceId, JSON.stringify(audit.metadata), audit.createdAt,
      ),
    ]);
    return results[0]?.meta.changes === 1;
  }
}

function auditEvent(input: {
  action: "knowledge.artifact_created" | "knowledge.artifact_deleted";
  actorId: string;
  knowledgeItemId: string;
  artifactId: string;
  revisionId: string;
  kind: StudioArtifactKind;
  createdAt: string;
  id: string;
}): CreateAuditEvent {
  return {
    id: input.id,
    actorKind: "member",
    actorId: input.actorId,
    action: input.action,
    resourceType: "knowledge",
    resourceId: input.knowledgeItemId,
    metadata: { artifactId: input.artifactId, revisionId: input.revisionId, kind: input.kind },
    createdAt: input.createdAt,
  };
}

/**
 * Artifact retention for the reader's Studio surface. Every entry point
 * re-authorizes the knowledge item through the library service; an artifact is
 * readable only while its own revision stays readable, and only its owner can
 * list, read, or delete it.
 */
export class StudioArtifactService {
  constructor(
    private readonly repository: StudioArtifactRepository,
    private readonly library: LibraryService,
  ) {}

  async save(
    scope: LibraryScope,
    knowledgeItemId: string,
    kind: StudioArtifactKind,
    payload: unknown,
    citationIds: string[],
  ): Promise<StudioArtifactSummary> {
    if (!isKind(kind)) throw invalidArtifact();
    const detail = await this.library.detail(scope, knowledgeItemId);
    const revisionId = detail.currentRevision.id;
    const artifactId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    return this.repository.create({
      id: artifactId,
      ownerId: scope.memberId,
      knowledgeItemId,
      revisionId,
      kind,
      payload,
      citationIds,
      audit: auditEvent({
        action: "knowledge.artifact_created",
        actorId: scope.memberId,
        knowledgeItemId,
        artifactId,
        revisionId,
        kind,
        createdAt,
        id: `artifact-created-${crypto.randomUUID()}`,
      }),
    });
  }

  async list(scope: LibraryScope, knowledgeItemId: string): Promise<StudioArtifactSummary[]> {
    await this.library.detail(scope, knowledgeItemId);
    return this.repository.list(scope.memberId, knowledgeItemId);
  }

  async read(scope: LibraryScope, knowledgeItemId: string, artifactId: string): Promise<StudioArtifact> {
    const artifact = await this.repository.find(scope.memberId, knowledgeItemId, artifactId);
    if (!artifact) throw artifactNotFound();
    await this.library.revision(scope, knowledgeItemId, artifact.revisionId);
    return artifact;
  }

  async remove(scope: LibraryScope, knowledgeItemId: string, artifactId: string): Promise<void> {
    const artifact = await this.repository.find(scope.memberId, knowledgeItemId, artifactId);
    if (!artifact) throw artifactNotFound();
    await this.library.revision(scope, knowledgeItemId, artifact.revisionId);
    const createdAt = new Date().toISOString();
    const auditId = `artifact-deleted-${crypto.randomUUID()}`;
    const removed = await this.repository.remove(scope.memberId, knowledgeItemId, artifactId, auditEvent({
      action: "knowledge.artifact_deleted",
      actorId: scope.memberId,
      knowledgeItemId,
      artifactId,
      revisionId: artifact.revisionId,
      kind: artifact.kind,
      createdAt,
      id: auditId,
    }));
    if (!removed) throw artifactNotFound();
  }
}
