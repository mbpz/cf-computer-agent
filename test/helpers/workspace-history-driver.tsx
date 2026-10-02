import { vi } from "vitest";

/** Browser boundary double only. It does not implement admission or route state.
 * Tests explicitly deliver arrival and finished separately; neither implies the other.
 */
export function installWorkspaceHistoryDriver(owner: Window & typeof globalThis, native = true) {
  let serial = 0;
  let position = 0;
  const make = (url: string, state: unknown, key = `key-${++serial}`) => ({ key, id: `id-${++serial}`, url, state, sameDocument: true });
  let entries = [make(owner.location.href, owner.history.state)];
  const requests: Array<{ index: number; resolve(): void; reject(error: unknown): void }> = [];
  const replace = owner.history.replaceState.bind(owner.history);
  const push = owner.history.pushState.bind(owner.history);
  const changed = new owner.EventTarget();
  const navigation = Object.assign(changed, {
    entries: () => entries.map((entry, index) => ({ ...entry, index })),
    traverseTo: vi.fn((key: string) => {
      const index = entries.findIndex(entry => entry.key === key);
      const finished = new Promise<void>((resolve, reject) => requests.push({ index, resolve, reject }));
      return { committed: finished, finished };
    }),
  });
  Object.defineProperty(navigation, "currentEntry", { get: () => ({ ...entries[position], index: position }) });
  if (native) Object.defineProperty(owner, "navigation", { configurable: true, value: navigation });
  vi.spyOn(owner.history, "pushState").mockImplementation((state, unused, url) => {
    push(state, unused, url);
    entries = entries.slice(0, position + 1); entries.push(make(owner.location.href, state)); position++;
    if (native) changed.dispatchEvent(new owner.Event("currententrychange"));
  });
  vi.spyOn(owner.history, "replaceState").mockImplementation((state, unused, url) => {
    replace(state, unused, url);
    entries[position] = make(owner.location.href, state, entries[position].key);
    if (native) changed.dispatchEvent(new owner.Event("currententrychange"));
  });
  vi.spyOn(owner.history, "go").mockImplementation(delta => {
    requests.push({ index: position + (delta ?? 0), resolve() {}, reject() {} });
  });
  function arrive(index: number) {
    position = index; const entry = entries[index]; replace(entry.state, "", entry.url);
    if (native) changed.dispatchEvent(new owner.Event("currententrychange"));
    owner.dispatchEvent(new owner.PopStateEvent("popstate", { state: entry.state }));
  }
  // happy-dom replaceState incorrectly truncates forward entries. Keep native
  // back/forward boundary behavior here, not in the production admission policy.
  vi.spyOn(owner.history, "back").mockImplementation(() => { if (position > 0) owner.queueMicrotask(() => arrive(position - 1)); });
  vi.spyOn(owner.history, "forward").mockImplementation(() => { if (position + 1 < entries.length) owner.queueMicrotask(() => arrive(position + 1)); });
  return {
    requests, navigation,
    entries: () => entries,
    arrive,
    corruptState(index: number) { entries[index] = { ...entries[index], state: {} }; },
    forget(index: number) { entries[index] = { ...entries[index], id: "replaced-id" }; },
  };
}
