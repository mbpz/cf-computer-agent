import { apiFetch, type Fetcher } from "./api";

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
