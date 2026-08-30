import { apiFetch } from "./api";
import type { SessionSnapshot } from "../contracts/api";
import { WORKSPACE_ROUTE_CAPABILITIES, menuAvailability, type MenuAvailability, type WorkspaceRouteCapability } from "../../shared/workspace-route-capabilities";
import { PERMISSION_BITS, hasPermission, parsePermissionMask } from "../../src/authorization/permission-bitmap";

export interface NavigationDataNode {
  id: string;
  key: string;
  labelKey: string;
  path: string | null;
  icon: string | null;
  groupName: "workspace" | "admin";
  availability: MenuAvailability;
  disabledReason?: "not_implemented";
  children: NavigationDataNode[];
}

export async function loadNavigation(): Promise<NavigationDataNode[]> {
  const payload = await apiFetch<unknown>("/api/navigation");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("NAVIGATION_INVALID");
  const tree = (payload as Record<string, unknown>).tree;
  if (!Array.isArray(tree)) throw new Error("NAVIGATION_INVALID");
  return tree.map((node) => parseNode(node, 1));
}

const REQUIRED_COLLABORATION_ROUTE_IDS = new Set(["tasks", "boards", "notifications", "messages"]);
const REQUIRED_COLLABORATION_PATHS: ReadonlySet<string> = new Set(
  WORKSPACE_ROUTE_CAPABILITIES.filter((route) => REQUIRED_COLLABORATION_ROUTE_IDS.has(route.id)).map((route) => route.path),
);

export function mergeRequiredWorkspaceNavigation(serverTree: readonly NavigationDataNode[], session: SessionSnapshot): NavigationDataNode[] {
  const tree = serverTree.map(withoutSettings);
  const requiredRoutes = WORKSPACE_ROUTE_CAPABILITIES.filter((route) => REQUIRED_COLLABORATION_ROUTE_IDS.has(route.id) && routeAllowedForSession(route, session));
  const workspaceIndex = tree.findIndex((node) => node.groupName === "workspace" && node.path === null);
  const workspace = workspaceIndex === -1 ? emptyWorkspaceNode() : tree[workspaceIndex]!;
  const existingByPath = new Map(workspace.children.map((node) => [node.path, node]));
  const nonCollaboration = workspace.children.filter((node) => !REQUIRED_COLLABORATION_ROUTE_IDS.has(node.key) && !REQUIRED_COLLABORATION_PATHS.has(node.path ?? ""));
  const children = [
    ...nonCollaboration,
    ...requiredRoutes.map((route) => requiredNavigationNode(route, existingByPath.get(route.path))),
  ];
  const mergedWorkspace = { ...workspace, children };
  return workspaceIndex === -1 ? [mergedWorkspace, ...tree] : tree.map((node, index) => index === workspaceIndex ? mergedWorkspace : node);
}

function withoutSettings(node: NavigationDataNode): NavigationDataNode {
  return {
    ...node,
    children: node.children.filter((child) => child.path !== "/settings" && child.key !== "settings").map(withoutSettings),
  };
}

function routeAllowedForSession(route: WorkspaceRouteCapability, session: SessionSnapshot): boolean {
  if (route.capability !== null && !session.capabilities.includes(route.capability)) return false;
  if (route.requiredPermission === undefined) return true;
  if (!session.permissionMask) return false;
  try {
    return hasPermission(parsePermissionMask(session.permissionMask), PERMISSION_BITS[route.requiredPermission]);
  } catch {
    return false;
  }
}

function requiredNavigationNode(route: WorkspaceRouteCapability, existing?: NavigationDataNode): NavigationDataNode {
  return {
    id: existing?.id ?? route.id,
    key: route.id,
    labelKey: route.labelKey,
    path: route.path,
    icon: existing?.icon ?? null,
    groupName: "workspace",
    ...menuAvailability(route.path)!,
    children: existing?.children ?? [],
  };
}

function emptyWorkspaceNode(): NavigationDataNode {
  return {
    id: "workspace",
    key: "workspace",
    labelKey: "SHELL_GROUP_WORKSPACE",
    path: null,
    icon: null,
    groupName: "workspace",
    availability: "ready",
    children: [],
  };
}

function parseNode(value: unknown, depth: number): NavigationDataNode {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 4) throw new Error("NAVIGATION_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id
    || typeof record.key !== "string" || !record.key
    || typeof record.labelKey !== "string" || !record.labelKey
    || (record.path !== null && (typeof record.path !== "string" || !record.path.startsWith("/")))
    || (record.icon !== null && typeof record.icon !== "string")
    || (record.groupName !== "workspace" && record.groupName !== "admin")
    || (record.availability !== "ready" && record.availability !== "coming_soon")
    || (record.disabledReason !== undefined && record.disabledReason !== "not_implemented")
    || !Array.isArray(record.children)) throw new Error("NAVIGATION_INVALID");
  return {
    id: record.id,
    key: record.key,
    labelKey: record.labelKey,
    path: record.path as string | null,
    icon: record.icon as string | null,
    groupName: record.groupName,
    availability: record.availability,
    ...(record.disabledReason === "not_implemented" ? { disabledReason: record.disabledReason } : {}),
    children: (record.children as unknown[]).map((child) => parseNode(child, depth + 1)),
  };
}
