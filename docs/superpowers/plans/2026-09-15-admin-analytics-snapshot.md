# D01-B2 统计事务快照与写后对账 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the existing isolated worktree. No delegation, merge, push or deploy. Steps use checkboxes.

**Goal:** overview 的汇总、趋势、分类、数字页来自同一读取事务；后续请求能对账已完成的写入。

**Architecture:** 用一次 `DB.batch` 包含六个 SELECT，分页 total 复用同批次的总 PV，避免重复 COUNT。保留现有 GET 协议和分页语义：每次请求读取最新数据，而不是持有跨请求快照；前端整份替换成功结果。

**Tech Stack:** Cloudflare D1、TypeScript、Vitest Worker、React DOM 测试。

**Spec:** `docs/product/2026-09-12-personal-workbench-completion-audit.md` D01-B2；前置 `e05e2d6` D01-B1。

## Global Constraints

- 不引入 Cloudflare 新服务、依赖、迁移、后台轮询、持久化快照或生产接口；保留管理员授权及访客脱敏。
- 日期为 1–31 个 UTC 自然日；数字页 20/50/100，offset 小于 10000。总 UV 跨日去重，不能等于每日 UV 简单相加。
- 事务只保证一次响应内一致；不同请求之间发生写入时 total 和页边界可以变化，不能拼接旧页冒充无重复快照。
- D01 的真实登录、设备及发布验收不由本地测试替代。

## Task 1：服务端事务读取

**Files:** `src/analytics/repository.ts`、`test/worker/analytics.test.ts`、`test/fixtures/analytics-interleaving.ts`。

- [x] 在真实 D1 外仅包装请求边界，在首个数据库读取完成后插入新事件；断言 overview 仍完整反映写入前的数据，随后请求反映写入后数据。
  ```ts
  expect(snapshot.totals.pageViews).toBe(1);
  expect(snapshot.daily[0].pageViews).toBe(1);
  expect(snapshot.recentVisitors.pagination.total).toBe(1);
  ```
- [x] 跑 Worker 测试，确认旧 Promise.all 实现因混合结果失败，不是 fixture 异常。
- [x] 改为单次 batch；六个结果必须 success、results 为对象数组，totals 恰为一行，分页 total 为非负安全整数，选中行数与 total/offset/pageSize 匹配，否则抛出 `ANALYTICS_RESULT_INVALID`。
  ```ts
  const results = await this.db.batch<Record<string, unknown>>(statements);
  const paginationResult = buildPageMetadata(pagination, total.page_views);
  ```
- [x] 增加真实 API 写后两页重读、重复采集不加总、范围外记录不进入、最后一页移除后空页的对账；模拟 batch 拒绝和错误结果，确保不返回伪零。
- [x] 跑定向 Worker 回归，保留原权限/UTC/分页/UV 测试。

## Task 2：客户端响应内对账

**Files:** `frontend/lib/admin-analytics-data.ts`、`test/unit/frontend-admin-analytics-data.test.ts`、`test/unit/frontend-admin-analytics-route.test.tsx`。

- [x] 写 RED：total PV 与分页 total 不同、每日 PV 之和不同或日期重复时 reject。不要对 UV 强加跨日求和相等。
  ```ts
  await expect(loadAdminAnalytics(input, requester)).rejects.toThrow('ANALYTICS_INVALID');
  ```
- [x] 解析完成后校验上述同快照恒等式；保留 B1 整份替换、错误重试和旧结果提示。
- [x] 增加实际 controller 的已加载第二页→刷新后新增访问、失败仍显示旧 total、重试后整体替换的回归；运行定向测试。

## Task 3：证据与交付

**Files:** README、ROADMAP、completion audit、delivery ledger、B2 evidence、maturity registry/matrix/contracts、独立 B2 domain snapshot。

- [x] 跑 `npm test`、默认/landing typecheck、`verify:landing`、成熟度/domain/交付合同及 domain audit check。
- [x] 同步 B2 本地实现和真实验收边界；不改历史 B1 快照，不提升 release/acceptance。
- [x] `git diff --check`，核对精确文件，本地提交；保留分支/工作区，不推送部署。
