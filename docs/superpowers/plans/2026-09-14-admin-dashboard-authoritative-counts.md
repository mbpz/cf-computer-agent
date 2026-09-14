# D01-A 管理概览权威计数 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Continue in the existing isolated worktree; no delegation, merge, push, or deploy is required.

**Goal:** 用已授权的服务端数字分页总数替换管理概览的写死零值，并实现可恢复的读取旅程。

**Architecture:** 复用 `loadReviewQueuePage`、`loadAdminAssets`、`loadAdminMembers`，每项只请求第一页 20 行并读取严格校验后的 `pagination.total`。三项独立展示加载、零值、成功、失败及无权限状态；不引入新统计表、后台定时任务或 Worker 服务。

**Tech Stack:** React、现有 shadcn Card/Button、TypeScript、Vitest/Happy DOM、现有 D1 数字分页接口。

**Spec:** `docs/product/2026-09-12-personal-workbench-completion-audit.md` D01；本计划只完成概览部分，站点统计日期范围/分页对账为 D01-B。

## Global Constraints

- 全部使用 Cloudflare 免费产品；本批没有新增服务、迁移、依赖或生产访问。
- 复用真实路由 capability 判定，服务端依旧是授权边界；不依据 admin 字样猜权限，不读取其他用户私有工作台数据。
- 只读 GET 可手动重试；不引入副作用、自动轮询或浏览器持久化统计缓存。
- 待审核 = `review_pending`；资产 = 未按状态筛选的资产队列（assets JOIN parse_jobs）；成员 = 全部 active/disabled。
- 三个总数是独立接口读取结果，不承诺跨接口同一事务快照，也不受站点访问日期筛选影响。
- 日期范围、站点统计刷新初始失败恢复和真实登录/设备验收不在 D01-A 完成声明内。

## Task 1：真实 App 计数和错误旅程

**Files:** 新增 `test/unit/frontend-admin-dashboard-route.test.tsx`，复用 `test/helpers/authenticated-app-harness.tsx`。

- [x] 写实际 App 回归：20 行 / total 47 显示 47；三条 GET 精确 page=1/pageSize=20，只有审核带 review_pending；不自动追踪其他页。
- [x] 验证 loading 不出现计数；真实零值保留显式 empty；一个接口失败不隐藏其余卡片，重试只重新请求失败卡。
- [x] 验证重复点击刷新/重试仅发一轮，离开页面取消请求，忽略旧响应；403 不显示旧计数，撤销 capability 不调用对应接口/显示入口。
- [x] 运行 `vitest run test/unit/frontend-admin-dashboard-route.test.tsx`，确认失败源自原页面没有真实计数与读取状态。

接口断言示例：
```ts
expect(container.querySelector('[data-dashboard-metric="pending"] [data-metric-value]')?.textContent).toBe("47");
expect(requests).toContain("/api/admin/submissions?page=1&pageSize=20&status=review_pending");
```

## Task 2：最小实现和绿色回归

**Files:** 新增 `frontend/pages/admin/admin-dashboard-route.tsx`；修改 `frontend/pages/admin/admin-dashboard-page.tsx`、`frontend/app.tsx`、`frontend/lib/i18n.ts`。

**Interfaces:** `AdminDashboardRoute({locale, session})`；`AdminDashboardPage({locale, metrics, onRetry, onRefresh, links})`。每项状态 `loading | ready(total) | error | forbidden`，请求函数复用现有 loader，不自建宽松的数字规范化器。

- [x] 用 `routeAccessAllowed` 为三卡和快捷入口分别授权；controller 对各卡使用 AbortController、request identity 和同步 pending 锁。
- [x] Promise 成功只读取 `page.pagination.total`；失败仅落该卡 error，401/403 落 forbidden；cleanup abort 所有请求并阻止迟到响应写 state。
- [x] 复用 Card/Button、明确计数口径、中英文 loading/empty/error/forbidden 文案；刷新时清除旧数，按钮 pending 禁用。
- [x] 改 App admin 分支挂载真实 route；按成员/权限投影 key 隔离会话状态；适配已有静态页面测试。
- [x] 运行 Task 1 及原 dashboard 测试为绿色。

核心读取：
```ts
const page = await loadReviewQueuePage({page: 1, pageSize: 20, signal});
const total = page.pagination.total;
```

## Task 3：合同、服务端证据和交付边界

**Files:** `test/helpers/workbench-maturity-route-fixtures.ts`、`test/unit/frontend-workbench-maturity-routes.test.tsx`、`shared/workbench-maturity-capabilities.ts`、`scripts/workbench-maturity-contract.test.mjs`；ROADMAP、完成审计、gap matrix/checklist 和独立证据。

- [x] admin 从 static gap 改为实际四态 probe，ready 断言响应计数；记录真实三个 API 和持久化来源，移除硬编码零的过期 gap 描述但维持 partial。
- [x] 新增/复用真实 Worker 分页总数及权限用例，确保总数不是 page length；分页列表仍使用现有 COUNT 和 rows 同一批查询契约。
- [x] 同步新指纹和对应主责条目，保留历史审计快照；生成新的 D01-A domain 快照并验证确定性。
- [x] 运行定向 runtime/Worker、成熟度/domain/交付合同、完整 `npm test`、类型检查和 `verify:landing`。
- [x] 记录证据及未完成的 D01-B/真实浏览器验收；检查 diff 后本地提交。

自检：本计划仅交付 D01-A 可独立验收的软件；D01 总项维持未完成，不把计数接入当成站点统计日期范围已完成。
