import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { API } from "typescript/unstable/sync";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";

const DEFAULT_EVIDENCE_PATH = "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md";
const DOMAIN_KEYS = new Set(["id", "apiPaths", "persistencePaths", "ownerPredicate", "pagination", "mutations", "mutationSafety"]);

const binding = (path, ...tokens) => ({ path, tokens });
const apiEvidence = (path, pagination, routePath, routeToken, mechanism, paginationPath = routePath, paginationToken = routeToken) => ({
  path,
  pagination,
  route: binding(routePath, routeToken),
  paginationEvidence: { mechanism, ...binding(paginationPath, paginationToken) },
});

const API_EVIDENCE = Object.freeze(Object.fromEntries([
  apiEvidence("/api/knowledge/recent", "cursor", "src/routes/library.ts", 'url.pathname === "/api/knowledge/recent"', "parsePageRequest", "src/routes/library.ts", "services.recentVisits.list(scope, parsePageRequest"),
  apiEvidence("/api/submissions", "not_applicable", "src/routes/member.ts", 'url.pathname === "/api/submissions"', "none"),
  apiEvidence("/api/knowledge", "numbered", "src/routes/library.ts", 'url.pathname === "/api/knowledge"', "parseNumberedPageRequest", "src/routes/library.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/knowledge/favorites", "cursor", "src/routes/library.ts", 'url.pathname === "/api/knowledge/favorites"', "parsePageRequest", "src/routes/library.ts", "services.favorites.list(scope, parsePageRequest"),
  apiEvidence("/api/knowledge/research-runs", "cursor", "src/routes/library.ts", 'url.pathname === "/api/knowledge/research-runs"', "parsePageRequest", "src/routes/library.ts", "services.researchReports.list(scope, parsePageRequest"),
  apiEvidence("/api/knowledge/notes", "cursor", "src/routes/library.ts", 'url.pathname === "/api/knowledge/notes"', "parsePageRequest", "src/routes/library.ts", "services.privateNotes.list(scope, parsePageRequest"),
  apiEvidence("/api/knowledge/review", "not_applicable", "src/routes/library.ts", 'url.pathname === "/api/knowledge/review"', "none"),
  apiEvidence("/api/knowledge/search", "numbered", "src/routes/library.ts", 'url.pathname === "/api/knowledge/search"', "parseNumberedPageRequest", "src/routes/library.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/knowledge/chat", "not_applicable", "src/routes/library.ts", 'url.pathname === "/api/knowledge/chat"', "none"),
  apiEvidence("/api/knowledge/chat/conversations/:id/scope", "not_applicable", "src/routes/library.ts", "const conversationScope = /^\\/api\\/knowledge\\/chat\\/conversations\\/", "none"),
  apiEvidence("/api/knowledge/chat/conversations/:id/cancel", "not_applicable", "src/routes/library.ts", "const conversationCancel = /^\\/api\\/knowledge\\/chat\\/conversations\\/", "none"),
  apiEvidence("/api/submissions/mine", "numbered", "src/routes/member.ts", 'url.pathname === "/api/submissions/mine"', "parseNumberedPageRequest", "src/routes/member.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/tasks", "numbered", "src/routes/tasks.ts", 'url.pathname === "/api/tasks"', "parseNumberedPageRequest", "src/routes/tasks.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/tasks/:id", "not_applicable", "src/routes/tasks.ts", "const task = /^\\/api\\/tasks\\/", "none"),
  apiEvidence("/api/tasks/:id/status", "not_applicable", "src/routes/tasks.ts", "const status = /^\\/api\\/tasks\\/", "none"),
  apiEvidence("/api/tasks/:id/progress", "not_applicable", "src/routes/tasks.ts", "const progress = /^\\/api\\/tasks\\/", "none"),
  apiEvidence("/api/tasks/:id/tags", "not_applicable", "src/routes/tasks.ts", "const tags = /^\\/api\\/tasks\\/", "none"),
  apiEvidence("/api/tasks/:id/links", "not_applicable", "src/routes/tasks.ts", "const links = /^\\/api\\/tasks\\/", "none"),
  apiEvidence("/api/tasks/:id/links/:linkId", "not_applicable", "src/routes/tasks.ts", "const link = /^\\/api\\/tasks\\/", "none"),
  apiEvidence("/api/session", "not_applicable", "src/routes/session.ts", 'url.pathname !== "/api/session"', "none"),
  apiEvidence("/api/navigation", "not_applicable", "src/routes/navigation.ts", 'url.pathname !== "/api/navigation"', "none"),
  apiEvidence("/api/admin/submissions", "numbered", "src/routes/admin.ts", 'url.pathname === "/api/admin/submissions"', "parseNumberedPageRequest", "src/routes/admin.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/admin/duplicates", "numbered", "src/routes/admin.ts", 'url.pathname === "/api/admin/duplicates"', "parseNumberedPageRequest", "src/routes/admin.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/admin/duplicates/:submissionId/decision", "not_applicable", "src/routes/admin.ts", "const duplicateDecision = /^\\/api\\/admin\\/duplicates\\/", "none"),
  apiEvidence("/api/admin/assets", "numbered", "src/routes/admin.ts", 'url.pathname === "/api/admin/assets"', "parseNumberedPageRequest", "src/routes/admin.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/admin/assets/:id/preview", "not_applicable", "src/routes/admin.ts", "const assetMetadataPreview = /^\\/api\\/admin\\/assets\\/", "none"),
  apiEvidence("/api/admin/assets/:id/retry", "not_applicable", "src/routes/admin.ts", "const assetRetry = /^\\/api\\/admin\\/assets\\/", "none"),
  apiEvidence("/api/admin/members", "numbered", "src/routes/admin.ts", 'url.pathname === "/api/admin/members"', "parseNumberedPageRequest", "src/routes/admin.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/admin/members/:id/status", "not_applicable", "src/routes/admin.ts", "const memberStatus = /^\\/api\\/admin\\/members\\/", "none"),
  apiEvidence("/api/admin/roles", "not_applicable", "src/routes/admin-roles.ts", 'url.pathname === "/api/admin/roles"', "bounded", "src/authorization/roles-repository.ts", "LIMIT 50"),
  apiEvidence("/api/admin/roles/:id", "not_applicable", "src/routes/admin-roles.ts", "const match = /^\\/api\\/admin\\/roles\\/", "none"),
  apiEvidence("/api/admin/roles/:id/members", "not_applicable", "src/routes/admin-roles.ts", "const assignment = /^\\/api\\/admin\\/roles\\/", "none"),
  apiEvidence("/api/admin/menus", "not_applicable", "src/routes/admin-menus.ts", 'url.pathname === "/api/admin/menus"', "bounded", "src/authorization/menus-repository.ts", "LIMIT 200"),
  apiEvidence("/api/admin/menus/:id", "not_applicable", "src/routes/admin-menus.ts", "const match = /^\\/api\\/admin\\/menus\\/", "none"),
  apiEvidence("/api/admin/spaces", "cursor", "src/routes/admin.ts", 'url.pathname === "/api/admin/spaces"', "pageRequest", "src/routes/admin.ts", "services.spaces.listSpaces(pageRequest(url))"),
  apiEvidence("/api/admin/spaces/:id/collections", "cursor", "src/routes/admin.ts", "const spaceCollections = /^\\/api\\/admin\\/spaces\\/", "pageRequest", "src/routes/admin.ts", "services.spaces.listCollections(decodePathId(spaceCollections[1]!), pageRequest(url))"),
  apiEvidence("/api/admin/audit-events", "numbered", "src/routes/admin.ts", 'url.pathname === "/api/admin/audit-events"', "parseNumberedPageRequest", "src/routes/admin.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/admin/analytics/overview", "numbered", "src/routes/admin.ts", 'url.pathname === "/api/admin/analytics/overview"', "parseNumberedPageRequest", "src/routes/admin.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/notifications", "numbered", "src/routes/notifications.ts", 'url.pathname === "/api/notifications"', "parseNumberedPageRequest", "src/routes/notifications.ts", "parseNumberedPageRequest(url"),
  apiEvidence("/api/notifications/summary", "not_applicable", "src/routes/notifications.ts", 'url.pathname === "/api/notifications/summary"', "none"),
  apiEvidence("/api/notifications/:id/read", "not_applicable", "src/routes/notifications.ts", "const read = /^\\/api\\/notifications\\/", "none"),
  apiEvidence("/api/notifications/read", "not_applicable", "src/routes/notifications.ts", 'url.pathname === "/api/notifications/read"', "none"),
  apiEvidence("/api/discussions", "cursor", "src/routes/discussions.ts", 'url.pathname === "/api/discussions"', "cursorPage", "src/routes/discussions.ts", "cursorPage(url)"),
  apiEvidence("/api/knowledge/:id", "not_applicable", "src/routes/library.ts", "const detail = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/knowledge/:id/favorite", "not_applicable", "src/routes/library.ts", "const favorite = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/knowledge/:id/note", "not_applicable", "src/routes/library.ts", "const note = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/knowledge/:id/note/shares", "not_applicable", "src/routes/library.ts", "const noteShares = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/knowledge/:id/note/shares/:recipientId", "not_applicable", "src/routes/library.ts", "const noteShares = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/knowledge/:id/related", "not_applicable", "src/routes/library.ts", "const related = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/knowledge/:id/backlinks", "not_applicable", "src/routes/library.ts", "const backlinks = /^\\/api\\/knowledge\\/", "none"),
  apiEvidence("/api/discussions/:id", "not_applicable", "src/routes/discussions.ts", "const thread = /^\\/api\\/discussions\\/", "none"),
  apiEvidence("/api/discussions/:id/messages", "cursor", "src/routes/discussions.ts", "const messages = /^\\/api\\/discussions\\/", "cursorPage", "src/routes/discussions.ts", "cursorPage(url)"),
  apiEvidence("/api/discussions/messages", "not_applicable", "src/routes/discussions.ts", 'url.pathname === "/api/discussions/messages"', "none"),
  apiEvidence("/api/admin/submissions/:id", "not_applicable", "src/routes/admin-review.ts", "const detail = /^\\/api\\/admin\\/submissions\\/", "none"),
  apiEvidence("/api/admin/submissions/:id/publish", "not_applicable", "src/routes/admin-review.ts", "const publish = /^\\/api\\/admin\\/submissions\\/", "none"),
  apiEvidence("/api/admin/submissions/:id/request-revision", "not_applicable", "src/routes/admin-review.ts", "const requestRevision = /^\\/api\\/admin\\/submissions\\/", "none"),
  apiEvidence("/api/admin/submissions/:id/reject", "not_applicable", "src/routes/admin-review.ts", "const reject = /^\\/api\\/admin\\/submissions\\/", "none"),
  apiEvidence("/api/admin/submissions/:id/comments", "not_applicable", "src/routes/admin-review.ts", "const adminComments = /^\\/api\\/admin\\/submissions\\/", "none"),
].map((fact) => [fact.path, fact])));

const ownerEvidence = (predicate, ...bindings) => ({ predicate, bindings });
const OWNER_EVIDENCE = Object.freeze(Object.fromEntries([
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; RecentVisitsRepository predicates knowledge_visits.member_id = ? with scope.memberId.", binding("src/routes/library.ts", "scope.memberId"), binding("src/recent-visits/repository.ts", "knowledge_visits", "member_id = ?")),
  ownerEvidence("routeMemberApi passes authenticated member.memberId as submitterId; SubmissionsRepository scopes idempotency replay and writes by submitter_id.", binding("src/routes/member.ts", "member.memberId"), binding("src/submissions/repository.ts", "submitter_id")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; LibraryRepository authorization binds scope.memberId before applying revision visibility predicates.", binding("src/routes/library.ts", "scope.memberId"), binding("src/library/repository.ts", "memberId")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; LibraryRepository search binds scope.memberId through the authorized member CTE before visibility filtering.", binding("src/routes/library.ts", "scope.memberId"), binding("src/library/repository.ts", "authorized")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; ChatConversationService and ChatRepository bind owner_member_id to scope.memberId for conversation reads and writes.", binding("src/routes/library.ts", "scope.memberId"), binding("src/chat/repository.ts", "owner_member_id")),
  ownerEvidence("routeMemberApi passes authenticated member.memberId to SubmissionsService.listOwn; SubmissionsRepository predicates submissions.submitter_id = ? for both items and total.", binding("src/routes/member.ts", "member.memberId", "listOwn"), binding("src/submissions/repository.ts", "submitter_id = ?")),
  ownerEvidence("routeTasksApi passes authenticated member.memberId to TasksService; TasksRepository predicates tasks.member_id = ? and task child tables by member_id.", binding("src/routes/tasks.ts", "member.memberId"), binding("src/tasks/repository.ts", "member_id = ?")),
  ownerEvidence("routeTasksApi passes authenticated member.memberId to TasksService; board lists and status updates remain predicates on tasks.member_id = ?.", binding("src/routes/tasks.ts", "member.memberId"), binding("src/tasks/repository.ts", "member_id = ?")),
  ownerEvidence("routeNotificationsApi passes authenticated member.memberId as recipientMemberId; NotificationsRepository predicates recipient_member_id = ? for items, total, and writes.", binding("src/routes/notifications.ts", "member.memberId"), binding("src/notifications/repository.ts", "recipient_member_id = ?")),
  ownerEvidence("routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks task ownership or current knowledge visibility before listing or writing.", binding("src/routes/discussions.ts", "member.memberId"), binding("src/discussions/service.ts", "actorMemberId")),
  ownerEvidence("routeLibraryApi derives authenticated scope.memberId; reader, favorite, private-note, and visit repositories bind scope.memberId and re-authorize the current knowledge revision.", binding("src/routes/library.ts", "scope.memberId"), binding("src/library/repository.ts", "memberId")),
  ownerEvidence("routeDiscussionsApi passes authenticated member.memberId as actorMemberId; DiscussionTargetAuthorization rechecks the thread context before message reads and sends.", binding("src/routes/discussions.ts", "member.memberId"), binding("src/discussions/service.ts", "actorMemberId")),
].map((fact) => [fact.predicate, fact])));

const mutationEvidence = (id, apiPath, description, strategy, sourcePath, ...sourceTokens) => ({
  id, apiPath, description, strategy, source: binding(sourcePath, ...sourceTokens),
});
const MUTATION_EVIDENCE = Object.freeze(Object.fromEntries([
  mutationEvidence("submission.create", "/api/submissions", "POST create submission", "idempotency_key", "src/submissions/repository.ts", "idempotency", "submitter_id"),
  mutationEvidence("agent.ask", "/api/knowledge/chat", "POST ask agent", "gap", "src/routes/library.ts", 'url.pathname === "/api/knowledge/chat"', 'request.method === "POST"'),
  mutationEvidence("agent.scope", "/api/knowledge/chat/conversations/:id/scope", "PATCH conversation scope", "gap", "src/routes/library.ts", "conversationScope", 'methodNotAllowed("PATCH"'),
  mutationEvidence("agent.cancel", "/api/knowledge/chat/conversations/:id/cancel", "POST cancel conversation", "gap", "src/routes/library.ts", "conversationCancel", 'methodNotAllowed("POST"'),
  mutationEvidence("tasks.create", "/api/tasks", "POST create task", "idempotency_key", "src/tasks/repository.ts", "INSERT OR IGNORE INTO tasks"),
  mutationEvidence("tasks.update", "/api/tasks/:id", "PATCH task", "gap", "src/routes/tasks.ts", 'request.method === "PATCH"'),
  mutationEvidence("tasks.delete", "/api/tasks/:id", "DELETE task", "gap", "src/routes/tasks.ts", 'request.method === "DELETE"'),
  mutationEvidence("tasks.status", "/api/tasks/:id/status", "POST task status", "conditional_write", "src/tasks/repository.ts", "compareAndSetStatus", "expectedStatus"),
  mutationEvidence("tasks.progress", "/api/tasks/:id/progress", "POST task progress", "gap", "src/routes/tasks.ts", "progress", 'methodNotAllowed("POST"'),
  mutationEvidence("tasks.tags", "/api/tasks/:id/tags", "PUT task tags", "gap", "src/routes/tasks.ts", "tags", 'methodNotAllowed("PUT"'),
  mutationEvidence("tasks.link", "/api/tasks/:id/links", "POST task link", "gap", "src/routes/tasks.ts", "links", 'methodNotAllowed("POST"'),
  mutationEvidence("tasks.unlink", "/api/tasks/:id/links/:linkId", "DELETE task link", "gap", "src/routes/tasks.ts", "link", 'methodNotAllowed("DELETE"'),
  mutationEvidence("duplicates.decide", "/api/admin/duplicates/:submissionId/decision", "POST duplicate decision", "conditional_write", "src/duplicates/repository.ts", "pending"),
  mutationEvidence("assets.retry", "/api/admin/assets/:id/retry", "POST asset retry", "gap", "src/assets/service.ts", "async retry", "current.job.status"),
  mutationEvidence("members.status", "/api/admin/members/:id/status", "PATCH member status", "gap", "src/routes/admin.ts", "memberStatus", 'methodNotAllowed("PATCH"'),
  mutationEvidence("roles.create", "/api/admin/roles", "POST create role", "gap", "src/routes/admin-roles.ts", 'request.method === "POST"'),
  mutationEvidence("roles.update", "/api/admin/roles/:id", "PATCH role", "gap", "src/routes/admin-roles.ts", "const match =", 'methodNotAllowed("PATCH, DELETE"'),
  mutationEvidence("roles.assign", "/api/admin/roles/:id/members", "POST assign role member; duplicate returns 409", "gap", "src/authorization/roles-repository.ts", "ROLE_MEMBER_EXISTS"),
  mutationEvidence("roles.unassign", "/api/admin/roles/:id/members", "DELETE role member; repeat returns 404", "gap", "src/authorization/roles-repository.ts", "ROLE_MEMBER_NOT_FOUND"),
  mutationEvidence("menus.update", "/api/admin/menus/:id", "PATCH menu", "gap", "src/routes/admin-menus.ts", "const match =", 'methodNotAllowed("PATCH, DELETE"'),
  mutationEvidence("menus.delete", "/api/admin/menus/:id", "DELETE menu", "gap", "src/routes/admin-menus.ts", "const match =", 'request.method === "DELETE"'),
  mutationEvidence("spaces.create", "/api/admin/spaces", "POST create space", "gap", "src/routes/admin.ts", 'url.pathname === "/api/admin/spaces"', 'methodNotAllowed("POST"'),
  mutationEvidence("notifications.read", "/api/notifications/:id/read", "POST mark notification read", "conditional_write", "src/notifications/repository.ts", "read_at IS NULL"),
  mutationEvidence("notifications.bulk-read", "/api/notifications/read", "POST bulk mark notifications read", "conditional_write", "src/notifications/repository.ts", "read_at IS NULL"),
  mutationEvidence("favorites.add", "/api/knowledge/:id/favorite", "PUT favorite", "idempotency_key", "src/favorites/repository.ts", "ON CONFLICT(member_id, knowledge_item_id) DO NOTHING", "knowledge_favorites"),
  mutationEvidence("favorites.remove", "/api/knowledge/:id/favorite", "DELETE favorite", "gap", "src/routes/library.ts", 'request.method === "DELETE"'),
  mutationEvidence("notes.save", "/api/knowledge/:id/note", "PUT private note", "gap", "src/routes/library.ts", 'request.method === "PUT"'),
  mutationEvidence("notes.share", "/api/knowledge/:id/note/shares", "POST note share", "gap", "src/routes/library.ts", "noteShares", 'request.method === "POST"'),
  mutationEvidence("notes.revoke-share", "/api/knowledge/:id/note/shares/:recipientId", "DELETE note share", "gap", "src/routes/library.ts", "noteShares", 'request.method === "DELETE"'),
  mutationEvidence("discussions.send", "/api/discussions/messages", "POST discussion message", "idempotency_key", "src/discussions/repository.ts", "findMessageByAuthorClientKey", "clientKey"),
  mutationEvidence("review.publish", "/api/admin/submissions/:id/publish", "POST publish review", "gap", "src/routes/admin-review.ts", "const publish =", 'methodNotAllowed("POST"'),
  mutationEvidence("review.request-revision", "/api/admin/submissions/:id/request-revision", "POST request revision", "gap", "src/routes/admin-review.ts", "const requestRevision =", 'methodNotAllowed("POST"'),
  mutationEvidence("review.reject", "/api/admin/submissions/:id/reject", "POST reject submission", "gap", "src/routes/admin-review.ts", "const reject =", 'methodNotAllowed("POST"'),
  mutationEvidence("review.comment", "/api/admin/submissions/:id/comments", "POST review comment", "gap", "src/routes/admin-review.ts", "adminComments", 'request.method === "POST"'),
].map((fact) => [fact.id, fact])));

const CAPABILITY_MUTATION_FACT_IDS = Object.freeze({
  "workbench-home": [], "workbench-submit": ["submission.create"], "workbench-knowledge": [], "workbench-search": [],
  "workbench-agent": ["agent.ask", "agent.scope", "agent.cancel"], "workbench-my-submissions": [],
  "workbench-tasks": ["tasks.create", "tasks.update", "tasks.delete", "tasks.status", "tasks.progress", "tasks.tags", "tasks.link", "tasks.unlink"],
  "workbench-boards": ["tasks.status"], "workbench-settings": [], "workbench-admin": [], "workbench-admin-submissions": [],
  "workbench-admin-duplicates": ["duplicates.decide"], "workbench-admin-assets": ["assets.retry"], "workbench-admin-members": ["members.status"],
  "workbench-admin-roles": ["roles.create", "roles.update", "roles.assign", "roles.unassign"],
  "workbench-admin-menus": ["menus.update", "menus.delete"], "workbench-admin-spaces": ["spaces.create"],
  "workbench-admin-audit": [], "workbench-admin-analytics": [],
  "workbench-notifications": ["notifications.read", "notifications.bulk-read"], "workbench-messages": [],
  "workbench-knowledge-reader": ["favorites.add", "favorites.remove", "notes.save", "notes.share", "notes.revoke-share"],
  "workbench-message-thread": ["discussions.send"],
  "workbench-admin-submission-detail": ["review.publish", "review.request-revision", "review.reject", "review.comment"],
});

export function runtimeEvidenceSnapshot() {
  return structuredClone({ apis: API_EVIDENCE, owners: OWNER_EVIDENCE, mutations: MUTATION_EVIDENCE });
}

export async function loadWorkbenchDomainAudit({ repositoryRoot = resolve(import.meta.dirname, "..") } = {}) {
  const manifestPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [manifestPath] });
  try {
    const source = sourceFile(snapshot, manifestPath);
    const capabilities = maturityRecords(source);
    const domains = domainRecords(source);
    assert.equal(new Set(domains.map((record) => record.id)).size, domains.length, "domain capability ids must be unique");
    assert.deepEqual(
      domains.map((record) => record.id).sort(),
      capabilities.map((record) => record.id).sort(),
      "domain evidence must map one-to-one to maturity capabilities",
    );
    const domainsById = new Map(domains.map((record) => [record.id, record]));
    const joined = capabilities.map((capability, routeOrder) => ({
      ...capability,
      ...domainsById.get(capability.id),
      mutationFactIds: CAPABILITY_MUTATION_FACT_IDS[capability.id],
      routeOrder,
    }));
    validateWorkbenchDomainAudit(joined, { repositoryRoot });
    return joined;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

export function validateWorkbenchDomainAudit(records, { repositoryRoot = resolve(import.meta.dirname, ".."), runtimeEvidence = runtimeEvidenceSnapshot() } = {}) {
  for (const record of records) {
    assert.ok(typeof record.id === "string" && record.id.length > 0, "domain capability id is required");
    assert.ok(Array.isArray(record.apiPaths), `${record.id}: apiPaths must be an array`);
    assert.ok(record.apiPaths.every((path) => /^\/api\/[A-Za-z0-9_/:.-]+$/u.test(path)), `${record.id}: API paths must be normalized /api paths`);
    assert.ok(Array.isArray(record.persistencePaths), `${record.id}: persistencePaths must be an array`);
    assert.ok(Array.isArray(record.mutations), `${record.id}: mutations must be an array`);
    assert.ok(Array.isArray(record.mutationFactIds), `${record.id}: mutation fact inventory is required`);

    for (const apiPath of record.apiPaths) {
      const fact = runtimeEvidence.apis[apiPath];
      assert.ok(fact, `${record.id}: unknown API evidence ${apiPath}`);
      verifyBinding(fact.route, repositoryRoot, `${record.id}: API route ${apiPath}`);
      verifyBinding(fact.paginationEvidence, repositoryRoot, `${record.id}: pagination ${apiPath}`);
      assert.equal(fact.path, apiPath, `${record.id}: API evidence contradiction for ${apiPath}`);
      const allowedMechanisms = fact.pagination === "numbered"
        ? new Set(["parseNumberedPageRequest"])
        : fact.pagination === "cursor"
          ? new Set(["parsePageRequest", "cursorPage", "pageRequest"])
          : new Set(["none", "bounded"]);
      assert.ok(allowedMechanisms.has(fact.paginationEvidence.mechanism), `${record.id}: pagination evidence contradiction for ${apiPath}`);
    }

    if (record.ownerPredicate !== null) {
      assert.ok(typeof record.ownerPredicate === "string" && record.ownerPredicate.length > 0, `${record.id}: ownerPredicate must be null or text`);
      const fact = runtimeEvidence.owners[record.ownerPredicate];
      assert.ok(fact && fact.predicate === record.ownerPredicate, `${record.id}: owner evidence contradiction`);
      for (const ownerBinding of fact.bindings) verifyBinding(ownerBinding, repositoryRoot, `${record.id}: owner evidence`);
    }

    for (const mutationFactId of record.mutationFactIds) {
      const fact = runtimeEvidence.mutations[mutationFactId];
      assert.ok(fact, `${record.id}: unknown mutation evidence ${mutationFactId}`);
      assert.ok(record.apiPaths.includes(fact.apiPath), `${record.id}: mutation ${mutationFactId} has undeclared API ${fact.apiPath}`);
      verifyBinding(fact.source, repositoryRoot, `${record.id}: mutation ${mutationFactId}`);
      assert.ok(["gap", "idempotency_key", "conditional_write"].includes(fact.strategy), `${record.id}: mutation strategy evidence contradiction for ${mutationFactId}`);
      if (fact.strategy === "idempotency_key") {
        assert.ok(fact.source.tokens.some((token) => /idempoten|INSERT OR IGNORE|ON CONFLICT|clientKey|intent/iu.test(token)), `${record.id}: mutation strategy evidence contradiction for ${mutationFactId}`);
      }
      if (fact.strategy === "conditional_write") {
        assert.ok(fact.source.tokens.some((token) => /expected|compare|pending|status|IS NULL|requestRevision|reject/iu.test(token)), `${record.id}: mutation strategy evidence contradiction for ${mutationFactId}`);
      }
    }

    const evidencePaths = [
      ...(record.frontendEvidence ?? []),
      ...(record.backendEvidence ?? []),
      ...(record.testEvidence ?? []),
      ...record.persistencePaths,
    ];
    for (const path of evidencePaths) {
      assert.ok(typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.split("/").includes(".."), `${record.id}: invalid evidence path ${String(path)}`);
      assert.equal(existsSync(resolve(repositoryRoot, path)), true, `${record.id}: missing evidence path ${path}`);
    }

    if (record.dimensions?.api === "proven") {
      assert.ok(record.apiPaths.length > 0, `${record.id}: proven api dimension requires an API path`);
    }
    if (record.dimensions?.persistence === "proven") {
      assert.ok(record.persistencePaths.length > 0, `${record.id}: proven persistence dimension requires runtime persistence evidence`);
      assert.ok(record.persistencePaths.some((path) => path.startsWith("src/")), `${record.id}: a migration alone cannot prove persistence`);
    }
    if (record.dimensions?.isolation === "proven") {
      assert.ok(record.ownerPredicate !== null, `${record.id}: proven isolation dimension requires a runtime owner predicate`);
    }
    if (record.dimensions?.query_or_idempotency === "proven") {
      assert.ok(record.apiPaths.length > 0 || record.mutationFactIds.length > 0, `${record.id}: proven query or idempotency dimension lacks evidence`);
    }
  }
  return records;
}

export function renderWorkbenchDomainAudit(records) {
  const sorted = [...records].sort((left, right) => left.routeOrder - right.routeOrder || left.id.localeCompare(right.id));
  const rows = sorted.map((record) => [
    record.id,
    record.pathname,
    listCell(record.apiPaths.map((path) => `${path} (${API_EVIDENCE[path].pagination})`)),
    listCell(record.persistencePaths),
    record.ownerPredicate ?? "—",
    mutationCell(record),
    listCell(record.testEvidence),
    record.classification,
    listCell(record.gaps),
  ].map(markdownCell).join(" | "));
  return [
    "# Workbench R0 Domain Audit",
    "",
    "Generated deterministically by `scripts/workbench-domain-audit.mjs`. Every API carries its independently bound runtime pagination shape. Mutation status is derived from verified source facts and remains conservative.",
    "",
    "| Capability | Route | API and pagination | Persistence | Owner predicate | Mutation safety | Test evidence | Classification | Gaps |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

function mutationCell(record) {
  if (record.mutationFactIds.length === 0) return "not_applicable";
  return record.mutationFactIds.map((id) => {
    const fact = MUTATION_EVIDENCE[id];
    return `${fact.description} — ${fact.strategy === "gap" ? "gap" : `proven ${fact.strategy}`}`;
  }).join("; ");
}

function verifyBinding(evidenceBinding, repositoryRoot, context) {
  assert.ok(evidenceBinding && typeof evidenceBinding.path === "string" && Array.isArray(evidenceBinding.tokens), `${context}: invalid evidence binding`);
  const absolutePath = resolve(repositoryRoot, evidenceBinding.path);
  assert.equal(existsSync(absolutePath), true, `${context}: missing evidence path ${evidenceBinding.path}`);
  const source = readFileSync(absolutePath, "utf8");
  assert.ok(evidenceBinding.tokens.length > 0, `${context}: evidence binding requires tokens`);
  for (const token of evidenceBinding.tokens) assert.ok(source.includes(token), `${context}: missing source token ${JSON.stringify(token)}`);
}

function listCell(values) {
  return values.length === 0 ? "—" : values.join("<br>");
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function sourceFile(snapshot, path) {
  const project = snapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  assert.ok(source, `${path} is required`);
  const diagnostics = project.program.getSyntacticDiagnostics(path);
  assert.equal(diagnostics.length, 0, `${path} must parse without syntactic diagnostics`);
  return source;
}

function maturityRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_CAPABILITIES").map((entry, index) => {
    const context = `maturity record ${index}`;
    const properties = objectProperties(entry, context);
    return {
      id: requiredString(properties, "id", context),
      pathname: requiredString(properties, "pathname", context),
      classification: requiredString(properties, "classification", context),
      dimensions: stringRecord(source, properties.get("dimensions"), `${context} dimensions`),
      frontendEvidence: stringArray(source, properties.get("frontendEvidence"), `${context} frontendEvidence`),
      backendEvidence: stringArray(source, properties.get("backendEvidence"), `${context} backendEvidence`),
      testEvidence: stringArray(source, properties.get("testEvidence"), `${context} testEvidence`),
      gaps: stringArray(source, properties.get("gaps"), `${context} gaps`),
    };
  });
}

function domainRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_DOMAIN_EVIDENCE").map((entry, index) => {
    const context = `domain record ${index}`;
    const properties = objectProperties(entry, context);
    assert.deepEqual(new Set(properties.keys()), DOMAIN_KEYS, `${context} must use the exact domain fields`);
    return {
      id: requiredString(properties, "id", context),
      apiPaths: stringArray(source, properties.get("apiPaths"), `${context} apiPaths`),
      persistencePaths: stringArray(source, properties.get("persistencePaths"), `${context} persistencePaths`),
      ownerPredicate: nullableString(properties, "ownerPredicate", context),
      pagination: requiredString(properties, "pagination", context),
      mutations: stringArray(source, properties.get("mutations"), `${context} mutations`),
      mutationSafety: requiredString(properties, "mutationSafety", context),
    };
  });
}

function arrayRecords(source, declarationName) {
  const declaration = variableDeclaration(source, declarationName);
  const initializer = unwrapExpression(declaration.initializer);
  assert.ok(isCallExpression(initializer), `${declarationName} must use Object.freeze`);
  assert.equal(initializer.expression.getText(source), "Object.freeze", `${declarationName} must use Object.freeze`);
  assert.equal(initializer.arguments.length, 1, `${declarationName} must freeze one array`);
  const array = unwrapExpression(initializer.arguments[0]);
  assert.ok(isArrayLiteralExpression(array), `${declarationName} must freeze an array`);
  return array.elements;
}

function variableDeclaration(source, name) {
  const declarations = [];
  const visit = (node) => {
    if (isVariableDeclaration(node) && isIdentifier(node.name) && node.name.text === name) declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, `${name} declaration is required exactly once`);
  assert.ok(declarations[0].initializer, `${name} initializer is required`);
  return declarations[0];
}

function objectProperties(node, context) {
  assert.ok(isObjectLiteralExpression(node), `${context} must be an object literal`);
  const properties = new Map();
  for (const property of node.properties) {
    assert.ok(isPropertyAssignment(property), `${context} must use property assignments`);
    assert.ok(property.name && (isIdentifier(property.name) || isStringLiteral(property.name)), `${context} property name is invalid`);
    assert.ok(!properties.has(property.name.text), `${context} has duplicate ${property.name.text}`);
    properties.set(property.name.text, property.initializer);
  }
  return properties;
}

function requiredString(properties, name, context) {
  const value = properties.get(name);
  assert.ok(isStringLiteral(value), `${context} ${name} must be a string literal`);
  return value.text;
}

function nullableString(properties, name, context) {
  const value = properties.get(name);
  if (value?.getText() === "null") return null;
  return requiredString(properties, name, context);
}

function stringArray(source, node, context) {
  const array = staticExpression(source, node, context);
  assert.ok(isArrayLiteralExpression(array), `${context} must be an array literal`);
  return array.elements.map((element, index) => {
    assert.ok(isStringLiteral(element), `${context} ${index} must be a string literal`);
    return element.text;
  });
}

function stringRecord(source, node, context) {
  const properties = objectProperties(staticExpression(source, node, context), context);
  return Object.fromEntries([...properties].map(([key, value]) => [key, requiredString(new Map([[key, value]]), key, context)]));
}

function staticExpression(source, expression, context) {
  expression = unwrapExpression(expression);
  if (isIdentifier(expression)) {
    const declaration = variableDeclaration(source, expression.text);
    assert.ok(declaration.initializer, `${context} ${expression.text} initializer is required`);
    expression = unwrapExpression(declaration.initializer);
  }
  assert.ok(!isIdentifier(expression), `${context} must not use an identifier chain`);
  return expression;
}

function unwrapExpression(expression) {
  while (isAsExpression(expression) || isSatisfiesExpression(expression) || isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

async function runCli() {
  const repositoryRoot = resolve(import.meta.dirname, "..");
  const [mode, argument, extra] = process.argv.slice(2);
  assert.equal(extra, undefined, "usage: workbench-domain-audit.mjs --check [path] | --write path");
  assert.ok(mode === "--check" || mode === "--write", "usage: workbench-domain-audit.mjs --check [path] | --write path");
  if (mode === "--write") assert.ok(argument, "--write requires an evidence path");
  const outputPath = resolve(repositoryRoot, argument ?? DEFAULT_EVIDENCE_PATH);
  const records = await loadWorkbenchDomainAudit({ repositoryRoot });
  const rendered = renderWorkbenchDomainAudit(records);
  if (mode === "--write") {
    writeFileSync(outputPath, rendered);
    process.stdout.write(`wrote ${outputPath}\n`);
    return;
  }
  assert.equal(existsSync(outputPath), true, `domain audit evidence is missing: ${outputPath}`);
  assert.equal(readFileSync(outputPath, "utf8"), rendered, `domain audit evidence is stale: ${outputPath}`);
  process.stdout.write(`domain audit evidence is current: ${outputPath}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
