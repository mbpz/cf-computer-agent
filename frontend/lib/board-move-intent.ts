export type BoardMoveStatus = "todo" | "doing" | "blocked" | "done" | "canceled";
export interface BoardMoveIntent { readonly taskId: string; readonly title: string; readonly source: Exclude<BoardMoveStatus, "canceled">; readonly target: BoardMoveStatus; }
export type StoredBoardMove = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intent: BoardMoveIntent };
const storageKey = (memberId: string) => `memory-garden:board-move:v1:${encodeURIComponent(memberId)}`;
const fields = ["taskId", "title", "source", "target"] as const;
const statuses: readonly string[] = ["todo", "doing", "blocked", "done", "canceled"];
const same = (a: BoardMoveIntent, b: BoardMoveIntent) => fields.every((key) => a[key] === b[key]);
export function validBoardMove(value: unknown): value is BoardMoveIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as BoardMoveIntent;
  return Object.keys(v).length === fields.length && Object.keys(v).every((key) => fields.includes(key as never))
    && typeof v.taskId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v.taskId)
    && typeof v.title === "string" && v.title.length <= 500
    && statuses.includes(v.source) && (v.source as string) !== "canceled" && statuses.includes(v.target) && v.source !== v.target;
}
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("BOARD_STORAGE_UNAVAILABLE");
  return value;
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the request is sent, so a refresh during an unknown move still knows what to reconcile.
export function loadBoardMove(memberId: string): StoredBoardMove {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 4096) return { kind: "blocked" };
    const v = JSON.parse(raw);
    if (!v || v.version !== 1 || v.memberId !== memberId || !validBoardMove(v.intent)
      || Object.keys(v).length !== 3 || Object.keys(v).some((key) => !["version", "memberId", "intent"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intent: Object.freeze(v.intent) };
  } catch { return { kind: "blocked" }; }
}
export function saveBoardMove(memberId: string, intent: BoardMoveIntent): boolean {
  try {
    if (!validBoardMove(intent) || loadBoardMove(memberId).kind !== "empty") return false;
    storage().setItem(storageKey(memberId), JSON.stringify({ version: 1, memberId, intent }));
    const saved = loadBoardMove(memberId);
    return saved.kind === "ready" && same(saved.intent, intent);
  } catch { return false; }
}
export function clearBoardMove(memberId: string, intent: BoardMoveIntent): boolean {
  try {
    const previous = loadBoardMove(memberId);
    if (previous.kind === "blocked" || (previous.kind === "ready" && !same(previous.intent, intent))) return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
// Only for an unreadable record the member explicitly chose to discard; it cannot be reconciled.
export function discardBlockedBoardMove(memberId: string): boolean {
  try {
    if (!memberId || loadBoardMove(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return storage().getItem(storageKey(memberId)) === null;
  } catch { return false; }
}
