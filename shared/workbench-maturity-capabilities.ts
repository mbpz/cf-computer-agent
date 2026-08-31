export type MaturityClassification = "usable" | "partial" | "unusable" | "pseudo_entry" | "unreachable";
export type MaturityDimension = "entry" | "journey" | "api" | "persistence" | "isolation" | "query_or_idempotency" | "states" | "accessibility" | "evidence";

export interface WorkbenchMaturityCapability {
  readonly id: string;
  readonly routeId: string;
  readonly pathname: string;
  readonly parentRouteId?: string;
  readonly routePattern?: string;
  readonly requiredRole: "anonymous" | "contributor" | "admin";
  readonly journey: string;
  readonly classification: MaturityClassification;
  readonly dimensions: Readonly<Record<MaturityDimension, "proven" | "gap" | "not_applicable">>;
  readonly frontendEvidence: readonly string[];
  readonly backendEvidence: readonly string[];
  readonly testEvidence: readonly string[];
  readonly ledgerIds: readonly string[];
  readonly gaps: readonly string[];
}

export type WorkbenchPaginationAudit = "numbered" | "cursor" | "not_applicable";
export type WorkbenchMutationSafety = "idempotency_key" | "conditional_write" | "convergent_delete" | "mixed" | "not_applicable";

export interface WorkbenchMaturityDomainEvidence {
  readonly id: string;
  readonly apiPaths: readonly string[];
  readonly persistencePaths: readonly string[];
  readonly ownerPredicate: string | null;
  readonly pagination: WorkbenchPaginationAudit;
  readonly mutations: readonly string[];
  readonly mutationSafety: WorkbenchMutationSafety;
}

const INITIAL_DIMENSIONS = {
  entry: "proven",
  journey: "gap",
  api: "gap",
  persistence: "gap",
  isolation: "gap",
  query_or_idempotency: "gap",
  states: "gap",
  accessibility: "gap",
  evidence: "gap",
} as const satisfies WorkbenchMaturityCapability["dimensions"];

export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([
  {
    id: "workbench-home", routeId: "home", pathname: "/", requiredRole: "contributor",
    journey: "Open the workbench and review the current capability summary.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/home-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/workspace-dashboard.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["WB-001", "WB-002"], gaps: ["The current server-navigation entry and a response-owned recent-item ready marker are fixture-proven. Home renders ready while recent data is pending, collapses recent failure to empty, hard-codes zero metrics, and has no retryable route error. The recent API is cursor-paged, but Home exposes no continuation control. Release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-submit", routeId: "submit", pathname: "/submit", requiredRole: "contributor",
    journey: "Submit knowledge for parsing and later review.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/submit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/frontend-submit-pages.test.tsx", "test/worker/submissions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-001"], gaps: ["The current server-navigation entry, idle form, pending, retry-by-resubmit error, and success/empty transition are runtime-probed. Source-level persistence and submitter-scoped idempotency exist, but complete browser, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-knowledge", routeId: "knowledge", pathname: "/knowledge", requiredRole: "contributor",
    journey: "Browse knowledge and open an authorized knowledge item.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/knowledge-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/library.ts", "src/library/repository.ts"], testEvidence: ["test/unit/frontend-user-read-pages.test.tsx", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-005", "KB-006"], gaps: ["Current server-navigation entry plus primary-list loading, empty, retryable error, and response-owned ready marker are runtime-probed. Auxiliary recent, favorite, note, activity, and review failures remain collapsed or independent; complete browser/release evidence remains a gap."],
  },
  {
    id: "workbench-search", routeId: "search", pathname: "/search", requiredRole: "contributor",
    journey: "Search authorized knowledge and inspect result evidence.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/search-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/library.ts", "src/knowledge/search.ts"], testEvidence: ["test/unit/search.test.ts", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-007"], gaps: ["Current server-navigation entry plus queried loading, empty, retryable error, and response-owned ready marker are runtime-probed. Degraded/filter restoration, result-open, release, and signed-browser journeys remain incomplete."],
  },
  {
    id: "workbench-agent", routeId: "agent", pathname: "/agent", requiredRole: "contributor",
    journey: "Ask the bounded knowledge Agent and inspect its cited response.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/agent-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/agent.ts", "src/agent/session-do.ts"], testEvidence: ["test/unit/agent-tool-runner.test.ts", "test/worker/agent-session.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-009"], gaps: ["Current server-navigation entry, initial form/answer, and post-submit loading and retryable error are runtime-probed. There is no explicit empty-answer state; cited completion, cancellation recovery, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-my-submissions", routeId: "my-submissions", pathname: "/my-submissions", requiredRole: "contributor",
    journey: "Review the member's submissions, drafts, and statuses.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/my-submissions-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/frontend-user-read-pages.test.tsx", "test/worker/submissions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-002"], gaps: ["Current server-navigation entry plus loading, empty, retryable error, and response-owned ready marker are runtime-probed. Resubmission and complete status recovery remain incomplete; release and signed-browser evidence remain absent."],
  },
  {
    id: "workbench-tasks", routeId: "tasks", pathname: "/tasks", requiredRole: "contributor",
    journey: "Create, filter, update, and remove private workspace tasks.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/tasks/tasks-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/tasks.ts", "src/tasks/service.ts"], testEvidence: ["test/unit/frontend-tasks-route.test.tsx", "test/worker/tasks.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["TSK-001", "TSK-002"], gaps: ["Current permitted/revoked server projections, forbidden direct route, and loading, empty, retryable error, and response-owned ready marker are runtime-probed. Mutations, deletion recovery, idempotency/concurrency, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-boards", routeId: "boards", pathname: "/boards", requiredRole: "contributor",
    journey: "View task status columns and move a task between them.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/boards/boards-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/tasks.ts", "src/tasks/service.ts"], testEvidence: ["test/unit/frontend-boards-route.test.tsx", "test/worker/tasks.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["BRD-001", "BRD-002"], gaps: ["Current server-navigation entry and exhaustive four-column loading, empty, retryable error, and response-owned ready fixtures are runtime-probed. Drag/keyboard movement, rollback, concurrency, release, and signed-browser journeys remain incomplete."],
  },
  {
    id: "workbench-settings", routeId: "settings", pathname: "/settings", requiredRole: "contributor",
    journey: "Review account information and change supported workbench settings.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/settings-page.tsx", "frontend/components/shell/app-shell.tsx"], backendEvidence: ["src/identity/session.ts"], testEvidence: ["test/unit/settings-page.test.tsx", "test/unit/workspace-shell.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["WB-SETTINGS"], gaps: ["The account-menu entry and page-owned session email are runtime-probed. The page has no route-owned loading, empty, retryable error, persistence, or save-pending boundary; release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin", routeId: "admin", pathname: "/admin", requiredRole: "admin",
    journey: "Review administration summary metrics and enter a governance area.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/admin-dashboard-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/navigation.ts"], testEvidence: ["test/unit/frontend-admin-pages.test.tsx", "test/worker/assets.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-001"], gaps: ["Current admin server projection, page-owned quick link, contributor omission, and forbidden direct route are runtime-probed. Dashboard metrics are hard-coded zeros with no route-owned loading, empty, retryable error, release, or signed-browser evidence."],
  },
  {
    id: "workbench-admin-submissions", routeId: "admin-submissions", pathname: "/admin/submissions", requiredRole: "admin",
    journey: "Review submitted knowledge and make a publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned ready marker are runtime-probed. The initial error has no retry action; list-to-detail discovery, decision completion, idempotency, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-duplicates", routeId: "admin-duplicates", pathname: "/admin/duplicates", requiredRole: "admin",
    journey: "Review duplicate candidates and apply a decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/duplicate-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/duplicates/service.ts"], testEvidence: ["test/unit/frontend-admin-duplicates.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-003"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned ready marker are runtime-probed. The initial error has no retry action; decision convergence, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-assets", routeId: "admin-assets", pathname: "/admin/assets", requiredRole: "admin",
    journey: "Review source assets, inspect previews, and retry failed parsing.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/asset-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/assets/service.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-assets-data.test.ts", "test/worker/m2-assets.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-004"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned asset marker are runtime-probed. Initial-load retry is absent; parse-progress, full recovery, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-admin-members", routeId: "admin-members", pathname: "/admin/members", requiredRole: "admin",
    journey: "List members and update an allowed member's status.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/members-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/members/service.ts"], testEvidence: ["test/unit/frontend-admin-pages.test.tsx", "test/worker/members.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-005"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned member marker are runtime-probed. Initial-load retry, disablement/cache invalidation, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-roles", routeId: "admin-roles", pathname: "/admin/roles", requiredRole: "admin",
    journey: "Manage role permission assignments and memberships.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/roles-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/roles-repository.ts"], testEvidence: ["test/worker/admin-roles.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-006"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned role marker are runtime-probed. Initial-load retry, malformed elevated contributor sessions, backend/signed projection, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-menus", routeId: "admin-menus", pathname: "/admin/menus", requiredRole: "admin",
    journey: "Manage server-owned navigation menu hierarchy and availability.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/menus-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/menus-repository.ts"], testEvidence: ["test/unit/admin-menus-page.test.tsx", "test/worker/admin-menus.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-007"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned menu marker are runtime-probed. Initial-load retry, cross-session projection invalidation, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-spaces", routeId: "admin-spaces", pathname: "/admin/spaces", requiredRole: "admin",
    journey: "Create and govern knowledge spaces and collections.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/spaces-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/spaces/service.ts"], testEvidence: ["test/unit/spaces-service.test.ts", "test/worker/spaces.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-008"], gaps: ["Current admin server-navigation entry plus loading, empty, initial error, and response-owned space marker are runtime-probed. Initial-load retry, archive/content impact, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-admin-audit", routeId: "admin-audit", pathname: "/admin/audit", requiredRole: "admin",
    journey: "Filter redacted audit events and inspect their related entities.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/audit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/audit/repository.ts"], testEvidence: ["test/unit/audit.test.ts", "test/worker/admin-audit.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-009"], gaps: ["Current admin server-navigation entry and loading state are runtime-probed. Empty and ready fixtures expose an incompatible raw-page versus {generation,page} destructure in AdminAuditRoute and are explicit gaps; initial error has no retry action. Related navigation, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-analytics", routeId: "admin-analytics", pathname: "/admin/analytics", requiredRole: "admin",
    journey: "Inspect analytical trends, rankings, and visitors across a date range.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/analytics-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/analytics/repository.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-analytics-route.test.tsx", "test/worker/analytics.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-010"], gaps: ["Current admin server-navigation entry plus loading, empty-data, initial error, and response-owned ready path are runtime-probed. Initial error has no retry action; full date-range/pagination, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-notifications", routeId: "notifications", pathname: "/notifications", requiredRole: "contributor",
    journey: "Review, filter, and mark workspace notifications as read.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/notifications/notifications-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/notifications.ts", "src/notifications/service.ts"], testEvidence: ["test/unit/frontend-notifications-route.test.tsx", "test/worker/notifications.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["NTF-001", "NTF-003", "NTF-004"], gaps: ["Current server-navigation entry plus loading, empty, retryable error, and response-owned notification marker are runtime-probed. Revoked-target navigation, top-bar convergence, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-messages", routeId: "messages", pathname: "/messages", requiredRole: "contributor",
    journey: "Find a contextual discussion and reply to its current authorized thread.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/messages-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["MSG-001", "MSG-002", "MSG-004"], gaps: ["Current server-navigation entry plus loading, empty, retryable error, and response-owned thread link are runtime-probed. Contextual discovery, explicit stale/revoked target presentation, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-knowledge-reader", routeId: "knowledge-reader", pathname: "/knowledge/:id", parentRouteId: "knowledge", routePattern: "/^\\/knowledge\\/[A-Za-z0-9_-]+$/u", requiredRole: "contributor",
    journey: "Open an authorized knowledge item and inspect its reader content.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/knowledge-reader-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/library.ts", "src/library/service.ts"], testEvidence: ["test/unit/frontend-knowledge-reader-data.test.ts", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-006"], gaps: ["The current knowledge owner entry plus direct loading, retryable error, and response-owned reader marker are runtime-probed without a duplicate global entry; the route harness isolates DOM sanitization. Missing revision is an error, not empty, and list-to-reader discovery, integrated sanitizer rendering, related/backlink/favorite/revision journeys, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-message-thread", routeId: "message-thread", pathname: "/messages/:id", parentRouteId: "messages", routePattern: "/^\\/messages\\/[A-Za-z0-9_-]{1,128}$/u", requiredRole: "contributor",
    journey: "Open an authorized contextual discussion thread and read its messages.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/thread-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["MSG-002", "MSG-004"], gaps: ["The current messages owner entry plus direct loading, empty, retryable error, and response-owned private-message marker are runtime-probed without a duplicate global entry. Runtime target re-authorization is source-audited; context 403 removes private thread content but renders a generic retryable error. Explicit revoked presentation, list discovery, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-submission-detail", routeId: "admin-submission-detail", pathname: "/admin/submissions/:id", parentRouteId: "admin-submissions", routePattern: "/^\\/admin\\/submissions\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open a reviewable submission and make an authorized publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-detail-route.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["The current review-queue owner entry plus direct loading, initial error, and response-owned detail title are runtime-probed without a duplicate global entry. Missing preview is an error rather than empty and initial error has no retry; queue-to-detail discovery, decision idempotency, release, and signed-browser acceptance remain gaps."],
  },
] as const satisfies readonly WorkbenchMaturityCapability[]);

// Kept as a separately frozen, one-to-one ledger so Task 1's fail-closed AST
// contract remains stable. scripts/workbench-domain-audit.mjs rejects missing,
// duplicate, or unknown capability IDs before joining these records.
export const WORKBENCH_MATURITY_DOMAIN_EVIDENCE = Object.freeze([
  {
    id: "workbench-home",
    apiPaths: ["/api/knowledge/recent"],
    persistencePaths: ["src/recent-visits/repository.ts", "migrations/0024_m4_knowledge_visits.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; RecentVisitsRepository predicates knowledge_visits.member_id = ? with scope.memberId.",
    pagination: "cursor",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-submit",
    apiPaths: ["/api/submissions"],
    persistencePaths: ["src/submissions/repository.ts", "migrations/0003_m1_knowledge_loop.sql"],
    ownerPredicate: "routeMemberApi passes authenticated member.memberId as submitterId; SubmissionsRepository scopes idempotency replay and writes by submitter_id.",
    pagination: "not_applicable",
    mutations: ["POST /api/submissions — proven: submitter-scoped Idempotency-Key replay"],
    mutationSafety: "idempotency_key",
  },
  {
    id: "workbench-knowledge",
    apiPaths: ["/api/knowledge", "/api/knowledge/recent", "/api/knowledge/favorites", "/api/knowledge/research-runs", "/api/knowledge/notes", "/api/knowledge/review"],
    persistencePaths: ["src/library/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; LibraryRepository authorization binds scope.memberId before applying revision visibility predicates.",
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-search",
    apiPaths: ["/api/knowledge/search", "/api/saved-views", "/api/saved-views/:id"],
    persistencePaths: ["src/library/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; LibraryRepository search binds scope.memberId through the authorized member CTE before visibility filtering.",
    pagination: "numbered",
    mutations: ["POST /api/saved-views — gap: server-generated create has no client idempotency key", "DELETE /api/saved-views/:id — gap: repeated deletion does not converge"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-agent",
    apiPaths: ["/api/knowledge/chat", "/api/knowledge/chat/conversations/:id/scope", "/api/knowledge/chat/conversations/:id/cancel"],
    persistencePaths: ["src/chat/repository.ts", "migrations/0019_m5_chat_conversations.sql", "migrations/0020_m5_chat_cancel.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; ChatConversationService and ChatRepository bind owner_member_id to scope.memberId for conversation reads and writes.",
    pagination: "not_applicable",
    mutations: ["POST /api/knowledge/chat — gap: no stable client idempotency key for repeated questions", "PATCH /api/knowledge/chat/conversations/:id/scope — gap: no expected version is supplied", "POST /api/knowledge/chat/conversations/:id/cancel — gap: no replay key is supplied"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-my-submissions",
    apiPaths: ["/api/submissions/mine"],
    persistencePaths: ["src/submissions/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeMemberApi passes authenticated member.memberId to SubmissionsService.listOwn; SubmissionsRepository predicates submissions.submitter_id = ? for both items and total.",
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-tasks",
    apiPaths: ["/api/tasks", "/api/tasks/:id", "/api/tasks/:id/status", "/api/tasks/:id/progress", "/api/tasks/:id/tags", "/api/tasks/:id/links", "/api/tasks/:id/links/:linkId"],
    persistencePaths: ["src/tasks/repository.ts", "migrations/0032_workspace_tasks.sql", "migrations/0033_numbered_pagination_indexes.sql", "migrations/0036_workbench_notifications.sql"],
    ownerPredicate: "routeTasksApi passes authenticated member.memberId to TasksService; TasksRepository predicates tasks.member_id = ? and task child tables by member_id.",
    pagination: "numbered",
    mutations: ["POST /api/tasks — proven: stable client task id with INSERT OR IGNORE replay", "POST /api/tasks/:id/status — proven: expected-status conditional write", "DELETE /api/tasks/:id — gap: repeated deletion returns not-found rather than converging", "PATCH/POST/PUT task detail mutations — gap: no expected version is supplied"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-boards",
    apiPaths: ["/api/tasks", "/api/tasks/:id/status"],
    persistencePaths: ["src/tasks/repository.ts", "migrations/0032_workspace_tasks.sql", "migrations/0033_numbered_pagination_indexes.sql", "migrations/0036_workbench_notifications.sql"],
    ownerPredicate: "routeTasksApi passes authenticated member.memberId to TasksService; board lists and status updates remain predicates on tasks.member_id = ?.",
    pagination: "numbered",
    mutations: ["POST /api/tasks/:id/status — proven: repository compares the previously read status before update"],
    mutationSafety: "conditional_write",
  },
  {
    id: "workbench-settings",
    apiPaths: ["/api/session"],
    persistencePaths: ["src/identity/session.ts", "migrations/0002_github_auth.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin",
    apiPaths: ["/api/navigation"],
    persistencePaths: ["src/authorization/menus-repository.ts", "migrations/0029_workspace_rbac.sql", "migrations/0031_workspace_menu_hierarchy.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin-submissions",
    apiPaths: ["/api/admin/submissions"],
    persistencePaths: ["src/submissions/repository.ts", "src/publication/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin-duplicates",
    apiPaths: ["/api/admin/duplicates", "/api/admin/duplicates/:submissionId/decision"],
    persistencePaths: ["src/duplicates/repository.ts", "migrations/0027_duplicate_candidates.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/duplicates/:submissionId/decision — proven: decision = pending compare-and-set with same-reviewer replay"],
    mutationSafety: "conditional_write",
  },
  {
    id: "workbench-admin-assets",
    apiPaths: ["/api/admin/assets", "/api/admin/assets/:id/preview", "/api/admin/assets/:id/retry"],
    persistencePaths: ["src/assets/repository.ts", "migrations/0005_m2_asset_ingestion.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/assets/:id/retry — gap: read-before-reset is not an atomic conditional write"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-members",
    apiPaths: ["/api/admin/members", "/api/admin/members/:id/status"],
    persistencePaths: ["src/members/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["PATCH /api/admin/members/:id/status — gap: no expected status or version is supplied"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-roles",
    apiPaths: ["/api/admin/roles", "/api/admin/roles/:id", "/api/admin/roles/:id/members"],
    persistencePaths: ["src/authorization/roles-repository.ts", "migrations/0029_workspace_rbac.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/roles — gap: server-generated create has no client idempotency key", "PATCH /api/admin/roles/:id — gap: update has no expected version or conditional predicate", "POST /api/admin/roles/:id/members — gap: duplicate assignment returns 409 rather than replay success", "DELETE /api/admin/roles/:id/members — gap: repeated removal returns 404 rather than converging"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-menus",
    apiPaths: ["/api/admin/menus", "/api/admin/menus/:id"],
    persistencePaths: ["src/authorization/menus-repository.ts", "migrations/0029_workspace_rbac.sql", "migrations/0031_workspace_menu_hierarchy.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["PATCH /api/admin/menus/:id — gap: no expected version protects concurrent menu edits", "DELETE /api/admin/menus/:id — gap: repeated deletion returns not-found rather than converging"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-spaces",
    apiPaths: ["/api/admin/spaces", "/api/admin/spaces/:id/collections"],
    persistencePaths: ["src/spaces/repository.ts", "migrations/0001_phase1_control_plane.sql"],
    ownerPredicate: null,
    pagination: "cursor",
    mutations: ["POST /api/admin/spaces — gap: the visible server-generated create has no client idempotency key"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-admin-audit",
    apiPaths: ["/api/admin/audit-events"],
    persistencePaths: ["src/audit/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin-analytics",
    apiPaths: ["/api/admin/analytics/overview"],
    persistencePaths: ["src/analytics/repository.ts", "migrations/0026_site_analytics.sql", "migrations/0030_site_analytics_dimensions.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-notifications",
    apiPaths: ["/api/notifications", "/api/notifications/summary", "/api/notifications/:id/read", "/api/notifications/read"],
    persistencePaths: ["src/notifications/repository.ts", "migrations/0036_workbench_notifications.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: "routeNotificationsApi passes authenticated member.memberId as recipientMemberId; NotificationsRepository predicates recipient_member_id = ? for items, total, and writes.",
    pagination: "numbered",
    mutations: ["POST /api/notifications/:id/read — proven: recipient-scoped read_at IS NULL conditional write", "POST /api/notifications/read — proven: bounded recipient-scoped unread selection"],
    mutationSafety: "conditional_write",
  },
  {
    id: "workbench-messages",
    apiPaths: ["/api/discussions", "/api/discussions/context"],
    persistencePaths: ["src/discussions/authorization.ts", "src/discussions/repository.ts", "migrations/0037_workbench_discussions.sql"],
    ownerPredicate: "routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks task ownership or current knowledge visibility before listing or writing.",
    pagination: "cursor",
    mutations: ["POST /api/discussions/context — gap: server-generated thread create has no client idempotency key"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-knowledge-reader",
    apiPaths: ["/api/knowledge/:id", "/api/knowledge/:id/favorite", "/api/knowledge/:id/note", "/api/knowledge/:id/note/shares", "/api/knowledge/:id/note/shares/:recipientId", "/api/knowledge/:id/related", "/api/knowledge/:id/backlinks"],
    persistencePaths: ["src/library/repository.ts", "src/favorites/repository.ts", "src/private-notes/repository.ts", "src/recent-visits/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0012_m5_private_notes.sql", "migrations/0023_m4_knowledge_favorites.sql", "migrations/0024_m4_knowledge_visits.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; reader, favorite, private-note, and visit repositories bind scope.memberId and re-authorize the current knowledge revision.",
    pagination: "not_applicable",
    mutations: ["PUT /api/knowledge/:id/favorite — proven: member-scoped conflict-ignore converges", "DELETE /api/knowledge/:id/favorite — gap: repeated delete behavior is not proven", "PUT /api/knowledge/:id/note — gap: no expected version protects concurrent note edits", "POST/DELETE note shares — gap: no replay key or expected version is supplied", "reader visit recording — gap: repeated GET increments visit_count and is intentionally not retry-idempotent"],
    mutationSafety: "mixed",
  },
  {
    id: "workbench-message-thread",
    apiPaths: ["/api/discussions/:id", "/api/discussions/:id/messages", "/api/discussions/messages"],
    persistencePaths: ["src/discussions/authorization.ts", "src/discussions/repository.ts", "migrations/0037_workbench_discussions.sql"],
    ownerPredicate: "routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks the thread context before message reads and sends.",
    pagination: "cursor",
    mutations: ["POST /api/discussions/messages — proven: author_member_id plus client_key uniquely replays a send"],
    mutationSafety: "idempotency_key",
  },
  {
    id: "workbench-admin-submission-detail",
    apiPaths: ["/api/admin/submissions/:id", "/api/admin/submissions/:id/publish", "/api/admin/submissions/:id/request-revision", "/api/admin/submissions/:id/reject", "/api/admin/submissions/:id/comments"],
    persistencePaths: ["src/publication/repository.ts", "src/submissions/repository.ts", "src/review-comments/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0022_m4_review_comments.sql"],
    ownerPredicate: null,
    pagination: "not_applicable",
    mutations: ["POST /api/admin/submissions/:id/publish — gap: no client replay key or expected version is supplied", "POST request-revision/reject — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/comments — gap: no client idempotency key"],
    mutationSafety: "mixed",
  },
] as const satisfies readonly WorkbenchMaturityDomainEvidence[]);
