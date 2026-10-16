// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSavedViewWrite, loadSavedViewWrite, saveSavedViewWrite, type SavedViewWriteIntent } from "../../frontend/lib/saved-view-intent";

describe("saved view tab write journal", () => {
  let data: Map<string, string>;
  let storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  const intent: SavedViewWriteIntent = {
    kind: "create", clientKey: "save-key-1", name: "Docs",
    filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or", kind: null, authorId: null, publishedFrom: null, publishedTo: null },
  };
  beforeEach(() => {
    data = new Map();
    storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
    vi.stubGlobal("window", { sessionStorage: storage });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("persists the create client key and reuses it on reload", () => {
    expect(loadSavedViewWrite("member-a")).toEqual({ kind: "empty" });
    expect(saveSavedViewWrite("member-a", intent)).toBe(true);
    // The reloaded record carries the same key a retry must resend.
    expect(loadSavedViewWrite("member-a")).toEqual({ kind: "ready", intent });
    expect(JSON.parse([...data.values()][0]!).intent.clientKey).toBe("save-key-1");
    // A replay of the same intent must not create a second record.
    expect(saveSavedViewWrite("member-a", intent)).toBe(false);
    expect(loadSavedViewWrite("member-a")).toMatchObject({ kind: "ready", intent: { clientKey: "save-key-1" } });
    expect(clearSavedViewWrite("member-a", intent)).toBe(true);
    expect(loadSavedViewWrite("member-a")).toEqual({ kind: "empty" });
  });

  it("refuses a create record without a stable client key", () => {
    const { clientKey: _clientKey, ...keyless } = intent;
    expect(saveSavedViewWrite("member-a", keyless as SavedViewWriteIntent)).toBe(false);
    expect(loadSavedViewWrite("member-a")).toEqual({ kind: "empty" });
  });
});
