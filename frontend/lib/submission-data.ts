import { apiFetch, type Fetcher } from "./api";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";
import { createIdempotencyKey, validateSubmissionDraft } from "../components/submissions/submission-form-model";

export interface SimilarSubmissionCandidate {
  submissionId: string;
  sourceId: string;
  sourceVersionId: string;
  title: string;
  similarity: number;
}

export async function createSubmission(draft: SubmissionDraft, requester: Fetcher = fetch, signal?: AbortSignal): Promise<{ id: string; similarCandidates: SimilarSubmissionCandidate[] }> {
  const validation = validateSubmissionDraft(draft);
  if (!validation.ok) throw new Error("SUBMISSION_DRAFT_INVALID");
  const data = await apiFetch<{ submission?: unknown; similarCandidates?: unknown }>("/api/submissions", {
    requester,
    signal,
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": createIdempotencyKey() },
    body: JSON.stringify({
      requestedSpaceId: "default",
      requestedCollectionId: null,
      requestedVisibility: "shared",
      kind: draft.mode,
      title: draft.title.trim(),
      content: draft.content,
    }),
  });
  const submission = data.submission;
  if (!submission || typeof submission !== "object" || Array.isArray(submission) || typeof (submission as Record<string, unknown>).id !== "string") {
    throw new Error("SUBMISSION_RESPONSE_INVALID");
  }
  const similarCandidates = Array.isArray(data.similarCandidates) ? data.similarCandidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const value = candidate as Record<string, unknown>;
    if (typeof value.submissionId !== "string" || typeof value.sourceId !== "string"
      || typeof value.sourceVersionId !== "string" || typeof value.title !== "string"
      || typeof value.similarity !== "number" || !Number.isFinite(value.similarity)
      || value.similarity < 0 || value.similarity > 1) return [];
    return [{ submissionId: value.submissionId, sourceId: value.sourceId, sourceVersionId: value.sourceVersionId, title: value.title, similarity: value.similarity }];
  }) : [];
  return { id: (submission as Record<string, string>).id, similarCandidates };
}
