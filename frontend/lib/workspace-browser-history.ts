import type { createWorkspaceNavigationGate } from "./workspace-navigation-gate";
import { createWorkspaceHistoryTraversal, type WorkspaceHistoryEntry, type WorkspaceHistoryFault } from "./workspace-history-traversal";

export const WORKSPACE_HISTORY_FAULT_EVENT = "workbench:history-fault";
const STATE_KEY = "__workbenchHistoryV1";
const MOVE_TIMEOUT_MS = 10_000;
interface NativeEntry extends WorkspaceHistoryEntry { sameDocument: boolean }
interface NativeNavigation extends EventTarget {
  currentEntry: NativeEntry | null;
  entries(): NativeEntry[];
  traverseTo(key: string): { committed: Promise<unknown>; finished: Promise<unknown> };
}
interface IndexedEntry extends WorkspaceHistoryEntry { epoch: string; index: number }
const same = (a: WorkspaceHistoryEntry | null, b: WorkspaceHistoryEntry) =>
  !!a && a.key === b.key && a.id === b.id && a.url === b.url;

/** Browser mechanics only; consent and accepted-position policy live in the core. */
export function createWorkspaceBrowserHistory(owner: Window & typeof globalThis,
  gate: ReturnType<typeof createWorkspaceNavigationGate>, hasGuards: () => boolean, publish: () => void, revoked: WorkspaceHistoryEntry[] = []) {
  const candidate = (owner as unknown as { navigation?: NativeNavigation }).navigation;
  const native = candidate && typeof candidate.entries === "function" && typeof candidate.traverseTo === "function"
    && candidate.currentEntry?.sameDocument && typeof candidate.addEventListener === "function" ? candidate : null;
  let epoch = owner.crypto.randomUUID();
  const known = new Map<string, IndexedEntry>();
  let writing = false;
  let disposed = false;
  let recovering = false;
  let fault: WorkspaceHistoryFault | null = null;
  // Keep uncertain commands even after timeout: the browser may still deliver them.
  const outstanding = new Map<string, WorkspaceHistoryEntry>();
  const waits = new Set<{ entry: WorkspaceHistoryEntry; resolve(): void; reject(error: Error): void }>();

  function notifyFault(reason: WorkspaceHistoryFault | null) {
    fault = reason;
    owner.dispatchEvent(new owner.Event(WORKSPACE_HISTORY_FAULT_EVENT));
  }
  function read(): WorkspaceHistoryEntry | null {
    if (native) {
      const entry = native.currentEntry;
      return entry?.sameDocument && entry.url === owner.location.href ? { key: entry.key, id: entry.id, url: entry.url } : null;
    }
    const marker = owner.history.state?.[STATE_KEY] as IndexedEntry | undefined;
    const saved = marker && known.get(marker.key);
    return marker && saved && marker.epoch === epoch && marker.index === saved.index && same(marker, saved)
      && marker.url === owner.location.href ? { key: marker.key, id: marker.id, url: marker.url } : null;
  }
  function stateFor(entry: IndexedEntry, previous: unknown) {
    const state = previous !== null && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
    return { ...state, [STATE_KEY]: entry };
  }
  function seed() {
    if (native) return;
    epoch = owner.crypto.randomUUID(); known.clear();
    const entry = { key: owner.crypto.randomUUID(), id: owner.crypto.randomUUID(), url: owner.location.href, epoch, index: 0 };
    owner.history.replaceState(stateFor(entry, owner.history.state), "", entry.url);
    known.set(entry.key, entry);
  }
  seed();

  function traverse(entry: WorkspaceHistoryEntry): Promise<void> {
    if (disposed) return Promise.reject(new Error("History disposed"));
    return new Promise<void>((resolve, reject) => {
      const timer = owner.setTimeout(() => wait.reject(new Error("History arrival timed out")), MOVE_TIMEOUT_MS);
      const cleanup = () => { owner.clearTimeout(timer); waits.delete(wait); };
      const wait = { entry, resolve() { cleanup(); resolve(); }, reject(error: Error) { cleanup(); reject(error); } };
      waits.add(wait);
      try {
        if (native) {
          if (!native.entries().some(value => value.sameDocument && same(value, entry))) throw new Error("History entry changed");
          outstanding.set(entry.id, entry);
          const result = native.traverseTo(entry.key);
          // Both promises can reject; observe each without leaking an unhandled rejection.
          void result.committed.catch(() => undefined);
          void result.finished.then(() => {
            if (disposed || !waits.has(wait)) return;
            // A same-entry traversal need not emit popstate. Promise completion is
            // insufficient on its own; verify the actual current key/id/URL again.
            if (same(read(), entry)) { observe(); wait.resolve(); }
            else wait.reject(new Error("History finished at a different entry"));
          }, error => wait.reject(error instanceof Error ? error : new Error("History traversal rejected")));
        } else {
          const current = read(); const from = current && known.get(current.key); const target = known.get(entry.key);
          if (!from || !target || !same(target, entry) || target.epoch !== from.epoch) throw new Error("Unknown history position");
          const delta = target.index - from.index;
          if (delta === 0) { owner.queueMicrotask(() => { if (!disposed) { observe(); wait.resolve(); } }); }
          else { outstanding.set(entry.id, entry); owner.history.go(delta); }
        }
      } catch (error) { wait.reject(error instanceof Error ? error : new Error("History traversal failed")); }
    });
  }
  const port = { read, traverse, publish: () => { notifyFault(null); publish(); }, fault: notifyFault };
  let controller = createWorkspaceHistoryTraversal(gate, port);

  function observe() {
    if (disposed || writing) return;
    const raw = native?.currentEntry ?? owner.history.state?.[STATE_KEY];
    if (raw && raw.url === owner.location.href && revoked.some(entry => same(raw, entry))) {
      // Logout revoked a command that cannot be unqueued in the browser. Never
      // publish its late arrival into a new session or ask a new editor to leave.
      const retainedUrl = controller.accepted().url;
      writing = true;
      try {
        controller.dispose();
        owner.history.replaceState({}, "", retainedUrl);
        seed();
        controller = createWorkspaceHistoryTraversal(gate, port);
        notifyFault(null);
      } finally { writing = false; }
      return;
    }
    const current = read();
    if (current) outstanding.delete(current.id);
    // No form owns leave protection: retain normal browser navigation, including
    // entries from before this document's tracked fallback epoch.
    if (!controller.busy() && !recovering && !hasGuards()) {
      if (!current) seed();
      const next = read();
      if (next && !same(next, controller.accepted())) { controller.recordCommit(); notifyFault(null); publish(); }
    } else controller.observe();
    for (const wait of [...waits]) if (same(read(), wait.entry)) wait.resolve();
  }
  owner.addEventListener("popstate", observe);
  owner.addEventListener("hashchange", observe);
  native?.addEventListener("currententrychange", observe);

  return {
    url: () => new URL(controller.accepted().url),
    busy: () => disposed || recovering || controller.busy(),
    fault: () => fault,
    write(mode: "push" | "replace", url: string) {
      if (disposed || recovering || controller.busy()) throw new Error("History is busy");
      writing = true;
      try {
        if (native) owner.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
        else {
          const current = read(); const prior = current && known.get(current.key);
          if (!prior) throw new Error("History anchor changed");
          const entry: IndexedEntry = { epoch, index: prior.index + (mode === "push" ? 1 : 0),
            key: mode === "push" ? owner.crypto.randomUUID() : prior.key, id: owner.crypto.randomUUID(), url };
          owner.history[mode === "push" ? "pushState" : "replaceState"](stateFor(entry, mode === "replace" ? owner.history.state : {}), "", url);
          if (mode === "push") for (const [key, value] of known) if (value.index >= entry.index) known.delete(key);
          known.set(entry.key, entry);
        }
        controller.recordCommit();
      } finally { writing = false; }
    },
    async retry() {
      if (disposed || recovering || !fault) return false;
      const anchor = controller.accepted(); recovering = true;
      try {
        await traverse(anchor);
        if (disposed || !same(read(), anchor)) return false;
        controller.dispose(); controller = createWorkspaceHistoryTraversal(gate, port);
        notifyFault(null); return true;
      } catch { if (!disposed) notifyFault("restore-failed"); return false; }
      finally { recovering = false; }
    },
    revokedCommands: () => [...revoked, ...outstanding.values()],
    dispose() {
      if (disposed) return;
      disposed = true;
      owner.removeEventListener("popstate", observe); owner.removeEventListener("hashchange", observe);
      native?.removeEventListener("currententrychange", observe);
      for (const wait of [...waits]) wait.reject(new Error("History disposed"));
      controller.dispose();
    },
  };
}
