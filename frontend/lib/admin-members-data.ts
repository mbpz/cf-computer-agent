import { apiFetch, type Fetcher } from "./api";
import { createNumberedRequestController, normalizeNumberedPage, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

export interface AdminMember { id: string; email?: string; role?: string; status?: string; }
export interface LoadAdminMembersInput extends FrontendPageRequest { status?: "active" | "disabled"; signal?: AbortSignal; }
export type AdminMembersPage = FrontendNumberedPage<AdminMember>;

export async function loadAdminMembers({ page, pageSize, status, requester = fetch, signal }: LoadAdminMembersInput & { requester?: Fetcher }): Promise<AdminMembersPage> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set("status", status);
  return normalizeNumberedPage(await apiFetch(`/api/admin/members?${params}`, { requester, signal }), normalizeMember);
}

export async function updateMemberStatus(memberId: string, status: "active" | "disabled", requester: Fetcher = fetch): Promise<AdminMember> {
  const data = await apiFetch<{ member?: unknown }>(`/api/admin/members/${encodeURIComponent(memberId)}/status`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
  return normalizeMember(data.member);
}

function normalizeMember(value: unknown): AdminMember {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MEMBER_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) throw new Error("MEMBER_RESPONSE_INVALID");
  return { id: record.id, email: typeof record.email === "string" ? record.email : undefined, role: typeof record.role === "string" ? record.role : undefined, status: typeof record.status === "string" ? record.status : undefined };
}

export function createAdminMembersRequestController(requester: Fetcher = fetch) {
  return createNumberedRequestController((input: Omit<LoadAdminMembersInput, "signal">, signal) => loadAdminMembers({ ...input, requester, signal }));
}
