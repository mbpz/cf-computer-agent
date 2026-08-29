import { routeCapability, type WorkspacePageKind } from "../shared/workspace-route-capabilities";

export type PageKind = WorkspacePageKind | "knowledge-reader" | "admin-submission-detail" | "not-found";

export function pageKindForPath(pathname: string): PageKind {
  if (/^\/knowledge\/[A-Za-z0-9_-]+$/u.test(pathname)) return "knowledge-reader";
  if (/^\/admin\/submissions\/[A-Za-z0-9_-]+$/u.test(pathname)) return "admin-submission-detail";
  return routeCapability(pathname)?.pageKind ?? "not-found";
}
