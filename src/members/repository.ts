import type { CreateMember, Member, MemberPage, MemberStatus } from "./types";
import { AppError } from "../http";

export type MembersConflictKind = "access_sub" | "active_admin";

export class MembersConflictError extends Error {
  constructor(readonly kind: MembersConflictKind) {
    super(`Member conflict: ${kind}`);
  }
}

export interface MembersRepositoryPort {
  findByAccessSub(accessSub: string): Promise<Member | null>;
  findById(id: string): Promise<Member | null>;
  hasActiveAdmin(): Promise<boolean>;
  insert(member: CreateMember): Promise<Member>;
  touchLastSeenIfStale(id: string, now: string, staleBefore: string): Promise<boolean>;
  listPage(limit?: number, cursor?: string): Promise<MemberPage>;
  updateContributorStatus(id: string, status: MemberStatus, updatedAt?: string): Promise<Member | null>;
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
  constructor(private readonly db: D1Database) {}

  async findByAccessSub(accessSub: string): Promise<Member | null> {
    return mapMember(await this.db.prepare(`${memberSelect} WHERE access_sub = ?`).bind(accessSub).first<MemberRow>());
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
        member.id, member.accessSub, member.email, member.role, member.status, member.createdAt, member.updatedAt,
      ).run();
    } catch (error) {
      const conflict = classifyMembersConflict(error);
      if (conflict) throw new MembersConflictError(conflict);
      throw error;
    }
    return { ...member, lastSeenAt: null };
  }

  async touchLastSeenIfStale(id: string, now: string, staleBefore: string): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE members SET last_seen_at = ?, updated_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)",
    ).bind(now, now, id, staleBefore).run();
    return result.meta.changes > 0;
  }

  async listPage(limit: number = 20, cursor?: string): Promise<MemberPage> {
    const pageLimit = validatePageLimit(limit);
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const rows = cursorId
      ? await this.db.prepare(`${memberSelect} WHERE id > ? ORDER BY id ASC LIMIT ?`).bind(cursorId, pageLimit + 1).all<MemberRow>()
      : await this.db.prepare(`${memberSelect} ORDER BY id ASC LIMIT ?`).bind(pageLimit + 1).all<MemberRow>();
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
}

const memberSelect = "SELECT id, access_sub, email, role, status, created_at, updated_at, last_seen_at FROM members";
const maxCursorLength = 512;

function classifyMembersConflict(error: unknown): MembersConflictKind | undefined {
  if (!(error instanceof Error)) return undefined;
  const known = new Map<string, MembersConflictKind>([
    ["UNIQUE constraint failed: members.access_sub", "access_sub"],
    ["D1_ERROR: UNIQUE constraint failed: members.access_sub: SQLITE_CONSTRAINT", "access_sub"],
    ["D1_ERROR: UNIQUE constraint failed: members.access_sub: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)", "access_sub"],
    ["UNIQUE constraint failed: members.role", "active_admin"],
    ["D1_ERROR: UNIQUE constraint failed: members.role: SQLITE_CONSTRAINT", "active_admin"],
    ["D1_ERROR: UNIQUE constraint failed: members.role: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)", "active_admin"],
  ]);
  return known.get(error.message);
}

function validatePageLimit(limit: number): number {
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new AppError("PAGE_INVALID", "Page limit must be an integer from 1 to 50", 400);
  }
  return limit;
}

function encodeCursor(id: string): string {
  return btoa(JSON.stringify({ v: 1, id })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string): string {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > maxCursorLength || cursor.length % 4 === 1) throw new Error();
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - cursor.length % 4) % 4);
    const decoded = JSON.parse(atob(padded)) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const { v, id } = decoded as Record<string, unknown>;
    if (v !== 1 || typeof id !== "string" || !id) throw new Error();
    return id;
  } catch {
    throw new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
  }
}

function mapMember(row: MemberRow | null): Member | null {
  return row ? mapMemberRow(row) : null;
}

function mapMemberRow(row: MemberRow): Member {
  return {
    id: row.id,
    accessSub: row.access_sub,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}
