import { describe, expect, it } from "vitest";
import { clearOfflineSubmissionDraft, loadOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "../../frontend/lib/offline-submission-draft";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("offline submission draft", () => {
  it("restores only the authenticated member's namespaced draft", () => {
    const store = storage();
    store.setItem("personal-workbench:offline-submission-draft:v2:member-a", JSON.stringify({ mode: "text", title: "A", content: "private A" }));
    store.setItem("personal-workbench:offline-submission-draft:v2:member-b", JSON.stringify({ mode: "markdown", title: "B", content: "private B" }));
    expect(loadOfflineSubmissionDraft("member-b", store)).toEqual({ mode: "markdown", title: "B", content: "private B" });
    expect(loadOfflineSubmissionDraft("member-a", store)).toEqual({ mode: "text", title: "A", content: "private A" });
  });

  it("round trips only bounded draft fields and clears after submit", () => {
    const store = storage();
    saveOfflineSubmissionDraft("member-a", { mode: "markdown", title: "Guide", content: "# Body", token: "do-not-store" } as { mode: "markdown"; title: string; content: string }, store);
    expect(loadOfflineSubmissionDraft("member-a", store)).toEqual({ mode: "markdown", title: "Guide", content: "# Body" });
    expect(JSON.stringify([...store.values.values()])).not.toMatch(/token|secret|session|cookie/i);
    clearOfflineSubmissionDraft("member-a", store);
    expect(loadOfflineSubmissionDraft("member-a", store)).toBeNull();
  });

  it("drops malformed or oversized data", () => {
    const store = storage();
    store.setItem("personal-workbench:offline-submission-draft:v2:member-a", JSON.stringify({ mode: "markdown", title: "Guide", content: "x".repeat(131073) }));
    expect(loadOfflineSubmissionDraft("member-a", store)).toBeNull();
    expect(store.values.size).toBe(0);
  });

  it("fails closed when browser storage is unavailable", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(loadOfflineSubmissionDraft("member-a", blocked)).toBeNull();
    expect(() => saveOfflineSubmissionDraft("member-a", { mode: "text", title: "A", content: "Body" }, blocked)).not.toThrow();
    expect(() => clearOfflineSubmissionDraft("member-a", blocked)).not.toThrow();
  });

  it("deletes only the selected member's draft, including empty draft saves", () => {
    const store = storage();
    const a = { mode: "text", title: "A", content: "private A" } as const;
    saveOfflineSubmissionDraft("member-a", a, store);
    saveOfflineSubmissionDraft("member-b", { mode: "code", title: "B", content: "private B" }, store);
    saveOfflineSubmissionDraft("member-b", { mode: "text", title: "  ", content: "\n" }, store);
    clearOfflineSubmissionDraft("member-b", store);
    expect(loadOfflineSubmissionDraft("member-b", store)).toBeNull();
    expect(loadOfflineSubmissionDraft("member-a", store)).toEqual(a);
  });

  it("never reads, claims, or deletes the unowned legacy entry", () => {
    const store = storage();
    const raw = JSON.stringify({ mode: "text", title: "Old", content: "unknown owner" });
    store.setItem("memory-garden:offline-submission-draft:v1", raw);
    expect(loadOfflineSubmissionDraft("member-a", store)).toBeNull();
    clearOfflineSubmissionDraft("member-a", store);
    expect(store.getItem("memory-garden:offline-submission-draft:v1")).toBe(raw);
  });

  it.each(["{", "null", "[]", '{"mode":"html","title":"A","content":"Body"}'])("removes only the current member's corrupt entry: %s", (raw) => {
    const store = storage();
    const other = JSON.stringify({ mode: "text", title: "B", content: "private B" });
    store.setItem("personal-workbench:offline-submission-draft:v2:member-a", raw);
    store.setItem("personal-workbench:offline-submission-draft:v2:member-b", other);
    expect(loadOfflineSubmissionDraft("member-a", store)).toBeNull();
    expect(store.getItem("personal-workbench:offline-submission-draft:v2:member-a")).toBeNull();
    expect(store.getItem("personal-workbench:offline-submission-draft:v2:member-b")).toBe(other);
  });

  it.each(["", " \n", "a".repeat(513), "\ud800"])("does not touch storage for an invalid member identity", (memberId) => {
    const store = storage();
    const touched: string[] = [];
    const watched = {
      getItem: (key: string) => { touched.push(key); return store.getItem(key); },
      setItem: (key: string, value: string) => { touched.push(key); store.setItem(key, value); },
      removeItem: (key: string) => { touched.push(key); store.removeItem(key); },
    };
    expect(loadOfflineSubmissionDraft(memberId, watched)).toBeNull();
    saveOfflineSubmissionDraft(memberId, { mode: "text", title: "A", content: "Body" }, watched);
    clearOfflineSubmissionDraft(memberId, watched);
    expect(touched).toEqual([]);
    expect(store.values.size).toBe(0);
  });

  it("keeps distinct encoded identities independent", () => {
    const store = storage();
    saveOfflineSubmissionDraft("a/b", { mode: "text", title: "A", content: "slash" }, store);
    saveOfflineSubmissionDraft("a%2Fb", { mode: "text", title: "B", content: "percent" }, store);
    expect(loadOfflineSubmissionDraft("a/b", store)?.content).toBe("slash");
    expect(loadOfflineSubmissionDraft("a%2Fb", store)?.content).toBe("percent");
  });

  it("accepts exact UTF-8 limits and refuses oversized edits without replacing the last valid draft", () => {
    const store = storage();
    const draft = { mode: "code", title: "中".repeat(170) + "ab", content: "中".repeat(43690) + "ab" } as const;
    saveOfflineSubmissionDraft("member-a", draft, store);
    expect(loadOfflineSubmissionDraft("member-a", store)).toEqual(draft);
    saveOfflineSubmissionDraft("member-a", { ...draft, title: draft.title + "中" }, store);
    saveOfflineSubmissionDraft("member-a", { ...draft, content: draft.content + "中" }, store);
    expect(loadOfflineSubmissionDraft("member-a", store)).toEqual(draft);
  });

  it("returns only approved fields from stored records", () => {
    const store = storage();
    store.setItem("personal-workbench:offline-submission-draft:v2:member-a", JSON.stringify({ mode: "text", title: "A", content: "Body", session: "unexpected" }));
    expect(loadOfflineSubmissionDraft("member-a", store)).toEqual({ mode: "text", title: "A", content: "Body" });
  });
});
