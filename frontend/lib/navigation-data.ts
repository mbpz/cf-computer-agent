import { apiFetch } from "./api";
import type { MenuAvailability } from "../../shared/workspace-route-capabilities";

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
