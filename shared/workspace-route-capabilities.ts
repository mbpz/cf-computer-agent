import type { PermissionKey } from "../src/authorization/permission-bitmap";

export type MenuAvailability = "ready" | "coming_soon";

export type WorkspacePageKind =
  | "home" | "knowledge" | "search" | "agent" | "submit" | "my-submissions"
  | "tasks" | "boards" | "notifications" | "messages" | "settings" | "admin" | "admin-submissions" | "admin-duplicates"
  | "admin-assets" | "admin-members" | "admin-roles" | "admin-menus"
  | "admin-spaces" | "admin-audit" | "admin-analytics" | "coming-soon";

export type WorkspaceRouteGroup = "workspace" | "admin";

export type WorkspaceCapability =
  | "submission:create" | "submission:read-own" | "submission:read-all"
  | "knowledge:read" | "knowledge:review" | "member:manage" | "space:manage"
  | "audit:read" | "analytics:read" | "role:manage" | "menu:manage";

export interface WorkspaceRouteCapability {
  id: string;
  path: string;
  pageKind: WorkspacePageKind;
  availability: MenuAvailability;
  labelKey: string;
  group: WorkspaceRouteGroup;
  capability: WorkspaceCapability | null;
  requiredPermission?: PermissionKey;
}

export const WORKSPACE_ROUTE_CAPABILITIES = Object.freeze([
  { id: "home", path: "/", pageKind: "home", availability: "ready", labelKey: "NAV_HOME", group: "workspace", capability: null },
  { id: "submit", path: "/submit", pageKind: "submit", availability: "ready", labelKey: "NAV_SUBMIT", group: "workspace", capability: "submission:create" },
  { id: "knowledge", path: "/knowledge", pageKind: "knowledge", availability: "ready", labelKey: "NAV_KNOWLEDGE_BASE", group: "workspace", capability: "knowledge:read" },
  { id: "search", path: "/search", pageKind: "search", availability: "ready", labelKey: "NAV_SEARCH", group: "workspace", capability: "knowledge:read" },
  { id: "agent", path: "/agent", pageKind: "agent", availability: "ready", labelKey: "NAV_AGENT", group: "workspace", capability: "knowledge:read" },
  { id: "my-submissions", path: "/my-submissions", pageKind: "my-submissions", availability: "ready", labelKey: "NAV_MY_SUBMISSIONS", group: "workspace", capability: "submission:read-own" },
  { id: "tasks", path: "/tasks", pageKind: "tasks", availability: "ready", labelKey: "NAV_TASKS", group: "workspace", capability: null, requiredPermission: "workspace.tasks" },
  { id: "boards", path: "/boards", pageKind: "boards", availability: "ready", labelKey: "NAV_BOARDS", group: "workspace", capability: null, requiredPermission: "workspace.tasks" },
  { id: "settings", path: "/settings", pageKind: "settings", availability: "ready", labelKey: "SHELL_SETTINGS", group: "workspace", capability: null },
  { id: "admin", path: "/admin", pageKind: "admin", availability: "ready", labelKey: "NAV_ADMINISTRATION", group: "admin", capability: "submission:read-all" },
  { id: "admin-submissions", path: "/admin/submissions", pageKind: "admin-submissions", availability: "ready", labelKey: "NAV_REVIEW_QUEUE", group: "admin", capability: "knowledge:review" },
  { id: "admin-duplicates", path: "/admin/duplicates", pageKind: "admin-duplicates", availability: "ready", labelKey: "NAV_DUPLICATES", group: "admin", capability: "submission:read-all" },
  { id: "admin-assets", path: "/admin/assets", pageKind: "admin-assets", availability: "ready", labelKey: "NAV_ASSET_QUEUE", group: "admin", capability: "submission:read-all" },
  { id: "admin-members", path: "/admin/members", pageKind: "admin-members", availability: "ready", labelKey: "NAV_MEMBERS", group: "admin", capability: "member:manage" },
  { id: "admin-roles", path: "/admin/roles", pageKind: "admin-roles", availability: "ready", labelKey: "NAV_ROLES", group: "admin", capability: "role:manage" },
  { id: "admin-menus", path: "/admin/menus", pageKind: "admin-menus", availability: "ready", labelKey: "NAV_MENUS", group: "admin", capability: "menu:manage" },
  { id: "admin-spaces", path: "/admin/spaces", pageKind: "admin-spaces", availability: "ready", labelKey: "NAV_SPACES", group: "admin", capability: "space:manage" },
  { id: "admin-audit", path: "/admin/audit", pageKind: "admin-audit", availability: "ready", labelKey: "NAV_AUDIT", group: "admin", capability: "audit:read" },
  { id: "admin-analytics", path: "/admin/analytics", pageKind: "admin-analytics", availability: "ready", labelKey: "NAV_SITE_ANALYTICS", group: "admin", capability: "analytics:read" },
  { id: "notifications", path: "/notifications", pageKind: "notifications", availability: "ready", labelKey: "NAV_NOTIFICATIONS", group: "workspace", capability: null },
  { id: "messages", path: "/messages", pageKind: "messages", availability: "ready", labelKey: "NAV_MESSAGES", group: "workspace", capability: null },
] as const satisfies readonly WorkspaceRouteCapability[]);

export function routeCapability(pathname: string): WorkspaceRouteCapability | undefined {
  return WORKSPACE_ROUTE_CAPABILITIES.find((route) => route.path === pathname);
}

export function menuAvailability(pathname: string | null): { availability: MenuAvailability; disabledReason?: "not_implemented" } | undefined {
  if (pathname === null) return { availability: "ready" };
  const availability = routeCapability(pathname)?.availability;
  if (!availability) return undefined;
  return availability === "ready" ? { availability } : { availability, disabledReason: "not_implemented" };
}
