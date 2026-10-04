import { apiFetch, type Fetcher } from "./api";
import { auditActions } from "../../src/audit/types";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface AdminAuditEvent { id: string; action?: string; actor?: string; createdAt?: string; }
export interface LoadAdminAuditInput extends FrontendPageRequest { action?: string; signal?: AbortSignal; }
export type AdminAuditPage = FrontendNumberedPage<AdminAuditEvent>;

const AUDIT_ACTIONS = new Set<string>(auditActions);
const ACTOR_KINDS = new Set(["member", "automation", "system"]);

export async function loadAdminAudit({ page, pageSize, action, requester = fetch, signal }: LoadAdminAuditInput & { requester?: Fetcher }): Promise<AdminAuditPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (action) params.set("action", action);
  return normalizeNumberedPage(await apiFetch(`/api/admin/audit-events?${params}`, { requester, signal }), normalizeEvent);
}

function normalizeEvent(value: unknown): AdminAuditEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AUDIT_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const action = record.action;
  const actorKind = record.actorKind;
  if (typeof record.id !== "string" || !record.id || typeof action !== "string" || !AUDIT_ACTIONS.has(action) || typeof actorKind !== "string" || !ACTOR_KINDS.has(actorKind) || typeof record.createdAt !== "string" || record.createdAt.length === 0) throw new Error("AUDIT_RESPONSE_INVALID");
  if (record.actorId !== undefined && record.actorId !== null && (typeof record.actorId !== "string" || record.actorId.length === 0)) throw new Error("AUDIT_RESPONSE_INVALID");
  return { id: record.id, action, actor: typeof record.actorId === "string" ? record.actorId : actorKind, createdAt: record.createdAt };
}

export function createAdminAuditRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadAdminAuditInput, "signal">, signal) => loadAdminAudit({ ...input, requester, signal }));
}
