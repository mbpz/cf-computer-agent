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
    frontendEvidence: ["frontend/pages/home-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/workspace-dashboard.test.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["WB-001", "WB-002"], gaps: ["The current server-navigation entry and a response-owned recent-item ready marker are fixture-proven. Home renders ready while recent data is pending, collapses recent failure to empty, hard-codes zero metrics, and has no retryable route error. Release and signed-browser acceptance remain unproven."],
  },
  {
    id: "workbench-submit", routeId: "submit", pathname: "/submit", requiredRole: "contributor",
    journey: "Submit knowledge for parsing and later review.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/submit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/frontend-submit-pages.test.tsx", "test/worker/submissions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["KB-001"], gaps: ["The current server-navigation entry, idle form, pending, retry-by-resubmit error, and success/empty transition are runtime-probed. Persistence, idempotency, release evidence, and signed-browser acceptance remain unproven."],
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
    frontendEvidence: ["frontend/pages/messages/thread-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["MSG-002", "MSG-004"], gaps: ["The current messages owner entry plus direct loading, empty, retryable error, and response-owned private-message marker are runtime-probed without a duplicate global entry. Context 403 removes message ID/body, target ID/link, thread scroll, and composer, but renders a generic retryable error; explicit revoked presentation, list discovery, backend/signed authority, release, and signed-browser acceptance remain gaps."],
  },
  {
    id: "workbench-admin-submission-detail", routeId: "admin-submission-detail", pathname: "/admin/submissions/:id", parentRouteId: "admin-submissions", routePattern: "/^\\/admin\\/submissions\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open a reviewable submission and make an authorized publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-detail-route.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts", "test/unit/frontend-workbench-maturity-routes.test.tsx"], ledgerIds: ["ADM-002"], gaps: ["The current review-queue owner entry plus direct loading, initial error, and response-owned detail title are runtime-probed without a duplicate global entry. Missing preview is an error rather than empty and initial error has no retry; queue-to-detail discovery, decision idempotency, release, and signed-browser acceptance remain gaps."],
  },
] as const satisfies readonly WorkbenchMaturityCapability[]);
