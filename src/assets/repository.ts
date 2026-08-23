import type { AssetRecord, AssetWithJob, ParseJobRecord } from "./types";
import type { AssetRepositoryPort } from "./service";

type AssetRow = {
  id: string; owner_id: string; object_key: string; original_name: string; content_type: string;
  byte_size: number; content_sha256: string; idempotency_key: string; status: AssetRecord["status"];
  created_at: string; updated_at: string; job_id: string; job_status: ParseJobRecord["status"];
  attempts: number; last_error_code: string | null; job_created_at: string; job_updated_at: string;
};

export class AssetsRepository implements AssetRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findByIdempotency(ownerId: string, idempotencyKey: string): Promise<AssetWithJob | null> {
    return this.find("a.owner_id = ? AND a.idempotency_key = ?", [ownerId, idempotencyKey]);
  }

  async insertAssetWithJob(asset: AssetRecord, job: ParseJobRecord): Promise<void> {
    await this.db.batch([
      this.db.prepare(
        `INSERT INTO assets (id, owner_id, object_key, original_name, content_type, byte_size, content_sha256, idempotency_key, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(asset.id, asset.ownerId, asset.objectKey, asset.originalName, asset.contentType, asset.byteSize, asset.contentSha256, asset.idempotencyKey, asset.status, asset.createdAt, asset.updatedAt),
      this.db.prepare(
        `INSERT INTO parse_jobs (id, asset_id, status, attempts, last_error_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(job.id, job.assetId, job.status, job.attempts, job.lastErrorCode, job.createdAt, job.updatedAt),
    ]);
  }

  async findOwned(ownerId: string, assetId: string): Promise<AssetWithJob | null> {
    return this.find("a.owner_id = ? AND a.id = ?", [ownerId, assetId]);
  }

  async findById(assetId: string): Promise<AssetWithJob | null> {
    return this.find("a.id = ?", [assetId]);
  }

  async listProcessable(limit: number): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT asset_id FROM parse_jobs
       WHERE status IN ('queued', 'failed_retryable') AND attempts < 3
       ORDER BY updated_at ASC, id ASC LIMIT ?`,
    ).bind(limit).all<{ asset_id: string }>();
    return result.results.map((row) => row.asset_id);
  }

  async claimParseJob(assetId: string, now: string): Promise<ParseJobRecord | null> {
    const result = await this.db.prepare(
      `UPDATE parse_jobs
       SET status = 'processing', attempts = attempts + 1, updated_at = ?
       WHERE asset_id = ? AND status IN ('queued', 'failed_retryable') AND attempts < 3`,
    ).bind(now, assetId).run();
    if (!result.meta.changes) return null;
    const row = await this.db.prepare(
      `SELECT id, asset_id, status, attempts, last_error_code, created_at, updated_at FROM parse_jobs WHERE asset_id = ?`,
    ).bind(assetId).first<ParseJobRecord & { asset_id: string; created_at: string; updated_at: string; last_error_code: string | null }>();
    return row ? {
      id: row.id, assetId: row.asset_id, status: row.status, attempts: row.attempts,
      lastErrorCode: row.last_error_code, createdAt: row.created_at, updatedAt: row.updated_at,
    } : null;
  }

  async markParseSucceeded(assetId: string, now: string): Promise<void> {
    await this.db.batch([
      this.db.prepare("UPDATE parse_jobs SET status = 'succeeded', last_error_code = NULL, updated_at = ? WHERE asset_id = ? AND status = 'processing'").bind(now, assetId),
      this.db.prepare("UPDATE assets SET updated_at = ? WHERE id = ?").bind(now, assetId),
    ]);
  }

  async markParseFailed(assetId: string, now: string, code: string, terminal: boolean): Promise<void> {
    await this.db.batch([
      this.db.prepare("UPDATE parse_jobs SET status = ?, last_error_code = ?, updated_at = ? WHERE asset_id = ? AND status = 'processing'")
        .bind(terminal ? "failed_terminal" : "failed_retryable", code, now, assetId),
      this.db.prepare("UPDATE assets SET status = ?, updated_at = ? WHERE id = ?")
        .bind(terminal ? "failed" : "ready", now, assetId),
    ]);
  }

  private async find(where: string, values: unknown[]): Promise<AssetWithJob | null> {
    const row = await this.db.prepare(
      `SELECT a.id, a.owner_id, a.object_key, a.original_name, a.content_type, a.byte_size,
              a.content_sha256, a.idempotency_key, a.status, a.created_at, a.updated_at,
              j.id AS job_id, j.status AS job_status, j.attempts, j.last_error_code,
              j.created_at AS job_created_at, j.updated_at AS job_updated_at
       FROM assets a JOIN parse_jobs j ON j.asset_id = a.id WHERE ${where} LIMIT 1`,
    ).bind(...values).first<AssetRow>();
    return row ? mapRow(row) : null;
  }
}

function mapRow(row: AssetRow): AssetWithJob {
  return {
    asset: {
      id: row.id, ownerId: row.owner_id, objectKey: row.object_key, originalName: row.original_name,
      contentType: row.content_type, byteSize: row.byte_size, contentSha256: row.content_sha256,
      idempotencyKey: row.idempotency_key, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
    },
    job: {
      id: row.job_id, assetId: row.id, status: row.job_status, attempts: row.attempts,
      lastErrorCode: row.last_error_code, createdAt: row.job_created_at, updatedAt: row.job_updated_at,
    },
  };
}
