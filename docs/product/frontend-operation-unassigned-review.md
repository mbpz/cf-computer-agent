# A01 未归属源码候选逐项人工对账

基线：`eb4781fb`，分支 `codex/functional-checklist-completion`。
范围：源码人工对账；不是运行时验收。

本记录保留原索引的全部 110 个未归属坐标，逐项记录条件与行为；不修改生成器的 root、不删除未归属项，也不把 source ID 当成业务操作编号。坐标会随代码移动变化，只用于审计。原索引仍为 270 文件 / 1165 候选 / 110 未归属。分类结果是人工追溯，不是引入了 110 个新功能。

2026-10-10 收件箱恢复修复后重新审阅：`frontend/app.tsx` 的三个未归属外层坐标与行为均未变；新增的恢复导航、损坏记录丢弃及其提示候选归属 InboxRoute，不计入未归属项。更新该文件指纹；当前生成索引为 270 文件 / 1171 候选 / 110 未归属，不扩大本记录的运行验收结论。

2026-10-10 阅读器读取生命周期修复后复核：AppShell与Settings转发候选行为不变；NotFoundPage返回首页链接仅从739行移至757行。读取owner/abort属于KnowledgeReaderSession内部控制流，不新增可见操作。当前270文件/1180候选/110未归属；仅同步该坐标及App源码指纹，不提升运行验收。

2026-10-10 收藏写入恢复后复核：三个App外层候选的属性、回调和前置条件未变，仅坐标移至212:75、239:39、814:250。新增收藏只读恢复入口归属阅读器，不计入未归属项；当前271文件/1184候选/110未归属。更新App指纹，不代替运行验收。

2026-10-11 成员一次性登录授权前端接入后复核：新增 `frontend/lib/admin-member-invitations-data.ts`（数据模块，无控件候选）与成员页授权区块、登录页验证码表单（均归属各自页面路由，不计入未归属项）。`frontend/app.tsx` 的三个外层候选属性与行为未变，仅因新增一行导入下移至214:75、241:39、925:250；同步该文件指纹。当前272文件/1203候选/110未归属，不扩大本记录的运行验收结论。

2026-10-11 落地页登录入口改为 `/login` 后复核：落地页 CTA 由 `/auth/github` 直跳改指 `/login`（指向两名方式登录页，仍属 public 共享面，未归属项不变），`frontend/app.tsx` 新增已认证 `/login` → `/` 的 replace 重定向 effect，不影响三个外层候选的行为，仅使坐标移至220:75、247:39、931:250。当前仍为272文件/1203候选/110未归属；同步 `frontend/app.tsx` 与作为 caller 证据的 `frontend/pages/workbench-landing/public-workbench-page.tsx` 指纹，不扩大本记录的运行验收结论。

2026-10-16 成员提交闭环接线后复核：`/submit` 接入服务端草稿（`frontend/lib/submission-draft-data.ts`、`use-submission-draft.ts`）、成员侧目标选择器、被退回条目的重提与只读评论面（`frontend/lib/submission-resubmit-data.ts`、`submission-targets-data.ts`、`submission-comments-data.ts`、`components/submissions/*`），附件链路补上链接取件、替代内容与原始/解析下载。`frontend/app.tsx` 的两个未归属外层候选属性、回调与前置条件未变，仅因新增导入与路由 props 下移至 231:106、258:39；同步 `frontend/app.tsx` 及作为 caller 证据的 `frontend/features/environments/files/asset-import-panel.tsx`、`asset-import.ts` 指纹，不扩大本记录的运行验收结论。

2026-10-16 环境页文件面与运行时挂载后重新分类：`/environments` 现由正式页面组合并挂载文件面（[source:frontend/features/environments/environments-page.tsx] 渲染 `EnvironmentFiles`，[source:frontend/features/environments/environment-files-surface.tsx] 惰性 import `files-panel.tsx`，并传入真实 `submission.memberId`；[source:frontend/features/environments/environment-vm-composition.ts] 在挂载时创建 owner 作用域 runtime 与本地 checkpoint store，由 `reconcile-checkpoints.ts` 对账）。但本版本**有意不发布 VM 引擎与镜像**（六件固定启动产物约 66 MiB，pin 不授权再分发、不构成许可证清单或签名发布清单），因此没有任何环境能进入 running。故新增分类 `vm-runtime-unshipped`（77 项：文件面板 34、资产导入 23、知识导入 14、流式下载 2、checkpoints 2、account-vm-runtime 1、authenticated-vm-runtime 1），`vm-not-mounted` 缩减为 6 项（连接器/会话/网络 lifecycle 惰性路径）。当前生成索引为 341 文件 / 1430 候选 / 121 未归属。不提升任何运行验收结论。

2026-10-16 写入收敛对账与本批其它接线后复核：`frontend/app.tsx` 的两个未归属外层边界候选（navigate/logout 转发与 settings props 透传）属性、回调与前置条件均未变，坐标仍为 231:106、258:39；未归属候选集合与分类处置未变，仅同步该文件指纹（文件仍含本批其它 slice 的路由 props 与导入改动），不扩大本记录的运行验收结论。索引重生成后为 342 文件 / 1440 候选 / 121 未归属。

2026-10-16 知识生命周期与批量审核前端接入后复核：本 slice 在 `frontend/app.tsx` 增加两条路由导入与两个 renderPage 分支（`admin-knowledge-trash`、`admin-knowledge-item`）并给复核队列传入 capability 答案，未改动 `navigate`/`logout` 转发与 settings props 透传的任何属性、回调或前置条件，因此该文件的两个 `app-boundary` 候选仍成立，仅因新增两行导入下移至 234:106、261:39；同步该文件指纹。新增的管理面（`frontend/pages/admin/recycle-bin-{route,page}.tsx`、`frontend/pages/admin/knowledge-item-{route,page}.tsx` 与其数据模块 `frontend/lib/admin-knowledge-{trash,item}-data.ts`、操作身份 `frontend/lib/knowledge-lifecycle-intent.ts`）已在 `shared/workbench-maturity-capabilities.ts` 登记为能力根 `workbench-admin-recycle-bin`、`workbench-admin-knowledge-trash`、`workbench-admin-knowledge-item`（root symbol 分别为 `RecycleBinRoute` 与 `AdminKnowledgeItemRoute`），整页候选由以 root symbol 为起点的图覆盖，按 `workbench-admin-role-new`/`workbench-admin-role-detail` 先例不计入未归属项，故本记录不为这些文件补写处置行或指纹；批量审核工具条位于已登记根 `frontend/app.tsx#ReviewQueueRoute` 之内，其 `POST /api/admin/submissions/batch-review` 调用已记入该能力域的写入事实。当前生成索引为 365 文件 / 1525 候选 / 121 未归属，不扩大本记录的运行验收结论。

2026-10-16 admin 回收站与知识条目能力根登记后重新对账：`shared/workbench-maturity-capabilities.ts` 新增三条能力记录与对应 root——`workbench-admin-recycle-bin`（menu 路由 `/admin/knowledge/trash`）与 `workbench-admin-knowledge-trash`（同路径的 pageKind），root 均为 `frontend/pages/admin/recycle-bin-route.tsx#RecycleBinRoute`；`workbench-admin-knowledge-item`（pageKind `/admin/knowledge/:id`），root 为 `frontend/pages/admin/knowledge-item-route.tsx#AdminKnowledgeItemRoute`。生成索引随之由 36 条路由增至 39 条。上一轮记为未归属的 admin 管理面候选（`frontend/pages/admin/recycle-bin-{route,page}.tsx`、`frontend/pages/admin/knowledge-item-{route,page}.tsx` 及数据模块 `frontend/lib/admin-knowledge-{trash,item}-data.ts`、`frontend/lib/knowledge-lifecycle-intent.ts`）随这三条 root 归入对应路由，未归属候选由 147 降至 121；这些坐标上一轮未补写处置行，故本轮无需从表格删除任何行。`frontend/app.tsx` 的两个外层 `app-boundary` 候选（234:106、261:39）及其指纹与上一轮一致，本轮不新增也不改动任何来源指纹，只重生成生成器产物 `docs/product/frontend-operation-inventory.{json,md}`。当前索引 365 文件 / 1525 候选 / 121 未归属，不扩大本记录的运行验收结论。

2026-10-16 成员草稿丢弃入口接入后复核：`/submit` 的草稿状态行新增受确认门禁的「丢弃草稿」控件（`frontend/pages/submit-page.tsx`，`onDraftDiscard`），丢弃写经 `frontend/lib/use-submission-draft.ts` 与 `frontend/lib/submission-draft-data.ts` 复用同一份写入 journal（先复查再重发同一操作，未确认的结果不当作已丢弃），服务端为 `DELETE /api/submissions/drafts/:id`（`src/routes/member.ts`、`src/submissions/service.ts`、`src/submissions/repository.ts`、迁移 `0073_submission_draft_discard_receipts.sql`）。`frontend/app.tsx` 的两个未归属外层边界候选（navigate/logout 转发与 settings props 透传）属性、回调与前置条件均未变，本轮改动均在其坐标 234:106、261:39 之后，坐标因此未动；未归属候选集合与分类处置未变，只同步该文件指纹。索引重生成后为 365 文件 / 1533 候选 / 121 未归属。本轮未改动本记录的任何处置行，也不扩大本记录的运行验收结论。

2026-10-17 beUI 全量采用（Wave 1）后重新对账：本批把告警、按钮、卡片、菜单、弹层与 agent 消息一族换成 beUI 源码落地副本（`frontend/components/motion/{alert,card,context-menu,popover,preview-rail}.tsx`、`motion/button/stateful.tsx`、`frontend/components/agents/{agent-activity/*,loading-states/reasoning-text,message,message-bubble,message-scroller,streaming-response}.tsx`），并把 `components/ui/{alert,button,card}.tsx` 改为适配器（前两者本地包装、card 为纯再导出）。未归属候选由 121 变为 **159**（净增 38）：本批最终新增 39 条坐标、移除 1 条（`frontend/components/ui/card.tsx:13:85`，其部件候选随实现移入 `motion/card.tsx`）、按 handler 配对重记 45 条既有坐标（`asset-import-panel.tsx` 23、`knowledge-import-panel.tsx` 14、`shell/context-rail.tsx` 6、`app.tsx` 2，前三者因顶部新增一行导入整体下移一行）；核对期间并行的 agent slice 在 `pages/agent-page.tsx` 接入 `StreamingResponse`、`AgentActivity`、`ReasoningText` 与 `Message` 一族，其中 20 条坐标随之归属路由并从本记录的候选表移除（见文末小节）。逐项处置见下表与文末 2026-10-17 小节；本轮只同步相关指纹，不代替运行验收。

2026-10-17 beUI 全量采用（Wave 3）后重新对账：本批落地 `motion/range-slider.tsx` 与 `lib/hooks/use-slider.ts`、`motion/date-range-picker.tsx` 及 `motion/date-range-picker/{context,date-utils,types,use-date-range-picker}.ts`、`ui/date-range-input.tsx`，并更新 tooltip/popover/context-menu/breadcrumb/collapsible 安装副本与 agent 聊天部件、`ui/{skeleton,dialog,select,textarea,page-state}.tsx` 适配器内部。这些来源的候选绝大多数已被正式消费者覆盖（`range-slider` 由 `goals-page`、`ui/date-range-input` 由搜索页与「我的提交」页、`breadcrumb` 由 `app-shell`、`collapsible` 由知识阅读器与衍生面板、`tooltip` 经 `ui/tooltip.tsx` 被页头消费、agent 部件由 `agent-page`），故未归属候选仅由 159 变为 **162**：新增 3 条（`motion/date-range-picker.tsx` 的 `DateRangePickerTrigger`/`DateRangePickerContent`/`DateRangePickerDropdown` 便捷组合层，归 `unmounted-ui`——适配器自绘触发器、未使用它们），并按 handler 重记 1 条（`lib/use-toast.tsx` 29:7→28:7）。只同步 `app.tsx`、`lib/use-toast.tsx` 与新增来源的指纹，`package.json` 的依赖变化（移除 `@radix-ui/react-tooltip`、改为直接依赖 `@floating-ui/dom`）不产生候选行。不扩大本记录的运行验收结论。

2026-10-17 beUI 全量采用（Wave 4，100%）后重新对账：本批采用此前被否决的载荷（矩阵 §17，逐片结果 §18–§20）——`motion/{animated-sidebar,combobox/**,magnetic}`、`motion/button/{magnetic,metallic}.tsx`、`motion/action-swap{,-roll}.tsx` 首次落地；`motion/center-morph-modal.tsx`（经 `ui/dialog.tsx`）与 `motion/popover.tsx`（经 `app-shell.tsx`）打补丁后接入，原先否决它们的理由随之消除；`ui/dropdown-menu.tsx` 因此在 shell 换用 beUI 菜单后失去唯一消费者。未归属候选由 162 增至 **192**：新增 36 条（`animated-sidebar` 13、`ui/dropdown-menu` 7、`combobox/**` 10、其余 6），旧行 6 条（`center-morph-modal` 4、`popover` 2）随打补丁接入归属并从本记录移除，无既有坐标位移。分类按**实际渲染面**而非按文件：经 `ui/filter-select.tsx` 挂载的 combobox 根监听、`inline` 面板、listbox 与 option 行记 `app-boundary`（静态图仍不跟随 barrel `motion/combobox.tsx` 的纯再导出），无人使用的部件与整组零 import 的载荷记 `unmounted-ui`。指纹新增 11 条、刷新 2 条（`environments-page.tsx`、`files-panel.tsx`），移除两条已归属来源的指纹。不扩大本记录的运行验收结论。

2026-10-17 成员页双页签与 `ui/tabs` 改为组合 `motion/tabs` 后重新对账：`components/ui/tabs.tsx` 由自绘改为在已安装载荷 `motion/tabs.tsx` 外做适配器（导出名不变；§17 的两处 attribute-passthrough 补丁把 rest props 透到布局根、把 `hidden`/`data-state`/rest 透到面板），并由 `frontend/pages/admin/members-page.tsx:8` 渲染成「成员 / 授权记录」两页签。于是本文件原先 4 条未归属候选（`35:93`/`40:10`/`66:10`/`74:10`）随该路由归属，坐标变为 `67:5`/`73:10`/`103:10`/`121:10`，本节改写为“0，已归属”并撤下指纹；`motion/tabs.tsx` 的 8 条候选与 `members-page.tsx` 的重排都不产生未归属项。同一轮里 `components/ui/dropdown-menu.tsx` 作为死代码被删除（Wave 4 已记录它失去唯一消费者），其 7 条 `unmounted-ui` 行与指纹随之撤回。未归属候选 192 → **181**，分类计数按行实测改为 app-boundary 30、unmounted-ui 60（上轮表格里的 71 是早期估算，未随行数校正）。不扩大本记录的运行验收结论。

2026-10-17 成员页页签写入 URL 后重新对账：`AdminMembersRoute` 在 `frontend/app.tsx` 增加 `changeTab`、挂载/搜索条件归一化 effect 与一条 `subscribeWorkspaceLocation` 分支，并新增纯派生助手 `frontend/lib/admin-members-query.ts`（`isAdminMembersTab`/`parseAdminMembersTab`/`writeAdminMembersTab`/`normalizeAdminMembersTab`）。本文件的两个未归属外层候选（AppShell 的 navigate/logout 转发、SettingsPage 的 props 透传）属性、回调与前置条件均未变，仅因新增一行下移至 **236:106 / 263:39**，逐字重记；新助手没有任何 JSX/监听器候选（解析、写串、归一化都无副作用），`members-page.tsx` 的 25 条候选全在该路由 root 内，故未归属候选仍为 **181**。同步 `app.tsx` 与 `lib/workspace-location.ts` 指纹（后者仅一行编辑，其 `63:3` 候选未动）。不扩大本记录的运行验收结论。

2026-10-18 零原生基元后重新对账：本批把共用表单基元全部落到 beUI 载荷——`frontend/components/ui/select.tsx` 改为 `motion/select` 复合列表箱的再导出（原生 `<select>`/`<option>` 实现删除）、`ui/input.tsx` 与 `ui/checkbox.tsx` 改为 `motion/input`／`motion/checkbox` 的适配层、`ui/textarea.tsx` 承接字段壳（beUI 无 textarea slug）、`ui/expandable-tabs.tsx` 改为新落盘载荷 `motion/expandable-tabs.tsx` 的适配层；页面侧把对比产物表格改 `bouncy-accordion`、通知未读数改 `number-ticker`、成员评论改 `agents/message-bubble`。原生 `<option>` 候选随实现消失（`asset-import-panel` 2 条、`knowledge-import-panel` 2 条、`files-panel` 1 条），未归属候选 164 → 159；其余 35 个文件的候选只随行号位移重记，[source:frontend/app.tsx] 的 `app-boundary` 两条仍为 236:106、263:39（本批未改该文件）。索引重生成后为 476 文件 / 1772 候选 / 159 未归属；同步 4 条变更来源指纹（`motion/animated-sidebar.tsx` 仅文件头措辞、三个 environment 文件为输入控件替换），不扩大本记录的运行验收结论。


## 分类结果与下一步

| 分类 | 候选数 | 已确认的源码含义 | 尚需完成 |
| --- | ---: | --- | --- |
| app-boundary | 30 | App 外层、history fault 与账户 owner 已有正式消费；2026-10-17 增记被 App/路由实际渲染、但声明侧不在 root 图内的边界（`StatefulButton`、Card 根与四个部件、`MessageBubble`/`MessageBubbleContent`、`MessageScroller` 的视口/内容区/根节点，以及经 barrel 挂载的 `combobox` 根监听、inline 面板、listbox 与 option 行） | 跨路由、真实身份/退出、导航故障旅程 |
| public-dynamic | 5 | landing 动态导入的 WebGL 生命周期 | 原生浏览器可见性、超时、context loss 与回退验收 |
| background | 3 | Service Worker 生命周期，不是可见控件 | 真实浏览器注册/缓存/离线行为 |
| unmounted-ui | 60 | ContextRail 无当前正式消费者；2026-10-17 的 beUI 副本里，库内动作与无调用点的部件都归此类：`motion/context-menu.tsx`、`motion/preview-rail.tsx`（仅在无人传入的 `navigation="rail"` 下渲染）、`motion/animated-sidebar.tsx` 的 13 个未用部件、`action-swap{,-roll}` 的按钮/图标、`button/{magnetic,metallic}.tsx` 与 `magnetic.tsx`、`combobox` 的空态/回退触发器/内部 input/portal 分支、`date-range-picker` 的便捷组合层、`agents/message*.tsx` 的无调用点部件、`AlertAction`、`CardAction`、`CardFooter` 与 card 的 interactive 按压路径。（`Tabs` 已在 2026-10-17 由成员页消费、`ui/dropdown-menu.tsx` 已删除，两者都不再属于本类。） | 按实际需求保留或接线；不得直接认定缺失业务 |
| vm-runtime-unshipped | 77 | 正式 `/environments` 页面已挂载、创建或惰性加载文件面、运行时与本地快照；本版本**有意**不发布 VM 引擎与镜像（六件启动产物约 66 MiB，pin 不授权再分发、不构成许可证清单或签名发布清单），因此面向用户或面向 VM 的动作永久不可用：禁用、不渲染，或只存在于无法成功启动的路径。按状态命名而非按模块，引擎发布决策改变后自然翻转。 | 不要读成“未接线”，也不要当成按需修复的缺陷；待引擎发布决策改变后再重新分类 |
| vm-not-mounted | 6 | 连接器、会话与网络 lifecycle 惰性路径仍无正式调用者：只有显式 connect/open 才创建，页面挂载不会 | 沿既有 G0 边界完成正式接线及身份/生命周期验收 |

A01、A02、A05、D04 仍开放。源码人工分类覆盖这 181 项，但 A01 还缺每页实际可见性、动态 HTML/门户/第三方控件和触发状态的呈现核验；A02 还缺全操作到服务端授权/持久化及运行证据的闭合。禁止把文档行数、指纹或绿色测试当作上述父项验收通过。

下表“条件”与组内共同守卫叠加。状态提示、role、option、props 转发和监听器均保留；不是每一行都对应一次用户操作。未挂载项的条件均是假设调用者接线之后的源码条件，不能误读为当前正式页面已可用。

## `frontend/app.tsx`（2）

入口为 [source:frontend/main.tsx] 的 App。App 先处理 sessionError、匿名首页/登录、会话加载，再挂载 AccountNetworkBoundary、AppShell、HistoryNavigationNotice。属于全局外层，不在以业务 root symbol 为起点的图中。SettingsPage 行是 props/spread 边界，不是新的保存动作。原属本文件的两条 AdminRoleCreatePage/AdminRoleDetailPage JSX 边界（429:10、438:10）：两个包装器在 renderPage 的 admin-role-new/admin-role-detail 分支渲染；admin-role-new / admin-role-detail 现已在 `shared/workbench-maturity-capabilities.ts` 登记为能力根 `workbench-admin-role-new` / `workbench-admin-role-detail`，这两条候选随 root symbol `AdminRoleNewRoute` / `AdminRoleDetailRoute` 归入对应路由，2026-10-16 起从本记录移除。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/app.tsx:236:106` | app-boundary | 已认证会话通过外层守卫；AppShell 内部触发导航/退出 | navigate 写入 workspace history；logout(owner) 执行账户退出，具体按钮与 pending 仍由 AppShell 控制。 |
| `frontend/app.tsx:263:39` | app-boundary | renderPage 进入 settings 且存在 session | 将 locale、member email/role 传入 SettingsPage；没有新增网络写入。 |

## `frontend/components/agents/agent-activity/activity-row.tsx`（0）

本文件是 beUI agent 活动行的落地副本。核对期间并行的 agent slice 在 `frontend/pages/agent-page.tsx` 接入 `AgentActivity`，`activity-row.tsx` 的活动行候选随该能力根进入 root 图，不再计入未归属项。原先单条候选（`SearchResultRow` 的 `<a href={result.url}>`，只渲染上游给出的搜索结果地址、不改写 URL）的处置随本次归属一并撤销，历史措辞见本轮对账记录。

## `frontend/components/agents/agent-activity/index.tsx`（0）

`AgentActivity` 现由 `frontend/pages/agent-page.tsx` 渲染，本文件的 5 条候选（working 状态行、摘要展开按钮、`AgentDisclosure` 容器、活动列表与逐项 listitem）随该路由 root 归入能力图，不再计入未归属项。这些动作只切换本地展开与观看流式追加，没有网络写入。

## `frontend/components/agents/citations.tsx`（1）

beUI citations 组件的落地副本，由 agent 答案面板（`frontend/components/agent/answer-panel.tsx`）消费其 `Citations` 折叠来源列表。唯一未归属候选是未被产品调用的内联角标组件 `Citation`（需要答案正文内嵌标记，当前答案正文是纯文本）。[source:frontend/components/agent/answer-panel.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/agents/citations.tsx:81:5` | unmounted-ui | 仅当调用方渲染内联角标 `Citation` 时挂载；当前无调用点 | 锚点指向 `#<idPrefix>-<citationId>` 定位同页来源行；默认英文 `View citation {index}` 仅在该未接线组件内出现。 |

## `frontend/components/agents/loading-states/reasoning-text.tsx`（0）

`ReasoningText` 现由 `frontend/pages/agent-page.tsx` 的推理状态渲染，本文件的 4 条候选（role=status 容器、cascade/scramble/swap 三种短语动效）随该路由 root 归入能力图，不再计入未归属项。这些动作只是本地短语轮播与 CSS 动画，没有网络写入。

## `frontend/components/agents/message-bubble.tsx`（3）

beUI 气泡的落地副本。`components/agent/agent-transcript.tsx:1` 由 `frontend/app.tsx:1425` 渲染，并在其中使用 `MessageBubble` 与 `MessageBubbleContent`，因此这两个部件虽未进入以 root symbol 为起点的图（静态图不追到这条声明处），却是产品实际挂载的表面，记 `app-boundary`；`MessageBubbleGroup`、`MessageBubbleCollapsible` 与其折叠按钮当前无调用点，记 `unmounted-ui`。全部部件只转发调用方 props/children，折叠状态为本地或调用方受控，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/agents/message-bubble.tsx:281:5` | unmounted-ui | 仅当调用方渲染 `<MessageBubbleGroup>`（当前无调用点） | 转发 props/children 到 flex 容器，按 spacing 选间距；自身无动作。 |
| `frontend/components/agents/message-bubble.tsx:330:5` | unmounted-ui | 仅当调用方渲染 `<MessageBubbleCollapsible>`（当前无调用点） | 转发 props/children 到带 data-state 的容器，未展开时用行数裁剪与遮罩；折叠状态来自本地或调用方。 |
| `frontend/components/agents/message-bubble.tsx:348:7` | unmounted-ui | 仅当上述折叠部件被渲染且按钮点击（当前无调用点） | setOpen(!currentOpen)（受控时回调 onOpenChange）；按钮 aria-expanded/aria-controls 指向内容，不写业务状态。 |

## `frontend/components/agents/message-scroller.tsx`（0）

beUI 消息滚动区的落地副本。`components/agent/agent-transcript.tsx:16` 渲染 `<MessageScroller>`（App 的历史区域），因此视口、内容区与根节点三条候选虽未进入 root 图，仍是产品实际挂载的容器，记 `app-boundary`；`navigation="rail"` 无调用点传入，故 `PreviewRail` 那条（`:462`）在实际产品中不渲染，记 `unmounted-ui`。视口事件只维护本地“跟随最新”状态，其余是转发与展示，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |

## `frontend/components/agents/message.tsx`（4）

beUI 消息原语的落地副本。`components/agent/answer-panel.tsx:3` 与 `components/agent/agent-transcript.tsx:1` 已 import `Message`、`MessageBubble(Content)`、`MessageContent`、`MessageFooter`、`MessageHeader`、`MessageScroller`，其中 `Message`/`MessageContent`/`MessageHeader`/`MessageFooter` 四条候选已随消费者归属，剩 `MessageGroup`、`MessageAvatar`、`MessageMarker`、`MessageTyping` 四个部件无调用点，故仍为未归属（声明侧坐标不随调用点归属变化）。剩余四条都是容器：只透传 props/children，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/agents/message.tsx:144:5` | unmounted-ui | 仅当调用方渲染 `<MessageGroup>`（当前无调用点） | 转发 props/children 到 flex 容器，按 spacing 选间距；自身无动作。 |
| `frontend/components/agents/message.tsx:163:5` | unmounted-ui | 仅当调用方渲染 `<MessageAvatar>`（当前无调用点） | 转发 props/children 到圆形容器；placeholder 为真时 aria-hidden 且不可见（占位对齐用）。 |
| `frontend/components/agents/message.tsx:228:5` | unmounted-ui | 仅当调用方渲染 `<MessageMarker>`（当前无调用点） | 转发 props/children 到居中的分隔条容器；无动作。 |
| `frontend/components/agents/message.tsx:247:5` | unmounted-ui | 仅当调用方渲染 `<MessageTyping>`（当前无调用点） | 转发 props/children 与 label 到 span（typing 动效受 reduced-motion 门控）；无动作。 |

## `frontend/components/agents/streaming-response.tsx`（0）

`StreamingResponse` 现由 `frontend/pages/agent-page.tsx:15` 渲染，本文件的 6 条候选（内部 `ResponseAction`、复制、重试、赞/踩、来源展开）随该路由 root 归入能力图，不再计入未归属项。这些动作只调用调用方回调或改本地状态，唯一对外副作用是可选剪贴板写入，没有服务端写入。

## `frontend/components/history-navigation-notice.tsx`（2）

App 外层挂载：[source:frontend/app.tsx]。无 fault 时返回 null；故障消息和重试按钮是同一故障状态的两个源码候选，不是两个业务功能。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/history-navigation-notice.tsx:11:10` | app-boundary | 已登录 App 挂载且 history fault 非空 | role=alert 呈现历史导航故障；无写接口。 |
| `frontend/components/history-navigation-notice.tsx:13:5` | app-boundary | 同上且 retrying 为 false 时点击 | retryWorkspaceHistory；等待期间禁用按钮，finally 清除 pending；失败仍不视为导航完成。 |

## `frontend/components/motion/action-swap-roll.tsx`（2）

beUI action-swap 的 roll 变体包装（vendored 载荷，`beui.dev/components/motion/action-swap` 一族）。第一方唯一消费者是 `components/agents/todo-list.tsx:39`，且它只取 `ActionSwapRollText`，因此 `ActionSwapRollButton`/`ActionSwapRollIcon` 没有调用点，记 `unmounted-ui`；两者只是把 `animation="roll"` 固定后透传给 `action-swap.tsx` 的实现，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/action-swap-roll.tsx:23:10` | unmounted-ui | 仅当调用方渲染 `ActionSwapRollButton` 时出现（当前无调用点） | 以 `animation="roll"` 渲染 `ActionSwapButton` 并透传其 props；按钮状态与回调全部来自调用方。 |
| `frontend/components/motion/action-swap-roll.tsx:31:10` | unmounted-ui | 仅当调用方渲染 `ActionSwapRollIcon` 时出现（当前无调用点） | 以 `animation="roll"` 渲染 `ActionSwapIcon` 并透传 props；仅图标动画。 |

## `frontend/components/motion/action-swap.tsx`（1）

beUI action-swap 载荷本体。同族里 `ActionSwapText` 由 `todo-list.tsx` 与 `notification-stack.tsx` 使用，`ActionSwapButton` 这条没有调用点（其 roll 包装也未被使用），记 `unmounted-ui`。按钮的状态轮换只在本地 `useState` 与调用方回调之间发生，不发请求。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/action-swap.tsx:313:5` | unmounted-ui | 仅当调用方渲染 `ActionSwapButton` 且 activeItem 存在时出现（当前无调用点） | motion.button：点击先调用调用方 `onClick`，未被 preventDefault 且 `cycle` 与 `nextItem` 成立时推进到下一项（受控时不改内部值），再回调 `onValueChange(id, item)`；`aria-label` 取 item.ariaLabel 或 iconOnly 时的 label；无网络写入。 |

## `frontend/components/motion/alert.tsx`（1）

beUI 告警的落地副本。`components/ui/alert.tsx` 把它适配成应用唯一 Alert：适配器在自身 `Alert` 内直接引用 `AlertIcon`/`AlertClose`（按 `child.type` 分流）并渲染 `AlertContent`，这三类候选随 25 处调用点归属各自路由；`AlertAction` 只在适配器里被 `export`，从未被渲染，因此仍为未归属。本文件不发起网络写入，关闭/动作按钮的行为由调用方传入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/alert.tsx:219:10` | unmounted-ui | 仅当调用方渲染 `AlertAction` 并传入 children/props 时出现；当前 25 处 `<Alert>` 调用点无一使用该部件 | 渲染调用方 children/props 的 `flex-wrap` 容器（`pt-2`），供放置按钮或链接；自身不渲染按钮、不发请求，注释也声明不嵌套按钮。 |

## `frontend/components/motion/animated-sidebar.tsx`（13）

beUI 侧栏载荷（vendored）。`components/shell/app-shell.tsx:8` 已采用它的 `AnimatedSidebarProvider`、`AnimatedSidebar`、`Menu`/`MenuButton`/`MenuItem`/`MenuSub`，这些部件的候选随 shell 归属；下列 13 个部件 app-shell 没有使用（`Trigger`/`Close`/`Rail` 的按钮改由 shell 自己的触发器承担，`Inset`/`Header`/`Content`/`Footer`/`Group` 一族与 `MenuSubItem`/`MenuSubButton` 未出现在任何调用点），故记 `unmounted-ui`。它们都只转发调用方 props/children 或切换本侧栏的开合状态，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/animated-sidebar.tsx:665:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarTrigger` 时出现（当前无调用点） | button：转发 props/ref，`aria-label` 缺省 "Toggle sidebar"，`aria-expanded` 取移动端或桌面开合态；点击先调调用方 onClick，未被 preventDefault 时 `toggleSidebar()`。 |
| `frontend/components/motion/animated-sidebar.tsx:703:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarClose` 时出现（当前无调用点） | button：点击先调调用方 onClick，未被 preventDefault 时移动端 `setOpenMobile(false)`、桌面 `setOpen(false)`；仅本地开合。 |
| `frontend/components/motion/animated-sidebar.tsx:737:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarRail` 时出现（当前无调用点） | button：点击（未被 preventDefault）`toggleSidebar()`，用于收起/展开窄轨；不写业务状态。 |
| `frontend/components/motion/animated-sidebar.tsx:767:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarInset` 时出现（当前无调用点） | motion.main 承载侧栏旁的主内容区，转发 props/children；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:785:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarHeader` 时出现（当前无调用点） | div 转发 props/children（data-slot=sidebar-header）；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:799:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarContent` 时出现（当前无调用点） | div 转发 props/children（滚动区容器）；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:816:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarFooter` 时出现（当前无调用点） | div 转发 props/children；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:833:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarGroup` 时出现（当前无调用点） | div 转发 props/children（分组容器）；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:852:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarGroupLabel` 时出现（当前无调用点） | div 转发 props 并渲染 children 作为分组标题；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:876:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarGroupContent` 时出现（当前无调用点） | div 转发 props/children；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:973:5` | unmounted-ui | 仅当调用方渲染 `AnimatedSidebarMenuSubItem` 时出现（当前无调用点） | motion.li 转发 props/children（二级菜单行容器）；无动作。 |
| `frontend/components/motion/animated-sidebar.tsx:1050:5` | unmounted-ui | 仅当调用方给 `AnimatedSidebarMenuSubButton` 传 href 时出现（当前无调用点） | motion.a（href/target/rel 由调用方给）：点击先调 props.onClick，未被 preventDefault 时 `select()` 回调 `onSelect`，移动端按 `closeOnSelect` 关闭侧栏；导航本身由 href 决定。 |
| `frontend/components/motion/animated-sidebar.tsx:1073:5` | unmounted-ui | 仅当 `AnimatedSidebarMenuSubButton` 无 href 时出现（当前无调用点） | motion.button：点击先调 props.onClick，未被 preventDefault 时同样 `select()`（回调 `onSelect`、移动端可关闭）；不发请求。 |

## `frontend/components/motion/animated-toast-stack.tsx`（4）

beUI 通知栈的落地副本，由 `frontend/lib/use-toast.tsx` 的 `ToastProvider` 在 App 边界挂载一次。它不是路由能力，也不属于任一业务 root，故逐项登记。[source:frontend/lib/use-toast.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/animated-toast-stack.tsx:301:11` | app-boundary | Provider 传入 toasts 后逐条渲染 | 按 toast.id 渲染；本身不发起任何网络请求。 |
| `frontend/components/motion/animated-toast-stack.tsx:352:5` | app-boundary | 通知入队或出队时 | 入场/退场动画；仅当横向拖拽超过 72px 或速度超过 520 才视为关闭。 |
| `frontend/components/motion/animated-toast-stack.tsx:480:17` | app-boundary | 通知带 action 且用户点击该按钮 | 调用调用方传入的 `action.onClick(toast)`；组件自身不执行写入。 |
| `frontend/components/motion/animated-toast-stack.tsx:494:15` | app-boundary | canDismiss 为真且用户点击关闭 | 调用 `onDismiss(toast.id)`；`aria-label` 由调用方以本地化文案传入（`COMMON_DISMISS`）。 |

## `frontend/components/motion/button/magnetic.tsx`（1）

beUI 磁性按钮载荷（`beui.dev/components/motion/button` 的 button-magnetic），第一方零 import，记 `unmounted-ui`。它只是把 `Magnetic` 包装套在 `Button` 外并透传 props，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/button/magnetic.tsx:21:7` | unmounted-ui | 仅当调用方渲染 `MagneticButton` 时出现（当前无调用点） | 在 `Magnetic strength`（默认 0.25）内渲染 beUI `Button`，转发 ref/children/其余按钮 props；点击语义仍由调用方回调决定。 |

## `frontend/components/motion/button/metallic.tsx`（1）

beUI 金属质感按钮载荷，第一方零 import，记 `unmounted-ui`。hover 只切换本地高亮状态并回调调用方，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/button/metallic.tsx:50:5` | unmounted-ui | 仅当调用方渲染 `MetallicButton` 时出现（当前无调用点） | 渲染 ghost 变体的 `Button`：`onHoverStart/onHoverEnd` 先置本地 `hovered` 再回调调用方；`paused` 或 reduced-motion 时停用动画；无请求。 |

## `frontend/components/motion/button/stateful.tsx`（1）

beUI 状态按钮的落地副本。[source:frontend/components/ui/button.tsx] 只把它**纯再导出**（`export { StatefulButton, type ButtonState, type StatefulButtonProps } from "../motion/button/stateful"`，没有本地包装或 JSX 使用），而静态图不沿纯再导出追到声明处，因此声明侧候选仍未归属；唯一调用点是登录页的验证码提交按钮（`frontend/pages/login-page.tsx` 的 `<StatefulButton type="submit" state={pending ? "loading" : "idle"}>`，该调用点候选已归属登录页）。组件只渲染状态文案/图标并转发按钮 props，提交行为由调用方 `type="submit"`/`onClick` 决定。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/button/stateful.tsx:209:5` | app-boundary | 调用方渲染 `StatefulButton` 并传入 state、children、loadingText/successText/errorText、icon 与其余按钮 props | 渲染 beUI `Button`：`disabled` 与 loading 合并、`aria-busy` 反映 state（`whileHover` 置空）、其余 props 透传；文案与图标随本地 state 切换，组件自身不发请求（提交/导航由调用方的按钮语义触发）。 |

## `frontend/components/motion/card.tsx`（10）

beUI 卡片的落地副本，经 [source:frontend/components/ui/card.tsx] 纯再导出成为应用唯一 Card（24 个文件从该适配器 import，`CardHeader` 28 处、`CardContent` 35 处、`CardTitle` 28 处、`CardDescription` 2 处使用）；静态图不沿纯再导出追到声明处，故本文件声明侧候选仍未归属，而页面内调用点候选已归属各自路由。`interactive`、`size="compact"` 当前无调用点传入，`CardAction`/`CardFooter` 也无调用点。全部部件只转发调用方 props/children，另加本地按压反馈，不发请求。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/card.tsx:107:5` | unmounted-ui | 仅在调用方传 `interactive`、未 reduce-motion、按下未在进行中时注册（当前无调用点传 interactive） | window pointerup 监听：结束按压并摘下自身与另两个临时监听器，回弹 scale。 |
| `frontend/components/motion/card.tsx:108:5` | unmounted-ui | 同上（pointercancel 分支） | window pointercancel 监听：取消按压并回弹 scale；与 pointerup 同一 release。 |
| `frontend/components/motion/card.tsx:109:5` | unmounted-ui | 同上（pointermove 分支） | window pointermove 监听：motion 拖拽已接管（isDragActive）时立即结束按压，把外层拖拽让给 sheet/可滑行。 |
| `frontend/components/motion/card.tsx:116:7` | app-boundary | 调用方（经 `components/ui/card.tsx`）渲染 `<Card>` | 渲染调用方 children 与 props 的 motion.div，附 data-slot/variant/selected、按压反馈与选中样式；仅 interactive 时携带 scale，无网络写入。 |
| `frontend/components/motion/card.tsx:146:5` | app-boundary | 调用方渲染 `<CardHeader>` | 转发 props/children 到 div，按数据槽位排布标题/描述与 CardAction；不写业务状态。 |
| `frontend/components/motion/card.tsx:166:5` | app-boundary | 调用方渲染 `<CardTitle>`（默认 h3，可按 `as` 换标题层级） | 转发 props/children 到对应标题标签；仅有本地类名与 data-slot。 |
| `frontend/components/motion/card.tsx:178:5` | app-boundary | 调用方渲染 `<CardDescription>` | 转发 props/children 到 p，使用次要文本样式；不写业务状态。 |
| `frontend/components/motion/card.tsx:193:5` | unmounted-ui | 仅当调用方渲染 `CardAction` 时出现（当前 0 处调用点） | 转发 props/children 到栅格定位容器，供 CardHeader 右上角放置操作；自身无动作。 |
| `frontend/components/motion/card.tsx:208:10` | app-boundary | 调用方渲染 `<CardContent>` | 转发 props/children 到 div，padding 取自 CardSizeContext；不写业务状态。 |
| `frontend/components/motion/card.tsx:216:5` | unmounted-ui | 仅当调用方渲染 `<CardFooter>` 时出现（当前 0 处调用点） | 转发 props/children 到 div，footer padding 取自 CardSizeContext；自身无动作。 |

## `frontend/components/motion/center-morph-modal.tsx`（0）

本载荷在 Wave 4 采用（矩阵 §17）并被 `components/ui/dialog.tsx` 接入为应用唯一模态：补丁把它原来的 4 条未归属候选（window keydown/Escape 与焦点循环、backdrop 按钮、role=dialog 面板、右上角关闭按钮）改造成可注入 `backdropProps`/`panelProps`/`children`、`onDismiss` 与 `dismissible`/`showCloseButton` 的形态，坐标因此移至 `337:5`、`354:15`、`388:19`、`432:23` 并随 `ui/dialog.tsx` 的调用点进入 root 图，不再计入未归属项。行为未变：全部是本地开合与焦点管理，没有网络写入。

## `frontend/components/motion/context-menu.tsx`（8）

beUI 右键菜单的落地副本，`frontend/` 第一方源码零 import——`components/ui/dropdown-menu.tsx` 的注释记录了为何不采用：它是 pointer-origin/长按菜单且始终 portal（`:486`），角色虽对（`role="menu"`）但不适合点击锚定的 shell 菜单。因此下列条件均为假设调用者接线之后，不是当前可见界面。选中的动作全部经调用方 `onSelect`/`onCheckedChange`/`onValueChange` 回传，组件自身不写业务状态。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/context-menu.tsx:159:5` | unmounted-ui | 若挂载且 open 为真时注册 | window pointerdown：指针落在内容区外即 setOpen(false)，不触碰业务数据。 |
| `frontend/components/motion/context-menu.tsx:160:5` | unmounted-ui | 同上（resize 分支） | window resize：视口变化即 setOpen(false)，菜单重新定位由调用方重新触发。 |
| `frontend/components/motion/context-menu.tsx:161:5` | unmounted-ui | 同上（scroll 分支） | window scroll：滚动即 setOpen(false)，避免菜单与锚点脱节。 |
| `frontend/components/motion/context-menu.tsx:497:7` | unmounted-ui | 若挂载且 portal 就绪（mounted）后渲染 | role=menu 的 motion.div（portal 到 body）：处理 keydown 菜单键循环，并吞掉内部 contextmenu 以阻止浏览器原生菜单；开合仍由调用方 context 决定。 |
| `frontend/components/motion/context-menu.tsx:577:5` | unmounted-ui | 渲染菜单项后点击（disabled 直接返回） | 调用调用方 `onSelect`，并按 closeOnSelect 关闭菜单；focus/pointermove 只维护本地高亮，不写持久化。 |
| `frontend/components/motion/context-menu.tsx:623:10` | unmounted-ui | 调用方渲染 `ContextMenuItem` | 透传 props/children 到 ContextMenuItemBase（role=menuitem）；自身无动作。 |
| `frontend/components/motion/context-menu.tsx:640:5` | unmounted-ui | 调用方渲染 `ContextMenuCheckboxItem` 并点击 | 调用调用方 `onCheckedChange(!checked)`；勾选标记是本地动画，不写持久化。 |
| `frontend/components/motion/context-menu.tsx:716:5` | unmounted-ui | 调用方在 `ContextMenuRadioGroup` 内渲染 `ContextMenuRadioItem` 并点击 | 调用调用方 `group.onValueChange(value)`；选中态来自 group，不写持久化。 |

## `frontend/components/motion/combobox/content.tsx`（2）

beUI combobox 载荷的 §17 补丁版（`inline` 面板、`rest` 透传、可传 `ariaLabel`）。它经 barrel `components/motion/combobox.tsx` 被 `components/ui/filter-select.tsx` 消费并已在搜索、任务、审计、成员等 15 个页面生效；静态图不跟随 `export … from` 纯再导出，因此声明侧候选仍未归属。按实际渲染面分：`inline` 分支记 `app-boundary`（产品实际挂载），portal 分支无调用点记 `unmounted-ui`。两者都只控制开合与定位，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/combobox/content.tsx:111:7` | app-boundary | `ui/filter-select.tsx` 以 `inline` 渲染 `<ComboboxContent>`（面板留在字段内） | motion.div 内联面板：转发 rest/children，`aria-hidden`/`inert` 随 `context.open`，展开只改 height/opacity/y（reduce 或未就绪时无动画）；不写业务状态。 |
| `frontend/components/motion/combobox/content.tsx:161:5` | unmounted-ui | 仅当调用方不使用 `inline`（走 portal 分支）时出现（当前无此类调用点） | createPortal 的 motion.div：按 `align`/`side` 与视口测量算 left/top 并 animate 高度/透明度；只是布局与开合，无请求。 |

## `frontend/components/motion/combobox/context.tsx`（3）

combobox 根 `Combobox` 的关闭监听（同上：经 barrel 挂载，静态图未跟随再导出）。三条都只改本地开合，不触碰选中值或业务数据，记 `app-boundary`。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/combobox/context.tsx:286:5` | app-boundary | `<Combobox>` 挂载且 open 为真（筛选行已生效） | window pointerdown：指针不在根或内容区内则 `updateOpen(false)`，不改变选中值。 |
| `frontend/components/motion/combobox/context.tsx:287:5` | app-boundary | 同上（focusin 分支） | window focusin：焦点落到外部即关闭下拉；仅本地开合。 |
| `frontend/components/motion/combobox/context.tsx:288:5` | app-boundary | 同上（keydown 分支） | window keydown：Escape 且未被 preventDefault 时 `updateOpen(false, true)`（回传焦点标记）；不发请求。 |

## `frontend/components/motion/combobox/list.tsx`（3）

combobox 的列表与选项（`ui/filter-select.tsx` 实际渲染 List 与 Item，空态未使用）。前两条记 `app-boundary`，空态记 `unmounted-ui`；选中值经调用方 `onChange` 写回，组件自身不发起请求。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/combobox/list.tsx:37:5` | app-boundary | 筛选行渲染 `<ComboboxList ariaLabel=…>` | div `role=listbox`：转发 rest/children，`aria-label` 取调用方本地化文案（未传时用 triggerId 关联）；不写业务状态。 |
| `frontend/components/motion/combobox/list.tsx:149:5` | app-boundary | 每个 options 项渲染为 `ComboboxItem` 且 visible | button `role=option`：pointermove 设 activeValue、pointerdown preventDefault、点击回调调用方 `onSelect(value)` 再 `context.select(value)`；取值仍由调用方 `onValueChange` 决定。 |
| `frontend/components/motion/combobox/list.tsx:214:5` | unmounted-ui | 仅当调用方渲染 `ComboboxEmpty` 时出现（当前无调用点；筛选行不渲染空态） | div `role=status`，`context.visibleCount > 0` 时返回 null；只展示调用方 children，无动作。 |

## `frontend/components/motion/combobox/trigger.tsx`（2）

combobox 触发器。§17 补丁给它加了 `render` 元素插槽与 `keyboard="trigger"`：`ui/filter-select.tsx` 因此传入 `<button aria-haspopup="listbox">`，开合与键盘都由该按钮承担——**handler 的性质也随之改变**（不再是“聚焦内部 input 再打开”，而是按钮直接翻转 `context.setOpen`）。于是本文件的两条声明侧候选都成了无人走的回退分支，记 `unmounted-ui`。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/combobox/trigger.tsx:134:5` | unmounted-ui | 仅当调用方渲染 `ComboboxTrigger` 但**不传** `render` 插槽时出现（filter-select 总要传，故该回退分支无调用点） | div 触发器回退形态：转发 `semantics`，pointerdown 按 `keyboard` 决定开合或聚焦内部 input，`aria-expanded` 等由 context 提供；仅本地开合。 |
| `frontend/components/motion/combobox/trigger.tsx:266:7` | unmounted-ui | 仅当调用方渲染 `ComboboxInput` 时出现（当前无调用点；筛选行是 button+listbox，不是文本框） | input `role=combobox`：pointerdown/focus/click 打开面板，change 更新 query 并回调调用方 onChange，keydown 走载荷键盘处理；不发请求。 |

## `frontend/components/motion/date-range-picker.tsx`（3）

beUI 日期区间选择器的 vendored 落地副本。除下列三条外，本文件的候选都已归属：正式适配器 `components/ui/date-range-input.tsx` 组合 `DateRangePicker` 根与 Calendar/Header/Grid/Footer/Selection 并接到搜索页与「我的提交」页，所以这些部件由各自路由 root 覆盖。未归属的三条是 payload 自带的便捷组合层（`DateRangePickerTrigger`、`DateRangePickerContent`、`DateRangePickerDropdown`），适配器自绘触发器、未使用它们，故无调用点；三者都只渲染调用方 props/children、维护本地开合与焦点，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/date-range-picker.tsx:757:7` | unmounted-ui | 仅当调用方渲染 `DateRangePickerTrigger` 时出现（当前无调用点；`ui/date-range-input.tsx` 自绘触发器） | MorphPopoverTrigger 内的 motion.button：转发 props/ref/style，`disabled` 取 `disabled \|\| ctx.disabled`，`aria-label` 缺省为 `${ctx.label}: ${summary}`，显示格式化区间摘要；点击后由 MorphPopover 开合，不发请求。 |
| `frontend/components/motion/date-range-picker.tsx:839:5` | unmounted-ui | 仅当调用方渲染 `DateRangePickerContent` 时出现（当前无调用点） | MorphPopoverContent 承载日历面：onOpenAutoFocus 记录内容节点并按 `autoFocus` 聚焦所选日期；开合与焦点都是本地行为，不写业务状态。 |
| `frontend/components/motion/date-range-picker.tsx:872:5` | unmounted-ui | 仅当调用方渲染便捷组合 `DateRangePickerDropdown` 时出现（当前无调用点） | 组合 root + trigger + content + calendar 并透传 `placeholder`/`autoFocus`/`showSummary` 等 props；自身不写状态，选值与提交仍由调用方回调决定。 |

## `frontend/components/motion/loader.tsx`（0）

落地页 3D 加载态现在直接挂载该组件的 `dots` variant（`workbench-scene.tsx`），因此本文件的三个候选全部归属落地页，不再计入未归属项。历史分类见文末变更说明。

## `frontend/components/motion/magnetic.tsx`（1）

beUI 磁性包装（`Magnetic`），唯一 import 方是同样未被消费的 `button/magnetic.tsx`，因此记 `unmounted-ui`。鼠标跟随完全是本地 motion value，无网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/magnetic.tsx:41:5` | unmounted-ui | 仅当调用方渲染 `Magnetic` 时出现（当前无调用点） | motion.div：mousemove 按指针与元素中心的偏移设 x/y（触摸或 reduced-motion 时整体不启用），mouseleave 归零；纯装饰，无请求。 |

## `frontend/components/motion/not-found/shared.tsx`（3）

路由 fallback 的 404 舞台与 CTA 行。原 `NotFoundPage` 内的返回首页链接已被 `NotFoundGlitch` 取代，该未归属坐标由 `frontend/app.tsx:931:250` 迁移到本文件；app.tsx 不再持有此候选。[source:frontend/components/motion/not-found/glitch.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/not-found/shared.tsx:55:7` | app-boundary | 路由 fallback 渲染 404；homeHref 默认 `/` | motion.a 指向 homeHref；whileTap/whileHover 受 reduced-motion 与 hover 能力门控。 |
| `frontend/components/motion/not-found/shared.tsx:65:9` | unmounted-ui | 仅当调用方传入 browseHref 时渲染 | 第二 CTA 当前没有调用点传 browseHref，因此不出现在工作台界面中。 |
| `frontend/components/motion/not-found/shared.tsx:86:5` | app-boundary | 路由 fallback 渲染 404 舞台节点（NotFoundStage 转发 props） | 转发 props/children 到舞台 div 并携带 data-page-state；无业务写入。 |

## `frontend/components/motion/popover.tsx`（0）

Wave 4 打补丁后，`components/shell/app-shell.tsx:9` 改为从本文件取 `Popover`/`PopoverTrigger`/`PopoverContent` 渲染账户菜单等点按锚定弹层，两条候选（根节点 `:420:7`、内容面 `:725:11`）也随之进入 root 图并从本记录移除。补丁把原来硬编码的 `role="dialog"` 与 `aria-haspopup` 改为调用方可传的语义插槽（这也是 `ui/dropdown-menu.tsx` 注释里当初否决它的原因被消除之处），行为仍是本地开合 + hover 时序 + 几何计算，没有网络写入。

## `frontend/components/motion/preview-rail.tsx`（0）

beUI 预览轨的落地副本，唯一 import 来自 `components/agents/message-scroller.tsx:462`，而该处只在 `navigation === "rail"` 时渲染；当前没有调用点传 `navigation="rail"`，所以本文件不出现于产品界面，下列条件均为假设调用者接线之后。tick 状态（hover/focus/pinned/active）全部是本地状态，点击才调用调用方 `onItemSelect`/`onActiveChange`，没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |

## `frontend/components/motion/switch.tsx`（0）

管理端菜单编辑器的布尔可见性字段改为使用该组件（`menu-editor.tsx`），因此本文件的候选归属管理端，不再计入未归属项。

## `frontend/components/shell/context-rail.tsx`（6）

当前第一方 frontend 源码未发现 ContextRail 的消费；不能由名称推定 AppShell 已挂载。下面是如果挂载后的条件，不是已在产品显示的证明。无需将已有 AppShell 导航再造一套；是否恢复这个组件要由需求决定。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/shell/context-rail.tsx:34:7` | unmounted-ui | 若组件挂载，共用 rail content 展示关闭控件 | onClose 回调；父组件负责 collapsed 状态。 |
| `frontend/components/shell/context-rail.tsx:37:32` | unmounted-ui | 若组件挂载，按可见 modules 循环 | go(event,module.entryPath)；使用传入 onNavigate 或浏览器链接。 |
| `frontend/components/shell/context-rail.tsx:39:296` | unmounted-ui | 若挂载且未折叠，children 非空 | 对每个子路由执行 go(event,route.path)。 |
| `frontend/components/shell/context-rail.tsx:40:37` | unmounted-ui | 若挂载且未折叠，currentModule 存在 | go(event,currentModule.entryPath) 打开当前模块。 |
| `frontend/components/shell/context-rail.tsx:47:60` | unmounted-ui | 若挂载，移动触发器可见时点击 | setMobileOpen(true)，打开 Sheet。 |
| `frontend/components/shell/context-rail.tsx:48:5` | unmounted-ui | 若挂载，Sheet 的打开状态改变 | setMobileOpen；关闭/焦点行为需真实组件旅程验收。 |

## `frontend/components/ui/card.tsx`（0）

本文件不再定义 Card 部件，只 `export { CARD_TARGET_CLASS, Card, CardTitle… } from "../motion/card"`（Card、六个部件、三个类型与 `CardSize`/`CardVariant`），作为应用唯一 Card 的适配器，全部 24 处 import 都经它。原先记在本文件的 `13:85`（CardFooter 转发 div props）随实现移到 `frontend/components/motion/card.tsx:216:5`，因此本文件不再持有未归属候选；它仍作为消费 `motion/card` 的 caller 证据保留指纹。

## `frontend/components/ui/checkbox.tsx`（0）

`components/ui/checkbox.tsx` 的唯一消费者原为未归属的 `frontend/pages/admin/role-detail-page.tsx`；admin-role-detail 登记为能力根 `workbench-admin-role-detail` 后，该消费者整页归入该路由，本文件的候选（原生 `input type=checkbox`，转发 ref 与其余 props）随之归属对应路由，2026-10-16 起从本记录移除。`components/motion/checkbox.tsx` 另有已归属消费者，两者不是同一实现，不重复计算。

## `frontend/components/ui/dropdown-menu.tsx`（0）

Wave 4 之后本文件已无 import（shell 改用 beUI 的 `motion/popover.tsx` 与 `motion/command-palette.tsx`），因此按死代码移除，工作树中已不存在该源文件。上一轮为它的 7 条候选（document 层的 pointerdown/focusin/keydown 关闭、菜单根的 keydown、trigger 按钮、content 面板、item 按钮）记的 `unmounted-ui` 行与指纹一并撤回：源码删除后它们既不是未归属候选，也不再是需要防漂移的已审查文件。原先“删除属另一个决定”的判断现已执行，结论是删除而非保留。

## `frontend/components/ui/tabs.tsx`（0）

本文件已改为在 beUI `motion/tabs.tsx` 载荷外做适配器（导出名不变），并被 `frontend/pages/admin/members-page.tsx:8` 用来把「成员 / 授权记录」渲染成两页签，因此原来 4 条未归属候选（根 Provider、TabsList 键盘、TabsTrigger 点击、TabsContent 面板）随该路由进入 root 图，坐标变为 `67:5`、`73:10`、`103:10`、`121:10`，不再计入未归属项。

适配器与载荷的分工值得单独记一笔，因为它决定了这些 handler 的归属变化：载荷负责视觉与交互核心（pill 指示器布局动画、可滚动列表与边缘按钮、focus reveal、reduced-motion 折叠），适配器补的是载荷没有建模的部分——tablist/tab/tabpanel 的 `id` 与 `aria-controls`、roving `tabIndex`、Home/End/方向键（`lib/tabs-keyboard.ts`）、`data-state`、`hidden` 面板、受控/非受控桥接与 44px 触控高度。§17 的两处 attribute-passthrough 补丁正是为此：`Tabs` 把 rest props 透到布局根（`motion/tabs.tsx:101`），`TabsContent` 透 `hidden`/`data-state`/rest 到面板（`:381`/`:387`）。因此这些动作在源码里仍是「本地选择 + 焦点管理」，没有网络写入；它们从 `unmounted-ui` 变成已归属，是因为有了真实消费者，而不是行为性质改变。

## `frontend/features/environments/account-network-owner.mjs`（2）

[source:frontend/features/environments/account-network-boundary.tsx] 在已验证 member 的 layout effect 创建 owner，并在卸载/账户切换 dispose；App 实际挂载此 boundary。只建立生命周期注册表，不启动 VM 或连接器。network(environmentId) 仍为惰性工厂。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/account-network-owner.mjs:23:3` | app-boundary | 已认证账户 owner 创建且 BroadcastChannel 可用 | 监听同 origin/member 的 invalidate 提示并 dispose；消息不是删除/授权凭证。 |
| `frontend/features/environments/account-network-owner.mjs:45:3` | app-boundary | owner 创建且传入 window events | pagehide 清理账户 owner、通道和已有网络实例；effect 清理也走 dispose。 |

## `frontend/features/environments/account-network.mjs`（3）

仅由 owner.network(environmentId) 惰性创建；当前 frontend 未找到该方法的实际调用。owner 本身已接线不代表这个实例已创建。内部 lifecycle 未传 events，因此其可选 DOM listeners 不应又算一套已激活监听。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/account-network.mjs:16:5` | vm-not-mounted | 显式网络连接流程调用 cancellable，传入未终止 signal | abort 拒绝等待的异步操作，取消后拒绝迟到结果。 |
| `frontend/features/environments/account-network.mjs:164:3` | vm-not-mounted | 未来 network 工厂被调用且 events 存在 | offline 停止当前网络；不自动重连。 |
| `frontend/features/environments/account-network.mjs:165:3` | vm-not-mounted | 未来 network 工厂被调用且 events 存在 | pagehide 终止实例；不保留可复用旧会话。 |

## `frontend/features/environments/account-vm-runtime.mjs`（1）

[source:tools/browser-vm/runtime-owner-browser.mjs] 显式创建此 runtime；正式前端现由 [source:frontend/features/environments/environment-vm-composition.ts] 在 `/environments` 挂载时创建同一个实例（经 `environment-vm-provider.tsx`，owner 来自 AccountNetworkBoundary）。该 harness 并非产品环境路由；本版本有意不发布引擎，所以它永远不会进入 running。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/account-vm-runtime.mjs:63:3` | vm-runtime-unshipped | 显式创建 runtime 后，owner.signal 被终止 | cancel(ACCOUNT_CLOSED) 并退订；创建 runtime 不等于自动 boot。 |

## `frontend/features/environments/authenticated-vm-runtime.ts`（1）

正式 `/environments` 现经 [source:frontend/features/environments/environment-vm-composition.ts] 组合此门（`createSession` 以 VM_SESSION_UNAVAILABLE 失败关闭，见 `environment-vm-provider.tsx`）。组合的 beforeStart 每次先校验 /api/session 和环境元数据，不回退缓存授权；本版本不发布引擎，因此 start 永远不会成功。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/authenticated-vm-runtime.ts:43:9` | vm-runtime-unshipped | 显式 start/restore 进入 beforeStart（本版本 start 无法成功），合并 signal 被取消/超时 | 拒绝 authority 查询等待；401/403 撤销 owner，finally 清计时器/监听器；未成功校验不读本地 VM bytes。 |

## `frontend/features/environments/connector-session.mjs`（1）

由 [source:frontend/features/environments/account-network.mjs] 在显式 connect/open 中创建，继承该工厂尚未被正式页面调用的边界。不是浏览器打开页面即联网。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/connector-session.mjs:24:2` | vm-not-mounted | 显式创建连接器会话并取得 lifecycle signal | abort 执行会话清理；不能把监听器注册当作握手、外网转发或设备授权成功。 |

## `frontend/features/environments/files/asset-import-panel.tsx`（21）

由 FilesPanel 在 assetImporter 存在时挂载；模型要求 submission.memberId 非空。正式 [source:frontend/features/environments/environment-files-surface.tsx] 现已挂载 FilesPanel 并传入真实 submission.memberId，因此本面板不再是 harness 专属；但本版本有意不发布 VM 引擎，FilesPanel 的 FileView 在不满足 state.available 时提前返回占位；共同条件 state.kind 非 idle（busy 合并模型和 workflow 状态）因此永远不可达。harness 仍仅传 runtime/locale。A02 的下游为 [source:frontend/features/environments/files/asset-import.ts] 和既有 asset-workflow。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/asset-import-panel.tsx:25:7` | vm-runtime-unshipped | canUpload 为真且未 busy，用户确认原文件 | setUploadAck；仅修改明确上传确认状态。 |
| `frontend/features/environments/files/asset-import-panel.tsx:26:7` | vm-runtime-unshipped | canUpload、已 uploadAck、未 busy 且无 storage 错误 | model.upload，重试固定同一文件/意图；不自动解析。 |
| `frontend/features/environments/files/asset-import-panel.tsx:31:7` | vm-runtime-unshipped | flow.intent 存在且未 busy | model.refresh 回读服务端状态，不重放写入。 |
| `frontend/features/environments/files/asset-import-panel.tsx:33:9` | vm-runtime-unshipped | job 为 queued 或 failed_retryable 且未 busy | model.parse 显式启动/重试解析。 |
| `frontend/features/environments/files/asset-import-panel.tsx:34:9` | vm-runtime-unshipped | job 为 queued 或 failed_retryable 且未 busy | model.cancel 请求取消服务端待处理资产。 |
| `frontend/features/environments/files/asset-import-panel.tsx:36:33` | vm-runtime-unshipped | job 为 failed_terminal 且未 busy | releaseFailed 解除失败本地意图，保留服务端资产。 |
| `frontend/features/environments/files/asset-import-panel.tsx:37:36` | vm-runtime-unshipped | job 为 succeeded、尚无 review 且未 busy | previewParsed 回读已解析内容。 |
| `frontend/features/environments/files/asset-import-panel.tsx:40:9` | vm-runtime-unshipped | review 已锁定且未 busy | retrySubmission 重试原审核载荷，不使用当前编辑字段。 |
| `frontend/features/environments/files/asset-import-panel.tsx:43:20` | vm-runtime-unshipped | state.parsed 存在 | 可聚焦 pre 显示字面解析 Markdown；不是执行 HTML 或提交动作。 |
| `frontend/features/environments/files/asset-import-panel.tsx:45:58` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新本地审核标题。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:99` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新 requestedSpaceId；服务端仍需校验目标权限。 |
| `frontend/features/environments/files/asset-import-panel.tsx:47:68` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新本地 shared/admin_only 请求范围。 |
| `frontend/features/environments/files/asset-import-panel.tsx:48:7` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新明确审核确认 reviewAck。 |
| `frontend/features/environments/files/asset-import-panel.tsx:49:7` | vm-runtime-unshipped | editable、reviewAck、标题/空间非空且未 busy | model.submit 固定目标与 acknowledged；请求审核而非发布。 |
| `frontend/features/environments/files/asset-import-panel.tsx:51:34` | vm-runtime-unshipped | state.error 或 flow.error 非空 | role=alert 显示错误与未确认结果；对象存储不可用时不上传，也不退化为直接发布。 |
| `frontend/features/environments/files/asset-import-panel.tsx:52:32` | vm-runtime-unshipped | flow.kind 为 submitted | role=status 显示 submissionId；不当作发布完成。 |
| `frontend/features/environments/files/asset-import-panel.tsx:53:31` | vm-runtime-unshipped | flow.kind 为 canceled | role=status 显示服务端取消已确认；不同于停止本地等待。 |
| `frontend/features/environments/files/asset-import-panel.tsx:54:31` | vm-runtime-unshipped | flow.kind 为 released | role=status 显示失败本地意图已解除，服务端资产仍保留。 |
| `frontend/features/environments/files/asset-import-panel.tsx:55:5` | vm-runtime-unshipped | 非 idle 的资产面板内点击我的提交 | href=/my-submissions 导航；读取结果与权限仍由目标页面负责。 |
| `frontend/features/environments/files/asset-import-panel.tsx:56:12` | vm-runtime-unshipped | busy 时用户点击停止等待 | model.stop；只停止本地等待，不宣称撤销服务端处理。 |
| `frontend/features/environments/files/asset-import-panel.tsx:57:5` | vm-runtime-unshipped | 非 idle 且未 busy，用户关闭 | model.close；保留成员未决恢复元数据。 |

## `frontend/features/environments/files/files-panel.tsx`（25）

实际消费者有两个：[source:tools/browser-vm/runtime-owner-browser.mjs]（仅传 runtime/locale，未传 submission，因而该 harness 不提供两个导入模型）与正式 [source:frontend/features/environments/environments-page.tsx]。正式页面**已挂载**：选中环境后渲染 `EnvironmentFiles`（[source:frontend/features/environments/environment-files-surface.tsx]），后者经惰性 `import('./files/files-panel')` 挂载本面板并传入真实 submission.memberId；本文件的 34 条候选因此属于新分类 vm-runtime-unshipped。本版本有意不发布 VM 引擎与镜像，owner 作用域 runtime 永远无法进入 running，FileView 的共同条件 state.available 恒为假，组件只渲染“Start an environment…”占位，全部动作（含两个导入面板）永久不可用。blocked=busy、editor、文本导入打开或资产导入打开。各行额外条件如下；所有选项/提示也保留，不把每行等同用户动作。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/files-panel.tsx:30:129` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:76:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:77:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:78:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:79:41` | vm-runtime-unshipped | prepared.epoch 等于当前 epoch | role=status 呈现本地下载已准备及字节数。 |
| `frontend/features/environments/files/files-panel.tsx:80:22` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:82:41` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:82:58` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:83:21` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:84:5` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:86:23` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:90:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:92:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:93:7` | vm-runtime-unshipped | 未 blocked 且 page 大于 1 | manager.load 同目录上一页。 |
| `frontend/features/environments/files/files-panel.tsx:96:23` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:99:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:100:45` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:101:9` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:102:9` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:103:43` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:104:7` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:107:5` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:109:141` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:110:35` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |
| `frontend/features/environments/files/files-panel.tsx:110:178` | vm-runtime-unshipped | VM 文件面板动作；本版本有意不发布 VM 引擎与镜像，running 环境不可达 | 仅在假设 running 环境出现后才会触发；当前禁用或不可渲染，无业务写入。 |

## `frontend/features/environments/files/knowledge-import-panel.tsx`（12）

由 FilesPanel 在 importer 存在时挂载；正式 [source:frontend/features/environments/environment-files-surface.tsx] 已挂载 FilesPanel 并传入真实 submission.memberId，因此 importer 现会被创建；但本版本有意不发布 VM 引擎，FileView 在 state.available 为假时提前返回占位，共同条件非 idle 永远不可达。editable 仅 kind=preview，busy 为 reading/sending。下游 [source:frontend/features/environments/files/knowledge-import.ts] 使用 createSubmission，不自行发布；未知状态保留原载荷/键。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/knowledge-import-panel.tsx:19:12` | vm-runtime-unshipped | kind 为 reading 或 sending | role=status 显示等待回执，不是提交成功。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:22:7` | vm-runtime-unshipped | state.preview 存在 | 可聚焦 pre 呈现冻结文件的字面内容，不随之后 VM 编辑改变。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:23:49` | vm-runtime-unshipped | preview 存在且 editable | 更新本地标题；unknown/sending 状态不可改写原意图。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:99` | vm-runtime-unshipped | preview 存在且 editable | 更新请求空间 ID；服务端决定是否允许。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:25:98` | vm-runtime-unshipped | preview 存在且 editable | 更新请求可见范围；不是已发布范围。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:26:7` | vm-runtime-unshipped | preview 存在且 editable | 用户确认内容/目标/无密钥，更新 ack。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:27:18` | vm-runtime-unshipped | editable 且 ack、标题和空间非空 | model.confirm 冻结 draft/target/key 并提交审核。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:29:19` | vm-runtime-unshipped | state.error 存在 | role=alert 显示未知/格式/校验错误，不自动重放。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:30:30` | vm-runtime-unshipped | kind 为 unknown，用户显式点击 | model.retry 使用原键和原载荷。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:31:32` | vm-runtime-unshipped | kind 为 submitted | role=status 显示 receipt.id 及查看审核状态提示；不是发布成功。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:32:58` | vm-runtime-unshipped | kind 为 unknown 或 submitted | href=/my-submissions 查询提交；不是精确操作编号查询的替代证明。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:33:37` | vm-runtime-unshipped | 非 busy 且 kind 非 unknown | model.close；unknown 状态不提供丢弃原意图的关闭按钮。 |

## `frontend/features/environments/files/stream-download.mjs`（2）

[source:frontend/features/environments/files/file-manager.mjs] 的 downloadTo 调用 writeFileDownload；依赖用户选择 sink 和真实 runtime.file。文件面板现已由正式 `/environments` 文件面惰性挂载（[source:frontend/features/environments/environment-files-surface.tsx]），本模块随同一延迟 chunk 加载，因此不再是“未挂载”；但本版本有意不发布 VM 引擎，downloadTo 永远不可达，故此 helper 仍不构成正式下载功能验收。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/stream-download.mjs:15:3` | vm-runtime-unshipped | 显式流式保存且传入 signal，signal abort | abortSink 并停止后续读取；不收集整个文件到 Blob。 |
| `frontend/features/environments/files/stream-download.mjs:22:42` | vm-runtime-unshipped | 每次等待磁盘写入时 signal abort | 拒绝本次写入等待；finally 清监听/释放下载租期，只有 sink.close 成功才算 committed。 |

## `frontend/features/environments/network-lifecycle.mjs`（2）

由 account-network 创建时未传 events，下面两个可选事件注册不会由该路径激活；其他显式调用者若传 events 才启用。不能把 optional listener AST 当成实际已注册。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/network-lifecycle.mjs:67:2` | vm-not-mounted | 创建 lifecycle 且显式传入 events，随后 offline | end(browser-offline)，取消当前尝试，不自动重连。 |
| `frontend/features/environments/network-lifecycle.mjs:68:2` | vm-not-mounted | 创建 lifecycle 且显式传入 events，随后 pagehide | end(page-hidden,true)，终止实例并清监听。 |

## `frontend/features/environments/storage/checkpoints.mjs`（2）

[source:tools/browser-vm/runtime-owner-browser.mjs] 和 [source:tools/browser-vm/checkpoint-recovery-browser.mjs] 创建 store；正式前端现由 [source:frontend/features/environments/environment-vm-composition.ts] 在 `/environments` 挂载时构造同一 store（身份取 `storage/checkpoint-identity.mjs` → `tools/browser-vm/alpine-iso.mjs` 的固定 pin，避免第二份摘要来源），并由 `storage/reconcile-checkpoints.ts` 在挂载时对账。本版本有意不发布 VM 引擎，save/load 永远不可达。此为成员/环境本地 IndexedDB 快照，不是新增备份或加密要求。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/storage/checkpoints.mjs:49:42` | vm-runtime-unshipped | checkpoint transaction 已创建且传入 signal，取消发生 | abort 对应 IndexedDB transaction；不将发出请求视为提交完成。 |
| `frontend/features/environments/storage/checkpoints.mjs:128:3` | vm-runtime-unshipped | checkpoint store 已创建，账户 owner 被终止 | close 清理事务/连接；物理擦除证明不由此得出。 |

## `frontend/features/environments/storage/reconcile-checkpoints.ts`（0）

该文件的候选现由 `workbench-environments` 能力根覆盖，2026-10-16 起不再计入未归属项。与 checkpoints 必须同 owner.scope；只基于服务端 tombstones 删除本地副本，不以分页缺项推断删除。

## `frontend/lib/workspace-location.ts`（1）

[source:frontend/components/history-navigation-notice.tsx] 通过 useSyncExternalStore 订阅 fault；这是跨路由外层消息机制，不是未接线的业务页。这里只登记未归属的 fault 监听，已归属的 location-change 不重复计算。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/lib/workspace-location.ts:63:3` | app-boundary | HistoryNavigationNotice 订阅，owner 发出 WORKSPACE_HISTORY_FAULT_EVENT | listener 更新 fault snapshot；取消订阅移除监听器。 |

## `frontend/pages/admin/create-role-page.tsx`（0）

角色新建页，由 `frontend/app.tsx` 的 `AdminRoleNewRoute`（renderPage 的 admin-role-new 分支）渲染，可由 `frontend/pages/admin/roles-page.tsx` 的创建按钮（写 `/admin/roles/new`）到达。admin-role-new 现已在 `shared/workbench-maturity-capabilities.ts` 登记为能力根 `workbench-admin-role-new`（root symbol `AdminRoleNewRoute` 与 `AdminRoleCreatePage`），因此整页候选归入该路由、由以 root symbol 为起点的图覆盖，不再计入未归属项，2026-10-16 起从本记录移除。写入与读取都由共享控制器回调承担，页面自身不发请求。

## `frontend/pages/admin/role-detail-page.tsx`（0）

角色权限详情页，由 `frontend/app.tsx` 的 `AdminRoleDetailRoute`（renderPage 的 admin-role-detail 分支）渲染，可由角色列表行（写 `/admin/roles/<id>`）到达。admin-role-detail 现已在 `shared/workbench-maturity-capabilities.ts` 登记为能力根 `workbench-admin-role-detail`（root symbol `AdminRoleDetailRoute` 与 `AdminRoleDetailPage`），因此整页候选归入该路由、由以 root symbol 为起点的图覆盖，不再计入未归属项，2026-10-16 起从本记录移除。保存、指派与取消指派都先进入确认框，再由共享控制器回调落盘，页面自身不发请求。

## `frontend/pages/workbench-landing/workbench-scene-runtime.ts`（5）

[source:frontend/pages/workbench-landing/workbench-scene.tsx] 在可见且自动策略允许或显式手动请求时动态 import，再调用 createWorkbenchScene；预算到期、卸载和失败均取消。外层消费者链为 [source:frontend/pages/workbench-landing/public-workbench-page.tsx]。AST 静态 import 图遗漏不意味着未接线；WebGL canvas 是 aria-hidden 且 pointerEvents=none，不是四个可点击业务功能。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:120:3` | public-dynamic | 场景启动并进入 loadModel，options.signal 被取消 | 中止模型加载/解析等待，清理迟到资源。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:200:5` | public-dynamic | 模型就绪并建立 canvas，收到 webglcontextlost | contextLost 进入失败/清理路径，交给外层显示回退。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:218:5` | public-dynamic | OrbitControls 建立后，访客拖拽/缩放或巡游插值触发 change | 同步重绘当前视角（含暂停时），并把帧循环续到阻尼结束；不发网络请求，不写业务状态。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:432:5` | public-dynamic | 场景成功初始化，document visibilitychange | 停止不可见帧或恢复允许绘制的场景，不触发网络写入。 |
| `frontend/pages/workbench-landing/workbench-scene-runtime.ts:434:5` | public-dynamic | 场景成功初始化，options.signal 被取消 | dispose 释放渲染、监听器及模型资源。 |

## `frontend/public/sw.js`（3）

[source:frontend/main.tsx] 在 navigator 支持 serviceWorker 时注册 /sw.js，失败 catch 不证明注册成功。三个监听是后台生命周期，不计作三个可见按钮；真实浏览器缓存行为仍需验收。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/public/sw.js:4:1` | background | Service Worker install | 缓存 shell 资源后 skipWaiting；不缓存 /api 私有响应的证据需结合 fetch 路径。 |
| `frontend/public/sw.js:7:1` | background | Service Worker activate | clients.claim 接管当前来源客户端。 |
| `frontend/public/sw.js:10:1` | background | fetch 为同源 GET 且非 /api/、/auth/ | navigation 网络优先失败回退 index；脚本/样式/字体/图片缓存优先；其他请求不接管。 |

## A02 接口/持久化追溯边界

本批没有改变这些实现，也没有运行其所有业务验收。下面记录已核对的直接调用层，避免下一轮重新从候选猜测；现有测试位置是待执行入口，不是本轮通过证据。

| 范围 | 直接调用及副作用 | 后续核验入口 |
| --- | --- | --- |
| App / history | navigate、retryWorkspaceHistory、logoutAccount；浏览器 history 与账户生命周期，不是业务表写入 | `test/unit/frontend-workspace-history-traversal.test.ts`；需重跑真实跨路由/身份行为 |
| VM 网络 | account-network 按 environmentId 构造 /api/environments/ 下授权请求；连接器独立验证授权；owner 只负责本地失效 | `scripts/browser-vm-account-network.test.mjs`、`scripts/browser-vm-account-network-integration.test.mjs`；当前无正式 network() caller |
| 客体文件 | file-manager -> runtime.file，文件协议/RPC；stream-download 顺序写用户 sink，无 Cloudflare 文件上传 | `scripts/browser-vm-file-panel.test.mjs`、`scripts/browser-vm-stream-download.test.mjs`；原生文件选择器/落盘仍另验 |
| 文本审核 | knowledge-import -> createSubmission(original.draft, original.key, requester, signal, original.target)；原键/载荷重试，不自动发布 | `scripts/browser-vm-knowledge-import.test.mjs`；补正式 member/能力/会话注入后再验服务端身份 |
| 资产审核 | asset-import -> loadAssetAvailability/createAssetWorkflow；原文件读 VM，解析预览 GET /api/assets/:id/preview；上传/解析/提交由既有 workflow 负责 | `scripts/browser-vm-asset-import.test.mjs`；不得将 preview fixture 当成解析服务验收 |
| VM 启动/恢复 | authenticated runtime 在读 bytes 前 GET /api/session、/api/environments/:id；checkpoint 为成员/环境 IndexedDB | `scripts/browser-vm-runtime-checkpoint.test.mjs`；正式 UI G0 尚未放行 |
| 删除快照对账 | reconcile -> GET /api/environments/tombstones 分页；命中墓碑后撤销对应环境、停止对应 runtime、提交本地 remove | `scripts/browser-vm-checkpoint-reconcile.test.mjs`；不能从列表缺项删本地快照 |

## `frontend/lib/use-toast.tsx`（1）

App 级瞬时反馈通道。`ToastProvider` 在已认证分支挂载一次，`useToast()` 在无 Provider 时返回 no-op（避免测试与非 Provider 渲染被反馈通道拖垮）。写结果仍以内联持久状态为准，本通道只承载本来没有落点的事件。[source:frontend/app.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/lib/use-toast.tsx:28:7` | app-boundary | ToastProvider 挂载（App 已认证分支） | 把通知栈固定渲染在右下角（`fixed position="bottom-right"`，`maxVisible` 3）并 portal 到 body；`dismissLabel` 取本地化文案；不在无 Provider 时抛错。 |

## 验证范围与维护

- 新增两条文档契约：全部未归属 ID 必须恰好一次且有分类/条件/行为；记录的源码及 caller 证据必须与指纹一致。文档缺失时 8 条旧测试通过、2 条新测试失败；补齐后 `node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过。与 frontend-typecheck-contract、functional-checklist-audit、workbench-maturity-contract 联合运行 37/37 通过。这是文档/源码门禁，不是业务旅程回归。
- 指纹仅阻止已审查文件无声变化，不证明上述自然语言正确，也不能发现所有新消费路径。新增模块或调用者时仍应重新追溯静态/动态/类型引用，而不是只更新摘要值。
- 现有 AST 索引保持原样；`audit:frontend-operations` 仍要求它和当前源码一致。文档契约已并入原有 inventory 测试，不新增独立“完成率”。
- 本批无产品运行行为修改、无 push/部署/迁移、未读取密钥。没有增加备份/加密门槛，也没有更新独立预览。

### 审查文件及 caller 指纹

- `frontend/app.tsx`: `238158f4f260c682fad7be96dac3c002a78f4d56fcb03dd0ba77d2f9acdcdf2a`
- `frontend/components/agent/answer-panel.tsx`: `d604801b674d21ef059a70f79cc367326ceccf60ba5e400c4d3480eca1e63586`
- `frontend/components/agents/citations.tsx`: `d9f0714f0ba41e3e2838d5d5004b7010c5d9a222a78b51a719f7a392873000a1`
- `frontend/components/agents/message-bubble.tsx`: `0fe1347583c44eee1d69e84aae80e2ea2097334ddc55a29469775616e0b7b43d`
- `frontend/components/agents/message-scroller.tsx`: `5b4a0a7b02b5f51ebe7c864d5c92b82d6737cb85421d799c22f7f267e53220c6`
- `frontend/components/agents/message.tsx`: `0237fddf4107844721c6977552aa02a84a71aa201fe9d525d206e83affb3aea4`
- `frontend/components/history-navigation-notice.tsx`: `ceb53e78c925c68b07324cbf6cfe3015010d0483418f3e29507f678e232f1ad6`
- `frontend/components/motion/action-swap-roll.tsx`: `271933ba92771ecb6ae5a7769d70cea3953e3c919ad51c324ee6290ce890a35f`
- `frontend/components/motion/action-swap.tsx`: `b3a886b34a475490e0363fb686080e00cebbcf5745f40d5d8dd4bcab6ed41603`
- `frontend/components/motion/alert.tsx`: `c511618208d401fb4473a5bb1162f7f3268a6e2fb4cc28f3ad8b71298517bb97`
- `frontend/components/motion/animated-sidebar.tsx`: `d0e4dfc8313b6620da95b376e5d2bf1c796e7aece1eea9fefa3a6d415fff60c1`
- `frontend/components/motion/animated-toast-stack.tsx`: `bbfe97a6aa83e2acb5ea270fdf93bc3541764a7bbf80bc9e514e02566a6342e9`
- `frontend/components/motion/button/magnetic.tsx`: `545d951ad9d66cef1fa00b2af98055796678ccdec5dbf1b0e31d0b5243f0b993`
- `frontend/components/motion/button/metallic.tsx`: `c066dfcc42f2f1eb819ef756944af5fd00245080540c9c06ca52f9e87c4e9b46`
- `frontend/components/motion/button/stateful.tsx`: `ef3ae73bbcc434a1bbdeaf06a891c44720f3d88d3f94a8aafe574d80a1c2e728`
- `frontend/components/motion/card.tsx`: `b9214ef617d7e77111f0e14dede7b411fe388b4eb3faf0f5475fb51a4eba126d`
- `frontend/components/motion/context-menu.tsx`: `a2b35b09002a9498784029f22d612d12b657bf507b895916bcc59f2d47fa7591`
- `frontend/components/motion/combobox/content.tsx`: `c499deaf5877428ab3c4b40415c7ce2e5b3d1721d86a8fecc13fa066fa02d4fe`
- `frontend/components/motion/combobox/context.tsx`: `90199b75b590752b19a94efb88c47b7fb18be2d9b5d1fc93b28e5e8f95720687`
- `frontend/components/motion/combobox/list.tsx`: `469099a441af380dd7673c9ecf24111d9eb1cc6cfc0d31e71d780d24c925ff35`
- `frontend/components/motion/combobox/trigger.tsx`: `4e3d7fd791c038ea877eddda6005fddcdc7ddfba617c0372b84814a8c8c406cf`
- `frontend/components/motion/date-range-picker.tsx`: `1e346dbbe4251c74296546e8f8f3563fd5df3b801c0db1dd2c47f61812562f89`
- `frontend/components/motion/scroll-reveal.tsx`: `7853c47a57dc1ac4c9b41d744a2421c9473d0597555300e4a84d1e54407abc97`
- `frontend/components/motion/magnetic.tsx`: `4409bd3cc09e05df784661657795624f663cebe0a3693c76e82df210c42e357c`
- `frontend/components/motion/not-found/glitch.tsx`: `96f1cfb9702592af701e83cd3a8e5ba82d674caed2a0c68987e124468afb018c`
- `frontend/components/motion/not-found/shared.tsx`: `46af8848dc48c4ada565ff548f384e99fdaa2e2cda306a2829fab70cc8183981`
- `frontend/components/motion/preview-rail.tsx`: `2b7e72b05d16a7a6e887175310dae523321e55be1ff79c7c01593b16469c4e4c`
- `frontend/components/shell/context-rail.tsx`: `9dcaa79e710f0b871c977e2251a71a4571124a861b4e9c9591bfa113398b184d`
- `frontend/components/ui/button.tsx`: `13861f82b8222d50039381ec724df08c53d8c0c426b822027b54735463274d58`
- `frontend/components/ui/card.tsx`: `972713b38d5e780ff782072f1a57f10e0b7aa07b0aff8e89b42fbdf7a7353b0c`
- `frontend/features/environments/account-network-boundary.tsx`: `9835f50b5387cc2173e47a5dd4c4f85e0f64ec419d88926578b262bf971716b2`
- `frontend/features/environments/account-network-owner.mjs`: `06943c97426e9b8df13e267ff0f668bbc2e3c80445905d2ac3a76591593f735f`
- `frontend/features/environments/account-network.mjs`: `9e954525f93dc3b37b5d3d5b7755ad4c6c9d1ef56d6312337072299d9680501b`
- `frontend/features/environments/account-vm-runtime.mjs`: `5cfd8db87089437abd4e0c2edcc667b973ee4e57f9a0806886e7dcf326ff3c8d`
- `frontend/features/environments/authenticated-vm-runtime.ts`: `f81bc382e47709dd818a3209b5974c53f87487821bebea8ab3112c2f687c4bf2`
- `frontend/features/environments/connector-session.mjs`: `4bea623fd47128568d112e9cfa26ecdc90f114a6572e536b08d49f4537cc5269`
- `frontend/features/environments/environment-files-surface.tsx`: `f24df6c74cbe83f85a7536bd9a9d2015df21634c1ccbea0fb3643449a70025ed`
- `frontend/features/environments/environment-vm-composition.ts`: `b26be9b74c008c4bbddbc04e11c6bb0bf9853bc8aa9a0157a7175cd48abd47e7`
- `frontend/features/environments/environments-page.tsx`: `92d29c2f586d2de028cfec425826274c752c364b859b9e4c597547f51a055d78`
- `frontend/features/environments/files/asset-import-panel.tsx`: `94e99cf3bcb2cc955388350c5ca6c7080bb976eed1dd9d5f0950fd8c2df8d725`
- `frontend/features/environments/files/asset-import.ts`: `a825ff94a287acd8bc61cd517f27fe92d1ee32cd999948fb9e6f7d3def217338`
- `frontend/features/environments/files/file-manager.mjs`: `2721e8e7abecd3dda95765eecb055f7bf3272942f1933807a07bba83a7df5ea6`
- `frontend/features/environments/files/files-panel.tsx`: `233f8e92e2c45bf52a576ea7e37ea60df92d0411399a323572cc09e58af529f2`
- `frontend/features/environments/files/knowledge-import-panel.tsx`: `be23c88c6b30b2a02a066b72da80b47123ad65d2a121bf8bee912ec286ec9428`
- `frontend/features/environments/files/knowledge-import.ts`: `bce2bebe39eb4f17650b35b4a020f51f757ba5594b6e178a4a44f98b45028abd`
- `frontend/features/environments/files/stream-download.mjs`: `b491973525cb44aefce8a265490471e947931c2380b605d15b37226ca7295943`
- `frontend/features/environments/network-lifecycle.mjs`: `0e40ef5fc54547a8eb8769598176d1bdae454d99a4e62a143981b7f545d89e06`
- `frontend/features/environments/storage/checkpoints.mjs`: `0f3e6fdf0a47455748cc139f7b811ca87be00a144c8a3c25433c26647c085722`
- `frontend/lib/use-toast.tsx`: `0b4f788931e28f9eb5d87d8d84414568187c35736094130452ad272891b950a8`
- `frontend/lib/workspace-location.ts`: `8e5fd84e7f611784f46a05016808cb6c2a5a7b507d4be306ae490afcac31bd35`
- `frontend/main.tsx`: `9ba6f443d0f7da037015cb7f1d1b3444777989588c66429d3630a0c5fb500391`
- `frontend/pages/workbench-landing/public-workbench-page.tsx`: `b618f593d164001e1765fc55e6e428c960357a83927fec5a70a6e3996b48ef82`
- `frontend/pages/workbench-landing/workbench-scene-runtime.ts`: `19b47d756dd823d4934eacd11d364bb3602b7f8fa09e74e4e5db588affdd761b`
- `frontend/pages/workbench-landing/workbench-scene.tsx`: `bd5def5c4ef683d0ae1422e26180a8feeca67de86ef4ccbea79b3605cb3fef5a`
- `frontend/public/sw.js`: `703801312e5cccba0cf162837b97878185fe03e18cdc2182c2fc4c5215923bad`
- `tools/browser-vm/checkpoint-recovery-browser.mjs`: `06a498590a0c6e00c9cf5c91dff81de7a6aa3b01c4c9768aa718ebc0de3d9efe`
- `tools/browser-vm/runtime-owner-browser.mjs`: `e5973069f711204d6ad79f011be6772e9243d403b6bb1ebd515ff361537c4c90`


### 2026-10-10 知识页读取生命周期后重新审查

- 已逐项比较当前索引与 `c5421f8e`：110 个未归属 ID 完全不变；`frontend/app.tsx` 的三个未归属边界（AppShell、SettingsPage、NotFoundPage）及 KnowledgeRoute 之前的源码逐字节一致。未归属表的行为和 caller 关系没有被新的知识页请求所有者替代。
- `KnowledgeRoute` 现在是以成员为 key 的 `MemberKnowledgeRoute` 包装器；索引已沿包装器追踪到知识页、分页、分享和历史订阅，而非丢失原路由候选。新增的成员归属、共享撤权、区块取消、活动追加去重及显式复习重读均属于已归属的知识页。
- 已检查实际 App 挂载、renderPage 身份/路径分支、KnowledgePage 回调和历史订阅；本次修改不扩大其他未归属组件的消费。更新上方 app 源码指纹及生成索引（270 源文件、1180 候选），不是仅改哈希绕过契约。
- 本轮功能与源码映射见 [知识列表操作与读取恢复证据](./knowledge-list-operation-review-and-read-recovery-evidence.md)。本段仅更新源码审查，不增加父项完成数或声称原生验收。

### 2026-10-14 前端交互动效层接入后重新审查

- 本轮引入 `motion` 运行时并把 beUI 注册表源码（loader、scroll-reveal、not-found）落到 `frontend/components/motion/`，改动 shell、共享 UI 原语与落地页。当前索引为 278 文件 / 1208 候选 / 114 未归属（原 110）。
- 迁移而非新增：`frontend/app.tsx` 的 NotFoundPage 返回首页链接被 `NotFoundGlitch` 取代，未归属坐标由 `frontend/app.tsx:931:250` 转移到 `frontend/components/motion/not-found/shared.tsx:55:7`（同级第二 CTA 为未接线项 `:65:9`）。app.tsx 的两个外层边界行为未变，仅因新增两行导入下移至 222:75、249:39。
- 新增未归属来源：`frontend/components/motion/loader.tsx`（3，角色/图形节点，App 启动态挂载 dots）与 `frontend/components/motion/not-found/shared.tsx`（2）。两者均无网络写入。2026-10-15：落地页 3D 加载态直接挂载 `loader.tsx` 的 dots，三个候选随之归属落地页，已从本文档移除。`frontend/components/motion/scroll-reveal.tsx` 归属落地页、`frontend/lib/ease.ts` 与 `frontend/lib/hooks/use-hover-capable.ts` 归属各自 caller，不计入未归属项。
- 已逐项核对：`frontend/components/shell/app-shell.tsx`、`frontend/components/ui/button.tsx`、`dialog.tsx`、`sheet.tsx`、`components/shell/command-palette.tsx` 的候选数量与归属关系未变（`motion.a`／`motion.button`／`motion.div` 与原生标签同为一处候选），因此不需要新增未归属行；仅用动效替换交互表现，未增加可点击面。
- 同步更新 `frontend/app.tsx`、`frontend/pages/workbench-landing/public-workbench-page.tsx` 指纹并新增上述三个 motion 来源指纹。本段只做源码对账，不代表生产发布、签名浏览器或原生验收。

### 2026-10-14 agent 答案面板接入 beUI citations 后重新审查

- 新增 beUI citations 落地文件（`frontend/components/agents/citations.tsx`、`agent-disclosure.tsx`、`frontend/lib/favicon.ts`、`frontend/lib/hooks/use-favicon.ts`），并把 `frontend/components/agent/answer-panel.tsx` 的来源列表从常开 `<div>` + `<h3>` 换成 `Citations` 折叠列表（`defaultOpen`，来源默认可见，用户可收起）。
- 未归属候选 114 → **115**：仅新增 `frontend/components/agents/citations.tsx:81:5`，即未被调用的内联角标组件 `Citation`（需要答案正文内嵌标记，当前答案正文为纯文本），归为 `unmounted-ui`。其余新文件均经 `answer-panel.tsx` → `agent-page.tsx` → 路由 root 追踪为已归属，不新增未归属项。
- 已逐项比较：本次无已文档化坐标被移除、无既有指纹漂移；仅新增该文件指纹，并新增其 caller `frontend/components/agent/answer-panel.tsx` 指纹。当前索引 282 文件 / 1211 候选 / 115 未归属。
- 本轮同时否决了同批次另外两个候选：`code-block` 依赖 shiki 语法高亮与需要一个 React 代码组件挂载点，而阅读器代码块来自 markdown → 净化 HTML 的 `dangerouslySetInnerHTML`，接入需要重构渲染管线；`streaming-response` 需要真实逐 token 流，而当前前端未消费 `/api/agent/sessions/:id/stream`，用它会伪装不存在的流式能力。两者都不在本索引内新增源码。

### 2026-10-14 admin 指标接入 beUI number-ticker 后重新审查

- 新增 `frontend/components/motion/number-ticker.tsx`，并把它接到 `frontend/pages/admin/admin-dashboard-page.tsx` 的管理概览计数与 `frontend/pages/admin/analytics-page.tsx` 的三张统计卡。
- 未归属集合不变，仍为 **115**：该组件的候选经管理页路由 root 追踪为已归属，没有新增未归属坐标、没有坐标移除、也没有既有指纹漂移，因此不新增未归属行与指纹。当前索引 283 文件 / 1211 候选 / 115 未归属（候选数与上轮相同：该组件不引入新的控件候选）。
- 同批次另外三个候选被否决：`table`／`table-async` 需要 `@tanstack/react-table` 与 `@tanstack/react-virtual` 两个新依赖，并把承载分页、权限与恢复语义的 admin 列表改写为虚拟化表格，收益不足抵偿回归面；`heat-calendar` 的唯一候选数据源是 7／14／30 天的 `daily` 序列，而该页已有可读的柱状趋势图，替换会降低趋势可读性、并列展示又会同一数据两种图形；`expandable-tabs` 无调用点——通用 `Tabs` 原语在第一方源码中零消费。

### 2026-10-14 毛玻璃材质层后重新审查

- 本轮只为既有表面替换背景/阴影类名（`bg-card`／`bg-background`／`bg-popover`／`shadow-*` → `material-chrome`／`material-panel`／`material-surface`），未新增控件、未改回调。索引仍为 283 文件 / 1211 候选 / 115 未归属。
- 唯一需要更新的指纹是 `frontend/components/ui/card.tsx`：候选坐标与语义未变，仅因类名替换导致源码字节变化。其余被 touched 的文件（shell、dialog、sheet、dropdown-menu、tooltip、落地页 CSS）的候选均归属各自路由 root，不在本记录指纹范围内。

### 2026-10-14 beUI 通知栈接入后重新审查

- 新增 `frontend/components/motion/animated-toast-stack.tsx`（beUI 落地副本，图标改用仓库既有 phosphor，`aria-label` 参数化后由调用方本地化）与 `frontend/lib/use-toast.tsx`（App 级 Provider + no-op 回退）。
- 未归属候选 115 → **120**：新增 5 条——通知栈 4 条（逐条渲染、拖拽关闭、action 按钮、关闭按钮）与 Provider 挂载 1 条，全部归 `app-boundary`，因为它们在 App 边界挂载一次、不属于任何业务 root。`frontend/app.tsx` 的两条外层坐标仅因新增一行导入下移至 223:106、250:39。
- 同步更新 `frontend/app.tsx` 指纹并新增上述两个来源指纹。当前索引 285 文件 / 1216 候选 / 120 未归属。

### 2026-10-14 阅读器接入 beUI code-block 后重新审查

- 新增 `frontend/components/agents/code-block.tsx`（beUI 落地副本：图标换 phosphor、复制/状态文案参数化、可在无流时隐藏状态芯片）、`frontend/components/agents/agent-code.tsx` 与 `frontend/components/agents/agent-highlighter.ts`（细粒度 shiki 入口：只带 5 个语法与 2 个主题，JS 正则引擎，动态加载）。
- 阅读器版本对比面板由自绘逐行 `<span>` 改为 `CodeBlock`（`language="diff"`），diff 文本按 hunk 头 + `±/空格` 前缀生成统一 diff。
- 未归属集合不变，仍为 **120**：新文件的候选经阅读器路由 root 追踪为已归属，无新增未归属坐标、无坐标移除、无既有指纹漂移。当前索引 288 文件 / 1218 候选 / 120 未归属。
- 无新增未归属指纹需求；`pages/knowledge-reader-page.tsx` 与 `lib/i18n.ts` 的候选均归属各自路由，且不在本记录指纹范围内。

### 2026-10-16 索引重生成后重新审查

- 生成索引重跑后为 321 文件 / 1324 候选 / **162** 未归属（本文档此前 118 行）。逐项比对后新增 44 条，全部补行并补指纹；既有行的坐标与措辞不变，无坐标移除。
- 新增 44 条按机制分两类：`app-boundary` 39 条（`frontend/app.tsx:429:10` 与 `frontend/app.tsx:438:10` 两个 renderPage 路由包装器边界，`frontend/pages/admin/create-role-page.tsx` 16 条，`frontend/pages/admin/role-detail-page.tsx` 20 条，`frontend/components/ui/checkbox.tsx:8:10` 1 条）；`unmounted-ui` 5 条（`frontend/components/motion/center-morph-modal.tsx` 4 条，`frontend/components/motion/switch.tsx` 1 条）。
- 角色新建页与权限详情页是真实可达路由：`frontend/app-routes.ts` 把 `/admin/roles/new` 与 `/admin/roles/<id>` 分别判为 admin-role-new / admin-role-detail，`renderPage` 对应分支渲染两个包装器，`frontend/pages/admin/roles-page.tsx` 的创建按钮与行链接也写入这两个路径。它们当时未归属只是因为这两个 kind 当时未登记为能力根/未进入以 root symbol 为起点的图，不是界面缺失；`components/ui/checkbox.tsx` 只被该详情页消费。2026-10-16 后续切片已把 admin-role-new / admin-role-detail 登记为能力根 `workbench-admin-role-new` / `workbench-admin-role-detail`，这些坐标随之归入对应路由，不再是未归属项（见文末最新对账）。两个 motion 副本（center-morph-modal、switch）在第一方源码中零 import，属无消费者原语。
- 新增 `center-morph-modal.tsx`、`switch.tsx`、`ui/checkbox.tsx`、`pages/admin/create-role-page.tsx`、`pages/admin/role-detail-page.tsx` 五个来源指纹；`frontend/app.tsx` 指纹未变（字节与上次审查一致）。
- 无产品运行行为修改、无 push/部署/迁移、未读取密钥；本段只做源码对账与文档契约补齐，不代替运行验收。

### 2026-10-16 页头与筛选器统一重构后重新对账

- 本批只统一已认证工作台各页的页头/筛选器结构，不新增也不移除未归属候选。当前索引 324 文件 / 1308 候选 / 161 未归属；与重构前索引（324 文件 / 1331 候选 / 161 未归属）相比，未归属文件集合与逐文件候选数完全一致，因此本轮不新增行、不删除行。
- 唯一整体位移的文件是 `frontend/pages/admin/role-detail-page.tsx`：20 条坐标逐项按候选自身的 AST 锚点（tag + handler + 标签文案 + owner，命令式监听器按 event 名锚定）配对迁移，不按行序推断；坐标由 42/44/45/73/140/141/143/147–152/156 段移至 48/49/50/79/146/147/149/152–157/161 段。每条的“触发/可见条件”与“行为与边界”措辞逐字保持，仅坐标变化。
- 该文件的 `AdminRoleDetailPage` 两个外层候选新增了页头 section 容器与 loading 分支上下文（48:152、49:169），回调与前置条件语义不变；`RolePermissionEditor` 转交行（50:9）的 handler 写法由直接标识符改为 `props.*`，仍是 props 边界而非新动作。其余 17 条的候选内容（含 owner、handler、标签）与重构前逐字段一致。
- 仅同步 `frontend/app.tsx`、`frontend/features/environments/environments-page.tsx`、`frontend/pages/admin/role-detail-page.tsx` 三个指纹，其余 38 条指纹字节未变；文档中的 caller 证据标注与未归属文件集合均未变化。
- 本轮为源码对账，不代替运行验收，也不改变 A01、A02、A05、D04 的开放状态及上述分类结论。

### 2026-10-16 admin-role-new / admin-role-detail 能力根登记后重新对账

- `shared/workbench-maturity-capabilities.ts` 新增两条能力记录与对应 root：`workbench-admin-role-new`（root symbol `AdminRoleNewRoute` @ `frontend/app.tsx` 与 `AdminRoleCreatePage` @ `frontend/pages/admin/create-role-page.tsx`）与 `workbench-admin-role-detail`（root symbol `AdminRoleDetailRoute` @ `frontend/app.tsx` 与 `AdminRoleDetailPage` @ `frontend/pages/admin/role-detail-page.tsx`）。生成索引随之由 34 条路由增至 36 条。
- 因此下列 40 条坐标不再是未归属候选并从本记录移除：`frontend/app.tsx:429:10`、`frontend/app.tsx:438:10`（两个 renderPage 路由包装器边界），`frontend/pages/admin/create-role-page.tsx` 16 条，`frontend/pages/admin/role-detail-page.tsx` 20 条，`frontend/components/ui/checkbox.tsx:8:10`（唯一消费者为该详情页），以及 `frontend/features/environments/storage/reconcile-checkpoints.ts:30:80`（现由 `workbench-environments` 能力根覆盖）。对应四个来源指纹行随之移除。
- 未归属候选由 161 降至 **121**。同步更新仍保有两条外层候选的 `frontend/app.tsx` 与作为 caller 证据的 `frontend/features/environments/environments-page.tsx` 指纹。当前索引 334 文件 / 1369 候选 / 121 未归属。
- 本段只登记能力根与坐标归属，不新增 UI 行为结论：这些坐标现由以 root symbol 为起点的图覆盖，其运行验收仍归各自父项，不改变 A01、A02、A05、D04 的开放状态。

### 2026-10-16 环境页文件面与运行时挂载后的重新分类

- 触发变化：正式 `/environments` 页面现在组合并挂载了此前只有 harness 消费的 VM/文件面。`frontend/features/environments/environments-page.tsx` 在选中环境后渲染 `EnvironmentFiles`（`frontend/features/environments/environment-files-surface.tsx` 经字面量动态 import 惰性加载 `files-panel.tsx`，并传入真实 `submission.memberId`）；`frontend/features/environments/environment-vm-composition.ts` 在挂载时经 G0 组合唯一的 owner 作用域 runtime，构造本地 checkpoint store 并由 `reconcile-checkpoints.ts` 对账。`reconcile-checkpoints.ts` 的候选此前已归入 `workbench-environments`。
- 新增分类 `vm-runtime-unshipped`（77 项），命名针对状态而非模块：本版本**有意**不发布 VM 引擎与镜像（六件固定启动产物合计约 66 MiB，其中 Alpine ISO 约 49 MiB；仓库内 pin 明确不授权再分发、不构成许可证清单，也不替代签名发布清单；每文件体积限制可由既有 chunked-image 打包与独立校验器绕开，但许可与发布清单要求未获批准）。因此这些模块虽已挂载/创建/惰性加载，面向用户或面向 VM 的动作永久不可用：`files-panel.tsx` 34 项（`state.available` 恒为假，只渲染 “Start an environment…” 占位；内含两个导入面板）、`asset-import-panel.tsx` 23 项、`knowledge-import-panel.tsx` 14 项、`stream-download.mjs` 2 项（随文件面同一延迟 chunk 加载）、`checkpoints.mjs` 2 项（store 在挂载时构造，save/load 不可达）、`account-vm-runtime.mjs` 1 项与 `authenticated-vm-runtime.ts` 1 项（挂载即创建/G0 组合，start 无法成功）。
- `vm-not-mounted` 缩减为 6 项，仅保留确实无正式调用者的惰性路径：`account-network.mjs` 3 项（只有显式 `owner.network(id)` 才创建，页面挂载不创建）、`connector-session.mjs` 1 项、`network-lifecycle.mjs` 2 项（由 account-network 创建且未传 events）。
- 两处判断需显式记录：`account-vm-runtime.mjs` / `authenticated-vm-runtime.ts` 原属“未消费组合”，现由页面挂载创建，故不留在 `vm-not-mounted`；`stream-download.mjs` 虽被归入“未挂载”一组，但其真实调用链为 `files-panel.tsx` → `file-manager.mjs#createFileManager` → `writeFileDownload`，随文件面同一延迟 chunk 加载，因此同样归入新分类。
- 行集与坐标：`frontend/app.tsx` 两条外层候选因新增导入下移至 231:106、258:39（行为与前置条件逐字不变）。行数不变：app-boundary 13、public-dynamic 5、background 3、unmounted-ui 17、vm-runtime-unshipped 77、vm-not-mounted 6，合计 121。新增 `environment-files-surface.tsx` 与 `environment-vm-composition.ts` 两条 caller 指纹。
- 本段只做源码对账与状态分类：不改变 A01、A02、A05、D04 的开放状态，也不把 `vm-runtime-unshipped` 读成“未接线”或“按需修复的缺陷”——它是本轮的发布决策状态，引擎发布决策改变后自然翻转。

### 2026-10-17 beUI 全量采用（Wave 1）新源码候选补行后重新对账

- 本批把 UI 原语换成 beUI 源码落地副本：新增 `frontend/components/motion/{alert,card,context-menu,popover,preview-rail}.tsx`、`motion/button/stateful.tsx` 与 `frontend/components/agents/{agent-activity/activity-row.tsx,agent-activity/index.tsx,loading-states/reasoning-text.tsx,message.tsx,message-bubble.tsx,message-scroller.tsx,streaming-response.tsx}`，并把 `components/ui/alert.tsx`、`components/ui/button.tsx` 改为本地包装式适配器、`components/ui/card.tsx` 改为纯再导出。索引重生成后为 399 文件 / 1660 候选 / **159** 未归属。
- 新增 39 行（净）：`motion/card.tsx` 10、`motion/context-menu.tsx` 8、`agents/message-bubble.tsx` 5、`agents/message.tsx` 4（另 4 个部件随 `agent-page` 接入归属）、`agents/message-scroller.tsx` 4、`motion/preview-rail.tsx` 4、`motion/popover.tsx` 2、`motion/alert.tsx:219:10`、`motion/button/stateful.tsx:209:5`。移除 1 行：`frontend/components/ui/card.tsx:13:85`（该文件改为纯再导出，CardFooter 候选随实现落到 `motion/card.tsx:216:5`）。
- 分类原则按 handler 而非按文件：(1) 只渲染调用方 props/children 的边界（`StatefulButton`、Card 根与 CardHeader/CardTitle/CardDescription/CardContent）记 `app-boundary`；(2) 当前无调用点或整模块零 import 的（`motion/context-menu.tsx`、`motion/popover.tsx` 的两条、`agents/message-bubble.tsx` 的三个折叠部件、`agents/message-scroller.tsx:462` 的 rail 分支、`agents/message.tsx` 的四个部件、`motion/preview-rail.tsx`、`AlertAction`、`CardAction`、`CardFooter`、card 的 interactive 按压路径）记 `unmounted-ui`；(3) 由 `frontend/app.tsx` 经 `components/agent/agent-transcript.tsx` 实际渲染、但声明侧不在 root 图内的 `MessageBubble`/`MessageBubbleContent`/`MessageScroller` 视口三条记 `app-boundary`，不谎称“未挂载”。
- 需要显式记录两类判断。其一，`motion/card.tsx` 与 `motion/button/stateful.tsx` 的候选未归属**不是**因为未挂载：Card 经 `components/ui/card.tsx` 纯再导出被 24 个文件消费（`CardHeader` 28 处、`CardContent` 35 处、`CardTitle` 28 处、`CardDescription` 2 处），`StatefulButton` 由登录页验证码提交按钮消费；原因是静态图不沿 `export … from` 纯再导出追到声明处，而页面内调用点候选已归属各自路由。其二，同一文件内分 handler 处置，例如 card 根与四个被使用的部件记 `app-boundary`，而同文件的 `CardAction`/`CardFooter` 与 interactive 按压监听器记 `unmounted-ui`。
- 坐标位移：`frontend/features/environments/files/asset-import-panel.tsx`（23 行）与 `.../knowledge-import-panel.tsx`（14 行）各因顶部新增一行 `Checkbox` 导入整体下移 1 行，`frontend/components/shell/context-rail.tsx`（6 行）与 `frontend/app.tsx`（2 行）同样整体下移 1 行；四组均逐项按 handler 配对后重记坐标（例如 parse 32:9→33:9、cancel 33:9→34:9，context-rail 关闭控件 33:7→34:7，app.tsx 外层 234:106→235:106、261:39→262:39），触发/行为措辞逐字不变。
- 指纹：新增 10 条（`motion/{alert,card,context-menu,popover,preview-rail}.tsx`、`motion/button/stateful.tsx`、`agents/{message,message-bubble,message-scroller}.tsx`，以及作为 `StatefulButton` caller 证据的 `components/ui/button.tsx`），`components/ui/card.tsx` 作为 Card 适配器保留；刷新 6 条（`app.tsx`、`agent/answer-panel.tsx`、`components/ui/card.tsx`、`shell/context-rail.tsx`、`files/{asset,knowledge}-import-panel.tsx`）。核对期间曾为 `agents/{streaming-response,agent-activity/*,loading-states/reasoning-text}.tsx` 补加的 4 条指纹随这批文件归属路由一并移除，`motion/collapsible.tsx` 因候选全部归属未入表；其余 fingerprint 字节未变。
- 本轮只做源码对账：不修改任何产品行为、不 push/部署/迁移、不读密钥，也不改变 A01、A02、A05、D04 的开放状态。注意本轮期间仍有并行 slice 在同一工作树新增源码（例如 `motion/collapsible.tsx`、`agents/streaming-response.tsx` 在核对过程中出现），索引与本文档需在该批落定后重跑一次 `node --test scripts/frontend-operation-inventory.test.mjs` 确认。

### 2026-10-17 beUI 全量采用（Wave 3）后重新对账

- 触发变化：本批新增 beUI 安装副本 `motion/range-slider.tsx`（含 `lib/hooks/use-slider.ts`）、`motion/date-range-picker.tsx` 与其 `date-range-picker/{context,date-utils,types,use-date-range-picker}.ts`、适配器 `ui/date-range-input.tsx`，并更新 tooltip/popover/context-menu/breadcrumb/collapsible 的安装副本、agent 聊天部件与 `ui/{skeleton,dialog,select,textarea,page-state}.tsx` 内部。索引重生成后为 162 未归属。
- 本批**不需要**为新文件补行，因为它们的候选都已在以 root symbol 为起点的图内：`range-slider` 由 `frontend/pages/goals-page.tsx:11` 直接渲染；`ui/date-range-input.tsx` 由 `frontend/pages/search-page.tsx:13` 与 `frontend/pages/my-submissions-page.tsx:6` 渲染，它组合 `DateRangePicker` 根与 Calendar/Header/Grid/Footer/Selection，从而覆盖了 `date-range-picker.tsx` 的 20 条候选；`breadcrumb` 由 `components/shell/app-shell.tsx:21` 消费并按 root 归属；`collapsible` 由知识阅读器页与 `knowledge-derivatives-panel.tsx` 消费；`tooltip` 经 `ui/tooltip.tsx` 生效；agent 聊天部件由 `pages/agent-page.tsx` 渲染；五个 `ui/*` 适配器的候选随原调用点归属。`motion/popover.tsx` 仍无 import，只剩此前记录的 2 条未归属。
- 新增 3 行，全部为 `unmounted-ui`：`motion/date-range-picker.tsx` 的 `DateRangePickerTrigger`（`:757:7`，MorphPopoverTrigger 内的 motion.button，转发 props/ref 并渲染格式化区间摘要）、`DateRangePickerContent`（`:839:5`，MorphPopoverContent 承载日历面，onOpenAutoFocus 记录节点并按 autoFocus 聚焦）、`DateRangePickerDropdown`（`:872:5`，root+trigger+content+calendar 的便捷组合）。三者是 payload 自带的库内便捷层，正式适配器自绘触发器并直接组合 Calendar，因此没有调用点；它们只渲染调用方 props/children 与本地开合/焦点，没有网络写入。这与 Wave 1 的判据一致：vendored 组件的库内动作记 `unmounted-ui`，由 App/路由实际挂载的边界记 `app-boundary`。
- 坐标重记 1 条：`frontend/lib/use-toast.tsx` 29:7→28:7（ToastProvider 内 `<AnimatedToastStack>` 行；该文件删掉一行注释后整体上移，行为措辞逐字不变，仅补记 `fixed position="bottom-right"`、`maxVisible` 3）。其余既有行的坐标未变，未归属文件集合也未变。
- 指纹：新增 1 条（`motion/date-range-picker.tsx`），刷新 2 条（`app.tsx` 因新增导入与路由分支、`lib/use-toast.tsx` 因上述改动）。`motion/range-slider.tsx`、`lib/hooks/use-slider.ts`、`date-range-picker/*` 其余模块与五个 `ui/*` 适配器没有候选，故不入表。
- 本轮只做源码对账：不修改产品行为、不 push/部署/迁移、不读密钥，也不改变 A01、A02、A05、D04 的开放状态。最终 `node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过（含索引新鲜度一条），可作为本轮的文档门禁证据，但仍不是业务旅程回归。

### 2026-10-17 beUI 全量采用（Wave 4，100%）后重新对账

- 触发变化：本批采用 Wave 1–3 中被否决的载荷（矩阵 §17；逐片结果 §18–§20），首次落地 `motion/animated-sidebar.tsx`、`motion/combobox/**`（含 barrel `motion/combobox.tsx`）、`motion/magnetic.tsx`、`motion/button/{magnetic,metallic}.tsx`、`motion/action-swap.tsx` 与 `motion/action-swap-roll.tsx`；并对 `motion/center-morph-modal.tsx`、`motion/popover.tsx`（以及 `file-tree` 等）打 §17 补丁。未归属候选 162 → **192**，文件集合也变了：`ui/dropdown-menu.tsx` 重新进入未归属集合，`center-morph-modal.tsx` 与 `popover.tsx` 退出。
- 按实际渲染面分类（**不按文件**）：
  - `app-boundary` 6 条新增：`combobox/content.tsx:111:7`（`inline` 面板）、`combobox/context.tsx:286–288`（根部 pointerdown/focusin/keydown 关闭）、`combobox/list.tsx:37:5`（listbox）与 `:149:5`（option 行）。依据是 `ui/filter-select.tsx` 已在搜索、任务、审计、成员等 15 个页面渲染这套 combobox；声明侧未归属只因静态图不跟随 barrel `motion/combobox.tsx` 的 `export … from`（与 Card/`StatefulButton` 同一机制），不能记成“未挂载”。
  - `unmounted-ui` 30 条新增：`animated-sidebar.tsx` 的 13 个部件（app-shell 只用了 `Provider`/`AnimatedSidebar`/`Menu`/`MenuButton`/`MenuItem`/`MenuSub`，`Trigger`/`Close`/`Rail`/`Inset`/`Header`/`Content`/`Footer`/`Group`/`GroupLabel`/`GroupContent`/`MenuSubItem`/`MenuSubButton` 两个分支无人调用）、`combobox` 的 `Empty`/回退触发器 div/`ComboboxInput`/portal 分支、`action-swap` 的按钮与 roll 包装的按钮/图标、`magnetic`/`button/magnetic`/`button/metallic`、`ui/dropdown-menu.tsx` 的 7 条。
- §17 补丁改变了 handler 的性质（已在各节写明）：`combobox/trigger.tsx` 的 `render` 元素插槽 + `keyboard="trigger"` 把开合从“聚焦内部 input”改成“调用方按钮直接翻转 `setOpen`”，因此回退 div 与 `ComboboxInput` 都成了无人走的路径；`center-morph-modal.tsx` 把 backdrop/面板/关闭按钮改为可注入 `backdropProps`/`panelProps`/`children` + `onDismiss`/`dismissible`/`showCloseButton`；`popover.tsx` 把硬编码的 `role="dialog"`/`aria-haspopup` 改为调用方语义插槽——这正是 `ui/dropdown-menu.tsx` 注释里当初否决它的理由被消除之处，也是 app-shell 改用它的原因。
- `ui/dropdown-menu.tsx` 的 7 条需要单独说明：它不是 vendored 载荷，而是第一方自绘菜单；`app-shell.tsx` 改用 beUI 的 popover/command-palette 后它已零 import，所以整组记 `unmounted-ui`。是否直接删除这段死代码属于另一个决定，本记录不代替该决定。
- 归属后移除的 6 行：`center-morph-modal.tsx` 4 条（坐标随补丁移至 `337:5`/`354:15`/`388:19`/`432:23`，经 `ui/dialog.tsx` 进入 root 图）与 `popover.tsx` 2 条（`:420:7`/`:725:11`，经 `app-shell.tsx:9` 进入 root 图）。两节改写为“0，已归属”说明，其指纹行随之移除。
- 指纹：新增 11 条（`action-swap{,-roll}`、`animated-sidebar`、`button/{magnetic,metallic}`、`combobox/{content,context,list,trigger}`、`magnetic`、`ui/dropdown-menu`），刷新 2 条（`features/environments/environments-page.tsx`、`.../files/files-panel.tsx`，均因本批对文件面的 props 变动）。`lib/hooks/use-slider.ts`、`combobox.tsx`（barrel）与 `date-range-picker/*` 辅助模块没有候选，不入表。
- **门禁状态**：本记录相关的两条测试（覆盖 + 指纹）通过，索引新鲜度一条也通过（192/192，零漂移、零缺失）。第三条 `real repository includes exact-result controls and both secondary confirmation actions` 仍然失败，但原因是**源码断言**而非本记录：`scripts/frontend-operation-inventory.test.mjs:131` 断言 `frontend/components/shell/command-palette.tsx` 仍有一条 `kind === "listener"` 候选，而 Wave 4 把它的 `⌘/Ctrl K` 快捷键改成传给 beUI 载荷的 `shortcut="k"`，该文件现在只剩一个 toast 的 `useEffect`、没有 `addEventListener`；同一监听在索引里已落到 `frontend/components/motion/command-palette.tsx:148:5`（`listener`，owner `CommandPalette`）。因此该断言需要改指新位置（或让 shell 文件重新自持监听），属于测试/源码变更，本记录只做源码对账，不代为修改。

### 2026-10-17 成员页双页签 / `ui/tabs` 组合载荷后重新对账

- 触发变化：成员页把「成员 / 授权记录」拆成两个 beUI 页签，`components/ui/tabs.tsx` 同时由自绘实现改为在已安装载荷 `motion/tabs.tsx` 外做适配器（导出名、`TabsList` 的 `wrapperClassName` 等调用面保持不变）。索引里的未归属候选 192 → **181**：减少的 11 条全部来自本轮的两个变化（`ui/tabs.tsx` 4 条、`ui/dropdown-menu.tsx` 7 条），没有新增候选、也没有既有坐标位移。
- `frontend/components/ui/tabs.tsx`：原先 4 条（根 `Provider`、`TabsList` 键盘、`TabsTrigger` 点击、`TabsContent` 面板）随 `members-page.tsx:8` 的正式使用进入 root 图，坐标重锚为 `67:5`、`73:10`、`103:10`、`121:10`；本节改为“0，已归属”，指纹行撤下。**适配器组合载荷后 handler 的归属含义要分清**：载荷负责 pill 指示器布局动画、可滚动列表与边缘按钮、focus reveal 与 reduced-motion 折叠；适配器补的是载荷未建模的 `id`/`aria-controls`、roving `tabIndex`、Home/End/方向键（`lib/tabs-keyboard.ts`）、`data-state`、`hidden` 面板与受控/非受控桥接。这些动作仍只是本地选择与焦点管理，没有网络写入——它们从 `unmounted-ui` 变成已归属，是因为有了真实消费者；若将来又失去消费者，按本记录的判据应记 `app-boundary`（只渲染调用方 props/children 的边界），而不是再记“未挂载”。
- 两处 §17 attribute-passthrough 补丁：`motion/tabs.tsx:101`（`Tabs` 把 rest props 透到布局根）与 `:381`/`:387`（`TabsContent` 透 `hidden`/`data-state`/rest 到面板），适配器正是靠它们才能把 `id`/`role`/`aria-*`/`data-*` 送到语义节点。载荷自身 8 条候选（根 motion.div、列表 viewport 监听、两个边缘滚动按钮、列表 focus 捕获、trigger 的 underline/默认两个分支等）全部已归属，无需新增行。
- `frontend/components/ui/dropdown-menu.tsx`：作为死代码删除（Wave 4 已判定它失去唯一消费者，是否删除当时留作单独决定；本轮已执行删除，工作树不再有该文件）。上一轮为它记的 7 条 `unmounted-ui` 行与指纹撤回，原因是**源码不存在**，不是被接线。
- 指纹：撤下 2 条（`ui/tabs.tsx` 已归属、`ui/dropdown-menu.tsx` 已删除），本轮无新增、无刷新——`app-shell.tsx`、`members-page.tsx` 等参与接入的文件本身没有候选，不在指纹范围。行数与计数已按行实测对齐：app-boundary 30、public-dynamic 5、background 3、unmounted-ui 60、vm-runtime-unshipped 77、vm-not-mounted 6，合计 181。
- 门禁：`node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过（含索引新鲜度），本轮仍只做源码对账，不改变 A01、A02、A05、D04 的开放状态。

### 2026-10-17 成员页页签写入 URL（`?tab=invitations`）后重新对账

- 触发变化：`AdminMembersRoute`（`frontend/app.tsx`）接管页签状态，新增 `changeTab`、挂载与搜索变化的归一化 effect，以及一条 `subscribeWorkspaceLocation` 分支，把当前页签写回 `?tab=` 并响应外部导航；新增助手 `frontend/lib/admin-members-query.ts` 只做纯派生（`ADMIN_MEMBERS_TABS`、`isAdminMembersTab`、`parseAdminMembersTab`、`writeAdminMembersTab`、`normalizeAdminMembersTab`）。未归属候选仍为 **181**，文件集合与分类均未变。
- 重锚 2 条（措辞逐字不变）：`frontend/app.tsx` 的 `235:106 → 236:106`（AppShell 的 `onNavigate`/`onLogout` 转发）与 `262:39 → 263:39`（`SettingsPage` 的 locale/member 透传）。两条候选的属性、回调与前置条件没有变化——新逻辑都在 `AdminMembersRoute` 内部，坐标只随顶部新增的一行导入下移，因此仍记 `app-boundary`。
- 无新增行：`frontend/lib/admin-members-query.ts` 没有任何控件、监听器或 spread 候选（解析/写串/归一化都是无副作用的字符串函数），按“有候选才登记”的规则不入表和指纹；`frontend/pages/admin/members-page.tsx` 改为受控页签后仍有 25 条候选，全部已随 `workbench-admin-members` 路由 root 归属，其坐标变化不影响本记录。`subscribeWorkspaceLocation` 本身在 `lib/workspace-location.ts:112:3` 已归属（App 侧使用），新的调用点不会把它变回未归属。
- 指纹：刷新 2 条——`frontend/app.tsx`（新增导入与路由分支）与 `frontend/lib/workspace-location.ts`（一行编辑；其唯一未归属候选 `63:3` 的 `subscribeWorkspaceHistoryFault` 坐标与语义未变）。无新增、无删除。
- 门禁：`node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过（含索引新鲜度）；本轮仍是源码对账，不改变 A01、A02、A05、D04 的开放状态。

### 2026-10-18 落地页版面并入工具类后重新对账

- 触发变化：`frontend/pages/workbench-landing/public-workbench-page.tsx` 与 `workbench-feature-panel.tsx` 的版面、排版类名从 `workbench-landing.css` 的手写类改成 Tailwind 工具类，`workbench-landing.css` 只留调色板、祖先滚动锁、场景/媒体规则、模态层与两条无法用工具类表达的规则。**未归属候选与分类均不变（仍 159 条）**：本轮的编辑只改 `className` 字符串与样式表，没有新增控件、监听器、spread 或条件分支，因此没有新增/删除/重锚行。
- 语义未变，逐项核对：落地页的 5 个功能按钮、开始/探索/暂停/下一步/重放、语言列表箱、场景角度页签、关闭与引用返回按钮的 handler、`aria-*` 与 `data-demo-action` 全部原样保留（`className` 之外属性逐字对比）。`workbench-feature-panel.tsx` 的抽屉开关、引用跳转、任务完成同样未动。
- 两条与工具类不兼容的约束（按源码实测，记录以免下轮再撞）：`frontend/styles/globals.css:92` 的 `* { border-color: var(--border) }` 不在任何 cascade layer 内，因此压过 `@layer utilities` 里的全部 `border-*` 颜色工具类——落地页头部去掉了会变实线的 `border-transparent`，选语言触发器的 `border-input` 也不再用工具类表达；引用段落的 3px 主色竖线因此留在 `.workbench-source [data-cited]` 的普通规则里。另一条是 `figure.workbench-studio`：`.workbench-studio picture/img` 规则被保留，标记侧的类名也必须保留，否则海报圆角与移动端 9/11 比例静默丢失（本轮实测发现并修复）。
- 指纹：刷新 1 条（`frontend/pages/workbench-landing/public-workbench-page.tsx`）。`workbench-feature-panel.tsx`、`workbench-landing.css` 没有未归属候选也没有 caller 证据，按“有候选才登记”的规则不入表。同轮生成的索引（476 文件 / 1772 候选 / 159 未归属）是相对工作树的重新生成，包含此前未入索引的 beUI 表单基元批次，不是本轮引入的候选变化。
- 门禁：`npm run audit:frontend-operations` 与 `node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过；本轮仍只做源码对账，不改变 A01、A02、A05、D04 的开放状态。
