# D02-R2-B Frontend Review Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 管理员获得可信的审核结果、真实说明表单，以及不会改变原决定的显式重试。

**Architecture:** 数据边界先把输入序列化为不可变操作快照，再校验服务端回执。详情与队列共用说明表单、结果展示和错误分类；请求所有权留在各自路由，不让过期异步结果修改新页面。

**Tech Stack:** React / TypeScript / 现有 shadcn 风格组件 / Vitest + happy-dom。

**Spec:** `docs/superpowers/specs/2026-09-16-admin-review-write-recovery-design.md`，B 批。

**Status (2026-09-16):** B1–B3 本地实现、验证及独立复核完成；证据见 `docs/product/2026-09-16-admin-review-write-ui-evidence.md`。本提交包含本计划的完成记录；未推送或部署。

## Global Constraints

- 仅使用项目现有 Cloudflare 服务，不增加收费服务、外部队列或新依赖；本阶段不修改生产配置或执行远程迁移。
- 保留现有分页协议、权限检查、私有成员隔离和审计脱敏。
- 请求超时或网络错误不证明写入未发生；只允许用户显式重试原载荷，不自动重试。
- 401/403 清空受限数据；409 只提供重读，不强制覆盖。
- 本地实现、本地自动化、提交、部署、真实登录验收分别记录；不关闭 D02/R6-003/ADM-002。
- 本批不实现 C 的通知、迁移，也不宣称 D 的真实设备验收完成。

## File map

- `frontend/components/review/review-detail-data.ts`：操作快照、说明约束、回执校验和错误分类。
- `frontend/components/review/review-decision-controls.tsx`：共用说明输入、原因选择、结果和恢复按钮。
- `frontend/pages/admin/review-detail-route.tsx`：详情写入所有权与恢复状态。
- `frontend/pages/admin/review-detail-page.tsx`：接入共用表单和结果。
- `frontend/pages/admin/review-queue-page.tsx`、`frontend/app.tsx`：队列行内说明与原查询刷新。
- `frontend/lib/i18n.ts`：中英文原因、索引状态、未知结果/冲突提示。
- 三个现有 frontend-review-detail 测试及 `frontend-moderation-pagination-routes.test.tsx`：真实 React 行为与请求断言。

### Task B1: Immutable operation and authoritative receipt

**Interfaces:** `prepareReviewDecision(id, action, publish, details?) -> ReviewOperation`，其 `body` 为已序列化字符串；`sendReviewDecision(operation, requester?) -> Promise<ReviewReceipt>`。保留 `submitReviewDecision` 兼容包装；`ReviewNoteInput = { reasonCode, note }`。

- [x] 编写失败测试：四种 searchStatus 保留；缺 id/knowledgeItemId/非法状态、错误 submissionId/decision 拒绝；说明 UTF-8 4000 字节上限、原因白名单、控制字符/孤立代理项拒绝。

```ts
await expect(submitReviewDecision('sub-1', 'publish', publish,
  async () => new Response('{}'))).rejects.toThrow('REVIEW_RECEIPT_INVALID');
const operation = prepareReviewDecision('sub-1', 'reject', publish,
  { reasonCode: 'duplicate', note: '重复资料' });
expect(JSON.parse(operation.body)).toEqual({ reasonCode: 'duplicate', note: '重复资料' });
```

- [x] 运行 `rtk proxy npx --no-install vitest run test/unit/frontend-review-detail-data.test.ts`，观察契约失败。
- [x] 实现快照及回执判别联合。publish 读取 `revision.id/knowledgeItemId/searchStatus`，非发布读取 `decision.submissionId/decision`；拒绝空或跨对象响应。

```ts
return Object.freeze({ id, action, path, body: JSON.stringify(input) });
// Every send uses operation.path and operation.body, never the current form.
```

- [x] 重跑数据边界测试通过，确认没有后端/依赖修改。

### Task B2: Detail form, outcome, and safe manual recovery

**Interfaces:** 共用 `ReviewDecisionState` 区分 idle/pending/success/error，error 包含 recovery = retry/reload/edit；成功携带 `ReviewReceipt`。`ReviewDecisionForm` 接收 action、disabled、onSubmit(details)；`ReviewDecisionFeedback` 接收 state、onRetry、onReload。

- [x] 编写行为失败测试：填写说明真实发出；失去响应后锁定其他决定与说明、双击重试只一次并逐字重放；畸形 2xx 不显示成功；409 重读；401/403 清除；四种索引状态不变回 pending；对象切换/卸载迟到返回失效。

```ts
await act(async () => button('Retry same decision').click());
expect(sentBodies[1]).toBe(sentBodies[0]);
expect(button('Publish').disabled).toBe(true);
expect(container.textContent).not.toContain('Review decision saved.');
```

- [x] 运行 `rtk proxy npx --no-install vitest run test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-review-detail.test.tsx`，观察新增用例失败。
- [x] 使用现有 Label/Select/Textarea/Button；reject 白名单 not_relevant/duplicate/unsafe，revision 固定 needs_revision，空说明仍遵守现有允许规则；实时显示 UTF-8 字节数和错误。
- [x] 路由持有快照和同步锁；未知结果保留快照，409 清除写入重试入口但锁定旧状态直到重读；成功只使用回执状态；权限错误清数据和快照。

```ts
const receipt = await sendReviewDecision(operation, requester);
if (!owner.isCurrent(current)) return;
setDecisionState({ kind: 'success', receipt });
```

- [x] 中英文索引提示分 indexed/pending/search_degraded/failed，不把索引失败描述为发布失败；重跑详情测试。

### Task B3: Queue parity and pagination preservation

**Interfaces:** 队列保留快捷发布；驳回/退回打开同一行的共用表单后确认。操作回执、重试及冲突重读复用 B1/B2；请求所有权绑定 controller + query。

- [x] 编写失败测试：行内说明；未知结果原 body 重试、禁止相反决定；发布回执索引提示；409 仅重读；读失败只重试 GET；保留 query/pageSize，移除最后一行后夹紧到有效页；旧请求不能刷新新查询。

```ts
expect(posts).toHaveLength(1); // queue refresh retries must only GET
expect(browser.location.search).toContain('pageSize=50');
expect(sentBodies[1]).toBe(sentBodies[0]);
```

- [x] 运行 `rtk proxy npx --no-install vitest run test/unit/frontend-moderation-pagination-routes.test.tsx`，观察失败。
- [x] 只在校验回执后刷新；刷新失败保留成功结果与只读恢复；未知结果锁定当前决定；换页清理 controller 所有权，旧响应被忽略。重读权限失败也清除表单/回执。
- [x] 重跑定向回归、`rtk proxy npm run typecheck`、`rtk proxy npm run build`、`rtk proxy npm run verify:delivery-status`、`rtk proxy git diff --check`。
- [x] 独立代码复核修复实际问题，记录本地证据与未完成的真实浏览器验收。
- [x] 同步 ROADMAP、completion-audit、maturity-checklist、delivery-status-ledger、设计 B 状态；本地提交，不推送/部署。

## Plan self-review

B 每条约束映射到 B1/B2/B3；无新增生命周期。前端 form 的说明仅进入已有请求体，不进入日志/审计。保留队列快捷发布和分页，不以跳转详情代替原功能。复用已隔离 worktree `codex/admin-audit-recovery`，本轮继续执行而不重复请求设计批准。
