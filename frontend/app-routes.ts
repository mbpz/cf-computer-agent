export type PageKind = "home" | "knowledge" | "knowledge-reader" | "search" | "agent" | "submit" | "my-submissions" | "admin" | "admin-submissions" | "admin-submission-detail" | "admin-assets" | "admin-members" | "admin-spaces" | "admin-audit" | "not-found";

export function pageKindForPath(pathname: string): PageKind {
  if (pathname === "/") return "home";
  if (pathname === "/knowledge") return "knowledge";
  if (/^\/knowledge\/[A-Za-z0-9_-]+$/u.test(pathname)) return "knowledge-reader";
  if (pathname === "/search") return "search";
  if (pathname === "/agent") return "agent";
  if (pathname === "/submit") return "submit";
  if (pathname === "/my-submissions") return "my-submissions";
  if (pathname === "/admin") return "admin";
  if (pathname === "/admin/submissions") return "admin-submissions";
  if (/^\/admin\/submissions\/[A-Za-z0-9_-]+$/u.test(pathname)) return "admin-submission-detail";
  if (pathname === "/admin/assets") return "admin-assets";
  if (pathname === "/admin/members") return "admin-members";
  if (pathname === "/admin/spaces") return "admin-spaces";
  if (pathname === "/admin/audit") return "admin-audit";
  return "not-found";
}
