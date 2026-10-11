// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { favoriteIntentKey, finishFavoriteIntent, loadFavoriteIntent, prepareFavoriteIntent, type ReaderFavoriteIntent } from "../../frontend/lib/reader-favorite-intent";

type Port = Pick<Storage, "getItem" | "setItem" | "removeItem">;
function fakeStorage(backing = new Map<string, string>()): Port {
  return {
    getItem: key => (backing.has(key) ? backing.get(key)! : null),
    setItem: (key, value) => { backing.set(key, String(value)); },
    removeItem: key => { backing.delete(key); },
  };
}
const validIntent = (id = "operation-a", desired = true): ReaderFavoriteIntent => ({ id, desired });
const record = (member: string, item: string, intent: ReaderFavoriteIntent) => JSON.stringify({ v: 1, member, item, intent });

describe("reader favorite intent store", () => {
  it("namespaces the key per member and target under one version prefix", () => {
    expect(favoriteIntentKey("member-a", "knowledge-a")).toBe("memory-garden:reader-favorite-intent:v1:member-a:knowledge-a");
    expect(favoriteIntentKey("a/b", "c d")).toBe("memory-garden:reader-favorite-intent:v1:a%2Fb:c%20d");
    expect(favoriteIntentKey("member-b", "knowledge-a")).not.toBe(favoriteIntentKey("member-a", "knowledge-a"));
    expect(favoriteIntentKey("member-a", "knowledge-b")).not.toBe(favoriteIntentKey("member-a", "knowledge-a"));
  });

  it("reports empty, then ready, for a valid round-tripped record", () => {
    const storage = fakeStorage();
    expect(loadFavoriteIntent("member-a", "knowledge-a", storage)).toEqual({ kind: "empty" });
    prepareFavoriteIntent("member-a", "knowledge-a", validIntent(), storage);
    expect(loadFavoriteIntent("member-a", "knowledge-a", storage)).toEqual({ kind: "ready", intent: validIntent() });
  });

  it.each([
    ["invalid member id", "member a", "knowledge-a", {}],
    ["invalid target id", "member-a", "knowledge a", {}],
  ])("fails closed on %s", (_label, member, item, _extra) => {
    const storage = fakeStorage();
    storage.setItem(favoriteIntentKey(member, item), record(member, item, validIntent()));
    expect(loadFavoriteIntent(member, item, storage)).toEqual({ kind: "blocked" });
  });

  it.each([
    ["corrupt json", "{"],
    ["wrong embedded member", record("member-b", "knowledge-a", validIntent())],
    ["wrong embedded target", record("member-a", "knowledge-b", validIntent())],
    ["bad operation id", record("member-a", "knowledge-a", { id: "bad id", desired: true })],
    ["non-boolean desired", JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: "operation-a", desired: "yes" } })],
    ["extra unknown field", JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: "operation-a", desired: true, extra: 1 } })],
    ["oversize record", `"${"x".repeat(2050)}"`],
  ])("fails closed on a %s record", (_label, raw) => {
    const storage = fakeStorage();
    storage.setItem(favoriteIntentKey("member-a", "knowledge-a"), raw);
    expect(loadFavoriteIntent("member-a", "knowledge-a", storage)).toEqual({ kind: "blocked" });
  });

  it("refuses to overwrite an existing record and refuses a storage that cannot persist", () => {
    const storage = fakeStorage();
    prepareFavoriteIntent("member-a", "knowledge-a", validIntent("operation-a", true), storage);
    expect(() => prepareFavoriteIntent("member-a", "knowledge-a", validIntent("operation-b", false), storage)).toThrow("FAVORITE_INTENT_BLOCKED");
    const noop: Port = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(() => prepareFavoriteIntent("member-a", "knowledge-a", validIntent(), noop)).toThrow("FAVORITE_INTENT_STORAGE_FAILED");
  });

  it("treats finishing an empty store as a silent no-op and refuses a changed intent", () => {
    const storage = fakeStorage();
    expect(() => finishFavoriteIntent("member-a", "knowledge-a", validIntent(), storage)).not.toThrow();
    prepareFavoriteIntent("member-a", "knowledge-a", validIntent("operation-a", true), storage);
    expect(() => finishFavoriteIntent("member-a", "knowledge-a", validIntent("operation-b", true), storage)).toThrow("FAVORITE_INTENT_CHANGED");
    expect(loadFavoriteIntent("member-a", "knowledge-a", storage)).toEqual({ kind: "ready", intent: validIntent("operation-a", true) });
  });

  it("removes a matching record and verifies removal", () => {
    const storage = fakeStorage();
    prepareFavoriteIntent("member-a", "knowledge-a", validIntent(), storage);
    finishFavoriteIntent("member-a", "knowledge-a", validIntent(), storage);
    expect(loadFavoriteIntent("member-a", "knowledge-a", storage)).toEqual({ kind: "empty" });
    const stubborn: Port = { getItem: storage.getItem, setItem: storage.setItem, removeItem: vi.fn(() => {}) };
    prepareFavoriteIntent("member-a", "knowledge-a", validIntent(), stubborn);
    expect(() => finishFavoriteIntent("member-a", "knowledge-a", validIntent(), stubborn)).toThrow("FAVORITE_INTENT_STORAGE_FAILED");
  });

  it("shares a record across two store instances, proving cross-tab visibility", () => {
    const backing = new Map<string, string>();
    const tabA = fakeStorage(backing);
    const tabB = fakeStorage(backing);
    prepareFavoriteIntent("member-a", "knowledge-a", validIntent("operation-a", true), tabA);
    expect(loadFavoriteIntent("member-a", "knowledge-a", tabB)).toEqual({ kind: "ready", intent: validIntent("operation-a", true) });
    finishFavoriteIntent("member-a", "knowledge-a", validIntent("operation-a", true), tabB);
    expect(loadFavoriteIntent("member-a", "knowledge-a", tabA)).toEqual({ kind: "empty" });
  });

  it("still fails closed on a malformed record written through one store and read from another", () => {
    const backing = new Map<string, string>();
    fakeStorage(backing).setItem(favoriteIntentKey("member-a", "knowledge-a"), record("member-b", "knowledge-a", validIntent()));
    expect(loadFavoriteIntent("member-a", "knowledge-a", fakeStorage(backing))).toEqual({ kind: "blocked" });
  });
});
