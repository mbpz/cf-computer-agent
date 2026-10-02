import { createWorkspaceBrowserHistory, WORKSPACE_HISTORY_FAULT_EVENT } from "./workspace-browser-history";
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
  const { pathname, search } = navigationContext(window).browser.url();
  return { pathname, search };
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
type NavigationContext = { gate: ReturnType<typeof createWorkspaceNavigationGate>; browser: ReturnType<typeof createWorkspaceBrowserHistory>; guards: number };
const navigationContexts = new WeakMap<Window, NavigationContext>();
function navigationContext(owner: Window & typeof globalThis, revoked?: ReturnType<NavigationContext["browser"]["revokedCommands"]>) {
  let context = navigationContexts.get(owner);
  if (!context) {
    const gate = createWorkspaceNavigationGate();
    const created = { gate, guards: 0 } as NavigationContext;
    created.browser = createWorkspaceBrowserHistory(owner, gate, () => created.guards > 0,
      () => owner.dispatchEvent(new owner.Event(WORKSPACE_LOCATION_CHANGE_EVENT)), revoked);
    navigationContexts.set(owner, created); context = created;
  }
  return context;
}

export function readWorkspaceHash(): string { return navigationContext(window).browser.url().hash; }
export function readWorkspaceHistoryFault() { return navigationContext(window).browser.fault(); }
export function retryWorkspaceHistory() { return navigationContext(window).browser.retry(); }
export function subscribeWorkspaceHistoryFault(listener: () => void): () => void {
  const owner = window; navigationContext(owner);
  owner.addEventListener(WORKSPACE_HISTORY_FAULT_EVENT, listener);
  return () => owner.removeEventListener(WORKSPACE_HISTORY_FAULT_EVENT, listener);
}
export function registerWorkspaceLeaveGuard(guard: WorkspaceLeaveGuard): () => void {
  const context = navigationContext(window);
  const remove = context.gate.register(guard); context.guards++;
  let removed = false;
  return () => { if (!removed) { removed = true; context.guards--; remove(); } };
}

function commitLocation(owner: typeof window, context: NavigationContext, mode: "push" | "replace", url: string, onCommit?: () => void): void {
  context.browser.write(mode, url);
  try { onCommit?.(); }
  finally { owner.dispatchEvent(new owner.Event(WORKSPACE_LOCATION_CHANGE_EVENT)); }
}

export function writeWorkspaceHistory(mode: "push" | "replace", url: string, onCommit?: () => void): WorkspaceNavigationResult {
  const owner = window;
  const context = navigationContext(owner);
  if (context.browser.busy()) return "blocked";
  const target = new URL(url, context.browser.url()).href;
  // Recheck after a deferred prompt too: a browser traversal may now be restoring.
  return context.gate.request(() => commitLocation(owner, context, mode, target, onCommit), () => !context.browser.busy());
}

/** Only for a confirmed session end, never for ordinary navigation or logout failure. */
export function endWorkspaceSession(clearPrivateState: () => void): void {
  const owner = window;
  const old = navigationContexts.get(owner);
  const revoked = old?.browser.revokedCommands();
  navigationContexts.delete(owner);
  try { try { old?.browser.dispose(); } finally { old?.gate.invalidate(); } }
  finally {
    clearPrivateState();
    owner.history.replaceState({}, "", "/");
    navigationContext(owner, revoked);
    owner.dispatchEvent(new owner.Event(WORKSPACE_LOCATION_CHANGE_EVENT));
    owner.dispatchEvent(new owner.Event(WORKSPACE_HISTORY_FAULT_EVENT));
  }
}

export function subscribeWorkspaceLocation(listener: () => void): () => void {
  const owner = window; navigationContext(owner);
  owner.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, listener);
  return () => owner.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, listener);
}
