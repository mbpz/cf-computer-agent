import { decodePageCursor, encodePageCursor, type PageRequest } from "../pagination";
import { assertAuditEventInput, type AuditAction, type AuditEvent, type AuditPage, type CreateAuditEvent } from "./types";

type AuditRow = { id: string; actor_kind: AuditEvent["actorKind"]; actor_id: string | null; action: AuditEvent["action"]; resource_type: AuditEvent["resourceType"]; resource_id: string | null; metadata: string; created_at: string };

export class AuditRepository {
  constructor(private readonly db: D1Database) {}

  async writeAudit(input: CreateAuditEvent): Promise<AuditEvent> {
    const audit = assertAuditEventInput(input);
    await this.prepareWriteAudit(audit).run();
    return audit;
  }

  prepareWriteAudit(input: CreateAuditEvent, requireSubmissionId?: string): D1PreparedStatement {
    const audit = assertAuditEventInput(input);
    const values = [audit.id, audit.actorKind, audit.actorId, audit.action, audit.resourceType, audit.resourceId, JSON.stringify(audit.metadata), audit.createdAt];
    if (requireSubmissionId === undefined) {
      return this.db.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(...values);
    }
    return this.db.prepare("INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at) SELECT ?, 'member', submitter_id, 'submission.created', 'submission', id, ?, ? FROM submissions WHERE id = ?")
      .bind(audit.id, JSON.stringify(audit.metadata), audit.createdAt, requireSubmissionId);
  }

  prepareResourceWriteAudit(
    input: CreateAuditEvent,
    resource: { table: "members" | "spaces" | "collections"; id: string },
  ): D1PreparedStatement {
    const audit = assertAuditEventInput(input);
    if (audit.resourceId !== resource.id) throw new TypeError("Audit resource binding is invalid");
    return this.db.prepare(
      `INSERT INTO audit_events (id, actor_kind, actor_id, action, resource_type, resource_id, metadata, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1 AND EXISTS (SELECT 1 FROM ${resource.table} WHERE id = ?)`,
    ).bind(
      audit.id, audit.actorKind, audit.actorId, audit.action, audit.resourceType, audit.resourceId,
      JSON.stringify(audit.metadata), audit.createdAt, resource.id,
    );
  }

  async listAudit(request: PageRequest, action?: AuditAction): Promise<AuditPage> {
    const cursor = request.cursor === undefined ? undefined : decodePageCursor(request.cursor);
    const conditions = [
      ...(action === undefined ? [] : ["action = ?"]),
      ...(cursor === undefined ? [] : ["(created_at < ? OR (created_at = ? AND id < ?))"]),
    ];
    const rows = await this.db.prepare(
      `${auditSelect}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(
      ...(action === undefined ? [] : [action]),
      ...(cursor === undefined ? [] : [timestamp(cursor.sort), timestamp(cursor.sort), cursor.id]),
      request.limit + 1,
    ).all<AuditRow>();
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
