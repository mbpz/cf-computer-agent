// @vitest-environment node
import { describe, expect, it } from "vitest";
import { listPrivateKnowledgeNoteShares, loadActiveWorkspaceMembers, loadPrivateKnowledgeNote, loadPrivateKnowledgeNotes, loadRemotePrivateKnowledgeNote, normalizePrivateKnowledgeNote, revokePrivateKnowledgeNoteShare, savePrivateKnowledgeNote, saveRemotePrivateKnowledgeNote, sharePrivateKnowledgeNote } from "../../frontend/lib/knowledge-note";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

describe("private reader notes", () => {
  it("defaults to a private empty note and ignores another knowledge item", () => {
    const store = storage();
    expect(loadPrivateKnowledgeNote("knowledge-a", store)).toEqual({ v: 1, knowledgeItemId: "knowledge-a", title: "", body: "", visibility: "private", updatedAt: "" });
    store.setItem("memory-garden:knowledge-note:v1:knowledge-b", JSON.stringify({ v: 1, knowledgeItemId: "knowledge-b", title: "Other", body: "secret", visibility: "private", updatedAt: "2026-08-26T00:00:00.000Z" }));
    expect(loadPrivateKnowledgeNote("knowledge-a", store).body).toBe("");
  });

  it("saves only a normalized private note under an item-scoped key", () => {
    const store = storage();
    const note = savePrivateKnowledgeNote("knowledge-a", { title: "  Key idea ", body: "  Keep this separate from正文  " }, store, () => "2026-08-26T00:00:00.000Z");
    expect(note).toEqual({ v: 1, knowledgeItemId: "knowledge-a", title: "Key idea", body: "Keep this separate from正文", visibility: "private", updatedAt: "2026-08-26T00:00:00.000Z" });
    expect(loadPrivateKnowledgeNote("knowledge-a", store)).toEqual(note);
    expect(normalizePrivateKnowledgeNote({ ...note, visibility: "shared" }, "knowledge-a")).toBeNull();
  });

  it("rejects invalid IDs and bounds content", () => {
    expect(() => savePrivateKnowledgeNote("../other", { title: "x", body: "y" }, storage())).toThrow("KNOWLEDGE_NOTE_ID_INVALID");
    expect(normalizePrivateKnowledgeNote({ v: 1, knowledgeItemId: "knowledge-a", title: "x", body: "y", visibility: "private", updatedAt: "" }, "knowledge-b")).toBeNull();
    expect(() => savePrivateKnowledgeNote("knowledge-a", { title: "x".repeat(2000), body: "" }, storage())).toThrow("KNOWLEDGE_NOTE_TOO_LARGE");
  });

  it("uses the owner-scoped API and preserves explicit citation payloads", async () => {
    const requests: Array<{ path: string; init?: RequestInit }> = [];
    const requester = async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ path: String(input), init });
      if (init?.method === "PUT") return new Response(JSON.stringify({ note: { visibility: "private", access: "owner", title: "Saved", body: "Body", updatedAt: "2026-08-26T00:00:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ note: null }), { status: 200, headers: { "content-type": "application/json" } });
    };
    await expect(loadRemotePrivateKnowledgeNote("knowledge-a", requester)).resolves.toBeNull();
    await expect(saveRemotePrivateKnowledgeNote("knowledge-a", { title: "Saved", body: "Body" }, [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 2, endLine: 4 }], requester)).resolves.toMatchObject({ title: "Saved", body: "Body", visibility: "private" });
    expect(requests[0]?.path).toBe("/api/knowledge/knowledge-a/note");
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ citations: [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 2, endLine: 4 }] });
  });

  it("loads a bounded private note list and drops malformed rows", async () => {
    const requester = async () => new Response(JSON.stringify({ items: [
      { id: "note-a", knowledgeItemId: "knowledge-a", title: "A", body: "Body", visibility: "private", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:01:00.000Z" },
      { id: "note-b", knowledgeItemId: "../other", title: "B", body: "No", visibility: "private", createdAt: "", updatedAt: "" },
    ] }), { status: 200 });
    await expect(loadPrivateKnowledgeNotes(requester)).resolves.toEqual([expect.objectContaining({ id: "note-a", knowledgeItemId: "knowledge-a", visibility: "private" })]);
  });

  it("uses owner-scoped share endpoints and normalizes active/revoked rows", async () => {
    const requests: Array<{ path: string; method?: string; body?: string }> = [];
    const requester = async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ path: String(input), method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
      if (init?.method === "POST") return new Response(JSON.stringify({ share: { noteId: "note-a", recipientMemberId: "member-b", createdAt: "2026-08-26T00:00:00.000Z", revokedAt: null } }), { status: 201 });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ shares: [{ noteId: "note-a", recipientMemberId: "member-b", createdAt: "2026-08-26T00:00:00.000Z", revokedAt: null }] }), { status: 200 });
    };
    await expect(sharePrivateKnowledgeNote("knowledge-a", "member-b", requester)).resolves.toMatchObject({ recipientMemberId: "member-b", revokedAt: null });
    await expect(listPrivateKnowledgeNoteShares("knowledge-a", requester)).resolves.toHaveLength(1);
    await expect(revokePrivateKnowledgeNoteShare("knowledge-a", "member-b", requester)).resolves.toBeUndefined();
    expect(requests.map((request) => `${request.method ?? "GET"} ${request.path}`)).toEqual([
      "POST /api/knowledge/knowledge-a/note/shares",
      "GET /api/knowledge/knowledge-a/note/shares",
      "DELETE /api/knowledge/knowledge-a/note/shares/member-b",
    ]);
    expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual({ recipientMemberId: "member-b" });
    await expect(sharePrivateKnowledgeNote("knowledge-a", "../other", requester)).rejects.toThrow("KNOWLEDGE_NOTE_MEMBER_ID_INVALID");
  });

  it("loads only the public member directory fields needed by sharing", async () => {
    const requester = async () => new Response(JSON.stringify({ items: [
      { id: "member-a", email: "a@example.test", role: "contributor", identitySubject: "github:1" },
      { id: "bad", email: "bad@example.test", role: "unknown" },
    ] }), { status: 200 });
    await expect(loadActiveWorkspaceMembers(requester)).resolves.toEqual([{ id: "member-a", email: "a@example.test", role: "contributor" }]);
  });
});
