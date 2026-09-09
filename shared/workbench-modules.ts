import { WORKSPACE_ROUTE_CAPABILITIES } from "./workspace-route-capabilities";

export type WorkbenchModuleKey =
  | "workbench" | "knowledge" | "work" | "collaboration" | "assets" | "data" | "admin";

export interface WorkbenchModuleDefinition {
  key: WorkbenchModuleKey;
  labelKey: string;
  entryPath: string;
  order: number;
  adminOnly?: boolean;
}

export const WORKBENCH_MODULES: readonly WorkbenchModuleDefinition[] = Object.freeze([
  { key: "workbench", labelKey: "MODULE_WORKBENCH", entryPath: "/", order: 10 },
  { key: "knowledge", labelKey: "MODULE_KNOWLEDGE", entryPath: "/knowledge", order: 20 },
  { key: "work", labelKey: "MODULE_WORK", entryPath: "/tasks", order: 30 },
  { key: "collaboration", labelKey: "MODULE_COLLABORATION", entryPath: "/messages", order: 40 },
  { key: "assets", labelKey: "MODULE_ASSETS", entryPath: "/admin/assets", order: 50, adminOnly: true },
  { key: "data", labelKey: "MODULE_DATA", entryPath: "/admin/analytics", order: 60, adminOnly: true },
  { key: "admin", labelKey: "MODULE_ADMIN", entryPath: "/admin", order: 70, adminOnly: true },
]);

const modulesByKey = new Map(WORKBENCH_MODULES.map((module) => [module.key, module]));
const moduleByPath = new Map<string, WorkbenchModuleDefinition>();
for (const route of WORKSPACE_ROUTE_CAPABILITIES) {
  const module = modulesByKey.get(route.moduleKey);
  if (module) moduleByPath.set(route.path, module);
}

export function moduleForPath(pathname: string): WorkbenchModuleDefinition | undefined {
  return moduleByPath.get(pathname);
}
