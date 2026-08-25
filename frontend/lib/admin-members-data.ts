import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface AdminMember { id: string; email?: string; role?: string; status?: string; }
export interface AdminMembersPage { items: AdminMember[]; nextCursor: string | null; }

export async function loadAdminMembers({ cursor, requester = fetch, signal }: { cursor?: string | null; requester?: Fetcher; signal?: AbortSignal }): Promise<AdminMembersPage> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: unknown }>(`/api/admin/members?${params.toString()}`, { requester, signal });
  return { items: Array.isArray(data.items) ? data.items.map(normalizeMember).filter((item): item is AdminMember => item !== null) : [], nextCursor: typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null };
}

export async function updateMemberStatus(memberId: string, status: "active" | "disabled", requester: Fetcher = fetch): Promise<AdminMember> {
  const data = await apiFetch<{ member?: unknown }>(`/api/admin/members/${encodeURIComponent(memberId)}/status`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
  const member = normalizeMember(data.member);
  if (!member) throw new Error("MEMBER_RESPONSE_INVALID");
  return member;
}

function normalizeMember(value: unknown): AdminMember | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  return { id: record.id, email: typeof record.email === "string" ? record.email : undefined, role: typeof record.role === "string" ? record.role : undefined, status: typeof record.status === "string" ? record.status : undefined };
}

export function createAdminMembersRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return { request(cursor?: string | null) { active?.abort(); active = new AbortController(); const generation = owner.claim(); const promise = loadAdminMembers({ cursor, requester, signal: active.signal }).then((page) => ({ generation, page })); return { generation, promise }; }, isCurrent(generation: number) { return owner.isCurrent(generation); }, cancel() { owner.invalidate(); active?.abort(); active = null; } };
}
