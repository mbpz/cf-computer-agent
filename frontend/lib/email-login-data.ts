import { ApiRequestError, apiFetch, type Fetcher } from "./api";

export interface EmailLoginMember {
  id: string;
  email: string;
  role: "admin" | "contributor";
}

const memberKeys = ["id", "email", "role"] as const;
const CODE = /^\d{6}$/u;

function invalidResponse(): never {
  throw new Error("EMAIL_LOGIN_RESPONSE_INVALID");
}

/** Requests a code. The endpoint deliberately answers the same way for an unknown address. */
export async function requestLoginCode(email: string, requester: Fetcher = fetch): Promise<void> {
  const data = await apiFetch<unknown>("/auth/email/code", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).length !== 1 || !("status" in data) || data.status !== "accepted") invalidResponse();
}

export async function submitEmailLoginCode(email: string, code: string, requester: Fetcher = fetch): Promise<EmailLoginMember> {
  if (!CODE.test(code)) throw new Error("EMAIL_LOGIN_CODE_INVALID");
  const data = await apiFetch<unknown>("/auth/email/code/verify", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).length !== 1 || !("member" in data)) invalidResponse();
  const member = data.member;
  const keys = member && typeof member === "object" && !Array.isArray(member) ? Object.keys(member) : [];
  if (!member || typeof member !== "object" || Array.isArray(member)
    || keys.length !== memberKeys.length
    || keys.some((key) => key !== "id" && key !== "email" && key !== "role")) invalidResponse();
  const { id, email: memberEmail, role } = member as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof memberEmail !== "string" || !memberEmail
    || (role !== "admin" && role !== "contributor")) invalidResponse();
  return { id, email: memberEmail, role };
}

/**
 * Maps a failed sign-in to a presentation outcome. Verification failures stay
 * uniform so the page cannot distinguish a wrong code from an expired one.
 */
export type EmailLoginFailure = "invalid" | "rejected" | "disabled" | "unavailable" | "delivery" | "unknown";

export function emailLoginFailure(error: unknown): EmailLoginFailure {
  if (!(error instanceof ApiRequestError)) return "unknown";
  if (error.code === "EMAIL_LOGIN_UNAVAILABLE") return "unavailable";
  if (error.code === "EMAIL_LOGIN_DELIVERY_FAILED") return "delivery";
  if (error.code === "MEMBER_DISABLED") return "disabled";
  if (error.status === 400 || error.code === "EMAIL_LOGIN_REQUEST_INVALID") return "invalid";
  if (error.status === 401 || error.code === "EMAIL_LOGIN_INVALID") return "rejected";
  return "unknown";
}
