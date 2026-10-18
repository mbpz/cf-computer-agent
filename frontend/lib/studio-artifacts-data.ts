import { apiFetch, type Fetcher } from "./api";
import { isCanonicalTimestamp } from "../components/review/review-detail-data";

export type StudioArtifactKind = "mindmap" | "flashcards" | "quiz";

export interface StudioArtifactSummary {
  readonly id: string;
  readonly kind: StudioArtifactKind;
  readonly revisionId: string;
  readonly createdAt: string;
}

export interface StudioArtifactRecord extends StudioArtifactSummary {
  readonly citationIds: readonly string[];
  readonly payload: unknown;
}

const KINDS: Record<StudioArtifactKind, true> = { mindmap: true, flashcards: true, quiz: true };
const ID = /^[A-Za-z0-9_-]+$/u;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function summary(value: unknown): StudioArtifactSummary | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = typeof record.id === "string" && ID.test(record.id) ? record.id : null;
  const kind = typeof record.kind === "string" && Object.hasOwn(KINDS, record.kind) ? record.kind as StudioArtifactKind : null;
  const revisionId = typeof record.revisionId === "string" && ID.test(record.revisionId) ? record.revisionId : null;
  if (!id || !kind || !revisionId || !isCanonicalTimestamp(record.createdAt)) return null;
  return { id, kind, revisionId, createdAt: record.createdAt };
}

function record(value: unknown): StudioArtifactRecord | null {
  const entry = asRecord(value);
  const base = summary(value);
  if (!entry || !base) return null;
  const citationIds = entry.citationIds;
  if (!Array.isArray(citationIds) || citationIds.length > 8
    || citationIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 512)
    || new Set(citationIds).size !== citationIds.length) return null;
  if (entry.payload === undefined) return null;
  return { ...base, citationIds: citationIds as string[], payload: entry.payload };
}

export async function loadStudioArtifacts(
  knowledgeItemId: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<readonly StudioArtifactSummary[]> {
  if (!ID.test(knowledgeItemId)) throw new Error("STUDIO_ARTIFACT_INVALID");
  const payload = await apiFetch<unknown>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/artifacts`, { requester, signal });
  const items = asRecord(payload)?.artifacts;
  if (!Array.isArray(items) || items.length > 50) throw new Error("STUDIO_ARTIFACT_INVALID");
  const summaries = items.map(summary);
  if (summaries.some((item) => item === null)) throw new Error("STUDIO_ARTIFACT_INVALID");
  return summaries as StudioArtifactSummary[];
}

export async function readStudioArtifact(
  knowledgeItemId: string,
  artifactId: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<StudioArtifactRecord> {
  if (!ID.test(knowledgeItemId) || !ID.test(artifactId)) throw new Error("STUDIO_ARTIFACT_INVALID");
  const payload = await apiFetch<unknown>(
    `/api/knowledge/${encodeURIComponent(knowledgeItemId)}/artifacts/${encodeURIComponent(artifactId)}`,
    { requester, signal },
  );
  const artifact = record(asRecord(payload)?.artifact);
  if (!artifact || artifact.id !== artifactId) throw new Error("STUDIO_ARTIFACT_INVALID");
  return artifact;
}

export async function deleteStudioArtifact(
  knowledgeItemId: string,
  artifactId: string,
  requester: Fetcher = fetch,
): Promise<void> {
  if (!ID.test(knowledgeItemId) || !ID.test(artifactId)) throw new Error("STUDIO_ARTIFACT_INVALID");
  const payload = await apiFetch<unknown>(
    `/api/knowledge/${encodeURIComponent(knowledgeItemId)}/artifacts/${encodeURIComponent(artifactId)}`,
    { requester, method: "DELETE", headers: { "content-type": "application/json" } },
  );
  if (asRecord(payload)?.deleted !== true) throw new Error("STUDIO_ARTIFACT_INVALID");
}
