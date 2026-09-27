import type { TimelineCreateIntent } from "./projects-data";
import { canonicalPlanningVersion } from "./planning-write-recovery";
export type StoredTimelineIntent = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: TimelineCreateIntent; acknowledged: boolean };
const storageKey = (memberId: string, projectId: string) => `memory-garden:timeline-create:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(projectId)}`;
const fields = ["id", "clientKey", "kind", "title", "body", "startsAt", "dueAt"] as const;
const same = (a: TimelineCreateIntent, b: TimelineCreateIntent) => fields.every(key => a[key] === b[key]);
function validIntent(value: unknown): value is TimelineCreateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as TimelineCreateIntent;
  return Object.keys(v).length === 7 && Object.keys(v).every(key => fields.includes(key as typeof fields[number]))
    && [v.id, v.clientKey].every(id => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id))
    && ["meeting", "decision", "action_item", "milestone"].includes(v.kind)
    && typeof v.title === "string" && !!v.title.trim() && v.title === v.title.trim() && [...v.title].length <= 200
    && typeof v.body === "string" && v.body === v.body.trim() && [...v.body].length <= 200_000
    && [v.startsAt, v.dueAt].every(t => t === null || canonicalPlanningVersion(t))
    && (v.startsAt === null || v.dueAt === null || Date.parse(v.dueAt) >= Date.parse(v.startsAt));
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("PLANNING_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Never silently replace a malformed record or a different unresolved creation.
export function loadTimelineIntent(memberId: string, projectId: string): StoredTimelineIntent {
  try {
    if (!memberId || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(projectId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, projectId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 2_500_000) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || v.projectId !== projectId || typeof v.acknowledged !== "boolean" || !validIntent(v.intent)
      || Object.keys(v).length !== 5 || Object.keys(v).some(key => !["version", "memberId", "projectId", "intent", "acknowledged"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent), acknowledged: v.acknowledged };
  } catch { return { kind: "blocked" }; }
}
function persist(memberId: string, projectId: string, intent: TimelineCreateIntent, acknowledge: boolean): boolean {
  try {
    if (!validIntent(intent)) return false;
    const previous = loadTimelineIntent(memberId, projectId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent)) || (acknowledge && previous.kind !== "ready")) return false;
    const acknowledged = acknowledge || (previous.kind === "ready" && previous.acknowledged);
    storage().setItem(storageKey(memberId, projectId), JSON.stringify({ version: 1, memberId, projectId, intent, acknowledged }));
    const saved = loadTimelineIntent(memberId, projectId);
    return saved.kind === "ready" && same(saved.intent, intent) && saved.acknowledged === acknowledged;
  } catch { return false; }
}
export function saveTimelineIntent(memberId: string, projectId: string, intent: TimelineCreateIntent): boolean { return persist(memberId, projectId, intent, false); }
export function acknowledgeTimelineIntent(memberId: string, projectId: string, intent: TimelineCreateIntent): boolean { return persist(memberId, projectId, intent, true); }
export function clearTimelineIntent(memberId: string, projectId: string, intent: TimelineCreateIntent): boolean {
  try {
    const previous = loadTimelineIntent(memberId, projectId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId, projectId));
    return storage().getItem(storageKey(memberId, projectId)) === null;
  } catch { return false; }
}
