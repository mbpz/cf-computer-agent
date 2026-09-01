import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { API } from "typescript/unstable/sync";
import { NodeFlags } from "typescript/unstable/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isIfStatement,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isRegularExpressionLiteral,
  isReturnStatement,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
  isVariableDeclarationList,
} from "typescript/unstable/ast/is";

const repositoryRoot = resolve(import.meta.dirname, "..");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const appRoutesPath = resolve(repositoryRoot, "frontend/app-routes.ts");
const maturityCapabilitiesPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
const maturityChecklistPath = resolve(repositoryRoot, "docs/product/workbench-product-maturity-checklist.md");
const maturityGapMatrixPath = resolve(repositoryRoot, "docs/product/workbench-product-maturity-gap-matrix.md");
const domainAuditPath = resolve(repositoryRoot, "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md");
const deliveryLedgerPath = resolve(repositoryRoot, "docs/product/delivery-status-ledger.md");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");
const classifications = new Set(["usable", "partial", "unusable", "pseudo_entry", "unreachable"]);
const dimensions = new Set(["entry", "journey", "api", "persistence", "isolation", "query_or_idempotency", "states", "accessibility", "evidence"]);
const dimensionStates = new Set(["proven", "gap", "not_applicable"]);
const roles = new Set(["anonymous", "contributor", "admin"]);
const ALL_CAPABILITY_IDS = [
  "workbench-home", "workbench-submit", "workbench-knowledge", "workbench-search", "workbench-agent",
  "workbench-my-submissions", "workbench-tasks", "workbench-boards", "workbench-settings", "workbench-admin",
  "workbench-admin-submissions", "workbench-admin-duplicates", "workbench-admin-assets", "workbench-admin-members",
  "workbench-admin-roles", "workbench-admin-menus", "workbench-admin-spaces", "workbench-admin-audit",
  "workbench-admin-analytics", "workbench-notifications", "workbench-messages", "workbench-knowledge-reader",
  "workbench-message-thread", "workbench-admin-submission-detail",
];
const LIST_CAPABILITY_IDS = [
  "workbench-home", "workbench-knowledge", "workbench-search", "workbench-my-submissions", "workbench-tasks",
  "workbench-boards", "workbench-admin-submissions", "workbench-admin-duplicates", "workbench-admin-assets",
  "workbench-admin-members", "workbench-admin-roles", "workbench-admin-menus", "workbench-admin-spaces",
  "workbench-admin-audit", "workbench-admin-analytics", "workbench-notifications", "workbench-messages",
  "workbench-message-thread",
];
const MUTATION_CAPABILITY_IDS = [
  "workbench-submit", "workbench-search", "workbench-agent", "workbench-tasks", "workbench-boards",
  "workbench-admin-submissions", "workbench-admin-duplicates", "workbench-admin-assets", "workbench-admin-members",
  "workbench-admin-roles", "workbench-admin-menus", "workbench-admin-spaces", "workbench-notifications",
  "workbench-messages", "workbench-knowledge-reader", "workbench-message-thread", "workbench-admin-submission-detail",
];
const PRIVATE_CAPABILITY_IDS = [
  "workbench-home", "workbench-submit", "workbench-knowledge", "workbench-search", "workbench-agent",
  "workbench-my-submissions", "workbench-tasks", "workbench-boards", "workbench-notifications",
  "workbench-messages", "workbench-knowledge-reader", "workbench-message-thread",
];
const R0_ATOM_POLICIES = new Map([
  ["R0-001", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { entry: "proven" }, evidenceClasses: ["manifest", "route"] }],
  ["R0-002", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { journey: "gap" }, evidenceClasses: ["manifest", "route", "domain"] }],
  ["R0-003", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { entry: "proven", isolation: "gap" }, evidenceClasses: ["manifest", "route"] }],
  ["R0-004", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { states: "gap" }, evidenceClasses: ["manifest", "route"] }],
  ["R0-005", { capabilityIds: LIST_CAPABILITY_IDS, requiredDimensions: { api: "gap", query_or_idempotency: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-006", { capabilityIds: MUTATION_CAPABILITY_IDS, requiredDimensions: { query_or_idempotency: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-007", { capabilityIds: PRIVATE_CAPABILITY_IDS, requiredDimensions: { isolation: "gap" }, evidenceClasses: ["manifest", "route", "domain"] }],
  ["R0-008", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { api: "gap", persistence: "gap", isolation: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-009", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "route", "domain", "delivery"] }],
  ["R0-010", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-011", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "delivery"] }],
  ["R0-012", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "delivery"] }],
]);
const R0_EVIDENCE_CLASS_PATHS = new Map([
  ["manifest", new Set([
    "shared/workbench-maturity-capabilities.ts", "shared/workspace-route-capabilities.ts", "frontend/app-routes.ts",
    "scripts/workbench-maturity-contract.test.mjs",
  ])],
  ["route", new Set([
    "shared/workspace-route-capabilities.ts", "frontend/app-routes.ts", "test/helpers/workbench-maturity-route-fixtures.ts",
    "test/helpers/authenticated-app-harness.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx",
  ])],
  ["domain", new Set([
    "shared/workbench-maturity-capabilities.ts", "scripts/workbench-domain-audit.mjs",
    "scripts/workbench-domain-audit.test.mjs", "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md",
  ])],
  ["delivery", new Set([
    "docs/product/workbench-product-maturity-checklist.md", "docs/product/delivery-status-ledger.md",
    "docs/product/workbench-product-maturity-gap-matrix.md", "ROADMAP.md",
    "scripts/workbench-maturity-contract.test.mjs", "scripts/delivery-status-contract.test.mjs",
  ])],
]);
const MANIFEST_GAP_POLICIES = new Map(Object.entries({
  "workbench-home": { source: "manifest:0@edfe01e1ad3d", dimension: "api", slug: "authoritative-summary-and-recent-recovery", symptom: "首页硬编码零指标，recent pending/error 被伪装为 ready/empty，且游标列表无继续入口。", owner: "R7-010" },
  "workbench-submit": { source: "manifest:0@edeb39c3614b", dimension: "evidence", slug: "signed-submission-acceptance", symptom: "本地提交、pending、失败重试、成功及 submitter 幂等已证明，但发布与 signed-browser 验收仍缺失。", owner: "R8-009" },
  "workbench-knowledge": { source: "manifest:0@edac5a3b202d", dimension: "states", slug: "auxiliary-data-recovery", symptom: "知识页辅助 recent、favorite、note、activity、review 请求失败仍被折叠或彼此割裂。", owner: "R2-010" },
  "workbench-search": { source: "manifest:0@425b859782bc", dimension: "journey", slug: "filter-restore-and-result-open", symptom: "搜索降级、筛选恢复和打开结果的端到端旅程仍不完整。", owner: "R3-014" },
  "workbench-agent": { source: "manifest:0@4d692899e183", dimension: "states", slug: "cited-completion-and-cancel-recovery", symptom: "Agent 没有明确空答案状态，引用完成、取消恢复与配额降级未形成完整旅程。", owner: "R3-016" },
  "workbench-my-submissions": { source: "manifest:0@7f29b6446786", dimension: "journey", slug: "resubmission-and-status-recovery", symptom: "我的提交缺少退回后的重提和完整状态恢复旅程。", owner: "R3-001" },
  "workbench-tasks": { source: "manifest:0@f69e69f87dec", dimension: "isolation", slug: "revocation-and-mutation-convergence", symptom: "撤权路径虽有探针，但 mutation、删除恢复及并发收敛尚未形成完整私有任务旅程。", owner: "R4-012" },
  "workbench-boards": { source: "manifest:0@0f01e0145a2e", dimension: "query_or_idempotency", slug: "move-concurrency-and-rollback", symptom: "看板移动缺少键盘操作、并发冲突与精确乐观回滚的完整旅程。", owner: "R4-012" },
  "workbench-settings": { source: "manifest:0@5e57e601f4cd", dimension: "states", slug: "persisted-settings-boundary", symptom: "设置页没有路由级异步状态、持久化或保存 pending 边界。", owner: "R1-012" },
  "workbench-admin": { source: "manifest:0@59434198411a", dimension: "api", slug: "real-dashboard-summary", symptom: "管理 Dashboard 使用硬编码零指标且无路由级加载、空态与错误恢复。", owner: "R6-001" },
  "workbench-admin-submissions": { source: "manifest:0@e56a2c5a0b50", dimension: "journey", slug: "queue-to-decision-recovery", symptom: "审核队列初始错误无重试，列表到详情发现、决策完成和幂等尚未闭环。", owner: "R6-003" },
  "workbench-admin-duplicates": { source: "manifest:0@52988e32a0b8", dimension: "journey", slug: "duplicate-decision-recovery", symptom: "重复候选页初始错误无重试且决策收敛旅程未证明。", owner: "R6-010" },
  "workbench-admin-assets": { source: "manifest:0@96b40fbd4a65", dimension: "states", slug: "parse-progress-and-recovery", symptom: "资产页初始加载不可重试，解析进度与完整恢复旅程不完整。", owner: "R6-004" },
  "workbench-admin-members": { source: "manifest:0@73518e6bede9", dimension: "journey", slug: "member-status-and-audit-navigation", symptom: "成员页初始错误无重试，禁用后的缓存失效与审计定位未闭环。", owner: "R6-005" },
  "workbench-admin-roles": { source: "manifest:0@5d2693dc1b9e", dimension: "isolation", slug: "role-projection-and-session-hardening", symptom: "角色页缺少畸形提权 session、后端角色投影与 signed-browser 的完整拒绝证据。", owner: "R6-006" },
  "workbench-admin-menus": { source: "manifest:0@a0343c75e574", dimension: "journey", slug: "projection-invalidation", symptom: "菜单页初始错误无重试，跨 session 投影失效尚未形成产品旅程。", owner: "R6-007" },
  "workbench-admin-spaces": { source: "manifest:0@529d9702bce9", dimension: "journey", slug: "archive-content-impact", symptom: "Space 页初始错误无重试，归档与内容影响确认未闭环。", owner: "R6-008" },
  "workbench-admin-audit": { source: "manifest:0@bfef1ebcb5d4", dimension: "states", slug: "raw-page-shape-and-retry", symptom: "审计页 raw page 与 generation/page 解构不兼容，ready/empty 不可达且错误无重试。", owner: "R6-009" },
  "workbench-admin-analytics": { source: "manifest:0@5002e212125a", dimension: "journey", slug: "date-range-and-pagination", symptom: "统计页初始错误无重试，完整日期范围与数字分页旅程未证明。", owner: "R6-002" },
  "workbench-notifications": { source: "manifest:0@a0f9955f2fa0", dimension: "isolation", slug: "revoked-target-navigation", symptom: "通知目标撤权后的跳转与顶部未读收敛尚未闭环。", owner: "R5-005" },
  "workbench-messages": { source: "manifest:0@6f83a4364e6d", dimension: "isolation", slug: "context-revocation-presentation", symptom: "上下文 thread 发现与 stale/revoked target 的明确呈现尚未闭环。", owner: "R5-011" },
  "workbench-knowledge-reader": { source: "manifest:0@823eea297a96", dimension: "isolation", slug: "secondary-object-reauthorization", symptom: "阅读器私有笔记、分享、收藏和访问记录的完整二级对象撤权旅程未证明。", owner: "R3-012" },
  "workbench-message-thread": { source: "manifest:0@fb654b86d344", dimension: "isolation", slug: "thread-context-revocation", symptom: "thread context 返回 403 时仍是通用错误，缺少明确撤权状态及深链发现证据。", owner: "R5-011" },
  "workbench-admin-submission-detail": { source: "manifest:0@b139ccd7bb29", dimension: "journey", slug: "decision-idempotency-and-discovery", symptom: "审核详情缺少空态、初始重试、队列发现和决策幂等闭环。", owner: "R6-003" },
}));
const DOMAIN_GAP_POLICIES = new Map(Object.entries({
  "DELETE /api/tasks/:id": { slug: "delete-task", symptom: "删除任务缺少已证明的重放与 uncertain-outcome 收敛策略。", owner: "R4-010" },
  "DELETE /api/tasks/:id/links/:linkId": { slug: "delete-knowledge-link", symptom: "删除任务知识关联缺少已证明的幂等与目标授权策略。", owner: "R4-005" },
  "PATCH /api/tasks/:id": { slug: "update-task", symptom: "任务详情更新缺少条件写入或幂等重放证明。", owner: "R4-003" },
  "POST /api/tasks/:id/links": { slug: "create-knowledge-link", symptom: "创建任务知识关联缺少重放收敛与二级目标授权证明。", owner: "R4-005" },
  "POST /api/tasks/:id/progress": { slug: "append-progress", symptom: "追加进度缺少稳定客户端键与重复事件收敛证明。", owner: "R4-004" },
  "PUT /api/tasks/:id/tags": { slug: "replace-tags", symptom: "替换任务标签缺少并发条件与重放后权威集合证明。", owner: "R4-005" },
  "PATCH /api/admin/members/:id/status": { slug: "change-member-status", symptom: "成员状态修改缺少重放、session 收缩与缓存失效证明。", owner: "R6-005" },
  "DELETE role member; repeat returns 404": { slug: "remove-role-member", symptom: "重复移除角色成员返回 404，尚未定义安全收敛和审计语义。", owner: "R6-006" },
  "PATCH /api/admin/roles/:id": { slug: "update-role", symptom: "角色权限更新缺少并发条件和重复请求策略。", owner: "R6-006" },
  "POST /api/admin/roles": { slug: "create-role", symptom: "创建角色缺少稳定幂等键与 uncertain-outcome 重放策略。", owner: "R6-006" },
  "POST assign role member; duplicate returns 409": { slug: "assign-role-member", symptom: "重复分配角色成员返回 409，尚未定义授权写入收敛语义。", owner: "R6-006" },
  "DELETE /api/admin/menus/:id": { slug: "delete-menu", symptom: "菜单删除缺少重放、层级影响与跨 session 投影收敛证明。", owner: "R6-007" },
  "PATCH /api/admin/menus/:id": { slug: "update-menu", symptom: "菜单编辑缺少原子排序、并发冲突与投影失效证明。", owner: "R6-007" },
  "POST /api/discussions/context": { slug: "create-context-thread", symptom: "创建上下文 thread 缺少重放收敛和当前目标再授权证明。", owner: "R5-006" },
  "DELETE /api/knowledge/:id/note/shares/:recipientId": { slug: "remove-note-share", symptom: "移除私有笔记分享缺少重放收敛与接收者访问即时收缩证明。", owner: "R3-011" },
  "POST /api/knowledge/:id/note/shares": { slug: "create-note-share", symptom: "创建私有笔记分享缺少幂等与知识目标再授权证明。", owner: "R3-011" },
  "PUT /api/knowledge/:id/note": { slug: "update-private-note", symptom: "更新私有笔记缺少并发条件与 uncertain-outcome 收敛证明。", owner: "R3-011" },
  "DELETE /api/saved-views/:id": { slug: "delete-saved-view", symptom: "删除 Saved View 缺少重放与 uncertain-outcome 收敛策略。", owner: "R3-014" },
  "POST /api/saved-views": { slug: "create-saved-view", symptom: "创建 Saved View 缺少稳定幂等键与重复请求证明。", owner: "R3-014" },
  "PATCH /api/knowledge/chat/conversations/:id/scope": { slug: "update-conversation-scope", symptom: "Agent 会话范围更新缺少条件写入与撤权后收敛策略。", owner: "R3-016" },
  "POST /api/knowledge/chat": { slug: "submit-chat-turn", symptom: "Agent 提问缺少端到端稳定请求键和重复副作用证明。", owner: "R3-016" },
  "POST /api/knowledge/chat/conversations/:id/cancel": { slug: "cancel-conversation", symptom: "取消 Agent 会话缺少重复请求与终态收敛证明。", owner: "R3-016" },
  "POST /api/admin/assets/:id/retry": { slug: "retry-asset", symptom: "资产解析重试缺少稳定幂等键与重复任务抑制证明。", owner: "R6-004" },
  "POST /api/admin/spaces": { slug: "create-space", symptom: "创建 Space 缺少稳定幂等键和重放策略。", owner: "R6-008" },
  "DELETE /api/knowledge/:id/favorite": { slug: "remove-favorite", symptom: "取消收藏缺少重复请求与响应丢失后的收敛证明。", owner: "R3-011" },
  "POST /api/admin/submissions/:id/comments": { slug: "add-review-comment", symptom: "审核评论缺少稳定客户端键与重复写入抑制证明。", owner: "R6-003" },
  "POST /api/admin/submissions/:id/publish": { slug: "publish-submission", symptom: "发布决策缺少不可变 Revision 的重放收敛证明。", owner: "R6-003" },
  "POST /api/admin/submissions/:id/reject": { slug: "reject-submission", symptom: "拒绝决策缺少幂等重放与并发冲突策略。", owner: "R6-003" },
  "POST /api/admin/submissions/:id/request-revision": { slug: "request-revision", symptom: "退回修改决策缺少幂等、通知去重与并发策略。", owner: "R6-003" },
}));
const menuRecordKeys = new Set([
  "id", "routeId", "pathname", "requiredRole", "journey", "classification", "dimensions",
  "frontendEvidence", "backendEvidence", "testEvidence", "ledgerIds", "gaps",
]);
const parameterizedRecordKeys = new Set([...menuRecordKeys, "parentRouteId", "routePattern"]);

test("every visible ready route has one maturity capability record", () => {
  const { routes, parameterizedRoutes, maturity } = loadContracts();
  const visible = routes.filter((route) => route.availability === "ready");
  const menuMaturity = maturity.filter((item) => item.routePattern === undefined);
  const parameterizedMaturity = maturity.filter((item) => item.routePattern !== undefined);

  assert.deepEqual(
    menuMaturity.map((item) => item.routeId).sort(),
    visible.map((route) => route.id).sort(),
  );
  assert.deepEqual(
    parameterizedMaturity.map((item) => ({ routeId: item.routeId, routePattern: item.routePattern })).sort(byRouteId),
    parameterizedRoutes.map((route) => ({ routeId: route.routeId, routePattern: route.routePattern })).sort(byRouteId),
  );
});

test("maturity records are structural, complete, and evidence-backed", () => {
  const { routes, parameterizedRoutes, maturity } = loadContracts();
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const parameterizedById = new Map(parameterizedRoutes.map((route) => [route.routeId, route]));
  assert.equal(new Set(maturity.map((item) => item.id)).size, maturity.length, "maturity record ids must be unique");
  assert.equal(new Set(maturity.map((item) => item.routeId)).size, maturity.length, "maturity route ids must be unique");

  for (const record of maturity) {
    assert.ok(record.id.length > 0, "maturity record id is required");
    if (record.routePattern === undefined) {
      assert.ok(routesById.has(record.routeId), `${record.id} has an unknown routeId`);
      assert.equal(record.pathname, routesById.get(record.routeId).path, `${record.id} pathname must match its route`);
      assert.equal(record.parentRouteId, undefined, `${record.id} menu route must not declare a parentRouteId`);
    } else {
      const sourceRoute = parameterizedById.get(record.routeId);
      assert.ok(sourceRoute, `${record.id} has an unknown parameterized routeId`);
      assert.equal(record.routePattern, sourceRoute.routePattern, `${record.id} routePattern must match frontend/app-routes.ts`);
      assert.ok(record.parentRouteId && routesById.has(record.parentRouteId), `${record.id} parameterized route requires a menu parentRouteId`);
      const parentPath = routesById.get(record.parentRouteId).path;
      assert.equal(record.pathname, `${parentPath === "/" ? "" : parentPath}/:id`, `${record.id} pathname must be the parent route template`);
    }
    assert.ok(roles.has(record.requiredRole), `${record.id} has unsupported requiredRole`);
    assert.ok(record.journey.length > 0, `${record.id} journey is required`);
    assert.ok(classifications.has(record.classification), `${record.id} has unsupported classification`);
    assert.deepEqual([...record.dimensions.keys()].sort(), [...dimensions].sort(), `${record.id} must declare every dimension`);

    const evidence = [...record.frontendEvidence, ...record.backendEvidence, ...record.testEvidence];
    for (const [dimension, status] of record.dimensions) {
      assert.ok(dimensionStates.has(status), `${record.id} ${dimension} has unsupported dimension state`);
      if (status === "proven") assert.ok(evidence.length > 0, `${record.id} ${dimension} requires evidence`);
    }
    if ([...record.dimensions.values()].includes("gap")) {
      assert.ok(record.gaps.length > 0, `${record.id} requires gap text for a gap dimension`);
    }
    for (const [name, values] of Object.entries({
      frontendEvidence: record.frontendEvidence,
      backendEvidence: record.backendEvidence,
      testEvidence: record.testEvidence,
      ledgerIds: record.ledgerIds,
    })) {
      assert.ok(values.length > 0, `${record.id} ${name} is required`);
      assert.ok(values.every((value) => value.length > 0), `${record.id} ${name} must contain non-empty strings`);
    }
    assert.ok(record.gaps.every((gap) => gap.length > 0), `${record.id} gaps must contain non-empty strings`);
  }
});

test("AST extraction fails closed on syntax diagnostics and mutable indirection", () => {
  withMaturityFixture(maturityFixture({ trailing: "]" }), (snapshot, path) => {
    assert.throws(
      () => maturityRecords(sourceFile(snapshot, path)),
      /must parse without syntactic diagnostics/u,
    );
  });
  withMaturityFixture(maturityFixture({ declaration: "let" }), (snapshot, path) => {
    assert.throws(
      () => maturityRecords(sourceFile(snapshot, path)),
      /must resolve through a const declaration/u,
    );
  });
});

test("R0 checklist atoms carry four-dimensional evidence without promoting release or acceptance", () => {
  const { maturity } = loadContracts();
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));
  const atoms = r0ChecklistAtoms(checklist);

  assert.deepEqual(
    atoms.map((atom) => atom.id),
    Array.from({ length: 12 }, (_, index) => `R0-${String(index + 1).padStart(3, "0")}`),
    "R0 checklist must contain exactly the twelve canonical atoms in order",
  );
  assert.deepEqual(
    Object.fromEntries(["x", "-", " "].map((marker) => [marker, atoms.filter((atom) => atom.marker === marker).length])),
    { x: 7, "-": 5, " ": 0 },
    "R0 markers must represent local completion independently from release and acceptance",
  );

  for (const atom of atoms) {
    assertR0AtomEvidence(atom, ledgerIds, maturity);
  }
});

test("R0 checklist markers derive only from local implementation and verification", () => {
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));
  const { maturity } = loadContracts();
  const atoms = r0ChecklistAtoms(checklist);
  const locallyDone = atoms.filter((atom) =>
    atom.dimensions.implementation.status === "done" && atom.dimensions.verification.status === "done"
  );
  const locallyPartial = atoms.filter((atom) =>
    [atom.dimensions.implementation.status, atom.dimensions.verification.status].includes("partial")
  );
  const locallyPending = atoms.filter((atom) =>
    [atom.dimensions.implementation.status, atom.dimensions.verification.status].includes("pending")
  );

  assert.ok(locallyDone.length > 0, "fixture requires locally done atoms");
  assert.ok(locallyPartial.length > 0, "fixture requires locally partial atoms");
  for (const atom of locallyDone) assert.equal(atom.marker, "x", `${atom.id} local done must use [x]`);
  for (const atom of locallyPartial) assert.equal(atom.marker, "-", `${atom.id} local partial must use [-]`);
  for (const atom of locallyPending) assert.equal(atom.marker, " ", `${atom.id} local pending must use [ ]`);

  assert.throws(
    () => assertR0AtomEvidence({ ...locallyPartial[0], marker: "x" }, ledgerIds, maturity),
    /cannot be checked without done implementation and verification/u,
  );
  const pending = {
    ...locallyDone[0],
    marker: " ",
    dimensions: {
      ...locallyDone[0].dimensions,
      implementation: { status: "pending", detail: "Synthetic pending implementation." },
    },
  };
  assert.doesNotThrow(() => assertR0AtomEvidence(pending, ledgerIds, maturity));
  assert.throws(
    () => assertR0AtomEvidence({ ...pending, marker: "x" }, ledgerIds, maturity),
    /cannot be checked without done implementation and verification/u,
  );
});

test("R0 atoms bind exact capabilities, ledger rows, dimensions, and evidence classes", () => {
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const atoms = r0ChecklistAtoms(checklist);
  const { maturity } = loadContracts();
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));

  assert.equal(R0_ATOM_POLICIES.size, atoms.length, "every R0 atom requires an independent evidence policy");
  for (const atom of atoms) assertR0AtomEvidence(atom, ledgerIds, maturity);
});

test("R0 evidence binding rejects unrelated paths and global manifest substitution", () => {
  const atoms = r0ChecklistAtoms(readFileSync(maturityChecklistPath, "utf8"));
  const { maturity } = loadContracts();
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));
  const source = atoms.find((atom) => atom.id === "R0-001");
  assert.ok(source, "R0-001 fixture is required");

  assert.throws(
    () => assertR0AtomEvidence({
      ...source,
      dimensions: {
        ...source.dimensions,
        implementation: { ...source.dimensions.implementation, detail: "`README.md`" },
      },
    }, ledgerIds, maturity),
    /unsupported implementation evidence/u,
  );
  assert.throws(
    () => assertR0AtomEvidence({
      ...source,
      dimensions: { ...source.dimensions, ledger: { status: "manifest", detail: "bare global union" } },
    }, ledgerIds, maturity),
    /ledger mapping must match its capabilities/u,
  );
});

test("every manifest and domain gap has one stable future owner", () => {
  const { maturity } = loadContracts();
  const rows = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const expectedSources = expectedGapSources(
    maturity,
    readFileSync(domainAuditPath, "utf8"),
  );
  const checklistAtoms = futureChecklistAtomIds(readFileSync(maturityChecklistPath, "utf8"));

  assert.equal(new Set(rows.map((row) => row.gapId)).size, rows.length, "gap IDs must be unique");
  assert.deepEqual(
    rows.map((row) => `${row.capability}|${row.source}`).sort(),
    [...expectedSources.keys()].sort(),
    "every manifest/domain source gap must appear exactly once",
  );
  assertGapPolicyCoverage(expectedSources);

  for (const row of rows) assertGapRow(row, checklistAtoms, expectedSources);
});

test("canonical source policy rejects gap ID, symptom, and owner self-certification", () => {
  const { maturity } = loadContracts();
  const expectedSources = expectedGapSources(maturity, readFileSync(domainAuditPath, "utf8"));
  const checklistAtoms = futureChecklistAtomIds(readFileSync(maturityChecklistPath, "utf8"));
  const source = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"))[0];

  assert.throws(
    () => assertGapRow({ ...source, gapId: source.gapId.replace(/:[^:]+$/u, ":renamed") }, checklistAtoms, expectedSources),
    /canonical gap ID/u,
  );
  assert.throws(
    () => assertGapRow({ ...source, symptom: "This unrelated placeholder is deliberately long enough." }, checklistAtoms, expectedSources),
    /canonical symptom/u,
  );
  assert.throws(
    () => assertGapRow({ ...source, owner: "R4-009" }, checklistAtoms, expectedSources),
    /canonical owner/u,
  );
});

test("gap execution order is priority-first and never depends on a later phase", () => {
  const rows = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const checklistAtoms = futureChecklistAtomIds(readFileSync(maturityChecklistPath, "utf8"));
  const priorities = rows.map((row) => Number(row.priority.slice(1)));

  assert.ok(rows.some((row) => row.priority === "P0"), "matrix requires user-blocking or authorization P0 work");
  assert.deepEqual(priorities, [...priorities].sort((left, right) => left - right), "P0 must precede polish priorities");
  for (const row of rows) {
    const ownerPhase = atomPhase(row.owner);
    for (const prerequisite of row.prerequisites) {
      assert.ok(checklistAtoms.has(prerequisite), `${row.gapId} has unknown prerequisite ${prerequisite}`);
      assert.ok(atomPhase(prerequisite) <= ownerPhase, `${row.gapId} depends on later phase ${prerequisite}`);
      assert.notEqual(prerequisite, row.owner, `${row.gapId} cannot depend on its owner atom`);
    }
  }
  assertAcyclicGapGraph(rows);
});

test("dependency graph rejects direct and long same-phase cycles", () => {
  assert.throws(
    () => assertAcyclicGapGraph([
      { gapId: "two-a", owner: "R6-001", prerequisites: ["R6-002"] },
      { gapId: "two-b", owner: "R6-002", prerequisites: ["R6-001"] },
    ]),
    /dependency cycle.*R6-001.*R6-002.*R6-001/u,
  );
  assert.throws(
    () => assertAcyclicGapGraph([
      { gapId: "long-a", owner: "R4-001", prerequisites: ["R4-002"] },
      { gapId: "long-b", owner: "R4-002", prerequisites: ["R4-003"] },
      { gapId: "long-c", owner: "R4-003", prerequisites: ["R4-001"] },
    ]),
    /dependency cycle.*R4-001.*R4-002.*R4-003.*R4-001/u,
  );
});

test("R1-R8 checklist and roadmap mappings reconcile to the owned gaps", () => {
  const rows = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const checklistStages = stageMappingRows(readFileSync(maturityChecklistPath, "utf8"), "task5-stage-map");
  const roadmapStages = stageMappingRows(readFileSync(roadmapPath, "utf8"), "maturity-stage-map");
  const expectedCounts = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const phase = `R${index + 1}`;
      return [phase, rows.filter((row) => row.owner.startsWith(`${phase}-`)).length];
    }),
  );

  assert.deepEqual(checklistStages.map((stage) => stage.phase), Object.keys(expectedCounts));
  assert.deepEqual(roadmapStages.map((stage) => stage.phase), Object.keys(expectedCounts));
  for (const stage of checklistStages) {
    assert.equal(stage.ownedGaps, expectedCounts[stage.phase], `${stage.phase} checklist gap count drifted`);
    assert.ok(stage.entry.length > 0, `${stage.phase} checklist entry criteria are required`);
    assert.ok(stage.exit.length > 0, `${stage.phase} checklist exit criteria are required`);
    assert.match(stage.nextPlan, /^docs\/superpowers\/plans\/\d{4}-\d{2}-\d{2}-workbench-maturity-r[1-8]-[a-z0-9-]+\.md$/u);
    const roadmap = roadmapStages.find((candidate) => candidate.phase === stage.phase);
    assert.deepEqual(roadmap, stage, `${stage.phase} roadmap mapping must match the checklist`);
  }
});

test("R0-012 closes only with executable gap-accounting evidence", () => {
  assertTask5ClosureEvidence();
  const atoms = r0ChecklistAtoms(readFileSync(maturityChecklistPath, "utf8"));
  const atom = atoms.find((candidate) => candidate.id === "R0-012");
  assert.ok(atom, "R0-012 is required");
  assert.equal(atom.marker, "x");
  assert.equal(atom.dimensions.implementation.status, "done");
  assert.equal(atom.dimensions.verification.status, "done");
  assert.match(atom.dimensions.implementation.detail, /`docs\/product\/workbench-product-maturity-gap-matrix\.md`/u);
  assert.match(atom.dimensions.implementation.detail, /`ROADMAP\.md`/u);
  assert.match(atom.dimensions.verification.detail, /`scripts\/workbench-maturity-contract\.test\.mjs`/u);
});

function expectedGapSources(maturity, domainAudit) {
  const sources = new Map();
  for (const record of maturity) {
    record.gaps.forEach((symptom, index) => {
      const fingerprint = createHash("sha256").update(symptom).digest("hex").slice(0, 12);
      const key = `${record.id}|manifest:${index}@${fingerprint}`;
      assert.ok(!sources.has(key), `duplicate manifest gap source ${key}`);
      sources.set(key, { capability: record.id, symptom, kind: "manifest" });
    });
  }
  for (const line of domainAudit.split(/\r?\n/u)) {
    if (!line.startsWith("| workbench-")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 9, "domain audit rows must retain nine columns");
    for (const fact of cells[5].split(/;\s+(?=(?:GET|POST|PUT|PATCH|DELETE)\s)/u)) {
      if (!fact.endsWith("— gap")) continue;
      const operation = fact.slice(0, -" — gap".length);
      const key = `${cells[0]}|domain:${operation}`;
      assert.ok(!sources.has(key), `duplicate domain gap source ${key}`);
      sources.set(key, {
        capability: cells[0],
        symptom: `${operation} lacks a proven mutation-safety strategy.`,
        kind: "domain",
      });
    }
  }
  return sources;
}

function gapMatrixRows(markdown) {
  const section = markerSection(markdown, "gap-matrix");
  const lines = section.split(/\r?\n/u).filter((line) => line.startsWith("| "));
  assert.ok(lines.length >= 3, "gap matrix table is required");
  const headers = markdownCells(lines[0]);
  assert.deepEqual(headers, [
    "Gap ID", "Source", "Capability", "Symptom", "Dimension", "Owner atom", "Prerequisites",
    "Affected files", "Focused test", "Acceptance journey", "Priority",
  ]);
  return lines.slice(2).map((line) => {
    const cells = markdownCells(line);
    assert.equal(cells.length, headers.length, `gap row must contain ${headers.length} fields`);
    return {
      gapId: cells[0],
      source: cells[1],
      capability: cells[2],
      symptom: cells[3],
      dimension: cells[4],
      owner: cells[5],
      prerequisites: cells[6] === "-" ? [] : cells[6].split("<br>").map((value) => value.trim()),
      affectedFiles: cells[7].split("<br>").map((value) => value.trim()),
      focusedTest: cells[8],
      acceptanceJourney: cells[9],
      priority: cells[10],
    };
  });
}

function assertGapRow(row, checklistAtoms, expectedSources) {
  const source = expectedSources.get(`${row.capability}|${row.source}`);
  assert.ok(source, `${row.gapId} has unknown source ${row.capability}|${row.source}`);
  const canonical = canonicalGapPolicy(row.capability, row.source, source);
  assert.match(
    row.gapId,
    /^workbench-[a-z0-9-]+:(?:entry|journey|api|persistence|isolation|query_or_idempotency|states|accessibility|evidence):[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    `${row.gapId} must use the stable capability:dimension:slug format`,
  );
  const separator = row.gapId.indexOf(":");
  assert.equal(row.gapId.slice(0, separator), row.capability, `${row.gapId} capability prefix drifted`);
  assert.equal(row.gapId.split(":")[1], row.dimension, `${row.gapId} dimension prefix drifted`);
  assert.ok(dimensions.has(row.dimension), `${row.gapId} has unsupported dimension ${row.dimension}`);
  assert.equal(row.gapId, canonical.gapId, `${row.gapId} must match its canonical gap ID`);
  assert.equal(row.dimension, canonical.dimension, `${row.gapId} must match its canonical dimension`);
  assert.equal(row.symptom, canonical.symptom, `${row.gapId} must match its canonical symptom`);
  assert.equal(row.owner, canonical.owner, `${row.gapId} must match its canonical owner`);
  assert.ok(checklistAtoms.has(row.owner), `${row.gapId} has unknown owner ${row.owner}`);
  assert.equal(new Set(row.prerequisites).size, row.prerequisites.length, `${row.gapId} repeats a prerequisite`);
  assert.ok(row.affectedFiles.length > 0 && row.affectedFiles.every((path) => existsSync(resolve(repositoryRoot, path))), `${row.gapId} affected files must exist`);
  assert.ok(existsSync(resolve(repositoryRoot, row.focusedTest)), `${row.gapId} focused test must exist`);
  assert.ok(row.acceptanceJourney.length >= 12, `${row.gapId} requires an acceptance journey`);
  assert.match(row.priority, /^P[0-2]$/u, `${row.gapId} priority must be P0, P1, or P2`);
  assert.equal(row.priority, expectedPriority(row.capability, row.source), `${row.gapId} priority contradicts the independent risk policy`);
  if (source.kind === "domain") assert.equal(row.dimension, "query_or_idempotency", `${row.gapId} domain mutation gap has wrong dimension`);
}

function canonicalGapPolicy(capability, sourceKey, source) {
  if (source.kind === "manifest") {
    const policy = MANIFEST_GAP_POLICIES.get(capability);
    assert.ok(policy, `${capability}: manifest gap policy is required`);
    assert.equal(sourceKey, policy.source, `${capability}: manifest policy must bind the exact source fingerprint`);
    return {
      ...policy,
      gapId: `${capability}:${policy.dimension}:${policy.slug}`,
    };
  }
  const operation = sourceKey.slice("domain:".length);
  const policy = DOMAIN_GAP_POLICIES.get(operation);
  assert.ok(policy, `${capability}: domain gap policy is required for ${operation}`);
  return {
    dimension: "query_or_idempotency",
    gapId: `${capability}:query_or_idempotency:${policy.slug}`,
    symptom: policy.symptom,
    owner: policy.owner,
  };
}

function assertGapPolicyCoverage(expectedSources) {
  const manifestCapabilities = [];
  const domainOperations = [];
  for (const [key, source] of expectedSources) {
    const separator = key.indexOf("|");
    if (source.kind === "manifest") manifestCapabilities.push(key.slice(0, separator));
    else domainOperations.push(key.slice(separator + "|domain:".length));
  }
  assert.deepEqual(
    [...MANIFEST_GAP_POLICIES.keys()].sort(),
    manifestCapabilities.sort(),
    "manifest policies must exactly cover validated manifest sources",
  );
  assert.deepEqual(
    [...DOMAIN_GAP_POLICIES.keys()].sort(),
    domainOperations.sort(),
    "domain policies must exactly cover validated domain source operations",
  );
}

function assertAcyclicGapGraph(rows) {
  const graph = new Map();
  for (const row of rows) {
    if (!graph.has(row.owner)) graph.set(row.owner, new Set());
    for (const prerequisite of row.prerequisites) {
      graph.get(row.owner).add(prerequisite);
      if (!graph.has(prerequisite)) graph.set(prerequisite, new Set());
    }
  }
  const visited = new Set();
  const active = new Set();
  const path = [];
  const visit = (atom) => {
    if (active.has(atom)) {
      const start = path.indexOf(atom);
      assert.fail(`dependency cycle: ${[...path.slice(start), atom].join(" -> ")}`);
    }
    if (visited.has(atom)) return;
    active.add(atom);
    path.push(atom);
    for (const prerequisite of graph.get(atom) ?? []) visit(prerequisite);
    path.pop();
    active.delete(atom);
    visited.add(atom);
  };
  for (const atom of graph.keys()) visit(atom);
}

function assertTask5ClosureEvidence() {
  const { maturity } = loadContracts();
  const matrix = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const sources = expectedGapSources(maturity, readFileSync(domainAuditPath, "utf8"));
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const checklistAtoms = futureChecklistAtomIds(checklist);
  assert.deepEqual(matrix.map((row) => `${row.capability}|${row.source}`).sort(), [...sources.keys()].sort());
  assertGapPolicyCoverage(sources);
  for (const row of matrix) assertGapRow(row, checklistAtoms, sources);
  const priorities = matrix.map((row) => Number(row.priority.slice(1)));
  assert.deepEqual(priorities, [...priorities].sort((left, right) => left - right));
  assertAcyclicGapGraph(matrix);
  const checklistStages = stageMappingRows(checklist, "task5-stage-map");
  const roadmapStages = stageMappingRows(readFileSync(roadmapPath, "utf8"), "maturity-stage-map");
  assert.deepEqual(checklistStages, roadmapStages);
  for (const stage of checklistStages) {
    assert.equal(stage.ownedGaps, matrix.filter((row) => row.owner.startsWith(`${stage.phase}-`)).length);
  }
}

function expectedPriority(capability, source) {
  if (source.startsWith("manifest:")) {
    if (capability === "workbench-submit") return "P2";
    if (new Set([
      "workbench-tasks", "workbench-boards", "workbench-admin-roles", "workbench-notifications",
      "workbench-messages", "workbench-knowledge-reader", "workbench-message-thread",
    ]).has(capability)) return "P0";
    return "P1";
  }
  if (new Set([
    "workbench-tasks", "workbench-admin-members", "workbench-admin-roles", "workbench-admin-menus", "workbench-messages",
  ]).has(capability)) return "P0";
  if (capability === "workbench-knowledge-reader" && !source.includes("favorite")) return "P0";
  return "P1";
}

function futureChecklistAtomIds(markdown) {
  return new Set([...markdown.matchAll(/^- \[[ x-]\] `(R[1-8]-\d{3})` /gmu)].map((match) => match[1]));
}

function atomPhase(atomId) {
  const match = /^R([1-8])-\d{3}$/u.exec(atomId);
  assert.ok(match, `invalid future atom ${atomId}`);
  return Number(match[1]);
}

function stageMappingRows(markdown, marker) {
  const section = markerSection(markdown, marker);
  const lines = section.split(/\r?\n/u).filter((line) => line.startsWith("| "));
  assert.ok(lines.length === 10, `${marker} must contain one header, divider, and R1-R8 rows`);
  assert.deepEqual(markdownCells(lines[0]), ["Phase", "Owned gaps", "Entry criteria", "Exit criteria", "Next detailed plan"]);
  return lines.slice(2).map((line) => {
    const cells = markdownCells(line);
    assert.equal(cells.length, 5, `${marker} stage rows require five fields`);
    return { phase: cells[0], ownedGaps: Number(cells[1]), entry: cells[2], exit: cells[3], nextPlan: cells[4] };
  });
}

function markerSection(markdown, marker) {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  assert.equal(markdown.split(start).length, 2, `${marker} start marker is required exactly once`);
  assert.equal(markdown.split(end).length, 2, `${marker} end marker is required exactly once`);
  return markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end));
}

function markdownCells(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", ""));
}

function loadContracts() {
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [routeCapabilitiesPath, maturityCapabilitiesPath] });
  try {
    return {
      routes: routeRecords(sourceFile(snapshot, routeCapabilitiesPath), "WORKSPACE_ROUTE_CAPABILITIES"),
      parameterizedRoutes: parameterizedRouteRecords(sourceFile(snapshot, appRoutesPath)),
      maturity: maturityRecords(sourceFile(snapshot, maturityCapabilitiesPath)),
    };
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function r0ChecklistAtoms(markdown) {
  const section = /^## R0\b[\s\S]*?(?=^## R1\b)/mu.exec(markdown)?.[0];
  assert.ok(section, "R0 checklist section is required");
  const lines = section.split(/\r?\n/u);
  const atoms = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^- \[([ x-])\] `(R0-\d{3})` (.+)$/u.exec(lines[index]);
    if (!match) continue;
    const dimensions = {};
    for (const name of ["implementation", "verification", "release", "acceptance", "capabilities", "ledger", "required", "evidence"]) {
      const line = lines[++index] ?? "";
      const evidence = /^  - `(implementation|verification|release|acceptance|capabilities|ledger|required|evidence)`: `([^`]+)` — (.+)$/u.exec(line);
      assert.ok(evidence, `${match[2]} requires structured ${name} evidence`);
      assert.equal(evidence[1], name, `${match[2]} evidence dimensions must remain ordered`);
      dimensions[name] = { status: evidence[2], detail: evidence[3] };
    }
    atoms.push({ marker: match[1], id: match[2], description: match[3], dimensions });
  }
  return atoms;
}

function assertR0AtomEvidence(atom, ledgerIds, maturity) {
  const policy = R0_ATOM_POLICIES.get(atom.id);
  assert.ok(policy, `${atom.id} requires an atom-specific evidence policy`);
  const statuses = Object.fromEntries(
    ["implementation", "verification", "release", "acceptance"]
      .map((name) => [name, atom.dimensions[name].status]),
  );
  for (const [name, status] of Object.entries(statuses)) {
    assert.ok(["done", "partial", "pending"].includes(status), `${atom.id} has invalid ${name} status`);
  }

  for (const name of ["implementation", "verification"]) {
    if (statuses[name] === "pending") continue;
    const paths = evidencePaths(atom.dimensions[name].detail);
    assert.ok(paths.length > 0, `${atom.id} ${name} requires repository evidence paths`);
    for (const path of paths) {
      assert.ok(existsSync(resolve(repositoryRoot, path)), `${atom.id} ${name} evidence is missing: ${path}`);
    }
  }

  assert.equal(statuses.release, "pending", `${atom.id} R0 must not promote production release`);
  assert.equal(statuses.acceptance, "pending", `${atom.id} R0 must not promote signed-browser acceptance`);
  for (const name of ["release", "acceptance"]) {
    assert.match(
      atom.dimensions[name].detail,
      /`docs\/product\/delivery-status-ledger\.md`/u,
      `${atom.id} ${name} requires delivery-ledger authority`,
    );
  }

  const localDone = statuses.implementation === "done" && statuses.verification === "done";
  if (atom.marker === "x") {
    assert.ok(localDone, `${atom.id} cannot be checked without done implementation and verification`);
  } else if (atom.marker === "-") {
    assert.ok(
      [statuses.implementation, statuses.verification].includes("partial"),
      `${atom.id} partial marker requires partial local implementation or verification`,
    );
  } else {
    assert.ok(
      [statuses.implementation, statuses.verification].includes("pending"),
      `${atom.id} unchecked marker requires pending local implementation or verification`,
    );
  }

  const capabilityIds = commaList(atom.dimensions.capabilities.status);
  assert.deepEqual(capabilityIds, policy.capabilityIds, `${atom.id} capability mapping must match its audit scope`);
  const recordsById = new Map(maturity.map((record) => [record.id, record]));
  const mappedRecords = capabilityIds.map((id) => {
    const record = recordsById.get(id);
    assert.ok(record, `${atom.id} maps unknown capability ${id}`);
    return record;
  });
  const expectedLedgerIds = [...new Set(mappedRecords.flatMap((record) => record.ledgerIds))].sort();
  const declaredLedgerIds = commaList(atom.dimensions.ledger.status).sort();
  assert.deepEqual(
    declaredLedgerIds,
    expectedLedgerIds,
    `${atom.id} ledger mapping must match its capabilities`,
  );
  for (const id of declaredLedgerIds) assert.ok(ledgerIds.has(id), `${atom.id} ledger ID ${id} requires a delivery row`);

  const requiredDimensions = assignmentRecord(atom.dimensions.required.status);
  assert.deepEqual(requiredDimensions, policy.requiredDimensions, `${atom.id} required dimensions must match its audit policy`);
  for (const record of mappedRecords) {
    for (const [dimension, expected] of Object.entries(requiredDimensions)) {
      assert.equal(record.dimensions.get(dimension), expected, `${atom.id} ${record.id} ${dimension} must be ${expected}`);
    }
  }

  const evidenceClasses = commaList(atom.dimensions.evidence.status);
  assert.deepEqual(evidenceClasses, policy.evidenceClasses, `${atom.id} evidence classes must match its audit policy`);
  const localPaths = ["implementation", "verification"].flatMap((name) => evidencePaths(atom.dimensions[name].detail));
  const allowedPaths = new Set(evidenceClasses.flatMap((name) => {
    const paths = R0_EVIDENCE_CLASS_PATHS.get(name);
    assert.ok(paths, `${atom.id} has unknown evidence class ${name}`);
    return [...paths];
  }));
  for (const path of localPaths) {
    assert.ok(allowedPaths.has(path), `${atom.id} unsupported implementation evidence: ${path}`);
  }
  if (![statuses.implementation, statuses.verification].includes("pending")) {
    for (const name of evidenceClasses) {
      assert.ok(
        localPaths.some((path) => R0_EVIDENCE_CLASS_PATHS.get(name).has(path)),
        `${atom.id} requires ${name} evidence`,
      );
    }
  }
}

function evidencePaths(detail) {
  return [...detail.matchAll(/`([^`]+(?:\.[a-z0-9]+|\/[^`]+))`/giu)]
    .map((match) => match[1])
    .filter((path) => !path.includes(" "));
}

function deliveryLedgerIds(markdown) {
  return new Set([...markdown.matchAll(/^\| ([A-Z][A-Z0-9]*-[A-Z0-9]+) \|/gmu)].map((match) => match[1]));
}

function commaList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function assignmentRecord(value) {
  return Object.fromEntries(commaList(value).map((item) => {
    const match = /^([a-z_]+)=(proven|gap|not_applicable)$/u.exec(item);
    assert.ok(match, `invalid required dimension assignment: ${item}`);
    return [match[1], match[2]];
  }));
}

function sourceFile(snapshot, path) {
  const project = snapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  assert.ok(source, `${path} is required`);
  const diagnostics = project.program.getSyntacticDiagnostics(path);
  assert.equal(diagnostics.length, 0, `${path} must parse without syntactic diagnostics`);
  return source;
}

function routeRecords(source, declarationName) {
  return arrayRecords(source, declarationName).map((entry, index) => {
    const properties = objectProperties(entry, `route ${index}`);
    return {
      id: requiredString(properties, "id", `route ${index}`),
      path: requiredString(properties, "path", `route ${index}`),
      availability: requiredString(properties, "availability", `route ${index}`),
    };
  });
}

function maturityRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_CAPABILITIES").map((entry, index) => {
    const context = `maturity record ${index}`;
    const properties = objectProperties(entry, context);
    const isParameterized = properties.has("routePattern");
    assert.deepEqual(
      new Set(properties.keys()),
      isParameterized ? parameterizedRecordKeys : menuRecordKeys,
      `${context} must use the supported record fields`,
    );
    return {
      id: requiredString(properties, "id", context),
      routeId: requiredString(properties, "routeId", context),
      pathname: requiredString(properties, "pathname", context),
      requiredRole: requiredString(properties, "requiredRole", context),
      journey: requiredString(properties, "journey", context),
      classification: requiredString(properties, "classification", context),
      dimensions: stringRecord(source, properties.get("dimensions"), `${context} dimensions`),
      frontendEvidence: stringArray(source, properties.get("frontendEvidence"), `${context} frontendEvidence`),
      backendEvidence: stringArray(source, properties.get("backendEvidence"), `${context} backendEvidence`),
      testEvidence: stringArray(source, properties.get("testEvidence"), `${context} testEvidence`),
      ledgerIds: stringArray(source, properties.get("ledgerIds"), `${context} ledgerIds`),
      gaps: stringArray(source, properties.get("gaps"), `${context} gaps`),
      parentRouteId: optionalString(properties, "parentRouteId", context),
      routePattern: optionalString(properties, "routePattern", context),
    };
  });
}

function parameterizedRouteRecords(source) {
  const declarations = [];
  const visit = (node) => {
    if (isFunctionDeclaration(node) && node.name?.text === "pageKindForPath") declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, "frontend/app-routes.ts must declare pageKindForPath exactly once");
  assert.ok(declarations[0].body, "pageKindForPath body is required");
  return declarations[0].body.statements.filter(isIfStatement).map((statement, index) => parameterizedRouteRecord(statement, index));
}

function parameterizedRouteRecord(statement, index) {
  const context = `parameterized route ${index}`;
  assert.ok(isCallExpression(statement.expression), `${context} condition must call RegExp.test`);
  const condition = statement.expression;
  assert.ok(isPropertyAccessExpression(condition.expression), `${context} condition must access RegExp.test`);
  assert.equal(condition.expression.name.text, "test", `${context} condition must call RegExp.test`);
  assert.ok(isRegularExpressionLiteral(condition.expression.expression), `${context} matcher must be a regex literal`);
  assert.equal(condition.arguments.length, 1, `${context} matcher must receive pathname once`);
  assert.ok(isIdentifier(condition.arguments[0]) && condition.arguments[0].text === "pathname", `${context} matcher must receive pathname`);
  assert.ok(isReturnStatement(statement.thenStatement) && isStringLiteral(statement.thenStatement.expression), `${context} must return a string route identity`);
  return { routeId: statement.thenStatement.expression.text, routePattern: condition.expression.expression.getText() };
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

function optionalString(properties, name, context) {
  if (!properties.has(name)) return undefined;
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
  const record = new Map();
  for (const [key, value] of properties) record.set(key, requiredString(new Map([[key, value]]), key, context));
  return record;
}

function staticExpression(source, expression, context) {
  expression = unwrapExpression(expression);
  if (isIdentifier(expression)) {
    const declaration = variableDeclaration(source, expression.text);
    assert.ok(
      isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & NodeFlags.Const) !== 0,
      `${context} ${expression.text} must resolve through a const declaration`,
    );
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

function withMaturityFixture(source, action) {
  const directory = mkdtempSync(resolve(tmpdir(), "workbench-maturity-contract-"));
  const path = resolve(directory, "workbench-maturity-capabilities.ts");
  writeFileSync(path, source);
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [path] });
  try {
    action(snapshot, path);
  } finally {
    snapshot.dispose();
    api.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function maturityFixture({ declaration = "const", trailing = "" } = {}) {
  return `
    ${declaration} INITIAL_DIMENSIONS = {
      entry: "proven", journey: "gap", api: "gap", persistence: "gap", isolation: "gap",
      query_or_idempotency: "gap", states: "gap", accessibility: "gap", evidence: "gap",
    };
    ${declaration} INITIAL_GAPS = ["fixture gap"];
    export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([{
      id: "fixture", routeId: "fixture", pathname: "/fixture", requiredRole: "contributor",
      journey: "Fixture journey", classification: "partial", dimensions: INITIAL_DIMENSIONS,
      frontendEvidence: ["frontend.tsx"], backendEvidence: ["backend.ts"], testEvidence: ["test.ts"],
      ledgerIds: ["FIX-001"], gaps: INITIAL_GAPS,
    }]);
    ${trailing}
  `;
}

function byRouteId(left, right) {
  return left.routeId.localeCompare(right.routeId);
}
