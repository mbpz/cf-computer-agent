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

const INITIAL_GAPS = [
  "R0 has local source and test references only; the complete journey, current release, and signed-browser acceptance remain unproven.",
] as const;

export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([
  {
    id: "workbench-home", routeId: "home", pathname: "/", requiredRole: "contributor",
    journey: "Open the workbench and review the current capability summary.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/home-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/workspace-dashboard.test.tsx"], ledgerIds: ["WB-001", "WB-002"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-submit", routeId: "submit", pathname: "/submit", requiredRole: "contributor",
    journey: "Submit knowledge for parsing and later review.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/submit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/frontend-submit-pages.test.tsx", "test/worker/submissions.test.ts"], ledgerIds: ["KB-001"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-knowledge", routeId: "knowledge", pathname: "/knowledge", requiredRole: "contributor",
    journey: "Browse knowledge and open an authorized knowledge item.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/knowledge-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/library.ts", "src/library/repository.ts"], testEvidence: ["test/unit/frontend-user-read-pages.test.tsx", "test/worker/m1-library.test.ts"], ledgerIds: ["KB-005", "KB-006"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-search", routeId: "search", pathname: "/search", requiredRole: "contributor",
    journey: "Search authorized knowledge and inspect result evidence.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/search-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/library.ts", "src/knowledge/search.ts"], testEvidence: ["test/unit/search.test.ts", "test/worker/m1-library.test.ts"], ledgerIds: ["KB-007"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-agent", routeId: "agent", pathname: "/agent", requiredRole: "contributor",
    journey: "Ask the bounded knowledge Agent and inspect its cited response.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/agent-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/agent.ts", "src/agent/session-do.ts"], testEvidence: ["test/unit/agent-tool-runner.test.ts", "test/worker/agent-session.test.ts"], ledgerIds: ["KB-009"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-my-submissions", routeId: "my-submissions", pathname: "/my-submissions", requiredRole: "contributor",
    journey: "Review the member's submissions, drafts, and statuses.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/my-submissions-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/member.ts"], testEvidence: ["test/unit/frontend-user-read-pages.test.tsx", "test/worker/submissions.test.ts"], ledgerIds: ["KB-002"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-tasks", routeId: "tasks", pathname: "/tasks", requiredRole: "contributor",
    journey: "Create, filter, update, and remove private workspace tasks.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/tasks/tasks-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/tasks.ts", "src/tasks/service.ts"], testEvidence: ["test/unit/frontend-tasks-route.test.tsx", "test/worker/tasks.test.ts"], ledgerIds: ["TSK-001", "TSK-002"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-boards", routeId: "boards", pathname: "/boards", requiredRole: "contributor",
    journey: "View task status columns and move a task between them.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/boards/boards-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/tasks.ts", "src/tasks/service.ts"], testEvidence: ["test/unit/frontend-boards-route.test.tsx", "test/worker/tasks.test.ts"], ledgerIds: ["BRD-001", "BRD-002"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-settings", routeId: "settings", pathname: "/settings", requiredRole: "contributor",
    journey: "Review account information and change supported workbench settings.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/settings-page.tsx", "frontend/components/shell/app-shell.tsx"], backendEvidence: ["src/identity/session.ts"], testEvidence: ["test/unit/settings-page.test.tsx", "test/unit/workspace-shell.test.tsx"], ledgerIds: ["WB-SETTINGS"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin", routeId: "admin", pathname: "/admin", requiredRole: "admin",
    journey: "Review administration summary metrics and enter a governance area.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/admin-dashboard-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/navigation.ts"], testEvidence: ["test/unit/frontend-admin-pages.test.tsx", "test/worker/assets.test.ts"], ledgerIds: ["ADM-001"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-submissions", routeId: "admin-submissions", pathname: "/admin/submissions", requiredRole: "admin",
    journey: "Review submitted knowledge and make a publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts"], ledgerIds: ["ADM-002"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-duplicates", routeId: "admin-duplicates", pathname: "/admin/duplicates", requiredRole: "admin",
    journey: "Review duplicate candidates and apply a decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/duplicate-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/duplicates/service.ts"], testEvidence: ["test/unit/frontend-admin-duplicates.test.ts"], ledgerIds: ["ADM-003"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-assets", routeId: "admin-assets", pathname: "/admin/assets", requiredRole: "admin",
    journey: "Review source assets, inspect previews, and retry failed parsing.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/asset-queue-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/assets/service.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-assets-data.test.ts", "test/worker/m2-assets.test.ts"], ledgerIds: ["ADM-004"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-members", routeId: "admin-members", pathname: "/admin/members", requiredRole: "admin",
    journey: "List members and update an allowed member's status.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/members-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/members/service.ts"], testEvidence: ["test/unit/frontend-admin-pages.test.tsx", "test/worker/members.test.ts"], ledgerIds: ["ADM-005"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-roles", routeId: "admin-roles", pathname: "/admin/roles", requiredRole: "admin",
    journey: "Manage role permission assignments and memberships.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/roles-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/roles-repository.ts"], testEvidence: ["test/worker/admin-roles.test.ts"], ledgerIds: ["ADM-006"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-menus", routeId: "admin-menus", pathname: "/admin/menus", requiredRole: "admin",
    journey: "Manage server-owned navigation menu hierarchy and availability.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/menus-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/authorization/menus-repository.ts"], testEvidence: ["test/unit/admin-menus-page.test.tsx", "test/worker/admin-menus.test.ts"], ledgerIds: ["ADM-007"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-spaces", routeId: "admin-spaces", pathname: "/admin/spaces", requiredRole: "admin",
    journey: "Create and govern knowledge spaces and collections.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/spaces-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/spaces/service.ts"], testEvidence: ["test/unit/spaces-service.test.ts", "test/worker/spaces.test.ts"], ledgerIds: ["ADM-008"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-audit", routeId: "admin-audit", pathname: "/admin/audit", requiredRole: "admin",
    journey: "Filter redacted audit events and inspect their related entities.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/audit-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/audit/repository.ts"], testEvidence: ["test/unit/audit.test.ts", "test/worker/admin-audit.test.ts"], ledgerIds: ["ADM-009"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-analytics", routeId: "admin-analytics", pathname: "/admin/analytics", requiredRole: "admin",
    journey: "Inspect analytical trends, rankings, and visitors across a date range.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/analytics-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/analytics/repository.ts", "src/routes/admin.ts"], testEvidence: ["test/unit/frontend-admin-analytics-route.test.tsx", "test/worker/analytics.test.ts"], ledgerIds: ["ADM-010"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-notifications", routeId: "notifications", pathname: "/notifications", requiredRole: "contributor",
    journey: "Review, filter, and mark workspace notifications as read.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/notifications/notifications-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/notifications.ts", "src/notifications/service.ts"], testEvidence: ["test/unit/frontend-notifications-route.test.tsx", "test/worker/notifications.test.ts"], ledgerIds: ["NTF-001", "NTF-003", "NTF-004"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-messages", routeId: "messages", pathname: "/messages", requiredRole: "contributor",
    journey: "Find a contextual discussion and reply to its current authorized thread.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/messages-page.tsx", "frontend/app.tsx"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts"], ledgerIds: ["MSG-001", "MSG-002", "MSG-004"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-knowledge-reader", routeId: "knowledge-reader", pathname: "/knowledge/:id", parentRouteId: "knowledge", routePattern: "/^\\/knowledge\\/[A-Za-z0-9_-]+$/u", requiredRole: "contributor",
    journey: "Open an authorized knowledge item and inspect its reader content.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/knowledge-reader-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/library.ts", "src/library/service.ts"], testEvidence: ["test/unit/frontend-knowledge-reader-data.test.ts", "test/worker/m1-library.test.ts"], ledgerIds: ["KB-006"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-message-thread", routeId: "message-thread", pathname: "/messages/:id", parentRouteId: "messages", routePattern: "/^\\/messages\\/[A-Za-z0-9_-]{1,128}$/u", requiredRole: "contributor",
    journey: "Open an authorized contextual discussion thread and read its messages.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/messages/thread-page.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/discussions.ts", "src/discussions/service.ts"], testEvidence: ["test/unit/frontend-discussion-route.test.tsx", "test/worker/discussions.test.ts"], ledgerIds: ["MSG-002", "MSG-004"], gaps: INITIAL_GAPS,
  },
  {
    id: "workbench-admin-submission-detail", routeId: "admin-submission-detail", pathname: "/admin/submissions/:id", parentRouteId: "admin-submissions", routePattern: "/^\\/admin\\/submissions\\/[A-Za-z0-9_-]+$/u", requiredRole: "admin",
    journey: "Open a reviewable submission and make an authorized publication decision.", classification: "partial", dimensions: INITIAL_DIMENSIONS,
    frontendEvidence: ["frontend/pages/admin/review-detail-route.tsx", "frontend/app-routes.ts"], backendEvidence: ["src/routes/admin-review.ts", "src/review/service.ts"], testEvidence: ["test/unit/frontend-admin-review-data.test.ts", "test/worker/m1-publication.test.ts"], ledgerIds: ["ADM-002"], gaps: INITIAL_GAPS,
  },
] as const satisfies readonly WorkbenchMaturityCapability[]);
