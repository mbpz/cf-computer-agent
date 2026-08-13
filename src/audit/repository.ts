import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import { assertAuditEventInput, type AuditEvent, type AuditPage, type CreateAuditEvent } from "./types";

type AuditRow = { id: string; actor_kind: AuditEvent["actorKind"]; actor_id: string | null; action: AuditEvent["action"]; resource_type: "submission"; resource_id: string | null; metadata: string; created_at: string };

export class AuditRepository {
  constructor(private readonly db: D1Database) {}

  async writeAudit(input: CreateAuditEvent): Promise<AuditEvent> {
    assertAuditEventInput(input);
    await this.prepareWriteAudit(input).run();
    return input;
  }

  prepareWriteAudit(input: CreateAuditEvent, requireSubmissionId?: string): D1PreparedStatement {
    assertAuditEventInput(input);
    const values = [input.id, input.actorKind, input.actorId, input.action, input.resourceType, input.resourceId, JSON.stringify(input.metadata), input.createdAt];
    if (requireSubmissionId === undefined) {
      return this.db.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...values);
    }
    return this.db.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND submitter_id = ?)")
      .bind(...values, requireSubmissionId, input.actorId);
  }

  async listAudit(request: PageRequest): Promise<AuditPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor);
    const rows = cursor
      ? await this.db.prepare(`${auditSelect} WHERE (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`).bind(timestamp(cursor.sort), timestamp(cursor.sort), cursor.id, request.limit + 1).all<AuditRow>()
      : await this.db.prepare(`${auditSelect} ORDER BY created_at DESC, id DESC LIMIT ?`).bind(request.limit + 1).all<AuditRow>();
    return page(rows.results.map(mapAuditRow), request.limit);
  }
}

const auditSelect = "SELECT id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at FROM audit_events";
function timestamp(sort: number): string { return new Date(sort).toISOString(); }
function page(items: AuditEvent[], limit: number): AuditPage { const result = items.slice(0, limit); return { items: result, ...(items.length > limit ? { nextCursor: encodePageCursor({ sort: Date.parse(result.at(-1)!.createdAt), id: result.at(-1)!.id }) } : {}) }; }
function mapAuditRow(row: AuditRow): AuditEvent {
  const parsed = JSON.parse(row.metadata) as CreateAuditEvent["metadata"];
  return assertAuditEventInput({ id: row.id, actorKind: row.actor_kind, actorId: row.actor_id, action: row.action, resourceType: row.resource_type, resourceId: row.resource_id, metadata: parsed, createdAt: row.created_at });
}
