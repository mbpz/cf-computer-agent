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

export interface WorkbenchMutationStrategyBinding {
  readonly capabilityId: string;
  readonly operation: string;
  readonly strategy: Exclude<WorkbenchMutationSafety, "mixed" | "not_applicable">;
  readonly source: {
    readonly path: string;
    readonly symbol: string;
    readonly tokens: readonly string[];
  };
  readonly tests: readonly {
    readonly path: string;
    readonly tokens: readonly string[];
  }[];
}

export interface WorkbenchOperationRoot {
  readonly capabilityId: string;
  readonly path: string;
  readonly symbol: string;
}

export interface WorkbenchSourceSideEffectBinding {
  readonly capabilityId: string;
  readonly operation: string;
  readonly apiPath: string;
  readonly source: WorkbenchMutationStrategyBinding["source"];
  readonly tests: WorkbenchMutationStrategyBinding["tests"];
}

export const WORKBENCH_MUTATION_STRATEGY_BINDINGS = Object.freeze([
  {
    capabilityId: "workbench-agent", operation: "POST /api/knowledge/chat/conversations/:id/feedback", strategy: "conditional_write",
    source: { path: "src/chat/feedback-repository.ts", symbol: "D1ChatFeedbackRepository.save", tokens: ["ON CONFLICT(conversation_id, member_id) DO UPDATE", "rating = excluded.rating", "citation_ids_json = excluded.citation_ids_json"] },
    tests: [{ path: "test/worker/m1-api.test.ts", tokens: ["persists a bounded owner-scoped chat history and rejects scope widening", "feedbackReplay.status", "SELECT COUNT(*) AS count FROM chat_feedback", "count: 1"] }],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets", strategy: "idempotency_key",
    source: {"path": "src/assets/service.ts", "symbol": "AssetService.create", "tokens": ["findByIdempotency", "if (replay) return replay"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["replays an idempotent upload and hides another member's asset"]}],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id", strategy: "conditional_write",
    source: {"path": "src/assets/repository.ts", "symbol": "AssetsRepository.claimParseJob", "tokens": ["status IN ('queued', 'failed_retryable')", "result.meta.changes"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["processes a text original and exposes the succeeded parse state", "attempts: 1"]}],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id/cancel", strategy: "conditional_write",
    source: {"path": "src/assets/repository.ts", "symbol": "AssetsRepository.cancelOwned", "tokens": ["owner_id = ?", "status IN ('queued', 'failed_retryable')", "meta.changes"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["does not cancel an asset that is already processing or parsed", "ASSET_CANCEL_CONFLICT"]}],
  },
  {
    capabilityId: "workbench-submit", operation: "POST /api/assets/:id/submit", strategy: "idempotency_key",
    source: {"path": "src/routes/member.ts", "symbol": "routeMemberApi", "tokens": ["findByIdempotencyKey", "replay?.submission.assetId === assetId"]},
    tests: [{"path": "test/worker/m2-assets.test.ts", "tokens": ["atomically pairs a succeeded asset with its review submission", "ASSET_ALREADY_SUBMITTED"]}],
  },
  {
    capabilityId: "workbench-submit",
    operation: "POST /api/submissions",
    strategy: "idempotency_key",
    source: { path: "src/submissions/repository.ts", symbol: "SubmissionsRepository.findByIdempotencyKey", tokens: ["s.submitter_id = ?", "s.idempotency_key = ?"] },
    tests: [{ path: "test/worker/submissions.test.ts", tokens: ["returns an exact replay and rejects changed content or target for the same member key", "submissions: 1"] }],
  },
  {
    capabilityId: "workbench-tasks",
    operation: "POST /api/tasks",
    strategy: "idempotency_key",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.insert", tokens: ["INSERT OR IGNORE INTO tasks"] },
    tests: [{ path: "test/worker/tasks.test.ts", tokens: ["creates idempotently, lists, updates, transitions, and deletes", "created: false"] }],
  },
  {
    capabilityId: "workbench-tasks",
    operation: "POST /api/tasks/:id/status",
    strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["expectedStatus", "AND status = ?"] },
    tests: [{ path: "test/unit/tasks-service.test.ts", tokens: ["compareAndSetStatus", "previousStatus: expectedStatus"] }],
  },
  {
    capabilityId: "workbench-boards",
    operation: "POST /api/tasks/:id/status",
    strategy: "conditional_write",
    source: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["expectedStatus", "AND status = ?"] },
    tests: [{ path: "test/unit/tasks-service.test.ts", tokens: ["compareAndSetStatus", "previousStatus: expectedStatus"] }],
  },
  {
    capabilityId: "workbench-admin-duplicates",
    operation: "POST /api/admin/duplicates/:submissionId/decision",
    strategy: "conditional_write",
    source: { path: "src/duplicates/repository.ts", symbol: "DuplicateCandidatesRepository.decide", tokens: ["current.decision === decision", "current.decidedBy === reviewerId", "AND decision = 'pending'"] },
    tests: [{ path: "test/worker/submissions.test.ts", tokens: ["keeps exact duplicate decisions admin-scoped, idempotent, and audited", "DUPLICATE_DECISION_CONFLICT"] }],
  },
  {
    capabilityId: "workbench-notifications",
    operation: "POST /api/notifications/:id/read",
    strategy: "conditional_write",
    source: { path: "src/notifications/repository.ts", symbol: "NotificationsRepository.markRead", tokens: ["recipient_member_id = ?", "read_at IS NULL", "result.meta.changes === 1"] },
    tests: [{ path: "test/worker/notifications.test.ts", tokens: ["marks one notification replay-safely and returns 404 across recipients", "toEqual(firstBody)"] }],
  },
  {
    capabilityId: "workbench-notifications",
    operation: "POST /api/notifications/read",
    strategy: "conditional_write",
    source: { path: "src/notifications/repository.ts", symbol: "NotificationsRepository.markManyRead", tokens: ["recipient_member_id = ?", "read_at IS NULL", "selection.limit"] },
    tests: [{ path: "test/worker/notifications.test.ts", tokens: ["marks only a bounded visible ID set and converges on bulk replay", "marked: 0"] }],
  },
  {
    capabilityId: "workbench-knowledge-reader",
    operation: "PUT /api/knowledge/:id/favorite",
    strategy: "idempotency_key",
    source: { path: "src/favorites/repository.ts", symbol: "FavoritesRepository.add", tokens: ["ON CONFLICT(member_id, knowledge_item_id) DO NOTHING"] },
    tests: [{ path: "test/worker/favorites.test.ts", tokens: ["keeps favorites private, visible only for readable knowledge, and removable", "favorite: true"] }],
  },
  {
    capabilityId: "workbench-message-thread",
    operation: "POST /api/discussions/messages",
    strategy: "idempotency_key",
    source: { path: "src/discussions/service.ts", symbol: "DiscussionsService.sendMessage", tokens: ["findMessageByAuthorClientKey", "normalized.clientKey"] },
    tests: [{ path: "test/worker/discussions.test.ts", tokens: ["sends idempotently, validates replies and mentions, and keeps route ordering canonical", "created: false"] }],
  },
] as const satisfies readonly WorkbenchMutationStrategyBinding[]);

export const WORKBENCH_SOURCE_SIDE_EFFECT_BINDINGS = Object.freeze([
  {
    capabilityId: "workbench-review",
    operation: "GET /api/workbench/review#persist-snapshot",
    apiPath: "/api/workbench/review",
    source: { path: "src/workbench-review/service.ts", symbol: "WorkbenchReviewService.get", tokens: ["this.repository.find(memberId, value, range.periodKey)", "this.repository.upsert(memberId"] },
    tests: [{ path: "test/worker/workbench-review.test.ts", tokens: ["returns a private deterministic snapshot and rejects unknown query keys", "periodKey"] }],
  },
  {
    capabilityId: "workbench-knowledge-reader",
    operation: "GET /api/knowledge/:id#record-visit",
    apiPath: "/api/knowledge/:id",
    source: { path: "src/routes/library.ts", symbol: "routeLibraryApi", tokens: ["services.library.detail(scope, knowledgeItemId)", "services.recentVisits.record(scope, knowledgeItemId)"] },
    tests: [{ path: "test/worker/recent-visits.test.ts", tokens: ["records successful detail reads, deduplicates counts, and paginates privately", "visitCount: 2"] }],
  },
] as const satisfies readonly WorkbenchSourceSideEffectBinding[]);

export const WORKBENCH_OPERATION_ROOTS = Object.freeze([
  { capabilityId: "workbench-graph", path: "frontend/pages/graph-page.tsx", symbol: "GraphRoute" },
  { capabilityId: "workbench-graph", path: "frontend/pages/graph-page.tsx", symbol: "GraphPage" },
  { capabilityId: "workbench-project-timeline", path: "frontend/app.tsx", symbol: "ProjectTimelineRoute" },
  { capabilityId: "workbench-inbox", path: "frontend/app.tsx", symbol: "InboxRoute" },
  { capabilityId: "workbench-goals", path: "frontend/app.tsx", symbol: "GoalsRoute" },
  { capabilityId: "workbench-projects", path: "frontend/app.tsx", symbol: "ProjectsRoute" },
  { capabilityId: "workbench-calendar", path: "frontend/app.tsx", symbol: "CalendarRoute" },
  { capabilityId: "workbench-today", path: "frontend/app.tsx", symbol: "TodayRoute" },
  { capabilityId: "workbench-focus", path: "frontend/app.tsx", symbol: "FocusRoute" },
  { capabilityId: "workbench-review", path: "frontend/app.tsx", symbol: "WorkbenchReviewRoute" },
  { capabilityId: "workbench-home", path: "frontend/app.tsx", symbol: "HomeRoute" },
  { capabilityId: "workbench-submit", path: "frontend/app.tsx", symbol: "SubmitRoute" },
  { capabilityId: "workbench-knowledge", path: "frontend/app.tsx", symbol: "KnowledgeRoute" },
  { capabilityId: "workbench-search", path: "frontend/app.tsx", symbol: "SearchRoute" },
  { capabilityId: "workbench-search", path: "frontend/lib/search-data.ts", symbol: "*" },
  { capabilityId: "workbench-agent", path: "frontend/app.tsx", symbol: "AgentRoute" },
  { capabilityId: "workbench-agent", path: "frontend/app.tsx", symbol: "AgentConversationRoute" },
  { capabilityId: "workbench-agent", path: "frontend/lib/agent-data.ts", symbol: "*" },
  { capabilityId: "workbench-agent", path: "frontend/lib/agent-turn-intent.ts", symbol: "*" },
  { capabilityId: "workbench-agent", path: "frontend/components/agent/agent-feedback.tsx", symbol: "AgentFeedback" },
  { capabilityId: "workbench-agent", path: "frontend/components/agent/agent-history-list.tsx", symbol: "AgentHistoryList" },
  { capabilityId: "workbench-my-submissions", path: "frontend/app.tsx", symbol: "MySubmissionsRoute" },
  { capabilityId: "workbench-tasks", path: "frontend/app.tsx", symbol: "TasksRoute" },
  { capabilityId: "workbench-tasks", path: "frontend/lib/tasks-data.ts", symbol: "*" },
  { capabilityId: "workbench-boards", path: "frontend/app.tsx", symbol: "BoardsRoute" },
  { capabilityId: "workbench-settings", path: "frontend/pages/settings-page.tsx", symbol: "SettingsPage" },
  { capabilityId: "workbench-admin", path: "frontend/pages/admin/admin-dashboard-route.tsx", symbol: "AdminDashboardRoute" },
  { capabilityId: "workbench-admin-submissions", path: "frontend/app.tsx", symbol: "ReviewQueueRoute" },
  { capabilityId: "workbench-admin-duplicates", path: "frontend/app.tsx", symbol: "AdminDuplicateRoute" },
  { capabilityId: "workbench-admin-duplicates", path: "frontend/lib/admin-duplicates-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-assets", path: "frontend/app.tsx", symbol: "AdminAssetsRoute" },
  { capabilityId: "workbench-admin-assets", path: "frontend/lib/admin-assets-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-members", path: "frontend/app.tsx", symbol: "AdminMembersRoute" },
  { capabilityId: "workbench-admin-members", path: "frontend/lib/admin-members-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-roles", path: "frontend/app.tsx", symbol: "AdminRolesRoute" },
  { capabilityId: "workbench-admin-roles", path: "frontend/lib/admin-roles-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-menus", path: "frontend/app.tsx", symbol: "AdminMenusRoute" },
  { capabilityId: "workbench-admin-menus", path: "frontend/lib/admin-menus-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-spaces", path: "frontend/app.tsx", symbol: "AdminSpacesRoute" },
  { capabilityId: "workbench-admin-spaces", path: "frontend/lib/admin-spaces-data.ts", symbol: "*" },
  { capabilityId: "workbench-admin-audit", path: "frontend/app.tsx", symbol: "AdminAuditRoute" },
  { capabilityId: "workbench-admin-analytics", path: "frontend/app.tsx", symbol: "AdminAnalyticsRoute" },
  { capabilityId: "workbench-notifications", path: "frontend/app.tsx", symbol: "NotificationsRoute" },
  { capabilityId: "workbench-notifications", path: "frontend/lib/notifications-data.ts", symbol: "*" },
  { capabilityId: "workbench-messages", path: "frontend/app.tsx", symbol: "MessagesRoute" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/app.tsx", symbol: "KnowledgeReaderRoute" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/app.tsx", symbol: "KnowledgeReaderSession" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/lib/graph-evidence.ts", symbol: "loadGraphCitation" },
  { capabilityId: "workbench-knowledge-reader", path: "frontend/lib/knowledge-reader-data.ts", symbol: "*" },
  { capabilityId: "workbench-message-thread", path: "frontend/app.tsx", symbol: "DiscussionThreadRoute" },
  { capabilityId: "workbench-admin-submission-detail", path: "frontend/pages/admin/review-detail-route.tsx", symbol: "ReviewDetailRoute" },
] as const satisfies readonly WorkbenchOperationRoot[]);

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
    id: "workbench-graph", routeId: "graph", pathname: "/graph", requiredRole: "contributor",
    journey: "Explore authorized knowledge and private work relationships, inspect evidence and explicitly promote selected nodes into work.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/graph-page.tsx", "frontend/lib/graph-data.ts", "frontend/lib/graph-actions.ts"], backendEvidence: ["src/routes/graph.ts", "src/graph/service.ts", "src/graph/repository.ts"], testEvidence: ["test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-graph-a11y.test.tsx", "test/worker/graph.test.ts", "test/worker/graph-actions.test.ts"], ledgerIds: ["WB-GR-001"], gaps: ["Graph entry, read states, keyboard navigation and bounded member-scoped projections have local coverage. Cursor continuation, cross-linked citation edge cases and complete action replay journeys remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-project-timeline", routeId: "project-timeline", pathname: "/projects/:id/timeline", parentRouteId: "projects", routePattern: "/^\\/projects\\/[A-Za-z0-9_-]{1,128}\\/timeline$/u", requiredRole: "contributor",
    journey: "Open an owned project timeline, record decisions or actions and update their status.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/project-timeline-page.tsx", "frontend/lib/projects-data.ts"], backendEvidence: ["src/routes/project-timeline.ts", "src/project-timeline/service.ts", "src/project-timeline/repository.ts", "src/routes/projects.ts"], testEvidence: ["test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-project-timeline-page.test.tsx", "test/worker/project-timeline.test.ts"], ledgerIds: ["PRJ-001"], gaps: ["Private timeline read states are locally probed. Numbered pagination, project-switch stale guards, complete editing, stable create intent and conditional status convergence remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-inbox", routeId: "inbox", pathname: "/inbox", requiredRole: "contributor",
    journey: "Capture private material, archive it or promote it into an owned task.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/inbox-page.tsx", "frontend/lib/inbox-data.ts"], backendEvidence: ["src/routes/inbox.ts", "src/inbox/service.ts", "src/inbox/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/inbox.test.ts"], ledgerIds: ["INB-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. Numbered pagination, stable frontend create intent, archive/promotion retry convergence and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-goals", routeId: "goals", pathname: "/goals", requiredRole: "contributor",
    journey: "Create private goals and maintain their status and progress.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/goals-page.tsx", "frontend/lib/goals-data.ts"], backendEvidence: ["src/routes/goals.ts", "src/goals/service.ts", "src/goals/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/goals.test.ts"], ledgerIds: ["GL-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. Numbered pagination, editing and relationship journeys, stable create intent, conditional progress/status writes and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-projects", routeId: "projects", pathname: "/projects", requiredRole: "contributor",
    journey: "Create private projects and inspect their goal/task summaries.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/projects-page.tsx", "frontend/lib/projects-data.ts"], backendEvidence: ["src/routes/projects.ts", "src/projects/service.ts", "src/projects/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/projects.test.ts"], ledgerIds: ["PRJ-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. Numbered pagination, relationship editing, per-project summary recovery, stable create intent, status concurrency and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-calendar", routeId: "calendar", pathname: "/calendar", requiredRole: "contributor",
    journey: "Schedule private events and cancel them within the calendar window.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/calendar-page.tsx", "frontend/lib/calendar-data.ts"], backendEvidence: ["src/routes/calendar.ts", "src/calendar/service.ts", "src/calendar/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/calendar.test.ts"], ledgerIds: ["CAL-001"], gaps: ["Private entry, read recovery, empty state and cursor continuation are locally tested. The fixed fourteen-day window lacks date navigation and numbered pagination; editing, stable create intent, cancel concurrency and timezone boundaries remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-today", routeId: "today", pathname: "/today", requiredRole: "contributor",
    journey: "Review today's owned tasks, inbox, projects and events and continue working.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/today-page.tsx", "frontend/lib/today-data.ts"], backendEvidence: ["src/routes/today.ts", "src/today/service.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/today.test.ts"], ledgerIds: ["TOD-001"], gaps: ["Private entry, read recovery and local section empty states are tested. The bounded snapshot lacks continuation, actionable drill-down, deep payload validation and complete timezone/two-member aggregation proof; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-focus", routeId: "focus", pathname: "/focus", requiredRole: "contributor",
    journey: "Start focus on an owned task, pause, resume and finish or abandon the session.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/focus-page.tsx", "frontend/lib/focus-data.ts"], backendEvidence: ["src/routes/focus.ts", "src/focus/service.ts", "src/focus/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/focus.test.ts"], ledgerIds: ["FOC-001"], gaps: ["Private entry, read recovery and the null-session start form are locally tested. Task selection, stable start intent, transition concurrency, elapsed-time accuracy and stale-response protection remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-review", routeId: "review", pathname: "/review", requiredRole: "contributor",
    journey: "Inspect private daily or weekly review snapshots and continue from their source work.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/app.tsx", "frontend/pages/workbench-review-page.tsx", "frontend/lib/workbench-review-data.ts"], backendEvidence: ["src/routes/workbench-review.ts", "src/workbench-review/service.ts", "src/workbench-review/repository.ts"], testEvidence: ["test/unit/frontend-workbench-extended-routes.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/worker/workbench-review.test.ts"], ledgerIds: ["REV-001"], gaps: ["Private entry, read recovery and local section empty states are tested. Period labels can lead stale content; bounded unfiltered aggregation, snapshot refresh semantics, GET write concurrency, deep payload validation and two-member proof remain incomplete; release and signed-browser acceptance are unproven."],
  },
  {
    id: "workbench-home", routeId: "home", pathname: "/", requiredRole: "contributor",
    journey: "Open the workbench and review the current capability summary.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/home-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/workspace-dashboard.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["WB-001", "WB-002"], gaps: ["The current server-navigation entry and a response-owned recent-item ready marker are fixture-proven. Home renders ready while recent data is pending, collapses recent failure to empty, hard-codes zero metrics, and has no retryable route error. The recent API is cursor-paged, but Home exposes no continuation control. Release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-submit", routeId: "submit", pathname: "/submit", requiredRole: "contributor",
    journey: "Submit knowledge for parsing and later review.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/submit-page.tsx", "frontend/app.tsx", "frontend/components/assets/asset-availability-panel.tsx", "frontend/lib/asset-availability.ts", "frontend/components/assets/asset-upload-panel.tsx", "frontend/lib/asset-upload-workflow.ts", "frontend/lib/asset-upload-data.ts", "frontend/lib/asset-upload-intent.ts", "frontend/lib/asset-upload-transport.ts"], backendEvidence: ["src/routes/member.ts", "src/assets/service.ts"], testEvidence: ["test/unit/frontend-submit-pages.test.tsx", "test/worker/submissions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-asset-availability.test.ts", "test/unit/frontend-asset-availability-route.test.tsx", "test/unit/frontend-asset-workflow.test.ts", "test/unit/frontend-asset-transport.test.ts", "test/unit/frontend-asset-upload-route.test.tsx", "test/worker/m2-assets.test.ts"], ledgerIds: ["KB-001"], gaps: ["The current server-navigation entry, idle form, pending, retry-by-resubmit error, and success/empty transition are runtime-probed. Source-level persistence and submitter-scoped idempotency exist, but complete browser, release, and signed-browser acceptance remain unproven."],
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
    frontendEvidence: ["frontend/pages/agent-page.tsx", "frontend/app.tsx", "frontend/components/agent/agent-feedback.tsx", "frontend/components/agent/agent-history-list.tsx", "frontend/lib/agent-data.ts", "frontend/lib/agent-turn-intent.ts"], backendEvidence: ["src/routes/agent.ts", "src/agent/session-do.ts", "src/routes/library.ts", "src/chat/conversation-service.ts", "src/chat/repository.ts", "src/chat/feedback-service.ts", "src/chat/feedback-repository.ts", "src/chat/turn-receipts.ts"], testEvidence: ["test/unit/agent-tool-runner.test.ts", "test/worker/agent-session.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx", "test/unit/frontend-agent-cancellation-route.test.tsx", "test/unit/frontend-agent-data.test.ts", "test/unit/frontend-agent-turn-intent.test.ts", "test/worker/m1-api.test.ts"], ledgerIds: ["KB-009"], gaps: ["Current server-navigation entry, initial form/answer, and post-submit loading and retryable error are runtime-probed. There is no explicit empty-answer state; cited completion, cancellation recovery, release, and signed-browser acceptance remain unproven."],
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
    frontendEvidence: ["frontend/pages/admin/admin-dashboard-page.tsx", "frontend/pages/admin/admin-dashboard-route.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/admin.ts", "src/submissions/repository.ts", "src/assets/repository.ts", "src/members/repository.ts"], testEvidence: ["test/unit/frontend-admin-dashboard-route.test.tsx", "test/worker/submissions.test.ts", "test/worker/m2-assets.test.ts", "test/worker/members.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-001"], gaps: ["Authorized list totals, independent loading/zero/error/retry, bounded reads and stale-result protection are runtime-probed. Cross-page mutation reconciliation, site-analytics date-range consistency, release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-submissions", routeId: "admin-submissions", pathname: "/admin/submissions", requiredRole: "admin",
    journey: "Review submitted knowledge and make a publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-moderation-pagination-routes.test.tsx", "test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["Current admin server-navigation and queue-to-detail navigation, exact-query read retry without POST replay, 401/403 content clearing, synchronous in-flight locks and stale-navigation protection are locally tested. End-to-end decision completion across publication, indexing and notifications, server idempotency, release and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-duplicates", routeId: "admin-duplicates", pathname: "/admin/duplicates", requiredRole: "admin",
    journey: "Review duplicate candidates and apply a decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/duplicate-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/duplicates/service.ts"], testEvidence: ["test/unit/frontend-admin-duplicates.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-003"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned ready marker are runtime-probed. The initial error has no retry action; decision convergence, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-assets", routeId: "admin-assets", pathname: "/admin/assets", requiredRole: "admin",
    journey: "Review source assets, inspect previews, and retry failed parsing.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/asset-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/assets/service.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-assets-data.test.ts", "test/worker/m2-assets.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-004"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned asset marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; parse-progress, full recovery, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-admin-members", routeId: "admin-members", pathname: "/admin/members", requiredRole: "admin",
    journey: "List members and update an allowed member's status.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/members-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/members/service.ts"], testEvidence: ["test/unit/frontend-admin-pages.test.tsx", "test/worker/members.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-005"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned member marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; disablement/cache invalidation, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-roles", routeId: "admin-roles", pathname: "/admin/roles", requiredRole: "admin",
    journey: "Manage role permission assignments and memberships.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/roles-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/roles-repository.ts"], testEvidence: ["test/worker/admin-roles.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-006"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned role marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; malformed elevated contributor sessions, backend/signed projection, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-menus", routeId: "admin-menus", pathname: "/admin/menus", requiredRole: "admin",
    journey: "Manage server-owned navigation menu hierarchy and availability.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/menus-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/menus-repository.ts"], testEvidence: ["test/unit/admin-menus-page.test.tsx", "test/worker/admin-menus.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-007"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned menu marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; cross-session projection invalidation, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-spaces", routeId: "admin-spaces", pathname: "/admin/spaces", requiredRole: "admin",
    journey: "Create and govern knowledge spaces and collections.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/spaces-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/spaces/service.ts"], testEvidence: ["test/unit/spaces-service.test.ts", "test/worker/spaces.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-008"], gaps: ["Current admin server-navigation entry plus loading, empty, retryable initial error, and response-owned space marker are runtime-probed. Initial-load read recovery and duplicate-click suppression are locally tested; archive/content impact, release, and signed-browser acceptance remain incomplete."],
  },
  {
    id: "workbench-admin-audit", routeId: "admin-audit", pathname: "/admin/audit", requiredRole: "admin",
    journey: "Filter redacted audit events and inspect their related entities.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/audit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/audit/repository.ts"], testEvidence: ["test/unit/audit.test.ts", "test/worker/admin-audit.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-009"], gaps: ["Current admin server-navigation entry and loading state are runtime-probed. Empty and ready fixtures expose an incompatible raw-page versus {generation,page} destructure in AdminAuditRoute and are explicit gaps; initial error has no retry action. Related navigation, release, and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-admin-analytics", routeId: "admin-analytics", pathname: "/admin/analytics", requiredRole: "admin",
    journey: "Inspect analytical trends, rankings, and visitors across a date range.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/analytics-page.tsx", "frontend/lib/admin-analytics-data.ts", "frontend/app.tsx"], backendEvidence: ["src/analytics/repository.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-analytics-route.test.tsx", "test/unit/frontend-admin-analytics-data.test.ts", "test/worker/analytics.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-010"], gaps: ["Initial retry, bounded date/page reads, strict response validation, stale-result and authorization recovery are locally tested. Single-transaction overview reads and cross-page post-write reconciliation are locally tested. Release and signed-browser acceptance remain unproven."],
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
    frontendEvidence: ["frontend/pages/knowledge-reader-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/library.ts", "src/library/service.ts"], testEvidence: ["test/unit/frontend-knowledge-citation-route.test.tsx", "test/unit/frontend-knowledge-reader-data.test.ts", "test/worker/m1-library.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-006"], gaps: ["The current knowledge owner entry plus direct loading, retryable error, and response-owned reader marker are runtime-probed without a duplicate global entry; the route harness isolates DOM sanitization. Missing revision is an error, not empty, and list-to-reader discovery, integrated sanitizer rendering, related/backlink/favorite/revision journeys, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-message-thread", routeId: "message-thread", pathname: "/messages/:id", parentRouteId: "messages", routePattern: "/^\\/messages\\/[A-Za-z0-9_-]{1,128}$/u", requiredRole: "contributor",
    journey: "Open an authorized contextual discussion thread and read its messages.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/thread-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["MSG-002", "MSG-004"], gaps: ["The current messages owner entry plus direct loading, empty, retryable error, and response-owned private-message marker are runtime-probed without a duplicate global entry. Runtime target re-authorization is source-audited; context 403 removes private thread content but renders a generic retryable error. Explicit revoked presentation, list discovery, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-submission-detail", routeId: "admin-submission-detail", pathname: "/admin/submissions/:id", parentRouteId: "admin-submissions", routePattern: "/^\\/admin\\/submissions\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open a reviewable submission and make an authorized publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-detail-route.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-review-detail-route.test.tsx", "test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["Review-queue discovery and return navigation, same-object retry, explicit 404/401/403 states, response ID matching, read cancellation and stale-result protection are locally tested. Malformed 200 previews fail closed instead of masquerading as not-found. Same-tick decision clicks are locally serialized; server decision idempotency, publication/index/notification convergence, release and signed-browser acceptance remain gaps."],
  },
] as const satisfies readonly WorkbenchMaturityCapability[]);

// Kept as a separately frozen, one-to-one ledger so Task 1's fail-closed AST
// contract remains stable. scripts/workbench-domain-audit.mjs rejects missing,
// duplicate, or unknown capability IDs before joining these records.
export const WORKBENCH_MATURITY_DOMAIN_EVIDENCE = Object.freeze([
  {
    id: "workbench-graph", apiPaths: ["/api/graph", "/api/graph/suggestions", "/api/tasks", "/api/focus", "/api/projects/:id/timeline"],
    persistencePaths: ["src/graph/repository.ts", "src/tasks/repository.ts", "src/focus/repository.ts", "src/project-timeline/repository.ts"],
    ownerPredicate: "routeGraphApi passes authenticated member.memberId to GraphProjectionService; GraphProjectionRepository.listTasks binds t.member_id = ?.", pagination: "not_applicable",
    mutations: ["POST /api/tasks — gap: complete graph action replay is not bound to domain evidence", "POST /api/focus — gap: complete graph action replay is not bound to domain evidence", "POST /api/projects/:id/timeline — gap: complete graph action replay is not bound to domain evidence"], mutationSafety: "mixed",
  },
  {
    id: "workbench-project-timeline", apiPaths: ["/api/projects/:id", "/api/projects/:id/timeline", "/api/projects/:id/timeline/:id/status"],
    persistencePaths: ["src/projects/repository.ts", "src/project-timeline/repository.ts", "migrations/0046_workbench_project_timeline.sql"],
    ownerPredicate: "routeProjectTimelineApi passes authenticated member.memberId to ProjectTimelineService; ProjectTimelineRepository.listOwned binds member_id = ? and project_id = ?.", pagination: "cursor",
    mutations: ["POST /api/projects/:id/timeline — gap: each frontend attempt generates a fresh client key", "POST /api/projects/:id/timeline/:id/status — gap: no expected status is supplied"], mutationSafety: "mixed",
  },
  {
    id: "workbench-inbox", apiPaths: ["/api/inbox", "/api/inbox/:id", "/api/inbox/:id/promote/task"],
    persistencePaths: ["src/inbox/repository.ts", "migrations/0038_workbench_inbox.sql", "src/tasks/repository.ts", "migrations/0032_workspace_tasks.sql"],
    ownerPredicate: "routeInboxApi passes authenticated member.memberId to InboxService; InboxRepository.listOwned binds member_id = ?.", pagination: "cursor",
    mutations: ["POST /api/inbox — gap: each frontend attempt generates a fresh client key", "PATCH /api/inbox/:id — gap: no expected status is supplied", "POST /api/inbox/:id/promote/task — gap: end-to-end concurrent promotion recovery is unproven"], mutationSafety: "mixed",
  },
  {
    id: "workbench-goals", apiPaths: ["/api/goals", "/api/goals/:id/status", "/api/goals/:id/progress"],
    persistencePaths: ["src/goals/repository.ts", "migrations/0039_workbench_goals.sql"],
    ownerPredicate: "routeGoalsApi passes authenticated member.memberId to GoalsService; GoalsRepository.listOwned binds member_id = ?.", pagination: "cursor",
    mutations: ["POST /api/goals — gap: each frontend attempt generates a fresh client key", "POST /api/goals/:id/status — gap: no expected status is supplied", "POST /api/goals/:id/progress — gap: no expected version is supplied"], mutationSafety: "mixed",
  },
  {
    id: "workbench-projects", apiPaths: ["/api/projects", "/api/projects/:id/summary", "/api/projects/:id/status"],
    persistencePaths: ["src/projects/repository.ts", "migrations/0040_workbench_projects.sql"],
    ownerPredicate: "routeProjectsApi passes authenticated member.memberId to ProjectsService; ProjectsRepository.listOwned and summary bind member_id = ?.", pagination: "cursor",
    mutations: ["POST /api/projects — gap: each frontend attempt generates a fresh client key", "POST /api/projects/:id/status — gap: no expected status is supplied"], mutationSafety: "mixed",
  },
  {
    id: "workbench-calendar", apiPaths: ["/api/calendar/events", "/api/calendar/events/:id"],
    persistencePaths: ["src/calendar/repository.ts", "migrations/0042_workbench_calendar.sql"],
    ownerPredicate: "routeCalendarApi passes authenticated member.memberId to CalendarService; CalendarRepository.listOwned binds member_id = ?.", pagination: "cursor",
    mutations: ["POST /api/calendar/events — gap: each frontend attempt generates a fresh client key", "DELETE /api/calendar/events/:id — gap: cancellation has no expected status or concurrent replay proof"], mutationSafety: "mixed",
  },
  {
    id: "workbench-today", apiPaths: ["/api/today"],
    persistencePaths: ["src/today/service.ts", "src/tasks/repository.ts", "src/inbox/repository.ts", "src/projects/repository.ts", "src/calendar/repository.ts"],
    ownerPredicate: "routeTodayApi passes authenticated principal.memberId to TodayService.get; all four private aggregates receive the same memberId.", pagination: "not_applicable", mutations: [], mutationSafety: "not_applicable",
  },
  {
    id: "workbench-focus", apiPaths: ["/api/focus", "/api/focus/current", "/api/focus/:id/pause", "/api/focus/:id/resume", "/api/focus/:id/complete", "/api/focus/:id/abandon"],
    persistencePaths: ["src/focus/repository.ts", "migrations/0043_workbench_focus.sql"],
    ownerPredicate: "routeFocusApi passes authenticated principal.memberId to FocusService; FocusRepository.findOpen and update bind member_id = ?.", pagination: "not_applicable",
    mutations: ["POST /api/focus — gap: each frontend attempt generates a fresh client key", "POST /api/focus/:id/pause — gap: no expected status or concurrent elapsed-time proof", "POST /api/focus/:id/resume — gap: no expected status or concurrent elapsed-time proof", "POST /api/focus/:id/complete — gap: no expected status or concurrent elapsed-time proof", "POST /api/focus/:id/abandon — gap: no expected status or concurrent elapsed-time proof"], mutationSafety: "mixed",
  },
  {
    id: "workbench-review", apiPaths: ["/api/workbench/review"],
    persistencePaths: ["src/workbench-review/repository.ts", "migrations/0044_workbench_review.sql", "src/workbench-review/service.ts"],
    ownerPredicate: "routeWorkbenchReviewApi passes authenticated principal.memberId to WorkbenchReviewService.get; WorkbenchReviewRepository.find binds member_id = ? and every aggregate receives memberId.", pagination: "not_applicable",
    mutations: ["GET /api/workbench/review#persist-snapshot — gap: read-before-upsert lacks concurrent snapshot and refresh semantics proof"], mutationSafety: "mixed",
  },
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
    apiPaths: ["/api/submissions", "/api/assets/availability", "/api/assets", "/api/assets/resume", "/api/assets/:id", "/api/assets/:id/cancel", "/api/assets/:id/submit"],
    persistencePaths: ["src/submissions/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "src/assets/repository.ts"],
    ownerPredicate: "routeMemberApi derives authenticated member.memberId for submissions and assets; SubmissionsRepository scopes replay by submitter_id; AssetsRepository scopes asset reads and upload-key recovery by owner_id.",
    pagination: "not_applicable",
    mutations: ["POST /api/submissions — proven: submitter-scoped Idempotency-Key replay", "POST /api/assets — proven: owner-scoped upload key replay; client verifies the persisted file hash", "POST /api/assets/:id — proven: conditional parse-job claim; not automatic retry", "POST /api/assets/:id/cancel — proven: owner-scoped conditional deletion; repeat may return 404, not convergent success", "POST /api/assets/:id/submit — proven: owned asset and persisted review-key replay"],
    mutationSafety: "mixed",
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
    apiPaths: ["/api/knowledge/chat", "/api/knowledge/chat/conversations", "/api/knowledge/chat/conversations/:id", "/api/knowledge/chat/conversations/:id/scope", "/api/knowledge/chat/conversations/:id/cancel", "/api/knowledge/chat/conversations/:id/feedback"],
    persistencePaths: ["src/chat/repository.ts", "src/chat/feedback-repository.ts", "src/chat/turn-receipts.ts", "migrations/0052_chat_turn_requests.sql", "migrations/0019_m5_chat_conversations.sql", "migrations/0020_m5_chat_cancel.sql", "migrations/0021_m5_chat_feedback.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; ChatConversationService and ChatRepository bind owner_member_id to scope.memberId for conversation reads and writes.",
    pagination: "cursor",
    mutations: ["POST /api/knowledge/chat — gap: legacy clients without a key remain non-idempotent; member React route uses tab-persisted intent keys and durable member/key receipts with atomic message completion and reauthorized replay; pending receipts are never automatically regenerated", "PATCH /api/knowledge/chat/conversations/:id/scope — gap: no expected version is supplied", "POST /api/knowledge/chat/conversations/:id/cancel — gap: no replay key is supplied", "POST /api/knowledge/chat/conversations/:id/feedback — proven: conversation/member conflict-target upsert prevents duplicate rows for identical feedback retries; no cross-tab ordering guarantee"],
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
    mutations: ["POST /api/tasks — proven: stable client task id with INSERT OR IGNORE replay", "POST /api/tasks/:id/status — proven: expected-status conditional write", "DELETE /api/tasks/:id — gap: repeated deletion returns not-found rather than converging", "DELETE /api/tasks/:id/links/:linkId — gap: repeated deletion behavior is not proven", "PATCH /api/tasks/:id — gap: no expected version is supplied", "POST /api/tasks/:id/links — gap: no replay key is supplied", "POST /api/tasks/:id/progress — gap: no stable event key is supplied", "PUT /api/tasks/:id/tags — gap: no expected version is supplied"],
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
    apiPaths: ["/api/admin/submissions", "/api/admin/assets", "/api/admin/members"],
    persistencePaths: ["src/submissions/repository.ts", "src/assets/repository.ts", "src/members/repository.ts", "migrations/0001_phase1_control_plane.sql", "migrations/0003_m1_knowledge_loop.sql", "migrations/0005_m2_asset_ingestion.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: [],
    mutationSafety: "not_applicable",
  },
  {
    id: "workbench-admin-submissions",
    apiPaths: ["/api/admin/submissions", "/api/admin/submissions/:id/publish", "/api/admin/submissions/:id/request-revision", "/api/admin/submissions/:id/reject"],
    persistencePaths: ["src/submissions/repository.ts", "src/publication/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0033_numbered_pagination_indexes.sql"],
    ownerPredicate: null,
    pagination: "numbered",
    mutations: ["POST /api/admin/submissions/:id/publish — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/request-revision — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/reject — gap: no client replay key or expected version is supplied"],
    mutationSafety: "mixed",
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
    apiPaths: ["/api/knowledge/:id", "/api/knowledge/citations/:citationId", "/api/knowledge/:id/revisions/:revisionId", "/api/knowledge/:id/favorite", "/api/knowledge/:id/note", "/api/knowledge/:id/note/shares", "/api/knowledge/:id/note/shares/:recipientId", "/api/knowledge/:id/related", "/api/knowledge/:id/backlinks"],
    persistencePaths: ["src/library/repository.ts", "src/favorites/repository.ts", "src/private-notes/repository.ts", "src/recent-visits/repository.ts", "migrations/0003_m1_knowledge_loop.sql", "migrations/0012_m5_private_notes.sql", "migrations/0023_m4_knowledge_favorites.sql", "migrations/0024_m4_knowledge_visits.sql"],
    ownerPredicate: "routeLibraryApi derives authenticated scope.memberId; reader, favorite, private-note, and visit repositories bind scope.memberId and re-authorize the current knowledge revision.",
    pagination: "not_applicable",
    mutations: ["PUT /api/knowledge/:id/favorite — proven: member-scoped conflict-ignore converges", "DELETE /api/knowledge/:id/favorite — gap: repeated delete behavior is not proven", "PUT /api/knowledge/:id/note — gap: no expected version protects concurrent note edits", "POST /api/knowledge/:id/note/shares — gap: no replay key is supplied", "DELETE /api/knowledge/:id/note/shares/:recipientId — gap: repeated revoke behavior is not proven", "GET /api/knowledge/:id#record-visit — gap: successful detail reads increment visit_count and are intentionally not retry-idempotent"],
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
    mutations: ["POST /api/admin/submissions/:id/publish — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/request-revision — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/reject — gap: no client replay key or expected version is supplied", "POST /api/admin/submissions/:id/comments — gap: no client idempotency key"],
    mutationSafety: "mixed",
  },
] as const satisfies readonly WorkbenchMaturityDomainEvidence[]);
