import { ApiRequestError, apiFetch, type Fetcher } from "./api";
import { normalizeNumberedPage, supportedPageSizes, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";

/**
 * Invitation codes: registration proof, one-time binding and the member's single
 * shareable code.
 *
 * The server stores and returns the canonical form — 16 uppercase characters
 * without separators. A human pastes the grouped display form (or types lowercase
 * with separators), so every entry point normalizes first. Both the anonymous
 * registration flow and the member/admin surfaces share this one parser.
 */
export const INVITATION_CODE_LENGTH = 16;
/** Canonical alphabet: `A-H`, `J-N`, `P-Z`, `2-9` — the ambiguous `I` and `O` are absent. */
const INVITATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/u;
const INVITATION_KINDS = ["admin", "member"] as const;
const INVITATION_STATUSES = ["unused", "used"] as const;
/** Separators a person may type or paste: hyphens and any whitespace. */
const INVITATION_SEPARATORS = /[\s-]+/gu;

export type InvitationKind = (typeof INVITATION_KINDS)[number];
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface MyInvitation {
  readonly code: string;
  readonly formattedCode: string;
  /** `unused` means shareable; `used` means the one lifetime code is spent. */
  readonly status: InvitationStatus;
  readonly createdAt: string;
  readonly usedAt: string | null;
  /** Whether a new member is bound. The bound member's identity is never exposed. */
  readonly bound: boolean;
}

export interface AdminInvitation {
  readonly id: string;
  readonly code: string;
  readonly formattedCode: string;
  readonly kind: InvitationKind;
  readonly status: InvitationStatus;
  readonly ownerMemberId: string | null;
  readonly ownerEmail: string | null;
  readonly boundMemberId: string | null;
  readonly boundEmail: string | null;
  readonly createdAt: string;
  readonly usedAt: string | null;
}

export type AdminInvitationsPage = FrontendNumberedPage<AdminInvitation>;

export interface LoadAdminInvitationsInput extends FrontendPageRequest {
  status?: InvitationStatus | "";
  kind?: InvitationKind | "";
  requester?: Fetcher;
  signal?: AbortSignal;
}

export function normalizeInvitationCode(value: string): string {
  return value.toUpperCase().replace(INVITATION_SEPARATORS, "");
}

export function isInvitationCode(value: string): boolean {
  return INVITATION_CODE_PATTERN.test(normalizeInvitationCode(value));
}

/** Groups the canonical code for display: `XXXX-XXXX-XXXX-XXXX`. */
export function formatInvitationCode(value: string): string {
  const normalized = normalizeInvitationCode(value);
  if (normalized.length !== INVITATION_CODE_LENGTH) return normalized;
  return normalized.replace(/(.{4})(?=.)/gu, "$1-");
}

function invalid(code: string): Error {
  return new Error(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(code);
  return value as Record<string, unknown>;
}

/** A required non-empty string field. */
function required(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0 || value === "null" || value === "undefined") throw invalid(code);
  return value;
}

/** An optional string field that may be absent or explicitly null. */
function optional(value: unknown, code: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value === "null" || value === "undefined") throw invalid(code);
  return value;
}

function invitationStatus(value: unknown, code: string): InvitationStatus {
  if (value !== "unused" && value !== "used") throw invalid(code);
  return value;
}

function invitationKind(value: unknown, code: string): InvitationKind {
  if (value !== "admin" && value !== "member") throw invalid(code);
  return value;
}

function canonicalCode(recordValue: Record<string, unknown>, code: string): { code: string; formattedCode: string } {
  const canonical = required(recordValue.code, code);
  if (!INVITATION_CODE_PATTERN.test(canonical)) throw invalid(code);
  const formatted = required(recordValue.formattedCode, code);
  if (formatted !== formatInvitationCode(canonical)) throw invalid(code);
  return { code: canonical, formattedCode: formatted };
}

function time(value: unknown, code: string): string | null {
  if (value === undefined || value === null) return null;
  return required(value, code);
}

const MY_INVITATION_KEYS = ["code", "formattedCode", "status", "createdAt", "usedAt", "bound"] as const;
const ADMIN_INVITATION_KEYS = ["id", "code", "formattedCode", "kind", "status", "ownerMemberId", "ownerEmail", "boundMemberId", "boundEmail", "createdAt", "usedAt"] as const;

/** Rejects unknown fields; the required ones are read by name so absence still fails. */
function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], code: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw invalid(code);
}

export function normalizeMyInvitation(value: unknown): MyInvitation {
  const body = record(value, "INVITATION_RESPONSE_INVALID");
  assertKnownKeys(body, MY_INVITATION_KEYS, "INVITATION_RESPONSE_INVALID");
  const { code, formattedCode } = canonicalCode(body, "INVITATION_RESPONSE_INVALID");
  const status = invitationStatus(body.status, "INVITATION_RESPONSE_INVALID");
  const createdAt = required(body.createdAt, "INVITATION_RESPONSE_INVALID");
  const usedAt = time(body.usedAt, "INVITATION_RESPONSE_INVALID");
  const bound = body.bound;
  if (typeof bound !== "boolean") throw invalid("INVITATION_RESPONSE_INVALID");
  // The server keeps status, usedAt and bound in lockstep (a used code is bound);
  // a response that disagrees is not a code this member can act on.
  if ((status === "used") !== (usedAt !== null) || (status === "used") !== bound) throw invalid("INVITATION_RESPONSE_INVALID");
  return Object.freeze({ code, formattedCode, status, createdAt, usedAt, bound });
}

export function normalizeAdminInvitation(value: unknown): AdminInvitation {
  const code = "ADMIN_INVITATION_RESPONSE_INVALID";
  const body = record(value, code);
  assertKnownKeys(body, ADMIN_INVITATION_KEYS, code);
  const id = required(body.id, code);
  const canonical = canonicalCode(body, code);
  const kind = invitationKind(body.kind, code);
  const status = invitationStatus(body.status, code);
  const ownerMemberId = optional(body.ownerMemberId, code);
  const boundMemberId = optional(body.boundMemberId, code);
  const createdAt = required(body.createdAt, code);
  const usedAt = time(body.usedAt, code);
  if ((status === "used") !== (usedAt !== null)) throw invalid(code);
  // One member owns at most one shareable code; an admin code has no owner.
  if (kind === "admin" && ownerMemberId !== null) throw invalid(code);
  const invitation: AdminInvitation = {
    id,
    code: canonical.code,
    formattedCode: canonical.formattedCode,
    kind,
    status,
    ownerMemberId,
    ownerEmail: optional(body.ownerEmail, code),
    boundMemberId,
    boundEmail: optional(body.boundEmail, code),
    createdAt,
    usedAt,
  };
  return Object.freeze(invitation);
}

/** Reads the signed-in member's code without creating one; null means none yet. */
export async function loadMyInvitation(requester: Fetcher = fetch, signal?: AbortSignal): Promise<MyInvitation | null> {
  const data = await apiFetch<unknown>("/api/invitations/mine", { requester, signal });
  const body = record(data, "INVITATION_RESPONSE_INVALID");
  if (Object.keys(body).length !== 1 || !("invitation" in body)) throw invalid("INVITATION_RESPONSE_INVALID");
  if (body.invitation === null) return null;
  return normalizeMyInvitation(body.invitation);
}

/** Creates the signed-in member's one lifetime code, or returns the existing one. */
export async function createMyInvitation(requester: Fetcher = fetch): Promise<MyInvitation> {
  const data = await apiFetch<unknown>("/api/invitations/mine", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  const body = record(data, "INVITATION_RESPONSE_INVALID");
  if (Object.keys(body).length !== 1 || !("invitation" in body)) throw invalid("INVITATION_RESPONSE_INVALID");
  return normalizeMyInvitation(body.invitation);
}

export async function loadAdminInvitations({ page, pageSize, status, kind, requester = fetch, signal }: LoadAdminInvitationsInput): Promise<AdminInvitationsPage> {
  if (!Number.isSafeInteger(page) || page < 1 || !supportedPageSizes.includes(pageSize)) throw invalid("INVITATION_REQUEST_INVALID");
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  const result = normalizeNumberedPage(
    await apiFetch<unknown>(`/api/admin/invitations?${params}`, { requester, signal }),
    normalizeAdminInvitation,
  );
  if (result.pagination.page !== page || result.pagination.pageSize !== pageSize) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  if (new Set(result.items.map((item) => item.id)).size !== result.items.length) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  if (status && result.items.some((item) => item.status !== status)) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  if (kind && result.items.some((item) => item.kind !== kind)) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  return result;
}

/** Admin codes are unlimited: every accepted call mints `count` new single-use codes. */
export async function generateAdminInvitations(count = 1, requester: Fetcher = fetch): Promise<readonly AdminInvitation[]> {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw invalid("INVITATION_REQUEST_INVALID");
  const data = await apiFetch<unknown>("/api/admin/invitations", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ count }),
  });
  const body = record(data, "ADMIN_INVITATION_RESPONSE_INVALID");
  if (Object.keys(body).length !== 1 || !Array.isArray(body.invitations)) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  const invitations = (body.invitations as unknown[]).map(normalizeAdminInvitation);
  if (invitations.length !== count || invitations.some((item) => item.kind !== "admin" || item.status !== "unused")) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  if (new Set(invitations.map((item) => item.id)).size !== invitations.length) throw invalid("ADMIN_INVITATION_RESPONSE_INVALID");
  return Object.freeze(invitations);
}

/** Admin surfaces treat a capability refusal as a distinct forbidden state, not an empty list. */
export function isInvitationForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 403 || error.code === "FORBIDDEN");
}
