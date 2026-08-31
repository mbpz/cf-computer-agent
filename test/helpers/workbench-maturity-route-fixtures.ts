import { WORKBENCH_MATURITY_CAPABILITIES } from "../../shared/workbench-maturity-capabilities";

export type MaturityRouteId = (typeof WORKBENCH_MATURITY_CAPABILITIES)[number]["routeId"];
export type MaturityProbeState = "loading" | "empty" | "error" | "ready";

export const DIRECT_PATH_BY_ROUTE = {
  "knowledge-reader": "/knowledge/knowledge-route-audit",
  "message-thread": "/messages/thread-route-audit",
  "admin-submission-detail": "/admin/submissions/submission-route-audit",
} as const satisfies Partial<Record<MaturityRouteId, string>>;

export const READY_MARKER_BY_ROUTE = {
  home: "READY::home",
  submit: "#submission-title",
  knowledge: "READY::knowledge",
  search: "READY::search",
  agent: "#agent-question",
  "my-submissions": "READY::my-submissions",
  tasks: "READY::tasks",
  boards: "READY::boards",
  settings: "contributor@app.test",
  admin: "a[href=\"/admin/analytics\"]",
  "admin-submissions": "READY::admin-submissions",
  "admin-duplicates": "READY::admin-duplicates",
  "admin-assets": "READY::admin-assets",
  "admin-members": "ready-admin-members@app.test",
  "admin-roles": "READY::admin-roles",
  "admin-menus": "READY_ADMIN_MENUS",
  "admin-spaces": "READY::admin-spaces",
  "admin-audit": "READY::admin-audit",
  "admin-analytics": "/ready-admin-analytics",
  notifications: "[data-notification-id=\"notification-route-audit\"]",
  messages: "a[href=\"/messages/thread-route-audit\"]",
  "knowledge-reader": "READY::knowledge-reader",
  "message-thread": "[data-message-id=\"private-message-route-audit\"]",
  "admin-submission-detail": "READY::admin-submission-detail",
} as const satisfies Record<MaturityRouteId, string>;

export const PRIVATE_THREAD_MARKERS = Object.freeze({
  messageId: "private-message-route-audit",
  body: "PRIVATE_MESSAGE_BODY_ROUTE_AUDIT",
  targetId: "private-target-route-audit",
});

export function isReadySelector(routeId: MaturityRouteId): boolean {
  return READY_MARKER_BY_ROUTE[routeId].startsWith("#") || READY_MARKER_BY_ROUTE[routeId].startsWith("[") || READY_MARKER_BY_ROUTE[routeId].startsWith("a[");
}

export function createMaturityRouteFetch(options: {
  routeId: MaturityRouteId;
  state: MaturityProbeState;
  role: "contributor" | "admin";
  permissionMask: string;
  requests?: string[];
  discussionDenied?: boolean;
}): typeof globalThis.fetch {
  return async (input) => {
    const path = String(input);
    options.requests?.push(path);
    if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture(options.role, options.permissionMask) });
    if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });

    if (options.discussionDenied && path.startsWith("/api/discussions/thread-route-audit")) {
      return apiError(403, "DISCUSSION_CONTEXT_FORBIDDEN");
    }

    const common = commonAuxiliaryResponse(path);
    if (common) return common;

    const response = routeFamilyResponse(options.routeId, options.state, path);
    if (response) return response;
    throw new Error(`unplanned ${options.routeId}/${options.state} maturity request: ${path}`);
  };
}

export function currentNavigationFixture(role: "contributor" | "admin", permissionMask: string) {
  const workspaceChildren = [
    navLeaf("home", "NAV_HOME", "/", "workspace"),
    navLeaf("knowledge", "NAV_KNOWLEDGE_BASE", "/knowledge", "workspace", [
      navLeaf("search", "NAV_KNOWLEDGE_SEARCH", "/search", "workspace"),
      navLeaf("agent", "NAV_KNOWLEDGE_AGENT", "/agent", "workspace"),
    ]),
    navLeaf("submit", "NAV_SUBMIT", "/submit", "workspace"),
    navLeaf("my-submissions", "NAV_MY_SUBMISSIONS", "/my-submissions", "workspace"),
    ...(permissionMask === "0x100000" ? [
      navLeaf("tasks", "NAV_TASKS", "/tasks", "workspace"),
      navLeaf("boards", "NAV_BOARDS", "/boards", "workspace"),
    ] : []),
    navLeaf("notifications", "NAV_NOTIFICATIONS", "/notifications", "workspace"),
    navLeaf("messages", "NAV_MESSAGES", "/messages", "workspace"),
  ];
  const workspace = navRoot("workspace", "SHELL_GROUP_WORKSPACE", "workspace", workspaceChildren);
  if (role !== "admin") return [workspace];
  const governance = navRoot("governance", "SHELL_GROUP_GOVERNANCE", "admin", [
    navLeaf("admin-members", "NAV_MEMBERS", "/admin/members", "admin"),
    navLeaf("admin-roles", "NAV_ROLES", "/admin/roles", "admin"),
    navLeaf("admin-menus", "NAV_MENUS", "/admin/menus", "admin"),
    navLeaf("admin-spaces", "NAV_SPACES", "/admin/spaces", "admin"),
    navLeaf("admin-audit", "NAV_AUDIT", "/admin/audit", "admin"),
    navLeaf("admin-analytics", "NAV_SITE_ANALYTICS", "/admin/analytics", "admin"),
  ]);
  const admin = navLeaf("admin", "NAV_ADMINISTRATION", "/admin", "admin", [
    navLeaf("admin-submissions", "NAV_REVIEW_QUEUE", "/admin/submissions", "admin"),
    navLeaf("admin-duplicates", "NAV_DUPLICATES", "/admin/duplicates", "admin"),
    navLeaf("admin-assets", "NAV_ASSET_QUEUE", "/admin/assets", "admin"),
    governance,
  ]);
  return [workspace, admin];
}

function navRoot(key: string, labelKey: string, groupName: "workspace" | "admin", children: unknown[]) {
  return { id: `server-${key}`, key, labelKey, path: null, icon: null, groupName, availability: "ready", children };
}

function navLeaf(key: string, labelKey: string, path: string, groupName: "workspace" | "admin", children: unknown[] = []) {
  return { id: `server-${key}`, key, labelKey, path, icon: null, groupName, availability: "ready", children };
}

function commonAuxiliaryResponse(path: string): Response | null {
  if (path === "/api/saved-views?limit=50") return Response.json({ items: [] });
  if (path === "/api/knowledge/favorites?limit=20") return Response.json({ items: [] });
  if (path === "/api/knowledge/research-runs?limit=8") return Response.json({ items: [] });
  if (path === "/api/knowledge/notes?limit=20") return Response.json({ items: [] });
  if (path === "/api/knowledge/activity?limit=20") return Response.json({ items: [] });
  if (path === "/api/knowledge/review?period=daily") return Response.json(emptyReview());
  if (path.endsWith("/favorite")) return Response.json({ favorite: false });
  if (path.endsWith("/related")) return Response.json({ related: [] });
  if (path.endsWith("/backlinks")) return Response.json({ backlinks: [] });
  if (path.endsWith("/note")) return Response.json({ note: null });
  if (path.endsWith("/comments")) return Response.json({ comments: [] });
  if (path === "/api/members/active") return Response.json({ items: [] });
  return null;
}

function routeFamilyResponse(routeId: MaturityRouteId, state: MaturityProbeState, path: string): Promise<Response> | Response | null {
  switch (routeId) {
    case "home":
      if (path === "/api/knowledge/recent?limit=8") return probeResponse(state, { items: [] }, { items: [{ knowledgeItemId: "ready-home", title: "READY::home", lastVisitedAt: NOW, visitCount: 1 }] });
      return null;
    case "submit":
      if (path === "/api/submissions") return probeResponse(state, { submission: { id: "submission-created-route-audit" }, similarCandidates: [] }, { submission: { id: "submission-created-route-audit" }, similarCandidates: [] });
      return null;
    case "knowledge":
      if (pathname(path) === "/api/knowledge") return probeResponse(state, numbered([]), numbered([{ id: "ready-knowledge", title: "READY::knowledge", tags: [] }]));
      return null;
    case "knowledge-reader":
      if (path === "/api/knowledge/knowledge-route-audit") return probeResponse(state, {}, { knowledge: { currentRevision: knowledgeRevision() } });
      return null;
    case "search":
      if (pathname(path) === "/api/knowledge/search") return probeResponse(state, { ...numbered([]), degraded: false }, { ...numbered([{ knowledgeItemId: "ready-search", title: "READY::search", excerpt: "route fixture" }]), degraded: false });
      return null;
    case "agent":
      if (path === "/api/knowledge/chat") return probeResponse(state, {}, { answer: "READY::agent", evidenceConfidence: 1, citations: [] });
      return null;
    case "my-submissions":
      if (pathname(path) === "/api/submissions/mine") return probeResponse(state, numbered([]), numbered([{ id: "ready-my-submissions", title: "READY::my-submissions", status: "review_pending" }]));
      return null;
    case "tasks":
      if (pathname(path) === "/api/tasks") return probeResponse(state, numbered([]), numbered([task("ready-tasks", "READY::tasks", "todo")]));
      return null;
    case "boards":
      if (pathname(path) === "/api/tasks") {
        const status = new URL(path, "https://app.test").searchParams.get("status") as "todo" | "doing" | "blocked" | "done";
        return probeResponse(state, numbered([]), numbered([task(`ready-boards-${status}`, status === "todo" ? "READY::boards" : `Ready ${status}`, status)]));
      }
      return null;
    case "notifications":
      if (pathname(path) === "/api/notifications") return probeResponse(state, numbered([]), numbered([notification()]));
      if (path === "/api/notifications/summary") return state === "loading" ? neverResponse() : Response.json({ unread: state === "ready" ? 1 : 0 });
      return null;
    case "messages":
      if (pathname(path) === "/api/discussions") return probeResponse(state, { items: [] }, { items: [thread()] });
      return null;
    case "message-thread":
      if (path === "/api/discussions/thread-route-audit") return state === "empty" ? Response.json(thread()) : probeResponse(state, {}, thread());
      if (path === "/api/discussions/thread-route-audit/messages?limit=20") return probeResponse(state, { items: [] }, { items: [message()] });
      return null;
    case "settings": case "admin":
      return null;
    case "admin-submissions":
      if (pathname(path) === "/api/admin/submissions") return probeResponse(state, numbered([]), numbered([{ id: "ready-admin-submissions", title: "READY::admin-submissions", submitterId: "member-route-audit", status: "review_pending" }]));
      return null;
    case "admin-submission-detail":
      if (path === "/api/admin/submissions/submission-route-audit") return probeResponse(state, {}, reviewDetail());
      return null;
    case "admin-duplicates":
      if (pathname(path) === "/api/admin/duplicates") return probeResponse(state, numbered([]), numbered([{ submissionId: "ready-admin-duplicates", canonicalSubmissionId: "canonical-submission", canonicalSourceId: "canonical-source", canonicalSourceVersionId: "canonical-version", submissionTitle: "READY::admin-duplicates", canonicalTitle: "Canonical", decision: "pending" }]));
      return null;
    case "admin-assets":
      if (pathname(path) === "/api/admin/assets") return probeResponse(state, numbered([]), numbered([{ asset: { id: "ready-admin-assets", originalName: "READY::admin-assets" }, job: { status: "succeeded" } }]));
      return null;
    case "admin-members":
      if (pathname(path) === "/api/admin/members") return probeResponse(state, numbered([]), numbered([{ id: "ready-admin-members", email: "ready-admin-members@app.test", role: "contributor", status: "active" }]));
      return null;
    case "admin-roles":
      if (path === "/api/admin/roles") return probeResponse(state, { items: [] }, { items: [{ id: "ready-admin-roles", key: "ready-role", name: "READY::admin-roles", description: "route fixture", allowBits: "0x0", memberCount: 0, assignedMemberIds: [], status: "active", isSystem: false }] });
      return null;
    case "admin-menus":
      if (path === "/api/admin/menus") return probeResponse(state, { tree: [] }, { tree: [{ id: "ready-admin-menus", parentId: null, key: "ready-admin-menus", labelKey: "READY_ADMIN_MENUS", path: "/fixture", icon: null, groupName: "admin", position: 1, requiredBits: "0x0", status: "active", visible: true, isSystem: false, children: [] }] });
      return null;
    case "admin-spaces":
      if (path === "/api/admin/spaces?limit=50") return probeResponse(state, { items: [] }, { items: [{ id: "ready-admin-spaces", name: "READY::admin-spaces", slug: "ready-space", status: "active" }] });
      if (path === "/api/admin/spaces/ready-admin-spaces/collections?limit=50") return Response.json({ items: [] });
      return null;
    case "admin-audit":
      if (pathname(path) === "/api/admin/audit-events") return probeResponse(state, numbered([]), numbered([{ id: "ready-admin-audit", action: "READY::admin-audit", actorId: "admin-route-auditor", createdAt: NOW }]));
      return null;
    case "admin-analytics":
      if (pathname(path) === "/api/admin/analytics/overview") return probeResponse(state, analytics(false), analytics(true));
      return null;
  }
}

function probeResponse(state: MaturityProbeState, empty: unknown, ready: unknown): Promise<Response> | Response {
  if (state === "loading") return neverResponse();
  if (state === "error") return apiError(503, "ROUTE_MATURITY_RETRYABLE_ERROR", true);
  return Response.json(state === "ready" ? ready : empty);
}

function neverResponse(): Promise<Response> { return new Promise<Response>(() => undefined); }
function pathname(path: string): string { return new URL(path, "https://app.test").pathname; }
function numbered(items: unknown[]) { return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }; }

const NOW = "2026-08-31T00:00:00.000Z";

function task(id: string, title: string, status: "todo" | "doing" | "blocked" | "done") {
  return { id, title, notes: "", status, progress: status === "done" ? 100 : 0, priority: "medium", dueAt: null, completedAt: status === "done" ? NOW : null, createdAt: NOW, updatedAt: NOW };
}

function notification() {
  return { id: "notification-route-audit", recipientMemberId: "contributor-route-auditor", eventType: "discussion.reply", actorMemberId: "admin-route-auditor", targetKind: "discussion_thread", targetId: "thread-route-audit", payload: { title: "READY::notifications" }, deduplicationKey: "notification-route-audit", readAt: null, createdAt: NOW };
}

function thread() {
  return { id: "thread-route-audit", contextKind: "task", contextId: PRIVATE_THREAD_MARKERS.targetId, creatorMemberId: "admin-route-auditor", lastSequence: 1, createdAt: NOW, updatedAt: NOW };
}

function message() {
  return { id: PRIVATE_THREAD_MARKERS.messageId, threadId: "thread-route-audit", sequence: 1, authorMemberId: "admin-route-auditor", body: PRIVATE_THREAD_MARKERS.body, replyToMessageId: null, mentionMemberIds: [], clientKey: "route-audit-client", createdAt: NOW };
}

function knowledgeRevision() {
  return { id: "revision-route-audit", knowledgeItemId: "knowledge-route-audit", title: "Reader fixture", markdown: "# READY::knowledge-reader", isCurrent: true, previousRevisionId: null, sourceVersionId: "source-version-route-audit", sourceVersionOrdinal: 1, parserSchemaVersion: "v1", indexStatus: "indexed", chunks: [] };
}

function reviewDetail() {
  return { preview: { submissionId: "submission-route-audit", title: "READY::admin-submission-detail", submitterId: "contributor-route-auditor", status: "review_pending", requestedVisibility: "shared", requestedSpaceId: "default", requestedCollectionId: null, tagIds: [], sourceVersion: { content: "review route fixture" }, safety: { findings: [] } } };
}

function analytics(withMarker: boolean) {
  return {
    range: { from: "2026-08-25", to: "2026-08-31", days: 7 },
    totals: { pageViews: withMarker ? 1 : 0, uniqueVisitors: withMarker ? 1 : 0, loginUsers: withMarker ? 1 : 0 },
    daily: withMarker ? [{ day: "2026-08-31", pageViews: 1, uniqueVisitors: 1, loginUsers: 1 }] : [],
    breakdowns: { paths: withMarker ? [{ key: "/ready-admin-analytics", pageViews: 1 }] : [], regions: [], countries: [] },
    recentVisitors: numbered([]),
  };
}

function emptyReview() {
  return { period: "daily", generatedAt: NOW, pending: [], stale: [], favorites: [], recent: [] };
}

export function apiError(status: number, code: string, retryable = false): Response {
  return Response.json({ error: { code, message: code, retryable, requestId: "route-audit" } }, { status });
}
