import { WORKSPACE_ROUTE_CAPABILITIES, type WorkspaceCapability } from "../../shared/workspace-route-capabilities";

export type FrontendCapability = WorkspaceCapability;

export interface RouteDefinition {
  path: string;
  labelKey: string;
  group: "workspace" | "admin";
  capability: FrontendCapability | null;
}

export const ROUTES: readonly RouteDefinition[] = WORKSPACE_ROUTE_CAPABILITIES;

export function requiredCapability(pathname: string): FrontendCapability | null {
  return ROUTES.find((route) => route.path === pathname)?.capability ?? null;
}
