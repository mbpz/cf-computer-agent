export const MENU_LABEL_KEYS = [
  "SHELL_GROUP_WORKSPACE", "SHELL_GROUP_ADMIN", "SHELL_GROUP_GOVERNANCE", "NAV_HOME", "NAV_SUBMIT", "NAV_KNOWLEDGE_BASE", "NAV_KNOWLEDGE_SEARCH", "NAV_KNOWLEDGE_AGENT", "NAV_SEARCH", "NAV_AGENT", "NAV_MY_SUBMISSIONS", "NAV_GRAPH",
  "NAV_ADMINISTRATION", "NAV_REVIEW_QUEUE", "NAV_DUPLICATES", "NAV_ASSET_QUEUE", "NAV_MEMBERS", "NAV_ROLES", "NAV_MENUS", "NAV_SPACES", "NAV_SITE_ANALYTICS", "NAV_AUDIT",
] as const;

export interface MenuSnapshot {
  parentId: string | null;
  labelKey: string;
  path: string | null;
  position: number;
  requiredBits: string;
  status: "active" | "disabled";
  visible: boolean;
}
export function menuSnapshot(menu: MenuSnapshot): MenuSnapshot {
  return { parentId: menu.parentId, labelKey: menu.labelKey, path: menu.path, position: menu.position, requiredBits: menu.requiredBits, status: menu.status, visible: menu.visible };
}
