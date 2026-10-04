export type GraphViewLens = "workspace" | "knowledge" | "work";
export type GraphViewRange = "all" | "7d" | "30d" | "90d";
export type GraphViewChange = "all" | "added" | "updated" | "completed" | "archived";
export type GraphView = { readonly query: string; readonly lens: GraphViewLens; readonly temporalRange: GraphViewRange; readonly changeKind: GraphViewChange };
export type StoredGraphView = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; view: GraphView };
const storageKey = (memberId: string) => `memory-garden:graph-view:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 8192;
const lenses = new Set(["workspace", "knowledge", "work"]);
const ranges = new Set(["all", "7d", "30d", "90d"]);
const changes = new Set(["all", "added", "updated", "completed", "archived"]);

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("GRAPH_VIEW_STORAGE_UNAVAILABLE");
  return value;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
export function blankGraphView(view: GraphView): boolean {
  return view.query === "" && view.lens === "workspace" && view.temporalRange === "all" && view.changeKind === "all";
}
export function validGraphView(value: unknown): value is GraphView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 4 && text(record.query, 200)
    && typeof record.lens === "string" && lenses.has(record.lens)
    && typeof record.temporalRange === "string" && ranges.has(record.temporalRange)
    && typeof record.changeKind === "string" && changes.has(record.changeKind)
    && !blankGraphView(record as GraphView);
}
function plain(view: GraphView): GraphView {
  return { query: view.query, lens: view.lens, temporalRange: view.temporalRange, changeKind: view.changeKind };
}

// Tab-scoped graph filters. Separate from an unconfirmed graph action.
// Survives refresh and return. Restoring never sends a write.
export function loadGraphView(memberId: string): StoredGraphView {
  try {
    if (!memberId || !idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validGraphView(value.view)) return { kind: "blocked" };
    return { kind: "ready", view: Object.freeze(plain(value.view as GraphView)) };
  } catch { return { kind: "blocked" }; }
}

export function persistGraphView(memberId: string, view: GraphView | null): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    if (view === null || blankGraphView(view)) { storage().removeItem(storageKey(memberId)); return true; }
    if (!validGraphView(view)) return false;
    const body = JSON.stringify({ version: 1, memberId, view: plain(view) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedGraphView(memberId: string): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
