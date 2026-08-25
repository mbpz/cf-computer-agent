import { apiFetch, type Fetcher } from "./api";
import type { SubmissionDraft } from "../components/submissions/submission-form-model";
import { createIdempotencyKey, validateSubmissionDraft } from "../components/submissions/submission-form-model";

export async function createSubmission(draft: SubmissionDraft, requester: Fetcher = fetch, signal?: AbortSignal): Promise<{ id: string }> {
  const validation = validateSubmissionDraft(draft);
  if (!validation.ok) throw new Error("SUBMISSION_DRAFT_INVALID");
  const data = await apiFetch<{ submission?: unknown }>("/api/submissions", {
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
  return { id: (submission as Record<string, string>).id };
}
