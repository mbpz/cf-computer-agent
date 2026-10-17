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

## 分类结果与下一步

| 分类 | 候选数 | 已确认的源码含义 | 尚需完成 |
| --- | ---: | --- | --- |
| app-boundary | 13 | App 外层、history fault 与账户 owner 已有正式消费 | 跨路由、真实身份/退出、导航故障旅程 |
| public-dynamic | 5 | landing 动态导入的 WebGL 生命周期 | 原生浏览器可见性、超时、context loss 与回退验收 |
| background | 3 | Service Worker 生命周期，不是可见控件 | 真实浏览器注册/缓存/离线行为 |
| unmounted-ui | 17 | ContextRail / CardFooter / Tabs 无当前正式消费者 | 按实际需求保留或接线；不得直接认定缺失业务 |
| vm-runtime-unshipped | 77 | 正式 `/environments` 页面已挂载、创建或惰性加载文件面、运行时与本地快照；本版本**有意**不发布 VM 引擎与镜像（六件启动产物约 66 MiB，pin 不授权再分发、不构成许可证清单或签名发布清单），因此面向用户或面向 VM 的动作永久不可用：禁用、不渲染，或只存在于无法成功启动的路径。按状态命名而非按模块，引擎发布决策改变后自然翻转。 | 不要读成“未接线”，也不要当成按需修复的缺陷；待引擎发布决策改变后再重新分类 |
| vm-not-mounted | 6 | 连接器、会话与网络 lifecycle 惰性路径仍无正式调用者：只有显式 connect/open 才创建，页面挂载不会 | 沿既有 G0 边界完成正式接线及身份/生命周期验收 |

A01、A02、A05、D04 仍开放。源码人工分类覆盖这 121 项，但 A01 还缺每页实际可见性、动态 HTML/门户/第三方控件和触发状态的呈现核验；A02 还缺全操作到服务端授权/持久化及运行证据的闭合。禁止把文档行数、指纹或绿色测试当作上述父项验收通过。

下表“条件”与组内共同守卫叠加。状态提示、role、option、props 转发和监听器均保留；不是每一行都对应一次用户操作。未挂载项的条件均是假设调用者接线之后的源码条件，不能误读为当前正式页面已可用。

## `frontend/app.tsx`（2）

入口为 [source:frontend/main.tsx] 的 App。App 先处理 sessionError、匿名首页/登录、会话加载，再挂载 AccountNetworkBoundary、AppShell、HistoryNavigationNotice。属于全局外层，不在以业务 root symbol 为起点的图中。SettingsPage 行是 props/spread 边界，不是新的保存动作。原属本文件的两条 AdminRoleCreatePage/AdminRoleDetailPage JSX 边界（429:10、438:10）：两个包装器在 renderPage 的 admin-role-new/admin-role-detail 分支渲染；admin-role-new / admin-role-detail 现已在 `shared/workbench-maturity-capabilities.ts` 登记为能力根 `workbench-admin-role-new` / `workbench-admin-role-detail`，这两条候选随 root symbol `AdminRoleNewRoute` / `AdminRoleDetailRoute` 归入对应路由，2026-10-16 起从本记录移除。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/app.tsx:234:106` | app-boundary | 已认证会话通过外层守卫；AppShell 内部触发导航/退出 | navigate 写入 workspace history；logout(owner) 执行账户退出，具体按钮与 pending 仍由 AppShell 控制。 |
| `frontend/app.tsx:261:39` | app-boundary | renderPage 进入 settings 且存在 session | 将 locale、member email/role 传入 SettingsPage；没有新增网络写入。 |

## `frontend/components/agents/citations.tsx`（1）

beUI citations 组件的落地副本，由 agent 答案面板（`frontend/components/agent/answer-panel.tsx`）消费其 `Citations` 折叠来源列表。唯一未归属候选是未被产品调用的内联角标组件 `Citation`（需要答案正文内嵌标记，当前答案正文是纯文本）。[source:frontend/components/agent/answer-panel.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/agents/citations.tsx:81:5` | unmounted-ui | 仅当调用方渲染内联角标 `Citation` 时挂载；当前无调用点 | 锚点指向 `#<idPrefix>-<citationId>` 定位同页来源行；默认英文 `View citation {index}` 仅在该未接线组件内出现。 |

## `frontend/components/history-navigation-notice.tsx`（2）

App 外层挂载：[source:frontend/app.tsx]。无 fault 时返回 null；故障消息和重试按钮是同一故障状态的两个源码候选，不是两个业务功能。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/history-navigation-notice.tsx:11:10` | app-boundary | 已登录 App 挂载且 history fault 非空 | role=alert 呈现历史导航故障；无写接口。 |
| `frontend/components/history-navigation-notice.tsx:13:5` | app-boundary | 同上且 retrying 为 false 时点击 | retryWorkspaceHistory；等待期间禁用按钮，finally 清除 pending；失败仍不视为导航完成。 |

## `frontend/components/motion/animated-toast-stack.tsx`（4）

beUI 通知栈的落地副本，由 `frontend/lib/use-toast.tsx` 的 `ToastProvider` 在 App 边界挂载一次。它不是路由能力，也不属于任一业务 root，故逐项登记。[source:frontend/lib/use-toast.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/animated-toast-stack.tsx:301:11` | app-boundary | Provider 传入 toasts 后逐条渲染 | 按 toast.id 渲染；本身不发起任何网络请求。 |
| `frontend/components/motion/animated-toast-stack.tsx:352:5` | app-boundary | 通知入队或出队时 | 入场/退场动画；仅当横向拖拽超过 72px 或速度超过 520 才视为关闭。 |
| `frontend/components/motion/animated-toast-stack.tsx:480:17` | app-boundary | 通知带 action 且用户点击该按钮 | 调用调用方传入的 `action.onClick(toast)`；组件自身不执行写入。 |
| `frontend/components/motion/animated-toast-stack.tsx:494:15` | app-boundary | canDismiss 为真且用户点击关闭 | 调用 `onDismiss(toast.id)`；`aria-label` 由调用方以本地化文案传入（`COMMON_DISMISS`）。 |

## `frontend/components/motion/center-morph-modal.tsx`（4）

beUI center-morph 模态的落地副本，`frontend/` 第一方源码当前没有 import 或渲染点；与 tabs/card 同类，下列条件均为假设调用者接线之后，不是当前可见界面。面板用 clip-path 从中心展开，全程没有网络写入。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/center-morph-modal.tsx:242:5` | unmounted-ui | 若内容层挂载且 context.open 为真 | window keydown：Escape 且 dismissible 时 setOpen(false)；Tab 在面板首尾可聚焦元素间循环，没有可聚焦元素时聚焦面板。 |
| `frontend/components/motion/center-morph-modal.tsx:259:15` | unmounted-ui | 若挂载且 context.open 为真 | 全屏 backdrop 按钮，tabIndex 为 -1，dismissible 为假时 disabled；点击 setOpen(false)，不发起请求。 |
| `frontend/components/motion/center-morph-modal.tsx:289:19` | unmounted-ui | 若挂载且 context.open 为真 | role=dialog 面板，id 取 context.contentId，渲染 children；展开/收起只改 clip-path，不改业务状态。 |
| `frontend/components/motion/center-morph-modal.tsx:331:23` | unmounted-ui | 若挂载、open 且 showCloseButton 为真 | 面板右上角关闭按钮，点击 setOpen(false)；文案由 closeButtonLabel 传入。 |

## `frontend/components/motion/loader.tsx`（0，2026-10-15 归属落地页）

落地页 3D 加载态现在直接挂载该组件的 `dots` variant（`workbench-scene.tsx`），因此本文件的三个候选全部归属落地页，不再计入未归属项。历史分类见文末变更说明。

## `frontend/components/motion/not-found/shared.tsx`（2）

路由 fallback 的 404 舞台与 CTA 行。原 `NotFoundPage` 内的返回首页链接已被 `NotFoundGlitch` 取代，该未归属坐标由 `frontend/app.tsx:931:250` 迁移到本文件；app.tsx 不再持有此候选。[source:frontend/components/motion/not-found/glitch.tsx]

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/motion/not-found/shared.tsx:55:7` | app-boundary | 路由 fallback 渲染 404；homeHref 默认 `/` | motion.a 指向 homeHref；whileTap/whileHover 受 reduced-motion 与 hover 能力门控。 |
| `frontend/components/motion/not-found/shared.tsx:65:9` | unmounted-ui | 仅当调用方传入 browseHref 时渲染 | 第二 CTA 当前没有调用点传 browseHref，因此不出现在工作台界面中。 |

## `frontend/components/motion/switch.tsx`（0，2026-10-16 归属管理端菜单编辑器）

管理端菜单编辑器的布尔可见性字段改为使用该组件（`menu-editor.tsx`），因此本文件的候选归属管理端，不再计入未归属项。

## `frontend/components/shell/context-rail.tsx`（6）

当前第一方 frontend 源码未发现 ContextRail 的消费；不能由名称推定 AppShell 已挂载。下面是如果挂载后的条件，不是已在产品显示的证明。无需将已有 AppShell 导航再造一套；是否恢复这个组件要由需求决定。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/shell/context-rail.tsx:33:7` | unmounted-ui | 若组件挂载，共用 rail content 展示关闭控件 | onClose 回调；父组件负责 collapsed 状态。 |
| `frontend/components/shell/context-rail.tsx:36:32` | unmounted-ui | 若组件挂载，按可见 modules 循环 | go(event,module.entryPath)；使用传入 onNavigate 或浏览器链接。 |
| `frontend/components/shell/context-rail.tsx:38:296` | unmounted-ui | 若挂载且未折叠，children 非空 | 对每个子路由执行 go(event,route.path)。 |
| `frontend/components/shell/context-rail.tsx:39:37` | unmounted-ui | 若挂载且未折叠，currentModule 存在 | go(event,currentModule.entryPath) 打开当前模块。 |
| `frontend/components/shell/context-rail.tsx:46:60` | unmounted-ui | 若挂载，移动触发器可见时点击 | setMobileOpen(true)，打开 Sheet。 |
| `frontend/components/shell/context-rail.tsx:47:5` | unmounted-ui | 若挂载，Sheet 的打开状态改变 | setMobileOpen；关闭/焦点行为需真实组件旅程验收。 |

## `frontend/components/ui/card.tsx`（1）

Card 的其他导出有正式消费者，不代表 CardFooter 有消费者。仅 CardFooter 候选未归属；检查当前 frontend 未发现其消费。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/ui/card.tsx:13:85` | unmounted-ui | 若未来挂载 CardFooter 并传入 div props | 通用容器转发 props/children；不能因为 spread 就计为独立用户动作。 |

## `frontend/components/ui/checkbox.tsx`（0，2026-10-16 随 admin-role-detail 能力根归属）

`components/ui/checkbox.tsx` 的唯一消费者原为未归属的 `frontend/pages/admin/role-detail-page.tsx`；admin-role-detail 登记为能力根 `workbench-admin-role-detail` 后，该消费者整页归入该路由，本文件的候选（原生 `input type=checkbox`，转发 ref 与其余 props）随之归属对应路由，2026-10-16 起从本记录移除。`components/motion/checkbox.tsx` 另有已归属消费者，两者不是同一实现，不重复计算。

## `frontend/components/ui/tabs.tsx`（4）

当前 frontend 未发现此 Tabs 模块消费；不将 role=tab 的可复用实现当作当前可见产品页面。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/components/ui/tabs.tsx:35:93` | unmounted-ui | 若 Tabs 根组件挂载 | Provider 提供 value、orientation 等上下文；div 转发 props。 |
| `frontend/components/ui/tabs.tsx:40:10` | unmounted-ui | 若 TabsList 挂载且键盘动作未被 preventDefault | 按方向及 Home/End 选择未禁用 tab，调用 setValue 并移动焦点；当前为自动激活。 |
| `frontend/components/ui/tabs.tsx:66:10` | unmounted-ui | 若 TabsTrigger 挂载、点击未被阻止且未 disabled | context.setValue(value)；受控状态由调用者负责。 |
| `frontend/components/ui/tabs.tsx:74:10` | unmounted-ui | 若 TabsContent 挂载且其 value 为 active | 显示对应 panel；非 active 使用 hidden；这是语义/焦点候选而非写操作。 |

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

## `frontend/features/environments/files/asset-import-panel.tsx`（23）

由 FilesPanel 在 assetImporter 存在时挂载；模型要求 submission.memberId 非空。正式 [source:frontend/features/environments/environment-files-surface.tsx] 现已挂载 FilesPanel 并传入真实 submission.memberId，因此本面板不再是 harness 专属；但本版本有意不发布 VM 引擎，FilesPanel 的 FileView 在不满足 state.available 时提前返回占位；共同条件 state.kind 非 idle（busy 合并模型和 workflow 状态）因此永远不可达。harness 仍仅传 runtime/locale。A02 的下游为 [source:frontend/features/environments/files/asset-import.ts] 和既有 asset-workflow。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/asset-import-panel.tsx:24:37` | vm-runtime-unshipped | canUpload 为真且未 busy，用户确认原文件 | setUploadAck；仅修改明确上传确认状态。 |
| `frontend/features/environments/files/asset-import-panel.tsx:25:7` | vm-runtime-unshipped | canUpload、已 uploadAck、未 busy 且无 storage 错误 | model.upload，重试固定同一文件/意图；不自动解析。 |
| `frontend/features/environments/files/asset-import-panel.tsx:30:7` | vm-runtime-unshipped | flow.intent 存在且未 busy | model.refresh 回读服务端状态，不重放写入。 |
| `frontend/features/environments/files/asset-import-panel.tsx:32:9` | vm-runtime-unshipped | job 为 queued 或 failed_retryable 且未 busy | model.parse 显式启动/重试解析。 |
| `frontend/features/environments/files/asset-import-panel.tsx:33:9` | vm-runtime-unshipped | job 为 queued 或 failed_retryable 且未 busy | model.cancel 请求取消服务端待处理资产。 |
| `frontend/features/environments/files/asset-import-panel.tsx:35:33` | vm-runtime-unshipped | job 为 failed_terminal 且未 busy | releaseFailed 解除失败本地意图，保留服务端资产。 |
| `frontend/features/environments/files/asset-import-panel.tsx:36:36` | vm-runtime-unshipped | job 为 succeeded、尚无 review 且未 busy | previewParsed 回读已解析内容。 |
| `frontend/features/environments/files/asset-import-panel.tsx:39:9` | vm-runtime-unshipped | review 已锁定且未 busy | retrySubmission 重试原审核载荷，不使用当前编辑字段。 |
| `frontend/features/environments/files/asset-import-panel.tsx:42:20` | vm-runtime-unshipped | state.parsed 存在 | 可聚焦 pre 显示字面解析 Markdown；不是执行 HTML 或提交动作。 |
| `frontend/features/environments/files/asset-import-panel.tsx:44:58` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新本地审核标题。 |
| `frontend/features/environments/files/asset-import-panel.tsx:45:99` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新 requestedSpaceId；服务端仍需校验目标权限。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:68` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新本地 shared/admin_only 请求范围。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:180` | vm-runtime-unshipped | 审核范围 Select 可编辑 | shared 选项；最终范围仍受服务端审核约束。 |
| `frontend/features/environments/files/asset-import-panel.tsx:46:230` | vm-runtime-unshipped | 审核范围 Select 可编辑 | admin_only 选项；不代表已发布或权限提升。 |
| `frontend/features/environments/files/asset-import-panel.tsx:47:37` | vm-runtime-unshipped | parsed 存在且无 review、未 busy | 更新明确审核确认 reviewAck。 |
| `frontend/features/environments/files/asset-import-panel.tsx:48:7` | vm-runtime-unshipped | editable、reviewAck、标题/空间非空且未 busy | model.submit 固定目标与 acknowledged；请求审核而非发布。 |
| `frontend/features/environments/files/asset-import-panel.tsx:50:34` | vm-runtime-unshipped | state.error 或 flow.error 非空 | role=alert 显示错误与未确认结果；对象存储不可用时不上传，也不退化为直接发布。 |
| `frontend/features/environments/files/asset-import-panel.tsx:51:32` | vm-runtime-unshipped | flow.kind 为 submitted | role=status 显示 submissionId；不当作发布完成。 |
| `frontend/features/environments/files/asset-import-panel.tsx:52:31` | vm-runtime-unshipped | flow.kind 为 canceled | role=status 显示服务端取消已确认；不同于停止本地等待。 |
| `frontend/features/environments/files/asset-import-panel.tsx:53:31` | vm-runtime-unshipped | flow.kind 为 released | role=status 显示失败本地意图已解除，服务端资产仍保留。 |
| `frontend/features/environments/files/asset-import-panel.tsx:54:5` | vm-runtime-unshipped | 非 idle 的资产面板内点击我的提交 | href=/my-submissions 导航；读取结果与权限仍由目标页面负责。 |
| `frontend/features/environments/files/asset-import-panel.tsx:55:12` | vm-runtime-unshipped | busy 时用户点击停止等待 | model.stop；只停止本地等待，不宣称撤销服务端处理。 |
| `frontend/features/environments/files/asset-import-panel.tsx:56:5` | vm-runtime-unshipped | 非 idle 且未 busy，用户关闭 | model.close；保留成员未决恢复元数据。 |

## `frontend/features/environments/files/files-panel.tsx`（34）

实际消费者有两个：[source:tools/browser-vm/runtime-owner-browser.mjs]（仅传 runtime/locale，未传 submission，因而该 harness 不提供两个导入模型）与正式 [source:frontend/features/environments/environments-page.tsx]。正式页面**已挂载**：选中环境后渲染 `EnvironmentFiles`（[source:frontend/features/environments/environment-files-surface.tsx]），后者经惰性 `import('./files/files-panel')` 挂载本面板并传入真实 submission.memberId；本文件的 34 条候选因此属于新分类 vm-runtime-unshipped。本版本有意不发布 VM 引擎与镜像，owner 作用域 runtime 永远无法进入 running，FileView 的共同条件 state.available 恒为假，组件只渲染“Start an environment…”占位，全部动作（含两个导入面板）永久不可用。blocked=busy、editor、文本导入打开或资产导入打开。各行额外条件如下；所有选项/提示也保留，不把每行等同用户动作。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/files-panel.tsx:27:129` | vm-runtime-unshipped | binding 与当前 runtime/member/requester 全部一致 | 向 FileView 传递 manager/importer/assetImporter 和剩余 props；旧绑定不渲染。 |
| `frontend/features/environments/files/files-panel.tsx:73:7` | vm-runtime-unshipped | 文件可用、未 blocked 且非根目录 | manager.load 父目录第 1 页。 |
| `frontend/features/environments/files/files-panel.tsx:74:7` | vm-runtime-unshipped | 文件可用且未 blocked | manager.load 刷新当前目录，不重放前次写入。 |
| `frontend/features/environments/files/files-panel.tsx:75:7` | vm-runtime-unshipped | 文件可用且未 blocked | openModal(mkdir)；这里只打开新建目录确认框。 |
| `frontend/features/environments/files/files-panel.tsx:76:41` | vm-runtime-unshipped | 文件可用、未 blocked 且用户选择至少一个文件 | 清空 input 后 manager.upload(files)，批量逐项处理。 |
| `frontend/features/environments/files/files-panel.tsx:77:22` | vm-runtime-unshipped | 正在 busy 且未 cancelling | manager.cancel；只取消未发送工作，不宣称回滚已发送写入。 |
| `frontend/features/environments/files/files-panel.tsx:79:41` | vm-runtime-unshipped | prepared.epoch 等于当前 epoch | role=status 呈现本地下载已准备及字节数。 |
| `frontend/features/environments/files/files-panel.tsx:79:58` | vm-runtime-unshipped | 同一 epoch 的 prepared URL 存在，用户点击链接 | 浏览器 download 保存 Blob；不等于已取得原生落盘验收。 |
| `frontend/features/environments/files/files-panel.tsx:80:21` | vm-runtime-unshipped | state.error 非空 | role=alert 显示映射错误或原错误码；不触发自动重试。 |
| `frontend/features/environments/files/files-panel.tsx:81:5` | vm-runtime-unshipped | 文件可用时常驻状态区域 | 显示 notice 或 Working 状态，无独立操作。 |
| `frontend/features/environments/files/files-panel.tsx:83:23` | vm-runtime-unshipped | 没有 openDownload 或原生保存能力 | 呈现流式保存不可用提示；不得伪装可流式落盘。 |
| `frontend/features/environments/files/files-panel.tsx:87:40` | vm-runtime-unshipped | entry.type 为 directory 且未 blocked | manager.load 子目录第 1 页。 |
| `frontend/features/environments/files/files-panel.tsx:88:37` | vm-runtime-unshipped | entry 为 file、未 blocked 且 bytes 不超过 1 MiB | manager.open 文本编辑；开始前清空另存名称。 |
| `frontend/features/environments/files/files-panel.tsx:88:198` | vm-runtime-unshipped | entry 为 file、未 blocked 且 bytes 不超过 20 MiB | manager.download 后 receive 创建 Blob URL 或调用注入回调。 |
| `frontend/features/environments/files/files-panel.tsx:88:359` | vm-runtime-unshipped | entry 为 file、未 blocked 且 openDownload 存在 | manager.downloadTo，显式调用保存选择器/注入 sink。 |
| `frontend/features/environments/files/files-panel.tsx:88:562` | vm-runtime-unshipped | entry 为非空 file、不超过 128 KiB、importer 存在且未 blocked | importer.select 冻结文本快照；尚未提交审核。 |
| `frontend/features/environments/files/files-panel.tsx:88:789` | vm-runtime-unshipped | entry 为非空 file、不超过 20 MiB、assetImporter 存在且未 blocked | assetImporter.select 冻结原文件；尚未上传。 |
| `frontend/features/environments/files/files-panel.tsx:89:58` | vm-runtime-unshipped | entry 为 file 或 directory 且未 blocked | openModal(rename,entry.name)，不立即重命名。 |
| `frontend/features/environments/files/files-panel.tsx:89:162` | vm-runtime-unshipped | entry 为 file 或 directory 且未 blocked | openModal(remove,entry.name)，不立即删除。 |
| `frontend/features/environments/files/files-panel.tsx:93:7` | vm-runtime-unshipped | 未 blocked 且 page 大于 1 | manager.load 同目录上一页。 |
| `frontend/features/environments/files/files-panel.tsx:95:7` | vm-runtime-unshipped | 未 blocked 且 page 小于 pages | manager.load 同目录下一页。 |
| `frontend/features/environments/files/files-panel.tsx:96:7` | vm-runtime-unshipped | 未 blocked，改变每页数量 | manager.load 当前目录第 1 页，页大小为 20/50/100。 |
| `frontend/features/environments/files/files-panel.tsx:96:224` | vm-runtime-unshipped | 分页 Select 按 20/50/100 循环选项 | options 依附父 Select；不是三个独立 API。 |
| `frontend/features/environments/files/files-panel.tsx:99:23` | vm-runtime-unshipped | assetImporter 存在且未 blocked | recover 回读当前成员未决资产，不自动重放上传。 |
| `frontend/features/environments/files/files-panel.tsx:102:7` | vm-runtime-unshipped | editor 存在且未 busy | manager.edit 更新编辑草稿；不直接写客体文件。 |
| `frontend/features/environments/files/files-panel.tsx:103:45` | vm-runtime-unshipped | editor 存在、dirty、无 conflict 且未 busy | manager.save，使用已有编辑版本校验。 |
| `frontend/features/environments/files/files-panel.tsx:104:9` | vm-runtime-unshipped | editor 存在且未 busy，明确点击丢弃重读 | manager.open 当前名称；这是显式丢弃草稿操作。 |
| `frontend/features/environments/files/files-panel.tsx:105:9` | vm-runtime-unshipped | editor 存在且未 busy，明确点击关闭 | manager.closeEditor 并清空副本名称。 |
| `frontend/features/environments/files/files-panel.tsx:106:43` | vm-runtime-unshipped | editor 存在且未 busy，改变副本名称 | setSaveName；仅更新本地表单状态。 |
| `frontend/features/environments/files/files-panel.tsx:107:7` | vm-runtime-unshipped | editor 存在、未 busy 且副本名非空 | manager.saveAs 后清空副本名；不覆盖原文件。 |
| `frontend/features/environments/files/files-panel.tsx:110:5` | vm-runtime-unshipped | modal.epoch 等于当前 epoch | Dialog 可见；onOpenChange 关闭时清空 modal/name。 |
| `frontend/features/environments/files/files-panel.tsx:112:141` | vm-runtime-unshipped | 确认框已打开且 action 非 remove | 名称输入更新本地 name，用于 mkdir/rename。 |
| `frontend/features/environments/files/files-panel.tsx:113:35` | vm-runtime-unshipped | 确认框打开、未 busy，非删除时名称非空 | confirm 再核对 epoch，关闭框后分派 mkdir/rename/remove。 |
| `frontend/features/environments/files/files-panel.tsx:113:178` | vm-runtime-unshipped | 确认框打开，用户点击取消 | 清空 modal/name；不调用文件写入。 |

## `frontend/features/environments/files/knowledge-import-panel.tsx`（14）

由 FilesPanel 在 importer 存在时挂载；正式 [source:frontend/features/environments/environment-files-surface.tsx] 已挂载 FilesPanel 并传入真实 submission.memberId，因此 importer 现会被创建；但本版本有意不发布 VM 引擎，FileView 在 state.available 为假时提前返回占位，共同条件非 idle 永远不可达。editable 仅 kind=preview，busy 为 reading/sending。下游 [source:frontend/features/environments/files/knowledge-import.ts] 使用 createSubmission，不自行发布；未知状态保留原载荷/键。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/features/environments/files/knowledge-import-panel.tsx:18:12` | vm-runtime-unshipped | kind 为 reading 或 sending | role=status 显示等待回执，不是提交成功。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:21:7` | vm-runtime-unshipped | state.preview 存在 | 可聚焦 pre 呈现冻结文件的字面内容，不随之后 VM 编辑改变。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:22:49` | vm-runtime-unshipped | preview 存在且 editable | 更新本地标题；unknown/sending 状态不可改写原意图。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:23:99` | vm-runtime-unshipped | preview 存在且 editable | 更新请求空间 ID；服务端决定是否允许。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:98` | vm-runtime-unshipped | preview 存在且 editable | 更新请求可见范围；不是已发布范围。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:215` | vm-runtime-unshipped | preview 内的范围 Select 可编辑 | shared 选项，继承父 Select 禁用状态。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:24:265` | vm-runtime-unshipped | preview 内的范围 Select 可编辑 | admin_only 选项，继承父 Select 禁用状态。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:25:49` | vm-runtime-unshipped | preview 存在且 editable | 用户确认内容/目标/无密钥，更新 ack。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:26:18` | vm-runtime-unshipped | editable 且 ack、标题和空间非空 | model.confirm 冻结 draft/target/key 并提交审核。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:28:19` | vm-runtime-unshipped | state.error 存在 | role=alert 显示未知/格式/校验错误，不自动重放。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:29:30` | vm-runtime-unshipped | kind 为 unknown，用户显式点击 | model.retry 使用原键和原载荷。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:30:32` | vm-runtime-unshipped | kind 为 submitted | role=status 显示 receipt.id 及查看审核状态提示；不是发布成功。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:31:58` | vm-runtime-unshipped | kind 为 unknown 或 submitted | href=/my-submissions 查询提交；不是精确操作编号查询的替代证明。 |
| `frontend/features/environments/files/knowledge-import-panel.tsx:32:37` | vm-runtime-unshipped | 非 busy 且 kind 非 unknown | model.close；unknown 状态不提供丢弃原意图的关闭按钮。 |

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

## `frontend/features/environments/storage/reconcile-checkpoints.ts`（0，2026-10-16 归属 workbench-environments）

该文件的候选现由 `workbench-environments` 能力根覆盖，2026-10-16 起不再计入未归属项。与 checkpoints 必须同 owner.scope；只基于服务端 tombstones 删除本地副本，不以分页缺项推断删除。

## `frontend/lib/workspace-location.ts`（1）

[source:frontend/components/history-navigation-notice.tsx] 通过 useSyncExternalStore 订阅 fault；这是跨路由外层消息机制，不是未接线的业务页。这里只登记未归属的 fault 监听，已归属的 location-change 不重复计算。

| 源码坐标 | 分类 | 触发/可见条件 | 行为与边界 |
| --- | --- | --- | --- |
| `frontend/lib/workspace-location.ts:63:3` | app-boundary | HistoryNavigationNotice 订阅，owner 发出 WORKSPACE_HISTORY_FAULT_EVENT | listener 更新 fault snapshot；取消订阅移除监听器。 |

## `frontend/pages/admin/create-role-page.tsx`（0，2026-10-16 归属 admin-role-new 能力根）

角色新建页，由 `frontend/app.tsx` 的 `AdminRoleNewRoute`（renderPage 的 admin-role-new 分支）渲染，可由 `frontend/pages/admin/roles-page.tsx` 的创建按钮（写 `/admin/roles/new`）到达。admin-role-new 现已在 `shared/workbench-maturity-capabilities.ts` 登记为能力根 `workbench-admin-role-new`（root symbol `AdminRoleNewRoute` 与 `AdminRoleCreatePage`），因此整页候选归入该路由、由以 root symbol 为起点的图覆盖，不再计入未归属项，2026-10-16 起从本记录移除。写入与读取都由共享控制器回调承担，页面自身不发请求。

## `frontend/pages/admin/role-detail-page.tsx`（0，2026-10-16 归属 admin-role-detail 能力根）

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
| `frontend/lib/use-toast.tsx:29:7` | app-boundary | ToastProvider 挂载（App 已认证分支） | 把通知栈固定渲染在右下角并 portal 到 body；`dismissLabel` 取本地化文案；不在无 Provider 时抛错。 |

## 验证范围与维护

- 新增两条文档契约：全部未归属 ID 必须恰好一次且有分类/条件/行为；记录的源码及 caller 证据必须与指纹一致。文档缺失时 8 条旧测试通过、2 条新测试失败；补齐后 `node --test scripts/frontend-operation-inventory.test.mjs` 10/10 通过。与 frontend-typecheck-contract、functional-checklist-audit、workbench-maturity-contract 联合运行 37/37 通过。这是文档/源码门禁，不是业务旅程回归。
- 指纹仅阻止已审查文件无声变化，不证明上述自然语言正确，也不能发现所有新消费路径。新增模块或调用者时仍应重新追溯静态/动态/类型引用，而不是只更新摘要值。
- 现有 AST 索引保持原样；`audit:frontend-operations` 仍要求它和当前源码一致。文档契约已并入原有 inventory 测试，不新增独立“完成率”。
- 本批无产品运行行为修改、无 push/部署/迁移、未读取密钥。没有增加备份/加密门槛，也没有更新独立预览。

### 审查文件及 caller 指纹

- `frontend/app.tsx`: `4d87d932b76bbc15e62b03537a6bd31f525f85a0d12343c26777ce4d79aaa7c4`
- `frontend/components/agent/answer-panel.tsx`: `63e54eadda8bf814a2302b8f4a2e99f39fb51a752e2d8678322dbf02e83fb807`
- `frontend/components/agents/citations.tsx`: `d9f0714f0ba41e3e2838d5d5004b7010c5d9a222a78b51a719f7a392873000a1`
- `frontend/components/history-navigation-notice.tsx`: `ceb53e78c925c68b07324cbf6cfe3015010d0483418f3e29507f678e232f1ad6`
- `frontend/components/motion/animated-toast-stack.tsx`: `bbfe97a6aa83e2acb5ea270fdf93bc3541764a7bbf80bc9e514e02566a6342e9`
- `frontend/components/motion/scroll-reveal.tsx`: `7853c47a57dc1ac4c9b41d744a2421c9473d0597555300e4a84d1e54407abc97`
- `frontend/components/motion/not-found/glitch.tsx`: `f63ed5577881f978c331ffd4552241abc90c71c14cd2bb5e2eafa2ed2556ef03`
- `frontend/components/motion/not-found/shared.tsx`: `f98d45223967f45277bf89b659b308e63c784397d4da9c2830565b9bcfc508da`
- `frontend/components/shell/context-rail.tsx`: `99da1cfcc11d4ff7e9adb18e38b2d9d286759e2ab3826315b3ba25d1a05ae5e0`
- `frontend/components/ui/card.tsx`: `6de765c3d44b584bccdd7619816718d0500fdcd20428fcaa98a74c31f0614923`
- `frontend/components/ui/tabs.tsx`: `11da49213cc5fb1635dbe9c3b35af924189133976ef38b54e437a858d196db6c`
- `frontend/features/environments/account-network-boundary.tsx`: `9835f50b5387cc2173e47a5dd4c4f85e0f64ec419d88926578b262bf971716b2`
- `frontend/features/environments/account-network-owner.mjs`: `06943c97426e9b8df13e267ff0f668bbc2e3c80445905d2ac3a76591593f735f`
- `frontend/features/environments/account-network.mjs`: `9e954525f93dc3b37b5d3d5b7755ad4c6c9d1ef56d6312337072299d9680501b`
- `frontend/features/environments/account-vm-runtime.mjs`: `5cfd8db87089437abd4e0c2edcc667b973ee4e57f9a0806886e7dcf326ff3c8d`
- `frontend/features/environments/authenticated-vm-runtime.ts`: `f81bc382e47709dd818a3209b5974c53f87487821bebea8ab3112c2f687c4bf2`
- `frontend/features/environments/connector-session.mjs`: `4bea623fd47128568d112e9cfa26ecdc90f114a6572e536b08d49f4537cc5269`
- `frontend/features/environments/environment-files-surface.tsx`: `f24df6c74cbe83f85a7536bd9a9d2015df21634c1ccbea0fb3643449a70025ed`
- `frontend/features/environments/environment-vm-composition.ts`: `b26be9b74c008c4bbddbc04e11c6bb0bf9853bc8aa9a0157a7175cd48abd47e7`
- `frontend/features/environments/environments-page.tsx`: `cd0e9ea56b8ae8fd0386d3a8811ed6d6e42ba1967ce4c2d9f563636170ff36d2`
- `frontend/features/environments/files/asset-import-panel.tsx`: `fa1b0d986a523eed4773a51f4ede44a882d1730ac17178273b7cefeb43b168c0`
- `frontend/features/environments/files/asset-import.ts`: `a825ff94a287acd8bc61cd517f27fe92d1ee32cd999948fb9e6f7d3def217338`
- `frontend/features/environments/files/file-manager.mjs`: `2721e8e7abecd3dda95765eecb055f7bf3272942f1933807a07bba83a7df5ea6`
- `frontend/features/environments/files/files-panel.tsx`: `e0a5072b60577a35ab42baea628be67e695fe65bd0def4bf363bd3bfc0668dd9`
- `frontend/features/environments/files/knowledge-import-panel.tsx`: `6722421e98b118c7462324b5536b913bc478025b7d119e35c56671cf94010aab`
- `frontend/features/environments/files/knowledge-import.ts`: `bce2bebe39eb4f17650b35b4a020f51f757ba5594b6e178a4a44f98b45028abd`
- `frontend/features/environments/files/stream-download.mjs`: `b491973525cb44aefce8a265490471e947931c2380b605d15b37226ca7295943`
- `frontend/features/environments/network-lifecycle.mjs`: `0e40ef5fc54547a8eb8769598176d1bdae454d99a4e62a143981b7f545d89e06`
- `frontend/features/environments/storage/checkpoints.mjs`: `0f3e6fdf0a47455748cc139f7b811ca87be00a144c8a3c25433c26647c085722`
- `frontend/lib/use-toast.tsx`: `7156c51d16a4247a000682d67ce6c2784b77f09b35c374ca1abff8c6a1f94a87`
- `frontend/lib/workspace-location.ts`: `b77ff862964645fe25610e09f79b8409740f72a85a5685d934adc7e0ff60b92d`
- `frontend/main.tsx`: `9ba6f443d0f7da037015cb7f1d1b3444777989588c66429d3630a0c5fb500391`
- `frontend/pages/workbench-landing/public-workbench-page.tsx`: `797896e7a11327b89eebdf03c802c55872bf2017517ebd94410f714793974866`
- `frontend/pages/workbench-landing/workbench-scene-runtime.ts`: `19b47d756dd823d4934eacd11d364bb3602b7f8fa09e74e4e5db588affdd761b`
- `frontend/pages/workbench-landing/workbench-scene.tsx`: `bd5def5c4ef683d0ae1422e26180a8feeca67de86ef4ccbea79b3605cb3fef5a`
- `frontend/public/sw.js`: `703801312e5cccba0cf162837b97878185fe03e18cdc2182c2fc4c5215923bad`
- `tools/browser-vm/checkpoint-recovery-browser.mjs`: `06a498590a0c6e00c9cf5c91dff81de7a6aa3b01c4c9768aa718ebc0de3d9efe`
- `tools/browser-vm/runtime-owner-browser.mjs`: `e5973069f711204d6ad79f011be6772e9243d403b6bb1ebd515ff361537c4c90`
- `frontend/components/motion/center-morph-modal.tsx`: `d988640275b067c94db3d2196930398078efc2b6fb23ee850d9364f467227346`


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
