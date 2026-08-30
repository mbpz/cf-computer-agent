import assert from "node:assert/strict";
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
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");

const STATUS_VALUES = new Set(["done", "partial", "pending", "n/a"]);
const REQUIRED_COLUMNS = [
  "ID", "功能", "优先级", "实现", "验证", "发布", "验收", "依赖", "证据", "备注",
];
const PLACEHOLDER_VALUES = new Set(["", "-", "—", "n/a", "tbd", "todo", "待补", "待补充"]);
const ROADMAP_STAGE_CONTRACTS = [
  { id: "R0", title: "状态收口、身份与工作台基础", status: "active" },
  { id: "R1", title: "AI 知识库核心与受控摄取", status: "planned" },
  { id: "R2", title: "任务、通知、看板与上下文消息", status: "planned" },
  { id: "R3", title: "治理、版本、回收与审计", status: "planned" },
  { id: "R4", title: "成熟检索、阅读器与评测", status: "planned" },
  { id: "R5", title: "来源工作台、研究产物与有界 Agent", status: "planned" },
  { id: "R6", title: "导出、恢复、容量保护与 1.0", status: "planned" },
];
const ROADMAP_STAGE_IDS = ROADMAP_STAGE_CONTRACTS.map((stage) => stage.id);
const LEGACY_ROADMAP_IDS = new Set(["GATE-M0", "GATE-M1", "WS-001", "WS-008"]);
const EXPLICITLY_DEFERRED_ROADMAP_IDS = new Set(["IDN-002"]);
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
    ids: ["IDN-005", "KB-002", "KB-009", "KB-010", "WB-001", "WB-A11Y", "ADM-002", "ADM-009", "ADM-010"],
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
      { path: "/boards", availability: "coming_soon" },
      { path: "/notifications", availability: "coming_soon" },
      { path: "/messages", availability: "coming_soon" },
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
  for (const mutation of [
    replaceHistoricalGateRow(checklist, m4, { evidence: "证据已删除" }),
    replaceHistoricalGateRow(checklist, m4, { authority: "当前状态已完成" }),
    replaceHistoricalGateRow(checklist, m4, { id: "GATE-M9" }),
    replaceHistoricalGateRow(checklist, m4, { stage: "R5" }),
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
