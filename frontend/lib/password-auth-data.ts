import { ApiRequestError, apiFetch, type Fetcher } from "./api";
import { normalizeInvitationCode } from "./invitations-data";

export interface PasswordAuthMember {
  id: string;
  email: string;
  role: "admin" | "contributor";
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const memberKeys = ["id", "email", "role"] as const;

function invalidResponse(): never {
  throw new Error("PASSWORD_AUTH_RESPONSE_INVALID");
}

function parseMember(data: unknown): PasswordAuthMember {
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).length !== 1 || !("member" in data)) invalidResponse();
  const member = data.member;
  const keys = member && typeof member === "object" && !Array.isArray(member) ? Object.keys(member) : [];
  if (!member || typeof member !== "object" || Array.isArray(member)
    || keys.length !== memberKeys.length
    || keys.some((key) => key !== "id" && key !== "email" && key !== "role")) invalidResponse();
  if (!("id" in member) || !("email" in member) || !("role" in member)) invalidResponse();
  const { id, email, role } = member;
  if (typeof id !== "string" || !id || typeof email !== "string" || !email
    || (role !== "admin" && role !== "contributor")) invalidResponse();
  return { id, email, role };
}

async function credentials(path: string, email: string, password: string, requester: Fetcher): Promise<PasswordAuthMember> {
  const data = await apiFetch<unknown>(path, {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseMember(data);
}

/** Registration requires an unused, unbound invitation code. */
export async function registerPassword(email: string, password: string, invitationCode: string, requester: Fetcher = fetch): Promise<PasswordAuthMember> {
  const data = await apiFetch<unknown>("/auth/register", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, invitationCode: normalizeInvitationCode(invitationCode) }),
  });
  return parseMember(data);
}

export function loginPassword(email: string, password: string, requester: Fetcher = fetch): Promise<PasswordAuthMember> {
  return credentials("/auth/password", email, password, requester);
}

/** Reset must prove ownership with the invitation code used at registration. */
export async function resetPassword(email: string, password: string, invitationCode: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch<unknown>("/auth/password/reset", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, invitationCode: normalizeInvitationCode(invitationCode) }),
  });
}

export type PasswordAuthFailure =
  | "invalid"
  | "weak"
  | "taken"
  | "rate_limited"
  | "rejected"
  | "locked"
  | "disabled"
  | "reset_rejected"
  | "invitation_required"
  | "invitation_invalid"
  | "unknown";

/** Changes the signed-in member's password. Existing password accounts must
 * send the current password; accounts without one may set their first. */
export async function changePassword(currentPassword: string, newPassword: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch<unknown>("/api/account/password", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      newPassword,
      ...(currentPassword.length > 0 ? { currentPassword } : {}),
    }),
  });
}

export function passwordAuthFailure(error: unknown): PasswordAuthFailure {
  if (!(error instanceof ApiRequestError)) return "unknown";
  switch (error.code) {
    case "PASSWORD_AUTH_REQUEST_INVALID": return "invalid";
    case "PASSWORD_POLICY_INVALID": return "weak";
    case "REGISTRATION_EMAIL_TAKEN": return "taken";
    case "REGISTRATION_RATE_LIMITED": return "rate_limited";
    case "PASSWORD_LOGIN_LOCKED": return "locked";
    case "PASSWORD_LOGIN_INVALID": return "rejected";
    case "MEMBER_DISABLED": return "disabled";
    // Unknown and already-used codes are deliberately indistinguishable here.
    case "REGISTRATION_INVITATION_REQUIRED": return "invitation_required";
    case "REGISTRATION_INVITATION_INVALID": return "invitation_invalid";
    case "PASSWORD_RESET_INVALID": return "reset_rejected";
    default: return error.status === 400 ? "invalid" : "unknown";
  }
}
