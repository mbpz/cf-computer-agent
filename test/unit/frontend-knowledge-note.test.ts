// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadPrivateKnowledgeNote, normalizePrivateKnowledgeNote, savePrivateKnowledgeNote } from "../../frontend/lib/knowledge-note";

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
});
