import { parsePermissionMask } from "./permission-bitmap";

export interface MenuRow {
  id: string;
  parentId: string | null;
  key: string;
  labelKey: string;
  path: string | null;
  icon: string | null;
  groupName: string;
  position: number;
  requiredBits: string;
  status: string;
  visible: number | boolean;
  isSystem: number | boolean;
}

export interface MenuNode {
  id: string;
  key: string;
  labelKey: string;
  path: string | null;
  icon: string | null;
  groupName: string;
  position: number;
  requiredBits: string;
  children: readonly MenuNode[];
}

const MAX_DEPTH = 4;

export function buildMenuTree(rows: readonly MenuRow[], permissionMask: bigint): MenuNode[] {
  if (!Array.isArray(rows)) throw new TypeError("MENU_ROWS_INVALID");
  if (typeof permissionMask !== "bigint" || permissionMask < 0n || permissionMask > ((1n << 64n) - 1n)) {
    throw new Error("PERMISSION_MASK_INVALID");
  }
  const byId = new Map<string, MenuRow>();
  const paths = new Set<string>();

  // Validate every scalar and mask before checking parent relationships so a
  // malformed row cannot be hidden behind an unrelated orphan error.
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id || byId.has(row.id)) throw new Error("MENU_ID_DUPLICATE");
    if (typeof row.key !== "string" || !row.key || typeof row.labelKey !== "string" || !row.labelKey) throw new Error("MENU_ROW_INVALID");
    if (row.path !== null && (typeof row.path !== "string" || !row.path)) throw new Error("MENU_ROW_INVALID");
    if (row.path !== null) {
      if (paths.has(row.path)) throw new Error("MENU_PATH_DUPLICATE");
      paths.add(row.path);
    }
    if (!Number.isSafeInteger(row.position) || row.position < 0) throw new Error("MENU_POSITION_INVALID");
    parsePermissionMask(row.requiredBits);
    byId.set(row.id, row);
  }

  for (const row of rows) {
    if (row.parentId !== null && !byId.has(row.parentId)) throw new Error("MENU_PARENT_NOT_FOUND");
  }

  const states = new Map<string, "visiting" | "visited">();
  const depths = new Map<string, number>();
  const visit = (id: string, depth: number): void => {
    const state = states.get(id);
    if (state === "visiting") throw new Error("MENU_TREE_CYCLE");
    if (state === "visited") return;
    if (depth > MAX_DEPTH) throw new Error("MENU_TREE_DEPTH");
    states.set(id, "visiting");
    depths.set(id, depth);
    const row = byId.get(id)!;
    for (const child of rows) if (child.parentId === row.id) visit(child.id, depth + 1);
    states.set(id, "visited");
  };
  for (const row of rows) if (row.parentId === null) visit(row.id, 1);
  // Every row has an existing parent or is a root, so this guards malformed
  // input if the validation above is changed in the future.
  for (const row of rows) if (!depths.has(row.id)) throw new Error("MENU_TREE_CYCLE");

  const childrenByParent = new Map<string | null, MenuRow[]>();
  for (const row of rows) {
    const siblings = childrenByParent.get(row.parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(row.parentId, siblings);
  }
  const sortRows = (left: MenuRow, right: MenuRow) => left.position - right.position || left.key.localeCompare(right.key);
  for (const siblings of childrenByParent.values()) siblings.sort(sortRows);

  const include = (row: MenuRow): MenuNode | null => {
    const required = parsePermissionMask(row.requiredBits);
    const active = row.status === "active" && (row.visible === true || row.visible === 1);
    if (!active || (permissionMask & required) !== required) return null;
    const children = (childrenByParent.get(row.id) ?? []).flatMap((child) => {
      const node = include(child);
      return node ? [node] : [];
    });
    if (row.path === null && children.length === 0) return null;
    return {
      id: row.id,
      key: row.key,
      labelKey: row.labelKey,
      path: row.path,
      icon: row.icon,
      groupName: row.groupName,
      position: row.position,
      requiredBits: row.requiredBits,
      children,
    };
  };

  return (childrenByParent.get(null) ?? []).flatMap((row) => {
    const node = include(row);
    return node ? [node] : [];
  });
}
