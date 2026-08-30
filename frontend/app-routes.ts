import { routeCapability, type WorkspacePageKind } from "../shared/workspace-route-capabilities";

export type PageKind = WorkspacePageKind | "knowledge-reader" | "message-thread" | "admin-submission-detail" | "not-found";

export function pageKindForPath(pathname: string): PageKind {
  if (/^\/knowledge\/[A-Za-z0-9_-]+$/u.test(pathname)) return "knowledge-reader";
  if (/^\/messages\/[A-Za-z0-9_-]{1,128}$/u.test(pathname)) return "message-thread";
  if (/^\/admin\/submissions\/[A-Za-z0-9_-]+$/u.test(pathname)) return "admin-submission-detail";
  return routeCapability(pathname)?.pageKind ?? "not-found";
}
