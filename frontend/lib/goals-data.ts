import { apiFetch, type Fetcher } from "./api";

export type GoalStatus = "active" | "paused" | "completed" | "archived";
export interface Goal { id: string; clientKey: string; title: string; description: string | null; status: GoalStatus; progress: number; targetAt: string | null; createdAt: string; updatedAt: string; }
export interface GoalPage { items: Goal[]; nextCursor?: string; }

export async function loadGoals(input: { limit?: number; cursor?: string; status?: GoalStatus } = {}, requester: Fetcher = fetch): Promise<GoalPage> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.status) params.set("status", input.status);
  const value = await apiFetch<unknown>(`/api/goals?${params.toString()}`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GOAL_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeGoal).filter((item): item is Goal => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length) throw new Error("GOAL_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export async function createGoal(input: { title: string; description?: string | null; targetAt?: number | null }, requester: Fetcher = fetch): Promise<{ goal: Goal; created: boolean }> {
  return apiFetch<{ goal: Goal; created: boolean }>("/api/goals", {
    requester, method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), ...input }),
  });
}

export async function updateGoal(id: string, input: { title: string; description?: string | null; targetAt?: number | null }, requester: Fetcher = fetch): Promise<Goal> {
  return apiFetch<Goal>(`/api/goals/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
}

export async function setGoalStatus(id: string, status: GoalStatus, requester: Fetcher = fetch): Promise<Goal> {
  return apiFetch<Goal>(`/api/goals/${encodeURIComponent(id)}/status`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function setGoalProgress(id: string, progress: number, requester: Fetcher = fetch): Promise<Goal> {
  return apiFetch<Goal>(`/api/goals/${encodeURIComponent(id)}/progress`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress }) });
}

function normalizeGoal(value: unknown): Goal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.clientKey !== "string" || typeof record.title !== "string") return null;
  if (record.status !== "active" && record.status !== "paused" && record.status !== "completed" && record.status !== "archived") return null;
  if (typeof record.progress !== "number" || !Number.isInteger(record.progress) || record.progress < 0 || record.progress > 100) return null;
  return {
    id: record.id, clientKey: record.clientKey, title: record.title,
    description: typeof record.description === "string" ? record.description : null,
    status: record.status, progress: record.progress,
    targetAt: typeof record.targetAt === "string" ? record.targetAt : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}
