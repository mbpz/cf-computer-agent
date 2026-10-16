// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  clearDraftRecord,
  clearDraftWriteIntent,
  createDraftRecord,
  createDraftWriteIntent,
  draftBody,
  loadDraftRecord,
  loadDraftWriteIntent,
  matchesBody,
  normalizeServerDraft,
  readDraft,
  resolveDraftWriteIntent,
  saveDraftRecord,
  saveDraftWriteIntent,
  writeDraft,
  type DraftBody,
  type DraftWriteIntent,
  type SubmissionDraftRecord,
} from "../../frontend/lib/submission-draft-data";
import type { SubmissionTarget } from "../../frontend/lib/submission-data";

const NOW = "2026-10-16T09:00:00.000Z";
const target: SubmissionTarget = { requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared" };

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

function draftRow(over: Record<string, unknown> = {}) {
  return {
    id: "draft-1", submitterId: "member-a", requestedSpaceId: "space-a", requestedCollectionId: null,
    requestedVisibility: "shared", kind: "markdown", status: "draft", title: "Guide", content: "# Body",
    createdAt: NOW, updatedAt: NOW, ...over,
  };
}

function mineBody(items: unknown[]) {
  return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } };
}

describe("server-backed submission drafts", () => {
  it("describes a draft body only for a real destination and non-empty bounded text", () => {
    expect(draftBody(null, { mode: "text", title: "T", content: "body" })).toBeNull();
    expect(draftBody(target, { mode: "text", title: "", content: "  " })).toBeNull();
    expect(draftBody(target, { mode: "text", title: "  Guide  ", content: "# Body" })).toEqual({
      requestedSpaceId: "space-a", requestedCollectionId: null, requestedVisibility: "shared",
      kind: "text", title: "Guide", content: "# Body",
    });
    expect(draftBody(target, { mode: "text", title: "T", content: "x".repeat(131073) })).toBeNull();
    expect(draftBody({ ...target, requestedSpaceId: "bad id!" }, { mode: "text", title: "T", content: "body" })).toBeNull();
  });

  it("posts a new draft and patches the draft this browser owns", async () => {
    const calls: { path: string; method?: string; body?: unknown }[] = [];
    const requester = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ path: String(input), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json(draftRow());
    });
    const body: DraftBody = { ...target, kind: "markdown", title: "Guide", content: "# Body" };
    await expect(writeDraft(createDraftWriteIntent("create", null, body), { requester })).resolves.toMatchObject({ id: "draft-1", title: "Guide", target });
    await writeDraft(createDraftWriteIntent("update", "draft-1", body), { requester });
    expect(calls).toEqual([
      { path: "/api/submissions/drafts", method: "POST", body },
      { path: "/api/submissions/drafts/draft-1", method: "PATCH", body },
    ]);
    await expect(readDraft("draft-1", { requester })).resolves.toMatchObject({ id: "draft-1" });
    expect(calls[2]!.path).toBe("/api/submissions/drafts/draft-1");
  });

  it("refuses a draft response that does not describe a draft this member owns", () => {
    for (const row of [draftRow({ status: "review_pending" }), draftRow({ id: "" }), draftRow({ updatedAt: "nope" }), draftRow({ requestedSpaceId: 7 })]) {
      expect(() => normalizeServerDraft(row)).toThrow("DRAFT_RESPONSE_INVALID");
    }
    expect(normalizeServerDraft(draftRow())).toEqual({
      id: "draft-1", title: "Guide", content: "# Body", kind: "markdown", updatedAt: NOW, target,
    });
  });

  it("keeps the draft identity per member and rejects a malformed record without touching storage", () => {
    const store = storage();
    expect(saveDraftRecord("member-a", createDraftRecord("draft-1", target), store)).toBe(true);
    expect(saveDraftRecord("member-b", createDraftRecord("draft-2", target), store)).toBe(true);
    expect(loadDraftRecord("member-a", store)).toEqual({ kind: "ready", record: { version: 1, draftId: "draft-1", target } });
    expect(loadDraftRecord("member-b", store)).toEqual({ kind: "ready", record: { version: 1, draftId: "draft-2", target } });
    expect(saveDraftRecord("member-a", { version: 1, draftId: "bad id!", target }, store)).toBe(false);
    expect(saveDraftRecord("member-a", { version: 1, draftId: null, target: { requestedSpaceId: "", requestedCollectionId: null, requestedVisibility: "shared" } }, store)).toBe(false);
    expect(store.getItem("personal-workbench:submission-draft:v1:member-a")).toContain("draft-1");
    clearDraftRecord("member-a", store);
    expect(loadDraftRecord("member-a", store)).toEqual({ kind: "empty" });
    expect(loadDraftRecord("", store)).toEqual({ kind: "invalid" });
  });

  it("resolves a create whose outcome was never observed by reading the member's newest drafts", async () => {
    const body: DraftBody = { ...target, kind: "markdown", title: "Guide", content: "# Body" };
    const intent = createDraftWriteIntent("create", null, body, NOW);
    const found = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/submissions/mine?page=1&pageSize=20&status=draft");
      return Response.json(mineBody([draftRow({ id: "draft-9" })]));
    });
    await expect(resolveDraftWriteIntent(intent, { requester: found })).resolves.toMatchObject({ kind: "resolved", draft: { id: "draft-9" } });

    const other = vi.fn(async () => Response.json(mineBody([draftRow({ id: "draft-other", content: "different" })])));
    await expect(resolveDraftWriteIntent(intent, { requester: other })).resolves.toEqual({ kind: "resend" });

    const broken = vi.fn(async () => { throw new Error("offline"); });
    await expect(resolveDraftWriteIntent(intent, { requester: broken })).resolves.toEqual({ kind: "pending" });
  });

  it("re-reads a journaled update before repeating it and recreates a draft the server dropped", async () => {
    const body: DraftBody = { ...target, kind: "markdown", title: "Guide", content: "# Body" };
    const intent = createDraftWriteIntent("update", "draft-1", body, NOW);
    const matching = vi.fn(async () => Response.json(draftRow()));
    await expect(resolveDraftWriteIntent(intent, { requester: matching })).resolves.toMatchObject({ kind: "resolved" });

    const stale = vi.fn(async () => Response.json(draftRow({ content: "# Older" })));
    await expect(resolveDraftWriteIntent(intent, { requester: stale })).resolves.toEqual({ kind: "resend" });

    const missing = vi.fn(async () => Response.json({ error: { code: "SUBMISSION_NOT_FOUND", message: "Submission not found", retryable: false } }, { status: 404 }));
    await expect(resolveDraftWriteIntent(intent, { requester: missing })).resolves.toEqual({ kind: "recreate" });

    const failing = vi.fn(async () => Response.json({ error: { code: "UNAVAILABLE", message: "UNAVAILABLE", retryable: true } }, { status: 503 }));
    await expect(resolveDraftWriteIntent(intent, { requester: failing })).resolves.toEqual({ kind: "pending" });
  });

  it("never overwrites another pending write intent and drops a stale one", () => {
    const store = storage();
    const body: DraftBody = { ...target, kind: "text", title: "Guide", content: "body" };
    const first = createDraftWriteIntent("create", null, body, NOW);
    expect(saveDraftWriteIntent("member-a", first, store)).toBe(true);
    const second = createDraftWriteIntent("create", null, body, "2026-10-16T09:01:00.000Z");
    expect(saveDraftWriteIntent("member-a", second, store)).toBe(false);
    expect(loadDraftWriteIntent("member-a", store)).toMatchObject({ kind: "ready", intent: { startedAt: NOW } });
    expect(clearDraftWriteIntent("member-a", second.startedAt, store)).toBe(false);
    expect(clearDraftWriteIntent("member-a", first.startedAt, store)).toBe(true);
    expect(loadDraftWriteIntent("member-a", store)).toEqual({ kind: "empty" });

    const stale = createDraftWriteIntent("create", null, body, "2026-09-01T00:00:00.000Z");
    store.setItem("personal-workbench:submission-draft-write:v1:member-a", JSON.stringify(stale));
    expect(loadDraftWriteIntent("member-a", store)).toEqual({ kind: "invalid" });
  });

  it("distinguishes a matching record from a record for another destination", () => {
    const body: DraftBody = { ...target, kind: "markdown", title: "Guide", content: "# Body" };
    expect(matchesBody(normalizeServerDraft(draftRow()), body)).toBe(true);
    expect(matchesBody(normalizeServerDraft(draftRow({ requestedCollectionId: "collection-a" })), body)).toBe(false);
    expect(matchesBody(normalizeServerDraft(draftRow({ title: "Other" })), body)).toBe(false);
  });

  it("keeps the stored intent as the exact journaled request", () => {
    const body: DraftBody = { ...target, kind: "markdown", title: "Guide", content: "# Body" };
    const intent: DraftWriteIntent = createDraftWriteIntent("update", "draft-1", body, NOW);
    const store = storage();
    expect(saveDraftWriteIntent("member-a", intent, store)).toBe(true);
    const loaded = loadDraftWriteIntent("member-a", store);
    expect(loaded).toEqual({ kind: "ready", intent });
    const record: SubmissionDraftRecord = createDraftRecord("draft-1", target);
    expect(record).toEqual({ version: 1, draftId: "draft-1", target });
  });
});
