# Area B — 执行与协作域评审

评审对象：`main` @ `4d00e381`（工作树干净）。只读评审；本文件是唯一写入产物。
方法：静态核对 + 少量现有单文件测试。未运行全量门禁（`npm run check` / `npm test` / `npm run build`），未联网、未部署、未读 secrets。

## 覆盖与方法（实际文件/命令，诚实标注抽样）

**必读要求来源（已读）**
- `README.md`、`ROADMAP.md`（R2「任务→通知→看板→上下文消息」目标与退出标准）。
- `docs/product/delivery-status-ledger.md`（TSK-001~011、NTF-001~006、BRD-001~007、MSG-001~006、CAL-001、TOD-001、FOC-001、GL-001、PRJ-001、P4-001、INB-001、CAP-001、WB-GR-001、REV-001）。
- `docs/product/2026-10-16-authenticated-workspace-interaction-contract.md`（§2 状态契约、§4 迁移矩阵）。

**后端（重点精读）**
- `src/tasks/{service,repository,structure}.ts`、`src/routes/tasks.ts`。
- `src/notifications/{service,repository,types}.ts`、`src/routes/notifications.ts`、`migrations/0036_workbench_notifications.sql`、`migrations/0068_task_status_intent_dedup.sql`。
- `src/discussions/{service,repository,authorization}.ts`、`src/routes/discussions.ts`、`migrations/0037_workbench_discussions.sql`。
- `src/calendar/{service,repository}.ts`、`src/routes/calendar.ts`；`src/focus/{service,repository}.ts`、`src/routes/focus.ts`；`src/goals/service.ts`、`src/routes/goals.ts`；`src/goal-tasks/service.ts`、`src/routes/goal-tasks.ts`；`src/projects/{service,repository}.ts`、`src/routes/projects.ts`；`src/project-timeline/{service,repository}.ts`、`src/routes/project-timeline.ts`；`src/inbox/{service,task-promotion,repository}.ts`、`src/routes/inbox.ts`；`src/today/service.ts`、`src/routes/today.ts`；`src/workbench-review/{service,repository}.ts`、`src/routes/workbench-review.ts`；`src/capture/{service,repository}.ts`、`src/routes/capture.ts`；`src/graph/{service,repository,limits,cursor}.ts`、`src/routes/graph.ts`。
- 横切：`src/pagination.ts`、`src/pagination-d1.ts`、`src/planning-version.ts`、`src/authorization/policy.ts`、`src/library/read-authorization.ts`、`src/app.ts`（路由分派与通知授权回调）、`src/worker-entry.ts`（Cron）、`migrations/0066_task_delete_tombstones.sql`。

**前端（关键路径精读 + 抽样）**
- `frontend/app.tsx`：TasksRoute（1746-1965）、InboxRoute/GoalsRoute/ProjectsRoute/ProjectTimelineRoute/CalendarRoute 的最终渲染（2106-2662）、TodayRoute（2680-2698）、FocusRoute（2701-2886）、WorkbenchReviewRoute（2889-2926）、NotificationsRoute（2929-3153）、MessagesRoute/ThreadRoute（3156-3323）、BoardsRoute（3337-3716）。
- `frontend/pages/{tasks/task-editor,tasks/tasks-page,boards/boards-page,boards/board-model,messages/thread-page,notifications/notifications-page,inbox-page,today-page}.tsx`。
- `frontend/lib/{tasks-data,task-write-intent,board-move-intent,discussions-data,focus-create-intent,focus-transition-intent,numbered-page,route-access}.ts`、`frontend/components/data-table.tsx`、`frontend/components/data-pagination.tsx`、`frontend/app-routes.ts`、`frontend/components/graph/graph-inspector.tsx`。
- `shared/workspace-route-capabilities.ts`、`scripts/paged-list-contract.test.mjs`。

**测试（只读，抽查证据）**
- 阅读：`test/unit/frontend-boards-page.test.tsx`、`frontend-boards-route.test.tsx`、`frontend-notifications-page.test.tsx`、`frontend-notifications-route.test.tsx`、`frontend-task-structure.test.tsx`、`test/unit/frontend-graph-inspector.test.tsx`、`test/worker/workbench-review.test.ts`、`test/helpers/list-viewport.ts`。
- 实跑（单文件，非全量）：`npx vitest run test/unit/frontend-boards-page.test.tsx test/unit/frontend-notifications-page.test.tsx` → **2 文件 / 25 用例通过**（输出含一次 wrangler 日志 EPERM 告警，不影响用例结果；未跑 worker/全量）。
- 明确未执行：Worker/HTTP 层测试、任何生产或浏览器旅程；前端页面只做了静态与 props 级核对。

抽样声明：`frontend/pages/{goals,projects,inbox,calendar,project-timeline,graph,workbench-review}-page.tsx` 未逐行精读，只核对其与 `app.tsx` 的 props 契约与状态枚举；`src/{goals,projects,inbox}` 的 repository SQL 采用抽查（构造 `where` 的成员绑定已被逐一确认）。

## 结论摘要（3–6 条）

1. **后端隔离与授权总体扎实**：范围内 owner-scoped SQL 均显式绑定 `member_id`/`recipient_member_id`；跨成员对象统一 404（`tasks/service.ts:403-408`、`notifications/service.ts:92-103`、`discussions/service.ts:88-94`）；知识可见性在 SQL 层用 `authorized_member + readableKnowledgeRevisionSql` 复校验；审计元数据按 action 白名单，只含状态/进度/ID，无正文。
2. **P1 回归：看板与通知在桌面端丢失分页能力**。2026-10-14 的 beUI 列表迁移（`7f000d88`）删掉了两处路由的 `onPageChange/onPageSizeChange`，而共享 `DataTable` 的桌面 pager 需要这两个回调、移动端 scroll-feed 在桌面又被显式禁用 → `/boards` 每列与 `/notifications` 收件箱在 ≥1024px 下永久停在第 1 页 20 条；账本 BRD-004/NTF-003 仍声称「完整数字分页 / URL 状态独立」。
3. **门禁没有兜住上述回归**：`scripts/paged-list-contract.test.mjs` 对页面组件做正则、对 `frontend/app.tsx` 只做整文件 `/onPageChange=/` 匹配，不按路由断言；boards/notifications 的路由测试统统 `stubListViewport(..., "mobile")`，桌面路径在路由层零覆盖。
4. **幂等性分层不一致**：任务（绝对值语义）/看板（`expectedStatus` CAS）/消息（`author+clientKey`+线程内 sequence）可服务端同键收敛；而 focus/calendar/goals/projects/project-timeline 的**状态转移**先校验版本 CAS 再判「已是目标态」，响应丢失后的重放直接 409，恢复依赖前端 journal + 读回执（非服务端幂等）。这符合现有代码但削弱了「同键重试」的账本表述。
5. **通知兜底投递有缺口**：任务状态通知采用「CAS 触发器写 intent + 服务端 drain」，但 drain 只在 `setStatus` 路径调用（`tasks/service.ts:382-401`），Cron 仅扫资产（`src/worker-entry.ts:18,31,97`）。一次 emit 失败后 intent 会悬挂到该任务下一次状态写入，且无独立重投/清理。
6. **账本与代码双向漂移**：BRD-004/NTF-003 夸大（分页）；TSK-009 低估（已有 tombstone 删除回执与 intent 去重）、TSK-011 低估（子项/依赖前端已实现且有测试）、CAL-001 低估（Calendar 页面已在 `/calendar` 路由就绪）。CAP-001 的分类建议仍只有 API、没有前端入口。

## 发现

> 严重度：P0 阻断/泄漏；P1 主要功能事实错误或数据不可达；P2 明确缺陷/门禁失效/契约漂移；P3 体验或文档小问题。

| ID | 严重度 | 标题 | 位置 file:line | 对应要求 | 说明与证据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| B-01 | **P1** | 看板桌面端无法翻页/追加，每列被截断在 20 条 | `frontend/app.tsx:3554-3566`；`frontend/pages/boards/boards-page.tsx:142-147`；`frontend/components/data-table.tsx:72,102`；`frontend/pages/boards/board-model.ts:34-50` | BRD-004、BRD-005、WB-PAGE、交互契约 §4「看板 migrated」 | `BoardsRoute` 渲染 `BoardsPage` 时只传 `onLoadMore`，不传 `onPageChange/onPageSizeChange`（app.tsx:3565-3566）。`BoardsPage` 因此把它们传成 `undefined`（boards-page.tsx:143-144）。共享表格据此**不渲染桌面 pager**（data-table.tsx:102 `desktop && pagination && onPageChange && onPageSizeChange`），同时把 `onEndReached` 限制在移动端（data-table.tsx:72 `!desktop && ...`）→ ≥1024px 下每列只能看到 `pageSize=20` 的窗口，无法到达第 21 条。`BoardsRoute` 签名里 `search` 已不再解构（app.tsx:3337），`parseBoardSearch/writeBoardColumnSearch` 成为只被单元测试引用的死代码（`grep` 仅命中 board-model 与 test）；代码注释（app.tsx:3342）也承认「pager is not part of the URL」，与账本「URL 状态独立」相反。组件层测试反而证明桌面 pager 本应可用：`test/unit/frontend-boards-page.test.tsx:91,173-200` 传入回调并断言分页；路由测试只覆盖移动视口（`test/unit/frontend-boards-route.test.tsx:33` 等）。 | 在 `BoardsRoute` 中恢复逐列分页状态（URL 或内存）并向 `BoardsPage` 传 `onPageChange={(status,page)=>…}` 与 `onPageSizeChange`；桌面否则至少把 `onLoadMore` 接到桌面表尾「加载更多」。补一条 desktop 路由测试（≥21 条、断言 pager 存在且翻页请求 page=2）。 |
| B-02 | **P1** | 通知收件箱桌面端无法翻页/追加，只见第一页 20 条 | `frontend/app.tsx:3116-3153`；`frontend/pages/notifications/notifications-page.tsx:61,154`；`frontend/components/data-pagination.tsx`（未被挂载） | NTF-003、NTF-004、WB-PAGE | `NotificationsRoute` 只传 `onLoadMore`（app.tsx:3126），未传 `onPageChange/onPageSizeChange`。页面确实按这两个回调决定是否挂载页脚分页器（notifications-page.tsx:154 `desktop && onPageChange && onPageSizeChange ? <DataPagination/> : undefined`），而桌面滚动加载被显式跳过（notifications-page.tsx:61 `if (desktop \| ...) return;`）→ 桌面永远只有前 20 条通知，`summary.unread` 可以大于可见条数且无入口浏览其余。账本 NTF-003 声称「完整数字分页…URL 恢复」。路由测试两处 `stubListViewport(browser, "mobile")`（`test/unit/frontend-notifications-route.test.tsx:27,409`），桌面路径无覆盖；页面层测试却断言了桌面页脚（`frontend-notifications-page.test.tsx:156,199`）。 | 与 B-01 相同：路由传 `onPageChange/onPageSizeChange`（page 可继续不入 URL，但必须可操作），并补 desktop 路由用例。 |
| B-03 | P2 | 分页门禁脚本无法发现「路由漏接线」 | `scripts/paged-list-contract.test.mjs:38-68` | OPS-002、NTF-003、BRD-004 的验证证据 | 脚本对每个页面组件只做正则（`pagination={`\|`<DataPagination`、`onPageChange`、`onLoadMore`），页面组件因声明/条件引用这些标识符即通过；路由层唯一断言是对整个 `frontend/app.tsx` 的 `assert.match(app, /onPageChange=/)`（:66），只要**任意**路由存在即通过。因此 B-01/B-02 这类「组件支持、路由没传」的回归不会被该测试或现有 vitest 捕获；该脚本头部注释还写着「Every server-paginated list renders the shared DataTable with its footer pager」。 | 把断言改成按路由/组件调用点解析 props（或以真实渲染断言「desktop 下存在 `[data-pagination-desktop]` 且翻页会发 page=2」），至少覆盖 boards/notifications 两条路由。 |
| B-04 | P2 | CAP-001 分类建议只有 API，无前端入口；`dismiss` 不持久 | `src/routes/capture.ts:6`；`src/capture/service.ts:12-18`；`delivery-status-ledger.md:73` | CAP-001「Inbox AI/启发式分类与确认前 promotion 建议」、R2 闭环 | 仓库中 `/api/capture/*` 只有 Worker 路由与 `test/worker/capture.test.ts`；`grep -rn "/api/capture" frontend` 无结果，`classify/dismiss` 没有页面调用 → 「入口→建议→确认」闭环只存在于测试/API。另 `classify()` 仅在既有记录 `status === "suggested"` 时复用，否则一律以 `status: "suggested"` upsert（`capture/service.ts:13-17`），所以 `dismiss` 之后再调用一次 classify 会把 dismissed 覆盖回 suggested——dismiss 不是稳定终态。账本只写「promotion 仍复用现有显式确认接口…生产/验收 pending」，未说明 UI 缺口。 | 在 Inbox 快捕/条目上接入建议展示与 dismiss（或在账本明示仅 API）；`classify` 对 dismissed 应保持 dismissed（或提供显式「重新建议」），并补一条「dismiss 后 classify 不复活」的 Worker 用例。 |
| B-05 | P2 | 任务创建上限是 check-then-act，可并发越界；无知识关联的插入缺 SQL 容量谓词 | `src/tasks/service.ts:46-48`；`src/tasks/repository.ts:80-86`（对比 `:88-104`） | TSK-005、TSK-004、并发/免费层边界 | `TasksService.create` 先 `countByMember() >= maxTasksPerMember` 再调用 `repository.insert`；普通 `insert` 的 SQL 没有 `(SELECT COUNT(*) …) < max` 谓词，也没有注释化的「Authorization and capacity belong to the write」保护（该保护只存在于 `insertWithKnowledge`，repository.ts:89-104）。两个并发创建可在 99/100 时都通过计数并各自插入，越过 `APP_CONFIG.maxTasksPerMember`。TaskPromotion/`insertWithKnowledge` 都在 SQL 内做了容量判断，说明这是遗漏而非设计。 | 把容量谓词并入 `insert`（`SELECT … FROM tasks WHERE member_id=? … AND (SELECT COUNT(*)...) < ?` 或 `INSERT … SELECT` 带守卫），或对创建加成员级串行/重试后复核。 |
| B-06 | P2 | 状态转移的「同键重试」只在任务/看板/消息成立；focus/calendar/goals/projects/timeline 重放 409，恢复靠前端 journal | `src/focus/service.ts:42-47,50-55,66-73`；`src/planning-version.ts:4-12`；对照 `src/tasks/service.ts:246-249`、`frontend/app.tsx:2749-2757,2856-2871` | FOC-001、CAL-001、GL-001、PRJ-001、P4-001 的「幂等」表述；评审问题 3 | 这些服务的转移函数先 `requirePlanningVersion(expectedUpdatedAt, current.updatedAt)`，再判断「已经是目标态就直接返回」（focus/service.ts:44-45、52-53、68-69）。首次成功已把 `updatedAt` 前移，因此丢失响应后的同键重试必然 409，而不是收敛为成功。恢复由前端承担：FocusRoute 在重提之前先 GET 回执并比较 `receipt.updatedAt === intent.expectedUpdatedAt`（app.tsx:2750-2757、2860-2864），日历/目标/项目则靠各自的写意图 + 重新读取。任务/看板相反——任务先比绝对值（tasks/service.ts:207-209、246-249、277），看板移动重放会命中「已是目标状态」提前返回（tasks/service.ts:246-248），因此可服务端收敛。 | 若目标仍是「服务端同键幂等」，把「已处于目标态」短路前移到版本校验之前（并在审计/回执上区分 replay），或明确在账本把该类转移的保证限定为「版本 CAS + 前端读回执恢复」。 |
| B-07 | P2 | 任务状态通知 intent 的兜底投递依赖「下一次状态写入」；无重投/Cron 清理 | `src/tasks/service.ts:382-401`；`src/worker-entry.ts:18,31,97-108`；`migrations/0036_workbench_notifications.sql:28-42` | NTF-002、NTF-003、评审问题 3 | CAS 触发器把待投递 intent 写入 `task_status_notification_intents`，`deliverPendingStatusNotifications` 只在 `setStatus`（含同状态重放）里 drain；除此之外无调用点（`grep` 仅 3 处：接口 2、service 1）。Cron 的 `scheduled` 只执行 `sweepAssets`（worker-entry.ts:18/31/97），不扫描 intent 表。因此 `notifications.emit` 一次失败（如 target authorizer/DB 抖动）后，该通知会悬挂到该任务下一次状态变更或同状态重放；若成员不再改状态则永久丢失。账本 NTF-002 说「状态 CAS/intent 与同状态重放收敛为一条逻辑通知」，未提投递重试边界。 | 增加按 `delivered_at IS NULL` 的兜底 drain（Cron/Queue 或每次通知列表物化时批量 drain 有界条数），并记录失败重试计数；或在账本明确该恢复边界。 |
| B-08 | P2 | 图谱节点深链指向不存在的路由 | `src/graph/service.ts:85-92,94-100,102-108,110-115,117-121,123-125`；`frontend/app-routes.ts:5-15`；`frontend/components/graph/graph-inspector.tsx:49-51` | WB-GR-001、评审问题 5（入口/反馈闭环） | 图节点 `href` 生成 `/tasks/:id`、`/projects/:id`、`/goals/:id`、`/inbox/:id`、`/calendar/:id`、`/focus/:id`、`/projects/:id/timeline/:id`；但 `pageKindForPath` 只识别 `/knowledge/:id`、`/messages/:id`、`/projects/:id/timeline`、admin 详情等，上述路径全部落到 `"not-found"`。Inspector 把它们渲染成真实 `<a href>`（graph-inspector.tsx:49-51），点击即整页导航到 NotFound（或未知路径）。`test/unit/frontend-graph-inspector.test.tsx:17,33` 的 fixture 也在使用 `/tasks/t1`，但只断言展示，不断言路由可解析。 | 要么为这些对象提供可解析的详情路由（任务/目标/项目/收件箱/日历的 `:id` 页或 `?id=` 深链），要么让 inspector 只展示不可点的 ID/标题，或把 `href` 改为已存在的落点（如 `/tasks?q=`、`/projects/:id/timeline`）。 |
| B-09 | P2 | 交付账本与代码双向漂移（夸大 + 低估） | `docs/product/delivery-status-ledger.md:63,65,69,73,77,84` | 评审问题 6；账本「唯一权威」声明 | 夸大：BRD-004（:84）「各列独立完整数字分页…URL 状态独立」——见 B-01；NTF-003（:77）「完整数字分页…URL 恢复」——见 B-02。低估：TSK-009（:63）称「当前删除为直接删除」，但 `migrations/0066_task_delete_tombstones.sql` 已引入成员级 tombstone 删除回执（`src/tasks/repository.ts:204-235` 在一次 batch 内 claim/删除/读回执），`migrations/0068_task_status_intent_dedup.sql` 也改了触发器；TSK-011（:65）称「前端…仍 pending」，但 `frontend/pages/tasks/task-editor.tsx:316-346` 已实现子项/依赖的增删改与版本化，`test/unit/frontend-task-structure.test.tsx` 覆盖；CAL-001（:69）称「Calendar 页面…仍 pending」，但 `/calendar` 已注册（`frontend/app-routes.ts` → `pageKind "calendar"`，`test/unit/frontend-calendar-page.test.tsx` 等存在）。CAP-001 见 B-04。 | 逐行刷新 TSK-009/TSK-011/CAL-001 的备注措辞（保留发布/验收 pending，但准确描述实现范围）；对 BRD-004/NTF-003 在修复前把实现列降为 `partial` 或删除「完整/URL 独立」表述。 |
| B-10 | P3 | `/today`、`/review` 的初始读取把 401/403 折叠成通用加载错误，无 forbidden/revoked 表面 | `frontend/app.tsx:2684-2692`（Today）、`:2897-2912`（Review） | 交互契约 §2「权限一致/错误就地」；TOD-001、REV-001、评审问题 5 | 两者 catch 分支只判 `isAbort`，其余一律 `COMMON_UNABLE_TO_LOAD`；只有目标对象详情（TodayTargetDetail / SnapshotTargetDetail）的 `onDenied` 会区分。对比同域 `/calendar`（`clearDenied`→`denied` 表面并清私有草稿）、`/goals`、`/inbox` 都有 denied/forbidden 处理。 | 在初始 load 的 catch 中按 `ApiRequestError.status` 区分 401/403（进入统一的 forbidden/重新登录状态，清私有目标），并为两页补断言。 |
| B-11 | P3 | 越界页码返回「空列表 + 总数为正」，前端无 clamp | `src/pagination.ts:48-53`；`frontend/lib/numbered-page.ts:37-45`；`frontend/components/data-pagination.tsx:31-41` | WB-PAGE「完整数字分页」、评审问题 4 | 服务端 `pageOffset` 只拒绝 `offset >= 10000`；例如 `pageSize=20&page=5` 而 `totalPages=2` 时返回 `items=[]`、`pagination.total=21`。前端 `normalizeNumberedPage` 用 `maximumRows = max(0, min(pageSize, total-offset))` 明确接受这种响应（numbered-page.ts:41-42），列表显示空态但页脚「total 21 / range 0–0」。多数路由在写后回到 page 1，因此主要在手工 URL/并发删除时出现。 | 在路由层或 `normalizeNumberedPage` 侧对 `page > totalPages && total > 0` 回退到 `totalPages`（或让服务端返回 400/404 语义并前端提示），并补一条越界断言。 |
| B-12 | P3 | 任务统计/日程按 UTC 日边界，“今天”与成员本地日不一致（设计边界，未见用户可见说明） | `src/today/service.ts:24-35`；`src/tasks/repository.ts:133-139,246-247`；`src/workbench-review/repository.ts:37` | TOD-001、REV-001（账本明确「UTC 日/ISO 周」）、CAL-001 | 今日任务过滤、今日日程范围、复盘日/周窗口全部以 UTC 00:00 切分；页面只显示 `… UTC`（`frontend/pages/today-page.tsx:20`）。对 Asia/Shanghai 成员，上午 8 点前创建/到期的事项会计入“昨天/明天”。账本把 UTC 写进 REV-001 备注，但未把该影响登记为已知边界。 | 若产品坚持 UTC，在 README/账本明确“日期按 UTC”，并在依赖日界的页面提供说明；否则按成员时区（已有 `calendar_events.timezone` 字段）计算。 |

### 正确性与安全补充（无独立缺陷，作为核对结论）

- **成员隔离**：`tasks/repository.ts` 每条读写 SQL 均含 `member_id`（创建上限除 B-05）；`notifications/repository.ts` 全部以 `recipient_member_id`；`discussions/authorization.ts:68-89` 对 task/knowledge context 每次重校验，消息查询先经 `findAuthorizedThread`；`calendar/focus/goals/projects/project-timeline/inbox/workbench-review/graph` 的读写 SQL 均绑定成员（抽查 `calendar/repository.ts:36-79`、`projects/repository.ts:34-150`、`project-timeline/repository.ts:37-98`、`graph/repository.ts:145-298`）。
- **跨成员 404 而非 403**：`tasks/service.ts:403-408`、`notifications/service.ts:92-103`、`discussions/service.ts:88-94`、`projects/service.ts:33-37`、`project-timeline/service.ts:73-75`；未发现把“存在但无权限”泄漏成 403 的路径。唯一例外是 capability 拒绝统一 403（`authorization/policy.ts:63-73`），语义正确。
- **看板不成为第二权威**：无 board 表；看板读 `GET /api/tasks?status=…`，移动走 `POST /api/tasks/:id/status` + `expectedStatus` CAS；无独立排序存储（`frontend/pages/boards/board-model.ts:16-32` 的迁移表与 `src/tasks/service.ts:24-30` 同源）。
- **消息不是通用私信**：线程只能由 `task`/`knowledge` context 建立（`migrations/0037_workbench_discussions.sql` 的 `CHECK(context_kind IN ('task','knowledge'))` + `discussions/service.ts:271-278`）；participants 仅交互元数据，不给授权（`discussions/authorization.ts:122-149` 每次按 context 重算成员资格）。
- **审计脱敏**：任务/消息审计的 metadata 由 `src/audit/types.ts:57-64` 规定，仅含 status/priority/count/ID；`discussions/service.ts:192-204` 只写 `messageId`；未见正文、邮箱、token 进入 metadata。
- **撤权清屏**：消息线程在 401/403/404 时递增 access epoch、dispose 并发读、清 composer（`frontend/app.tsx:3290-3308`）；通知目标失效时服务端把 `targetKind/targetId` 置 null（`notifications/service.ts:165-167`），前端进入 `revokedTarget` 表面（notifications-page.tsx:113-118）；看板 denied 时整列清空并失效乐观移动（`frontend/app.tsx:3379-3395`）。

## 功能逐项判定

| atom/路由 | 文档声称 | 代码事实 | 判定 | 证据 |
| --- | --- | --- | --- | --- |
| TSK-001/003/004 | done/done（实现/验证） | 成员级 CRUD、状态机 `TRANSITIONS`、进度/标签/知识关联、SQL 成员绑定齐全；详情/摘要/分页可用 | 符合 | `src/tasks/service.ts:24-30,41-104,201-337`；`src/tasks/repository.ts:116-151` |
| TSK-005 | done（幂等） | 创建以客户端 `id` 为持久主键；更新/状态/进度/标签/关联/删除均有绝对值或回执语义可重放收敛；仅创建上限有 TOCTOU（B-05） | 基本符合 | `src/tasks/service.ts:41-82,201-337`；`src/tasks/repository.ts:204-235`；`frontend/lib/tasks-data.ts:79-115` |
| TSK-006 | done（完整数字分页 + 总数隔离） | `parseNumberedPageRequest`（20/50/100）、`COUNT(*)`+`LIMIT/OFFSET`+`total/totalPages`，全部绑定成员；任务页桌面 pager 已接线 | 符合 | `src/pagination.ts:29-82`；`src/tasks/repository.ts:122-151`；`frontend/app.tsx:1958` |
| TSK-009 | pending（「当前删除为直接删除」） | 实际已有成员级 tombstone 删除回执与保留窗口；但无恢复 API、无过期清理（生命周期清理仍待批） | 部分符合（账本评述过时） | `migrations/0066_task_delete_tombstones.sql`；`src/tasks/repository.ts:204-235`；`src/tasks/service.ts:224-238` |
| TSK-011 | done 实现 / 账本「前端…pending」 | 子项/依赖 API、位置唯一、自环/跨成员拒绝，且任务编辑器前端已提供增删改与版本化提交 | 符合（账本过时） | `src/tasks/service.ts:106-199`；`src/tasks/structure.ts`；`frontend/pages/tasks/task-editor.tsx:316-346`；`test/unit/frontend-task-structure.test.tsx` |
| BRD-001/003 | done（任务投影、不扩权） | 无 board 表/独立排序，四列 = `tasks?status=` 投影；看板授权 = `tasks:use` + owner 隔离 | 符合 | `frontend/pages/boards/board-model.ts:4-32`；`frontend/app.tsx:3410-3413`；`src/routes/tasks.ts:20` |
| BRD-002/005/006 | done（键盘移动、乐观回滚、请求所有权） | 状态选择器 + ←/→ 键盘等价；mutation ownership/generation/stale 读隔离；未知移动持久化 journal + 只读核验/重试 | 符合 | `frontend/pages/boards/boards-page.tsx:110-130`；`frontend/app.tsx:3448-3552`；`frontend/lib/board-move-intent.ts` |
| BRD-004 | done（各列完整数字分页、URL 独立） | 桌面 pager 未接线、移动 feed 桌面禁用；URL page 状态被移除，helper 死代码 | **不符合** | 见 B-01 |
| BRD-005 | done（空/错/加载/回滚状态） | 每列 loading/error/empty/partial error/retry 齐全；denied 时以列错误呈现（无独立 forbidden 面） | 部分符合 | `frontend/pages/boards/boards-page.tsx:88-133`；`frontend/app.tsx:3379-3395` |
| NTF-001/002 | done（收件人隔离、事件去重） | 全部读写按 `recipient_member_id`；`(recipient, deduplication_key)` 唯一 + `INSERT OR IGNORE`；任务状态 intent 由 CAS 触发器同语句落库；但投递重试缺口（B-07） | 基本符合 | `src/notifications/service.ts:55-137`；`src/notifications/repository.ts`；`migrations/0036`/`0068` |
| NTF-003 | done（收件箱、未读、完整数字分页） | 列表/过滤/未读数/批量已读/URL 过滤恢复都在；桌面分页缺失 | **不符合** | 见 B-02 |
| NTF-004 | done（目标授权、空态、错误恢复） | 目标撤权投影为 null、打开失效提示、未知写 journal + 只 GET 恢复；`forbidden`/`recovery` 表面齐全 | 符合 | `src/notifications/service.ts:165-167,92-103`；`frontend/app.tsx:2981-3114`；`frontend/pages/notifications/notifications-page.tsx:113-131` |
| MSG-001/002/003 | done（上下文线程、游标分页、幂等发送） | 线程唯一 per context；两路授权投影 `LIMIT+1` 后合并、消息按 `(sequence,id)` 稳定游标；`author+clientKey` 唯一、线程 `last_sequence` 单调（batch 原子） | 符合（静态） | `src/discussions/{service,repository,authorization}.ts`；`migrations/0037` |
| MSG-004/005 | 实现 done/partial（撤权收缩） | 401/403/404 → revoked 表面并失效并发读；任务删除/转移、知识状态/可见性/空间变化通过触发器收缩 access | 符合 | `frontend/app.tsx:3290-3308`；`migrations/0037` 触发器；`src/discussions/authorization.ts` |
| CAL-001 | done 实现 / 账本「Calendar 页面…pending」 | 事件/专注数据模型、范围校验（≤31 天）、任务/项目归属校验、clientKey 幂等、取消守卫（focus 引用不解除）均在；`/calendar` 页面与测试已存在 | 符合（账本过时；转移重放见 B-06） | `src/calendar/{service,repository}.ts`；`frontend/app.tsx:2562-2663`；`test/unit/frontend-calendar-page.test.tsx` |
| TOD-001 | done（有界聚合） | 单请求聚合 5 个域，UTC 日界，任务 20 / inbox 10 / projects 10 / calendar 20；错误就地可重试；缺 forbidden 区分（B-10） | 部分符合 | `src/today/service.ts:23-42`；`frontend/app.tsx:2680-2698` |
| FOC-001 | done（状态流、client key、刷新恢复、跨成员拒绝） | active/paused/completed/abandoned + 版本 CAS + clientKey 幂等 + 跨成员任务 404 + calendar focus block 同事务；转移重放非服务端收敛（B-06），前端 journal 补偿 | 基本符合 | `src/focus/{service,repository}.ts`；`frontend/app.tsx:2701-2886`；`frontend/lib/focus-*-intent.ts` |
| REV-001 | done（UTC 日/ISO 周、先筛选后限量、单 SQL UPSERT、单调观察/版本） | 单语句 `INSERT … ON CONFLICT DO UPDATE … RETURNING`，样本 LIMIT 20、计数全量（在期间活动集合内），`observedAt` 单调保留 | 符合 | `src/workbench-review/repository.ts:21-74`；`src/workbench-review/service.ts`；`shared/workbench-review-period.ts` |
| INB-001 | done（收集箱、快捕、转任务） | owner-scoped CRUD、clientKey 幂等、转任务在单 D1 事务内写 task+audit+receipt，限额在 SQL 内；知识 promotion 复用现有确认接口 | 符合 | `src/inbox/{service,task-promotion,repository}.ts`；`src/routes/inbox.ts` |
| CAP-001 | done（分类建议、隔离、幂等快照、dismiss） | 后端分类/隔离/幂等快照成立；但无前端入口且 dismiss 可被 classify 覆盖（B-04） | 部分符合 | 见 B-04 |
| GL-001/PRJ-001/P4-001 | done（CRUD、关联、幂等、摘要） | clientKey 幂等；关系变更以项目版本 CAS + `EXISTS` 成员目标守卫并在同一 batch 消费版本；项目/目标/时间线对象归属校验返回 404 | 符合（转移重放见 B-06） | `src/projects/{service,repository}.ts`；`src/goal-tasks/service.ts`；`src/project-timeline/{service,repository}.ts` |
| WB-GR-001 | done（后端合同/授权投影） | 成员绑定、scope/root/depth/types/limit 解析、cursor 绑定、时间线投影、citation 授权过滤均在；节点 `href` 指向不存在路由（B-08） | 部分符合 | `src/graph/{service,repository,types,cursor}.ts`；`src/routes/graph.ts` |

## 测试与门禁证据

**已执行（限定单文件）**

```
npx vitest run test/unit/frontend-boards-page.test.tsx test/unit/frontend-notifications-page.test.tsx
→ Test Files 2 passed (2) / Tests 25 passed (25)
```

说明：这两份是**组件层**测试，恰好证明桌面页脚分页器在组件里可用（`frontend-boards-page.test.tsx:91,173-200`；`frontend-notifications-page.test.tsx:156,199`）；它们不经过 `BoardsRoute`/`NotificationsRoute`，因此不覆盖 B-01/B-02 的路由漏接线。运行输出附带一次 wrangler 日志写入 `EPERM` 告警，未影响用例结果；未运行 worker/全量门禁。

**静态核对的测试覆盖**

- 每条 P1/P2 都定位到了对应测试的**盲区**：boards/notifications 路由测试均显式 `stubListViewport(browser, "mobile")`（`test/unit/frontend-boards-route.test.tsx:33`；`test/unit/frontend-notifications-route.test.tsx:27,409`），desktop 无路由级用例；`test/helpers/list-viewport.ts` 注释明确「无 matchMedia 视为 desktop」，说明测试作者是有意选择移动面。
- 分页门禁脚本只做文件级正则（`scripts/paged-list-contract.test.mjs:38-68`），见 B-03。
- 任务子项/依赖有前端用例（`test/unit/frontend-task-structure.test.tsx`），证伪 TSK-011「前端 pending」。
- CAP-001 只有 `test/worker/capture.test.ts` 的 classify 200 用例，没有 dismiss/重新 classify 用例（B-04 的状态覆盖缺口）。
- 复盘 SQL 的语义有 worker 用例覆盖（`test/worker/workbench-review.test.ts:55,92-95,117-120,133,155,164,172,183-185,200`），与代码一致。

**结论**：现有本地测试对「服务端逻辑 + 组件表面」覆盖较强，但**路由级 props 接线**与**桌面视口路径**是系统性盲区；账本中 done 的「完整数字分页」不能被当前测试证据支撑。

## 局限与未覆盖

- 未运行全量门禁、Worker/D1 测试、真实浏览器与生产环境；所有安全与并发结论均为静态代码核对，未通过请求级复现 B-05/B-07。
- 未读 `.dev.vars`/`SECRETS_FILE`，未联网、未部署、未提交；无法核对生产 D1 schema 是否已应用 0066/0068/0037 等迁移（账本称 0033+ 未远程应用）。
- 前端只精读了任务/看板/通知/消息/今天/专注/复盘路由与页面；`goals/projects/inbox/calendar/project-timeline/graph` 页面只核对了 props 契约与状态枚举，未逐行审阅其内部交互与确认流程。
- 桌面截断（B-01/B-02）是从组件条件渲染静态推导的结论；没有写入/运行临时测试文件（只允许写本报告），因此没有「desktop 下断言 pager 缺失」的运行时输出。建议修复时先补这条用例作为失败证据。
- 未评估 `git` 历史之外的已部署版本；账本的发布/验收 pending 与本次代码事实不冲突。
- 未覆盖范围外路径：管理员队列、资产、知识发布、Agent、环境页（属于 Area A/C 等其他评审域），仅在与通知/任务目标授权交叉处引用。
