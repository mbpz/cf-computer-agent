import type { PlanningModule } from "./planning-create-intent";
export interface PlanningWriteRecord { readonly token: string; readonly id: string; readonly expectedUpdatedAt: string; }
export type PlanningWriteState = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; record: PlanningWriteRecord };
const key = (memberId: string, module: PlanningModule) => `memory-garden:planning-write:v1:${encodeURIComponent(memberId)}:${module}`;
const same = (a: PlanningWriteRecord, b: PlanningWriteRecord) => a.token === b.token && a.id === b.id && a.expectedUpdatedAt === b.expectedUpdatedAt;
export function canonicalPlanningVersion(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const epoch = Date.parse(value);
  return Number.isSafeInteger(epoch) && new Date(epoch).toISOString() === value;
}
function valid(value: unknown): value is PlanningWriteRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as PlanningWriteRecord;
  return Object.keys(v).length === 3 && Object.keys(v).every(k => ["token", "id", "expectedUpdatedAt"].includes(k))
    && [v.token, v.id].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id)) && canonicalPlanningVersion(v.expectedUpdatedAt);
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("PLANNING_STORAGE_UNAVAILABLE");
  return value;
}
// A read-only barrier, not a replay queue. No private title, desired value or executable request is stored.
export function loadPlanningWrite(memberId: string, module: PlanningModule): PlanningWriteState {
  try {
    if (!memberId || !["GOALS", "PROJECTS"].includes(module)) return { kind: "blocked" };
    const raw = storage().getItem(key(memberId, module));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 4096) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || v.module !== module || !valid(v.record)
      || Object.keys(v).length !== 4 || Object.keys(v).some(k => !["version", "memberId", "module", "record"].includes(k))) return { kind: "blocked" };
    return { kind: "ready", record: Object.freeze(v.record) };
  } catch { return { kind: "blocked" }; }
}
export function beginPlanningWrite(memberId: string, module: PlanningModule, record: PlanningWriteRecord): boolean {
  try {
    if (!valid(record) || loadPlanningWrite(memberId, module).kind !== "empty") return false;
    storage().setItem(key(memberId, module), JSON.stringify({ version: 1, memberId, module, record }));
    const saved = loadPlanningWrite(memberId, module);
    return saved.kind === "ready" && same(saved.record, record);
  } catch { return false; }
}
export function clearPlanningWrite(memberId: string, module: PlanningModule, record: PlanningWriteRecord): boolean {
  try {
    const previous = loadPlanningWrite(memberId, module);
    if (previous.kind !== "ready" || !same(previous.record, record)) return false;
    storage().removeItem(key(memberId, module));
    return storage().getItem(key(memberId, module)) === null;
  } catch { return false; }
}
