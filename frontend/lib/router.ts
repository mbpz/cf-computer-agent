import { ROUTES, type FrontendCapability, type RouteDefinition } from "../contracts/routes";

export interface RouteMatch {
  path: string;
  labelKey: string;
  group: RouteDefinition["group"];
  capability: FrontendCapability | null;
  params: Readonly<Record<string, string>>;
}

const PARAMETERIZED_ROUTES = Object.freeze([
  { prefix: "/knowledge/", path: "/knowledge/:id", labelKey: "NAV_LIBRARY", group: "workspace" as const, capability: "knowledge:read" as const },
  { prefix: "/admin/submissions/", path: "/admin/submissions/:id", labelKey: "NAV_REVIEW_QUEUE", group: "admin" as const, capability: "knowledge:review" as const },
]);

export function matchRoute(pathname: string): RouteMatch | null {
  const exact = ROUTES.find((route) => route.path === pathname);
  if (exact) return { ...exact, params: {} };
  const parameterized = PARAMETERIZED_ROUTES.find((route) => pathname.startsWith(route.prefix));
  if (!parameterized) return null;
  const id = pathname.slice(parameterized.prefix.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(id)) return null;
  return { ...parameterized, params: { id } };
}
