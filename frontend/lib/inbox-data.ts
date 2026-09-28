import { canonicalPlanningVersion } from "./planning-write-recovery";
import { apiFetch, type Fetcher } from "./api";
import { validInboxIntent, type InboxCreateIntent } from "./inbox-create-intent";
import { normalizeNumberedPage, parsePageSearch, writePageSearch, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export type InboxKind = "text" | "link" | "file_ref";
export type InboxStatus = "inbox" | "archived" | "promoted";
export interface InboxItem { id: string; clientKey: string; kind: InboxKind; content: string; sourceUrl: string | null; status: InboxStatus; promotedTaskId: string | null; promotedSubmissionId: string | null; createdAt: string; updatedAt: string; }
export interface InboxPage { items: InboxItem[]; nextCursor?: string; }

export async function loadInbox(input: { limit?: number; cursor?: string; status?: InboxStatus } = {}, requester: Fetcher = fetch): Promise<InboxPage> {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.status) params.set("status", input.status);
  const value = await apiFetch<unknown>(`/api/inbox?${params.toString()}`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INBOX_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeInbox).filter((item): item is InboxItem => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length) throw new Error("INBOX_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export interface InboxPageRequest extends FrontendPageRequest { status?: InboxStatus; }

export function parseInboxSearch(search: string): InboxPageRequest {
  const statuses = new URLSearchParams(search).getAll("status");
  const status = statuses.length === 1 && ["inbox", "archived", "promoted"].includes(statuses[0]!) ? statuses[0] as InboxStatus : undefined;
  return { ...parsePageSearch(search), ...(status ? { status } : {}) };
}

export function writeInboxSearch(search: string, next: InboxPageRequest): string {
  const params = new URLSearchParams(writePageSearch(search, next));
  params.delete("status"); params.delete("cursor"); params.delete("limit");
  if (next.status) params.set("status", next.status);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function loadInboxNumbered(input: InboxPageRequest, requester: Fetcher = fetch, signal?: AbortSignal): Promise<FrontendNumberedPage<InboxItem>> {
  // Validate before issuing a request, including the shared bounded query window.
  writePageSearch("", input);
  if (input.status !== undefined && !["inbox", "archived", "promoted"].includes(input.status)) throw new Error("INBOX_PAGE_INVALID");
  const params = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.status) params.set("status", input.status);
  const value = await apiFetch<unknown>(`/api/inbox?${params}`, { requester, signal });
  const page = normalizeNumberedPage(value, strictInbox);
  if (page.pagination.page !== input.page || page.pagination.pageSize !== input.pageSize
    || new Set(page.items.map(item => item.id)).size !== page.items.length
    || (input.status && page.items.some(item => item.status !== input.status))) throw new Error("INBOX_RESPONSE_INVALID");
  return page;
}

export async function createInbox(input: InboxCreateIntent, requester: Fetcher = fetch): Promise<{ item: InboxItem; created: boolean }> {
  if (!validInboxIntent(input)) throw new Error("INBOX_CREATE_INVALID");
  const value = await apiFetch<unknown>("/api/inbox", {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
  });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INBOX_CREATE_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.created !== "boolean") throw new Error("INBOX_CREATE_RESPONSE_INVALID");
  const item = matchCreatedInbox(record.item, input);
  if (record.created && item.status !== "inbox") throw new Error("INBOX_CREATE_RESPONSE_INVALID");
  return { item, created: record.created };
}

export async function readCreatedInbox(input: InboxCreateIntent, requester: Fetcher = fetch, signal?: AbortSignal): Promise<InboxItem> {
  if (!validInboxIntent(input)) throw new Error("INBOX_CREATE_INVALID");
  return matchCreatedInbox(await apiFetch<unknown>(`/api/inbox/${encodeURIComponent(input.id)}`, { requester, signal }), input);
}
function matchCreatedInbox(raw: unknown, input: InboxCreateIntent): InboxItem {
  const item = strictInbox(raw);
  if (item.id !== input.id || item.clientKey !== input.clientKey || item.kind !== input.kind || item.content !== input.content || item.sourceUrl !== input.sourceUrl) throw new Error("INBOX_CREATE_RESPONSE_INVALID");
  return item;
}
function strictInbox(raw: unknown): InboxItem {
  const item = normalizeInbox(raw);
  const record = raw as Record<string, unknown> | null;
  if (!item || !item.id.trim() || !item.clientKey.trim() || !item.createdAt || !item.updatedAt
    || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))
    || ["sourceUrl", "promotedTaskId", "promotedSubmissionId"].some(key => record?.[key] !== null && typeof record?.[key] !== "string")) throw new Error("INBOX_RESPONSE_INVALID");
  return item;
}

function requireInboxId(id: string): void {
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id)) throw new Error("INBOX_INVALID");
}
export async function loadInboxItem(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<InboxItem> {
  requireInboxId(id);
  const item = strictInbox(await apiFetch<unknown>(`/api/inbox/${encodeURIComponent(id)}`, { requester, signal }));
  if (item.id !== id || !canonicalPlanningVersion(item.updatedAt)) throw new Error("INBOX_RESPONSE_INVALID");
  return item;
}
export async function updateInboxStatus(id: string, status: "inbox" | "archived", expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<InboxItem> {
  requireInboxId(id);
  if (!canonicalPlanningVersion(expectedUpdatedAt) || !["inbox", "archived"].includes(status)) throw new Error("INBOX_INVALID");
  const item = strictInbox(await apiFetch<unknown>(`/api/inbox/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, expectedUpdatedAt }) }));
  if (item.id !== id || item.status !== status || !canonicalPlanningVersion(item.updatedAt) || Date.parse(item.updatedAt) <= Date.parse(expectedUpdatedAt)) throw new Error("INBOX_RESPONSE_INVALID");
  return item;
}

export async function promoteInboxTask(id: string, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<{ item: InboxItem; promoted: boolean; taskId: string }> {
  requireInboxId(id);
  if (!canonicalPlanningVersion(expectedUpdatedAt)) throw new Error("INBOX_INVALID");
  const raw = await apiFetch<unknown>(`/api/inbox/${encodeURIComponent(id)}/promote/task`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) });
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("INBOX_RESPONSE_INVALID");
  const record = raw as Record<string, unknown>;
  const item = strictInbox(record.item);
  if (typeof record.promoted !== "boolean" || typeof record.taskId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.taskId)
    || item.id !== id || item.status !== "promoted" || item.promotedTaskId !== record.taskId || item.promotedSubmissionId !== null
    || !canonicalPlanningVersion(item.updatedAt) || Date.parse(item.updatedAt) < Date.parse(expectedUpdatedAt)
    || (record.promoted && item.updatedAt === expectedUpdatedAt)) throw new Error("INBOX_RESPONSE_INVALID");
  return { item, promoted: record.promoted, taskId: record.taskId };
}

function normalizeInbox(value: unknown): InboxItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.clientKey !== "string" || typeof record.content !== "string") return null;
  if (record.kind !== "text" && record.kind !== "link" && record.kind !== "file_ref") return null;
  if (record.status !== "inbox" && record.status !== "archived" && record.status !== "promoted") return null;
  return {
    id: record.id, clientKey: record.clientKey, kind: record.kind, content: record.content,
    sourceUrl: typeof record.sourceUrl === "string" ? record.sourceUrl : null, status: record.status,
    promotedTaskId: typeof record.promotedTaskId === "string" ? record.promotedTaskId : null,
    promotedSubmissionId: typeof record.promotedSubmissionId === "string" ? record.promotedSubmissionId : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "", updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}
