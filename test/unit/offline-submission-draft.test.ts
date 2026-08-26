import { describe, expect, it } from "vitest";
import { clearOfflineSubmissionDraft, loadOfflineSubmissionDraft, saveOfflineSubmissionDraft } from "../../frontend/lib/offline-submission-draft";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe("offline submission draft", () => {
  it("round trips only bounded draft fields and clears after submit", () => {
    const store = storage();
    saveOfflineSubmissionDraft({ mode: "markdown", title: "Guide", content: "# Body" }, store);
    expect(loadOfflineSubmissionDraft(store)).toEqual({ mode: "markdown", title: "Guide", content: "# Body" });
    expect(JSON.stringify([...store.values.values()])).not.toMatch(/token|secret|session|cookie/i);
    clearOfflineSubmissionDraft(store);
    expect(loadOfflineSubmissionDraft(store)).toBeNull();
  });

  it("drops malformed or oversized data", () => {
    const store = storage();
    store.setItem("memory-garden:offline-submission-draft:v1", JSON.stringify({ mode: "markdown", title: "Guide", content: "x".repeat(131073) }));
    expect(loadOfflineSubmissionDraft(store)).toBeNull();
    expect(store.values.size).toBe(0);
  });

  it("fails closed when browser storage is unavailable", () => {
    expect(loadOfflineSubmissionDraft({ getItem: () => { throw new Error("blocked"); }, setItem: () => undefined, removeItem: () => undefined })).toBeNull();
  });
});
