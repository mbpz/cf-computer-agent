import type { CreateMember, Member, MemberPage, MemberStatus } from "./types";

export interface MembersRepositoryPort {
  findByAccessSub(accessSub: string): Promise<Member | null>;
  findById(id: string): Promise<Member | null>;
  hasActiveAdmin(): Promise<boolean>;
  insert(member: CreateMember): Promise<Member>;
  touchLastSeenIfStale(id: string, now: string, staleBefore: string): Promise<boolean>;
  list(limit?: number, cursor?: string): Promise<MemberPage>;
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
    await this.db.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      member.id, member.accessSub, member.email, member.role, member.status, member.createdAt, member.updatedAt,
    ).run();
    return { ...member, lastSeenAt: null };
  }

  async touchLastSeenIfStale(id: string, now: string, staleBefore: string): Promise<boolean> {
    const result = await this.db.prepare(
      "UPDATE members SET last_seen_at = ?, updated_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)",
    ).bind(now, now, id, staleBefore).run();
    return result.meta.changes > 0;
  }

  async list(limit = 20, cursor?: string): Promise<MemberPage> {
    const boundedLimit = Math.min(Math.max(limit, 1), 50);
    const rows = cursor
      ? await this.db.prepare(`${memberSelect} WHERE id > ? ORDER BY id ASC LIMIT ?`).bind(cursor, boundedLimit + 1).all<MemberRow>()
      : await this.db.prepare(`${memberSelect} ORDER BY id ASC LIMIT ?`).bind(boundedLimit + 1).all<MemberRow>();
    const items = rows.results.slice(0, boundedLimit).map(mapMemberRow);
    const extra = rows.results[boundedLimit];
    return { items, ...(extra ? { nextCursor: items.at(-1)?.id } : {}) };
  }

  async updateContributorStatus(id: string, status: MemberStatus, updatedAt = new Date().toISOString()): Promise<Member | null> {
    const result = await this.db.prepare(
      "UPDATE members SET status = ?, updated_at = ? WHERE id = ? AND role = 'contributor'",
    ).bind(status, updatedAt, id).run();
    return result.meta.changes ? this.findById(id) : null;
  }
}

const memberSelect = "SELECT id, access_sub, email, role, status, created_at, updated_at, last_seen_at FROM members";

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
