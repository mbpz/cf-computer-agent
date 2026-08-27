import { AppError } from "../http";
import { buildMenuTree, type MenuNode, type MenuRow } from "./menu-tree";
import { parsePermissionMask, serializePermissionMask } from "./permission-bitmap";

export interface MenuRecord extends MenuRow {
  status: "active" | "disabled";
  visible: boolean;
  isSystem: boolean;
}

type MenuDbRow = {
  id: string;
  parent_id: string | null;
  key: string;
  label_key: string;
  path: string | null;
  icon: string | null;
  group_name: string;
  position: number;
  required_bits: string;
  status: "active" | "disabled";
  visible: number;
  is_system: number;
};

export interface MenuUpdateInput {
  parentId?: string | null;
  labelKey?: string;
  path?: string | null;
  position?: number;
  requiredBits?: string;
  status?: "active" | "disabled";
  visible?: boolean;
}

const LABEL_KEYS = new Set([
  "SHELL_GROUP_WORKSPACE", "SHELL_GROUP_ADMIN", "NAV_HOME", "NAV_SUBMIT", "NAV_KNOWLEDGE_BASE", "NAV_SEARCH", "NAV_AGENT", "NAV_MY_SUBMISSIONS",
  "NAV_ADMINISTRATION", "NAV_REVIEW_QUEUE", "NAV_DUPLICATES", "NAV_ASSET_QUEUE", "NAV_MEMBERS", "NAV_ROLES", "NAV_MENUS", "NAV_SPACES", "NAV_SITE_ANALYTICS", "NAV_AUDIT",
]);

export class MenusRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<{ items: MenuRecord[]; tree: MenuNode[] }> {
    const rows = await this.db.prepare(
      `SELECT id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system
       FROM menus ORDER BY position ASC, key ASC LIMIT 200`,
    ).all<MenuDbRow>();
    const items = rows.results.map(mapMenu);
    let tree: MenuNode[];
    try {
      tree = buildMenuTree(items, (1n << 64n) - 1n);
    } catch {
      throw new AppError("MENU_CONFIGURATION_INVALID", "Menu configuration is invalid", 500, true);
    }
    return { items, tree };
  }

  async find(id: string): Promise<MenuRecord | null> {
    const row = await this.db.prepare(
      `SELECT id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system
       FROM menus WHERE id = ?`,
    ).bind(id).first<MenuDbRow>();
    return row ? mapMenu(row) : null;
  }

  async update(id: string, input: MenuUpdateInput): Promise<{ menu: MenuRecord; previous: MenuRecord }> {
    const current = await this.find(id);
    if (!current) throw new AppError("MENU_NOT_FOUND", "Menu not found", 404);
    if (current.isSystem) throw new AppError("MENU_SYSTEM_IMMUTABLE", "System menus cannot be changed", 409);
    const next: MenuRecord = {
      ...current,
      parentId: input.parentId === undefined ? current.parentId : input.parentId,
      labelKey: input.labelKey === undefined ? current.labelKey : input.labelKey,
      path: input.path === undefined ? current.path : input.path,
      position: input.position === undefined ? current.position : input.position,
      requiredBits: input.requiredBits === undefined ? current.requiredBits : serializePermissionMask(parsePermissionMask(input.requiredBits)),
      status: input.status === undefined ? current.status : input.status,
      visible: input.visible === undefined ? current.visible : input.visible,
    };
    validateMenu(next);
    const all = (await this.list()).items.map((item) => item.id === id ? next : item);
    try { buildMenuTree(all, (1n << 64n) - 1n); } catch (error) {
      const message = error instanceof Error ? error.message : "MENU_TREE_INVALID";
      throw new AppError(message, "Menu tree is invalid", 400);
    }
    try {
      await this.db.prepare(
        `UPDATE menus SET parent_id = ?, label_key = ?, path = ?, position = ?, required_bits = ?, status = ?, visible = ?, updated_at = ? WHERE id = ? AND is_system = 0`,
      ).bind(next.parentId, next.labelKey, next.path, next.position, next.requiredBits, next.status, next.visible ? 1 : 0, new Date().toISOString(), id).run();
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed.*menus\.path/iu.test(error.message)) throw new AppError("MENU_PATH_DUPLICATE", "Menu path is already in use", 400);
      throw error;
    }
    return { menu: (await this.find(id))!, previous: current };
  }
}

function mapMenu(row: MenuDbRow): MenuRecord {
  return {
    id: row.id, parentId: row.parent_id, key: row.key, labelKey: row.label_key, path: row.path,
    icon: row.icon, groupName: row.group_name, position: Number(row.position), requiredBits: serializePermissionMask(parsePermissionMask(row.required_bits)),
    status: row.status, visible: row.visible === 1, isSystem: row.is_system === 1,
  };
}

function validateMenu(menu: MenuRecord): void {
  if (menu.parentId !== null && (!menu.parentId || menu.parentId === menu.id)) throw new AppError("MENU_PARENT_INVALID", "Menu parent is invalid", 400);
  if (!LABEL_KEYS.has(menu.labelKey)) throw new AppError("MENU_LABEL_KEY_INVALID", "Menu label key is invalid", 400);
  if (menu.path !== null && (!/^\/[A-Za-z0-9_\-/:.]*$/u.test(menu.path) || menu.path.length > 200)) throw new AppError("MENU_PATH_INVALID", "Menu path is invalid", 400);
  if (!Number.isSafeInteger(menu.position) || menu.position < 0 || menu.position > 10000) throw new AppError("MENU_POSITION_INVALID", "Menu position is invalid", 400);
  if (menu.status !== "active" && menu.status !== "disabled") throw new AppError("MENU_STATUS_INVALID", "Menu status is invalid", 400);
  if (typeof menu.visible !== "boolean") throw new AppError("MENU_VISIBLE_INVALID", "Menu visibility is invalid", 400);
}
