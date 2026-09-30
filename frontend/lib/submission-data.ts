import { apiFetch, type Fetcher } from "./api";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";
import { validateSubmissionDraft } from "../components/submissions/submission-form-model";

export interface SubmissionTarget {
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  requestedVisibility: "shared" | "admin_only";
}
const defaultTarget: SubmissionTarget = { requestedSpaceId: "default", requestedCollectionId: null, requestedVisibility: "shared" };
export function validateSubmissionTarget(value: SubmissionTarget): SubmissionTarget {
  const id = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,200}$/u.test(v);
  if (!value || !id(value.requestedSpaceId) || (value.requestedCollectionId !== null && !id(value.requestedCollectionId))
    || !["shared", "admin_only"].includes(value.requestedVisibility)) throw Error("SUBMISSION_TARGET_INVALID");
  return { requestedSpaceId: value.requestedSpaceId, requestedCollectionId: value.requestedCollectionId, requestedVisibility: value.requestedVisibility };
}

export interface SimilarSubmissionCandidate {
  submissionId: string;
  sourceId: string;
  sourceVersionId: string;
  title: string;
  similarity: number;
}

export async function createSubmission(draft: SubmissionDraft, key: string, requester: Fetcher = fetch, signal?: AbortSignal, target: SubmissionTarget = defaultTarget): Promise<{ id: string; similarCandidates: SimilarSubmissionCandidate[] }> {
  const destination = validateSubmissionTarget(target);
  const validation = validateSubmissionDraft(draft);
  if (!validation.ok) throw new Error("SUBMISSION_DRAFT_INVALID");
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(key)) throw new Error("SUBMISSION_KEY_INVALID");
  const data = await apiFetch<{ submission?: unknown; similarCandidates?: unknown }>("/api/submissions", {
    requester,
    signal,
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify({
      ...destination,
      kind: draft.mode,
      title: draft.title.trim(),
      content: draft.content,
    }),
  });
  const submission = data?.submission;
  if (!submission || typeof submission !== "object" || Array.isArray(submission) || typeof (submission as Record<string, unknown>).id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/u.test((submission as Record<string, string>).id)) {
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
