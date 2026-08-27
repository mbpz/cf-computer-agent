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
