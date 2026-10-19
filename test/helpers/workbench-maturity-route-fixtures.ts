import { WORKBENCH_MATURITY_CAPABILITIES } from "../../shared/workbench-maturity-capabilities";
import { extendedPayload } from "./workbench-extended-route-fixtures";

export type MaturityRouteId = (typeof WORKBENCH_MATURITY_CAPABILITIES)[number]["routeId"];
export type MaturityProbeState = "loading" | "empty" | "error" | "ready";

/** The role id the role-detail probe addresses; its ready fixture must resolve this exact id. */
const ADMIN_ROLE_DETAIL_ID = "admin-role-route-audit";

export const DIRECT_PATH_BY_ROUTE = {
  "project-timeline": "/projects/project-route-audit/timeline",
  "knowledge-reader": "/knowledge/knowledge-route-audit",
  "message-thread": "/messages/thread-route-audit",
  "admin-submission-detail": "/admin/submissions/submission-route-audit",
  "admin-role-new": "/admin/roles/new",
  "admin-role-detail": `/admin/roles/${ADMIN_ROLE_DETAIL_ID}`,
  // The recycle bin owns this fixed path and the trash page kind resolves from it.
  "admin-recycle-bin": "/admin/knowledge/trash",
  "admin-knowledge-trash": "/admin/knowledge/trash",
  // The item route may not be probed with the trash path: app-routes.ts resolves
  // the fixed path first, so any other id stands in for one knowledge item.
  "admin-knowledge-item": "/admin/knowledge/knowledge-route-audit",
} as const satisfies Partial<Record<MaturityRouteId, string>>;

export const READY_MARKER_BY_ROUTE = {
  graph: "READY::graph",
  "project-timeline": "READY::project-timeline",
  inbox: "READY::inbox::first", goals: "READY::goals::first", projects: "READY::projects::first",
  calendar: "READY::calendar::first", today: "READY::today::first", focus: "READY::focus::first", review: "READY::review::first",
  home: "READY::home",
  submit: "#submission-title",
  knowledge: "READY::knowledge",
  search: "READY::search",
  agent: "#agent-question",
  "my-submissions": "READY::my-submissions",
  tasks: "READY::tasks",
  boards: "READY::boards",
  environments: "READY::environments",
  settings: "contributor@app.test",
  admin: "[data-dashboard-metric=\"pending\"] [data-page-state=\"ready\"] [data-metric-value]",
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
  "admin-review-batch": "READY::admin-review-batch",
  // Create role renders its form from local state, so its ready observable is the
  // page's own heading rather than anything the role read returns.
  "admin-role-new": "Create role",
  "admin-role-detail": "READY::admin-role-detail",
  // The recycle bin and its fixed-path page kind render the same list, so each
  // carries its own item title: recycle-bin-page.tsx prints `item.title` in the
  // row (plus `data-trash-retention={item.id}` for the retained revision facts).
  "admin-recycle-bin": "READY::admin-recycle-bin",
  "admin-knowledge-trash": "READY::admin-knowledge-trash",
  // knowledge-item-page.tsx prints `item.title` in the identity card of the item
  // the read resolved, so a wrong item would not satisfy this marker.
  "admin-knowledge-item": "READY::admin-knowledge-item",
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
  return async (input, init) => {
    const path = String(input);
    options.requests?.push(path);
    if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture(options.role, options.permissionMask) });
    if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });

    if (options.discussionDenied && path.startsWith("/api/discussions/thread-route-audit")) {
      return apiError(403, "DISCUSSION_CONTEXT_FORBIDDEN");
    }

    const common = commonAuxiliaryResponse(path);
    if (common) return common;

    const response = routeFamilyResponse(options.routeId, options.state, path, init);
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
      // The knowledge family is one top-level entry: the seeded rows put
      // my-submissions under menu-knowledge (migrations/0074). `/submit` has no
      // entry at all — migrations/0075 hides its row and the composer is entered
      // from the 我的提交 header — so the fixture mirrors the current server tree.
      navLeaf("my-submissions", "NAV_MY_SUBMISSIONS", "/my-submissions", "workspace"),
    ]),
    ...(permissionMask === "0x100000" ? [
      navLeaf("graph", "NAV_GRAPH", "/graph", "workspace"),
      navLeaf("inbox", "NAV_INBOX", "/inbox", "workspace"),
      navLeaf("goals", "NAV_GOALS", "/goals", "workspace"),
      navLeaf("projects", "NAV_PROJECTS", "/projects", "workspace"),
      navLeaf("calendar", "NAV_CALENDAR", "/calendar", "workspace"),
      navLeaf("today", "NAV_TODAY", "/today", "workspace"),
      navLeaf("focus", "NAV_FOCUS", "/focus", "workspace"),
      // Fixture key mirrors the shared registry route id; the seeded menus row key is
      // `workbench-review`, because migrations/0029 owns key `review` for /admin/submissions.
      navLeaf("review", "NAV_REVIEW", "/review", "workspace"),
      navLeaf("tasks", "NAV_TASKS", "/tasks", "workspace"),
      navLeaf("boards", "NAV_BOARDS", "/boards", "workspace"),
    ] : []),
    ...(permissionMask === "0x200000" ? [navLeaf("environments", "NAV_ENVIRONMENTS", "/environments", "workspace")] : []),
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
    // The recycle bin is registered as a governance-menu route (shared/workspace-route-capabilities.ts
    // owns the path), and the shell labels the rendered entry from routeCapability(path), so this leaf
    // is what the recycle-bin probe clicks to reach /admin/knowledge/trash.
    navLeaf("admin-recycle-bin", "NAV_RECYCLE_BIN", "/admin/knowledge/trash", "admin"),
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
  if (path === "/api/assets/availability") return Response.json({ storageEnabled: false, reason: "ASSET_STORAGE_NOT_CONFIGURED", maxBytes: 10 * 1024 * 1024 });
  // The member submission composer takes its destination from the Space list and
  // keeps its text in a server draft; both are ordinary auxiliary reads here.
  if (path === "/api/spaces?limit=50") {
    return Response.json({ items: [{ id: "space-route-audit", slug: "route-audit", name: "Route audit Space", description: "", kind: "shared", status: "active", position: 0, readOnly: false, createdAt: NOW, updatedAt: NOW }] });
  }
  if (path === "/api/spaces/space-route-audit/collections?limit=50") return Response.json({ items: [] });
  if (path === "/api/saved-views?limit=50") return Response.json({ items: [] });
  if (path === "/api/knowledge/favorites?limit=20") return Response.json({ items: [] });
  if (path === "/api/knowledge/research-runs?limit=8") return Response.json({ items: [] });
  if (path === "/api/knowledge/notes?limit=20") return Response.json({ items: [] });
  if (path === "/api/knowledge/activity?limit=20") return Response.json({ items: [] });
  if (path === "/api/knowledge/review?period=daily") return Response.json(emptyReview());
  if (path.endsWith("/favorite")) return Response.json({ favorite: false });
  if (path.endsWith("/related")) return Response.json({ related: { items: [] } });
  if (path.endsWith("/backlinks")) return Response.json({ backlinks: { items: [] } });
  if (path.endsWith("/note")) return Response.json({ note: null });
  if (path.endsWith("/comments")) return Response.json({ comments: [] });
  if (path === "/api/members/active") return Response.json({ items: [] });
  // The admin members page loads its invitation list alongside members; the route audit
  // only probes member behavior, so an empty invitation list keeps it out of the census.
  return null;
}

function routeFamilyResponse(routeId: MaturityRouteId, state: MaturityProbeState, path: string, init?: RequestInit): Promise<Response> | Response | null {
  switch (routeId) {
    case "graph":
      if (pathname(path) === "/api/graph") return probeResponse(state,
        { nodes: [], edges: [], rootId: null, depth: 1, truncated: false },
        { nodes: [{ id: "task:graph-route-audit", kind: "task", label: "READY::graph", status: null, href: null, metadata: {} }], edges: [], rootId: null, depth: 1, truncated: false });
      return null;
    case "project-timeline":
      if (pathname(path) === "/api/projects/project-route-audit") return Response.json({ id: "project-route-audit", clientKey: "project-route-audit", title: "Timeline project", description: null, status: "active", progress: 0, targetAt: null, createdAt: NOW, updatedAt: NOW });
      if (pathname(path) === "/api/projects/project-route-audit/timeline") return probeResponse(state, { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }, { items: [{ id: "timeline-route-audit", projectId: "project-route-audit", clientKey: "timeline-route-audit", kind: "decision", title: "READY::project-timeline", body: "Owned decision", status: "open", startsAt: null, dueAt: null, createdAt: NOW, updatedAt: NOW }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      return null;
    case "inbox": case "goals": case "projects": case "calendar": case "today": case "focus": case "review": {
      const endpoints = { inbox: "/api/inbox", goals: "/api/goals", projects: "/api/projects", calendar: "/api/calendar/events", today: "/api/today", focus: "/api/focus/current", review: "/api/workbench/review" };
      if (pathname(path) === endpoints[routeId]) {
        const params = new URL(path, "https://app.test").searchParams;
        const range = routeId === "calendar" ? { from: params.get("from")!, to: params.get("to")! } : undefined;
        return probeResponse(state, extendedPayload(routeId, true, "first", range), extendedPayload(routeId, false, "first", range));
      }
      if (routeId === "projects" && path === "/api/projects/projects-first/summary") return Response.json({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
      return null;
    }
    case "environments":
      if (path === "/api/environments?page=1&pageSize=20") return probeResponse(state,
        { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
        { items: [{ id: "environment-route-audit", memberId: "contributor-route-auditor", name: "READY::environments", type: "personal", taskId: null, version: 1, createdAt: NOW, updatedAt: NOW }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      return null;
    case "home":
      if (path === "/api/knowledge/recent?limit=8") return probeResponse(state, { items: [] }, { items: [{ knowledgeItemId: "ready-home", title: "READY::home", lastVisitedAt: NOW, visitCount: 1 }] });
      return null;
    case "submit":
      if (String(path).startsWith("/api/submissions/drafts")) {
        // The composer mirrors its text into a server draft; echoing the request
        // keeps this route audit about the submission, not about draft storage.
        const body = init?.body ? JSON.parse(String(init.body)) as Record<string, string> : undefined;
        return Response.json({
          id: "draft-route-audit", submitterId: "contributor-route-auditor", status: "draft",
          kind: body?.kind ?? "markdown", title: body?.title ?? "Route audit draft", content: body?.content ?? "Route audit draft content",
          requestedSpaceId: body?.requestedSpaceId ?? "space-route-audit",
          requestedCollectionId: body?.requestedCollectionId ?? null,
          requestedVisibility: body?.requestedVisibility ?? "shared",
          createdAt: NOW, updatedAt: NOW,
        });
      }
      if (path === "/api/submissions") return probeResponse(state, { submission: { id: "submission-created-route-audit" }, similarCandidates: [] }, { submission: { id: "submission-created-route-audit" }, similarCandidates: [] });
      // `/submit` has no navigation entry, so its ready-state journey first opens
      // 我的提交 and follows the header CTA. The tracking page reads its own list
      // on the way, which is not what this probe audits.
      if (pathname(path) === "/api/submissions/mine") return probeResponse(state, numbered([]), numbered([]));
      return null;
    case "knowledge":
      if (pathname(path) === "/api/knowledge") return probeResponse(state, numbered([]), numbered([{ id: "ready-knowledge", title: "READY::knowledge", publishedAt: "2026-10-04", tags: [] }]));
      return null;
    case "knowledge-reader":
      if (path === "/api/knowledge/knowledge-route-audit") return probeResponse(state, {}, { knowledge: { currentRevision: knowledgeRevision() } });
      return null;
    case "search":
      if (pathname(path) === "/api/knowledge/search") return probeResponse(state, { ...numbered([]), degraded: false }, { ...numbered([{ knowledgeItemId: "ready-search", title: "READY::search", excerpt: "route fixture", matchedFields: [] }]), degraded: false });
      return null;
    case "agent": {
      const sessionId = "agent-session-route-audit";
      const turnId = "turn-route-audit-0001";
      const session = { id: sessionId, memberId: "contributor-route-auditor", createdAt: NOW, lastSeenAt: NOW };
      if (pathname(path) === "/api/agent/sessions" && (init?.method ?? "GET").toUpperCase() === "POST") {
        return Response.json({ session }, { status: 201 });
      }
      if (pathname(path) === `/api/agent/sessions/${sessionId}`) return Response.json({ session });
      if (pathname(path).endsWith("/messages")) return Response.json({ messages: { items: [], truncated: false } });
      if (pathname(path).endsWith("/terminate")) return Response.json({ turn: { turnId, question: "", status: "terminated", createdAt: NOW, updatedAt: NOW } });
      if (pathname(path) === `/api/agent/sessions/${sessionId}/stream`) {
        if (state === "loading") return neverResponse();
        if (state === "error") return apiError(503, "ROUTE_MATURITY_RETRYABLE_ERROR", true);
        const payload = state === "ready"
          ? { answer: "READY::agent", evidenceConfidence: 1, citations: [], sources: [], sessionId, conversationId: sessionId, turnId }
          : {};
        return new Response(`data: ${JSON.stringify({ stage: "answer", body: payload })}\n\n`, { headers: { "content-type": "text/event-stream", "x-agent-turn-id": turnId } });
      }
      return null;
    }
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
    case "settings":
      return null;
    case "admin":
      if (pathname(path) === "/api/admin/submissions") return probeResponse(state, numbered([]), numbered([{ id: "dashboard-pending", title: "Pending", submitterId: "member-route-audit", status: "review_pending" }]));
      if (pathname(path) === "/api/admin/assets") return probeResponse(state, numbered([]), numbered([{ asset: { id: "dashboard-asset", originalName: "asset.txt" }, job: { status: "succeeded" } }]));
      if (pathname(path) === "/api/admin/members") return probeResponse(state, numbered([]), numbered([{ id: "dashboard-member", email: "member@app.test", role: "contributor", status: "active" }]));
      return null;
    case "admin-review-batch":
      if (pathname(path) === "/api/admin/submissions") return probeResponse(state,
        { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
        { items: [{ id: "submission-route-audit", title: "READY::admin-review-batch", submitterId: "member-route-audit", status: "review_pending", updatedAt: NOW }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      return null;
    case "admin-submissions":
      if (pathname(path) === "/api/admin/submissions") return probeResponse(state, numbered([]), numbered([{ id: "ready-admin-submissions", title: "READY::admin-submissions", submitterId: "member-route-audit", status: "review_pending" }]));
      return null;
    case "admin-submission-detail":
      if (path === "/api/admin/submissions/submission-route-audit") return probeResponse(state, {}, reviewDetail());
      return null;
    case "admin-duplicates":
      if (pathname(path) === "/api/admin/duplicates") {
        const query = new URL(path, "https://app.test").searchParams;
        const page = Number(query.get("page") || 1); const pageSize = Number(query.get("pageSize") || 20);
        const total = (page - 1) * pageSize + 1;
        return probeResponse(state,
          { items: [], pagination: { page, pageSize, total: 0, totalPages: 0 } },
          { items: [{ submissionId: "ready-admin-duplicates", canonicalSubmissionId: "canonical-submission", canonicalSourceId: "canonical-source", canonicalSourceVersionId: "canonical-version", submissionTitle: "READY::admin-duplicates", canonicalTitle: "Canonical", decision: "pending" }], pagination: { page, pageSize, total, totalPages: page } });
      }
      return null;
    case "admin-assets":
      if (pathname(path) === "/api/admin/assets") return probeResponse(state, numbered([]), numbered([{ asset: { id: "ready-admin-assets", originalName: "READY::admin-assets" }, job: { status: "succeeded" } }]));
      return null;
    case "admin-members":
      if (pathname(path) === "/api/admin/members") {
        const query = new URL(path, "https://app.test").searchParams;
        const page = Number(query.get("page") || 1); const pageSize = Number(query.get("pageSize") || 20);
        const total = (page - 1) * pageSize + 1;
        return probeResponse(state,
          { items: [], pagination: { page, pageSize, total: 0, totalPages: 0 } },
          { items: [{ id: "ready-admin-members", email: "ready-admin-members@app.test", role: "contributor", status: query.get("status") || "active" }], pagination: { page, pageSize, total, totalPages: page } });
      }
      return null;
    case "admin-roles":
      if (path === "/api/admin/roles") return probeResponse(state, { items: [] }, { items: [{ id: "ready-admin-roles", key: "ready-role", name: "READY::admin-roles", description: "route fixture", allowBits: "0x0", memberCount: 0, assignedMemberIds: [], status: "active", isSystem: false }] });
      return null;
    case "admin-role-new":
      // Create role draws its form from local state and only consumes the shared controller's
      // read for draft/read-required gating, so every state still answers this one endpoint.
      if (path === "/api/admin/roles") return probeResponse(state, { items: [] }, { items: [adminRole("ready-admin-role-new", "ready-role-new", "Ready created role")] });
      return null;
    case "admin-role-detail":
      if (path === "/api/admin/roles") {
        // The requested role must be found by id, and a second role proves the page selects
        // rather than renders the first item.
        return probeResponse(state, { items: [] }, { items: [
          adminRole(ADMIN_ROLE_DETAIL_ID, "ready-role-detail", "READY::admin-role-detail"),
          adminRole("ready-admin-role-other", "ready-role-other", "Ready unrelated role"),
        ] });
      }
      return null;
    case "admin-menus":
      if (path === "/api/admin/menus") return probeResponse(state, { tree: [] }, { tree: [{ id: "ready-admin-menus", parentId: null, key: "ready-admin-menus", labelKey: "READY_ADMIN_MENUS", path: "/fixture", icon: null, groupName: "admin", position: 1, requiredBits: "0x0", status: "active", visible: true, isSystem: false, children: [] }] });
      return null;
    case "admin-recycle-bin":
      // The recycle bin's cursor read; the page keeps only the items the server
      // names, so an empty page is the empty state and one item is the ready one.
      if (pathname(path) === "/api/admin/knowledge/trash") return probeResponse(state,
        { items: [] },
        { items: [trashedKnowledge("ready-admin-recycle-bin", "READY::admin-recycle-bin")] });
      return null;
    case "admin-knowledge-trash":
      // The fixed /admin/knowledge/trash page kind reuses the recycle-bin route, so
      // it answers the identical read with its own marker item.
      if (pathname(path) === "/api/admin/knowledge/trash") return probeResponse(state,
        { items: [] },
        { items: [trashedKnowledge("ready-admin-knowledge-trash", "READY::admin-knowledge-trash")] });
      return null;
    case "admin-knowledge-item":
      // The item surface reads its own endpoint, active or trashed; the page
      // fails closed unless the current revision names that same item.
      if (path === "/api/admin/knowledge/knowledge-route-audit") return probeResponse(state, {},
        { knowledge: adminKnowledgeItem("knowledge-route-audit", "READY::admin-knowledge-item") });
      if (pathname(path) === "/api/admin/knowledge/knowledge-route-audit/revisions") return probeResponse(state, {},
        { revisions: [{ id: "knowledge-route-audit-revision", title: "READY::admin-knowledge-item", visibility: "shared", publishedAt: NOW, isCurrent: true }] });
      return null;
    case "admin-spaces":
      if (path === "/api/admin/spaces?limit=50") return probeResponse(state, { items: [] }, { items: [{ id: "ready-admin-spaces", name: "READY::admin-spaces", slug: "ready-space", status: "active", kind: "shared", readOnly: false, description: "", position: 0, impact: { collections: 0, knowledgeItems: 0, revisions: 0, links: 0 }, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z" }] });
      if (path === "/api/admin/spaces/ready-admin-spaces/collections?limit=50") return Response.json({ items: [] });
      return null;
    case "admin-audit":
      if (pathname(path) === "/api/admin/audit-events") return probeResponse(state, numbered([]), numbered([{ id: "ready-admin-audit", action: "member.login", actorKind: "member", actorId: "READY::admin-audit", createdAt: NOW }]));
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
  return { id: "revision-route-audit", knowledgeItemId: "knowledge-route-audit", title: "Reader fixture", markdown: "# READY::knowledge-reader", publishedAt: NOW, isCurrent: true, previousRevisionId: null, sourceVersionId: "source-version-route-audit", sourceVersionOrdinal: 1, parserSchemaVersion: "v1", indexStatus: "indexed", chunks: [] };
}

function reviewDetail() {
  return { preview: { submissionId: "submission-route-audit", title: "READY::admin-submission-detail", submitterId: "contributor-route-auditor", status: "review_pending", requestedVisibility: "shared", requestedSpaceId: "default", requestedCollectionId: null, tagIds: [], sourceVersion: { content: "review route fixture" }, safety: { findings: [] } } };
}

function adminRole(id: string, key: string, name: string) {
  return { id, key, name, description: "route fixture", allowBits: "0x0", memberCount: 0, assignedMemberIds: [], status: "active", isSystem: false };
}

/**
 * One trashed knowledge item as the recycle bin's own read defines it. The purge
 * deadline is derived from the same 30-day window the purge path enforces, so the
 * fixture states exactly `trashedAt + 30 days` and a purgeable item.
 */
function trashedKnowledge(id: string, title: string) {
  return {
    id, spaceId: "space-route-audit", collectionId: null, revisionId: `${id}-revision`, title,
    visibility: "shared", status: "trashed", publishedAt: NOW, updatedAt: NOW, searchStatus: "indexed",
    retention: { trashedAt: "2026-08-01T00:00:00.000Z", purgeEligibleAt: NOW, purgeable: true },
  };
}

/**
 * The governed item the admin item read resolves. The current revision names the
 * same item and claims `isCurrent`, which the page requires before it renders.
 */
function adminKnowledgeItem(id: string, title: string) {
  return {
    id, spaceId: "space-route-audit", collectionId: null, title, tagIds: [], visibility: "shared", searchStatus: "indexed",
    publishedAt: NOW, updatedAt: NOW, status: "active",
    currentRevision: { id: `${id}-revision`, knowledgeItemId: id, title, visibility: "shared", publishedAt: NOW, isCurrent: true, previousRevisionId: null, indexStatus: "indexed" },
  };
}

function analytics(withMarker: boolean) {
  return {
    range: { from: "2026-08-25", to: "2026-08-31", days: 7 },
    totals: { pageViews: withMarker ? 1 : 0, uniqueVisitors: withMarker ? 1 : 0, loginUsers: withMarker ? 1 : 0 },
    daily: withMarker ? [{ day: "2026-08-31", pageViews: 1, uniqueVisitors: 1, loginUsers: 1 }] : [],
    breakdowns: { paths: withMarker ? [{ key: "/ready-admin-analytics", pageViews: 1 }] : [], regions: [], countries: [] },
    recentVisitors: numbered(withMarker ? [{ occurredAt: NOW, path: "/ready-admin-analytics", ip: "203.0.113.0", country: null, region: null, city: null, colo: null, userAgent: null, member: { id: "admin-route-auditor", email: "admin@example.test" } }] : []),
  };
}

function emptyReview() {
  return { period: "daily", from: "2026-10-03T00:00:00.000Z", to: "2026-10-04T00:00:00.000Z", items: [] };
}

export function apiError(status: number, code: string, retryable = false): Response {
  return Response.json({ error: { code, message: code, retryable, requestId: "route-audit" } }, { status });
}
