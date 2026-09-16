# D02-R2-A 审核重放契约 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, one checked step at a time.

**Goal:** 使驳回/退回的首次响应与持久化重放完全一致，并证明并发、响应丢失、冲突和权限边界。

**Architecture:** 复用现有 review、D1 batch 与 exactDecisionOrThrow。修复首次响应的 visibility，并补齐初次查询与预览之间并发提交的权威重读，不引入另一套幂等存储。

**Tech Stack:** TypeScript、Vitest Workers、Cloudflare D1。

**Spec:** `docs/superpowers/specs/2026-09-16-admin-review-write-recovery-design.md`，用户于 2026-09-16 确认书面设计。

## Global Constraints

- 在现有 `codex/admin-audit-recovery` 隔离工作区顺序执行；无新依赖、迁移、生产配置、远程操作。
- 先观察回归失败，再修改业务代码；真实 D1 事务，不用 mock 替代持久化。
- 只交付 A，不将 B/C/D、真实浏览器或生产验收标记完成。

## Task 1：首次响应与重建重放

- [x] 在 `test/worker/m1-publication.test.ts` 增加两种决定 × 两种可见性的 `it.each`。
- [x] 首次返回值断言包含全部 ReviewDecision 字段；新建 repository/service 再调用，使用 `expect(replay).toEqual(first)`，检查一条 review、一条 audit、对应终态、没有发布意图/版本。
- [x] 执行 `rtk proxy npx --no-install vitest run test/worker/m1-publication.test.ts -t 'returns the persisted decision'`，确认 shared 的两个用例因 visibility 失败。
- [x] 在 `src/publication/repository.ts` 的 decide 将 `visibility: "admin_only"` 改为 `visibility: preview.requestedVisibility`；整组回归包含上述四项并确认绿灯。

## Task 2：重试、竞争、鉴权

- [x] 在同一 Worker 测试文件增加相同规范化载荷的并发请求，独立 service 返回同一完整结果且仅一次副作用。
- [x] 复核发现读窗口竞争，新增两种决定 × 同载荷/改说明四项确定性调度用例；先观察同载荷误报冲突，再在非待审预览分支重读权威审核，精确匹配后重放。
- [x] 用 Proxy 仅代理 D1 batch 返回：真实提交后抛出响应丢失错误；验证恢复返回权威记录，重建 service 重试不重复写入。
- [x] 参数化更改审核人、决定、原因、说明，期望 `REVIEW_STATE_CONFLICT`，原 review/audit/status 不变。审核人变更采用单活动管理员交接夹具。
- [x] 增加不同决定并发竞争，恰有一个成功、另一个冲突，终态和唯一记录匹配胜出结果。
- [x] 验证普通成员及禁用管理员在首次写入和已有记录重放时均为 `FORBIDDEN`，无副作用。

## Task 3：验证、证据、提交

- [x] 执行 `rtk proxy npx --no-install vitest run test/unit/publication-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-api.test.ts`（162 项通过）。
- [x] 执行 `rtk proxy npm run typecheck`、`rtk proxy npm run verify:delivery-status`（28 项通过）、`rtk proxy git diff --check`。
- [x] 写入 `docs/product/2026-09-16-admin-review-replay-contract-evidence.md`；同步 spec、ROADMAP、completion-audit、maturity-checklist、delivery-status-ledger，只关闭 A。
- [x] 完成自查与只读代码复核，处理读窗口竞争 P2；计划和证据随本批显式路径本地提交，不推送、不部署、不合并。下一批为 B 的前端权威结果/说明/手动重试。
