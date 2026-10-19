import { routeCapability, type WorkspacePageKind } from "../shared/workspace-route-capabilities";

export type PageKind = WorkspacePageKind | "knowledge-reader" | "message-thread" | "project-timeline" | "admin-submission-detail" | "admin-review-batch" | "admin-knowledge-item" | "not-found";

export function pageKindForPath(pathname: string): PageKind {
  if (/^\/knowledge\/[A-Za-z0-9_-]+$/u.test(pathname)) return "knowledge-reader";
  if (/^\/messages\/[A-Za-z0-9_-]{1,128}$/u.test(pathname)) return "message-thread";
  if (/^\/projects\/[A-Za-z0-9_-]{1,128}\/timeline$/u.test(pathname)) return "project-timeline";
  // The batch surface is a fixed sub-path and must win over the submission detail pattern.
  if (pathname === "/admin/submissions/batch") return "admin-review-batch";
  if (/^\/admin\/submissions\/[A-Za-z0-9_-]+$/u.test(pathname)) return "admin-submission-detail";
  // The recycle bin is a fixed path and must win over the item detail pattern.
  if (pathname === "/admin/knowledge/trash") return "admin-knowledge-trash";
  if (/^\/admin\/knowledge\/[A-Za-z0-9_-]+$/u.test(pathname)) return "admin-knowledge-item";
  if (pathname === "/admin/roles/new") return "admin-role-new";
  if (/^\/admin\/roles\/[A-Za-z0-9_-]+$/u.test(pathname)) return "admin-role-detail";
  return routeCapability(pathname)?.pageKind ?? "not-found";
}
