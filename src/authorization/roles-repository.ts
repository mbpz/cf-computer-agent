import { AppError } from "../http";
import { parsePermissionMask, serializePermissionMask } from "./permission-bitmap";

export interface RoleRecord {
  id: string;
  key: string;
  name: string;
  description: string;
  allowBits: string;
  memberCount: number;
  status: "active" | "disabled";
  isSystem: boolean;
}

type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  allow_bits: string;
  member_count: number;
  status: RoleRecord["status"];
  is_system: number;
};

export class RolesRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<{ items: RoleRecord[] }> {
    const rows = await this.db.prepare(
      `SELECT r.id, r.key, r.name, r.description, r.allow_bits,
              COUNT(rm.member_id) AS member_count, r.status, r.is_system
       FROM roles AS r
       LEFT JOIN role_members AS rm ON rm.role_id = r.id
       GROUP BY r.id
       ORDER BY r.is_system DESC, r.key ASC
       LIMIT 50`,
    ).all<RoleRow>();
    return { items: rows.results.map(mapRole) };
  }

  async update(id: string, input: { name?: string; description?: string; allowBits: string }): Promise<RoleRecord> {
    const current = await this.find(id);
    if (!current) throw new AppError("ROLE_NOT_FOUND", "Role not found", 404);
    if (current.isSystem) throw new AppError("ROLE_SYSTEM_IMMUTABLE", "System roles cannot be changed", 409);
    const mask = serializePermissionMask(parsePermissionMask(input.allowBits));
    const name = input.name === undefined ? current.name : boundedText(input.name, "ROLE_NAME_INVALID");
    const description = input.description === undefined ? current.description : boundedText(input.description, "ROLE_DESCRIPTION_INVALID");
    const result = await this.db.prepare(
      "UPDATE roles SET name = ?, description = ?, allow_bits = ?, updated_at = ? WHERE id = ? AND is_system = 0",
    ).bind(name, description, mask, new Date().toISOString(), id).run();
    if (result.meta.changes !== 1) throw new AppError("ROLE_UPDATE_CONFLICT", "Role update conflict", 409);
    return (await this.find(id))!;
  }

  async create(input: { key: string; name: string; description?: string; allowBits: string }): Promise<RoleRecord> {
    const key = boundedKey(input.key);
    const name = boundedText(input.name, "ROLE_NAME_INVALID");
    const description = input.description === undefined ? "" : boundedText(input.description, "ROLE_DESCRIPTION_INVALID");
    const allowBits = serializePermissionMask(parsePermissionMask(input.allowBits));
    const id = `role-${crypto.randomUUID()}`;
    try {
      await this.db.prepare(
        "INSERT INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?)",
      ).bind(id, key, name, description, allowBits, new Date().toISOString(), new Date().toISOString()).run();
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: roles\.key/iu.test(error.message)) throw new AppError("ROLE_KEY_DUPLICATE", "Role key is already in use", 409);
      throw error;
    }
    return (await this.find(id))!;
  }

  async remove(id: string): Promise<RoleRecord> {
    const current = await this.find(id);
    if (!current) throw new AppError("ROLE_NOT_FOUND", "Role not found", 404);
    if (current.isSystem) throw new AppError("ROLE_SYSTEM_IMMUTABLE", "System roles cannot be changed", 409);
    if (current.memberCount > 0) throw new AppError("ROLE_ASSIGNED", "Role is assigned to members", 409);
    await this.db.prepare("DELETE FROM roles WHERE id = ? AND is_system = 0").bind(id).run();
    return current;
  }

  async find(id: string): Promise<RoleRecord | null> {
    const row = await this.db.prepare(
      `SELECT r.id, r.key, r.name, r.description, r.allow_bits,
              COUNT(rm.member_id) AS member_count, r.status, r.is_system
       FROM roles AS r
       LEFT JOIN role_members AS rm ON rm.role_id = r.id
       WHERE r.id = ?
       GROUP BY r.id`,
    ).bind(id).first<RoleRow>();
    return row ? mapRole(row) : null;
  }
}

function mapRole(row: RoleRow): RoleRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    allowBits: serializePermissionMask(parsePermissionMask(row.allow_bits)),
    memberCount: Number(row.member_count) || 0,
    status: row.status,
    isSystem: row.is_system === 1,
  };
}

function boundedText(value: string, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || [...value].length > 200 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new AppError(code, "Role text is invalid", 400);
  }
  return value.trim();
}

function boundedKey(value: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/u.test(value)) throw new AppError("ROLE_KEY_INVALID", "Role key is invalid", 400);
  return value;
}
