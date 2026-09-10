import type { EnvironmentCreateResult, EnvironmentDeleteResult, EnvironmentLifecyclePosition, EnvironmentMetadata, EnvironmentOperation, EnvironmentTombstone, EnvironmentType } from "../../shared/environments";
import { recordEnvironmentEvent, type EnvironmentReportAttempt } from "./lifecycle-repository";
import { AppError } from "../http";
import { normalizeNumberedPageRequest, pageOffset, type NumberedPage, type NumberedPageRequest } from "../pagination";
import { queryNumberedPage } from "../pagination-d1";

export interface EnvironmentListQuery extends NumberedPageRequest { type?: EnvironmentType; }
export interface EnvironmentCreateAttempt {
  operationId: string;
  requestHash: string;
  environment: EnvironmentMetadata;
}
interface CreationReceipt { request_hash: string; response_json: string; }
export interface EnvironmentMutationAttempt {
  memberId: string; id: string; operationId: string; requestHash: string;
  version: number; now: string;
}
export interface EnvironmentUpdateAttempt extends EnvironmentMutationAttempt {
  name?: string; taskId?: string | null;
}
interface EnvironmentRow {
  id: string; member_id: string; name: string; type: EnvironmentType;
  task_id: string | null; version: number; created_at: number; updated_at: number;
}

export class EnvironmentsRepository {
  constructor(private readonly db: D1Database) {}

  report(attempt: EnvironmentReportAttempt) {
    return recordEnvironmentEvent(this.db, attempt);
  }

  tombstones(memberId: string, request: NumberedPageRequest): Promise<NumberedPage<EnvironmentTombstone>> {
    const page = normalizeNumberedPageRequest(request);
    return queryNumberedPage<EnvironmentTombstone>(this.db,
      this.db.prepare("SELECT COUNT(*) AS total FROM environment_tombstones WHERE member_id = ?").bind(memberId),
      this.db.prepare(`SELECT environment_id, version, deleted_at FROM environment_tombstones
        WHERE member_id = ? ORDER BY sequence ASC LIMIT ? OFFSET ?`).bind(memberId, page.pageSize, pageOffset(page)),
      page, (row) => ({ environmentId: row.environment_id as string, version: row.version as number, deletedAt: new Date(row.deleted_at as number).toISOString() }),
    );
  }

  async create(attempt: EnvironmentCreateAttempt): Promise<EnvironmentCreateResult> {
    const { environment: row, operationId, requestHash } = attempt;
    const response: EnvironmentCreateResult = { environment: row };
    // One serialized D1 transaction claims the operation, writes its entity, and
    // reads the winning receipt. A failed entity insert also rolls back the claim.
    const results = await this.db.batch([
      this.db.prepare(`INSERT INTO environment_operation_receipts
        (member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at)
        SELECT ?, ?, 'environment.create', ?, ?, ?, ?, ?
        WHERE ? IS NULL OR EXISTS (SELECT 1 FROM tasks WHERE member_id = ? AND id = ?)
        ON CONFLICT(member_id, operation_id) DO NOTHING`).bind(
        row.memberId, operationId, requestHash, row.id, row.id, JSON.stringify(response), Date.parse(row.createdAt),
        row.taskId, row.memberId, row.taskId,
      ),
      this.db.prepare(`INSERT INTO browser_environments
        (id, member_id, name, type, task_id, version, created_at, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM environment_operation_receipts
        WHERE member_id = ? AND operation_id = ? AND claim_id = ?`).bind(
        row.id, row.memberId, row.name, row.type, row.taskId, row.version,
        Date.parse(row.createdAt), Date.parse(row.updatedAt), row.memberId, operationId, row.id,
      ),
      this.db.prepare(`SELECT request_hash, response_json FROM environment_operation_receipts
        WHERE member_id = ? AND operation_id = ?`).bind(row.memberId, operationId),
    ]);
    const receipt = results[2]?.results[0] as CreationReceipt | undefined;
    if (!receipt) throw new AppError("ENVIRONMENT_TASK_NOT_FOUND", "Task not found", 404);
    if (receipt.request_hash !== requestHash) {
      throw new AppError("ENVIRONMENT_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
    }
    return JSON.parse(receipt.response_json) as EnvironmentCreateResult;
  }

  async update(attempt: EnvironmentUpdateAttempt): Promise<EnvironmentCreateResult> {
    const { memberId, id, operationId, requestHash, version, now, name, taskId } = attempt;
    const claimId = crypto.randomUUID();
    return this.mutate<EnvironmentCreateResult>(attempt, [
      this.db.prepare(`INSERT INTO environment_operation_receipts
        (member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at)
        SELECT member_id, ?, 'environment.update', ?, id, ?, json_object('environment', json_object(
          'id', id, 'memberId', member_id, 'name', CASE WHEN ? THEN ? ELSE name END,
          'type', type, 'taskId', CASE WHEN ? THEN ? ELSE task_id END, 'version', version + 1,
          'createdAt', strftime('%Y-%m-%dT%H:%M:%fZ', created_at / 1000.0, 'unixepoch'), 'updatedAt', ?)), ?
        FROM browser_environments WHERE member_id = ? AND id = ? AND version = ?
          AND (? IS NULL OR EXISTS (SELECT 1 FROM tasks WHERE member_id = ? AND id = ?))
        ON CONFLICT(member_id, operation_id) DO NOTHING`).bind(
        operationId, requestHash, claimId, name === undefined ? 0 : 1, name ?? null,
        taskId === undefined ? 0 : 1, taskId ?? null, now, Date.parse(now), memberId, id, version,
        taskId ?? null, memberId, taskId ?? null,
      ),
      this.db.prepare(`UPDATE browser_environments SET
        name = CASE WHEN ? THEN ? ELSE name END,
        task_id = CASE WHEN ? THEN ? ELSE task_id END, version = version + 1, updated_at = ?
        WHERE member_id = ? AND id = ? AND version = ? AND EXISTS
          (SELECT 1 FROM environment_operation_receipts WHERE member_id = ? AND operation_id = ? AND claim_id = ?)`).bind(
        name === undefined ? 0 : 1, name ?? null, taskId === undefined ? 0 : 1, taskId ?? null,
        Date.parse(now), memberId, id, version, memberId, operationId, claimId,
      ),
    ], taskId);
  }

  async delete(attempt: EnvironmentMutationAttempt): Promise<EnvironmentDeleteResult> {
    const { memberId, id, operationId, requestHash, version, now } = attempt;
    const claimId = crypto.randomUUID();
    return this.mutate<EnvironmentDeleteResult>(attempt, [
      this.db.prepare(`INSERT INTO environment_operation_receipts
        (member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at)
        SELECT member_id, ?, 'environment.delete', ?, id, ?,
          json_object('tombstone', json_object('environmentId', id, 'version', version + 1, 'deletedAt', ?)), ?
        FROM browser_environments WHERE member_id = ? AND id = ? AND version = ?
        ON CONFLICT(member_id, operation_id) DO NOTHING`).bind(
        operationId, requestHash, claimId, now, Date.parse(now), memberId, id, version,
      ),
      this.db.prepare(`INSERT INTO environment_tombstones (member_id, environment_id, version, deleted_at)
        SELECT member_id, environment_id, ?, ? FROM environment_operation_receipts
        WHERE member_id = ? AND operation_id = ? AND claim_id = ?`).bind(
        version + 1, Date.parse(now), memberId, operationId, claimId,
      ),
      this.db.prepare(`DELETE FROM browser_environments WHERE member_id = ? AND id = ? AND version = ?
        AND EXISTS (SELECT 1 FROM environment_operation_receipts WHERE member_id = ? AND operation_id = ? AND claim_id = ?)`).bind(
        memberId, id, version, memberId, operationId, claimId,
      ),
    ]);
  }

  private async mutate<T>(attempt: EnvironmentMutationAttempt, statements: D1PreparedStatement[], taskId?: string | null): Promise<T> {
    const { memberId, id, operationId, requestHash, version } = attempt;
    const offset = statements.length;
    // Error classification reads share the mutation transaction: no check/write race.
    const results = await this.db.batch([
      ...statements,
      this.db.prepare(`SELECT request_hash, response_json FROM environment_operation_receipts
        WHERE member_id = ? AND operation_id = ?`).bind(memberId, operationId),
      this.db.prepare("SELECT version FROM browser_environments WHERE member_id = ? AND id = ?").bind(memberId, id),
      this.db.prepare("SELECT id FROM tasks WHERE member_id = ? AND id = ?").bind(memberId, taskId ?? null),
    ]);
    const receipt = results[offset]?.results[0] as CreationReceipt | undefined;
    if (receipt) {
      if (receipt.request_hash !== requestHash) throw new AppError("ENVIRONMENT_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
      return JSON.parse(receipt.response_json) as T;
    }
    const row = results[offset + 1]?.results[0] as { version: number } | undefined;
    if (!row) throw new AppError("ENVIRONMENT_NOT_FOUND", "Environment not found", 404);
    if (row.version !== version) throw new AppError("ENVIRONMENT_VERSION_CONFLICT", "Environment changed; reload before retrying", 409);
    if (taskId && !results[offset + 2]?.results[0]) throw new AppError("ENVIRONMENT_TASK_NOT_FOUND", "Task not found", 404);
    throw new AppError("ENVIRONMENT_WRITE_FAILED", "Environment mutation was not recorded", 500, true);
  }

  async operations(memberId: string, id: string, request: NumberedPageRequest): Promise<NumberedPage<EnvironmentOperation>> {
    const page = normalizeNumberedPageRequest(request);
    // Check ownership/existence in the same snapshot as count and page. Ordinary
    // history must not reopen deleted environments (backup restore is separate).
    const results = await this.db.batch<Record<string, unknown>>([
      this.db.prepare("SELECT id FROM browser_environments WHERE member_id = ? AND id = ?").bind(memberId, id),
      this.db.prepare("SELECT COUNT(*) AS total FROM environment_operation_receipts WHERE member_id = ? AND environment_id = ?").bind(memberId, id),
      this.db.prepare(`SELECT sequence, operation_id, kind, environment_id, lifecycle_json, created_at FROM environment_operation_receipts
        WHERE member_id = ? AND environment_id = ? ORDER BY sequence DESC LIMIT ? OFFSET ?`).bind(memberId, id, page.pageSize, pageOffset(page)),
    ]);
    if (!results[0]?.results[0]) throw new AppError("ENVIRONMENT_NOT_FOUND", "Environment not found", 404);
    const total = (results[1]!.results[0] as { total: number }).total;
    return {
      items: results[2]!.results.map((row) => ({
        sequence: row.sequence as number, operationId: row.operation_id as string,
        kind: row.kind as EnvironmentOperation["kind"], environmentId: row.environment_id as string,
        createdAt: new Date(row.created_at as number).toISOString(),
        ...(row.kind === "environment.lifecycle" ? { source: "browser_report" as const, lifecycle: JSON.parse(row.lifecycle_json as string) as EnvironmentLifecyclePosition } : {}),
      })),
      pagination: { ...page, total, totalPages: Math.ceil(total / page.pageSize) },
    };
  }

  async findOwned(memberId: string, id: string): Promise<EnvironmentMetadata | null> {
    const row = await this.db.prepare("SELECT * FROM browser_environments WHERE member_id = ? AND id = ?")
      .bind(memberId, id).first<EnvironmentRow>();
    return row ? mapRow(row) : null;
  }

  async list(memberId: string, query: EnvironmentListQuery): Promise<NumberedPage<EnvironmentMetadata>> {
    const page = normalizeNumberedPageRequest(query);
    const where = query.type === undefined ? "member_id = ?" : "member_id = ? AND type = ?";
    const bindings = query.type === undefined ? [memberId] : [memberId, query.type];
    return queryNumberedPage<EnvironmentMetadata>(
      this.db,
      this.db.prepare(`SELECT COUNT(*) AS total FROM browser_environments WHERE ${where}`).bind(...bindings),
      this.db.prepare(`SELECT * FROM browser_environments WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
        .bind(...bindings, page.pageSize, pageOffset(page)),
      page,
      (row) => mapRow(row as unknown as EnvironmentRow),
    );
  }
}

function mapRow(row: EnvironmentRow): EnvironmentMetadata {
  return {
    id: row.id, memberId: row.member_id, name: row.name, type: row.type,
    taskId: row.task_id, version: row.version,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}
