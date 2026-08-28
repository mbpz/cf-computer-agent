import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface AdminAuditEvent { id: string; action?: string; actor?: string; createdAt?: string; }
export interface LoadAdminAuditInput extends FrontendPageRequest { action?: string; signal?: AbortSignal; }
export type AdminAuditPage = FrontendNumberedPage<AdminAuditEvent>;

export async function loadAdminAudit({ page, pageSize, action, requester = fetch, signal }: LoadAdminAuditInput & { requester?: Fetcher }): Promise<AdminAuditPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (action) params.set("action", action);
  return normalizeNumberedPage(await apiFetch(`/api/admin/audit-events?${params}`, { requester, signal }), normalizeEvent);
}

function normalizeEvent(value: unknown): AdminAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AUDIT_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) throw new Error("AUDIT_RESPONSE_INVALID");
  return { id: record.id, action: typeof record.action === "string" ? record.action : undefined, actor: typeof record.actorId === "string" ? record.actorId : typeof record.actorKind === "string" ? record.actorKind : undefined, createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined };
}

export function createAdminAuditRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadAdminAuditInput, "signal">, signal) => loadAdminAudit({ ...input, requester, signal }));
}
