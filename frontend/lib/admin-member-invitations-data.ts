import { ApiRequestError, apiFetch, type Fetcher } from "./api";

/** Persisted invitation lifecycle. Expiry is not a status: a pending invitation whose
 * expiresAt has passed is still reported as "pending" (the Worker decides redemption). */
export type AdminMemberInvitationStatus = "pending" | "redeemed" | "revoked";

export interface AdminMemberInvitation {
  id: string;
  email: string;
  status: AdminMemberInvitationStatus;
  createdAt: string;
  expiresAt: string;
}

/** The revoke endpoint returns a trimmed receipt, not the full invitation DTO. */
export interface RevokedAdminMemberInvitation {
  id: string;
  email: string;
  status: "revoked";
}

const invitationStatuses: Record<AdminMemberInvitationStatus, true> = { pending: true, redeemed: true, revoked: true };
const invitationKeys = ["id", "email", "status", "createdAt", "expiresAt"] as const;

function invalidInvitation(): never { throw new Error("INVITATION_RESPONSE_INVALID"); }

function normalizeInvitation(value: unknown): AdminMemberInvitation {
  // The list and the revoke receipt never carry the one-time code: any extra key is
  // contract drift, and a leaked `code` here would break the show-once guarantee.
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== invitationKeys.length
    || Object.keys(value).some((key) => !invitationKeys.includes(key as (typeof invitationKeys)[number]))) invalidInvitation();
  const { id, email, status, createdAt, expiresAt } = value as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof email !== "string" || !email
    || typeof status !== "string" || !Object.hasOwn(invitationStatuses, status)
    || typeof createdAt !== "string" || !createdAt || typeof expiresAt !== "string" || !expiresAt) invalidInvitation();
  return { id, email, status: status as AdminMemberInvitationStatus, createdAt, expiresAt };
}

export async function loadAdminMemberInvitations(requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminMemberInvitation[]> {
  const data = await apiFetch<unknown>("/api/admin/member-invitations", { requester, signal });
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || !("items" in data) || !Array.isArray(data.items)) invalidInvitation();
  const items = data.items.map(normalizeInvitation);
  if (new Set(items.map((item) => item.id)).size !== items.length) invalidInvitation();
  return items;
}

export async function issueAdminMemberInvitation(email: string, requester: Fetcher = fetch): Promise<AdminMemberInvitation> {
  const data = await apiFetch<unknown>("/api/admin/member-invitations", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || !("invitation" in data)) invalidInvitation();
  const invitation = normalizeInvitation(data.invitation);
  if (invitation.status !== "pending") invalidInvitation();
  return invitation;
}

export async function revokeAdminMemberInvitation(id: string, requester: Fetcher = fetch): Promise<RevokedAdminMemberInvitation> {
  const data = await apiFetch<unknown>(`/api/admin/member-invitations/${encodeURIComponent(id)}/revoke`, { requester, method: "POST" });
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length !== 1 || !("invitation" in data)) invalidInvitation();
  const receipt = data.invitation;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || Object.keys(receipt).length !== 3 || Object.keys(receipt).some((key) => !["id", "email", "status"].includes(key))) invalidInvitation();
  const { id: receiptId, email, status } = receipt as Record<string, unknown>;
  if (receiptId !== id || typeof email !== "string" || !email || status !== "revoked") invalidInvitation();
  return { id: receiptId, email, status: "revoked" };
}

/** Maps a failed invitation write to a distinct, user-presentable outcome. */
export type AdminMemberInvitationFailure = "invalid" | "already_pending" | "admin_email" | "not_found" | "not_pending" | "forbidden" | "unknown";

export function adminMemberInvitationFailure(error: unknown): AdminMemberInvitationFailure {
  if (!(error instanceof ApiRequestError)) return "unknown";
  if (error.status === 401 || error.status === 403) return "forbidden";
  switch (error.code) {
    case "INVITATION_REQUEST_INVALID": return "invalid";
    case "INVITATION_ALREADY_PENDING": return "already_pending";
    case "INVITATION_ADMIN_EMAIL": return "admin_email";
    case "INVITATION_NOT_FOUND": return "not_found";
    case "INVITATION_NOT_PENDING": return "not_pending";
    default: return "unknown";
  }
}
