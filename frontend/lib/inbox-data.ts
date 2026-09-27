import { apiFetch, type Fetcher } from "./api";
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
  const page = normalizeNumberedPage(value, (raw) => {
    const item = normalizeInbox(raw);
    const record = raw as Record<string, unknown> | null;
    if (!item || !item.id.trim() || !item.clientKey.trim() || !item.createdAt || !item.updatedAt
      || !Number.isFinite(Date.parse(item.createdAt)) || !Number.isFinite(Date.parse(item.updatedAt))
      || ["sourceUrl", "promotedTaskId", "promotedSubmissionId"].some(key => record?.[key] !== null && typeof record?.[key] !== "string")) throw new Error("INBOX_RESPONSE_INVALID");
    return item;
  });
  if (page.pagination.page !== input.page || page.pagination.pageSize !== input.pageSize
    || new Set(page.items.map(item => item.id)).size !== page.items.length
    || (input.status && page.items.some(item => item.status !== input.status))) throw new Error("INBOX_RESPONSE_INVALID");
  return page;
}

export async function createInbox(input: { kind: InboxKind; content: string; sourceUrl?: string | null }, requester: Fetcher = fetch): Promise<{ item: InboxItem; created: boolean }> {
  return apiFetch<{ item: InboxItem; created: boolean }>("/api/inbox", {
    requester, method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), ...input }),
  });
}

export async function updateInboxStatus(id: string, status: "inbox" | "archived", requester: Fetcher = fetch): Promise<InboxItem> {
  return apiFetch<InboxItem>(`/api/inbox/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}

export async function promoteInboxTask(id: string, requester: Fetcher = fetch): Promise<{ item: InboxItem; promoted: boolean; taskId: string }> {
  return apiFetch(`/api/inbox/${encodeURIComponent(id)}/promote/task`, { requester, method: "POST" });
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
