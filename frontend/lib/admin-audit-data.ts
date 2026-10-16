import { apiFetch, type Fetcher } from "./api";
import { auditActions } from "../../src/audit/types";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface AdminAuditEvent { id: string; action?: string; actor?: string; createdAt?: string; resourceType?: string; resourceId?: string | null; }
export interface LoadAdminAuditInput extends FrontendPageRequest { action?: string; signal?: AbortSignal; }
export type AdminAuditPage = FrontendNumberedPage<AdminAuditEvent>;

const AUDIT_ACTIONS = new Set<string>(auditActions);
const ACTOR_KINDS = new Set(["member", "automation", "system"]);
const RESOURCE_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

/**
 * Read-only destinations for the audit resource types that genuinely have a
 * page. Types absent here are still inspected as text, never linked to a
 * fabricated route.
 */
export const AUDIT_RELATED_PATHS: Readonly<Record<string, string>> = {
  submission: "/admin/submissions",
  knowledge: "/knowledge",
  role: "/admin/roles",
  discussion_thread: "/messages",
};

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
  if (record.resourceType !== undefined && (typeof record.resourceType !== "string" || !RESOURCE_TYPE_PATTERN.test(record.resourceType))) throw new Error("AUDIT_RESPONSE_INVALID");
  if (record.resourceId !== undefined && record.resourceId !== null && (typeof record.resourceId !== "string" || record.resourceId.length === 0)) throw new Error("AUDIT_RESPONSE_INVALID");
  return {
    id: record.id,
    action,
    actor: typeof record.actorId === "string" ? record.actorId : actorKind,
    createdAt: record.createdAt,
    ...(record.resourceType === undefined ? {} : { resourceType: record.resourceType as string }),
    ...(record.resourceId === undefined ? {} : { resourceId: typeof record.resourceId === "string" ? record.resourceId : null }),
  };
}

export function createAdminAuditRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadAdminAuditInput, "signal">, signal) => loadAdminAudit({ ...input, requester, signal }));
}
