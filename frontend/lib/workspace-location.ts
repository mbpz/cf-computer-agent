export const WORKSPACE_LOCATION_CHANGE_EVENT = "workbench:location-change";

export interface WorkspaceLocation {
  pathname: string;
  search: string;
}

const NUMBERED_PAGE_QUERY_KEYS = ["page", "pageSize"] as const;
const PRIMARY_QUERY_KEYS: Readonly<Record<string, readonly string[]>> = {
  "/knowledge": [...NUMBERED_PAGE_QUERY_KEYS, "spaceId", "collectionId", "tagId", "kind", "authorId", "publishedFrom", "publishedTo"],
  "/search": [...NUMBERED_PAGE_QUERY_KEYS, "q", "spaceId", "collectionId", "tagId", "tagMode", "kind", "authorId", "publishedFrom", "publishedTo"],
  "/agent": ["scope", "knowledgeItemId"],
  "/my-submissions": [...NUMBERED_PAGE_QUERY_KEYS, "status"],
  "/tasks": [...NUMBERED_PAGE_QUERY_KEYS, "status", "priority", "due", "tag", "q"],
  "/notifications": [...NUMBERED_PAGE_QUERY_KEYS, "read", "type"],
  "/messages": ["page", "limit", "cursor", "contextKind", "contextId"],
  "/admin/submissions": NUMBERED_PAGE_QUERY_KEYS,
  "/admin/duplicates": NUMBERED_PAGE_QUERY_KEYS,
  "/admin/assets": [...NUMBERED_PAGE_QUERY_KEYS, "status"],
  "/admin/members": [...NUMBERED_PAGE_QUERY_KEYS, "status"],
  "/admin/audit": [...NUMBERED_PAGE_QUERY_KEYS, "action"],
  "/admin/analytics": [...NUMBERED_PAGE_QUERY_KEYS, "days"],
};

export function readWorkspaceLocation(): WorkspaceLocation {
  return { pathname: window.location.pathname, search: window.location.search };
}

export function canonicalWorkspaceLocationKey({ pathname, search }: WorkspaceLocation): string {
  const params = new URLSearchParams(search);
  const dynamicKeys = /^\/messages\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(pathname) ? ["page", "limit", "cursor"] : [];
  const primaryEntries = [...(PRIMARY_QUERY_KEYS[pathname] ?? dynamicKeys)]
    .flatMap((key) => params.getAll(key).sort().map((value) => [key, value] as const))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return JSON.stringify([pathname, primaryEntries]);
}

export function writeWorkspaceHistory(mode: "push" | "replace", url: string): void {
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
  window.dispatchEvent(new window.Event(WORKSPACE_LOCATION_CHANGE_EVENT));
}

export function subscribeWorkspaceLocation(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, listener);
  };
}
