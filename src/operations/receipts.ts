import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import { AppError } from "../http";

/**
 * The administrator operations that are recorded so a lost response can be
 * retried under the same operation number and replayed instead of acting twice.
 * Each kind is one destructive or service-affecting intent: reclaiming orphaned
 * asset objects, closing admission for a maintenance window, reopening it.
 */
export type AdminOperationKind = "asset.orphans.reclaim" | "maintenance.begin_drain" | "maintenance.resume";

export interface AdminOperationRecord<T> {
  readonly kind: AdminOperationKind;
  readonly operationId: string;
  /** Digest of the exact intent the operation number was first used for. */
  readonly requestHash: string;
  readonly actorId: string;
  /** The answer that is replayed for every later attempt of the same number. */
  readonly response: T;
  /** The one audit event this operation produces, written only by the claim owner. */
  readonly audit: CreateAuditEvent;
}

export interface AdminOperationReceipt {
  readonly requestHash: string;
  readonly responseJson: string;
}

interface ReceiptRow {
  request_hash: string;
  response_json: string;
}

/** Matches the recorded response bound in `0071_admin_operation_receipts.sql`. */
export const MAX_ADMIN_OPERATION_RESPONSE_BYTES = 65_536;

export class AdminOperationReceipts {
  private readonly audit: AuditRepository;
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly db: D1Database, options: { id?: () => string; now?: () => Date } = {}) {
    this.audit = new AuditRepository(db);
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  find(kind: AdminOperationKind, operationId: string): Promise<AdminOperationReceipt | null> {
    return this.db.prepare(
      `SELECT request_hash, response_json FROM admin_operation_receipts
       WHERE kind = ? AND operation_id = ? LIMIT 1`,
    ).bind(kind, operationId).first<ReceiptRow>()
      .then((row) => (row ? { requestHash: row.request_hash, responseJson: row.response_json } : null));
  }

  /**
   * Records the answer of an operation that has already been applied.
   *
   * One batch claims the operation number, writes the single audit event for the
   * winning attempt and reads the receipt back, so:
   * - a retry (or a racing duplicate) of a recorded operation answers with the
   *   recorded result instead of performing the work a second time;
   * - the same number used for a different intent fails as an explicit conflict;
   * - exactly one audit event exists per recorded operation, because the audit
   *   statement only runs for the attempt whose claim row won.
   *
   * The caller must consult {@link find} before applying its work: this method
   * cannot undo work that already happened.
   */
  async record<T>(input: AdminOperationRecord<T>): Promise<T> {
    const responseJson = JSON.stringify(input.response);
    if (responseJson.length > MAX_ADMIN_OPERATION_RESPONSE_BYTES) {
      throw new AppError("ADMIN_OPERATION_TOO_LARGE", "Operation result is too large to record", 500);
    }
    const claimId = this.id();
    const results = await this.db.batch([
      this.db.prepare(
        `INSERT INTO admin_operation_receipts
           (kind, operation_id, request_hash, actor_id, claim_id, response_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(kind, operation_id) DO NOTHING`,
      ).bind(input.kind, input.operationId, input.requestHash, input.actorId, claimId, responseJson, this.now().toISOString()),
      // Must follow the claim insert directly: a losing claim changes no row, so
      // it must not produce a success event.
      this.audit.prepareChangedRowAudit(input.audit),
      this.db.prepare(
        `SELECT request_hash, response_json FROM admin_operation_receipts
         WHERE kind = ? AND operation_id = ? LIMIT 1`,
      ).bind(input.kind, input.operationId),
    ]);
    const receipt = results[2]?.results?.[0] as ReceiptRow | undefined;
    if (!receipt) {
      throw new AppError("ADMIN_OPERATION_UNAVAILABLE", "Operation receipt is unavailable", 503, true);
    }
    if (receipt.request_hash !== input.requestHash) {
      throw new AppError("ADMIN_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
    }
    return JSON.parse(receipt.response_json) as T;
  }
}

/** Reads a recorded operation, or `undefined` when this number is new. */
export async function recordedOperation<T>(
  receipts: AdminOperationReceipts,
  kind: AdminOperationKind,
  operationId: string,
  requestHash: string,
): Promise<T | undefined> {
  const receipt = await receipts.find(kind, operationId);
  if (receipt === null) return undefined;
  if (receipt.requestHash !== requestHash) {
    throw new AppError("ADMIN_OPERATION_CONFLICT", "Operation ID was already used for a different request", 409);
  }
  return JSON.parse(receipt.responseJson) as T;
}

/** SHA-256 digest of the exact intent, hex encoded: the receipt's request binding. */
export async function operationRequestHash(intent: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(intent)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
