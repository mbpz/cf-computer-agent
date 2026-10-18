import { ApiRequestError, apiFetch, type Fetcher } from "./api";

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

export function registerPassword(email: string, password: string, requester: Fetcher = fetch): Promise<PasswordAuthMember> {
  return credentials("/auth/register", email, password, requester);
}

export function loginPassword(email: string, password: string, requester: Fetcher = fetch): Promise<PasswordAuthMember> {
  return credentials("/auth/password", email, password, requester);
}

export type PasswordAuthFailure =
  | "invalid"
  | "weak"
  | "taken"
  | "rate_limited"
  | "rejected"
  | "locked"
  | "disabled"
  | "unknown";

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
    default: return error.status === 400 ? "invalid" : "unknown";
  }
}
