import { ROUTES } from "../../contracts/routes";
import type { SessionSnapshot } from "../../contracts/api";
import { routeAccessAllowed } from "../../lib/route-access";
import { routeCapability } from "../../../shared/workspace-route-capabilities";

export const COLLABORATION_PATHS = ["/tasks", "/boards", "/notifications", "/messages"] as const;

export type CollaborationPath = (typeof COLLABORATION_PATHS)[number];

export interface CollaborationQuickLink {
  path: CollaborationPath;
  labelKey: string;
  icon: CollaborationPath;
  activePrefix: CollaborationPath;
}

export function collaborationQuickLinks(session: SessionSnapshot): CollaborationQuickLink[] {
  return COLLABORATION_PATHS.flatMap((path) => {
    const capability = routeCapability(path);
    const route = ROUTES.find((candidate) => candidate.path === path);
    if (!capability || !route || !routeAccessAllowed(session, capability)) return [];
    return [{ path, labelKey: route.labelKey, icon: path, activePrefix: path }];
  });
}

export function isCollaborationPath(path: string | undefined): path is CollaborationPath {
  return COLLABORATION_PATHS.some((candidate) => candidate === path);
}
