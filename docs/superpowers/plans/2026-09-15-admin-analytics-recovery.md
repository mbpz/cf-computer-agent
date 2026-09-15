# D01-B1 站点统计读取恢复 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the existing isolated worktree. No delegation, merge, push or deploy required. Track steps with checkboxes.

**Goal:** 让站点统计初始失败可恢复，日期/分页查询与显示数据一致，异常载荷不伪装为零。

**Architecture:** 保持现有 overview GET、React controller 和 shadcn 页面；请求状态绑定完整 days/page/pageSize，复用 numbered controller 的取消与代次校验。严格验证响应范围和计数，不引入缓存、自动轮询或新的服务。

**Tech Stack:** React、TypeScript、Vitest/Happy DOM、现有 D1 API。

**Spec:** `docs/product/2026-09-12-personal-workbench-completion-audit.md` D01-B。B1 仅覆盖读取；B2 的服务端多查询一致性及写后对账保持未完成。

## Global Constraints

- 保持现有管理权限边界，不新增服务、迁移或依赖；不访问生产、AI 或远程数据库。
- 日期沿用后端 1–31 个 UTC 自然日契约；默认快捷项 7/14/30，其他合法 URL 天数必须正确展示。
- 完整数字分页沿用 20/50/100 和最大 offset 10000 限制；日期/每页条数改变回第一页。
- 保留旧页只允许相同日期范围，且明确标为旧结果；新日期范围不得显示旧汇总；401/403 清除敏感数据。
- 历史审计保留。B1 不意味着 D01、R6 或真实登录/设备/生产验收完成。

## Task 1：实际 controller 查询与恢复

**Files:** `frontend/app.tsx`、`frontend/pages/admin/analytics-page.tsx`、`frontend/lib/i18n.ts`、`test/unit/frontend-admin-analytics-route.test.tsx`。

- [x] 写 RED：初始错误点击重试重新请求原 days/page/pageSize；重复刷新仅一次；30 天请求 pending/失败不得保留 7 天数据；URL days=1 正确显示；卸载取消；拒绝访问清除旧访客。
  ```tsx
  expect(container.querySelector('[data-analytics-retry]')).not.toBeNull();
  expect(container.textContent).not.toContain('/old-seven-day-visitor');
  ```
- [x] 跑 `vitest run test/unit/frontend-admin-analytics-route.test.tsx`，记录缺口失败。
- [x] 增加同步 pending 锁，effect 每代创建/清理 controller；完整查询 ref 在导航事件立即更新，迟到结果必须同时匹配查询和代次。
  ```ts
  if (!controller.isCurrent(request.generation) || !sameQuery(snapshot, queryRef.current)) return;
  ```
- [x] 页面添加初始/局部错误重试和 UTC 范围标签；日期变更清除旧范围数据；刷新 pending 禁用，分页旧数据显式提示；保留非快捷合法天数 option。
- [x] 运行已有及新增 controller 测试为绿色。

## Task 2：读取边界与 D1 日期证据

**Files:** `frontend/lib/admin-analytics-data.ts`、`test/unit/frontend-admin-analytics-data.test.ts`、`test/worker/analytics.test.ts`。

- [x] 写 RED：数字为负数/小数/字符串，非法日期，响应 days/page/pageSize 与请求不同，缺失 breakdown 或异常 daily，必须 reject，不返回 0/空数组。
  ```ts
  await expect(loadAdminAnalytics(input, requester)).rejects.toThrow('ANALYTICS_INVALID');
  ```
- [x] 保留 `normalizeNumberedPage` 严格验证，新增非负安全整数、真实日期及响应请求匹配校验。不得把服务端尚未保证的跨查询快照假设写成必然一致。
- [x] D1 实测 7/14/30 天、跨页 total、区间 PV 与去重 UV 不同，以及 UTC 起止边界；不增加生产写接口。
- [x] 定向 loader/controller/Worker 回归通过。

## Task 3：交付边界与最终验证

**Files:** README、ROADMAP、完成审计、独立 B1 evidence、交付总账；若成熟度事实变更，更新源绑定和新的快照，不篡改历史。

- [x] 运行完整 `npm test`、`npm run typecheck`、`npm run typecheck:landing`、`npm run verify:landing`、成熟度/domain/交付合同。
- [x] 同步 B1 已实现、B2 未完成及无真实浏览器/发布验收；记录测试数字与所有限制。
- [x] `git diff --check`；核对本轮精确文件并本地提交，保留当前分支与工作区。
