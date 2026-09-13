// @vitest-environment node
import { describe, expect, it } from "vitest";
import { clearSubmissionIntent, createSubmissionIntent, loadSubmissionIntent, saveSubmissionIntent } from "../../frontend/lib/submission-intent";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
const draft = { mode: "markdown", title: "Guide", content: "# Body" } as const;
const aKey = "personal-workbench:submission-intent:v1:a";

describe("member submission intent", () => {
  it("restores only the owner snapshot and clears only the matching request", () => {
    const store = storage(); const a = createSubmissionIntent(draft); const b = createSubmissionIntent({ ...draft, title: "B" });
    expect(saveSubmissionIntent("a", a, store)).toBe(true);
    expect(loadSubmissionIntent("b", store)).toEqual({ kind: "empty" });
    expect(saveSubmissionIntent("b", b, store)).toBe(true);
    expect(clearSubmissionIntent("a", b.key, store)).toBe(false);
    expect(loadSubmissionIntent("a", store)).toEqual({ kind: "ready", intent: a });
    expect(clearSubmissionIntent("a", a.key, store)).toBe(true);
    expect(loadSubmissionIntent("a", store)).toEqual({ kind: "empty" });
    expect(loadSubmissionIntent("b", store)).toEqual({ kind: "ready", intent: b });
  });
  it("will not overwrite a different pending request even if its key is reused", () => {
    const store = storage(); const intent = createSubmissionIntent(draft);
    expect(saveSubmissionIntent("a", intent, store)).toBe(true);
    expect(saveSubmissionIntent("a", { ...intent, draft: { ...draft, content: "changed" } }, store)).toBe(false);
    expect(saveSubmissionIntent("a", createSubmissionIntent(draft), store)).toBe(false);
    expect(saveSubmissionIntent("a", intent, store)).toBe(true);
    expect(loadSubmissionIntent("a", store)).toEqual({ kind: "ready", intent });
  });
  it.each(["{broken", "null", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, key: "valid-key-1234567", draft: { ...draft, mode: "html" } })])("preserves an invalid record instead of treating it as a new submission: %s", (raw) => {
    const store = storage(); store.setItem(aKey, raw);
    expect(loadSubmissionIntent("a", store)).toEqual({ kind: "invalid" });
    expect(saveSubmissionIntent("a", createSubmissionIntent(draft), store)).toBe(false);
    expect(clearSubmissionIntent("a", "valid-key-1234567", store)).toBe(false);
    expect(store.getItem(aKey)).toBe(raw);
  });
  it("copies and persists only the reviewed fields", () => {
    const store = storage(); const editable = { ...draft, content: String(draft.content), title: " Guide ", token: "not-a-real-credential" };
    const intent = createSubmissionIntent(editable); editable.content = "edited";
    expect(intent.draft).toEqual({ ...draft, title: "Guide" });
    expect(saveSubmissionIntent("a", { ...intent, extra: "discard" } as typeof intent, store)).toBe(true);
    expect(JSON.parse(store.getItem(aKey)!)).toEqual({ version: 1, key: intent.key, draft: { ...draft, title: "Guide" } });
  });
  it.each(["", " ", "a".repeat(513), "\ud800"])("rejects invalid member identity before storage (case %#)", (member) => {
    const store = storage();
    expect(saveSubmissionIntent(member, createSubmissionIntent(draft), store)).toBe(false);
    expect(loadSubmissionIntent(member, store)).toEqual({ kind: "invalid" });
    expect(store.values.size).toBe(0);
  });
  it("validates title and body byte limits before creating an intent", () => {
    expect(() => createSubmissionIntent({ ...draft, title: "中".repeat(171) })).toThrow();
    expect(() => createSubmissionIntent({ ...draft, content: "x".repeat(131073) })).toThrow();
    expect(() => createSubmissionIntent({ ...draft, title: " " })).toThrow();
    expect(createSubmissionIntent({ ...draft, title: "x".repeat(512), content: "x".repeat(131072) }).key).toMatch(/^[A-Za-z0-9_-]{16,128}$/u);
  });
  it("reports storage failures without crashing or claiming persistence", () => {
    const store = storage(); const intent = createSubmissionIntent(draft);
    const fail = () => { throw new Error("blocked"); };
    expect(loadSubmissionIntent("a", { ...store, getItem: fail })).toEqual({ kind: "unavailable" });
    expect(saveSubmissionIntent("a", intent, { ...store, setItem: fail })).toBe(false);
    saveSubmissionIntent("a", intent, store);
    expect(clearSubmissionIntent("a", intent.key, { ...store, removeItem: fail })).toBe(false);
    expect(loadSubmissionIntent("a", store)).toEqual({ kind: "ready", intent });
  });
});
