# 七个工作区页面：M01 读取旅程与缺口证据

日期：2026-09-13。基线：`codex/admin-audit-recovery`，D02 已本地提交 `5ebdaa0`。本检查点只新增测试与对账文档，不改变业务实现、权限、数据库、Cloudflare 服务或发布状态。

## 本次已证实的范围

新增 `test/unit/frontend-workbench-extended-routes.test.tsx`：实际挂载 App、认证 Shell、路由控制器、页面和数据解析器，只以 fetch fixture 替代网络，不 mock 页面成功状态。每页各 4 项：延迟响应期间 loading → 数据；首次 503 → 用户点击重试 → 相同查询成功；适合该页的空数据状态；撤销 `workspace.tasks` 权限后直达 forbidden 且没有业务读取。另为四个列表各验证一次 opaque cursor 传递、追加、不覆盖旧数据与末页停止，共 **32 项**。

这不是所有操作、真实浏览器或生产验收；服务器导航 fixture 不是实际 D1 菜单投影证据。新增测试没有覆盖创建、编辑、危险操作、重复点击、写入响应丢失、跨页导航点击或迟到请求。不能据此宣布七页功能完全成熟。

| 页面 | 真实读取链路 | 已证实的界面边界 | 本次复跑的 Worker 证据及限制 |
| --- | --- | --- | --- |
| 收集箱 `/inbox` | InboxRoute → loadInbox → `/api/inbox`，limit 20 | 四态、重试、权限、游标追加 | `inbox.test.ts` 4 项：schema、成员 client key 约束、状态、列表隔离/拒绝其他成员 cursor；不等于全部 mutation API 旅程 |
| 目标 `/goals` | GoalsRoute → loadGoals → `/api/goals`，limit 20 | 四态、重试、权限、游标追加 | `goals.test.ts` 4 项：schema、client key、状态/进度约束、菜单权限语义 |
| 项目 `/projects` | ProjectsRoute → loadProjects → `/api/projects`，逐项 `/api/projects/:id/summary` | 四态、重试、权限、游标追加；fixture 摘要成功 | `projects.test.ts` 4 项：schema、成员关系唯一约束、状态/进度、菜单权限语义 |
| 日历 `/calendar` | CalendarRoute → loadCalendar → `/api/calendar/events`，14 天范围、limit 50 | 四态、重试、权限、游标追加 | `calendar.test.ts` 2 项：时间/client key/index 约束、拒绝跨成员任务关系；不是完整 API 交互验收 |
| 今日 `/today` | TodayRoute → loadToday → `/api/today` | 加载/恢复、权限、任务数据；空数据为局部空文案而非整页 empty | `today.test.ts` 1 项：真实 API 有界成员快照及非法查询；已有双成员种子数据，但断言不替代全部泄漏负向矩阵 |
| 专注 `/focus` | FocusRoute → loadCurrentFocus → `/api/focus/current` | 加载/恢复、权限、当前会话；无会话显示新建表单，空任务 ID 禁止启动 | `focus.test.ts` 1 项：真实 API 幂等启动、回读、暂停/恢复/完成、跨成员任务 404；前端写入恢复未验证 |
| 复盘 `/review` | WorkbenchReviewRoute → loadWorkbenchReview → `/api/workbench/review?period=daily` | 加载/恢复、权限、已完成任务；空数据为分区文案 | `workbench-review.test.ts` 1 项：weekly 周期键及拒绝额外参数；只有单成员 fixture，不能声称双成员隔离已完整验收 |

## 原子级后续任务

这些是增量执行子项，归属现有 C03/C04/A02；不是新增总账 atom，也不更改历史 R1–R8 ownership/count。所有未勾选项均待实现或验证；不要把“源码存在”当作行为已通过。

### A02 / M02：成熟度登记（下一检查点）

- [ ] `M02-01..06` 按[登记补齐计划](../superpowers/plans/2026-09-13-workbench-maturity-reconciliation.md)原子同步七条 capability、统一 runtime matrix、操作根、API/持久化链、真实 mutation proof、缺口指纹及负责人，再运行完整合同。新增独立 M01 测试不能代替此项。

### C04：收集箱、日历、今日、专注、复盘

- [ ] `EXT-INB-01` 收集箱数字分页：前后端 page/pageSize/total 一致，URL 恢复、筛选重置和越界页验证；当前只有 cursor/load more。
- [ ] `EXT-INB-02` 收集箱创建稳定意图：前端 createInbox 每次调用重新生成 clientKey；补精确原请求重试、失败恢复、重复点击及成员切换测试，不把 D1 唯一约束当作完整幂等闭环。
- [ ] `EXT-INB-03` 归档/恢复/转任务：逐项覆盖 API → 回读 → 目标链接/权限、重复动作与错误反馈；收集箱初始错误当前复用了搜索重试文案，需改为语义正确的通用/专属文案。
- [ ] `EXT-CAL-01` 日历数字分页与可选日期范围：当前固定本地当天起 14 天、limit 50；补时区、边界跨日及 URL 查询恢复。
- [ ] `EXT-CAL-02` 创建/取消完整旅程：持久化稳定创建意图、校验时间、危险操作确认、写入丢响应及成员隔离；补真实页面操作测试。
- [ ] `EXT-TOD-01` 今日摘要可追溯：当前任务/日程仅文本，最多展示 10 条；补经过权限校验的目标跳转/查看全部，并说明计数与有界快照的区别。
- [ ] `EXT-TOD-02` 今日快照数据契约：当前嵌套数据主要类型断言；逐项验证畸形响应与局部失败，不把异常值显示为零。
- [ ] `EXT-FOC-01` 专注任务选择：当前要求手动粘贴任务 ID；复用有权限的任务选择和分页搜索，明确任务失效/撤权反馈。
- [ ] `EXT-FOC-02` 专注异步生命周期：当前读取 effect 无 cleanup/请求代次；先补卸载/重入/迟到响应测试，再实现取消或代次保护，避免仅凭静态推断断言已泄漏数据。
- [ ] `EXT-FOC-03` 专注启动/转换：稳定启动意图、重复点击、暂停/恢复/结束反馈、计时回读及刷新恢复均需实际页面与 API 串联证据。
- [ ] `EXT-REV-01` 复盘周期切换：当前请求期间保留旧 ready 内容，但周期按钮已切换；补切换 pending 标识、乱序/失败恢复与周期快照一致性测试。
- [ ] `EXT-REV-02` 复盘明细/数据隔离：有界条目需可追溯和查看全部；补双成员数据、未知/失效目标及嵌套响应校验，单成员 weekly 测试不足。

### C03：目标与项目

- [ ] `EXT-GL-01` 目标数字分页及 URL 恢复，前后端一致；当前 cursor/load more 不满足完整数字页码要求。
- [ ] `EXT-GL-02` 目标创建稳定意图、进度/状态操作回读、关联任务及越权/并发完整旅程；当前创建 helper 每次重新生成 key。
- [ ] `EXT-PRJ-01` 项目数字分页、URL 恢复及成员级 total，保留当前已验证的读取隔离要求。
- [ ] `EXT-PRJ-02` 项目摘要局部失败：当前 `Promise.all` 中一个摘要失败会让整次读取失败；补失败行提示/可重试、其他行可用及请求次数边界。
- [ ] `EXT-PRJ-03` 项目创建/状态/目标任务关联/时间线：稳定意图、关联授权、计数回读及页面跳转完整旅程；本次未覆盖参数化 timeline 路由。

### 共同验收边界

- [ ] `EXT-ACCEPT-01` 写入路径按成员验证 IDOR、幂等重放、失败恢复、并发；保持服务端从认证主体取得 member_id。
- [ ] `EXT-ACCEPT-02` 中英文、深浅主题、键盘焦点、移动端、真实双账号和生产旅程另行验收；沿用 shadcn/ui 与免费 Cloudflare 边界，不增加新付费依赖。

## 本轮验证记录

- 提交前 D02 定向回归：`frontend-admin-pagination-routes`、`frontend-admin-pages`、`frontend-workbench-maturity-routes`，**3 files / 126 tests 通过**。
- M01：`frontend-workbench-extended-routes` + 七个对应 Worker 文件，**8 files / 49 tests 通过**（32 新增 + 17 已有），本地 workerd/D1，不是线上验收。
- 故障回注：临时让 TodayRoute 丢弃成功响应，`today: pending read` **1 failed / 31 skipped**，失败位于成功后真实 DOM 等待；随后还原源码，重新执行上述 49 项全部通过。最终不保留源码改动。
- `npm run typecheck` 通过；其现有 tsconfig 不包含新增 `.tsx` 测试，因此不能将它描述为新增测试文件的完整类型验证。
- `npm run build:ui` 通过；仍有 >500 kB chunk 提示，本检查点未处理体积优化。
- `npm run verify:workbench-maturity` 本轮仍为 **12 passed / 1 failed**，原因仅为七个 ready 路由尚未登记；M01 没有修改清单或减弱断言，M02 完成前此门禁不能宣称绿色。

本轮没有运行全量 `npm test/check`，没有浏览器/设备验收，没有合并、推送、迁移或部署。保持所有 release/acceptance 维度不变。
