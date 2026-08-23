import { AppError } from "../http";
import { parseSource } from "../sources/parser";
import type { ParseSourceInput } from "../sources/types";
import type { AssetRecord, AssetWithJob, ParseJobRecord } from "./types";

export interface AssetRepositoryPort {
  findByIdempotency(ownerId: string, idempotencyKey: string): Promise<AssetWithJob | null>;
  insertAssetWithJob(asset: AssetRecord, job: ParseJobRecord): Promise<void>;
  findOwned(ownerId: string, assetId: string): Promise<AssetWithJob | null>;
  findById(assetId: string): Promise<AssetWithJob | null>;
  listProcessable(limit: number): Promise<string[]>;
  claimParseJob(assetId: string, now: string): Promise<ParseJobRecord | null>;
  markParseSucceeded(assetId: string, now: string): Promise<void>;
  markParseFailed(assetId: string, now: string, code: string, terminal: boolean): Promise<void>;
}

export interface AssetServiceOptions {
  id?: () => string;
  now?: () => Date;
  maxBytes?: number;
  markdownConverter?: AssetMarkdownConverter;
}

export interface AssetMarkdownConverter {
  toMarkdown(input: { name: string; blob: Blob }): Promise<AssetMarkdownConversionResult | AssetMarkdownConversionResult[]>;
}

export interface AssetMarkdownConversionResult {
  format: "markdown" | "text" | "error" | string;
  data?: string;
  error?: string;
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
  private readonly markdownConverter?: AssetMarkdownConverter;

  constructor(
    private readonly originals: R2Bucket,
    private readonly repository: AssetRepositoryPort,
    options: AssetServiceOptions = {},
  ) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
    this.maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
    this.markdownConverter = typeof options.markdownConverter?.toMarkdown === "function"
      ? options.markdownConverter
      : undefined;
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

  async process(ownerId: string, assetId: string): Promise<AssetWithJob> {
    return this.processRecord(await this.getOwned(ownerId, assetId));
  }

  async processDue(limit = 10): Promise<{ attempted: number; succeeded: number }> {
    const boundedLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(20, limit)) : 10;
    const assetIds = await this.repository.listProcessable(boundedLimit);
    let succeeded = 0;
    for (const assetId of assetIds) {
      try {
        const result = await this.processSystem(assetId);
        if (result?.job.status === "succeeded") succeeded += 1;
      } catch {
        // A single broken asset must not prevent the bounded sweep from continuing.
      }
    }
    return { attempted: assetIds.length, succeeded };
  }

  private async processSystem(assetId: string): Promise<AssetWithJob | null> {
    const current = await this.repository.findById(assetId);
    return current ? this.processRecord(current) : null;
  }

  private async processRecord(current: AssetWithJob): Promise<AssetWithJob> {
    if (current.job.status === "succeeded" || current.job.status === "failed_terminal") return current;
    const assetId = current.asset.id;
    const now = this.now().toISOString();
    const claimed = await this.repository.claimParseJob(assetId, now);
    if (!claimed) return (await this.repository.findById(assetId)) || current;

    const parsedKey = `parsed/${assetId}.md`;
    try {
      const original = await this.originals.get(current.asset.objectKey);
      if (!original) throw new AppError("ASSET_ORIGINAL_MISSING", "Original asset is missing", 422);
      const bytes = await original.arrayBuffer();
      const input = parseInputForAsset(current.asset, bytes);
      const parsed = input
        ? await parseSource(input)
        : await this.parseRichAsset(current.asset, bytes);
      await this.originals.put(parsedKey, parsed.normalizedMarkdown, {
        httpMetadata: { contentType: "text/markdown; charset=utf-8" },
        customMetadata: { assetId, state: "parsed", parserSchemaVersion: parsed.parserSchemaVersion },
      });
      await this.repository.markParseSucceeded(assetId, now);
    } catch (error) {
      await this.originals.delete(parsedKey).catch(() => undefined);
      const code = error instanceof AppError ? error.code : "ASSET_PARSE_RETRYABLE";
      const terminal = error instanceof AppError && [
        "ASSET_ORIGINAL_MISSING", "ASSET_PARSER_UNSUPPORTED", "ASSET_CONTENT_INVALID", "SOURCE_EMPTY", "SOURCE_TOO_LARGE", "SOURCE_METADATA_INVALID",
      ].includes(error.code);
      await this.repository.markParseFailed(assetId, now, code, terminal);
    }
    return (await this.repository.findById(current.asset.id)) || current;
  }

  private async parseRichAsset(asset: AssetRecord, bytes: ArrayBuffer) {
    if (!this.markdownConverter || !isRichAsset(asset)) {
      throw new AppError("ASSET_PARSER_UNSUPPORTED", "Asset type is not supported by this parser", 422);
    }
    let converted: AssetMarkdownConversionResult | AssetMarkdownConversionResult[];
    try {
      converted = await this.markdownConverter.toMarkdown({
        name: asset.originalName,
        blob: new Blob([bytes], { type: asset.contentType }),
      });
    } catch {
      throw new AppError("ASSET_AI_PARSE_FAILED", "Rich asset conversion is temporarily unavailable", 503, true);
    }
    const result = Array.isArray(converted) ? converted[0] : converted;
    if (!result || (result.format !== "markdown" && result.format !== "text") || typeof result.data !== "string") {
      throw new AppError("ASSET_AI_PARSE_FAILED", "Rich asset conversion failed", 422, true);
    }
    return parseSource({ kind: "markdown", content: result.data });
  }
}

function parseInputForAsset(asset: AssetRecord, bytes: ArrayBuffer): ParseSourceInput | null {
  const extension = asset.originalName.toLowerCase().split(".").at(-1) || "";
  const languages: Record<string, string> = {
    js: "javascript", mjs: "javascript", cjs: "javascript", ts: "typescript", mts: "typescript",
    py: "python", go: "go", rs: "rust", java: "java", sql: "sql", json: "json", yaml: "yaml", yml: "yaml", sh: "shell",
  };
  if (asset.contentType === "text/markdown" || extension === "md" || extension === "markdown") {
    const content = decodeUtf8(bytes);
    return { kind: "markdown", content };
  }
  if (asset.contentType === "application/json" || languages[extension]) {
    const content = decodeUtf8(bytes);
    return { kind: "code", content, language: languages[extension] || "json", fileLabel: asset.originalName, lineBaseline: 1 };
  }
  if (asset.contentType === "text/plain" || asset.contentType === "text/csv") {
    const content = decodeUtf8(bytes);
    return { kind: "text", content };
  }
  return null;
}

function decodeUtf8(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422);
  }
}

function isRichAsset(asset: AssetRecord): boolean {
  return asset.contentType === "application/pdf"
    || asset.contentType === "text/html"
    || asset.contentType === "application/xml"
    || asset.contentType.startsWith("image/")
    || asset.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || asset.contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || asset.contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    || asset.contentType === "application/vnd.ms-excel"
    || asset.contentType === "application/vnd.ms-powerpoint";
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
