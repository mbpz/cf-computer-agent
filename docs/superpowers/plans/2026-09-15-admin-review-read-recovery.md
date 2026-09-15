# D02-R1 审核队列与详情读取恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the existing isolated worktree, inline without delegation. Steps use checkboxes. No merge, push or deploy.

**Goal:** 管理员从数字分页审核队列进入详情后，可以原查询重试读取失败；导航、权限变化和迟到请求不会显示错误对象或允许旧对象写入。

**Architecture:** 复用队列现有 numbered request controller 和详情 async owner，补齐读取状态与恢复入口，不重写全局路由。详情缺失以真实 404 为准，200 的缺失/畸形 preview 继续失败关闭。读请求不得重放审核 POST。

**Tech Stack:** React、TypeScript、现有 shadcn Button/PageState/Alert、Vitest + happy-dom；后端协议不变。

**Spec:** `docs/product/2026-09-12-personal-workbench-completion-audit.md` D02；`docs/product/workbench-product-maturity-checklist.md` R6-003。前置 `58f468c`。

## Global Constraints

- 保持 Cloudflare 免费服务边界；本批无新服务、依赖、数据库迁移或生产操作。
- 保持管理员权限校验、既有成员隔离、数字分页 20/50/100 和 URL 前进/后退。
- 不提升 D02/R6 父项、release 或真实浏览器 acceptance；不宣称写操作幂等已完成。
- 中英文文案通过 `frontend/lib/i18n.ts`，不添加重复全局菜单。
- 不以 200 畸形载荷伪造空态，不把 401/403 当普通可保留旧结果的网络错误。

## 已核对的现状

- [x] `frontend/app.tsx` 的 `ReviewQueueRoute` 有数字分页、请求 generation 和查询快照，但初始错误没有重试，刷新失败只显示文字；catch 保留旧 ready，未单独处理 401/403。
- [x] `review-queue-page.tsx` 已有真实 `/admin/submissions/:id` 标题链接，不需要新增重复入口；需要补交互回归。
- [x] `review-detail-route.tsx` 所有读取错误统一归为 error，没有 retry。`owner.claim()` 位于 decision guard 之前，重复事件有可能使在途请求失去归属；需要单独验证并修正同步锁。
- [x] `loadReviewDetail` 不接收 signal，未确认响应 submissionId 等于所请求 id；应拒绝错误对象响应。
- [x] `src/publication/service.ts` 的 `preview()` 对不存在提交抛 `SUBMISSION_NOT_FOUND`/404；`src/routes/admin-review.ts` 返回 `{ preview }`。因此 200 无 preview 是协议错误，而不是产品空态。
- [x] 既有 `frontend-review-detail.test.tsx` 主要为静态 markup；新增真实 React lifecycle 回归，不把静态渲染当交互验证。

## Task 1：队列原查询恢复与权限清理

**Files:** 修改 `frontend/app.tsx` 的 `ReviewQueueRoute`、`frontend/pages/admin/review-queue-page.tsx`、`frontend/lib/i18n.ts`；测试 `test/unit/frontend-moderation-pagination-routes.test.tsx`。

**Interfaces:** 保留现有分页/审核 props，增加 `onRetry?: () => void`；复用 `pending` 禁用按钮。controller 继续消费 `{ page, pageSize }` 并返回 `{ items, pagination }`。

- [ ] 写实际 route RED：page=2&pageSize=50 首次 GET 500，点击“Retry”得到空态或 ready；断言两次 GET 查询一致且 POST 次数为零。异步断言等待实际按钮，不能假定一次微任务即完成。
  ```ts
  await clickButton("Retry");
  await vi.waitFor(() => expect(gets).toHaveLength(2));
  expect(gets[1]).toBe(gets[0]);
  expect(posts).toHaveLength(0);
  ```
- [ ] 跑 `npx --no-install vitest run test/unit/frontend-moderation-pagination-routes.test.tsx`，观察缺少 retry 按钮导致 RED。
- [ ] 抽取队列 GET 执行为共享函数，初始、retry 和审核成功后刷新复用；每次保存查询与 generation，重试只执行当前查询。立即设置 in-flight ref，双击不重复请求；finally 只清理自身请求。
  ```ts
  const snapshot = { ...queryRef.current };
  const request = controller.request(snapshot);
  const data = await request.promise;
  if (!controller.isCurrent(request.generation) || !sameQuery(snapshot)) return;
  setState({ kind: "ready", data });
  ```
- [ ] 补 401/403 状态分支：丢弃旧 rows 和动作入口，显示权限提示；普通读取失败保留旧列表并显示独立 retry。mutation 错误与 GET 错误保持分离。
- [ ] 增加双击重试、旧查询迟到、重试中 back/forward、撤权清理、POST 成功但 GET 失败后 retry 不重复 POST 的回归。同步中英文，保留既有 pagination 和末页回退测试。
- [ ] 跑上述文件及 `test/unit/frontend-admin-review-data.test.ts`、`test/unit/frontend-admin-pages.test.tsx`；通过后提交本任务代码及测试。

## Task 2：详情恢复、对象匹配与请求归属

**Files:** 修改 `frontend/components/review/review-detail-data.ts`、`frontend/pages/admin/review-detail-route.tsx`、`frontend/pages/admin/review-detail-page.tsx`、`frontend/lib/i18n.ts`；测试 `test/unit/frontend-review-detail-data.test.ts`；新增 `test/unit/frontend-review-detail-route.test.tsx`，复用 moderation 测试的 happy-dom/React act harness。

**Interfaces:** `loadReviewDetail(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<ReviewDetailData>`；页面增加 `onRetry?: () => void`。状态新增 `not-found` 与 `forbidden`（message 字段），error 保留 retry，ready 不变。

- [ ] 写 loader RED：合法 preview 的 submissionId 与请求 id 不符时拒绝；AbortSignal 原样传到 Fetcher。断言：
  ```ts
  await expect(loadReviewDetail("sub-1", wrongIdRequester)).rejects.toThrow("REVIEW_DETAIL_INVALID");
  await loadReviewDetail("sub-1", requester, controller.signal);
  expect(requester.mock.calls[0][1]?.signal).toBe(controller.signal);
  ```
- [ ] 跑 `npx --no-install vitest run test/unit/frontend-review-detail-data.test.ts` 观察 RED，再将 signal 传入 apiFetch，并在 normalize 后要求 `result.detail.id === id`。
- [ ] 新增真实 route RED：500→Retry→成功；404→未找到且无审核按钮；401/403→权限提示无内容；200无preview→error；A请求未完成切B，A迟到不得覆盖B。requester 对 comments GET 单独返回 `{ comments: [] }`，不得计入详情读取次数。
- [ ] 使用每轮 AbortController 与 owner token；切 id/卸载 abort 并 invalidate。重试仅针对当前 id，一次点击占有即时 ref；显示新 id 时不得保留旧 detail/actions/comments。
  ```ts
  if (error instanceof ApiRequestError && error.status === 404) {
    setState({ kind: "not-found", message: frontendText(locale, "ADMIN_REVIEW_NOT_FOUND") });
  } else if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
    setState({ kind: "forbidden", message: frontendText(locale, "ADMIN_REVIEW_FORBIDDEN") });
  }
  ```
- [ ] 验证并修复重复 decision 事件的 owner 问题：先判 ready/current id/status/ref，再 claim；同步 ref 锁住单次动作。回归同 tick 两次 click 只有一次 POST且成功可落地。这里只保证前端在途互斥，不声称服务端幂等。
- [ ] `ReviewDetailPage` 用现有组件显示 retry、未找到/权限提示及返回审核队列链接；不渲染敏感旧内容。键盘原生 button/a 语义，所有新增文案双语。
- [ ] 跑 `npx --no-install vitest run test/unit/frontend-review-detail-data.test.ts test/unit/frontend-review-detail.test.tsx test/unit/frontend-review-detail-route.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx`，通过后提交本任务。

## Task 3：队列到详情闭环证据与账本同步

**Files:** `test/unit/frontend-workbench-maturity-routes.test.tsx`、`shared/workbench-maturity-capabilities.ts`、`docs/product/workbench-product-maturity-gap-matrix.md`、`scripts/workbench-maturity-contract.test.mjs`、`scripts/workbench-domain-audit.mjs`、`scripts/workbench-domain-audit.test.mjs`、独立 `docs/operations/evidence/2026-09-15-workbench-d02r1-domain-audit.md`、`docs/product/2026-09-15-admin-review-read-recovery-evidence.md`、README、ROADMAP、completion audit、delivery ledger。

- [ ] 增加真实 App 队列标题点击到对应详情的回归：由响应 id 构造链接，进入同 id 后展示响应标题；404 可返回列表。不要仅用 href 字符串测试代替导航。
- [ ] 跑 `npm test`、`npm run typecheck`、`npm run typecheck:landing`、`npm run verify:landing`；记录 fresh 数量和失败原因，不复用 B2 结果。
- [ ] 更新 registry 的读取缺口，仅关闭有实际测试覆盖的内容；写操作幂等、审核后发布/索引/通知闭环和浏览器验收保留。同步 fingerprint 和矩阵，生成新域快照，保留 B2 历史。
- [ ] 跑 `node --test scripts/workbench-maturity-contract.test.mjs scripts/workbench-domain-audit.test.mjs scripts/delivery-status-contract.test.mjs` 及 `npm run audit:workbench-domain`；`git diff --check` 后提交证据。

## 后续独立批次：D02-R2（本计划不实现）

审核写协议需先核对 `src/publication/service.ts`、review 状态迁移与事务、审计/通知重复，以及现有 publish recovery，再设计客户端稳定操作身份、服务端重放语义及故障恢复测试。禁止仅增加按钮 disabled 就标记幂等完成。

## 当前状态

已完成源码核对与原子拆解；Task 1–3 尚未实现或验证。D01-B2 已单独提交 `58f468c`，这份计划不是审核功能完成证据。
