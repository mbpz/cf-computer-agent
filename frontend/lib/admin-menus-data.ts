import type { MenuSnapshot } from "../../shared/admin-menu-fields";
import { apiFetch, type Fetcher } from "./api";

export interface AdminMenu {
  id: string;
  parentId: string | null;
  key: string;
  labelKey: string;
  path: string | null;
  icon: string | null;
  groupName: string;
  position: number;
  requiredBits: string;
  status: "active" | "disabled";
  visible: boolean;
  isSystem: boolean;
  children: AdminMenu[];
}

export function normalizeAdminMenu(value: unknown, depth = 1): AdminMenu | null {
  if (depth > 4 || !value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || typeof row.key !== "string" || !row.key || typeof row.labelKey !== "string" || !row.labelKey) return null;
  if (row.parentId !== null && typeof row.parentId !== "string") return null;
  if (row.path !== null && typeof row.path !== "string") return null;
  if (typeof row.position !== "number" || !Number.isSafeInteger(row.position) || row.position < 0 || row.position > 10000) return null;
  if (typeof row.requiredBits !== "string" || !/^0x[0-9a-f]+$/iu.test(row.requiredBits)) return null;
  if (BigInt(row.requiredBits) > 0xffffffffffffffffn) return null;
  if (row.status !== "active" && row.status !== "disabled") return null;
  if (typeof row.visible !== "boolean" || typeof row.isSystem !== "boolean") return null;
  if (row.children !== undefined && !Array.isArray(row.children)) return null;
  if (row.groupName !== "workspace" && row.groupName !== "admin") return null;
  if (row.icon !== null && typeof row.icon !== "string") return null;
  const children = row.children === undefined ? [] : (row.children as unknown[]).map(child => normalizeAdminMenu(child, depth + 1));
  if (children.some(item => item === null)) return null;
  return { id: row.id, parentId: row.parentId as string | null, key: row.key, labelKey: row.labelKey, path: row.path as string | null, icon: typeof row.icon === "string" ? row.icon : null, groupName: typeof row.groupName === "string" ? row.groupName : "workspace", position: row.position, requiredBits: row.requiredBits.toLowerCase(), status: row.status, visible: row.visible, isSystem: row.isSystem, children: children as AdminMenu[] };
}

export async function loadAdminMenus(requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminMenu[]> {
  const data = await apiFetch<{ tree?: unknown[] }>("/api/admin/menus", { requester, signal });
  if (!Array.isArray(data.tree)) throw new Error("MENU_RESPONSE_INVALID");
  const ids = new Set<string>();
  const keys = new Set<string>();
  const paths = new Set<string>();
  const parse = (values: unknown[], parentId: string | null, depth: number): AdminMenu[] => values.map(value => {
    const node = normalizeAdminMenu(value, depth);
    if (!node || depth > 4 || node.parentId !== parentId || ids.has(node.id) || keys.has(node.key) || (node.path !== null && paths.has(node.path)) || !Array.isArray((value as Record<string, unknown>).children)) throw new Error("MENU_RESPONSE_INVALID");
    ids.add(node.id); keys.add(node.key); if (node.path !== null) paths.add(node.path);
    if (ids.size > 200) throw new Error("MENU_RESPONSE_INVALID");
    return { ...node, children: parse((value as { children: unknown[] }).children, node.id, depth + 1) };
  });
  return parse(data.tree, null, 1);
}

export type AdminMenuUpdate = Partial<MenuSnapshot> & { expected?: MenuSnapshot };
export type AdminMenuCreate = Pick<AdminMenu, "key" | "labelKey" | "path" | "parentId" | "icon" | "position" | "requiredBits"> & { groupName: "workspace" | "admin" };

export async function updateAdminMenu(id: string, input: AdminMenuUpdate, requester: Fetcher = fetch): Promise<AdminMenu> {
  const data = await apiFetch<{ menu?: unknown }>(`/api/admin/menus/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const menu = normalizeAdminMenu(data.menu);
  if (!menu || menu.id !== id || !matchesMenu(menu, input)) throw new Error("MENU_RESPONSE_INVALID");
  return menu;
}

export async function deleteAdminMenu(id: string, requester: Fetcher = fetch): Promise<void> {
  const data = await apiFetch<{ menu?: unknown }>(`/api/admin/menus/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
  const menu = normalizeAdminMenu(data.menu);
  if (!menu || menu.id !== id) throw new Error("MENU_RESPONSE_INVALID");
}

function matchesMenu(menu: AdminMenu, input: AdminMenuUpdate | AdminMenuCreate): boolean {
  return Object.entries(input).every(([key, value]) => key === "expected" || (key === "requiredBits" ? BigInt(menu.requiredBits) === BigInt(value as string) : menu[key as keyof AdminMenu] === value));
}
export async function createAdminMenu(input: AdminMenuCreate, requester: Fetcher = fetch): Promise<AdminMenu> {
  const data = await apiFetch<{ menu?: unknown }>("/api/admin/menus", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const menu = normalizeAdminMenu(data.menu);
  if (!menu || menu.isSystem || menu.status !== "active" || !menu.visible || !matchesMenu(menu, input)) throw new Error("MENU_RESPONSE_INVALID");
  return menu;
}
