import type { CreateMember, Member, MemberPage, MemberStatus } from "./types";
import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest } from "../pagination";
import { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";

export type MembersConflictKind = "identity_subject" | "active_admin";

export class MembersConflictError extends Error {
  constructor(readonly kind: MembersConflictKind) {
    super(`Member conflict: ${kind}`);
  }
}

export interface MembersRepositoryPort {
  findByIdentitySubject(subject: string): Promise<Member | null>;
  findByCanonicalEmail(email: string, limit: 2): Promise<Member[]>;
  findById(id: string): Promise<Member | null>;
  hasActiveAdmin(): Promise<boolean>;
  insert(member: CreateMember): Promise<Member>;
  insertWithAudit?(member: CreateMember, audit: CreateAuditEvent): Promise<Member>;
  linkIdentityWithAudit(
    memberId: string,
    expectedSubject: string,
    newSubject: string,
    updatedAt: string,
    audit: CreateAuditEvent,
  ): Promise<Member | null>;
  touchLastSeenIfStale(id: string, now: string, staleBefore: string): Promise<boolean>;
  listPage(limit?: number, cursor?: string, status?: MemberStatus): Promise<MemberPage>;
  updateContributorStatus(id: string, status: MemberStatus, updatedAt?: string): Promise<Member | null>;
  updateContributorStatusWithAudit?(id: string, status: MemberStatus, updatedAt: string, audit: CreateAuditEvent): Promise<Member | null>;
}

type MemberRow = {
  id: string;
  access_sub: string;
  email: string;
  role: Member["role"];
  status: Member["status"];
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
};

export class MembersRepository implements MembersRepositoryPort {
  constructor(private readonly db: D1Database, private readonly audit?: AuditRepository) {}

  async findByIdentitySubject(subject: string): Promise<Member | null> {
    return mapMember(await this.db.prepare(`${memberSelect} WHERE access_sub = ?`).bind(subject).first<MemberRow>());
  }

  async findByCanonicalEmail(email: string, limit: 2): Promise<Member[]> {
    const rows = await this.db.prepare(
      `${memberSelect} WHERE LOWER(TRIM(email)) = ? ORDER BY id ASC LIMIT ?`,
    ).bind(email, limit).all<MemberRow>();
    return rows.results.map(mapMemberRow);
  }

  async findById(id: string): Promise<Member | null> {
    return mapMember(await this.db.prepare(`${memberSelect} WHERE id = ?`).bind(id).first<MemberRow>());
  }

  async hasActiveAdmin(): Promise<boolean> {
    return Boolean(await this.db.prepare("SELECT 1 FROM members WHERE role = 'admin' AND status = 'active' LIMIT 1").first());
  }

  async insert(member: CreateMember): Promise<Member> {
    try {
      await this.db.prepare(
        "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(
        member.id, member.identitySubject, member.email, member.role, member.status, member.createdAt, member.updatedAt,
      ).run();
    } catch (error) {
      const conflict = classifyMembersConflict(error);
      if (conflict) throw new MembersConflictError(conflict);
      throw error;
    }
    return { ...member, lastSeenAt: null };
  }

  async insertWithAudit(member: CreateMember, input: CreateAuditEvent): Promise<Member> {
    if (!this.audit) return this.insert(member);
    assertMemberLoginAudit(member, input);
    try {
      const results = await this.db.batch([
        this.prepareInsert(member),
        this.audit.prepareResourceWriteAudit(input, { table: "members", id: member.id }),
      ]);
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) throw new Error("Member login audit did not persist");
    } catch (error) {
      const conflict = classifyMembersConflict(error);
      if (conflict) throw new MembersConflictError(conflict);
      throw error;
    }
    return { ...member, lastSeenAt: null };
  }

  async linkIdentityWithAudit(
    memberId: string,
    expectedSubject: string,
    newSubject: string,
    updatedAt: string,
    input: CreateAuditEvent,
  ): Promise<Member | null> {
    if (!this.audit) throw new TypeError("Audit repository is required for identity linking");
    assertMemberIdentityAudit(memberId, input);
    try {
      const results = await this.db.batch([
        this.db.prepare(
          "UPDATE members SET access_sub = ?, updated_at = ? WHERE id = ? AND access_sub = ?",
        ).bind(newSubject, updatedAt, memberId, expectedSubject),
        this.audit.prepareResourceWriteAudit(input, { table: "members", id: memberId }),
      ]);
      if (results[0]?.meta.changes === 0 && results[1]?.meta.changes === 0) return null;
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
        throw new Error("Member identity link audit did not persist");
      }
    } catch (error) {
      const conflict = classifyMembersConflict(error);
      if (conflict) throw new MembersConflictError(conflict);
      throw error;
    }
    return this.findById(memberId);
  }

  async touchLastSeenIfStale(id: string, now: string, staleBefore: string): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE members SET last_seen_at = ?, updated_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)",
    ).bind(now, now, id, staleBefore).run();
    return result.meta.changes > 0;
  }

  async listPage(limit: number = 20, cursor?: string, status?: MemberStatus): Promise<MemberPage> {
    const pageLimit = parsePageRequest(limit).limit;
    if (status !== undefined && status !== "active" && status !== "disabled") {
      throw new AppError("FILTER_INVALID", "Filter is invalid", 400);
    }
    const cursorId = cursor === undefined ? undefined : decodeCursor(cursor);
    const conditions = [
      ...(status === undefined ? [] : ["status = ?"]),
      ...(cursorId === undefined ? [] : ["id > ?"]),
    ];
    const rows = await this.db.prepare(
      `${memberSelect}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY id ASC LIMIT ?`,
    ).bind(
      ...(status === undefined ? [] : [status]),
      ...(cursorId === undefined ? [] : [cursorId]),
      pageLimit + 1,
    ).all<MemberRow>();
    const items = rows.results.slice(0, pageLimit).map(mapMemberRow);
    return {
      items,
      ...(rows.results.length > pageLimit ? { nextCursor: encodeCursor(items.at(-1)!.id) } : {}),
    };
  }

  async updateContributorStatus(id: string, status: MemberStatus, updatedAt = new Date().toISOString()): Promise<Member | null> {
    const result = await this.db.prepare(
      "UPDATE members SET status = ?, updated_at = ? WHERE id = ? AND role = 'contributor'",
    ).bind(status, updatedAt, id).run();
    return result.meta.changes ? this.findById(id) : null;
  }

  async updateContributorStatusWithAudit(
    id: string,
    status: MemberStatus,
    updatedAt: string,
    input: CreateAuditEvent,
  ): Promise<Member | null> {
    if (!this.audit) return this.updateContributorStatus(id, status, updatedAt);
    const current = await this.findById(id);
    if (!current || current.role !== "contributor") return null;
    assertMemberStatusAudit(current, status, input);
    const results = await this.db.batch([
      this.db.prepare(
        "UPDATE members SET status = ?, updated_at = ? WHERE id = ? AND role = 'contributor' AND status = ?",
      ).bind(status, updatedAt, id, current.status),
      this.audit.prepareResourceWriteAudit(input, { table: "members", id }),
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) return null;
    return this.findById(id);
  }

  private prepareInsert(member: CreateMember): D1PreparedStatement {
    return this.db.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(member.id, member.identitySubject, member.email, member.role, member.status, member.createdAt, member.updatedAt);
  }
}

const memberSelect = "SELECT id, access_sub, email, role, status, created_at, updated_at, last_seen_at FROM members";

function classifyMembersConflict(error: unknown): MembersConflictKind | undefined {
  if (!(error instanceof Error)) return undefined;
  const known = new Map<string, MembersConflictKind>([
    ["UNIQUE constraint failed: members.access_sub", "identity_subject"],
    ["D1_ERROR: UNIQUE constraint failed: members.access_sub: SQLITE_CONSTRAINT", "identity_subject"],
    ["D1_ERROR: UNIQUE constraint failed: members.access_sub: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)", "identity_subject"],
    ["UNIQUE constraint failed: members.role", "active_admin"],
    ["D1_ERROR: UNIQUE constraint failed: members.role: SQLITE_CONSTRAINT", "active_admin"],
    ["D1_ERROR: UNIQUE constraint failed: members.role: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)", "active_admin"],
  ]);
  return known.get(error.message);
}

function encodeCursor(id: string): string {
  return encodeOpaqueCursor({ v: 1, id });
}

function decodeCursor(cursor: string): string {
  const decoded = decodeOpaqueCursor(cursor);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  const { v, id } = decoded as Record<string, unknown>;
  if (v !== 1 || typeof id !== "string" || !id) throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  return id;
}

function mapMember(row: MemberRow | null): Member | null {
  return row ? mapMemberRow(row) : null;
}

function mapMemberRow(row: MemberRow): Member {
  return {
    id: row.id,
    identitySubject: row.access_sub,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

function assertMemberLoginAudit(member: CreateMember, audit: CreateAuditEvent): void {
  if (audit.actorKind !== "member" || audit.actorId !== member.id || audit.action !== "member.login"
    || audit.resourceType !== "member" || audit.resourceId !== member.id || audit.metadata.role !== member.role) {
    throw new TypeError("Member login audit binding is invalid");
  }
}

function assertMemberStatusAudit(member: Member, status: MemberStatus, audit: CreateAuditEvent): void {
  if (audit.actorKind !== "member" || audit.action !== "member.status_updated" || audit.resourceType !== "member"
    || audit.resourceId !== member.id || audit.metadata.previousStatus !== member.status || audit.metadata.newStatus !== status) {
    throw new TypeError("Member status audit binding is invalid");
  }
}

function assertMemberIdentityAudit(memberId: string, audit: CreateAuditEvent): void {
  if (audit.actorKind !== "member" || audit.actorId !== memberId || audit.action !== "member.identity_linked"
    || audit.resourceType !== "member" || audit.resourceId !== memberId || audit.metadata.provider !== "github") {
    throw new TypeError("Member identity audit binding is invalid");
  }
}
