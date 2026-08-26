export type FrontendCapability =
  | "submission:create"
  | "submission:read-own"
  | "submission:read-all"
  | "knowledge:read"
  | "knowledge:review"
  | "member:manage"
  | "space:manage"
  | "audit:read";

export interface RouteDefinition {
  path: string;
  labelKey: string;
  group: "workspace" | "admin";
  capability: FrontendCapability | null;
}

export const ROUTES: readonly RouteDefinition[] = Object.freeze([
  { path: "/", labelKey: "NAV_HOME", group: "workspace", capability: null },
  { path: "/submit", labelKey: "NAV_SUBMIT", group: "workspace", capability: "submission:create" },
  { path: "/knowledge", labelKey: "NAV_LIBRARY", group: "workspace", capability: "knowledge:read" },
  { path: "/search", labelKey: "NAV_SEARCH", group: "workspace", capability: "knowledge:read" },
  { path: "/agent", labelKey: "NAV_AGENT", group: "workspace", capability: "knowledge:read" },
  { path: "/my-submissions", labelKey: "NAV_MY_SUBMISSIONS", group: "workspace", capability: "submission:read-own" },
  { path: "/admin", labelKey: "NAV_ADMINISTRATION", group: "admin", capability: "submission:read-all" },
  { path: "/admin/submissions", labelKey: "NAV_REVIEW_QUEUE", group: "admin", capability: "knowledge:review" },
  { path: "/admin/duplicates", labelKey: "NAV_DUPLICATES", group: "admin", capability: "submission:read-all" },
  { path: "/admin/assets", labelKey: "NAV_ASSET_QUEUE", group: "admin", capability: "submission:read-all" },
  { path: "/admin/members", labelKey: "NAV_MEMBERS", group: "admin", capability: "member:manage" },
  { path: "/admin/spaces", labelKey: "NAV_SPACES", group: "admin", capability: "space:manage" },
  { path: "/admin/audit", labelKey: "NAV_AUDIT", group: "admin", capability: "audit:read" },
  { path: "/admin/analytics", labelKey: "NAV_ANALYTICS", group: "admin", capability: "audit:read" },
]);

export function requiredCapability(pathname: string): FrontendCapability | null {
  return ROUTES.find((route) => route.path === pathname)?.capability ?? null;
}
