import type { NumberedPage } from "../pagination";

/**
 * Invitation rows follow the 0079 migration: `kind` separates administrator
 * issued codes from a member's single lifetime sharing code, and both kinds are
 * single use and bind the member they create.
 */
export type InvitationKind = "admin" | "member";
export type InvitationStatus = "unused" | "used";

export interface Invitation {
  id: string;
  /** Canonical 16-character code without separators. */
  code: string;
  kind: InvitationKind;
  ownerMemberId: string | null;
  boundMemberId: string | null;
  status: InvitationStatus;
  createdByMemberId: string;
  createdAt: string;
  usedAt: string | null;
}

/** Administration list row: every code including its owner/bound member emails. */
export interface InvitationListItem {
  id: string;
  code: string;
  formattedCode: string;
  kind: InvitationKind;
  status: InvitationStatus;
  ownerMemberId: string | null;
  ownerEmail: string | null;
  boundMemberId: string | null;
  boundEmail: string | null;
  createdAt: string;
  usedAt: string | null;
}

export type InvitationPage = NumberedPage<InvitationListItem>;

/**
 * The sharing member's own code. `bound` is deliberately a boolean: the sharer
 * never learns which new member consumed their code.
 */
export interface MemberInvitation {
  code: string;
  formattedCode: string;
  status: InvitationStatus;
  createdAt: string;
  usedAt: string | null;
  bound: boolean;
  /** Email of the member who consumed this sharing code; null while unused. */
  boundEmail: string | null;
}

/** The invitation that created the signed-in member (registration or backfill). */
export interface BoundMemberInvitation {
  code: string;
  formattedCode: string;
  kind: InvitationKind;
  createdAt: string;
  usedAt: string | null;
}

export interface MemberInvitationsView {
  /** Code bound to my own account; null for GitHub/WeChat-only members. */
  boundInvitation: BoundMemberInvitation | null;
  /** My single sharable code, with the bound new member's email when used. */
  invitation: MemberInvitation | null;
}

/** One member in the invitation-fission forest. `inviterId` is null for roots
 * (bootstrap/GitHub-only/backfilled legacy accounts) and for backfilled codes. */
export interface InvitationNetworkNode {
  id: string;
  email: string;
  role: "admin" | "contributor";
  status: "active" | "disabled";
  createdAt: string;
  inviterId: string | null;
  invitation: {
    id: string;
    code: string;
    formattedCode: string;
    kind: InvitationKind;
    createdAt: string;
    /** True for the 0080 repair rows: they are not a real invitation relation. */
    backfilled: boolean;
  } | null;
}

export interface InvitationNetwork {
  nodes: InvitationNetworkNode[];
  stats: { members: number; invited: number; roots: number; maxDepth: number };
}

export interface InvitationFilter {
  status?: InvitationStatus;
  kind?: InvitationKind;
}

/** No I, O, 0 or 1: the four characters a person most often mistypes. */
export const INVITATION_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITATION_CODE_LENGTH = 16;
export const INVITATION_CODE_GROUP_SIZE = 4;
export const INVITATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{16}$/u;
export const INVITATION_GENERATE_MIN = 1;
export const INVITATION_GENERATE_MAX = 20;

/**
 * Canonicalizes user input: uppercase and drop the hyphens/spaces people paste
 * along with the displayed grouping. Returns null when the result is not a
 * canonical code, so callers can map every malformed input to one error code.
 */
export function normalizeInvitationCode(value: string): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replaceAll(/[\s-]+/gu, "");
  return INVITATION_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function isCanonicalInvitationCode(value: string): boolean {
  return INVITATION_CODE_PATTERN.test(value);
}

/** Formats a canonical code for display/copy as XXXX-XXXX-XXXX-XXXX. */
export function formatInvitationCode(code: string): string {
  if (!isCanonicalInvitationCode(code)) return code;
  const groups: string[] = [];
  for (let offset = 0; offset < code.length; offset += INVITATION_CODE_GROUP_SIZE) {
    groups.push(code.slice(offset, offset + INVITATION_CODE_GROUP_SIZE));
  }
  return groups.join("-");
}

/**
 * Cryptographically random canonical code. The 32-symbol alphabet divides 256
 * exactly, so masking a random byte is unbiased.
 */
export function generateInvitationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITATION_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += INVITATION_CODE_ALPHABET[byte & 31];
  return code;
}

/** Constant-time comparison of two canonical invitation codes. */
export function invitationCodesMatch(expected: string, provided: string): boolean {
  const left = expected.length;
  const right = provided.length;
  const length = Math.max(left, right);
  let difference = left ^ right;
  for (let index = 0; index < length; index += 1) {
    difference |= (expected.charCodeAt(index) | 0) ^ (provided.charCodeAt(index) | 0);
  }
  return difference === 0;
}
