# D02-R2-D 审核故障矩阵与验收收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 A/B/C 的跨层恢复与隔离要求映射到可复跑的证据，补齐未覆盖的故障组合，并明确真实交互验收边界。

**Architecture:** 复用真实本地 D1、Durable Object、HTTP 会话和现有 React 测试。故障仅注入测试边界，不增加生产测试开关、依赖、迁移或服务；本批优先补测试，发现行为缺陷才按红绿测试修复。

**Tech Stack:** TypeScript、Vitest、Cloudflare Workerd/D1/DO、React。

**Spec:** `docs/superpowers/specs/2026-09-16-admin-review-write-recovery-design.md` 的 D 批。

## Global Constraints

- 仅使用项目现有 Cloudflare 服务，不增加收费服务、外部队列或新依赖；本阶段不修改生产配置或执行远程迁移。
- 保留现有分页协议、权限检查、私有成员隔离和审计脱敏。审核人由认证主体确定，不能由请求指定。
- 本地实现、本地自动化、提交、部署、真实登录验收分别记录；任一子项通过不自动关闭 D02/R6-003/ADM-002。
- 沿用 `codex/admin-audit-recovery`。C 批尚未提交，保留全部改动；D 新增文件及测试由本计划标识，不自动推送/合并。

## Task 1: 故障后持久化一致性

**Files:** Modify `test/worker/m1-publication.test.ts`。

**Interfaces:** 消费 `PublicationService.publish/recoverPending`、`PublicationRepository.finalize` 与 `publicationState(submissionId)`；产出真实 D1/DO 断言，不改生产接口。

- [x] 核对并运行现有三文件基线：`vitest run test/worker/m1-publication.test.ts test/worker/m1-api.test.ts test/worker/notifications.test.ts`。143 passed。
- [x] 为发布并发、发布与驳回竞争、DO 回执丢失、最终条件失败补通知数量断言。应有决定时为 1，事务未落地时为 0；不能仅断言审核表。
- [x] 新增最终发布 D1 batch 已成功但响应抛错的测试：预先推进 intent 至 content_written，仅代理真实 `batch` 返回边界。

```ts
const result = await target.batch(statements);
if (!responseLost) { responseLost = true; throw new Error("Lost committed finalize response"); }
return result;
// finalize 自动权威重读，重建 service 后重放/索引恢复；通知整行不变。
expect(await publicationState(submissionId)).toMatchObject({
  submissionStatus: "published", revisionCount: 1, reviewCount: 1,
  auditCount: 1, notificationCount: 1,
});
```

- [x] 对新增断言做缺失通知副作用的临时 mutation 检查：3 failed，均为通知期望 1 实际 0；已恢复原生产行，联合回归通过。测试已有行为不伪称首次红绿实现。

## Task 2: HTTP 审核到通知的三身份闭环

**Files:** Modify `test/worker/m1-api.test.ts`。

**Interfaces:** 复用 `createSubmission(subject, input, key)`、`memberApi(subject, path, init?)`；身份 `admin/contributor/other` 均走真实 SessionService。

- [x] 参数化三种决定：publish→published，reject→rejected，request-revision→revision_requested。
- [x] 普通成员创建后管理员审核；同一 HTTP 请求重放两次，比较回执及通知 ID/已读时间稳定。
- [x] 收件人列表 type 过滤 total=1、payload={}、target=submission；第二成员和管理员收件箱都没有该通知，跨收件人 mark-read=404。
- [x] 提交者在 `/api/submissions/mine?status=<decision>` 可见；第二成员不可见；管理员详情 200，普通成员/第二成员管理员详情 403。
- [x] 禁用提交者后原会话的通知列表/summary/read 和 mine 均明确为 403 MEMBER_DISABLED，数据库通知整行不变。
- [x] 新增测试先运行真实实现；两文件 132 passed，无生产修复。类型检查发现测试 helper union 缺通知表并已补齐，没有放宽隔离断言。

```ts
expect(ownerPage.pagination.total).toBe(1);
expect(ownerPage.items[0]).toMatchObject({
  recipientMemberId: "member-contributor", targetKind: "submission",
  targetId: submissionId, payload: {},
});
expect((await memberApi("other", `/api/notifications/${noticeId}/read`, { method: "POST" })).status).toBe(404);
```

## Task 3: 证据矩阵和验收门槛

**Files:** Create `docs/product/2026-09-17-admin-review-acceptance-matrix.md`; Modify `ROADMAP.md`, `docs/product/delivery-status-ledger.md`, `docs/product/2026-09-12-personal-workbench-completion-audit.md`, `docs/product/workbench-product-maturity-checklist.md`, design D checklist。

**Interfaces:** 将 D 设计逐条映射至测试名/命令/结果；发布状态字段保持原值。

- [x] 联合回归 15 文件 341 passed；typecheck 通过；smoke 49、i18n 13、delivery 28、maturity 13 通过；i18n 静态验证及 diff check 通过。
- [x] 矩阵分别标注并发、载荷冲突、管理员交接、响应丢失、回滚、索引恢复、权限、迟到响应；不得把交接重放称作两个同时活动管理员竞争（当前单活动管理员约束）。
- [x] 检查真实浏览器验收可用条件：Mac 锁屏且无可用标签页；仅本地测试会话不记为真实用户登录验收。矩阵已列出中英文、键盘、深浅主题、移动宽度、双身份及上线迁移的未验收条目。
- [x] 同步文档并保持 D 父项开放，直到真实交互/发布门槛具有独立证据。实际 D3/D4 验收仍未完成，本计划完成只表示本地证据整理完成。

## 计划自查

Task 1 与 Task 2 不共享写文件，均消费现有真实持久化协议；Task 3 仅汇总，不改变前两项的期望或业务行为。单活动管理员约束与 D 的不同管理员竞争用交接及已存在决定冲突证据对应，真实部署/登录不会由本地测试自动关闭。当前先顺序推进耦合的矩阵核对与测试，不新开实施工作树。
