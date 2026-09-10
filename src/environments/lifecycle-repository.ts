import type { EnvironmentReportedEvent, EnvironmentReportResult } from "../../shared/environments";
import { AppError } from "../http";

export interface EnvironmentReportAttempt {
  memberId: string;
  requestHash: string;
  event: EnvironmentReportedEvent;
}

/** Records a report, never starts Linux, changes metadata state or grants network access. */
export async function recordEnvironmentEvent(db: D1Database, attempt: EnvironmentReportAttempt): Promise<EnvironmentReportResult> {
  const { memberId, requestHash, event } = attempt;
  const { environmentId, eventId, runtimeId, generation, eventIndex, receivedAt } = event;
  const claimId = crypto.randomUUID();
  const result: EnvironmentReportResult = { event };
  const results = await db.batch<Record<string, unknown>>([
    db.prepare(`INSERT INTO environment_operation_receipts
      (member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, lifecycle_json, created_at)
      SELECT e.member_id, ?, 'environment.lifecycle', ?, e.id, ?, ?, ?, ?
      FROM browser_environments e
      LEFT JOIN environment_runtime_heads h ON h.member_id = e.member_id AND h.environment_id = e.id AND h.runtime_id = ?
      WHERE e.member_id = ? AND e.id = ? AND (e.type = 'personal' OR ? != 'checkpoint_saved')
        AND (h.runtime_id IS NULL OR h.generation < ? OR (h.generation = ? AND h.event_index < ?))
      ON CONFLICT(member_id, operation_id) DO NOTHING`).bind(
      eventId, requestHash, claimId, JSON.stringify(result), JSON.stringify({ runtimeId, generation, eventIndex, event: event.event }),
      Date.parse(receivedAt), runtimeId, memberId, environmentId, event.event, generation, generation, eventIndex,
    ),
    db.prepare(`INSERT INTO environment_runtime_heads (member_id, environment_id, runtime_id, generation, event_index)
      SELECT member_id, environment_id, ?, ?, ? FROM environment_operation_receipts
      WHERE member_id = ? AND operation_id = ? AND claim_id = ?
      ON CONFLICT(member_id, environment_id, runtime_id) DO UPDATE
        SET generation = excluded.generation, event_index = excluded.event_index`).bind(
      runtimeId, generation, eventIndex, memberId, eventId, claimId,
    ),
    db.prepare("SELECT request_hash, response_json FROM environment_operation_receipts WHERE member_id = ? AND operation_id = ?").bind(memberId, eventId),
    db.prepare("SELECT type FROM browser_environments WHERE member_id = ? AND id = ?").bind(memberId, environmentId),
  ]);
  const receipt = results[2]?.results[0];
  if (receipt) {
    if (receipt.request_hash !== requestHash) throw new AppError("ENVIRONMENT_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
    return JSON.parse(receipt.response_json as string) as EnvironmentReportResult;
  }
  const environment = results[3]?.results[0];
  if (!environment) throw new AppError("ENVIRONMENT_NOT_FOUND", "Environment not found", 404);
  if (environment.type === "temporary" && event.event === "checkpoint_saved") {
    throw new AppError("ENVIRONMENT_PERSISTENCE_UNSUPPORTED", "Temporary environments do not persist checkpoints", 409);
  }
  throw new AppError("ENVIRONMENT_EVENT_STALE", "A newer or conflicting runtime event was already recorded", 409);
}
