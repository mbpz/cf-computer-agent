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

export function normalizeAdminMenu(value: unknown): AdminMenu | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || typeof row.key !== "string" || !row.key || typeof row.labelKey !== "string" || !row.labelKey) return null;
  if (row.parentId !== null && typeof row.parentId !== "string") return null;
  if (row.path !== null && typeof row.path !== "string") return null;
  if (typeof row.position !== "number" || !Number.isSafeInteger(row.position) || row.position < 0) return null;
  if (typeof row.requiredBits !== "string" || !/^0x[0-9a-f]+$/iu.test(row.requiredBits)) return null;
  if (row.status !== "active" && row.status !== "disabled") return null;
  if (typeof row.visible !== "boolean" || typeof row.isSystem !== "boolean") return null;
  const children = Array.isArray(row.children) ? row.children.map(normalizeAdminMenu).filter((item): item is AdminMenu => item !== null) : [];
  return { id: row.id, parentId: row.parentId as string | null, key: row.key, labelKey: row.labelKey, path: row.path as string | null, icon: typeof row.icon === "string" ? row.icon : null, groupName: typeof row.groupName === "string" ? row.groupName : "workspace", position: row.position, requiredBits: row.requiredBits.toLowerCase(), status: row.status, visible: row.visible, isSystem: row.isSystem, children };
}

export async function loadAdminMenus(requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminMenu[]> {
  const data = await apiFetch<{ tree?: unknown[] }>("/api/admin/menus", { requester, signal });
  return Array.isArray(data.tree) ? data.tree.map(normalizeAdminMenu).filter((item): item is AdminMenu => item !== null) : [];
}

export async function updateAdminMenu(id: string, input: { position?: number; status?: "active" | "disabled"; visible?: boolean }, requester: Fetcher = fetch): Promise<AdminMenu> {
  const data = await apiFetch<{ menu?: unknown }>(`/api/admin/menus/${encodeURIComponent(id)}`, { requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const menu = normalizeAdminMenu(data.menu);
  if (!menu) throw new Error("MENU_RESPONSE_INVALID");
  return menu;
}
