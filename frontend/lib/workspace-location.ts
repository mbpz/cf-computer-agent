import { createWorkspaceNavigationGate, type WorkspaceLeaveGuard, type WorkspaceNavigationResult } from "./workspace-navigation-gate";

export const WORKSPACE_LOCATION_CHANGE_EVENT = "workbench:location-change";

export interface WorkspaceLocation {
  pathname: string;
  search: string;
}

const NUMBERED_PAGE_QUERY_KEYS = ["page", "pageSize"] as const;
const PRIMARY_QUERY_KEYS: Readonly<Record<string, readonly string[]>> = {
  "/knowledge": [...NUMBERED_PAGE_QUERY_KEYS, "spaceId", "collectionId", "tagId", "kind", "authorId", "publishedFrom", "publishedTo"],
  "/search": [...NUMBERED_PAGE_QUERY_KEYS, "q", "spaceId", "collectionId", "tagId", "tagMode", "kind", "authorId", "publishedFrom", "publishedTo"],
  "/agent": ["scope", "knowledgeItemId", "spaceId", "collectionId", "conversationId"],
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

// Each browser window owns its gate. Cleanup closures retain that owner even if
// a different window/session becomes current before an old component unmounts.
const navigationGates = new WeakMap<Window, ReturnType<typeof createWorkspaceNavigationGate>>();
function navigationGate(owner: Window) {
  let gate = navigationGates.get(owner);
  if (!gate) { gate = createWorkspaceNavigationGate(); navigationGates.set(owner, gate); }
  return gate;
}

export function registerWorkspaceLeaveGuard(guard: WorkspaceLeaveGuard): () => void {
  return navigationGate(window).register(guard);
}

function commitLocation(owner: typeof window, mode: "push" | "replace", url: string, onCommit?: () => void): void {
  // A rejected history write must not run route mutations. Subscribers see the
  // admitted route state, not an intermediate URL/query mismatch.
  owner.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
  try { onCommit?.(); }
  finally { owner.dispatchEvent(new owner.Event(WORKSPACE_LOCATION_CHANGE_EVENT)); }
}

export function writeWorkspaceHistory(mode: "push" | "replace", url: string, onCommit?: () => void): WorkspaceNavigationResult {
  const owner = window;
  const target = new URL(url, owner.location.href).href;
  return navigationGate(owner).request(() => commitLocation(owner, mode, target, onCommit));
}

/** Only for a confirmed session end, never for ordinary navigation or logout failure. */
export function endWorkspaceSession(clearPrivateState: () => void): void {
  const owner = window;
  const oldGate = navigationGates.get(owner);
  navigationGates.delete(owner);
  // Security cleanup cannot wait for dirty consent, nor can a broken dialog keep
  // private state mounted. Old registrations and callbacks belong to the old gate.
  try { oldGate?.invalidate(); }
  finally {
    clearPrivateState();
    commitLocation(owner, "replace", "/");
  }
}

export function subscribeWorkspaceLocation(listener: () => void): () => void {
  const owner = window;
  owner.addEventListener("popstate", listener);
  owner.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, listener);
  return () => {
    owner.removeEventListener("popstate", listener);
    owner.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, listener);
  };
}
