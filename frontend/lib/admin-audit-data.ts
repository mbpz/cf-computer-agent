import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface AdminAuditEvent { id: string; action?: string; actor?: string; createdAt?: string; }
export interface AdminAuditPage { events: AdminAuditEvent[]; nextCursor: string | null; }

export async function loadAdminAudit({ cursor, action, requester = fetch, signal }: { cursor?: string | null; action?: string; requester?: Fetcher; signal?: AbortSignal } = {}): Promise<AdminAuditPage> {
  const params = new URLSearchParams({ limit: "20" }); if (cursor) params.set("cursor", cursor); if (action) params.set("action", action);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/admin/audit-events?${params.toString()}`, { requester, signal });
  return { events: Array.isArray(data.items) ? data.items.map(normalizeEvent).filter((item): item is AdminAuditEvent => item !== null) : [], nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null };
}
function normalizeEvent(value: unknown): AdminAuditEvent | null { if (!value || typeof value !== "object" || Array.isArray(value)) return null; const record = value as Record<string, unknown>; if (typeof record.id !== "string" || !record.id) return null; return { id: record.id, action: typeof record.action === "string" ? record.action : undefined, actor: typeof record.actorId === "string" ? record.actorId : typeof record.actorKind === "string" ? record.actorKind : undefined, createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined }; }
export function createAdminAuditRequestController(requester: Fetcher = fetch) { let active: AbortController | null = null; const owner = createAsyncOwner(); return { request(cursor?: string | null) { active?.abort(); active = new AbortController(); const generation = owner.claim(); const promise = loadAdminAudit({ cursor, requester, signal: active.signal }).then((page) => ({ generation, page })); return { generation, promise }; }, isCurrent(generation: number) { return owner.isCurrent(generation); }, cancel() { owner.invalidate(); active?.abort(); active = null; } }; }
