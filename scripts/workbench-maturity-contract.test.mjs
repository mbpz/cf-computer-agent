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
  isBinaryExpression,
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
const domainAuditPath = resolve(repositoryRoot, "docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md");
const deliveryLedgerPath = resolve(repositoryRoot, "docs/product/delivery-status-ledger.md");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");
const classifications = new Set(["usable", "partial", "unusable", "pseudo_entry", "unreachable"]);
const dimensions = new Set(["entry", "journey", "api", "persistence", "isolation", "query_or_idempotency", "states", "accessibility", "evidence"]);
const dimensionStates = new Set(["proven", "gap", "not_applicable"]);
const roles = new Set(["anonymous", "contributor", "admin"]);
// Historical R0 scope. Current ready-route coverage is independently derived below.
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
  ["R0-012", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "domain", "delivery"] }],
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
  "workbench-admin": {"source": "manifest:0@a624a903fd09", "dimension": "api", "slug": "real-dashboard-summary", "symptom": "管理概览权威总数与独立状态已本地验证；维护面刻意只读呈现协调器状态（phase/epoch/window/active/records/limit/remaining/alert）并在运行手册中列出两个操作端点：没有配置 MAINTENANCE_CONTROL_TOKEN 时所有控制调用都返回 503 MAINTENANCE_CONTROL_UNAVAILABLE，按钮只能失败，因此 begin-drain/resume 保持刻意不可达的客户端写入。跨页写后对账、站点统计日期一致性及发布验收仍缺失。", "owner": "R6-001"},
  "workbench-admin-analytics": {"source": "manifest:0@fa4e6b219f73", "dimension": "journey", "slug": "date-range-and-pagination", "symptom": "统计读取恢复、单事务快照和跨页写后对账已本地验证；发布与真实登录浏览器验收仍未闭环。", "owner": "R6-002"},
  "workbench-admin-assets": {"source": "manifest:0@6434dc8da411", "dimension": "states", "slug": "parse-progress-and-recovery", "symptom": "资产页初始读失败恢复已本地验证；解析进度与完整恢复旅程不完整。", "owner": "R6-004"},
  "workbench-admin-audit": {"source": "manifest:0@bfef1ebcb5d4", "dimension": "states", "slug": "raw-page-shape-and-retry", "symptom": "审计页 raw page 与 generation/page 解构不兼容，ready/empty 不可达且错误无重试。", "owner": "R6-009"},
  "workbench-admin-duplicates": {"source": "manifest:0@dac694c1ad42", "dimension": "journey", "slug": "duplicate-decision-recovery", "symptom": "重复候选页初始读失败恢复已本地验证；决策收敛旅程未证明。", "owner": "R6-010"},
  "workbench-admin-knowledge-item": {"source": "manifest:0@8f0ecc5f1a67", "dimension": "journey", "slug": "item-lifecycle-surface", "symptom": "参数化条目路由与来自回收站的页内入口已登记，服务端路由匹配与客户端 router 都认识 /admin/knowledge/:id，打开单个条目会渲染带操作编号日志的治理版本证据与 trash/rollback 操作（按生命周期回执回放）。替换权限、跨会话投影、发布与 signed-browser 验收仍未证明。条目页刻意没有导航行：/admin/knowledge/:id 是从回收站行进入的管理地址；由于没有读取单个已回收条目的端点，打开仍处于回收态的项目会明确声明它未处于活动状态并由回收站处理，先恢复再打开才是有效路径。", "owner": "R6-003"},
  "workbench-admin-knowledge-trash": {"source": "manifest:0@479301ecaad2", "dimension": "journey", "slug": "fixed-path-page-kind", "symptom": "固定路径分支为 /admin/knowledge/trash 登记并在条目详情模式之前匹配，因此回收站除菜单路由外还拥有独立 pageKind 清点项；发布与 signed-browser 验收仍未证明。", "owner": "R6-003"},
  "workbench-admin-members": {"source": "manifest:0@191629863c93", "dimension": "journey", "slug": "member-status-and-audit-navigation", "symptom": "成员页入口与四态夹具已有本地证据；状态修改是调用方 expectedStatus 条件写，重复请求收敛，禁用后成员的菜单与深链立即收缩；审计定位、发布与 signed-browser 验收仍未闭环。", "owner": "R6-005"},
  "workbench-admin-menus": {"source": "manifest:0@fbd38c87ab91", "dimension": "journey", "slug": "projection-invalidation", "symptom": "菜单页入口与四态夹具已有本地证据；创建跨刷新读回同一回执，树快照 CAS 只接受一个并发写入，删除按回执收敛且胜者投影到成员会话；发布与 signed-browser 验收仍然开放。", "owner": "R6-007"},
  "workbench-admin-recycle-bin": {"source": "manifest:0@122b1a43b151", "dimension": "journey", "slug": "recycle-bin-lifecycle-surface", "symptom": "回收站已由系统菜单行种子（migration 0072）登记，固定路径与 pageKind 亦已登记，因此 /admin/knowledge/trash 可从治理菜单到达并渲染带保留版本证据的回收列表；恢复与清除是冻结的客户端操作（正文携带操作编号），服务端按 (knowledge_item_id, operationId) 回执回放。保留期、清除权限、跨会话投影、发布与 signed-browser 验收仍未证明。该种子行按与审核菜单相同的 knowledge:review 能力门禁；活跃管理员按 schema 构造必然持有该位，因此拒绝证据是真实种子行上的掩码过滤加 shell 门禁，而不是双管理员夹具。", "owner": "R6-003"},
  "workbench-admin-role-detail": {"source": "manifest:0@920d58a0c066", "dimension": "journey", "slug": "role-detail-edit-registration", "symptom": "角色权限详情路由已登记为能力根、由角色列表解析并复用共享角色控制器，发现、权限编辑、指派确认与写入阻止/重新读取面已有本地覆盖；角色编辑的跨会话投影、真实身份与 signed-browser 验收仍未证明。", "owner": "R6-006"},
  "workbench-admin-role-new": {"source": "manifest:0@a4ac0a7bd452", "dimension": "journey", "slug": "role-creation-route-registration", "symptom": "角色新建路由已登记为能力根、可从治理列表到达并复用共享角色控制器，路由发现、创建表单、写入阻止与重新读取面已有本地覆盖；角色创建的跨会话投影、真实身份与 signed-browser 验收仍未证明。", "owner": "R6-006"},
  "workbench-admin-roles": {"source": "manifest:0@ae50d9406053", "dimension": "isolation", "slug": "role-projection-and-session-hardening", "symptom": "角色页入口与四态夹具已有本地证据；角色列表已拒绝 contributor 与已撤销管理员，伪造/提权 session 在菜单与角色面被稳定拒绝，导航不再向提升掩码泄露管理分组；跨会话角色投影、发布与 signed-browser 验收仍未证明。", "owner": "R6-006"},
  "workbench-admin-spaces": {"source": "manifest:0@67c4c4159e43", "dimension": "journey", "slug": "archive-content-impact", "symptom": "Space 页初始读失败恢复已本地验证；归档与内容影响确认未闭环。", "owner": "R6-008"},
  "workbench-admin-submission-detail": {"source": "manifest:0@ec730e821f69", "dimension": "journey", "slug": "decision-idempotency-and-discovery", "symptom": "审核详情恢复、404/权限状态、对象匹配及导航已本地验证；服务端决策幂等和发布、索引、通知收敛仍待实现。", "owner": "R6-003"},
  "workbench-admin-submissions": {"source": "manifest:0@44b459ad5dc5", "dimension": "journey", "slug": "queue-to-decision-recovery", "symptom": "审核队列读取恢复与详情导航已本地验证；发布、索引、通知的决策闭环和服务端幂等仍待实现。", "owner": "R6-003"},
  "workbench-agent": {"source": "manifest:0@4d692899e183", "dimension": "states", "slug": "cited-completion-and-cancel-recovery", "symptom": "Agent 没有明确空答案状态，引用完成、取消恢复与配额降级未形成完整旅程。", "owner": "R3-016"},
  "workbench-boards": {"source": "manifest:0@bdbe1129d2ea", "dimension": "query_or_idempotency", "slug": "move-concurrency-and-rollback", "symptom": "看板四列 loading/empty/retryable error/ready 夹具已有本地证据；服务端条件写收敛、精确乐观回滚与方向键移动已本地证明；拖拽旅程、发布与 signed-browser 验收仍未闭环。", "owner": "R4-012"},
  "workbench-calendar": {"source": "manifest:0@40587965b020", "dimension": "journey", "slug": "date-navigation-and-timezone-journey", "symptom": "日历范围分页、稳定创建、版本条件取消与只读恢复已有本地证据；编辑 UI、跨模块写入与真实身份原生旅程仍未闭环。", "owner": "R4-016"},
  "workbench-environments": {"source": "manifest:0@477b65a718d2", "dimension": "journey", "slug": "metadata-to-vm-acceptance", "symptom": "环境页私有元数据管理、编号写入回执与明确的“运行时未发布”状态已本地实现；VM 引擎与镜像已按决定移出范围（六个固定产物体积约 66 MiB，仓库 pin 未授予再分发许可，随包发布需要许可证清单与签署发布清单），元数据面的发布与真实身份验收仍未闭环。", "owner": "R8-009"},
  "workbench-focus": {"source": "manifest:0@490b8bb2f9ca", "dimension": "journey", "slug": "session-selection-and-elapsed-time", "symptom": "专注原子写、唯一所属终态历史修复及孤立键重试已有本地证据；歧义历史不自动改写，标签页关闭丢失日志的边界明确，原生验收仍开放。", "owner": "R4-018"},
  "workbench-goals": {"source": "manifest:0@c1a08c049848", "dimension": "journey", "slug": "goal-edit-and-progress-journey", "symptom": "目标缺少数字分页、编辑关联和进度状态完整闭环。", "owner": "R4-014"},
  "workbench-graph": {"source": "manifest:0@b37b0217ead2", "dimension": "journey", "slug": "graph-bounded-projection-and-action-recovery", "symptom": "图谱入口、读取状态与键盘交互已有本地覆盖；游标继续、交叉引用边界和完整动作重放及发布验收仍待闭环。", "owner": "R8-005"},
  "workbench-home": {"source": "manifest:0@edfe01e1ad3d", "dimension": "api", "slug": "authoritative-summary-and-recent-recovery", "symptom": "首页硬编码零指标，recent pending/error 被伪装为 ready/empty，且游标列表无继续入口。", "owner": "R7-010"},
  "workbench-inbox": {"source": "manifest:0@923f12551753", "dimension": "journey", "slug": "capture-to-task-journey", "symptom": "收集箱缺少数字分页、完整归档转任务旅程和过期响应保护。", "owner": "R4-013"},
  "workbench-knowledge": {"source": "manifest:0@edac5a3b202d", "dimension": "states", "slug": "auxiliary-data-recovery", "symptom": "知识页辅助 recent、favorite、note、activity、review 请求失败仍被折叠或彼此割裂。", "owner": "R2-010"},
  "workbench-knowledge-reader": {"source": "manifest:0@5ac9e134c42a", "dimension": "isolation", "slug": "secondary-object-reauthorization", "symptom": "阅读器入口与直接读取状态已有本地证据；私有笔记、分享、收藏回执与按访问身份计数的读取已重新授权并保持成员隔离，陈旧版本冲突与重复撤销收敛已本地证明；衍生生成写入仍无幂等语义；回收/恢复的可逆性现由原始行数证据支撑（trash 只改 knowledge_items.status，笔记、分享、收藏、访问记录、任务关联与研究运行原样保留，笔记 id/updatedAt 不变）；笔记读取在回收窗口内按条目可读性门禁，恢复后同一行返回；收藏移除先以 404 FAVORITE_NOT_FOUND 拒绝再落回执，不会静默删除恢复无法挽回的边。related/backlink/revision 旅程、发布与 signed-browser 验收仍未闭环。", "owner": "R3-012"},
  "workbench-message-thread": {"source": "manifest:0@a71545a92a97", "dimension": "isolation", "slug": "thread-context-revocation", "symptom": "线程页入口与 loading/empty/error/ready 夹具已有本地证据；上下文被拒时呈现明确撤权态而非通用可重试错误，刷新与后退都不再渲染私有消息，上下文入口可深链到规范线程路由；发布与 signed-browser 验收仍然开放。", "owner": "R5-011"},
  "workbench-messages": {"source": "manifest:0@eec9cce3211d", "dimension": "isolation", "slug": "context-revocation-presentation", "symptom": "消息入口与 loading/empty/error/ready 夹具已有本地证据；上下文撤权后 thread 从列表收缩、直达被拒，页面呈现明确可恢复的撤权态而非错误或空态；发布与 signed-browser 验收仍未闭环。", "owner": "R5-011"},
  "workbench-my-submissions": {"source": "manifest:0@3becacfabe04", "dimension": "journey", "slug": "resubmission-and-status-recovery", "symptom": "我的提交已接入重提与草稿/评论/目标读取面：重提跨重试与刷新复用同一提交幂等键；成员侧评论 POST 刻意不接线，因为只有 /api/admin 下有操作回执端点，重试可能重复评论，成员视图保持只读。完整状态恢复旅程、发布与 signed-browser 验收仍未闭环。", "owner": "R3-001"},
  "workbench-notifications": {"source": "manifest:0@807eb6afccdc", "dimension": "isolation", "slug": "revoked-target-navigation", "symptom": "通知入口与 loading/empty/error/ready 夹具已有本地证据；打开已撤权目标仍提交已读并脱敏返回，未读总数收敛且页面呈现明确撤权态；发布与 signed-browser 验收仍然开放。", "owner": "R5-005"},
  "workbench-project-timeline": {"source": "manifest:0@68e19ea2dd4d", "dimension": "journey", "slug": "timeline-edit-and-project-switch", "symptom": "项目时间线缺少数字分页、跨项目旧响应保护及完整编辑旅程。", "owner": "R4-036"},
  "workbench-projects": {"source": "manifest:0@17cb110cdd89", "dimension": "journey", "slug": "project-relationship-and-summary-recovery", "symptom": "项目缺少数字分页、关联编辑、独立摘要恢复和过期响应保护。", "owner": "R4-015"},
  "workbench-review": {"source": "manifest:0@0938a4a68c88", "dimension": "journey", "slug": "period-filter-and-refresh-semantics", "symptom": "复盘 UTC 日/ISO 周聚合、全量任务计数、显式刷新、原子周期快照及并发回滚已有本地证据；这是有界当前态投影，真实身份原生旅程和发布验收仍开放。", "owner": "R4-019"},
  "workbench-search": {"source": "manifest:0@425b859782bc", "dimension": "journey", "slug": "filter-restore-and-result-open", "symptom": "搜索降级、筛选恢复和打开结果的端到端旅程仍不完整。", "owner": "R3-014"},
  "workbench-settings": {"source": "manifest:0@5e57e601f4cd", "dimension": "states", "slug": "persisted-settings-boundary", "symptom": "设置页没有路由级异步状态、持久化或保存 pending 边界。", "owner": "R1-012"},
  "workbench-submit": { "source": "manifest:0@fb2c7e57f268", "dimension": "evidence", "slug": "signed-submission-acceptance", "symptom": "本地提交、pending、失败重试、成功及 submitter 幂等已证明；成员提交闭环新增草稿、URL 取件与替代文件面：草稿更新按所有者与草稿状态条件写、重放同一载荷收敛，URL 取件与替代提交按幂等键回放原记录；草稿创建没有服务端键（idempotency_key 为 NULL，提交者唯一索引无法去重），只能靠客户端日志与最新草稿回读收敛；成员侧标签选择器刻意不接线（提交/草稿/重提载荷不接受 tagIds，标签在发布时附加）。丢弃采用 DELETE：API 仍拒绝空或缺字段的草稿正文（m1-api 回归测试），不会把它读成丢弃意图，本次排除不改变草稿创建仍是缺口这一结论。发布与 signed-browser 验收仍缺失。", "owner": "R8-009" },
  "workbench-tasks": {"source": "manifest:0@841ec94adf5e", "dimension": "isolation", "slug": "revocation-and-mutation-convergence", "symptom": "当前许可/撤权投影、禁止直达与四态夹具已有本地证据；详情更新必须携带已读版本，删除以版本条件 tombstone 回执收敛，子任务/依赖/关联/进度/标签操作已在共享编辑器入口绑定幂等或条件写证据；入口级删除控件、回收站模型、发布与 signed-browser 验收仍未闭环。", "owner": "R4-012"},
  "workbench-today": {"source": "manifest:0@82df5d7acce3", "dimension": "journey", "slug": "bounded-summary-drilldown", "symptom": "今日摘要已有有界计数说明、继续入口、重新授权详情、深层契约校验与整份失败只读恢复；完整跨日聚合及原生旅程证明仍待完成。", "owner": "R4-017"},
}));
const DOMAIN_GAP_POLICIES = new Map(Object.entries({
  "workbench-admin-assets|POST /api/admin/assets/:id/retry": { slug: "retry-asset", symptom: "资产解析重试缺少稳定幂等键与重复任务抑制证明。", owner: "R6-004" },
  "workbench-admin-spaces|POST /api/admin/tags": {"slug": "create-admin-tag", "symptom": "标签创建没有客户端键或回执：响应丢失后重试会在同一 Space 的 slug 唯一键上冲突并返回 409 TAG_SLUG_CONFLICT，面板把它作为真实冲突呈现并要求显式重新读取，而不是回放已创建的标签。", "owner": "R6-008"},
  "workbench-admin-spaces|POST /api/admin/collections": { slug: "create-collection", symptom: "集合创建已有同编辑器稳定键及持久化回执；刷新或卸载后的意图恢复及无键旧客户端策略仍缺。", owner: "R6-008" },
  "workbench-admin-spaces|POST /api/admin/spaces": { slug: "create-space", symptom: "创建 Space 缺少稳定幂等键和重放策略。", owner: "R6-008" },
  "workbench-admin-spaces|PATCH /api/admin/collections/:id": { slug: "update-collection", symptom: "集合编辑已有本地版本冲突保护；未知意图跨卸载恢复及旧客户端版本必填策略仍缺。", owner: "R6-008" },
  "workbench-admin-spaces|PATCH /api/admin/spaces/:id": { slug: "update-space", symptom: "Space 编辑已有本地版本冲突保护；未知意图跨卸载恢复及旧客户端版本必填策略仍缺。", owner: "R6-008" },
  "workbench-admin-submission-detail|PUT /api/admin/submissions/:id/comments/requests/:id": { slug: "add-review-comment", symptom: "审核评论唯一编号、同编号重试和精确回执已有本地会话证据；跨刷新恢复及发布验收仍开放。", owner: "R6-003" },
  "workbench-admin-submission-detail|PATCH /api/admin/reparse-jobs/:id/candidate": { slug: "correct-reparse-candidate", symptom: "重复候选改写是盲值写入：只有 job 状态与管理员存在性谓词，没有操作编号或预期版本，两个并发改写都会落盘，响应丢失重试会再写一次。", owner: "R6-003" },
  "workbench-admin-submission-detail|POST /api/admin/submissions/:id/publish": { slug: "publish-submission", symptom: "发布决策缺少不可变 Revision 的重放收敛证明。", owner: "R6-003" },
  "workbench-admin-submission-detail|POST /api/admin/submissions/:id/reject": { slug: "reject-submission", symptom: "拒绝决策缺少幂等重放与并发冲突策略。", owner: "R6-003" },
  "workbench-admin-submission-detail|POST /api/admin/submissions/:id/request-revision": { slug: "request-revision", symptom: "退回修改决策缺少幂等、通知去重与并发策略。", owner: "R6-003" },
  "workbench-admin-submission-detail|PATCH /api/admin/knowledge/:id/revisions/:rev/chunks/:id/status": { slug: "set-chunk-status", symptom: "分块状态更新是盲值写入：只有 revision 与管理员存在性谓词，没有操作编号或预期版本，重试会重写同一分块与其 FTS 行，不留回执。", owner: "R6-003" },
  "workbench-admin-submissions|POST /api/admin/submissions/batch-review": { slug: "batch-review", symptom: "批量审核信封本身没有身份，条目各自独立执行；未同时携带 operationId 与 expectedUpdatedAt 的条目刻意不受保护，重试会重新应用这些条目。", owner: "R6-003" },
  "workbench-admin-submissions|POST /api/admin/submissions/:id/publish": { slug: "publish-submission", symptom: "审核队列发布操作缺少不可变 Revision 的重放收敛证明。", owner: "R6-003" },
  "workbench-admin-submissions|POST /api/admin/submissions/:id/reject": { slug: "reject-submission", symptom: "审核队列拒绝操作缺少幂等重放与并发冲突策略。", owner: "R6-003" },
  "workbench-admin-submissions|POST /api/admin/submissions/:id/request-revision": { slug: "request-revision", symptom: "审核队列退回操作缺少幂等、通知去重与并发策略。", owner: "R6-003" },
  "workbench-agent|POST /api/knowledge/chat/conversations/:id/cancel": { slug: "cancel-conversation", symptom: "取消 Agent 会话缺少重复请求与终态收敛证明。", owner: "R3-016" },
  "workbench-agent|PATCH /api/knowledge/chat/conversations/:id/scope": { slug: "update-conversation-scope", symptom: "Agent 会话范围更新缺少条件写入与撤权后收敛策略。", owner: "R3-016" },
  "workbench-environments|POST /api/environments": { slug: "create-environment", symptom: "环境创建已有本地编号重试与版本回执证据；跨刷新未知结果恢复和完整运行时验收仍开放。", owner: "R8-005" },
  "workbench-environments|DELETE /api/environments/:id": { slug: "delete-environment", symptom: "环境删除已有本地编号重试与版本回执证据；跨刷新未知结果恢复和完整运行时验收仍开放。", owner: "R8-005" },
  "workbench-environments|PATCH /api/environments/:id": { slug: "rename-environment", symptom: "环境重命名已有本地编号重试与版本回执证据；跨刷新未知结果恢复和完整运行时验收仍开放。", owner: "R8-005" },
  "workbench-graph|POST /api/tasks": { slug: "create-task", symptom: "图谱创建任务缺少完整动作重放与响应丢失收敛证明。", owner: "R8-005" },
  "workbench-graph|POST /api/projects/:id/timeline": { slug: "create-timeline-item", symptom: "图谱创建时间线项缺少完整动作重放与重复结果抑制证明。", owner: "R8-005" },
  "workbench-graph|POST /api/focus": { slug: "start-focus", symptom: "图谱启动专注缺少完整动作重放与并发收敛证明。", owner: "R8-005" },
  "workbench-inbox|DELETE /api/tasks/:id": { slug: "target-delete-task", symptom: "该操作在 HTTP 边界与列表入口已有 tombstone 回执收敛证据，但从收集箱打开的共享任务编辑器没有删除控件，本入口无法发起删除；回收站/恢复/保留期模型仍未批准，因此该入口绑定保持开放。", owner: "R4-010" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/research-runs/:runId/approve": { slug: "approve-research-run", symptom: "研究运行审批为读后写，缺少预期运行状态或重放键。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/research-runs/:runId/cancel": { slug: "cancel-research-run", symptom: "研究运行取消为读后写，缺少预期运行状态或重放键。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/research-runs/:runId/draft": { slug: "create-research-draft", symptom: "研究草稿写入没有幂等键，只能靠冻结请求日志恢复。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/brief": { slug: "generate-brief", symptom: "brief 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/comparison": { slug: "generate-comparison", symptom: "comparison 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/faq": { slug: "generate-faq", symptom: "faq 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/flashcards": { slug: "generate-flashcards", symptom: "flashcards 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/mindmap": { slug: "generate-mindmap", symptom: "mindmap 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/quiz": { slug: "generate-quiz", symptom: "quiz 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/report": { slug: "generate-report", symptom: "报告生成绑定研究运行且是非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/summary": { slug: "generate-summary", symptom: "summary 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/timeline": { slug: "generate-timeline", symptom: "timeline 衍生生成是前端可达的非幂等写入，重放与未知结果收敛语义未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/research-runs/:runId/pause": { slug: "pause-research-run", symptom: "研究运行暂停为读后写，缺少预期运行状态或重放键。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/research-runs/:runId/queries": { slug: "record-research-query", symptom: "研究查询记录为非幂等追加，缺少稳定客户端键。", owner: "R3-011" },
  "workbench-knowledge-reader|DELETE /api/knowledge/:id/favorite": { slug: "remove-favorite", symptom: "取消收藏已先按条目可读性门禁（未先申请回执即 404 FAVORITE_NOT_FOUND），同编号重放已本地证明；跨刷新未知结果恢复与真实身份验收仍未证明。", owner: "R3-011" },
  "workbench-knowledge-reader|POST /api/knowledge/:id/research-runs": { slug: "start-research-run", symptom: "研究运行启动为读后写，缺少稳定客户端键与预期状态约束。", owner: "R3-011" },
  "workbench-submit|POST /api/submissions/drafts": { slug: "create-submission-draft", symptom: "草稿创建没有服务端幂等键：idempotency_key 写入 NULL，提交者唯一索引无法去重，响应丢失或并发重复会插入第二条草稿；只有客户端日志与成员最新草稿回读能在重试前收敛。", owner: "R3-001" },
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

test("environment inventory does not promote metadata management to VM acceptance", () => {
  const { maturity } = loadContracts();
  const record = maturity.find(item => item.id === "workbench-environments");
  assert.ok(record, "the visible environments entry must be inventoried");
  assert.equal(record.classification, "partial");
  assert.equal(record.dimensions.get("journey"), "gap");
  assert.equal(record.dimensions.get("evidence"), "gap");
  assert.ok(record.gaps.some(gap => gap.includes("out of scope by decision")));
  assert.ok(record.gaps.some(gap => gap.includes("real-identity acceptance of the metadata surface remain open")));
  assert.ok(record.testEvidence.includes("scripts/browser-vm-environments-page.test.mjs"));
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
      assert.ok(sourceRoute, `${record.id} has an unknown page-kind routeId`);
      assert.equal(record.routePattern, sourceRoute.routePattern, `${record.id} routePattern must match frontend/app-routes.ts`);
      assert.ok(record.parentRouteId && routesById.has(record.parentRouteId), `${record.id} page-kind route requires a menu parentRouteId`);
      if (sourceRoute.staticPath === undefined) {
        const parentPath = routesById.get(record.parentRouteId).path;
        const parentArea = parentPath.split("/").filter(Boolean)[0];
        assert.ok(record.pathname.startsWith(`/${parentArea}/`), `${record.id} pathname must stay inside its parent's route area`);
        assert.equal((record.pathname.match(/:id/gu) ?? []).length, 1, `${record.id} pathname must declare exactly one :id placeholder`);
      } else {
        assert.equal(record.pathname, sourceRoute.staticPath, `${record.id} static route pathname must equal its literal branch path`);
      }
      const pattern = new RegExp(sourceRoute.routePattern.slice(1, sourceRoute.routePattern.lastIndexOf("/")), "u");
      assert.ok(pattern.test(record.pathname.replace(":id", "route-audit-1")), `${record.id} pathname must resolve through its source route`);
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

test("gap summary counts are derived from the actual current matrix", () => {
  const markdown = readFileSync(maturityGapMatrixPath, "utf8");
  const rows = gapMatrixRows(markdown);
  const summary = markdown.slice(markdown.indexOf("## 分派汇总"));
  const expected = {
    "manifest 聚合 gap": rows.filter(row => row.source.startsWith("manifest:")).length,
    "domain mutation-safety gap": rows.filter(row => row.source.startsWith("domain:")).length,
    "总计": rows.length,
    "P0": rows.filter(row => row.priority === "P0").length,
    "P1": rows.filter(row => row.priority === "P1").length,
    "P2": rows.filter(row => row.priority === "P2").length,
  };
  for (const [label, count] of Object.entries(expected)) {
    const line = summary.split("\n").find(line => line.startsWith(`| ${label} |`));
    assert.ok(line, `${label} summary row is required`);
    assert.equal(Number(line.split("|")[2].trim()), count, `${label} summary count drifted`);
  }
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
  const policy = DOMAIN_GAP_POLICIES.get(`${capability}|${operation}`);
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
    else domainOperations.push(`${key.slice(0, separator)}|${key.slice(separator + "|domain:".length)}`);
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
    "workbench-inbox", "workbench-goals", "workbench-projects", "workbench-calendar", "workbench-focus", "workbench-review", "workbench-project-timeline",
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
      parameterizedRoutes: pageKindRouteRecords(sourceFile(snapshot, appRoutesPath)),
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

function pageKindRouteRecords(source) {
  const declarations = [];
  const visit = (node) => {
    if (isFunctionDeclaration(node) && node.name?.text === "pageKindForPath") declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, "frontend/app-routes.ts must declare pageKindForPath exactly once");
  assert.ok(declarations[0].body, "pageKindForPath body is required");
  return declarations[0].body.statements.filter(isIfStatement).map((statement, index) => pageKindRouteRecord(statement, index));
}

// Every branch of pageKindForPath names exactly one route identity: a parameterised
// regex matcher whose pathname is the parent-owned template, or an exact pathname
// equality whose literal path is the route's own static pathname.
function pageKindRouteRecord(statement, index) {
  const context = `page-kind route ${index}`;
  assert.ok(isReturnStatement(statement.thenStatement) && isStringLiteral(statement.thenStatement.expression), `${context} must return a string route identity`);
  const routeId = statement.thenStatement.expression.text;
  const condition = statement.expression;
  if (!isBinaryExpression(condition)) {
    assert.ok(isCallExpression(condition), `${context} condition must call RegExp.test or compare pathname exactly`);
    assert.ok(isPropertyAccessExpression(condition.expression), `${context} condition must access RegExp.test`);
    assert.equal(condition.expression.name.text, "test", `${context} condition must call RegExp.test`);
    assert.ok(isRegularExpressionLiteral(condition.expression.expression), `${context} matcher must be a regex literal`);
    assert.equal(condition.arguments.length, 1, `${context} matcher must receive pathname once`);
    assert.ok(isIdentifier(condition.arguments[0]) && condition.arguments[0].text === "pathname", `${context} matcher must receive pathname`);
    return { routeId, routePattern: condition.expression.expression.getText() };
  }
  assert.equal(condition.operatorToken.getText(), "===", `${context} static route must compare pathname exactly`);
  assert.ok(isIdentifier(condition.left) && condition.left.text === "pathname", `${context} static route must compare pathname`);
  assert.ok(isStringLiteral(condition.right) && condition.right.text.startsWith("/"), `${context} static route must compare an absolute pathname`);
  const staticPath = condition.right.text;
  return { routeId, routePattern: `/^${staticPath.replace(/[.*+?^${}()|[\]\\/]/gu, (character) => `\\${character}`)}$/u`, staticPath };
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
