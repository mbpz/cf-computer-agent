// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  beginResubmission,
  clearResubmitRecord,
  closeResubmission,
  isResubmissionOpen,
  loadResubmitRecord,
  openResubmission,
  readSubmissionStatus,
  resolveResubmission,
  restartResubmission,
  resubmitSubmission,
  saveResubmitRecord,
  withResubmitEdits,
  withResubmitResult,
  type ResubmitRecord,
  type ResubmitSource,
} from "../../frontend/lib/submission-resubmit-data";

const NOW = "2026-10-16T09:00:00.000Z";

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

const source: ResubmitSource = {
  id: "prior-1",
  title: "Returned guide",
  kind: "markdown",
  content: "# Body",
  target: { requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared" },
  reviewNote: "Please add sources.",
};

function mineBody(items: unknown[]) {
  return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } };
}

describe("resubmission record and transport", () => {
  it("opens a returned item with one key and reuses it while the item is being edited", () => {
    const recordStore = storage();
    const session = storage();
    const first = beginResubmission("member-a", source, { records: recordStore, session });
    expect(first).toMatchObject({ priorId: "prior-1", state: "editing", draft: { mode: "markdown", title: "Returned guide", content: "# Body" }, reviewNote: "Please add sources." });
    expect(first!.key).toMatch(/^[A-Za-z0-9_-]{16,}$/u);
    expect(isResubmissionOpen("member-a", "prior-1", session)).toBe(true);

    const again = beginResubmission("member-a", source, { records: recordStore, session });
    expect(again!.key).toBe(first!.key);

    const other = beginResubmission("member-a", { ...source, id: "prior-2" }, { records: recordStore, session });
    expect(other!.key).not.toBe(first!.key);
    expect(other!.priorId).toBe("prior-2");
  });

  it("keeps the key for a confirmed attempt and mints a new one only on an explicit restart", () => {
    const store = storage();
    const opened = beginResubmission("member-a", source, { records: store })!;
    const settled = withResubmitResult(opened, { id: "submission-new", status: "review_pending", similarCandidates: [] });
    expect(saveResubmitRecord("member-a", settled, store)).toBe(true);
    expect(loadResubmitRecord("member-a", store)).toMatchObject({ kind: "ready", record: { state: "submitted", submissionId: "submission-new" } });

    const restarted = restartResubmission("member-a", settled, store)!;
    expect(restarted.key).not.toBe(settled.key);
    expect(restarted).toMatchObject({ state: "editing", lastSubmissionId: "submission-new" });
  });

  it("closes this tab's editor without losing the record or its key", () => {
    const recordStore = storage();
    const session = storage();
    const opened = beginResubmission("member-a", source, { records: recordStore, session })!;
    openResubmission("member-a", "prior-1", session);
    closeResubmission("member-a", session);
    expect(isResubmissionOpen("member-a", "prior-1", session)).toBe(false);
    expect(loadResubmitRecord("member-a", recordStore)).toMatchObject({ kind: "ready", record: { key: opened.key } });
    expect(clearResubmitRecord("member-a", "prior-2", recordStore)).toBe(false);
    expect(clearResubmitRecord("member-a", "prior-1", recordStore)).toBe(true);
    expect(loadResubmitRecord("member-a", recordStore)).toEqual({ kind: "empty" });
  });

  it("posts the attempt with its journaled key and the edited destination", async () => {
    const calls: { path: string; method?: string; key?: string | null; body?: unknown }[] = [];
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(input), method: init?.method, key: new Headers(init?.headers).get("idempotency-key"), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json({ submission: { id: "submission-new", status: "review_pending" }, similarCandidates: [] });
    });
    const opened = withResubmitEdits(beginResubmission("member-a", source, { records: storage() })!, { mode: "markdown", title: "Revised guide", content: "# Revised" },
      { requestedSpaceId: "space-b", requestedCollectionId: "collection-a", requestedVisibility: "shared" });
    await expect(resubmitSubmission(opened, { requester })).resolves.toEqual({ id: "submission-new", status: "review_pending", similarCandidates: [] });
    expect(calls).toEqual([{
      path: "/api/submissions/prior-1/resubmit", method: "POST", key: opened.key,
      body: { requestedSpaceId: "space-b", requestedCollectionId: "collection-a", requestedVisibility: "shared", kind: "markdown", title: "Revised guide", content: "# Revised" },
    }]);

    const invalid = vi.fn(async () => Response.json({ submission: { id: "submission-new", status: "banana" } }));
    await expect(resubmitSubmission(opened, { requester: invalid })).rejects.toThrow("SUBMISSION_RESPONSE_INVALID");
    const empty = withResubmitEdits(opened, { mode: "markdown", title: "", content: "" }, null);
    await expect(resubmitSubmission(empty, { requester })).rejects.toThrow("SUBMISSION_DRAFT_INVALID");
  });

  it("reads the authoritative status of a submission this member owns", async () => {
    const requester = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/submissions/mine?page=1&pageSize=20");
      return Response.json(mineBody([{ id: "submission-new", title: "Revised guide", status: "published" }]));
    });
    await expect(readSubmissionStatus("submission-new", { requester })).resolves.toEqual({ status: "published", title: "Revised guide" });
    const absent = vi.fn(async () => Response.json(mineBody([{ id: "other", title: "Other", status: "published" }])));
    await expect(readSubmissionStatus("submission-new", { requester: absent })).resolves.toBeNull();
    const broken = vi.fn(async () => Response.json({ error: { code: "UNAVAILABLE", message: "UNAVAILABLE", retryable: true } }, { status: 503 }));
    await expect(readSubmissionStatus("submission-new", { requester: broken })).rejects.toBeTruthy();
  });

  it("reconciles an unknown attempt through the server's own supersede link", async () => {
    const requester = vi.fn(async () => Response.json(mineBody([
      { id: "submission-other", title: "Unrelated", status: "review_pending", supersedesSubmissionId: "prior-2" },
      { id: "submission-new", title: "Revised", status: "review_pending", supersedesSubmissionId: "prior-1" },
    ])));
    await expect(resolveResubmission("prior-1", { requester })).resolves.toEqual({ kind: "resolved", submissionId: "submission-new", status: "review_pending" });

    const none = vi.fn(async () => Response.json(mineBody([{ id: "submission-other", title: "Unrelated", status: "review_pending" }])));
    await expect(resolveResubmission("prior-1", { requester: none })).resolves.toEqual({ kind: "resend" });

    const offline = vi.fn(async () => { throw new Error("offline"); });
    await expect(resolveResubmission("prior-1", { requester: offline })).resolves.toEqual({ kind: "pending" });
  });

  it("rejects a malformed record instead of editing from it", () => {
    const store = storage();
    const opened: ResubmitRecord = beginResubmission("member-a", source, { records: store })!;
    expect(saveResubmitRecord("member-a", { ...opened, key: "short" }, store)).toBe(false);
    expect(saveResubmitRecord("member-a", { ...opened, state: "submitted" }, store)).toBe(false);
    expect(saveResubmitRecord("member-a", { ...opened, target: { requestedSpaceId: "", requestedCollectionId: null, requestedVisibility: "shared" } }, store)).toBe(false);
    expect(loadResubmitRecord("member-a", store)).toMatchObject({ kind: "ready", record: { key: opened.key } });
    store.setItem("personal-workbench:submission-resubmit:v1:member-a", "{");
    expect(loadResubmitRecord("member-a", store)).toEqual({ kind: "invalid" });
  });

  it("keeps an attempt opened by a source without a review note", () => {
    const opened = beginResubmission("member-a", { ...source, reviewNote: undefined }, { records: storage() });
    expect(opened).toMatchObject({ priorId: "prior-1" });
    expect(opened!.reviewNote).toBeUndefined();
    const { reviewNote: _ignored, ...withoutNote } = source;
    expect(beginResubmission("member-b", withoutNote as ResubmitSource, { records: storage() })).toMatchObject({ priorId: "prior-1" });
    expect(beginResubmission("member-b", { ...source, id: "bad id!" }, { records: storage() })).toBeNull();
    expect(beginResubmission("", source, { records: storage() })).toBeNull();
  });

  it("keeps the startedAt of a reloaded attempt unchanged", () => {
    const store = storage();
    const opened = beginResubmission("member-a", source, { records: store })!;
    expect(Date.parse(opened.startedAt)).toBeGreaterThan(0);
    expect(loadResubmitRecord("member-a", store)).toMatchObject({ kind: "ready", record: { startedAt: opened.startedAt, priorId: "prior-1" } });
    expect(NOW).not.toBe(opened.startedAt);
  });
});
