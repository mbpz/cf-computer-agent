import { describe, expect, it } from "vitest";
import { reconcileDeletedEnvironments, type EnvironmentDeletionReconcileOptions } from "../../frontend/features/environments/deletion-reconciler";

const origin = "https://workbench.example";
const stamp = "2026-09-10T00:00:00.000Z";
const marker = (environmentId: string) => ({ environmentId, version: 2, deletedAt: stamp });
function page(items: unknown[], pageNumber = 1, total = items.length) {
  return { items, pagination: { page: pageNumber, pageSize: 100, total, totalPages: Math.ceil(total / 100) } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const abort = new AbortController();
  let current = true;
  const data = new Set([`${origin}/member-a/env-a`, `${origin}/member-a/env-b`, `${origin}/member-b/env-a`, "https://other.example/member-a/env-a"]);
  const options: EnvironmentDeletionReconcileOptions = {
    origin, memberId: "member-a", sessionEpoch: 1, signal: abort.signal,
    isCurrent: (scope) => current && scope.memberId === "member-a" && scope.sessionEpoch === 1 && scope.origin === origin,
    fetchPage: async () => page([marker("env-a")]),
    removeLocalCopy: async ({ origin: source, memberId, environmentId, assertCurrent }) => {
      assertCurrent();
      data.delete(`${source}/${memberId}/${environmentId}`);
    },
  };
  return { options, data, abort, switchAccount: () => { current = false; } };
}

describe("account-bound environment deletion reconciliation", () => {
  it("removes only the explicit owned copies, and a repeated traversal is harmless", async () => {
    const { options, data } = fixture();
    expect(await reconcileDeletedEnvironments(options)).toEqual({ removed: 1, pages: 1, complete: true });
    expect([...data].sort()).toEqual([`${origin}/member-a/env-b`, `${origin}/member-b/env-a`, "https://other.example/member-a/env-a"].sort());
    expect(await reconcileDeletedEnvironments(options)).toEqual({ removed: 1, pages: 1, complete: true });
  });

  it("traverses all numbered pages sequentially including appended markers", async () => {
    const { options } = fixture();
    const first = Array.from({ length: 100 }, (_, n) => marker(`env-${n}`));
    const removed: string[] = [];
    options.fetchPage = async ({ page: number, pageSize }) => {
      expect(pageSize).toBe(100);
      if (number === 1) return page(first, 1, 101);
      expect(removed).toHaveLength(100);
      return page([marker("env-100"), marker("env-101")], 2, 102);
    };
    options.removeLocalCopy = async ({ environmentId }) => { removed.push(environmentId); };
    expect(await reconcileDeletedEnvironments(options)).toEqual({ removed: 102, pages: 2, complete: true });
    expect(removed[100]).toBe("env-100");
    expect(removed[101]).toBe("env-101");
  });

  it("does not clean anything when authentication/network fetching fails", async () => {
    const { options, data } = fixture();
    options.fetchPage = async () => { throw new Error("AUTH_REQUIRED"); };
    await expect(reconcileDeletedEnvironments(options)).rejects.toThrow("AUTH_REQUIRED");
    expect(data.size).toBe(4);
  });

  it("stops on removal failure and retries from the first page without losing pending copies", async () => {
    const { options, data } = fixture();
    options.fetchPage = async () => page([marker("env-a"), marker("env-b")]);
    const remove = options.removeLocalCopy;
    let fail = true;
    options.removeLocalCopy = async (input) => {
      if (input.environmentId === "env-b" && fail) throw new Error("storage locked");
      await remove(input);
    };
    await expect(reconcileDeletedEnvironments(options)).rejects.toThrow("storage locked");
    expect(data.has(`${origin}/member-a/env-a`)).toBe(false);
    expect(data.has(`${origin}/member-a/env-b`)).toBe(true);
    fail = false;
    expect(await reconcileDeletedEnvironments(options)).toMatchObject({ complete: true, removed: 2 });
    expect(data.has(`${origin}/member-a/env-b`)).toBe(false);
  });

  it("rejects a late response after the account epoch changes", async () => {
    const { options, data, switchAccount } = fixture();
    const reply = deferred<unknown>();
    options.fetchPage = async () => reply.promise;
    const run = reconcileDeletedEnvironments(options);
    switchAccount();
    reply.resolve(page([marker("env-a")]));
    await expect(run).rejects.toMatchObject({ code: "ACCOUNT_CHANGED" });
    expect(data.size).toBe(4);
  });

  it("lets the local adapter recheck ownership immediately before an asynchronous write", async () => {
    const { options, data, switchAccount } = fixture();
    const reached = deferred<void>();
    const release = deferred<void>();
    options.removeLocalCopy = async ({ assertCurrent, environmentId }) => {
      reached.resolve();
      await release.promise;
      assertCurrent();
      data.delete(`${origin}/member-a/${environmentId}`);
    };
    const run = reconcileDeletedEnvironments(options);
    await reached.promise;
    switchAccount();
    release.resolve();
    await expect(run).rejects.toMatchObject({ code: "ACCOUNT_CHANGED" });
    expect(data.size).toBe(4);
  });

  it("cancels before another removal and passes an abort signal to adapters", async () => {
    const { options, data, abort } = fixture();
    options.fetchPage = async () => page([marker("env-a"), marker("env-b")]);
    const remove = options.removeLocalCopy;
    options.removeLocalCopy = async (input) => {
      expect(input.signal.aborted).toBe(false);
      await remove(input);
      abort.abort();
    };
    await expect(reconcileDeletedEnvironments(options)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(data.has(`${origin}/member-a/env-b`)).toBe(true);
  });

  it.each([
    null, {}, page([{ ...marker("env-a"), environmentId: "../member-b" }]),
    page([{ ...marker("env-a"), version: 0 }]), page([{ ...marker("env-a"), deletedAt: "bad" }]),
    page([marker("env-a"), marker("env-a")]), page([], 1, 2), page([], 2, 0),
    page([], 1, 10001), { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
  ])("fails closed on an invalid cleanup page %j", async (bad) => {
    const { options, data } = fixture();
    options.fetchPage = async () => bad;
    await expect(reconcileDeletedEnvironments(options)).rejects.toMatchObject({ code: "INVALID_PAGE" });
    expect(data.size).toBe(4);
  });

  it("completes an empty result without interpreting it as a request to erase all local data", async () => {
    const { options, data } = fixture();
    options.fetchPage = async () => page([]);
    expect(await reconcileDeletedEnvironments(options)).toEqual({ removed: 0, pages: 1, complete: true });
    expect(data.size).toBe(4);
  });

  it.each(["duplicate", "shrinking-total"])("rejects inconsistent later pages: %s", async (mode) => {
    const { options } = fixture();
    const removed: string[] = [];
    options.removeLocalCopy = async ({ environmentId }) => { removed.push(environmentId); };
    options.fetchPage = async ({ page: number }) => number === 1
      ? page(Array.from({ length: 100 }, (_, n) => marker(`env-${n}`)), 1, 101)
      : mode === "duplicate" ? page([marker("env-0")], 2, 101) : page([], 2, 100);
    await expect(reconcileDeletedEnvironments(options)).rejects.toMatchObject({ code: "INVALID_PAGE" });
    expect(removed).toHaveLength(100);
  });

  it("does not fetch when the session is already cancelled", async () => {
    const { options, abort, data } = fixture();
    options.fetchPage = async () => { throw new Error("must not fetch"); };
    abort.abort();
    await expect(reconcileDeletedEnvironments(options)).rejects.toMatchObject({ code: "CANCELLED" });
    expect(data.size).toBe(4);
  });
});
