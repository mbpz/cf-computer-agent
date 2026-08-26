import type { Page, PageRequest } from "../pagination";

export type AssetStatus = "ready" | "quarantined" | "failed";
export type ParseJobStatus = "queued" | "processing" | "succeeded" | "failed_retryable" | "failed_terminal";

export interface AssetRecord {
  id: string;
  ownerId: string;
  objectKey: string;
  originalName: string;
  contentType: string;
  byteSize: number;
  contentSha256: string;
  idempotencyKey: string;
  submissionId?: string | null;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ParseJobRecord {
  id: string;
  assetId: string;
  status: ParseJobStatus;
  attempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetWithJob {
  asset: AssetRecord;
  job: ParseJobRecord;
}

export type AssetPage = Page<AssetWithJob>;
export interface AssetPageRepositoryRequest extends PageRequest {
  cursorKey: string;
  status?: ParseJobStatus;
}
