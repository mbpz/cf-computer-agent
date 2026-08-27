import { apiFetch, type Fetcher } from "./api";

export interface AdminRole {
  id: string;
  key: string;
  name: string;
  description: string;
  allowBits: string;
  memberCount: number;
  assignedMemberIds: string[];
  status: "active" | "disabled";
  isSystem: boolean;
}

export function normalizeAdminRole(value: unknown): AdminRole | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || typeof record.key !== "string" || !record.key || typeof record.name !== "string" || !record.name) return null;
  if (typeof record.allowBits !== "string" || !/^0x[0-9a-f]+$/iu.test(record.allowBits)) return null;
  try {
    const mask = BigInt(record.allowBits);
    if (mask < 0n || mask > ((1n << 64n) - 1n)) return null;
  } catch { return null; }
  if (typeof record.memberCount !== "number" || !Number.isSafeInteger(record.memberCount) || record.memberCount < 0) return null;
  if (record.status !== "active" && record.status !== "disabled") return null;
  if (typeof record.isSystem !== "boolean") return null;
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    description: typeof record.description === "string" ? record.description : "",
    allowBits: record.allowBits.toLowerCase(),
    memberCount: record.memberCount,
    assignedMemberIds: Array.isArray(record.assignedMemberIds)
      ? record.assignedMemberIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    status: record.status,
    isSystem: record.isSystem,
  };
}

export async function loadAdminRoles(requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminRole[]> {
  const data = await apiFetch<{ items?: unknown[] }>("/api/admin/roles", { requester, signal });
  return Array.isArray(data.items) ? data.items.map(normalizeAdminRole).filter((role): role is AdminRole => role !== null) : [];
}

export async function updateAdminRole(roleId: string, input: { name?: string; description?: string; allowBits: string }, requester: Fetcher = fetch): Promise<AdminRole> {
  const data = await apiFetch<{ role?: unknown }>(`/api/admin/roles/${encodeURIComponent(roleId)}`, {
    requester,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const role = normalizeAdminRole(data.role);
  if (!role) throw new Error("ROLE_RESPONSE_INVALID");
  return role;
}

export async function createAdminRole(input: { key: string; name: string; description?: string; allowBits: string }, requester: Fetcher = fetch): Promise<AdminRole> {
  const data = await apiFetch<{ role?: unknown }>("/api/admin/roles", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const role = normalizeAdminRole(data.role);
  if (!role) throw new Error("ROLE_RESPONSE_INVALID");
  return role;
}

export async function assignAdminRoleMember(roleId: string, memberId: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch(`/api/admin/roles/${encodeURIComponent(roleId)}/members`, {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ memberId }),
  });
}

export async function unassignAdminRoleMember(roleId: string, memberId: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch(`/api/admin/roles/${encodeURIComponent(roleId)}/members`, {
    requester,
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ memberId }),
  });
}
