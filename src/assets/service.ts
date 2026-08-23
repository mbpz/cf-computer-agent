import { AppError } from "../http";
import type { AssetRecord, AssetWithJob, ParseJobRecord } from "./types";

export interface AssetRepositoryPort {
  findByIdempotency(ownerId: string, idempotencyKey: string): Promise<AssetWithJob | null>;
  insertAssetWithJob(asset: AssetRecord, job: ParseJobRecord): Promise<void>;
  findOwned(ownerId: string, assetId: string): Promise<AssetWithJob | null>;
}

export interface AssetServiceOptions {
  id?: () => string;
  now?: () => Date;
  maxBytes?: number;
}

export interface AssetUploadInput {
  ownerId: string;
  originalName: string;
  contentType: string;
  bytes: ArrayBuffer;
  idempotencyKey: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set([
  "text/plain", "text/markdown", "text/csv", "text/html", "application/pdf",
  "application/json", "application/xml", "application/rtf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "image/png", "image/jpeg", "image/gif", "image/webp",
]);

export class AssetService {
  private readonly id: () => string;
  private readonly now: () => Date;
  private readonly maxBytes: number;

  constructor(
    private readonly originals: R2Bucket,
    private readonly repository: AssetRepositoryPort,
    options: AssetServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  }

  async create(input: AssetUploadInput): Promise<AssetWithJob> {
    validateInput(input, this.maxBytes);
    const replay = await this.repository.findByIdempotency(input.ownerId, input.idempotencyKey);
    if (replay) return replay;

    const id = this.id();
    const now = this.now().toISOString();
    const objectKey = `staging/${id}`;
    const asset: AssetRecord = {
      id,
      ownerId: input.ownerId,
      objectKey,
      originalName: input.originalName.trim(),
      contentType: normalizeContentType(input.contentType),
      byteSize: input.bytes.byteLength,
      contentSha256: await sha256Hex(input.bytes),
      idempotencyKey: input.idempotencyKey,
      status: "ready",
      createdAt: now,
      updatedAt: now,
    };
    const job: ParseJobRecord = {
      id: this.id(),
      assetId: id,
      status: "queued",
      attempts: 0,
      lastErrorCode: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.originals.put(objectKey, input.bytes, {
        httpMetadata: { contentType: asset.contentType },
        customMetadata: { assetId: asset.id, state: "staging" },
      });
      await this.repository.insertAssetWithJob(asset, job);
      return { asset, job };
    } catch (error) {
      await this.originals.delete(objectKey).catch(() => undefined);
      if (error instanceof AppError) throw error;
      throw new AppError("ASSET_PERSISTENCE_UNAVAILABLE", "Asset storage is temporarily unavailable", 503, true);
    }
  }

  async getOwned(ownerId: string, assetId: string): Promise<AssetWithJob> {
    const result = await this.repository.findOwned(ownerId, assetId);
    if (!result) throw new AppError("ASSET_NOT_FOUND", "Asset not found", 404);
    return result;
  }
}

function validateInput(input: AssetUploadInput, maxBytes: number): void {
  if (!input.ownerId || !input.idempotencyKey || input.idempotencyKey.length > 200) {
    throw new AppError("ASSET_REQUEST_INVALID", "Asset request is invalid", 400);
  }
  if (!(input.bytes instanceof ArrayBuffer) || input.bytes.byteLength === 0) {
    throw new AppError("ASSET_EMPTY", "Asset body is empty", 400);
  }
  if (input.bytes.byteLength > maxBytes) {
    throw new AppError("ASSET_TOO_LARGE", "Asset exceeds the upload limit", 413);
  }
  if (!input.originalName.trim() || input.originalName.length > 200 || /[\u0000-\u001f\u007f/\\]/u.test(input.originalName)) {
    throw new AppError("ASSET_NAME_INVALID", "Asset name is invalid", 400);
  }
  if (!allowedTypes.has(normalizeContentType(input.contentType))) {
    throw new AppError("ASSET_TYPE_UNSUPPORTED", "Asset type is not supported", 415);
  }
}

function normalizeContentType(value: string): string {
  return value.split(";", 1)[0]!.trim().toLowerCase();
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
