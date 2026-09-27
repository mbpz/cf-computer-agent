export interface PlanningCreateIntent { readonly id: string; readonly clientKey: string; readonly title: string; readonly description: string | null; }
export type PlanningModule = "GOALS" | "PROJECTS";
export type StoredPlanningIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: PlanningCreateIntent; acknowledged: boolean };
const storageKey = (memberId: string, module: PlanningModule) => `memory-garden:planning-create:v1:${encodeURIComponent(memberId)}:${module}`;
const same = (a: PlanningCreateIntent, b: PlanningCreateIntent) => a.id === b.id && a.clientKey === b.clientKey && a.title === b.title && a.description === b.description;
function validIntent(value: unknown): value is PlanningCreateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as PlanningCreateIntent;
  return Object.keys(v).length === 4 && Object.keys(v).every(key => ["id", "clientKey", "title", "description"].includes(key))
    && [v.id, v.clientKey].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id))
    && typeof v.title === "string" && !!v.title.trim() && v.title === v.title.trim() && [...v.title].length <= 200
    && (v.description === null || (typeof v.description === "string" && !!v.description.trim() && v.description === v.description.trim() && [...v.description].length <= 200_000));
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("PLANNING_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Never silently replace a malformed record or a different unresolved creation.
export function loadPlanningIntent(memberId: string, module: PlanningModule): StoredPlanningIntent {
  try {
    if (!memberId || !["GOALS", "PROJECTS"].includes(module)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, module));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 2_500_000) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || v.module !== module || typeof v.acknowledged !== "boolean" || !validIntent(v.intent)
      || Object.keys(v).length !== 5 || Object.keys(v).some(key => !["version", "memberId", "module", "intent", "acknowledged"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent), acknowledged: v.acknowledged };
  } catch { return { kind: "blocked" }; }
}
function persist(memberId: string, module: PlanningModule, intent: PlanningCreateIntent, acknowledge: boolean): boolean {
  try {
    if (!validIntent(intent)) return false;
    const previous = loadPlanningIntent(memberId, module);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent)) || (acknowledge && previous.kind !== "ready")) return false;
    const acknowledged = acknowledge || (previous.kind === "ready" && previous.acknowledged);
    storage().setItem(storageKey(memberId, module), JSON.stringify({ version: 1, memberId, module, intent, acknowledged }));
    const saved = loadPlanningIntent(memberId, module);
    return saved.kind === "ready" && same(saved.intent, intent) && saved.acknowledged === acknowledged;
  } catch { return false; }
}
export function savePlanningIntent(memberId: string, module: PlanningModule, intent: PlanningCreateIntent): boolean { return persist(memberId, module, intent, false); }
export function acknowledgePlanningIntent(memberId: string, module: PlanningModule, intent: PlanningCreateIntent): boolean { return persist(memberId, module, intent, true); }
export function clearPlanningIntent(memberId: string, module: PlanningModule, intent: PlanningCreateIntent): boolean {
  try {
    const previous = loadPlanningIntent(memberId, module);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId, module));
    return storage().getItem(storageKey(memberId, module)) === null;
  } catch { return false; }
}
