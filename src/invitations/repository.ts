import { AppError } from "../http";
import { pageOffset, type NumberedPageRequest } from "../pagination";
import { queryNumberedPage } from "../pagination-d1";
import {
  formatInvitationCode,
  type Invitation,
  type InvitationFilter,
  type InvitationKind,
  type InvitationNetworkNode,
  type InvitationPage,
  type InvitationStatus,
} from "./types";

export type InvitationConflictKind = "code" | "owner";

/** A unique-index conflict: a code collision is retried, an owner collision is a lost race. */
export class InvitationConflictError extends Error {
  constructor(readonly kind: InvitationConflictKind) {
    super(`Invitation conflict: ${kind}`);
  }
}

export interface InvitationsRepositoryPort {
  findByOwnerMemberId(memberId: string): Promise<Invitation | null>;
  /** My sharable code plus the email of the member who consumed it. */
  findOwnedWithBoundEmail(memberId: string): Promise<{ invitation: Invitation; boundEmail: string | null } | null>;
  insert(invitation: Invitation): Promise<Invitation>;
  /** The code that created `memberId`, used to prove identity before a password reset. */
  findBoundByMemberId(memberId: string): Promise<Invitation | null>;
  listPage(request: NumberedPageRequest, filter?: InvitationFilter): Promise<InvitationPage>;
  /** All members with the invitation that created them, for the admin forest. */
  network(): Promise<InvitationNetworkNode[]>;
}

type InvitationRow = {
  id: string;
  code: string;
  kind: InvitationKind;
  owner_member_id: string | null;
  bound_member_id: string | null;
  status: InvitationStatus;
  created_by_member_id: string;
  created_at: string;
  used_at: string | null;
};

type InvitationListRow = InvitationRow & {
  owner_email: string | null;
  bound_email: string | null;
};

const invitationColumns = `id, code, kind, owner_member_id, bound_member_id, status,
  created_by_member_id, created_at, used_at`;

export class InvitationsRepository implements InvitationsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findByOwnerMemberId(memberId: string): Promise<Invitation | null> {
    const row = await this.db.prepare(
      `SELECT ${invitationColumns} FROM invitations WHERE owner_member_id = ? LIMIT 1`,
    ).bind(memberId).first<InvitationRow>();
    return row === null ? null : mapInvitation(row);
  }

  async findOwnedWithBoundEmail(memberId: string): Promise<{ invitation: Invitation; boundEmail: string | null } | null> {
    const row = await this.db.prepare(
      `SELECT i.id, i.code, i.kind, i.owner_member_id, i.bound_member_id, i.status,
              i.created_by_member_id, i.created_at, i.used_at, b.email AS bound_email
       FROM invitations i
       LEFT JOIN members b ON b.id = i.bound_member_id
       WHERE i.owner_member_id = ?
       LIMIT 1`,
    ).bind(memberId).first<InvitationListRow>();
    if (!row) return null;
    return { invitation: mapInvitation(row), boundEmail: row.bound_email };
  }

  async findBoundByMemberId(memberId: string): Promise<Invitation | null> {
    const row = await this.db.prepare(
      `SELECT ${invitationColumns} FROM invitations WHERE bound_member_id = ? LIMIT 1`,
    ).bind(memberId).first<InvitationRow>();
    return row === null ? null : mapInvitation(row);
  }

  async insert(invitation: Invitation): Promise<Invitation> {
    let results: D1Result[];
    try {
      results = await this.db.batch([
        this.db.prepare(
          `INSERT INTO invitations (id, code, kind, owner_member_id, bound_member_id, status,
             created_by_member_id, created_at, used_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          invitation.id,
          invitation.code,
          invitation.kind,
          invitation.ownerMemberId,
          invitation.boundMemberId,
          invitation.status,
          invitation.createdByMemberId,
          invitation.createdAt,
          invitation.usedAt,
        ),
      ]);
    } catch (error) {
      const conflict = classifyInvitationConflict(error);
      if (conflict) throw new InvitationConflictError(conflict);
      throw error;
    }
    if (results[0]?.meta.changes !== 1) throw new Error("Invitation creation did not persist");
    return invitation;
  }

  async network(): Promise<InvitationNetworkNode[]> {
    const rows = await this.db.prepare(
      `SELECT m.id, m.email, m.role, m.status, m.created_at,
              i.id AS invitation_id, i.code AS invitation_code, i.kind AS invitation_kind,
              i.created_at AS invitation_created_at,
              CASE
                WHEN i.id IS NULL THEN NULL
                WHEN substr(i.id, 1, 9) = 'backfill-' THEN NULL
                WHEN i.owner_member_id IS NOT NULL THEN i.owner_member_id
                WHEN i.created_by_member_id <> i.bound_member_id THEN i.created_by_member_id
                ELSE NULL
              END AS inviter_id
       FROM members m
       LEFT JOIN invitations i ON i.bound_member_id = m.id
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT 2000`,
    ).all<{
      id: string; email: string; role: "admin" | "contributor"; status: "active" | "disabled";
      created_at: string; invitation_id: string | null; invitation_code: string | null;
      invitation_kind: InvitationKind | null; invitation_created_at: string | null; inviter_id: string | null;
    }>();
    return rows.results.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      inviterId: row.inviter_id,
      invitation: row.invitation_id === null || row.invitation_code === null || row.invitation_kind === null || row.invitation_created_at === null
        ? null
        : {
          id: row.invitation_id,
          code: row.invitation_code,
          formattedCode: formatInvitationCode(row.invitation_code),
          kind: row.invitation_kind,
          createdAt: row.invitation_created_at,
          backfilled: row.invitation_id.startsWith("backfill-"),
        },
    }));
  }

  async listPage(request: NumberedPageRequest, filter: InvitationFilter = {}): Promise<InvitationPage> {
    const status = filter.status;
    const kind = filter.kind;
    if (status !== undefined && status !== "unused" && status !== "used") {
      throw new AppError("FILTER_INVALID", "Filter is invalid", 400);
    }
    if (kind !== undefined && kind !== "admin" && kind !== "member") {
      throw new AppError("FILTER_INVALID", "Filter is invalid", 400);
    }
    const conditions: string[] = [];
    const bindings: string[] = [];
    if (status !== undefined) {
      conditions.push("i.status = ?");
      bindings.push(status);
    }
    if (kind !== undefined) {
      conditions.push("i.kind = ?");
      bindings.push(kind);
    }
    const where = conditions.length === 0 ? "" : ` WHERE ${conditions.join(" AND ")}`;
    return queryNumberedPage(
      this.db,
      this.db.prepare(`SELECT COUNT(*) AS total FROM invitations i${where}`).bind(...bindings),
      this.db.prepare(
        `SELECT i.id, i.code, i.kind, i.owner_member_id, i.bound_member_id, i.status,
           i.created_by_member_id, i.created_at, i.used_at,
           owner.email AS owner_email, bound.email AS bound_email
         FROM invitations i
         LEFT JOIN members owner ON owner.id = i.owner_member_id
         LEFT JOIN members bound ON bound.id = i.bound_member_id${where}
         ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`,
      ).bind(...bindings, request.pageSize, pageOffset(request)),
      request,
      (row) => mapInvitationListItem(row as InvitationListRow),
    );
  }
}

function mapInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    ownerMemberId: row.owner_member_id,
    boundMemberId: row.bound_member_id,
    status: row.status,
    createdByMemberId: row.created_by_member_id,
    createdAt: row.created_at,
    usedAt: row.used_at,
  };
}

function mapInvitationListItem(row: InvitationListRow): InvitationPage["items"][number] {
  return {
    id: row.id,
    code: row.code,
    formattedCode: formatInvitationCode(row.code),
    kind: row.kind,
    status: row.status,
    ownerMemberId: row.owner_member_id,
    ownerEmail: row.owner_email,
    boundMemberId: row.bound_member_id,
    boundEmail: row.bound_email,
    createdAt: row.created_at,
    usedAt: row.used_at,
  };
}

function classifyInvitationConflict(error: unknown): InvitationConflictKind | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message;
  if (/UNIQUE constraint failed: (invitations\.code|index 'invitations_code_unique')/u.test(message)) return "code";
  if (/UNIQUE constraint failed: (invitations\.owner_member_id|index 'invitations_member_owner_unique')/u.test(message)) return "owner";
  return undefined;
}
