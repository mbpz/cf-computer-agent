import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
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

const repositoryRoot = resolve(import.meta.dirname, "..");
const ledgerPath = resolve(repositoryRoot, "docs/product/delivery-status-ledger.md");
const knowledgeChecklistPath = resolve(repositoryRoot, "docs/product/ai-knowledge-base-checklist.md");
const frontendChecklistPath = resolve(repositoryRoot, "docs/product/shadcn-ui-frontend-checklist.md");
const maturityChecklistPath = resolve(repositoryRoot, "docs/product/workbench-product-maturity-checklist.md");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");
const readmePath = resolve(repositoryRoot, "README.md");
const collaborationEvidencePath = resolve(
  repositoryRoot,
  "docs/operations/evidence/2026-08-30-workbench-collaboration.md",
);
const migrationVerifierPath = resolve(repositoryRoot, "scripts/verify-m1-migrations.mjs");

const README_REQUIRED_LINKS = [
  "ROADMAP.md",
  "docs/product/delivery-status-ledger.md",
  "docs/product/ai-knowledge-base-checklist.md",
  "docs/product/shadcn-ui-frontend-checklist.md",
  "docs/operations/production-environment-handbook.md",
  "docs/operations/evidence/",
];
const README_CLAIM_MODIFIERS = "(?:(?:now|already|fully|all)\\s+)*";
const README_POSITIVE_CLAIM = "(?:ready|implemented|available|complete(?:d)?|done|accepted|production-ready|ready-for-production)";
const README_FINAL_CLAIM = "(?:ready|complete(?:d)?|done|accepted|production-ready|ready-for-production)";
const README_CLAIM_BETWEEN = "(?:(?!\\b(?:but|however|yet|while)\\b)[^.\\n;]){0,96}?";
const README_MARKDOWN_CLAUSE_PREFIX = "^\\s*(?:(?:>{1,3}|#{1,6}|[-+*]|\\d+[.)])\\s+)*";
const README_TASKS_HEAD_ARTICLE = "(?:(?:the|these|those|all|our)\\s+)?";
const README_TASKS_HEAD_ADJECTIVES = "(?:(?:current|local|personal|user-isolated|member-scoped|workspace)\\s+)*";
const README_TASKS_CLAUSE_SUBJECT = `${README_TASKS_HEAD_ARTICLE}${README_TASKS_HEAD_ADJECTIVES}tasks(?: and (?:the )?task UI)?`;
const README_TASK_UI_SUBJECT = "(?:the )?task UI";
const README_CURRENT_MAIN_RELEASE_ACCEPTANCE_SUBJECT = "current-main (?:production )?release and (?:(?:signed )?browser )?acceptance";
const README_CURRENT_MAIN_RELEASE_SUBJECT = "current-main (?:production )?release";
const README_CURRENT_MAIN_ACCEPTANCE_SUBJECT = "current-main (?:(?:signed )?browser )?acceptance";
const README_AGGREGATE_SUBJECTS = new Set([
  "boards",
  "notifications",
  "messages",
  "user-isolated tasks",
  "tasks",
  "the task ui",
  "task ui",
  "current-main production release",
  "current-main release",
  "signed browser acceptance",
  "browser acceptance",
  "acceptance",
]);

const STATUS_VALUES = new Set(["done", "partial", "pending", "n/a"]);
const REQUIRED_COLUMNS = [
  "ID", "功能", "优先级", "实现", "验证", "发布", "验收", "依赖", "证据", "备注",
];
const PLACEHOLDER_VALUES = new Set(["", "-", "—", "n/a", "tbd", "todo", "待补", "待补充"]);
const ROADMAP_STAGE_CONTRACTS = [
  { id: "R0", title: "状态收口、身份与工作台基础", status: "active" },
  { id: "R1", title: "AI 知识库核心与受控摄取", status: "planned" },
  { id: "R2", title: "任务、通知、看板与上下文消息", status: "active" },
  { id: "R3", title: "治理、版本、回收与审计", status: "planned" },
  { id: "R4", title: "成熟检索、阅读器与评测", status: "planned" },
  { id: "R5", title: "来源工作台、研究产物与有界 Agent", status: "planned" },
  { id: "R6", title: "导出、恢复、容量保护与 1.0", status: "planned" },
];
const ROADMAP_STAGE_IDS = ROADMAP_STAGE_CONTRACTS.map((stage) => stage.id);
const LEGACY_ROADMAP_IDS = new Set(["GATE-M0", "GATE-M1", "WS-001", "WS-008"]);
const EXPLICITLY_DEFERRED_ROADMAP_IDS = new Set(["IDN-002"]);
const COLLABORATION_ROUTE_CONTRACTS = [
  { path: "/tasks", ledgerId: "TSK-001" },
  { path: "/boards", ledgerId: "BRD-001" },
  { path: "/notifications", ledgerId: "NTF-001" },
  { path: "/messages", ledgerId: "MSG-001" },
];
const COLLABORATION_LOCAL_DONE_IDS = [
  "TSK-001", "TSK-002", "TSK-003", "TSK-004", "TSK-005", "TSK-006", "TSK-007", "TSK-008",
  "BRD-001", "BRD-002", "BRD-003", "BRD-004", "BRD-005", "BRD-006",
  "NTF-001", "NTF-002", "NTF-003", "NTF-004",
  "MSG-001", "MSG-002", "MSG-003", "MSG-004",
];
const COLLABORATION_PARTIAL_POLICY_IDS = ["NTF-005", "MSG-005"];
const COLLABORATION_RELEASE_NOT_DONE_IDS = [
  ...COLLABORATION_LOCAL_DONE_IDS,
  ...COLLABORATION_PARTIAL_POLICY_IDS,
  "TSK-009", "TSK-010", "BRD-007", "NTF-006", "MSG-006",
];
const ROADMAP_MATURITY_DIMENSIONS = [
  ["implementation", "实现"],
  ["verification", "验证"],
  ["release", "发布"],
  ["acceptance", "验收"],
];
const STAGE_EXIT_CONCEPTS = new Map([
  ["R3", [/批量治理/u, /Revision diff\/rollback/u, /回收站.*最终清理/u]],
  ["R4", [/过滤.*来源定位/u, /相关知识.*反向链接/u, /混合检索.*量化评测/u]],
  ["R6", [/导出.*恢复/u, /R2\/D1.*容量保护/u, /完整生产验收.*1\.0/u]],
]);
const KNOWLEDGE_SECTION_CONTRACTS = [
  { section: "SRC", ids: ["KB-001", "KB-002", "KB-003", "ADM-004"] },
  { section: "ING", ids: ["KB-003", "ADM-003", "ADM-004", "OPS-009", "OPS-010"] },
  { section: "PAR", ids: ["KB-003", "ADM-004"] },
  { section: "CHK", ids: ["KB-003", "KB-006", "RET-001"] },
  { section: "GOV", ids: ["KB-004", "KB-011", "KB-012", "ADM-002", "ADM-003", "GOV-001"] },
  { section: "IDX", ids: ["KB-003", "KB-007", "RET-003", "EVAL-001", "OPS-009", "OPS-010"] },
  { section: "SRCH", ids: ["KB-005", "KB-006", "KB-007", "KB-010", "RET-001", "RET-002", "RET-003", "EVAL-001"] },
  { section: "READ", ids: ["KB-005", "KB-006", "KB-010", "KB-011", "KB-012", "RET-001", "RET-002"] },
  { section: "CHAT", ids: ["KB-007", "KB-008", "EVAL-001"] },
  { section: "RES", ids: ["KB-009", "EVAL-001", "OPS-009"] },
  { section: "ART", ids: ["KB-009", "KB-010"] },
  { section: "AGT", ids: ["IDN-005", "KB-009", "OPS-009"] },
  {
    section: "COL",
    ids: [
      "IDN-005", "KB-002", "KB-009", "KB-010", "WB-001", "WB-A11Y",
      "TSK-001", "TSK-002", "TSK-003", "TSK-004", "TSK-005", "TSK-006", "TSK-007", "TSK-008",
      "NTF-001", "NTF-002", "NTF-003", "NTF-004", "NTF-005",
      "BRD-001", "BRD-002", "BRD-003", "BRD-004", "BRD-005", "BRD-006",
      "MSG-001", "MSG-002", "MSG-003", "MSG-004", "MSG-005",
      "ADM-002", "ADM-009", "ADM-010",
    ],
  },
  { section: "AUTH", ids: ["IDN-001", "IDN-002", "IDN-003", "IDN-004", "IDN-005", "IDN-006"] },
  { section: "I18N", ids: ["WB-A11Y", "ADM-011"] },
  { section: "EVAL", ids: ["EVAL-001", "OPS-005", "OPS-011"] },
  {
    section: "WORKSPACE",
    ids: [
      "WB-001", "WB-002", "WB-PAGE", "WB-SCROLL", "WB-SETTINGS", "WB-A11Y",
      "ADM-005", "ADM-006", "ADM-007", "ADM-008", "ADM-009", "ADM-010",
      "WS-001", "WS-008",
    ],
  },
  {
    section: "OPS",
    ids: [
      "ADM-004", "OPS-001", "OPS-002", "OPS-003", "OPS-004", "OPS-005", "OPS-006",
      "OPS-007", "OPS-008", "OPS-009", "OPS-010", "OPS-011",
    ],
  },
];
const KNOWLEDGE_PENDING_ATOMS = [
  "ING-003", "ING-007", "ING-008",
  "IDX-007", "IDX-008", "IDX-009", "IDX-010", "IDX-011", "IDX-012", "IDX-013",
  "SRCH-012", "SRCH-013", "SRCH-014",
  "AUTH-019", "EVAL-018",
  "OPS-008", "OPS-009", "OPS-010", "OPS-012", "OPS-013",
];
const FRONTEND_COLLABORATION_ATOM_CONTRACTS = [
  { id: "FE-NTF-001", checked: true, dependencies: ["NTF-001", "NTF-002", "NTF-003"] },
  { id: "FE-NTF-002", checked: true, dependencies: ["NTF-002", "NTF-003", "NTF-005"] },
  { id: "FE-BRD-001", checked: true, dependencies: ["TSK-001", "BRD-001", "BRD-003", "BRD-004"] },
  { id: "FE-BRD-002", checked: true, dependencies: ["BRD-002", "BRD-004", "BRD-006"] },
  { id: "FE-MSG-001", checked: true, dependencies: ["MSG-001", "MSG-002", "MSG-005"] },
  { id: "FE-MSG-002", checked: true, dependencies: ["MSG-003"] },
  { id: "FE-ACC-001", checked: false, dependencies: ["TSK-010", "NTF-006", "BRD-007", "MSG-006", "ADM-011"] },
];
const FRONTEND_PENDING_ROUTE_CONTRACTS = [
  { path: "/notifications", ledgerId: "NTF-001" },
  { path: "/boards", ledgerId: "BRD-001" },
  { path: "/messages", ledgerId: "MSG-001" },
];
const FRONTEND_PENDING_DOMAIN_CONTRACTS = [
  { name: "notification backend", ledgerPrefix: "NTF-", claim: "(?:通知(?:后端|服务端)|notifications?\\s+backend)" },
  { name: "board backend", ledgerPrefix: "BRD-", claim: "(?:看板(?:后端|服务端)|boards?\\s+backend)" },
  { name: "message backend", ledgerPrefix: "MSG-", claim: "(?:消息(?:后端|服务端)|messages?\\s+backend)" },
];
const FRONTEND_LEDGER_DIMENSION_CLAIMS = [
  {
    column: "实现",
    name: "implementation",
    englishQualifiers: ["implementation"],
    chineseQualifiers: ["实现"],
    claim: "(?:\\bimplemented\\b|\\bready\\b|\\bimplementation\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done|ready)\\b|已实现(?:完成)?|实现(?:完成|就绪)|(?<!不)可用)",
  },
  {
    column: "验证",
    name: "verification",
    englishQualifiers: ["verification"],
    chineseQualifiers: ["验证"],
    claim: "(?:\\bverified\\b|\\btested\\b|\\bverification\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done|passed)\\b|\\btests?\\s+passed\\b|已验证|验证(?:完成|通过)|已测试|测试(?:完成|通过))",
  },
  {
    column: "发布",
    name: "release",
    englishQualifiers: ["release", "deployment", "migration"],
    chineseQualifiers: ["发布", "部署", "迁移"],
    claim: "(?:\\breleased\\b|\\bdeployed\\b|\\bmigrated\\b|\\brelease\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done)\\b|\\bdeployment\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done)\\b|\\bmigration\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done)\\b|已发布|发布完成|已部署|部署完成|已迁移|迁移完成)",
  },
  {
    column: "验收",
    name: "acceptance",
    englishQualifiers: ["browser acceptance", "acceptance"],
    chineseQualifiers: ["浏览器验收", "验收"],
    claim: "(?:\\bbrowser[- ]accepted\\b|\\baccepted\\b|\\bacceptance\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done|passed)\\b|\\bbrowser acceptance\\s+(?:(?:is|was)\\s+)?(?:complete|completed|done|passed)\\b|已验收|验收完成|浏览器验收(?:完成|通过))",
  },
];
const FRONTEND_OVERALL_COMPLETION_CLAIM = {
  name: "overall completion",
  claim: "(?:\\bdone\\b|\\bcompleted\\b|\\bcomplete\\b|已完成|完成)",
};
const FRONTEND_PREDICATE_BOUNDARY = "(?:[\\r\\n.!?。！？；;，,]|\\b(?:and|or|but|however|yet|while)\\b|(?:但是|然而|同时|且|和|或|但|而))";
const HISTORICAL_GATE_COLUMNS = ["历史 Gate", "当前结论", "新阶段", "历史证据（非权威）", "当前状态权威"];
const HISTORICAL_GATE_AUTHORITY = "当前状态仅以[交付状态总账](./delivery-status-ledger.md)为准";
const HISTORICAL_GATE_CONTRACTS = [
  {
    id: "GATE-M0",
    conclusion: "旧候选的 OAuth、automation、disabled contributor 与 DO 生命周期证据已归档；current main 的身份、版本和回滚点仍需复核",
    stage: "R0",
    evidence: "`docs/operations/evidence/m1-release-2026-08-23.md`（候选级 M0 证据）",
  },
  {
    id: "GATE-M1",
    conclusion: "本地与既有生产证据已存在，当前 main 发布状态需 R0 复核",
    stage: "R0/R1",
    evidence: "`docs/operations/evidence/m1-release-2026-08-23.md`（候选级 M1 证据）",
  },
  {
    id: "GATE-M2",
    conclusion: "文件摄取与 fail-closed 降级已有本地/Workerd 证据；R2、Queue、真实 provider 和生产对象旅程仍待资源与验收",
    stage: "R1/R6",
    evidence: "`package.json`、`docs/operations/m2-asset-ingestion.md`；命令：`rtk npm run test:m2`",
  },
  {
    id: "GATE-M3",
    conclusion: "既有并发发布、恢复与审计回归属于历史本地证据；批量治理、Revision diff/rollback 和回收站仍是当前缺口",
    stage: "R3",
    evidence: "`test/unit/publication-service.test.ts`、`test/unit/library-service.test.ts`、`test/worker/m1-publication.test.ts`、`test/worker/m1-library.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/publication-service.test.ts test/unit/library-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts -t 'publish|rollback|purge|review|recover|history|visibility'`",
  },
  {
    id: "GATE-M4",
    conclusion: "FTS5-only、引用定位与 provider-free 评测已有本地证据；成熟过滤、混合检索和量化评测仍按新原子交付",
    stage: "R4",
    evidence: "`src/evaluation/retrieval-metrics.ts`、`src/evaluation/permission-leaks.ts`、`src/evaluation/citation-metrics.ts`、`test/unit/retrieval-metrics.test.ts`、`test/unit/permission-leaks.test.ts`、`test/unit/citation-metrics.test.ts`、`test/unit/m1-evaluation.test.ts`、`test/worker/m1-library.test.ts`；命令：`rtk npx vitest run test/unit/retrieval-metrics.test.ts test/unit/permission-leaks.test.ts test/unit/citation-metrics.test.ts test/unit/m1-evaluation.test.ts test/worker/m1-library.test.ts`",
  },
  {
    id: "GATE-M5",
    conclusion: "Sources、Notes、引用与研究产物已有本地/Workerd 证据；真实 provider 和生产角色旅程未由旧 gate 证明",
    stage: "R4/R5",
    evidence: "`src/ai/answer-service.ts`、`src/research/repository.ts`、`src/private-notes`、`test/unit/citation-metrics.test.ts`、`test/unit/m1-evaluation.test.ts`、`test/unit/research-report-service.test.ts`、`test/worker/m1-library.test.ts`、`test/worker/m1-api.test.ts`；命令：`rtk npx vitest run test/unit/citation-metrics.test.ts test/unit/m1-evaluation.test.ts test/unit/research-report-service.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts -t 'citation|sources|context|notes|research|report'`",
  },
  {
    id: "GATE-M6",
    conclusion: "有界 Agent、暂停恢复和额度降级已有本地/Workerd 证据；生产 AI、DO 激活和验收仍待执行",
    stage: "R5",
    evidence: "`src/ai/research-report-service.ts`、`src/research/repository.ts`、`src/agent/session-do.ts`、`src/agent/tool-runner.ts`、`src/agent/tools.ts`、`test/worker/m1-api.test.ts`、`test/worker/agent-session.test.ts`、`test/unit/m6-agent-trajectory.test.ts`、`test/unit/m6-ai-degraded.test.ts`；命令：`rtk npm run typecheck && rtk npm run test:unit && rtk npm run test:worker`",
  },
  {
    id: "GATE-M7",
    conclusion: "导出包、dry-run、恢复计划和索引重建已有本地证据；远程恢复、对象读取和新环境演练仍待执行",
    stage: "R6",
    evidence: "`src/ops/export-package.ts`、`src/ops/import-dry-run.ts`、`src/ops/restore-plan.ts`、`src/ops/index-rebuild-plan.ts`、`src/ops/restore-drill.ts`；命令：`rtk npx vitest run test/unit/export-package.test.ts test/unit/import-dry-run.test.ts test/unit/restore-plan.test.ts test/unit/index-rebuild-plan.test.ts test/unit/restore-drill.test.ts`",
  },
  {
    id: "GATE-M8",
    conclusion: "旧 1.0 汇总条件不再作为完成信号；current-main gate、真实角色、可访问性、恢复、容量与质量证据均须由总账收口",
    stage: "R0/R6",
    evidence: "无；旧 1.0 条件未满足",
  },
];

test("ledger table parsing preserves escaped and code-span pipes", () => {
  assert.deepEqual(
    splitTableRow("| IDN-001 | `src/routes/a|b.ts` | escaped \\| evidence |"),
    ["IDN-001", "`src/routes/a|b.ts`", "escaped \\| evidence"],
  );
});

test("workspace route registry extraction is complete despite property ordering", () => {
  const fixtureDirectory = mkdtempSync(resolve(tmpdir(), "delivery-status-contract-"));
  const fixturePath = resolve(fixtureDirectory, "workspace-route-capabilities.ts");
  writeFileSync(fixturePath, `
    export const WORKSPACE_ROUTE_CAPABILITIES = Object.freeze([
      { availability: "ready", path: "/first", id: "first", pageKind: "home", capability: null },
      { id: "second", pageKind: "coming-soon", path: "/second", availability: "coming_soon", capability: null },
    ]);
  `);
  try {
    assert.deepEqual(
      workspaceRouteCapabilities(fixturePath),
      [
        { path: "/first", availability: "ready" },
        { path: "/second", availability: "coming_soon" },
      ],
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("actual workspace route registry extraction includes every ready and coming-soon route", () => {
  assert.deepEqual(
    workspaceRouteCapabilities(),
    [
      { path: "/", availability: "ready" },
      { path: "/submit", availability: "ready" },
      { path: "/knowledge", availability: "ready" },
      { path: "/search", availability: "ready" },
      { path: "/agent", availability: "ready" },
      { path: "/my-submissions", availability: "ready" },
      { path: "/tasks", availability: "ready" },
      { path: "/boards", availability: "ready" },
      { path: "/settings", availability: "ready" },
      { path: "/admin", availability: "ready" },
      { path: "/admin/submissions", availability: "ready" },
      { path: "/admin/duplicates", availability: "ready" },
      { path: "/admin/assets", availability: "ready" },
      { path: "/admin/members", availability: "ready" },
      { path: "/admin/roles", availability: "ready" },
      { path: "/admin/menus", availability: "ready" },
      { path: "/admin/spaces", availability: "ready" },
      { path: "/admin/audit", availability: "ready" },
      { path: "/admin/analytics", availability: "ready" },
      { path: "/notifications", availability: "ready" },
      { path: "/messages", availability: "ready" },
    ],
  );
});

test("route coverage uses exact structured route markers", () => {
  const tokens = routeTokens({ 证据: "src/app.ts", 备注: "shared route: `/admin/assets`" });

  assert.deepEqual(tokens, new Set(["/admin/assets"]));
  assert.equal(tokens.has("/admin"), false);
  assert.equal(tokens.has("/"), false);
});

test("completed dimensions require evidence and n/a dimensions require a reason", () => {
  const emptyEvidence = { ID: "IDN-001", 实现: "done", 验证: "pending", 发布: "pending", 验收: "pending", 证据: "", 备注: "" };
  assert.throws(() => assertRowContract(emptyEvidence), /IDN-001 requires evidence/u);

  const missingNaReason = { ID: "IDN-002", 实现: "n/a", 验证: "pending", 发布: "pending", 验收: "pending", 证据: "-", 备注: "-" };
  assert.throws(() => assertRowContract(missingNaReason), /IDN-002 requires a reason for n\/a/u);
});

test("partial or done release requires a scoped dated evidence marker", () => {
  const expectedError = /OPS-001 requires .*dated release evidence/u;
  const missingMarker = {
    ID: "OPS-001", 实现: "done", 验证: "done", 发布: "partial", 验收: "pending",
    证据: "migrations/0032_workspace_tasks.sql", 备注: "",
  };
  assert.throws(() => assertRowContract(missingMarker), expectedError);

  const genericDatedPath = {
    ...missingMarker,
    证据: "docs/operations/evidence/workspace-rbac-release-2026-08-28.md",
  };
  assert.throws(() => assertRowContract(genericDatedPath), expectedError);

  const legacyPathOnlyMarker = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md`",
  };
  assert.throws(() => assertRowContract(legacyPathOnlyMarker), expectedError);

  const emptyScope = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md` [scope: ]",
  };
  assert.throws(() => assertRowContract(emptyScope), expectedError);

  const placeholderScope = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md` [scope: pending]",
  };
  assert.throws(() => assertRowContract(placeholderScope), expectedError);

  const undatedMarker = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/m1-release-template.md` [scope: migrations 0001 through 0032 applied]",
  };
  assert.throws(() => assertRowContract(undatedMarker), expectedError);

  const scopedDatedMarker = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md` [scope: migrations 0001 through 0032 applied]",
  };
  assert.doesNotThrow(() => assertRowContract(scopedDatedMarker));
});

test("partial or done acceptance requires a scoped dated evidence marker", () => {
  const expectedError = /IDN-001 requires .*dated acceptance evidence/u;
  const missingMarker = {
    ID: "IDN-001", 实现: "done", 验证: "done", 发布: "pending", 验收: "partial",
    证据: "test/unit/github-oauth.test.ts", 备注: "",
  };
  assert.throws(() => assertRowContract(missingMarker), expectedError);

  const legacyPathOnlyMarker = {
    ...missingMarker,
    证据: "acceptance evidence: `docs/operations/evidence/m1-release-2026-08-23.md`",
  };
  assert.throws(() => assertRowContract(legacyPathOnlyMarker), expectedError);

  const scopedDatedMarker = {
    ...missingMarker,
    证据: "acceptance evidence: `docs/operations/evidence/m1-release-2026-08-23.md` [scope: GitHub callback and authenticated session journey]",
  };
  assert.doesNotThrow(() => assertRowContract(scopedDatedMarker));
});

test("ledger dependencies must resolve to another row", () => {
  assert.throws(
    () => assertDependencyGraph([
      { ID: "KB-001", 依赖: "IDN-001" },
      { ID: "IDN-001", 依赖: "MISSING-001" },
    ]),
    /IDN-001 has unknown dependency MISSING-001/u,
  );
});

test("ledger dependencies must be acyclic", () => {
  assert.throws(
    () => assertDependencyGraph([
      { ID: "KB-004", 依赖: "ADM-002" },
      { ID: "ADM-002", 依赖: "KB-004" },
    ]),
    /ledger dependency cycle: KB-004 -> ADM-002 -> KB-004/u,
  );
});

test("delivery status ledger reconciles documentation status claims", () => {
  const { headers, rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  assert.deepEqual(headers, REQUIRED_COLUMNS);
  assert.equal(new Set(rows.map((row) => row.ID)).size, rows.length, "ledger IDs must be unique");
  for (const row of rows) {
    assertRowContract(row);
  }

  const ledgerIds = new Set(rows.map((row) => row.ID));
  assertDependencyGraph(rows);
  for (const route of workspaceRouteCapabilities()) {
    assert.ok(
      rows.some((row) => routeTokens(row).has(route.path)),
      `${route.path} requires ledger coverage`,
    );
  }

  for (const id of roadmapBacktickIds(readFileSync(roadmapPath, "utf8"))) {
    assert.ok(ledgerIds.has(id), `Roadmap ID ${id} requires a ledger row`);
  }
});

test("README, Roadmap, frontend, and maturity checklists keep ledger dimensions separate", () => {
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const documents = [
    ["README", readFileSync(readmePath, "utf8")],
    ["Roadmap", readFileSync(roadmapPath, "utf8")],
    ["frontend checklist", readFileSync(frontendChecklistPath, "utf8")],
    ["maturity checklist", readFileSync(maturityChecklistPath, "utf8")],
  ];

  for (const [name, markdown] of documents) {
    assertLedgerLanguageBoundaries(markdown, rows, name);
    for (const claim of [
      "TSK-009 implementation is complete.",
      "OPS-007 verification is complete.",
      "WB-001 release is complete.",
      "IDN-001 acceptance is complete.",
      "TSK-001 is complete.",
    ]) {
      assert.throws(
        () => assertLedgerLanguageBoundaries(`${markdown}\n${claim}\n`, rows, name),
        new RegExp(`${name} .*must not claim`, "u"),
        `${name} must reject a ledger-conflicting claim: ${claim}`,
      );
    }
    for (const claim of [
      "- [ ] TSK-009 implementation is complete.",
      "- [ ] OPS-007 verification is complete.",
      "- [ ] WB-001 release is complete.",
      "- [ ] IDN-001 acceptance is complete.",
    ]) {
      assert.throws(
        () => assertLedgerLanguageBoundaries(`${markdown}\n${claim}\n`, rows, name),
        new RegExp(`${name} .*must not claim`, "u"),
        `${name} must reject checkbox-wrapped current completion: ${claim}`,
      );
    }
    assert.doesNotThrow(
      () => assertLedgerLanguageBoundaries(
        `${markdown}\n- [ ] When TSK-009 implementation is complete, run the retention verification.\n`,
        rows,
        name,
      ),
      `${name} must allow an explicitly prospective unchecked criterion`,
    );
    assert.doesNotThrow(
      () => assertLedgerLanguageBoundaries(
        `${markdown}\n- [ ] 当 TSK-009 实现完成后，运行保留验证。\n`,
        rows,
        name,
      ),
      `${name} must allow a Chinese explicitly prospective unchecked criterion`,
    );

    const mixedProspectiveClaims = [
      "When the next audit runs, TSK-009 implementation is complete.",
      "When the next audit runs, OPS-007 verification is complete.",
      "When the next audit runs, WB-001 release is complete.",
      "When the next audit runs, IDN-001 acceptance is complete.",
      "When the next audit runs, TSK-001 is complete.",
      "当下一次审计运行后，TSK-009 实现已完成。",
      "当下一次审计运行后，OPS-007 验证已完成。",
      "当下一次审计运行后，WB-001 发布已完成。",
      "当下一次审计运行后，IDN-001 验收已完成。",
      "当下一次审计运行后，TSK-001 已完成。",
    ];
    for (const claim of mixedProspectiveClaims) {
      assert.throws(
        () => assertLedgerLanguageBoundaries(`${markdown}\n- [ ] ${claim}\n`, rows, name),
        new RegExp(`${name} .*must not claim`, "u"),
        `${name} must reject a current claim after a prospective clause: ${claim}`,
      );
    }

    if (name === "Roadmap") {
      for (const claim of [
        "When TSK-009 implementation is complete, run the retention verification.",
        "当 TSK-009 实现完成后，运行保留验证。",
      ]) {
        assert.doesNotThrow(
          () => assertLedgerLanguageBoundaries(
            `${markdown}\n退出标准：\n\n- [ ] ${claim}（owned: \`TSK-009\`; consumed: -）\n`,
            rows,
            name,
          ),
          `Roadmap must allow a genuinely prospective structured exit: ${claim}`,
        );
      }
      for (const claim of mixedProspectiveClaims) {
        assert.throws(
          () => assertLedgerLanguageBoundaries(
            `${markdown}\n退出标准：\n\n- [ ] ${claim}（owned: \`TSK-009\`; consumed: -）\n`,
            rows,
            name,
          ),
          /Roadmap .*must not claim/u,
          `Roadmap must reject a current claim in a structured prospective exit: ${claim}`,
        );
      }
    }

    const boundedHistory = "Historical candidate 843f43a (2026-08-23): IDN-001 acceptance is complete for that candidate only, not current main.";
    assert.doesNotThrow(
      () => assertLedgerLanguageBoundaries(`${markdown}\n${boundedHistory}\n`, rows, name),
      `${name} must allow strictly bounded historical candidate evidence`,
    );
    for (const claim of [
      "Historical candidate 843f43a: IDN-001 acceptance is complete for that candidate only, not current main.",
      "Historical candidate (2026-08-23): IDN-001 acceptance is complete for that candidate only, not current main.",
      "Historical candidate 843f43a (2026-08-23): IDN-001 acceptance is complete for that candidate only.",
      "Current-main candidate 843f43a (2026-08-23): IDN-001 acceptance is complete.",
    ]) {
      assert.throws(
        () => assertLedgerLanguageBoundaries(`${markdown}\n${claim}\n`, rows, name),
        new RegExp(`${name} .*must not claim`, "u"),
        `${name} must reject ambiguous or current historical wording: ${claim}`,
      );
    }
  }
});

test("collaboration delivery is locally ready while release and acceptance remain pending", () => {
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const rowsById = new Map(rows.map((row) => [row.ID, row]));
  const routes = new Map(workspaceRouteCapabilities().map((route) => [route.path, route.availability]));

  for (const { path, ledgerId } of COLLABORATION_ROUTE_CONTRACTS) {
    assert.equal(routes.get(path), "ready", `${path} must be a ready executable route`);
    assert.equal(rowsById.get(ledgerId)?.实现, "done", `${ledgerId} must record local implementation`);
    assert.equal(rowsById.get(ledgerId)?.验证, "done", `${ledgerId} must record local verification`);
  }

  for (const id of COLLABORATION_LOCAL_DONE_IDS) {
    const row = rowsById.get(id);
    assert.ok(row, `${id} collaboration ledger row is required`);
    assert.equal(row.实现, "done", `${id} local implementation must be done`);
    assert.equal(row.验证, "done", `${id} local verification must be done`);
  }
  for (const id of COLLABORATION_PARTIAL_POLICY_IDS) {
    const row = rowsById.get(id);
    assert.ok(row, `${id} collaboration policy row is required`);
    assert.equal(row.实现, "partial", `${id} must preserve its unimplemented retention/deletion policy gap`);
    assert.equal(row.验证, "done", `${id} implemented subset must be locally verified`);
  }
  for (const id of COLLABORATION_RELEASE_NOT_DONE_IDS) {
    const row = rowsById.get(id);
    assert.ok(row, `${id} collaboration ledger row is required`);
    assert.notEqual(row.发布, "done", `${id} must not claim current-main integration or production release complete`);
    assert.equal(row.验收, "pending", `${id} must not claim signed browser acceptance`);
  }

  const evidence = readFileSync(collaborationEvidencePath, "utf8");
  assertCollaborationMigrationEvidence(evidence, reviewedMigrationManifest());
  assertCollaborationEvidenceBoundary(evidence);
});

test("README derives bounded workbench claims from the delivery ledger", () => {
  const readme = readFileSync(readmePath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  assertReadmeContract(readme, rows);

  for (const { name, appended, expectedError } of [
    {
      name: "fully completed task UI",
      appended: "\nUser-isolated tasks and the task UI are fully complete.\n",
      expectedError: /tasks must not claim overall completion while task implementation or acceptance gaps remain/u,
    },
    {
      name: "completed messages",
      appended: "\nMessages are fully completed.\n",
      expectedError: /messages must not claim overall completion while MSG implementation gaps remain/u,
    },
    {
      name: "completed current-main production acceptance",
      appended: "\nCurrent-main production release and signed browser acceptance are complete.\n",
      expectedError: /README must not claim current-main production release or browser acceptance complete/u,
    },
    {
      name: "completed current-main release",
      appended: "\nCurrent-main production release is complete.\n",
      expectedError: /README must not claim current-main production release complete/u,
    },
    {
      name: "completed current-main browser acceptance",
      appended: "\nCurrent-main signed browser acceptance is complete.\n",
      expectedError: /README must not claim current-main browser acceptance complete/u,
    },
    {
      name: "current overall atom-count completion",
      appended: "\nThe 23 product atoms are all complete as the current overall product status.\n",
      expectedError: /README must not present an atom count as current overall completion/u,
    },
  ]) {
    assert.throws(
      () => assertReadmeContract(`${readme}${appended}`, rows),
      expectedError,
      `${name} must be rejected even when the canonical README paragraphs remain present`,
    );
  }

  for (const { name, appended, expectedError } of [
    {
      name: "perfect-tense task completion",
      appended: "\nUser-isolated tasks and the task UI have been fully completed.\n",
      expectedError: /tasks must not claim overall completion while task implementation or acceptance gaps remain/u,
    },
    {
      name: "perfect-tense board completion",
      appended: "\nBoards have been completed already.\n",
      expectedError: /boards must not claim overall completion while BRD implementation gaps remain/u,
    },
    {
      name: "production-ready messages",
      appended: "\nMessages are production-ready.\n",
      expectedError: /messages must not claim production readiness while MSG release gaps remain/u,
    },
    {
      name: "perfect-tense current-main release",
      appended: "\nCurrent-main production release has been fully completed.\n",
      expectedError: /README must not claim current-main production release complete/u,
    },
    {
      name: "already completed current-main browser acceptance",
      appended: "\nCurrent-main signed browser acceptance has already been completed.\n",
      expectedError: /README must not claim current-main browser acceptance complete/u,
    },
    {
      name: "ready-for-production current main",
      appended: "\nCurrent-main is ready-for-production.\n",
      expectedError: /README must not claim current-main production readiness complete/u,
    },
  ]) {
    assert.throws(
      () => assertReadmeContract(`${readme}${appended}`, rows),
      expectedError,
      `${name} must be rejected as a ledger-conflicting positive claim`,
    );
  }

  for (const { name, appended } of [
    { name: "implemented collaboration surfaces", appended: "\nBoards, notifications, and messages are implemented and available locally.\n" },
    { name: "ready notifications", appended: "\nNotifications are ready locally.\n" },
    { name: "current notification implementation", appended: "\nNotifications are now implemented.\n" },
  ]) {
    assert.doesNotThrow(
      () => assertReadmeContract(`${readme}${appended}`, rows),
      `${name} must be allowed after its core ledger implementation is done`,
    );
  }

  const pendingBoardRows = rows.map((row) => row.ID === "BRD-001" ? { ...row, 实现: "pending" } : row);
  for (const { name, appended } of [
    { name: "negative perfect tense", appended: "\nUser-isolated tasks and the task UI have not been completed.\n" },
    { name: "negative production readiness", appended: "\nMessages are not production-ready.\n" },
    { name: "negative pending readiness", appended: "\nNotifications are not yet ready.\n" },
    {
      name: "mixed-subject readiness",
      appended: "\nBoards are not ready, and the knowledge base is ready for local use.\n",
    },
  ]) {
    assert.doesNotThrow(
      () => assertReadmeContract(`${readme}${appended}`, rows),
      `${name} must not be misclassified as a positive delivery claim`,
    );
  }

  for (const { name, appended } of [
    { name: "repeated explicit board subject", appended: "\nBoards are not ready, and Boards are ready.\n" },
    { name: "same-subject coordinated predicate", appended: "\nBoards are not ready, and are ready.\n" },
    { name: "aggregate collaboration subject list", appended: "\nBoards, notifications, and messages are ready.\n" },
  ]) {
    assert.throws(
      () => assertReadmeContract(`${readme}${appended}`, pendingBoardRows),
      /boards must not claim local readiness while BRD-001 implementation is pending/u,
      `${name} must remain a positive boards readiness claim`,
    );
  }
});

test("README rejects aggregate current-main release and acceptance completion", () => {
  const readme = readFileSync(readmePath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  assert.throws(
    () => assertReadmeContract(`${readme}\nCurrent-main release and acceptance are complete.\n`, rows),
    /README must not claim current-main production release or browser acceptance complete/u,
    "recognized aggregate current-main release and acceptance must remain ledger-bounded",
  );
  for (const contrast of [
    "Current-main release and acceptance are not complete.",
    "Current-main release and acceptance remain pending.",
  ]) {
    assert.doesNotThrow(
      () => assertReadmeContract(`${readme}\n${contrast}\n`, rows),
      `negative or pending aggregate current-main status must remain allowed: ${contrast}`,
    );
  }
});

test("README rejects bare plural task completion", () => {
  const readme = readFileSync(readmePath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  for (const mutation of [
    "Tasks are complete.",
    "- Tasks are complete.",
    "## Tasks are complete.",
    "> Tasks are complete.",
    "> - The current tasks have been completed.",
  ]) {
    assert.throws(
      () => assertReadmeContract(`${readme}\n${mutation}\n`, rows),
      /tasks must not claim overall completion while task implementation or acceptance gaps remain/u,
      `bare plural Tasks clause subject must remain bounded by the task ledger rows: ${mutation}`,
    );
  }
  for (const contrast of [
    "Tasks are not complete.",
    "Tasks remain pending.",
  ]) {
    assert.doesNotThrow(
      () => assertReadmeContract(`${readme}\n${contrast}\n`, rows),
      `negative or pending bare plural task status must remain allowed: ${contrast}`,
    );
  }
});

test("README does not treat prepositional tasks as a clause subject", () => {
  const readme = readFileSync(readmePath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  for (const control of [
    "Documentation for tasks is complete.",
    "The migration for tasks has been completed.",
  ]) {
    assert.doesNotThrow(
      () => assertReadmeContract(`${readme}\n${control}\n`, rows),
      `object or prepositional tasks must not be treated as the claim subject: ${control}`,
    );
  }
});

function assertReadmeContract(readme, rows) {
  const maturity = readmeSection(readme, "Current maturity");
  const product = readmeSection(readme, "Product and architecture");
  const api = readmeSection(readme, "API boundary");

  for (const link of README_REQUIRED_LINKS) {
    assert.match(readme, new RegExp(`\\]\\(\\./${escapeRegExp(link)}\\)`, "u"), `README requires ./${link}`);
    assert.ok(existsSync(resolve(repositoryRoot, link)), `README target ./${link} must exist`);
  }

  assert.match(readme, /personal workbench.*AI knowledge base.*first major module/ui);
  assert.match(maturity, /^- The member-isolated Tasks core, task-backed Boards, recipient-owned Notifications, and task\/knowledge-context Messages are implemented and locally verified on this branch\./mu);
  assert.match(maturity, /^- Shared numbered pagination is fully localized in English and Simplified Chinese\./mu);
  assert.match(maturity, /^- These collaboration routes are locally `ready`; that means an executable API\/UI vertical exists, not that it has been merged to `main`, pushed, deployed, remotely migrated, production-smoked, or accepted in a signed browser\.$/mu);
  assert.match(maturity, /^- \*\*Current-main release and acceptance are determined only by the \[delivery status ledger\]\(\.\/docs\/product\/delivery-status-ledger\.md\)\.\*\*/mu);
  assert.match(product, /GitHub OAuth provides a primary, verified identity; `ALLOWED_MEMBER_EMAILS` authorizes login before any D1 member lookup\. D1 then governs the member record, hashed session, role, active\/disabled status, and capability\./u);
  assert.match(api, /^- Tasks: `\/api\/tasks\*` for active members with `tasks:use`; member isolation, idempotent writes, and numbered pagination\.$/mu);
  assert.match(api, /^- Notifications: `\/api\/notifications\*` for the authenticated recipient only;/mu);
  assert.match(api, /^- Contextual messages: `\/api\/discussions\*` for currently authorized task or knowledge contexts;/mu);
  assert.match(product, /Collaboration correctness requires only Workers, D1, and static assets;/u);
  assert.match(readmeSection(readme, "Free-tier boundary and degradation"), /R2.*Vectorize.*Queue.*Workers AI.*optional.*degrade.*do not block.*free text core/ui);

  assert.doesNotMatch(readme, /\bM\d+\b/u, "README must not duplicate milestone prose or counts");
  assert.doesNotMatch(readme, /(?:M1 的 23|76 P0\/M1|M1 实现完成|远程验证待完成)/u);
  assert.doesNotMatch(readme, /D1\s+(?:decides|controls|governs)\s+allowlist membership/ui, "D1 must not be assigned the pre-login allowlist decision");
  assertNoPositiveReadmeClaim(
    readme,
    "\\d+\\s+(?:product\\s+)?atoms?",
    README_FINAL_CLAIM,
    "README must not present an atom count as current overall completion",
  );

  const taskUi = ledgerRow(rows, "TSK-002");
  const taskRetention = ledgerRow(rows, "TSK-009");
  const taskAcceptance = ledgerRow(rows, "TSK-010");
  if (taskUi.实现 !== "done" || taskRetention.实现 !== "done" || taskAcceptance.验收 !== "done") {
    assertNoPositiveReadmeClaim(
      readme,
      README_TASK_UI_SUBJECT,
      README_FINAL_CLAIM,
      "tasks must not claim overall completion while task implementation or acceptance gaps remain",
    );
    assertNoPositiveReadmeClaim(
      readme,
      README_TASKS_CLAUSE_SUBJECT,
      README_FINAL_CLAIM,
      "tasks must not claim overall completion while task implementation or acceptance gaps remain",
      { clauseSubject: true },
    );
  }

  for (const [name, prefix, coreId] of [
    ["boards", "BRD-", "BRD-001"],
    ["notifications", "NTF-", "NTF-001"],
    ["messages", "MSG-", "MSG-001"],
  ]) {
    const domainRows = rows.filter((row) => row.ID.startsWith(prefix));
    assert.ok(domainRows.length > 0, `${name} ledger domain is required`);
    if (ledgerRow(rows, coreId).实现 !== "done") {
      assertNoPositiveReadmeClaim(
        readme,
        name,
        "(?:ready|implemented|available)",
        `${name} must not claim local readiness while ${coreId} implementation is pending`,
      );
    }
    if (domainRows.some((row) => row.实现 !== "done")) {
      assertNoPositiveReadmeClaim(
        readme,
        name,
        "(?:complete(?:d)?|done)",
        `${name} must not claim overall completion while ${prefix.slice(0, -1)} implementation gaps remain`,
      );
    }
    if (domainRows.some((row) => row.发布 !== "done")) {
      assertNoPositiveReadmeClaim(
        readme,
        name,
        "(?:production-ready|ready-for-production)",
        `${name} must not claim production readiness while ${prefix.slice(0, -1)} release gaps remain`,
      );
    }
  }

  if (rows.some((row) => row.发布 !== "done") || rows.some((row) => row.验收 !== "done")) {
    for (const { subject, message } of [
      {
        subject: README_CURRENT_MAIN_RELEASE_ACCEPTANCE_SUBJECT,
        message: "README must not claim current-main production release or browser acceptance complete",
      },
      {
        subject: README_CURRENT_MAIN_RELEASE_SUBJECT,
        message: "README must not claim current-main production release complete",
      },
      {
        subject: README_CURRENT_MAIN_ACCEPTANCE_SUBJECT,
        message: "README must not claim current-main browser acceptance complete",
      },
      {
        subject: "current-main",
        message: "README must not claim current-main production readiness complete",
      },
    ]) {
      assertNoPositiveReadmeClaim(readme, subject, README_FINAL_CLAIM, message);
    }
  }
}

function assertLedgerLanguageBoundaries(markdown, rows, documentName) {
  const currentClaims = currentStatusClaims(markdown);
  for (const row of rows) {
    const subject = `(?:\`?${escapeRegExp(row.ID)}\`?)`;
    for (const dimension of FRONTEND_LEDGER_DIMENSION_CLAIMS) {
      if (row[dimension.column] === "done") continue;
      assertNoPositiveDimensionClaim(
        currentClaims,
        subject,
        dimension,
        `${documentName} ${row.ID} must not claim ${dimension.name} while ledger ${dimension.column} is ${row[dimension.column]}`,
        64,
        ({ claimIndex }) => isStrictBoundedHistoricalClaim(currentClaims, claimIndex),
      );
    }
    if (isOverallCompletionEligible(row)) continue;
    assertNoPositiveDimensionClaim(
      currentClaims,
      subject,
      FRONTEND_OVERALL_COMPLETION_CLAIM,
      `${documentName} ${row.ID} must not claim overall completion while delivery dimensions remain incomplete`,
      64,
      ({ claimIndex, claim }) =>
        isStrictBoundedHistoricalClaim(currentClaims, claimIndex) ||
        handleDimensionQualifiedCompletion(
          currentClaims,
          claimIndex,
          claim.length,
          [row],
          (dimension) => `${documentName} ${row.ID} must not claim ${dimension.name} while ledger ${dimension.column} is ${row[dimension.column]}`,
        ),
    );
  }
}

function currentStatusClaims(markdown) {
  let prospectiveSection = false;
  return markdown.split(/\r?\n/u).map((line) => {
    const trimmed = line.trim();
    if (/^(?:退出标准|Acceptance criteria)：?$/iu.test(trimmed)) {
      prospectiveSection = true;
      return line;
    }
    if (/^#{1,6}\s/u.test(trimmed)) prospectiveSection = false;
    const unchecked = /^\s*- \[ \] (.+)$/u.exec(line);
    if (!unchecked) return line;
    const structuredRoadmapExit = prospectiveSection && /（owned: .+; consumed: .+）$/u.test(unchecked[1]);
    if (structuredRoadmapExit || isExplicitlyProspectiveCriterion(unchecked[1])) {
      return currentClausesAfterProspectivePredicate(unchecked[1], structuredRoadmapExit);
    }
    return line;
  }).join("\n");
}

function isExplicitlyProspectiveCriterion(value) {
  return /^(?:when|once|before|after|until|if)\b/iu.test(value.trim()) ||
    /^(?:当|待|若|如果|在.+(?:前|后))/u.test(value.trim());
}

function currentClausesAfterProspectivePredicate(value, structuredRoadmapExit) {
  const criterion = structuredRoadmapExit
    ? value.replace(/（owned: .+; consumed: .+）$/u, "").trim()
    : value.trim();
  const boundary = /[,，;；.!?。！？]|\b(?:then|but|however|yet)\b|(?:则|但是|但|然而)/iu.exec(criterion);
  if (!boundary) return "";
  return criterion.slice(boundary.index + boundary[0].length).trim();
}

function isStrictBoundedHistoricalClaim(markdown, claimIndex) {
  const lineStart = markdown.lastIndexOf("\n", claimIndex - 1) + 1;
  const nextLine = markdown.indexOf("\n", claimIndex);
  const lineEnd = nextLine === -1 ? markdown.length : nextLine;
  const line = markdown.slice(lineStart, lineEnd).trim();
  return /^(?:[-*]\s+)?Historical (?:candidate|commit) `?[a-f0-9]{7,40}`? \(20\d{2}-\d{2}-\d{2}\): .+ for that (?:candidate|commit) only, not current[- ]main\.$/iu.test(line) ||
    /^(?:[-*]\s+)?历史(?:候选|提交) `?[a-f0-9]{7,40}`?（20\d{2}-\d{2}-\d{2}）：.+仅(?:该|此)(?:候选|提交)，不代表 current[- ]main。$/u.test(line);
}

function assertNoPositiveReadmeClaim(readme, subject, claim, message, options) {
  assert.ok(!hasPositiveReadmeClaim(readme, subject, claim, options), message);
}

function hasPositiveReadmeClaim(readme, subject, claim = README_POSITIVE_CLAIM, { clauseSubject = false } = {}) {
  const subjectPattern = clauseSubject
    ? `${README_MARKDOWN_CLAUSE_PREFIX}(?:${subject})\\b`
    : `\\b(?:${subject})\\b`;
  const positivePredicate = new RegExp(
    `${subjectPattern}${README_CLAIM_BETWEEN}\\b(?:`
      + `(?:is|are|remain)\\s+${README_CLAIM_MODIFIERS}${claim}(?:\\s+(?:now|already|fully))?`
      + `|(?:has|have)\\s+${README_CLAIM_MODIFIERS}been\\s+${README_CLAIM_MODIFIERS}${claim}(?:\\s+(?:now|already|fully))?`
      + `)\\b`,
    "iu",
  );
  return readmeClaimClauses(readme).some((clause) => positivePredicate.test(clause));
}

function readmeClaimClauses(readme) {
  return readme
    .split(/(?<=[.\n;])/u)
    .flatMap((clause) => splitCoordinatedReadmeClause(clause));
}

function splitCoordinatedReadmeClause(clause) {
  const clauses = [];
  let start = 0;

  for (const match of clause.matchAll(/\band\b/giu)) {
    const before = clause.slice(start, match.index);
    const after = clause.slice(match.index + match[0].length);
    if (startsExplicitSubjectPredicate(after) && !isAggregateSubjectList(before, after)) {
      clauses.push(before);
      start = match.index + match[0].length;
    }
  }

  clauses.push(clause.slice(start));
  return clauses;
}

function startsExplicitSubjectPredicate(text) {
  return explicitSubjectBeforePredicate(text) !== undefined;
}

function isAggregateSubjectList(before, after) {
  const rightSubject = explicitSubjectBeforePredicate(after);
  if (!rightSubject) return false;

  const subjects = [
    ...before.trim().split(",").map((subject) => subject.trim()).filter(Boolean),
    rightSubject,
  ];
  return subjects.every((subject) => README_AGGREGATE_SUBJECTS.has(subject.toLowerCase()));
}

function explicitSubjectBeforePredicate(text) {
  return /^\s*((?:the\s+)?[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,5})\s+(?:is|are|remain|has|have)\b/iu.exec(text)?.[1];
}

function readmeSection(readme, heading) {
  const match = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "mu").exec(readme);
  assert.ok(match, `README requires a ${heading} section`);
  const start = match.index + match[0].length;
  const next = /^## /gmu;
  next.lastIndex = start;
  const end = next.exec(readme)?.index ?? readme.length;
  return readme.slice(start, end);
}

function ledgerRow(rows, id) {
  const row = rows.find((candidate) => candidate.ID === id);
  assert.ok(row, `delivery ledger requires ${id}`);
  return row;
}

test("AI knowledge checklist separates local completion from delivery status", () => {
  const checklist = readFileSync(knowledgeChecklistPath, "utf8");
  assert.match(
    checklist,
    /复选框仅表示“实现 \+ 本地\/Workerd 验证”完成；发布和验收状态以交付状态总账为准。/u,
  );
  assert.match(checklist, /\[交付状态总账\]\(\.\/delivery-status-ledger\.md\)/u);

  for (const { section } of KNOWLEDGE_SECTION_CONTRACTS) {
    const sectionPattern = new RegExp(
      `^## ${section}\\b[^\\n]*\\n\\n当前 R 阶段：[^\\n]+；总账映射：\\[[^\\]]+\\]\\(\\.\\/delivery-status-ledger\\.md\\)$`,
      "mu",
    );
    assert.match(checklist, sectionPattern, `${section} requires an R-stage ledger mapping`);
  }

  const gateStart = checklist.indexOf("## 历史 Gate 映射");
  assert.notEqual(gateStart, -1, "historical gate mapping is required");
  const gateSummary = checklist.slice(gateStart);
  assert.doesNotMatch(gateSummary, /^- \[[ x]\] `GATE-M\d+`/gmu);
  assert.doesNotMatch(gateSummary, /状态：L\/W(?:\/R)?(?:\/D)?/u);
  for (let milestone = 0; milestone <= 8; milestone += 1) {
    assert.match(gateSummary, new RegExp(`^\\| GATE-M${milestone} \\|`, "mu"));
  }

  const uncheckedAtoms = [...checklist.matchAll(/^- \[ \] `([A-Z]+-\d{3})`/gmu)]
    .map((match) => match[1]);
  assert.deepEqual(uncheckedAtoms, KNOWLEDGE_PENDING_ATOMS);
});

test("frontend checklist owns frontend surfaces without claiming backend delivery", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");

  assert.match(
    checklist,
    /本清单只拥有：组件、路由、交互状态、响应式行为、可访问性与前端发布接线。/u,
  );
  assert.match(
    checklist,
    /不拥有后端实现、数据模型、migration、生产发布或 signed browser 验收状态。/u,
  );
  assert.match(
    checklist,
    /复选框仅表示“前端实现 \+ 本地\/UI 合同验证”完成；对应后端与路由是否 ready 必须同时由\[交付状态总账\]\(\.\/delivery-status-ledger\.md\)和共享 route registry 证明。/u,
  );
  assert.match(checklist, /\[交付状态总账\]\(\.\/delivery-status-ledger\.md\)/u);

  for (const id of [
    "WB-001", "WB-002", "WB-PAGE", "TSK-002", "NTF-001", "NTF-003", "BRD-001", "MSG-001", "ADM-010",
  ]) {
    assert.match(checklist, new RegExp(`\\b${id}\\b`, "u"), `frontend checklist requires ${id}`);
  }
});

test("frontend collaboration atoms record local UI completion and resolve backend ledger dependencies", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  assertFrontendCollaborationContract(checklist, rows);

  const missingRevocationDependency = checklist.replace(
    "[MSG-001、MSG-002、MSG-005](./delivery-status-ledger.md)",
    "[MSG-001、MSG-002](./delivery-status-ledger.md)",
  );
  assert.notEqual(missingRevocationDependency, checklist, "MSG-005 dependency fixture must mutate the checklist");
  assert.throws(
    () => assertFrontendCollaborationContract(missingRevocationDependency, rows),
    /frontend collaboration atoms must match canonical dependencies/u,
  );

  const duplicateCheckedAtom = `${checklist}\n- [x] \`FE-NTF-001\` stale checked duplicate\n`;
  assert.throws(
    () => assertFrontendCollaborationContract(duplicateCheckedAtom, rows),
    /FE-NTF-001 must have exactly one checkbox row/u,
  );

  const duplicateUncheckedAtom = `${checklist}\n- [ ] \`FE-BRD-001\` stale unchecked duplicate\n`;
  assert.throws(
    () => assertFrontendCollaborationContract(duplicateUncheckedAtom, rows),
    /FE-BRD-001 must have exactly one checkbox row/u,
  );

  const indentedUppercaseDuplicate = `${checklist}\n  - [X] \`FE-MSG-001\` stale uppercase duplicate\n`;
  assert.throws(
    () => assertFrontendCollaborationContract(indentedUppercaseDuplicate, rows),
    /FE-MSG-001 must have exactly one checkbox row/u,
  );

  const indentedUncheckedDuplicate = `${checklist}\n    - [ ] \`FE-ACC-001\` stale indented duplicate\n`;
  assert.throws(
    () => assertFrontendCollaborationContract(indentedUncheckedDuplicate, rows),
    /FE-ACC-001 must have exactly one checkbox row/u,
  );

  const uncheckedCanonicalAtom = checklist.replace("- [x] `FE-MSG-002`", "- [ ] `FE-MSG-002`");
  assert.notEqual(uncheckedCanonicalAtom, checklist, "unchecked canonical atom fixture must mutate the checklist");
  assert.throws(
    () => assertFrontendCollaborationContract(uncheckedCanonicalAtom, rows),
    /FE-MSG-002 checked state must match local UI evidence/u,
  );

  const acceptanceRow = checklist.match(/^- \[ \] `FE-ACC-001` .+$/mu)?.[0];
  assert.ok(acceptanceRow, "FE-ACC-001 section fixture requires its canonical row");
  const atomOutsideSection = checklist
    .replace(`${acceptanceRow}\n`, "")
    .replace("## 工作台协作前端（R2）", `${acceptanceRow}\n\n## 工作台协作前端（R2）`);
  assert.throws(
    () => assertFrontendCollaborationContract(atomOutsideSection, rows),
    /FE-ACC-001 checkbox row must occur only in ## 工作台协作前端（R2）/u,
  );
});

test("frontend checklist rejects stale pending backend and route completion prose", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  const staleBackendCompletion = `${checklist}\nNTF-006 implementation complete.\n`;
  assert.throws(
    () => assertFrontendCollaborationContract(staleBackendCompletion, rows),
    /NTF-006 must not claim implementation while ledger 实现 is pending/u,
  );

  const readyRoute = `${checklist}\n\`\/notifications\` ready。\n`;
  assert.doesNotThrow(
    () => assertFrontendCollaborationContract(readyRoute, rows),
  );

  const staleDomainCompletion = `${checklist}\n通知后端已实现完成。\n`;
  assert.throws(
    () => assertFrontendCollaborationContract(staleDomainCompletion, rows),
    /notification backend must not claim implementation while ledger 实现 is not done/u,
  );

  for (const claim of ["verified", "tested"]) {
    const staleVerification = `${checklist}\nNTF-006 ${claim}。\n`;
    assert.throws(
      () => assertFrontendCollaborationContract(staleVerification, rows),
      /NTF-006 must not claim verification while ledger 验证 is pending/u,
    );
  }

  for (const claim of ["released", "deployed", "migrated"]) {
    const staleRelease = `${checklist}\nTSK-001 ${claim}。\n`;
    assert.throws(
      () => assertFrontendCollaborationContract(staleRelease, rows),
      /TSK-001 must not claim release while ledger 发布 is pending/u,
    );
  }

  for (const claim of ["accepted", "browser-accepted"]) {
    const staleAcceptance = `${checklist}\nADM-011 ${claim}。\n`;
    assert.throws(
      () => assertFrontendCollaborationContract(staleAcceptance, rows),
      /ADM-011 must not claim acceptance while ledger 验收 is pending/u,
    );
  }

  const explicitlyPendingProse = `${checklist}\nNTF-006 implementation pending; not implemented; not ready.\nNTF-006 verification pending; not verified; not tested.\nTSK-001 release pending; not released; not deployed; not migrated.\nADM-011 acceptance pending; not accepted; not browser-accepted.\n`;
  assert.doesNotThrow(() => assertFrontendCollaborationContract(explicitlyPendingProse, rows));

  for (const claim of ["done", "completed", "complete", "已完成", "完成"]) {
    const staleOverallIdCompletion = `${checklist}\nNTF-001 ${claim}。\n`;
    assert.throws(
      () => assertFrontendCollaborationContract(staleOverallIdCompletion, rows),
      /NTF-001 must not claim overall completion until all applicable ledger dimensions are done/u,
    );
  }

  for (const [subject, claim, expectedError] of [
    ["`/notifications`", "completed", /\/notifications must not claim overall completion until all applicable ledger dimensions are done/u],
    ["`/boards`", "已完成", /\/boards must not claim overall completion until all applicable ledger dimensions are done/u],
    ["notification backend", "complete", /notification backend must not claim overall completion until all applicable ledger dimensions are done/u],
    ["消息后端", "完成", /message backend must not claim overall completion until all applicable ledger dimensions are done/u],
  ]) {
    const staleOverallCompletion = `${checklist}\n${subject} ${claim}。\n`;
    assert.throws(
      () => assertFrontendCollaborationContract(staleOverallCompletion, rows),
      expectedError,
    );
  }

  for (const negativeClaim of [
    "NTF-001 cannot be considered complete.",
    "NTF-001 can't be marked done.",
    "NTF-001 must not be described as completed.",
    "NTF-001 should not be treated as complete.",
    "NTF-001 is not fully complete.",
    "NTF-001 and its route are not yet complete.",
    "NTF-001 not yet complete.",
    "`/notifications` cannot be considered complete.",
    "notification backend is not yet fully complete.",
    "BRD-001 尚未整体完成。",
    "MSG-001 不能被视为已完成。",
    "MSG-001 不能 被 视为 已完成。",
    "NTF-001 不得标记为完成。",
    "BRD-001 不应被描述为已完成。",
    "MSG-001 还未真正完成。",
    "`/boards` 尚未达到完整完成。",
    "消息后端不得标记为已完成。",
  ]) {
    assert.doesNotThrow(
      () => assertFrontendCollaborationContract(`${checklist}\n${negativeClaim}\n`, rows),
      `negative completion prose must remain allowed: ${negativeClaim}`,
    );
  }

  const qualifiedCompletionCases = [
    {
      column: "实现",
      name: "implementation",
      claims: [
        "implementation complete", "complete implementation", "implementation is complete",
        "实现完成", "完成实现", "实现已完成", "已完成实现",
      ],
    },
    {
      column: "验证",
      name: "verification",
      claims: [
        "verification complete", "complete verification", "verification is complete",
        "验证完成", "完成验证", "验证已完成", "已完成验证",
      ],
    },
    {
      column: "发布",
      name: "release",
      claims: [
        "release complete", "complete release", "release is complete",
        "发布完成", "完成发布", "发布已完成", "已完成发布",
      ],
    },
    {
      column: "验收",
      name: "acceptance",
      claims: [
        "acceptance complete", "complete acceptance", "acceptance is complete",
        "验收完成", "完成验收", "验收已完成", "已完成验收",
      ],
    },
  ];
  for (const dimension of qualifiedCompletionCases) {
    const namedDimensionPendingRows = rows.map((row) => row.ID === "NTF-001"
      ? { ...row, [dimension.column]: "pending" }
      : row);
    const namedDimensionDoneRows = namedDimensionPendingRows.map((row) => row.ID === "NTF-001"
      ? { ...row, [dimension.column]: "done" }
      : row);
    for (const claim of dimension.claims) {
      const mutation = `${checklist}\nNTF-001 ${claim}.\n`;
      assert.doesNotThrow(
        () => assertFrontendCollaborationContract(mutation, namedDimensionDoneRows),
        `qualified ${dimension.name} completion must not require aggregate completion: ${claim}`,
      );
      assert.throws(
        () => assertFrontendCollaborationContract(mutation, namedDimensionPendingRows),
        new RegExp(`NTF-001 must not claim ${dimension.name} while ledger ${dimension.column} is pending`, "u"),
        `qualified ${dimension.name} completion must be checked against that dimension: ${claim}`,
      );
    }
  }

  for (const contradictoryClaim of [
    "NTF-001 cannot be considered pending but NTF-001 is now complete.",
    "NTF-001 尚未发布但 NTF-001 现已完成。",
  ]) {
    assert.throws(
      () => assertFrontendCollaborationContract(`${checklist}\n${contradictoryClaim}\n`, rows),
      /NTF-001 must not claim overall completion until all applicable ledger dimensions are done/u,
    );
  }

  const allDoneRows = rows.map((row) => row.ID === "NTF-001"
    ? { ...row, 实现: "done", 验证: "done", 发布: "done", 验收: "done" }
    : row);
  assert.doesNotThrow(
    () => assertFrontendCollaborationContract(`${checklist}\nNTF-001 complete.\n`, allDoneRows),
    "overall completion is allowed when all four ledger dimensions are done",
  );

  const partialRows = allDoneRows.map((row) => row.ID === "NTF-001"
    ? { ...row, 发布: "partial" }
    : row);
  assert.throws(
    () => assertFrontendCollaborationContract(`${checklist}\nNTF-001 complete.\n`, partialRows),
    /NTF-001 must not claim overall completion until all applicable ledger dimensions are done/u,
  );

  const documentedNaRows = rows.map((row) => row.ID === "NTF-001"
    ? {
        ...row,
        实现: "done",
        验证: "done",
        发布: "n/a",
        验收: "n/a",
        备注: "发布与验收对该测试原子客观不适用。",
      }
    : row);
  assert.doesNotThrow(
    () => assertFrontendCollaborationContract(`${checklist}\nNTF-001 complete.\n`, documentedNaRows),
    "documented n/a dimensions count as inapplicable for overall completion",
  );

  const undocumentedNaRows = documentedNaRows.map((row) => row.ID === "NTF-001"
    ? { ...row, 备注: "-" }
    : row);
  assert.throws(
    () => assertFrontendCollaborationContract(`${checklist}\nNTF-001 complete.\n`, undocumentedNaRows),
    /NTF-001 must not claim overall completion until all applicable ledger dimensions are done/u,
  );
});

test("frontend completion negation is limited to the predicate it directly modifies", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  for (const directlyNegatedClaim of [
    "NTF-001 is partial and NTF-001 is not complete.",
    "NTF-001 can regress and NTF-001 cannot be considered complete.",
    "NTF-001 可以回归且 NTF-001 尚未完成。",
  ]) {
    assert.doesNotThrow(
      () => assertFrontendCollaborationContract(`${checklist}\n${directlyNegatedClaim}\n`, rows),
      `direct negation must apply after a conjunction: ${directlyNegatedClaim}`,
    );
  }

  for (const positiveCompletion of [
    "NTF-001 is not partial and NTF-001 is complete.",
    "NTF-001 cannot regress and NTF-001 remains complete.",
    "NTF-001 is not partial. NTF-001 remains complete.",
    "NTF-001 不能回归且 NTF-001 保持完成。",
  ]) {
    assert.throws(
      () => assertFrontendCollaborationContract(`${checklist}\n${positiveCompletion}\n`, rows),
      /NTF-001 must not claim overall completion until all applicable ledger dimensions are done/u,
      `conjunction or sentence boundary must end negation scope: ${positiveCompletion}`,
    );
  }
});

test("frontend forward subject association stops before another subject predicate", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const separatePredicates = `${checklist}\nNTF-001 remains pending and TSK-001 implementation complete.\n`;

  assert.doesNotThrow(
    () => assertFrontendCollaborationContract(separatePredicates, rows),
    "TSK-001 implementation completion must not be attributed forward to NTF-001",
  );
});

test("frontend reverse subject association stops before another subject predicate", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const separatePredicates = `${checklist}\nTSK-001 implementation complete and NTF-001 remains pending.\n`;

  assert.doesNotThrow(
    () => assertFrontendCollaborationContract(separatePredicates, rows),
    "TSK-001 implementation completion must not be attributed in reverse to NTF-001",
  );
});

test("frontend own-subject stale completion remains rejected within its predicate", () => {
  const checklist = readFileSync(frontendChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const staleOwnPredicate = `${checklist}\nTSK-001 remains pending and NTF-006 implementation complete.\n`;

  assert.throws(
    () => assertFrontendCollaborationContract(staleOwnPredicate, rows),
    /NTF-006 must not claim implementation while ledger 实现 is pending/u,
  );
});

test("AI knowledge section mappings resolve to canonical ledger IDs and Roadmap stages", () => {
  const checklist = readFileSync(knowledgeChecklistPath, "utf8");
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const roadmap = readFileSync(roadmapPath, "utf8");
  assertKnowledgeSectionMappings(checklist, rows, roadmap);

  for (const mutation of [
    replaceKnowledgeSectionMapping(checklist, "COL", { ids: [
      "IDN-005", "KB-002", "KB-009", "KB-010", "WB-001", "WB-A11Y", "ADM-002", "ADM-009", "ADM-999",
    ] }),
    replaceKnowledgeSectionMapping(checklist, "COL", { ids: [
      "IDN-005", "KB-002", "KB-009", "KB-010", "WB-001", "WB-A11Y", "ADM-002", "ADM-009", "OPS-002",
    ] }),
    replaceKnowledgeSectionMapping(checklist, "COL", { stages: ["R1", "R4", "R5"] }),
  ]) {
    assert.throws(() => assertKnowledgeSectionMappings(mutation, rows, roadmap));
  }
});

test("historical gate mapping preserves canonical evidence without claiming current authority", () => {
  const checklist = readFileSync(knowledgeChecklistPath, "utf8");
  assertHistoricalGateContract(checklist);

  const m4 = HISTORICAL_GATE_CONTRACTS.find(({ id }) => id === "GATE-M4");
  assert.ok(m4);
  const duplicateM1 = "| GATE-M1 | current main 已完成 | R0/R1 | 证据已删除 | 当前状态已完成 |";
  for (const mutation of [
    replaceHistoricalGateRow(checklist, m4, { evidence: "证据已删除" }),
    replaceHistoricalGateRow(checklist, m4, { authority: "当前状态已完成" }),
    replaceHistoricalGateRow(checklist, m4, { id: "GATE-M9" }),
    replaceHistoricalGateRow(checklist, m4, { stage: "R5" }),
    `${checklist}\n${duplicateM1}\n`,
  ]) {
    assert.throws(() => assertHistoricalGateContract(mutation));
  }
});

test("Roadmap derives its exact R0-R6 stage contract from the delivery ledger", () => {
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const roadmap = readFileSync(roadmapPath, "utf8");
  const stages = parseRoadmapStages(roadmap);

  assertRoadmapStageOrder(stages);
  const stageContracts = assertRoadmapStageSections(stages);
  assertRoadmapStageIdentity(stageContracts);
  assertRoadmapMaturitySummary(roadmap, rows);
  const owners = assertRoadmapOwnership(stageContracts, rows, roadmap);
  assertRoadmapDependencyStageOrder(owners, rows);
  assertRoadmapConsumedMappings(stageContracts, owners);
});

test("Roadmap contract rejects stage-order, section, maturity, and dependency mutations", () => {
  assert.throws(
    () => assertRoadmapStageOrder(parseRoadmapStages(roadmapStageFixture(["R0", "R1", "R1", "R3", "R4", "R5", "R6"]))),
    /Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6/u,
  );
  assert.throws(
    () => assertRoadmapStageOrder(parseRoadmapStages(roadmapStageFixture(["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"]))),
    /Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6/u,
  );
  assert.throws(
    () => assertRoadmapStageOrder(parseRoadmapStages(roadmapStageFixture(["R0", "R2", "R1", "R3", "R4", "R5", "R6"]))),
    /Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6/u,
  );

  const maturityFixtureRows = [{ ID: "KB-001", 实现: "done", 验证: "done", 发布: "pending", 验收: "pending" }];
  const roadmap = readFileSync(roadmapPath, "utf8");
  assert.throws(
    () => assertRoadmapMaturitySummary(
      "总账成熟度：`atoms=0`; `implementation=done:1,partial:0,pending:0,n/a:0`; `verification=done:1,partial:0,pending:0,n/a:0`; `release=done:0,partial:0,pending:1,n/a:0`; `acceptance=done:0,partial:0,pending:1,n/a:0`",
      maturityFixtureRows,
    ),
    /Roadmap maturity summary must match the delivery ledger/u,
  );
  assert.throws(
    () => assertRoadmapStageSections(parseRoadmapStages(roadmap.replace(/^范围：.*$/mu, "范围："))),
    /R0 requires a non-empty 范围 section/u,
  );
  assert.throws(
    () => assertRoadmapDependencyStageOrder(
      new Map([["ADM-009", "R3"], ["TSK-008", "R2"]]),
      [{ ID: "ADM-009", 依赖: "-" }, { ID: "TSK-008", 依赖: "ADM-009" }],
    ),
    /TSK-008 depends on ADM-009 in a later stage/u,
  );
  assert.throws(
    () => assertRoadmapStageIdentity(ROADMAP_STAGE_CONTRACTS.map((stage) => ({ ...stage, status: stage.id === "R1" ? "active" : stage.status }))),
    /R1 status must be planned/u,
  );
  assert.throws(
    () => assertRoadmapStageSections([{ id: "R0", title: "fixture", content: "\n状态：active\n状态：blocked\n目标：x\n范围：`OPS-001`\n前置依赖：x\n退出标准：\n\n- [ ] x（owned: `OPS-001`; consumed: -）\n" }]),
    /R0 requires exactly one 状态 field/u,
  );
  assert.throws(
    () => assertRoadmapStageIdentity(ROADMAP_STAGE_CONTRACTS.map((stage) => ({ ...stage, title: stage.id === "R3" ? "无关旅程" : stage.title }))),
    /R3 title must be 治理、版本、回收与审计/u,
  );
  assert.throws(
    () => assertRoadmapExitConcepts([{ id: "R3", exits: [{ text: "无关工作" }, { text: "Revision diff/rollback" }, { text: "回收站与最终清理" }] }]),
    /R3 exit 1 must express 批量治理/u,
  );
  assert.throws(
    () => parseRoadmapExitItems({ id: "R3", content: "\n退出标准：\n\n- [ ] 批量治理（owned: `GOV-001`; consumed: `ADM-009`）\n- [x] Revision diff/rollback（owned: `KB-011`; consumed: `KB-004`）\n" }),
    /R3 exit 2 must be unchecked/u,
  );
});

function historicalGateRow(contract, overrides = {}) {
  const row = { ...contract, ...overrides };
  return `| ${row.id} | ${row.conclusion} | ${row.stage} | ${row.evidence} | ${row.authority ?? HISTORICAL_GATE_AUTHORITY} |`;
}

function replaceHistoricalGateRow(markdown, contract, overrides) {
  const original = historicalGateRow(contract);
  assert.ok(markdown.includes(original), `${contract.id} canonical row is required for mutation`);
  return markdown.replace(original, historicalGateRow(contract, overrides));
}

function assertHistoricalGateContract(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const historicalGateRows = [...markdown.matchAll(/^\| (GATE-M[0-8]) \|/gmu)];
  assert.equal(historicalGateRows.length, HISTORICAL_GATE_CONTRACTS.length, "historical gate rows must occur exactly once across the checklist");
  for (const { id } of HISTORICAL_GATE_CONTRACTS) {
    assert.equal(
      historicalGateRows.filter((match) => match[1] === id).length,
      1,
      `${id} must occur exactly once across the checklist`,
    );
  }
  const headerIndex = lines.findIndex((line) => splitTableRow(line).join("|") === HISTORICAL_GATE_COLUMNS.join("|"));
  assert.notEqual(headerIndex, -1, "historical gate table header is required");
  assert.match(lines[headerIndex + 1] ?? "", /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u, "historical gate divider is required");
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trimStart().startsWith("|")) break;
    const cells = splitTableRow(line);
    assert.equal(cells.length, HISTORICAL_GATE_COLUMNS.length, "historical gate row has the required columns");
    rows.push(Object.fromEntries(HISTORICAL_GATE_COLUMNS.map((header, index) => [header, cells[index]])));
  }
  assert.equal(rows.length, HISTORICAL_GATE_CONTRACTS.length, "historical gate rows must be exactly M0 through M8");
  for (const [index, expected] of HISTORICAL_GATE_CONTRACTS.entries()) {
    const row = rows[index];
    assert.deepEqual(row, {
      "历史 Gate": expected.id,
      当前结论: expected.conclusion,
      新阶段: expected.stage,
      "历史证据（非权威）": expected.evidence,
      当前状态权威: HISTORICAL_GATE_AUTHORITY,
    });
  }
}

function parseKnowledgeSectionMappings(markdown) {
  const mappings = new Map();
  for (const { section } of KNOWLEDGE_SECTION_CONTRACTS) {
    const pattern = new RegExp(
      `^## ${section}\\b[^\\r\\n]*\\r?\\n\\r?\\n(当前 R 阶段：(R\\d(?:\\/R\\d)*)；总账映射：\\[([^\\]]+)\\]\\(\\.\\/delivery-status-ledger\\.md\\))$`,
      "gmu",
    );
    const matches = [...markdown.matchAll(pattern)];
    assert.equal(matches.length, 1, `${section} requires exactly one structured R-stage ledger mapping`);
    const stages = matches[0][2].split("/");
    const ids = matches[0][3].split("、");
    assert.equal(new Set(stages).size, stages.length, `${section} mapping stages must be unique`);
    assert.equal(new Set(ids).size, ids.length, `${section} mapping IDs must be unique`);
    for (const stage of stages) assert.ok(ROADMAP_STAGE_IDS.includes(stage), `${section} has invalid stage ${stage}`);
    for (const id of ids) assert.match(id, /^[A-Z][A-Z0-9]*-[A-Z0-9]+$/u, `${section} has invalid ledger ID ${id}`);
    mappings.set(section, { stages, ids, line: matches[0][1] });
  }
  return mappings;
}

function replaceKnowledgeSectionMapping(markdown, section, overrides) {
  const mapping = parseKnowledgeSectionMappings(markdown).get(section);
  assert.ok(mapping, `${section} mapping is required for mutation`);
  const stages = overrides.stages ?? mapping.stages;
  const ids = overrides.ids ?? mapping.ids;
  const replacement = `当前 R 阶段：${stages.join("/")}；总账映射：[${ids.join("、")}](./delivery-status-ledger.md)`;
  return markdown.replace(mapping.line, replacement);
}

function assertKnowledgeSectionMappings(checklist, rows, roadmap) {
  const mappings = parseKnowledgeSectionMappings(checklist);
  const ledgerIds = new Set(rows.map((row) => row.ID));
  const rowsById = new Map(rows.map((row) => [row.ID, row]));
  const roadmapStages = assertRoadmapStageSections(parseRoadmapStages(roadmap));
  const owners = assertRoadmapOwnership(roadmapStages, rows, roadmap);
  const stageIndex = new Map(ROADMAP_STAGE_IDS.map((stage, index) => [stage, index]));

  assert.equal(mappings.size, KNOWLEDGE_SECTION_CONTRACTS.length, "knowledge checklist mappings must cover every section");
  for (const expected of KNOWLEDGE_SECTION_CONTRACTS) {
    const actual = mappings.get(expected.section);
    assert.ok(actual, `${expected.section} mapping is required`);
    assert.deepEqual(actual.ids, expected.ids, `${expected.section} ledger mapping must match its canonical surfaces`);
    const ownerStages = new Set();
    for (const id of actual.ids) {
      assert.ok(ledgerIds.has(id), `${expected.section} mapping ID ${id} requires a ledger row`);
      if (owners.has(id)) {
        ownerStages.add(owners.get(id));
        continue;
      }
      if (EXPLICITLY_DEFERRED_ROADMAP_IDS.has(id)) continue;
      assert.ok(LEGACY_ROADMAP_IDS.has(id), `${expected.section} mapping ID ${id} requires Roadmap ownership`);
      for (const dependency of ledgerDependencies(rowsById.get(id))) {
        const dependencyOwner = owners.get(dependency);
        assert.ok(dependencyOwner, `${expected.section} legacy mapping ${id} dependency ${dependency} requires Roadmap ownership`);
        ownerStages.add(dependencyOwner);
      }
    }
    const expectedStages = [...ownerStages].sort((left, right) => stageIndex.get(left) - stageIndex.get(right));
    assert.deepEqual(actual.stages, expectedStages, `${expected.section} stages must match mapped Roadmap ownership/consumption`);
  }
}

function parseMarkdownTable(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => splitTableRow(line).join("|") === REQUIRED_COLUMNS.join("|"));
  assert.notEqual(headerIndex, -1, "ledger header is required");
  assert.match(lines[headerIndex + 1] ?? "", /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u, "ledger divider is required");

  const headers = splitTableRow(lines[headerIndex]);
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim()) break;
    if (!line.trimStart().startsWith("|")) break;
    const cells = splitTableRow(line);
    assert.equal(cells.length, headers.length, "ledger row has the required columns");
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  }
  return { headers, rows };
}

function reviewedMigrationManifest() {
  const result = spawnSync(process.execPath, [migrationVerifierPath, "--manifest-json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `migration verifier must expose its reviewed manifest as structured JSON: ${result.stderr || result.stdout}`,
  );
  const manifest = JSON.parse(result.stdout);
  assert.ok(Array.isArray(manifest), "reviewed migration manifest must be an array");
  return manifest;
}

function assertCollaborationMigrationEvidence(evidence, manifest) {
  assert.equal(manifest.length, 37, "reviewed migration manifest must contain 37 migrations");
  const numbered = manifest.map((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), ["name", "sha256"], "manifest entries must be name/hash records");
    assert.match(entry.name, /^\d{4}_[a-z0-9_]+\.sql$/u, "migration names must be numbered SQL files");
    assert.match(entry.sha256, /^[a-f0-9]{64}$/u, "migration hashes must be SHA-256 values");
    return { ...entry, number: Number.parseInt(entry.name.slice(0, 4), 10) };
  });
  assert.deepEqual(
    numbered.map(({ number }) => number),
    Array.from({ length: 37 }, (_, index) => index + 1),
    "reviewed migrations must be continuously numbered 0001 through 0037",
  );

  const collaborationMigrations = numbered.filter(({ number }) => number >= 35 && number <= 37);
  assert.deepEqual(
    collaborationMigrations.map(({ number }) => number),
    [35, 36, 37],
    "collaboration delivery requires reviewed migrations 0035 through 0037",
  );

  const evidenceRows = new Map(
    [...evidence.matchAll(/^- `([^`]+\.sql)`: ([^\n]+)$/gmu)]
      .map((match) => [match[1], match[2]]),
  );
  for (const { name } of collaborationMigrations) {
    assert.ok(evidenceRows.has(name), `${name} requires migration-specific local evidence`);
  }

  const menuEvidence = evidenceRows.get(collaborationMigrations[0].name);
  assert.match(menuEvidence, /deterministic.*menu ordering/iu, "0035 evidence must describe deterministic menu ordering");
  assert.match(
    menuEvidence,
    /(?:status.*(?:preserv|retain)|(?:preserv|retain).*status)/iu,
    "0035 evidence must state that existing status is preserved",
  );
  assert.doesNotMatch(menuEvidence, /readiness|ready/iu, "0035 must not be credited with route readiness");
  assert.match(
    evidence,
    /readiness.*shared route registry.*frontend navigation merge/iu,
    "route readiness must be attributed to the shared route registry and frontend navigation merge",
  );

  const migrationCount = evidence.match(/cover (\d+) migrations/u)?.[1];
  assert.equal(Number.parseInt(migrationCount ?? "", 10), manifest.length, "evidence migration count must match the reviewed manifest");
}

function assertCollaborationEvidenceBoundary(evidence) {
  const columns = [
    "Surface", "Local implementation", "Local verification", "Main integration", "Push/PR",
    "Deployment", "Remote migrations", "Production smoke", "Secrets operations", "Signed browser acceptance",
  ];
  const lines = evidence.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => splitTableRow(line).join("|") === columns.join("|"));
  assert.notEqual(headerIndex, -1, "collaboration evidence requires a structured delivery-boundary table");
  assert.match(lines[headerIndex + 1] ?? "", /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u);
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trimStart().startsWith("|")) break;
    const cells = splitTableRow(line);
    assert.equal(cells.length, columns.length, "delivery-boundary row has the required columns");
    rows.push(Object.fromEntries(columns.map((column, index) => [column, cells[index]])));
  }
  assert.deepEqual(
    rows,
    ["Tasks", "Boards", "Notifications", "Messages"].map((surface) => ({
      Surface: surface,
      "Local implementation": "done",
      "Local verification": "done",
      "Main integration": "pending",
      "Push/PR": "not performed",
      Deployment: "not performed",
      "Remote migrations": "not performed",
      "Production smoke": "not performed",
      "Secrets operations": "not performed",
      "Signed browser acceptance": "not performed",
    })),
    "collaboration evidence must keep local, integration, release, and acceptance states separate",
  );
}

function assertFrontendCollaborationContract(checklist, rows) {
  const rowsById = new Map(rows.map((row) => [row.ID, row]));
  const ledgerIds = new Set(rows.map((row) => row.ID));
  const checkboxRows = [...checklist.matchAll(
    /^[ \t]*- \[([ xX])\] `?(FE-(?:NTF|BRD|MSG|ACC)-\d{3})`?(?:\s|$)/gmu,
  )].map((match) => ({ id: match[2], checked: match[1].toLowerCase() === "x", index: match.index }));
  for (const { id, checked } of FRONTEND_COLLABORATION_ATOM_CONTRACTS) {
    const matches = checkboxRows.filter((row) => row.id === id);
    assert.equal(matches.length, 1, `${id} must have exactly one checkbox row`);
    assert.equal(matches[0].checked, checked, `${id} checked state must match local UI evidence`);
  }
  assert.equal(
    checkboxRows.length,
    FRONTEND_COLLABORATION_ATOM_CONTRACTS.length,
    "frontend collaboration checkbox rows must be exactly seven canonical atoms",
  );

  const sectionHeading = "## 工作台协作前端（R2）";
  const sectionHeadings = [...checklist.matchAll(/^## 工作台协作前端（R2）$/gmu)];
  assert.equal(sectionHeadings.length, 1, "frontend collaboration section must occur exactly once");
  const sectionStart = sectionHeadings[0].index + sectionHeadings[0][0].length;
  const nextHeadingOffset = checklist.slice(sectionStart).search(/^## /mu);
  const sectionEnd = nextHeadingOffset === -1 ? checklist.length : sectionStart + nextHeadingOffset;
  for (const row of checkboxRows) {
    assert.ok(
      row.index >= sectionStart && row.index < sectionEnd,
      `${row.id} checkbox row must occur only in ${sectionHeading}`,
    );
  }

  const section = checklist.slice(sectionStart, sectionEnd);
  const atoms = [...section.matchAll(
    /^[ \t]*- \[([ xX])\] `(FE-(?:NTF|BRD|MSG|ACC)-\d{3})` .+；后端总账依赖：\[([^\]]+)\]\(\.\/delivery-status-ledger\.md\)。$/gmu,
  )].map((match) => ({
    id: match[2],
    checked: match[1].toLowerCase() === "x",
    dependencies: match[3].split("、"),
  }));

  assert.deepEqual(
    atoms,
    FRONTEND_COLLABORATION_ATOM_CONTRACTS,
    "frontend collaboration atoms must match canonical dependencies",
  );
  for (const atom of atoms) {
    for (const dependency of atom.dependencies) {
      assert.ok(ledgerIds.has(dependency), `${atom.id} dependency ${dependency} requires a ledger row`);
    }
  }
  assert.match(
    checklist,
    /已勾选 frontend atom 只证明前端实现与本地\/UI 合同；不能单独把后端、migration、发布或验收提升为完成。/u,
  );
  assertNoPendingFrontendCompletionClaims(checklist, rowsById);
}

function assertNoPendingFrontendCompletionClaims(checklist, rowsById) {
  const dependencyIds = new Set(
    FRONTEND_COLLABORATION_ATOM_CONTRACTS.flatMap(({ dependencies }) => dependencies),
  );
  for (const id of dependencyIds) {
    const row = rowsById.get(id);
    assert.ok(row, `${id} completion guard requires a ledger row`);
    const subject = `(?:\`?${escapeRegExp(id)}\`?)`;
    for (const dimension of FRONTEND_LEDGER_DIMENSION_CLAIMS) {
      if (row[dimension.column] === "done") continue;
      assertNoPositiveDimensionClaim(
        checklist,
        subject,
        dimension,
        `${id} must not claim ${dimension.name} while ledger ${dimension.column} is ${row[dimension.column]}`,
      );
    }
    if (!isOverallCompletionEligible(row)) {
      assertNoPositiveDimensionClaim(
        checklist,
        subject,
        FRONTEND_OVERALL_COMPLETION_CLAIM,
        `${id} must not claim overall completion until all applicable ledger dimensions are done`,
        64,
        ({ claimIndex, claim }) => handleDimensionQualifiedCompletion(
          checklist,
          claimIndex,
          claim.length,
          [row],
          (dimension) => `${id} must not claim ${dimension.name} while ledger ${dimension.column} is ${row[dimension.column]}`,
        ),
      );
    }
  }

  for (const { path, ledgerId } of FRONTEND_PENDING_ROUTE_CONTRACTS) {
    const row = rowsById.get(ledgerId);
    assert.ok(row, `${path} completion guard requires ledger row ${ledgerId}`);
    const subject = `(?:\`?${escapeRegExp(path)}\`?)`;
    for (const dimension of FRONTEND_LEDGER_DIMENSION_CLAIMS) {
      if (row[dimension.column] === "done") continue;
      assertNoPositiveDimensionClaim(
        checklist,
        subject,
        dimension,
        `${path} must not claim ${dimension.name} while ledger ${ledgerId} ${dimension.column} is ${row[dimension.column]}`,
        12,
      );
    }
    if (!isOverallCompletionEligible(row)) {
      assertNoPositiveDimensionClaim(
        checklist,
        subject,
        FRONTEND_OVERALL_COMPLETION_CLAIM,
        `${path} must not claim overall completion until all applicable ledger dimensions are done`,
        12,
        ({ claimIndex, claim }) => handleDimensionQualifiedCompletion(
          checklist,
          claimIndex,
          claim.length,
          [row],
          (dimension) => `${path} must not claim ${dimension.name} while ledger ${ledgerId} ${dimension.column} is ${row[dimension.column]}`,
        ),
      );
    }
  }

  for (const { name, ledgerPrefix, claim } of FRONTEND_PENDING_DOMAIN_CONTRACTS) {
    const domainRows = [...rowsById.values()].filter((row) => row.ID.startsWith(ledgerPrefix));
    assert.ok(domainRows.length > 0, `${name} requires ledger rows`);
    for (const dimension of FRONTEND_LEDGER_DIMENSION_CLAIMS) {
      if (domainRows.every((row) => row[dimension.column] === "done")) continue;
      assertNoPositiveDimensionClaim(
        checklist,
        claim,
        dimension,
        `${name} must not claim ${dimension.name} while ledger ${dimension.column} is not done`,
      );
    }
    if (!domainRows.every(isOverallCompletionEligible)) {
      assertNoPositiveDimensionClaim(
        checklist,
        claim,
        FRONTEND_OVERALL_COMPLETION_CLAIM,
        `${name} must not claim overall completion until all applicable ledger dimensions are done`,
        64,
        ({ claimIndex, claim }) => handleDimensionQualifiedCompletion(
          checklist,
          claimIndex,
          claim.length,
          domainRows,
          (dimension) => `${name} must not claim ${dimension.name} while ledger ${dimension.column} is not done`,
        ),
      );
    }
  }
}

function isOverallCompletionEligible(row) {
  return FRONTEND_LEDGER_DIMENSION_CLAIMS.every(({ column }) =>
    row[column] === "done" || (row[column] === "n/a" && hasWrittenValue(row.备注)),
  );
}

function assertNoPositiveDimensionClaim(
  markdown,
  subject,
  dimension,
  message,
  reverseDistance = 64,
  handlePositiveClaim,
) {
  const predicateCharacter = `(?:(?!${FRONTEND_PREDICATE_BOUNDARY})[\\s\\S])`;
  const forwardBetween = `${predicateCharacter}{0,64}?`;
  const reverseBetween = `${predicateCharacter}{0,${reverseDistance}}`;
  const patterns = [
    new RegExp(`${subject}${forwardBetween}(?<claim>${dimension.claim})`, "giu"),
    new RegExp(`(?<claim>${dimension.claim})${reverseBetween}${subject}`, "giu"),
  ];
  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const claim = match.groups?.claim;
      assert.ok(claim, `${dimension.name} claim parser must capture its claim`);
      const claimIndex = match.index + match[0].indexOf(claim);
      if (isClearlyNegatedOrPendingClaim(markdown, claimIndex)) continue;
      if (handlePositiveClaim?.({ claimIndex, claim })) continue;
      assert.fail(message);
    }
  }
}

function handleDimensionQualifiedCompletion(markdown, claimIndex, claimLength, rows, messageForDimension) {
  const dimension = dimensionQualifiedCompletion(markdown, claimIndex, claimLength);
  if (!dimension) return false;
  assert.ok(
    rows.every((row) => row[dimension.column] === "done"),
    messageForDimension(dimension),
  );
  return true;
}

function dimensionQualifiedCompletion(markdown, claimIndex, claimLength) {
  const prefix = predicatePrefix(markdown, claimIndex);
  const suffix = predicateSuffix(markdown, claimIndex + claimLength);
  const prefixTokens = englishTokens(prefix);
  const suffixTokens = englishTokens(suffix);

  for (const dimension of FRONTEND_LEDGER_DIMENSION_CLAIMS) {
    for (const qualifier of dimension.englishQualifiers) {
      const qualifierTokens = englishTokens(qualifier);
      if (
        [[], ["is"], ["was"], ["remains"]].some((link) =>
          endsWithTokens(prefixTokens, [...qualifierTokens, ...link])
        ) || startsWithTokens(suffixTokens, qualifierTokens)
      ) {
        return dimension;
      }
    }
  }

  const compactPrefix = prefix.replace(/\s+/gu, "");
  const compactSuffix = suffix.replace(/\s+/gu, "");
  for (const dimension of FRONTEND_LEDGER_DIMENSION_CLAIMS) {
    for (const qualifier of dimension.chineseQualifiers) {
      if (
        [qualifier, `${qualifier}已`, `${qualifier}已经`].some((candidate) => compactPrefix.endsWith(candidate)) ||
        compactSuffix.startsWith(qualifier)
      ) {
        return dimension;
      }
    }
  }
  return undefined;
}

function isClearlyNegatedOrPendingClaim(markdown, claimIndex) {
  const prefix = predicatePrefix(markdown, claimIndex);
  const tokens = englishTokens(prefix);
  while (["entirely", "fully", "completely", "yet"].includes(tokens.at(-1))) tokens.pop();
  if (["not", "never", "pending"].includes(tokens.at(-1))) return true;

  const modalComplements = [
    [], ["be"], ["be", "considered"], ["be", "considered", "as"],
    ["be", "marked"], ["be", "marked", "as"],
    ["be", "described"], ["be", "described", "as"],
    ["be", "treated"], ["be", "treated", "as"],
  ];
  for (const modal of [["cannot"], ["can't"], ["must", "not"], ["should", "not"]]) {
    if (modalComplements.some((complement) => endsWithTokens(tokens, [...modal, ...complement]))) return true;
  }

  const compactPrefix = prefix.replace(/\s+/gu, "");
  const directNegators = ["尚未", "还未", "未", "不是", "并非", "不", "待"];
  const directComplements = ["", "整体", "真正", "完整", "完全", "达到", "达到完整"];
  if (directNegators.some((negator) =>
    directComplements.some((complement) => compactPrefix.endsWith(`${negator}${complement}`))
  )) return true;

  const modalNegators = ["不能", "不得", "不应", "不可"];
  const chineseModalComplements = [
    "", "被视为", "视为", "被标记为", "标记为", "被描述为", "描述为", "被认定为", "认定为",
  ];
  return modalNegators.some((negator) =>
    chineseModalComplements.some((complement) => compactPrefix.endsWith(`${negator}${complement}`))
  );
}

function predicatePrefix(markdown, endIndex) {
  const window = markdown.slice(Math.max(0, endIndex - 96), endIndex);
  return window.slice(lastPredicateBoundaryEnd(window));
}

function predicateSuffix(markdown, startIndex) {
  const window = markdown.slice(startIndex, startIndex + 48);
  const boundary = firstPredicateBoundaryStart(window);
  return window.slice(0, boundary);
}

function lastPredicateBoundaryEnd(value) {
  let boundaryEnd = 0;
  for (const match of value.matchAll(new RegExp(FRONTEND_PREDICATE_BOUNDARY, "giu"))) {
    boundaryEnd = match.index + match[0].length;
  }
  return boundaryEnd;
}

function firstPredicateBoundaryStart(value) {
  const match = new RegExp(FRONTEND_PREDICATE_BOUNDARY, "iu").exec(value);
  return match?.index ?? value.length;
}

function englishTokens(value) {
  return [...value.toLowerCase().matchAll(/[\p{L}\p{N}_]+(?:['-][\p{L}\p{N}_]+)*/gu)]
    .map((match) => match[0]);
}

function endsWithTokens(tokens, suffix) {
  if (suffix.length > tokens.length) return false;
  return suffix.every((token, index) => token === tokens[tokens.length - suffix.length + index]);
}

function startsWithTokens(tokens, prefix) {
  if (prefix.length > tokens.length) return false;
  return prefix.every((token, index) => token === tokens[index]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let codeFenceLength = 0;
  const trimmed = line.trim();

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\") {
      cell += character;
      if (index + 1 < trimmed.length) cell += trimmed[++index];
      continue;
    }
    if (character === "`") {
      let fenceEnd = index;
      while (trimmed[fenceEnd] === "`") fenceEnd += 1;
      const fenceLength = fenceEnd - index;
      if (codeFenceLength === 0) codeFenceLength = fenceLength;
      else if (codeFenceLength === fenceLength) codeFenceLength = 0;
      cell += "`".repeat(fenceLength);
      index = fenceEnd - 1;
      continue;
    }
    if (character === "|" && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|")) cells.pop();
  return cells;
}

function assertRowContract(row) {
  for (const field of ["实现", "验证", "发布", "验收"]) {
    assert.ok(STATUS_VALUES.has(row[field]), `${row.ID} has invalid ${field}`);
  }
  if (["实现", "验证", "发布", "验收"].some((field) => row[field] === "done")) {
    assert.ok(hasWrittenValue(row.证据), `${row.ID} requires evidence`);
  }
  if (["实现", "验证", "发布", "验收"].some((field) => row[field] === "n/a")) {
    assert.ok(hasWrittenValue(row.备注), `${row.ID} requires a reason for n/a`);
  }
  if (row.发布 === "partial" || row.发布 === "done") {
    assertScopedDatedEvidence(row, "release");
  }
  if (row.验收 === "partial" || row.验收 === "done") {
    assertScopedDatedEvidence(row, "acceptance");
  }
}

function assertScopedDatedEvidence(row, kind) {
  const marker = new RegExp(
    `${kind} evidence:\\s*\`([^\`\\r\\n]+)\`\\s*\\[scope:\\s*([^\\]\\r\\n]+?)\\s*\\]`,
    "gu",
  );
  const entries = [...(row.证据 ?? "").matchAll(marker)].map((match) => ({
    path: match[1],
    scope: match[2]?.trim(),
  }));
  const datedEvidencePath = /^docs\/operations\/evidence\/[^/`\r\n]*\d{4}-\d{2}-\d{2}[^/`\r\n]*\.md$/u;
  assert.ok(
    entries.some(({ path, scope }) =>
      datedEvidencePath.test(path) &&
      existsSync(resolve(repositoryRoot, path)) &&
      hasCapabilityScope(scope)
    ),
    `${row.ID} requires scoped dated ${kind} evidence`,
  );
}

function assertDependencyGraph(rows) {
  const rowsById = new Map(rows.map((row) => [row.ID, row]));
  const dependenciesById = new Map();
  for (const row of rows) {
    const dependencies = ledgerDependencies(row);
    for (const dependency of dependencies) {
      assert.ok(rowsById.has(dependency), `${row.ID} has unknown dependency ${dependency}`);
    }
    dependenciesById.set(row.ID, dependencies);
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      assert.fail(`ledger dependency cycle: ${[...stack.slice(cycleStart), id].join(" -> ")}`);
    }
    visiting.add(id);
    stack.push(id);
    for (const dependency of dependenciesById.get(id) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const row of rows) visit(row.ID);
}

function ledgerDependencies(row) {
  const value = (row.依赖 ?? "").trim();
  if (value === "" || value === "-" || value === "—") return [];
  return value.split(",").map((dependency) => dependency.trim()).filter(Boolean);
}

function hasWrittenValue(value) {
  return !PLACEHOLDER_VALUES.has((value ?? "").trim().toLowerCase());
}

function hasCapabilityScope(value) {
  const normalized = (value ?? "").trim().toLowerCase();
  return hasWrittenValue(normalized) && !STATUS_VALUES.has(normalized);
}

function routeTokens(row) {
  return new Set(
    [row.证据, row.备注].flatMap((field) =>
      [...(field ?? "").matchAll(/shared route:\s*`(\/[^`\r\n]*)`/gu)].map((match) => match[1]),
    ),
  );
}

function workspaceRouteCapabilities(path = routeCapabilitiesPath) {
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [path] });
  try {
    const project = snapshot.getDefaultProjectForFile(path);
    const sourceFile = project?.program.getSourceFile(path);
    assert.ok(sourceFile, "workspace route capabilities source is required");
    const declaration = findWorkspaceRouteCapabilitiesDeclaration(sourceFile);
    const entries = workspaceRouteCapabilityEntries(declaration.initializer);
    const records = entries.map((entry, index) => workspaceRouteCapabilityRecord(entry, index));
    assert.equal(records.length, entries.length, "every workspace route registry entry must be extracted");
    const routes = records.filter((record) => record.availability === "ready" || record.availability === "coming_soon");
    assert.ok(routes.length > 0, "workspace route capabilities are required");
    return routes;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function findWorkspaceRouteCapabilitiesDeclaration(sourceFile) {
  let declaration;
  const visit = (node) => {
    if (isVariableDeclaration(node) && isIdentifier(node.name) && node.name.text === "WORKSPACE_ROUTE_CAPABILITIES") {
      declaration = node;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  assert.ok(declaration?.initializer, "WORKSPACE_ROUTE_CAPABILITIES declaration is required");
  return declaration;
}

function workspaceRouteCapabilityEntries(initializer) {
  const expression = unwrapExpression(initializer);
  assert.ok(isCallExpression(expression), "WORKSPACE_ROUTE_CAPABILITIES must use Object.freeze");
  assert.equal(expression.expression.getText(), "Object.freeze", "WORKSPACE_ROUTE_CAPABILITIES must use Object.freeze");
  assert.equal(expression.arguments.length, 1, "WORKSPACE_ROUTE_CAPABILITIES has one frozen value");
  const array = unwrapExpression(expression.arguments[0]);
  assert.ok(isArrayLiteralExpression(array), "WORKSPACE_ROUTE_CAPABILITIES must freeze an array");
  return array.elements;
}

function workspaceRouteCapabilityRecord(entry, index) {
  assert.ok(isObjectLiteralExpression(entry), `workspace route registry entry ${index} must be an object`);
  const properties = new Map();
  for (const property of entry.properties) {
    assert.ok(isPropertyAssignment(property), `workspace route registry entry ${index} must use property assignments`);
    assert.ok(property.name, `workspace route registry entry ${index} property name is required`);
    assert.ok(isIdentifier(property.name) || isStringLiteral(property.name), `workspace route registry entry ${index} property name is invalid`);
    properties.set(property.name.text, property.initializer);
  }
  const path = properties.get("path");
  const availability = properties.get("availability");
  assert.ok(isStringLiteral(path), `workspace route registry entry ${index} requires string path`);
  assert.ok(isStringLiteral(availability), `workspace route registry entry ${index} requires string availability`);
  return { path: path.text, availability: availability.text };
}

function unwrapExpression(expression) {
  while (isAsExpression(expression) || isSatisfiesExpression(expression) || isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function roadmapBacktickIds(roadmap) {
  return [...roadmap.matchAll(/`([A-Z][A-Z0-9]*-[A-Z0-9]+)`/gu)].map((match) => match[1]);
}

function parseRoadmapStages(roadmap) {
  const headings = [...roadmap.matchAll(/^## ([^\r\n]+)$/gmu)];
  assert.ok(headings.length > 0, "Roadmap delivery stages are required");
  const stages = headings.map((match, index) => {
    const heading = match[1];
    const stageMatch = /^(R\d+) — (.+)$/u.exec(heading);
    assert.ok(stageMatch, `Roadmap top-level heading must be an R-stage: ${heading}`);
    const contentStart = match.index + match[0].length;
    const contentEnd = headings[index + 1]?.index ?? roadmap.length;
    return { id: stageMatch[1], title: stageMatch[2], content: roadmap.slice(contentStart, contentEnd) };
  });
  return stages;
}

function assertRoadmapStageOrder(stages) {
  assert.deepEqual(
    stages.map((stage) => stage.id),
    ROADMAP_STAGE_IDS,
    "Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6",
  );
}

function assertRoadmapStageSections(stages) {
  return stages.map((stage) => ({
    ...stage,
    status: roadmapStageField(stage, "状态"),
    goal: roadmapStageField(stage, "目标"),
    scope: roadmapStageField(stage, "范围"),
    dependencies: roadmapStageField(stage, "前置依赖"),
    exits: parseRoadmapExitItems(stage),
  }));
}

function roadmapStageField(stage, label) {
  const matches = [...stage.content.matchAll(new RegExp(`^${label}：(.*)$`, "gmu"))];
  assert.equal(matches.length, 1, `${stage.id} requires exactly one ${label} field`);
  const value = matches[0][1].trim();
  assert.ok(value, `${stage.id} requires a non-empty ${label} section`);
  return value;
}

function parseRoadmapExitItems(stage) {
  const headers = [...stage.content.matchAll(/^退出标准：$/gmu)];
  assert.equal(headers.length, 1, `${stage.id} requires exactly one 退出标准 field`);
  const body = stage.content.slice(headers[0].index + headers[0][0].length).trim();
  const lines = body.split(/\r?\n/u).filter(Boolean);
  assert.ok(lines.length > 0, `${stage.id} requires an unchecked 退出标准 checklist`);
  return lines.map((line, index) => {
    const match = /^- \[([ x])\] (.+?)（owned: (.*?); consumed: (.*?)）$/u.exec(line);
    assert.ok(match, `${stage.id} exit ${index + 1} requires owned/consumed ID mappings`);
    assert.equal(match[1], " ", `${stage.id} exit ${index + 1} must be unchecked`);
    const owned = roadmapBacktickIds(match[3]);
    const consumed = match[4].trim() === "-" ? [] : roadmapBacktickIds(match[4]);
    assert.ok(owned.length > 0, `${stage.id} exit ${index + 1} requires an owned ID`);
    assert.ok(match[4].trim() === "-" || consumed.length > 0, `${stage.id} exit ${index + 1} requires consumed IDs or -`);
    return { text: match[2], owned, consumed };
  });
}

function assertRoadmapStageIdentity(stages) {
  assert.equal(stages.length, ROADMAP_STAGE_CONTRACTS.length, "Roadmap stage contracts must be complete");
  for (const [index, expected] of ROADMAP_STAGE_CONTRACTS.entries()) {
    const stage = stages[index];
    assert.equal(stage.id, expected.id, `Roadmap stage ${index + 1} ID must be ${expected.id}`);
    assert.equal(stage.title, expected.title, `${stage.id} title must be ${expected.title}`);
    assert.equal(stage.status, expected.status, `${stage.id} status must be ${expected.status}`);
  }
}

function assertRoadmapExitConcepts(stages) {
  for (const stage of stages) {
    const concepts = STAGE_EXIT_CONCEPTS.get(stage.id);
    if (!concepts) continue;
    assert.equal(stage.exits.length, concepts.length, `${stage.id} requires ${concepts.length} mapped exits`);
    for (const [index, concept] of concepts.entries()) {
      assert.match(stage.exits[index].text, concept, `${stage.id} exit ${index + 1} must express ${concept.source}`);
    }
  }
}

function assertRoadmapMaturitySummary(roadmap, rows) {
  assert.deepEqual(
    roadmapMaturitySummary(roadmap),
    ledgerMaturitySummary(rows),
    "Roadmap maturity summary must match the delivery ledger",
  );
}

function roadmapMaturitySummary(roadmap) {
  const match = /^总账成熟度：`atoms=(\d+)`; `implementation=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`; `verification=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`; `release=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`; `acceptance=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`$/mu.exec(roadmap);
  assert.ok(match, "Roadmap requires a structured 总账成熟度 summary");
  const values = match.slice(1).map(Number);
  const summary = { atoms: values.shift() };
  for (const [dimension] of ROADMAP_MATURITY_DIMENSIONS) {
    summary[dimension] = Object.fromEntries(["done", "partial", "pending", "n/a"].map((status) => [status, values.shift()]));
  }
  return summary;
}

function ledgerMaturitySummary(rows) {
  const summary = { atoms: rows.length };
  for (const [dimension, column] of ROADMAP_MATURITY_DIMENSIONS) {
    summary[dimension] = Object.fromEntries(
      ["done", "partial", "pending", "n/a"].map((status) => [status, rows.filter((row) => row[column] === status).length]),
    );
  }
  return summary;
}

function assertRoadmapOwnership(stages, rows, roadmap) {
  const ledgerIds = new Set(rows.map((row) => row.ID));
  const owners = new Map();
  for (const stage of stages) {
    const ids = roadmapBacktickIds(stage.scope);
    assert.ok(ids.length > 0, `${stage.id} requires a non-empty 范围 section`);
    for (const id of ids) {
      assert.ok(ledgerIds.has(id), `${stage.id} scope ID ${id} requires a ledger row`);
      assert.ok(!LEGACY_ROADMAP_IDS.has(id), `${stage.id} must not own legacy ledger ID ${id}`);
      assert.ok(!EXPLICITLY_DEFERRED_ROADMAP_IDS.has(id), `${stage.id} must not own explicitly deferred ID ${id}`);
      assert.ok(!owners.has(id), `${id} must have exactly one R-stage owner`);
      owners.set(id, stage.id);
    }
  }
  for (const row of rows) {
    if (LEGACY_ROADMAP_IDS.has(row.ID)) {
      assert.ok(!owners.has(row.ID), `legacy ledger ID ${row.ID} must not have an R-stage owner`);
      continue;
    }
    if (EXPLICITLY_DEFERRED_ROADMAP_IDS.has(row.ID)) {
      assert.ok(!owners.has(row.ID), `explicitly deferred ID ${row.ID} must not have an R-stage owner`);
      assert.match(roadmap, new RegExp("^明确排除：.*`" + row.ID + "`.*可选.*不在.*R0–R6", "mu"), `${row.ID} requires an explicit optional-roadmap rationale`);
      continue;
    }
    assert.ok(owners.has(row.ID), `${row.ID} requires exactly one R-stage owner`);
  }
  return owners;
}

function assertRoadmapConsumedMappings(stages, owners) {
  const stageIndex = new Map(ROADMAP_STAGE_IDS.map((stage, index) => [stage, index]));
  for (const stage of stages) {
    const consumed = [
      ...roadmapBacktickIds(stage.dependencies),
      ...stage.exits.flatMap((exit) => exit.consumed),
    ];
    for (const id of consumed) {
      const owner = owners.get(id);
      assert.ok(owner, `${stage.id} consumes ${id}, which requires an R-stage owner`);
      assert.ok(stageIndex.get(owner) < stageIndex.get(stage.id), `${stage.id} consumes ${id} from a non-earlier stage`);
    }
    for (const exit of stage.exits) {
      for (const id of exit.owned) {
        assert.equal(owners.get(id), stage.id, `${stage.id} exit must own ${id}`);
      }
    }
  }
  assertRoadmapExitConcepts(stages);
}

function assertRoadmapDependencyStageOrder(owners, rows) {
  const stageIndex = new Map(ROADMAP_STAGE_IDS.map((stage, index) => [stage, index]));
  for (const row of rows) {
    const owner = owners.get(row.ID);
    if (!owner) continue;
    for (const dependency of ledgerDependencies(row)) {
      if (LEGACY_ROADMAP_IDS.has(dependency)) continue;
      const dependencyOwner = owners.get(dependency);
      assert.ok(dependencyOwner, `${row.ID} dependency ${dependency} requires an R-stage owner`);
      assert.ok(
        stageIndex.get(dependencyOwner) <= stageIndex.get(owner),
        `${row.ID} depends on ${dependency} in a later stage`,
      );
    }
  }
}

function roadmapStageFixture(ids) {
  return ids.map((id) => `## ${id} — fixture`).join("\n\n");
}
