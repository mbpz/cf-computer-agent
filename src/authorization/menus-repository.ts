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
export interface MenuCreateInput { key: string; labelKey: string; path?: string | null; parentId?: string | null; icon?: string | null; groupName: "workspace" | "admin"; position: number; requiredBits: string; }

const LABEL_KEYS = new Set([
  "SHELL_GROUP_WORKSPACE", "SHELL_GROUP_ADMIN", "SHELL_GROUP_GOVERNANCE", "NAV_HOME", "NAV_SUBMIT", "NAV_KNOWLEDGE_BASE", "NAV_KNOWLEDGE_SEARCH", "NAV_KNOWLEDGE_AGENT", "NAV_SEARCH", "NAV_AGENT", "NAV_MY_SUBMISSIONS",
  "NAV_ADMINISTRATION", "NAV_REVIEW_QUEUE", "NAV_DUPLICATES", "NAV_ASSET_QUEUE", "NAV_MEMBERS", "NAV_ROLES", "NAV_MENUS", "NAV_SPACES", "NAV_SITE_ANALYTICS", "NAV_AUDIT",
]);

export class MenusRepository {
  constructor(private readonly db: D1Database) {}

  async list(): Promise<{ items: MenuRecord[]; tree: MenuNode[] }> {
    const items = await this.readItems();
    return { items, tree: this.buildTree(items, (1n << 64n) - 1n) };
  }

  async navigation(permissionMask: bigint): Promise<{ tree: MenuNode[] }> {
    const items = await this.readItems();
    return { tree: this.buildTree(items, permissionMask) };
  }

  private async readItems(): Promise<MenuRecord[]> {
    const rows = await this.db.prepare(
      `SELECT id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system
       FROM menus ORDER BY position ASC, key ASC LIMIT 200`,
    ).all<MenuDbRow>();
    return rows.results.map(mapMenu);
  }

  private buildTree(items: MenuRecord[], permissionMask: bigint): MenuNode[] {
    try {
      return buildMenuTree(items, permissionMask);
    } catch {
      throw new AppError("MENU_CONFIGURATION_INVALID", "Menu configuration is invalid", 500, true);
    }
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

  async create(input: MenuCreateInput): Promise<MenuRecord> {
    const key = boundedKey(input.key);
    const now = new Date().toISOString();
    const menu: MenuRecord = { id: `menu-${crypto.randomUUID()}`, parentId: input.parentId ?? null, key, labelKey: input.labelKey, path: input.path ?? null, icon: input.icon ?? null, groupName: input.groupName, position: input.position, requiredBits: serializePermissionMask(parsePermissionMask(input.requiredBits)), status: "active", visible: true, isSystem: false };
    validateMenu(menu);
    const all = (await this.list()).items;
    if (menu.parentId !== null && !all.some((item) => item.id === menu.parentId)) throw new AppError("MENU_PARENT_NOT_FOUND", "Menu parent not found", 400);
    try {
      buildMenuTree([...all, menu], (1n << 64n) - 1n);
      await this.db.prepare("INSERT INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 0, ?, ?)").bind(menu.id, menu.parentId, menu.key, menu.labelKey, menu.path, menu.icon, menu.groupName, menu.position, menu.requiredBits, now, now).run();
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/iu.test(error.message)) throw new AppError("MENU_DUPLICATE", "Menu key or path is already in use", 409);
      throw error;
    }
    return (await this.find(menu.id))!;
  }

  async remove(id: string): Promise<MenuRecord> {
    const current = await this.find(id);
    if (!current) throw new AppError("MENU_NOT_FOUND", "Menu not found", 404);
    if (current.isSystem) throw new AppError("MENU_SYSTEM_IMMUTABLE", "System menus cannot be changed", 409);
    const children = await this.db.prepare("SELECT COUNT(*) AS count FROM menus WHERE parent_id = ?").bind(id).first<{ count: number }>();
    if (Number(children?.count) > 0) throw new AppError("MENU_HAS_CHILDREN", "Menu has child entries", 409);
    await this.db.prepare("DELETE FROM menus WHERE id = ? AND is_system = 0").bind(id).run();
    return current;
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
  if (menu.groupName !== "workspace" && menu.groupName !== "admin") throw new AppError("MENU_GROUP_INVALID", "Menu group is invalid", 400);
}

function boundedKey(value: string): string {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/u.test(value)) throw new AppError("MENU_KEY_INVALID", "Menu key is invalid", 400);
  return value;
}
