# Shared navigation leave protection implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Work locally in the existing approved branch; no delegation requested.

**Goal:** Protect unsaved task editors and pending writes from explicit navigation and history traversal without state drift.

**Architecture:** A framework-independent per-window coordinator owns a single navigation intent and registered leave guards. React presents decisions; route side effects run only inside the admitted commit. History traversal is a separate adapter to the same admission boundary, not an independent dirty flag.

**Tech Stack:** TypeScript, React, History API, Vitest, happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-02-navigation-leave-protection-design.md`

## Global Constraints

- Preserve 29 in scope / 5 closed / 24 remaining until canonical evidence supports closing a parent.
- No push, deployment, remote migration, secret-file access, paid services or browser security bypass.
- Use rtk for shell commands and exact-path commits. No new dependencies required.
- A local subtask is not whole-route/native-browser acceptance.

### Task 1: Admission coordinator

Files: create `frontend/lib/workspace-navigation-gate.ts`, test `test/unit/frontend-workspace-navigation-gate.test.ts`.

Interface: createWorkspaceNavigationGate() returns register(guard), request(commit), invalidate(). Guards provide a fresh allow/block/confirm result; confirm includes a stable draft version, prompt(decision), dismiss(). Decision accept/cancel is one-shot. Request returns committed/deferred/blocked.

- [x] Write failing tests for clean navigation, dirty decisions, block priority, multiple guards, stale versions/registrations, duplicate callbacks/requests, reentrancy and error recovery.
- [x] Run exact Vitest target; confirm behavioral RED (not infrastructure failure).
- [x] Implement pure coordinator with synchronous reservation, final revalidation and identity-bound cleanup.
- [x] Run GREEN; review lifecycle and exception paths.
- [x] Commit tested coordinator with design/plan and accurate evidence; do not claim runtime protection yet.

### Task 2: Atomic route commits

Files: modify `frontend/lib/workspace-location.ts`, `frontend/app.tsx` and audited writer consumers; add `test/unit/frontend-workspace-location.test.tsx`.

Interface: writeWorkspaceHistory retains existing callers but accepts admitted side-effect callbacks. registerWorkspaceLeaveGuard is per-window. Security session-end invalidates pending decisions explicitly.

- [x] Write RED tests proving canceled navigation leaves URL/events/query side effects untouched.
- [x] Bind coordinator to window; migrate all writer call sites whose query refs/invalidation/state updates occur outside the admitted commit.
- [x] Test canonical replace, same-page pagination and successful logout separately; regression-test affected routes.
- [x] Commit verified atomic routing changes with coverage inventory.

### Task 3: Task editor bridge

Files: modify `frontend/pages/tasks/task-editor.tsx`, `frontend/lib/i18n.ts`; test real TasksRoute and InboxRoute task opening.

- [x] Write RED for dirty navigation, default keep, discard once, pending/unknown rejection, same-event write/leave, old confirmation and unmount.
- [x] Register synchronous draft/write-lock reads; reuse ConfirmAction and existing close protection; invalidate on denied access and cleanup.
- [x] Run both actual route entry tests and prior 31 task-editor tests, task APIs and dirty tests; preserve partial-form baselines.
- [x] Commit verified explicit-navigation bridge. Keep history traversal open until Task 4.

### Task 4: History adapter and full local acceptance

Files: shared location/history adapter, its tests, App subscription consumers where necessary, native evidence report.

- [x] Verify official browser history/navigation semantics and supported runtime capabilities; record compatibility evidence before choosing adapter details.
- [ ] Write RED covering accepted-position subscription, back/forward cancel/confirm, repeated traversal, unknown entries, reload/session boundaries and event deduplication.
- [x] Implement traversal admission using verified entry identity/position; never infer unknown deltas, never silently accept dirty traversal.
- [x] Re-run all navigation, shell, task/inbox/editor, notifications/messages, query pagination tests; typecheck, build:ui, test:i18n, verify:i18n and checklist audit.
- [ ] Obtain actual native history/refresh/keyboard evidence or leave that gate explicitly open; update product checklist only to proven scope.
  - [x] Document-boundary slice: preserve reload history; verify dirty/pending/unknown native beforeunload cancellation; test fallback epoch restart and pending-decision repeated Back.
  - [ ] Remaining native gates: keyboard/touch, full browser version and forced-leave/identity journeys.
- [ ] Commit evidence and functional changes; no release operations.

## Execution evidence

2026-10-02 Task 1: behavior RED21/24 failed; GREEN24/24; combined3files87/87, strict core types, project typecheck, build:ui and checklist tests9/9 passed. Runtime wiring and native navigation remain unimplemented; see `docs/product/2026-10-02-navigation-gate-core-evidence.md`.

Task 2续行（基线4478d21）：共享window准入和25处导航副作用迁移；原40个writer变为39个受保护writer+1个确认会话结束入口。真实TasksRoute新增2项先失败（被拦URL但仍多发读取）后通过；20文件437/437，追加异常/重入后共享位置15/15，类型/UI构建/清单测试通过。DOM测试使用.tsx避免被Worker-only tsconfig纳入，另独立严格DOM类型检查；见 `docs/product/navigation-atomic-route-commits-evidence.md`。尚无TaskEditor注册或history拦截，不关闭A05。

Task 3（基线9d126ca）：编辑器双入口与真实App侧栏接入同步draft/intent保护，RED6失败/31通过→GREEN37/37；扩展后22文件490/490、项目与严格DOM类型/UI构建/双语/清单通过。复用现有i18n文案，未改i18n.ts。见 `docs/product/navigation-task-editor-bridge-evidence.md`；Task 4及父项仍开放。

Task 3后续修正：同事件输入→保存的五类写入口统一读取同步draft，RED4行为失败→编辑器54/54，完整22文件495/495；类型/构建/双语/清单通过。详见桥接证据附录，父项仍开放。

Task 4能力核验：官方WHATWG正文核验成功；内置浏览器原生探针复现cancelable=false时precommitHandler抛错并移动URL，验证traverseTo真实key恢复原条目，见 `docs/product/navigation-history-capability-evidence.md`。仅能力子项完成；运行时适配/未知边界/完整版本/刷新与集成验收仍开放。

Task 4核心续行（基线57bb774）：两阶段prepare/permit与独立历史状态机已通过RED→GREEN；最终23文件530/530，类型/UI构建/双语/清单验证通过。新增commit卸载与排队重放取消竞态回归，详见 `docs/product/navigation-history-traversal-core-evidence.md`。这只是运行时接入的前置子项；原始popstate订阅未改，Task 4的完整RED覆盖、浏览器适配、原生验收与父项均不勾选。下一步直接执行实际端口及获准位置订阅接入，不重复设计批准。

Task 4运行时续行（基线20b4038）：真实浏览器端口、accepted位置订阅、App查询/hash读取、恢复故障UI、注销迟到命令隔离已接入。行为RED及补充边界后最终23文件545/545、类型/UI/双语门禁通过；内置浏览器真实App夹具验证Back取消/确认、Forward、pending/unknown草稿保留。见 `docs/product/navigation-history-runtime-evidence.md`。完整RED边界与原生门禁仍不勾选：刷新后epoch、跨document、键盘/触控及完整版本未验收。提交步骤待Task 4全部边界完结；本轮允许原子提交运行时与证据，不代表整个Task 4结束。

Task 4 document边界续行（基线1006e58）：夹具无条件重种历史RED4失败→5/5；新增fallback新epoch回归，位置/核心/gate/编辑器/Tasks五文件179/179。内置浏览器真实刷新保留旧历史，六组原生beforeunload取消事件及草稿/锁/写计数保持，待决重复Back令旧决定失效、确认后仅发布一次。见 `docs/product/navigation-history-document-evidence.md`。键盘动作未导致遍历、完整版本工具不支持；未强制离开或冒充通过。父项/完整Task 4仍开放，允许提交已验证切片继续其余任务。

Document切片提交前最终门禁：23文件547/547、项目及独立DOM类型、build:ui/VM隔离、双语13/13与静态校验、清单9/9通过；29/5/24计数不变。本地服务器及临时tab已清理，无发布操作。

Task 4 注销/合成身份续行（基线439f68e）：真实App双击注销RED 2 POST→同步ref防重，失败才释放以显式重试；原生匿名旧历史不恢复私有UI，B新document使用B合成数据。夹具根back_forward/reload/unknown不重种历史RED3失败→8/8。23文件549/549、项目类型/UI/双语通过；额外严格App类型检查35条与HEAD基线一致，不能记通过。清单与夹具Node17/17、29/5/24不变。见 `docs/product/navigation-logout-identity-evidence.md`。合成身份不是服务端双账号验收；父项完整门禁保持开放，下一允许逐页审计，无需重新批准。

Task 4逐页续行（基线aaa0212）：五个创建入口（四组件）接入useCreateDraft，确认仅在获准导航提交时清草稿，未决创建/读回禁止普通离开；同事件编辑→提交取最新ref。行为RED30失败→30通过→扩充60项，最终41文件1053/1053、受影响严格DOM类型/项目类型/UI/双语通过。见 `docs/product/navigation-create-form-protection-evidence.md`。测试的强制组件重挂载与真实导航分开，不算原生刷新/身份验收。A05/R2-008及Task 4整体不勾选；下一允许核查已有内容编辑和其他页面。

Task 4逐页时间线编辑续行（基线b66f757）：已有内容编辑支持dirty取消/Escape/离页确认，最新同步草稿与提交锁，路由级未决恢复标记保护错误卸载边界。12项行为RED→GREEN，补充4项后最终41文件1069/1069及受影响严格DOM类型/项目类型/UI/双语/清单通过。见`docs/product/navigation-timeline-editor-protection-evidence.md`。A05/R2-008与Task 4整体不勾选；29/5/24不变，下一允许核查项目关联及其他逐页边界。无原生验收、push、发布或远端迁移。

Task 4逐页项目关联续行（基线5776cf0）：项目目标/任务关联/解除有精确影响确认、默认取消及同步单次消费；旧确认/取消/行回调隔离，ProjectsRoute未决标记守卫覆盖编辑器关闭/错误卸载。8项行为RED→GREEN，再补4项后最终43文件1110/1110；类型/UI/双语/清单通过。见`docs/product/navigation-project-relations-protection-evidence.md`。A05/R2-008与Task 4整体不勾选，29/5/24不变；下一允许核查目标任务关联和其余逐页边界，无原生验收、push、发布或远端迁移。


## 2026-10-02 目标任务关联保护续行

基线 `7f88cd4`：目标任务关联/解除精确确认、同步写锁、旧决定与旧行隔离，GoalsRoute 持有跨编辑器关闭的未决写入导航/beforeunload 保护。9项行为 RED→GREEN；44文件1135/1135、独立严格 DOM 类型、项目类型、UI构建与双语通过。证据：`docs/product/navigation-goal-tasks-protection-evidence.md`。A05/R2-008 与 Task 4 整体仍开放，29/5/24不变；下一允许核查收件箱/日程/专注及其余逐页未决写入边界。强制组件重挂载不算原生验收；未 push、发布或远端迁移。


## 2026-10-02 共享未决写入保护续行

基线 `126fd7a`：守卫归属 usePlanningWriteRecovery，补齐收件箱状态/转任务与日程取消，删除目标/项目/时间线重复注册。9项行为RED→GREEN，最终44文件1144/1144、独立严格DOM类型、项目类型、UI/VM隔离、双语通过；详见 `docs/product/navigation-shared-write-protection-evidence.md`。29/5/24不变，A05/R2-008与Task 4整体开放。下一允许本地推进FocusRoute独立创建/转换恢复记录的离页准入；已确认的运行会话不应被误锁。未push/发布/远端迁移，强制组件重挂载不是原生验收。


## 2026-10-02 专注未决写入离页保护续行

基线 `507e594`：FocusRoute 当前成员的开始/转换恢复记录及同步引用持有导航/beforeunload锁，回执和当前状态验证后释放；确认的运行会话/纯GET不误锁。正式导航6项行为RED→GREEN；专注156/156、扩大50文件1246/1246、项目类型/UI/VM隔离/双语通过，清单29/5/24不变。详见 `docs/product/navigation-focus-write-protection-evidence.md`。A05/R2-008与Task 4整体开放；下一允许补齐FocusPage未提交标题/任务选择草稿离页确认，其余逐页与原生/身份门禁仍须实证。未push/发布/远程迁移，强制组件重挂载不是原生验收。


## 2026-10-02 专注草稿离页保护续行

基线 `fff9a75`：FocusPage 标题/任务选择纳入 useCreateDraft，取消与最终准入拒绝保留草稿；同事件最新标题提交、确认/启动后迟到编辑隔离，预检转写入后旧确认不能放行。4项RED→GREEN，共8项新增测试；定向8文件224/224、扩大50文件1254/1254、严格组件DOM类型/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-focus-draft-protection-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放，下一允许继续其他页面草稿/未决写入核查，无外部阻塞。合成DOM不是原生验收；未push/发布/远程迁移。


## 2026-10-02 问答未决请求离页保护续行

基线 `14fd10f`：AgentConversationRoute 同步pending/内存意图/当前成员恢复记录接导航与beforeunload守卫；未知或损坏记录不误放行，正常回执清理或显式停止/放弃才释放，只读恢复不误锁。7项行为RED→GREEN，共12项新增，定向6文件135/135、扩大50文件1266/1266、项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-write-protection-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许继续未提交问题/来源草稿与反馈写入核查，无外部阻塞；未push/发布/远程迁移。不是原生或真实身份验收。


## 2026-10-02 未提交问题离页保护续行

基线 `e278d78`：问答问题文本接共享草稿保护，同事件最新值提交，取消/最终准入拒绝保留输入；已提交显示值独立基线，重试旧问题不覆盖新草稿，存储错误页保留确认。10项行为RED→GREEN；定向2文件98/98、扩大50文件1276/1276、严格组件DOM类型/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-question-draft-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许来源选择草稿与反馈写入核查，无外部阻塞。未push/发布/远程迁移，不是原生或真实身份验收。


## 2026-10-02 来源选择草稿离页保护续行

基线 `d6811f8`：来源草稿归属路由，普通离页确认、取消/拒绝保留；应用精确快照只在真实提交时更新基线，单次收尾释放预约，仍尊重其他守卫；补齐同事件最新范围、交叉确认锁、错误卸载及旧成员回调隔离。两轮行为RED（9项、3项），最终新增17项，定向8文件234/234、扩大50文件1293/1293、受影响严格DOM/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-source-draft-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许反馈未决写入与剩余逐页核查，无外部阻塞；未push/发布/远程迁移，不是原生/身份验收。


## 2026-10-02 Agent反馈未决写入保护续行

基线 `d2f4520`：反馈同步锁归属Agent路由，发送中/未知阻止普通离页及问题/来源替换，严格回执才释放；保留原反馈显式重试，确认期间、保存/卸载后和同事件来源重启后的旧回调均隔离。两轮行为RED（12项、1项），最终新增16项，定向8文件250/250、扩大50文件1309/1309、受影响组件严格DOM/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-feedback-protection-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。未新增反馈刷新恢复日志，未冒充原生/真实身份或生产验收；下一允许继续其余逐页及剩余门禁，无本地外部阻塞。未push/发布/远程迁移。


## 2026-10-02 知识投稿离页保护续行

基线 `ed897a3`：成员投稿草稿接共享离页确认，pending/未知/损坏意图保留锁；字段增量合并、确认期间写入拒绝、原身份重试及旧成员回调隔离，成功清理记录才解锁，实际App导航同步清理已丢弃草稿。七轮单项行为RED→GREEN，共新增14项；投稿32/32、扩大58文件1408/1408、项目类型/UI/VM隔离/双语/清单通过。附加严格DOM检查仍有既有资产组件收窄错误，全App34条旧诊断无新增，未声称严格检查全绿。见 `docs/product/navigation-submission-protection-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许搜索页已保存视图草稿与写入生命周期核查，无本地外部阻塞；未push/发布/远程迁移，不是原生/真实身份验收。


## 2026-10-02 搜索已保存视图离页保护续行

基线 `c7890bd`：修复 POST/PATCH 误传 filters.v 的真实服务契约错误；名称草稿、同步写入锁、严格回执、精确删除确认及成员隔离接入共享保护。未知创建仅分页只读核对目标当前状态，不重发无幂等键的 POST；删除仅接受明确目标不存在证明。保存/应用补齐空间、集合、标签和模式。20项新增，定向4文件34/34、扩大61文件1434/1434、项目类型/受影响组件严格DOM/UI/VM隔离/双语通过。见 `docs/product/navigation-saved-view-protection-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许搜索词输入草稿及剩余逐页门禁，无本地外部阻塞。未新增跨刷新意图日志或可见列表分页；未push/发布/远程迁移，不是原生/真实身份验收。


## 2026-10-02 搜索词草稿离页保护续行

基线 `b371c23`：搜索输入不再被旧结果query覆盖，提交取同步最新值，通过精确草稿预约和其他守卫共同准入；取消/最终拒绝保留，实际提交才更新基线。同目标重复提交不增加历史条目；与已保存视图写入/决策互斥，旧成员回调隔离。初始8项RED、追加重复历史1项RED，最终新增14项；定向4文件37/37、扩大63文件1450/1450、项目类型/受影响组件严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断、身份无新增，不记全绿。见 `docs/product/navigation-search-query-draft-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许知识阅读页私人笔记的草稿/加载/保存/共享核查，无本地外部阻塞；未push/发布/远程迁移，不是原生/真实身份验收。


## 2026-10-02 知识阅读页笔记草稿与保存保护续行

基线 `b5cb58b`：成员/知识项生命周期隔离、权限读取前禁写、私人标题/正文 dirty 离页保护、同步保存意图及严格回执、unknown 仅只读核对，拒绝草稿缓存按成员隔离；成功缓存清理失败不解锁。初始12项行为RED、缓存2项追加RED后修复，新增22项通过；定向4文件47/47、扩大67文件1497/1497、项目类型/新hook严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断、身份无新增，不记全绿。见 `docs/product/navigation-reader-note-protection-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许笔记共享/撤销的精确确认、同步锁与未知结果核对；跨刷新未知意图恢复、存储不可删除时的丢弃持久性及原生/双身份验收仍待完成。无本地外部阻塞；未push/发布/远程迁移，不是生产验收。


## 2026-10-02 知识阅读页笔记共享与撤销保护续行

基线 `800f139`：共享/撤销精确影响确认、同步去重、与笔记草稿/保存互斥、严格状态码和内容回执、unknown 仅权限及完整列表只读核对，旧成员/旧行回调隔离。初始10项行为RED后修复，新增26项；定向3文件55/55、扩大68文件1523/1523、项目类型/新hook严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断，身份无新增，不记全绿。见 `docs/product/navigation-reader-note-sharing-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许私人笔记缓存丢弃失败及跨刷新未决意图恢复；原生/双身份验收仍待完成。无本地外部阻塞；未push/发布/远程迁移，不是生产验收。


## 2026-10-02 私人笔记缓存丢弃失败保护续行

基线 `e506441`：缓存清理由已提交事件移至最终导航准入；删除及读回失败阻止离页并保留内存草稿/提示，历史permit仅实际重放到达才清理，失败恢复原条目。取消、其他守卫拒绝及过期permit不提前删缓存。4项行为RED后修复，共新增12项；定向5文件126/126、扩大68文件1535/1535、项目类型/受影响hook严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断、身份无新增，不记全绿。见 `docs/product/navigation-reader-note-cache-discard-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008及Task 4整体开放。下一允许成员隔离的笔记保存/共享未决意图持久恢复；原生/双身份验收仍待完成。无本地外部阻塞；未push/发布/远程迁移。


## 2026-10-02 私人笔记未决意图恢复续行

基线 `0f3857e`：保存/共享/撤销共用 tab/member/item 隔离的未决意图日志，发送前持久化及读回；重挂载先验权限、恢复草稿/unknown且不重发，终态持久化后清理，存储异常只读恢复与旧回调隔离。追加修复恢复权限读取期间的离页警告和缓存读取失败后的旧草稿复活。三轮行为RED（7/2/2）后新增41项；最终扩大69文件1576/1576、项目类型/受影响严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断，不记全绿。见 `docs/product/navigation-reader-note-intent-recovery-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许管理员角色页草稿/未决写入接共享离页保护，无本地外部阻塞；原生/双身份验收仍待完成。未push/发布/远程迁移；tab存储与DOM重挂载证据不等同原生刷新、备份或跨标签页幂等。


## 2026-10-02 管理员角色页共享离页保护续行

基线 `f90ebf4`：权限、成员输入及角色创建字段接入共享草稿守卫；取消/最终拒绝不丢输入，实际离页提交才重置。未决写入锁由路由持有，编辑器因403等拒绝卸载也不能绕过；只读核对成功后按现有恢复协议解锁，不自动重发。角色创建同步取值去重、迟到回执不清新输入，列表刷新不覆盖独立权限草稿。首轮12项行为RED、追加刷新1项RED后修复，新增16项，最终扩大74文件1656/1656；项目类型、角色页严格DOM、UI/VM隔离、双语通过。全App严格DOM诊断34降至32（修正角色页2条类型收窄，无新增），仍不记全绿。见 `docs/product/navigation-admin-role-leave-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许管理员菜单页草稿/未决写入保护，无本地外部阻塞；管理员写入跨刷新意图恢复及原生/双身份验收仍待完成。未push/发布/远程迁移。


## 2026-10-02 管理员菜单页共享离页保护续行

基线 `6cbc633`：创建/编辑/排序草稿接共享离页确认，取消或最终拒绝保留输入；动作确认与离页互斥。路由持有pending/unknown锁，403卸载编辑器也无法绕过，仅显式只读恢复，不自动重发。排序恢复区分已提交尝试与独立草稿，保留既有冻结CAS及确认协议。首轮13项行为RED后修复，并修正一项已有排序恢复回归，新增15项；最终扩大79文件1774/1774、项目类型、菜单组件严格DOM、UI/VM隔离与双语通过。全App严格DOM32降至31条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-menu-leave-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许管理员空间页共享离页保护，无阻止本地工作的外部条件；跨刷新管理员意图恢复及原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员空间与集合页共享离页保护续行

基线 `71728f8`：新建/编辑空间与集合四类草稿接共享离页守卫，取消/最终拒绝保留输入，动作确认与离页决策互斥。路由持有创建/修改未决写入锁，403卸载编辑器仍阻止离页，显式只读恢复且不重发。额外区分只读失败与未知写入，避免无写入用户被困；保留冻结版本、集合请求键和既有恢复协议。首轮19项行为RED、追加只读边界3项RED后修复，共新增24项；两文件98/98、扩大82文件1877/1877、项目类型、空间组件严格DOM、UI/VM隔离和双语通过。全App严格DOM仍31条旧诊断、身份无新增，不记全绿。见 `docs/product/navigation-admin-space-leave-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许管理员成员状态操作确认及未决写入共享离页核查，无本地外部阻塞；管理员跨刷新意图恢复与原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员成员状态共享离页保护续行

基线 `8251d8b`：成员启用/停用确认接共享离页守卫，同事件点击与离页互斥；路由持有实际PATCH/未知结果锁，401/403隐藏列表不再清掉并发写入记录。区分有效PATCH回执与行操作回读锁，已确认写入不会因筛选缺行被困；未知结果只允许本路由只读筛选/分页恢复，不重发，不绕过其他守卫，缺行或失败不解锁。首轮10项行为RED后修复，共新增15项；两目标67/67，扩大84文件1928/1928，项目类型、成员组件严格DOM、UI/VM隔离、双语及清单通过。全App严格DOM仍31条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-member-leave-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与导航Task 4整体开放。下一允许管理员去重队列动作确认及未知决定共享离页核查，本地无外部阻塞；管理员跨刷新意图恢复及原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员去重队列共享离页与单项只读恢复

基线 `282628f`：去重决定确认接共享离页守卫，路由持有实际POST及未知结果锁，401/403隐藏列表不清掉未结束写入。新增受现有管理员权限保护的单项只读GET，核对pending页缺失项的当前状态及canonical三元组，不从缺行推断成功、不重发决定；有效POST回执与行按钮刷新锁分离。语言切换回读拒绝时保留实际POST，迟到回执不能覆盖新作用域。四轮行为RED（3/3/5/1）后新增33项；最终扩大89文件2094/2094，项目类型、去重组件严格DOM、UI/VM隔离、双语与清单通过。修正去重页既有类型收窄，全App严格DOM31降至28条旧诊断，无新增，不记全绿。见 `docs/product/navigation-admin-duplicate-leave-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与导航Task 4整体开放。下一允许管理员审核队列确认、草稿及未决决定共享离页核查，本地无外部阻塞；管理员跨刷新意图恢复及原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员审核队列共享离页与未知结果保护

基线 `bcdb716`：共享审核控件的决定/丢弃弹窗与离页互斥，拒绝/退回备注接共享草稿确认；同一对象回读保留未提交备注，但旧决定确认失效。队列路由持有实际预览/POST与未知意图锁，语言刷新及401/403清屏不清掉在途操作。新增未知结果只读核对入口，缺行读受权详情；终态才解除未知锁，pending、失败或不匹配均保留；保留既有显式原样重试，不自动重发。匹配回执与读取失败分离，空页修正在提交后的React渲染完成后进行，强制卸载的迟到操作不污染重挂载。首轮14项行为RED、4项原有安全对照通过；共新增22项，最终扩大97文件2206/2206。项目类型、审核控件/队列/详情组件严格DOM、UI/VM静态隔离、双语通过；全App严格DOM仍28条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-review-queue-leave-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008及导航Task 4整体开放。下一允许审核详情路由级未决操作保护，并核对队列回读移除行时的独立未提交草稿；当前无阻止本地工作的外部条件。跨刷新意图恢复、原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员审核详情路由级未决操作保护

基线 `5256748`：详情路由而非可卸载编辑器持有实际POST/未知意图离页锁；401/403清屏、404及读取失败不误清未决操作。读取依赖与写入挂载生命周期分离，更换语言对象不遗忘在途POST；强制身份卸载仍使迟到回执失效。未知结果允许受权单项GET核对，精确ID终态才解除；pending、缺失、拒绝及畸形均保留，404未知页保留读取重试入口。保留冻结原样显式重试，不自动重发；同对象背景刷新保留备注。首轮8失败/25通过后修复，新增12项；目标3文件69/69、扩大97文件2218/2218。项目类型、详情路由/详情页严格DOM、UI/VM静态隔离和双语通过；全App附加严格DOM仍28条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-review-detail-leave-evidence.md`。主清单29范围内/5完成/24未关闭，A05/R2-008及导航Task 4整体开放。下一允许审核队列回读移除行的独立未提交草稿保护及详情错误清屏的独立草稿生命周期核对。本地无外部阻塞；跨刷新意图恢复、原生/真实身份验收等仍开放。未push/发布/远程迁移。


## 2026-10-02 审核独立备注草稿生命周期保护

基线 `c1b65e2`：备注所有者提升至审核路由，会话内按对象保存非默认输入；队列缺行/权限清屏及详情403/404/500不丢草稿，重新授权读取原对象后恢复。通用离页确认不泄露隐藏备注，取消/最终准入拒绝保留，真正导航才放弃；未知提交不可借此解锁。自己的匹配回执/未知操作终态核对仅清理对应草稿，其他对象或他人终态引起的独立备注不静默清空。7项行为RED后修复，共新增13项，扩大97文件2231/2231。项目类型、草稿/审核组件严格DOM、UI/VM静态隔离及双语通过；全App仍28条既有诊断，不记全绿。见 `docs/product/navigation-review-draft-lifetime-evidence.md`。29范围内/5关闭/24开放；A05/R2-008及导航Task 4保持开放。下一允许审核评论面板独立草稿、同步提交去重、迟到回执与未知写入保护；无本地外部阻塞。跨刷新持久恢复与原生/真实身份等仍开放。未push/部署/远程迁移。


## 2026-10-02 审核评论草稿与未决写入归属

基线 `acd295a`：审核评论草稿/实际POST所有者提升至详情路由，错误和权限清屏不卸载未决保护；同事件同步去重、冻结输入、精确目标/正文/非编辑回执才释放，旧对象写入及旧GET迟到无效。普通dirty离页取消/最终拒绝保留，真正导航才清除；评论读取失败隐藏列表/正文，同对象重新获准后恢复。服务端当前每次POST生成新ID、无幂等键，列表最多100条，不能用相同正文或空列表推断某次POST结果。因此网络/通用HTTP错误及畸形回执均保留未知锁，不自动或手动重发；明确pre-write业务拒绝可纠正重提。首轮16行为失败/4通过后修复，另4项畸形列表RED→GREEN；新增32项，扩大100文件2267/2267。项目类型、评论所有者/面板/详情路由严格DOM、UI/VM静态隔离与双语通过；全App严格DOM仍28条既有诊断无新增，不记全绿。见 `docs/product/navigation-review-comment-owner-evidence.md`。29范围内/5关闭/24开放，A05/R2-008及导航Task 4保持开放。下一允许本地实现评论幂等与精确未知结果恢复协议、补服务与Worker证据；不把未知锁当成完整恢复功能。跨刷新持久恢复、原生/真实身份门禁仍开放。无本地外部阻塞；未push/部署/远程迁移。


## 2026-10-02 审核评论唯一操作编号与精确恢复

基线 `3c64a8e`，用户确认“唯一操作编号＋同编号安全重试＋精确查询结果”。新增专用PUT/GET操作协议；会话成员/目标/UUID派生稳定主键，D1原子冲突保留原回执，同编号改正文409，独立精确查询不受100条列表限制，编辑不改变原回执。前端冻结编号和正文，未知结果允许显式同编号重试/精确核对；空结果、畸形回执和重试拒绝均不误清原未知操作，不回退旧POST或自动重发。服务/Worker首轮3项RED、客户端14项RED、所有者首轮18失败后修复；最终定向5文件119/119、扩大101文件2291/2291。项目类型、组件严格DOM、UI/VM隔离及双语通过，清单审计9/9。全App严格DOM仍28条既有诊断，与上轮日志一致；成熟度契约仍13/14（environments缺记录），不记全绿。证据见 `docs/product/navigation-review-comment-operation-evidence.md`。主清单29范围内/5关闭/24开放，A05/R2-008及导航Task 4不整体关闭。操作编号/正文仍仅内存保存，跨刷新持久恢复、原生/真实身份验收等仍开放。无阻止后续本地工作的外部条件；下一步允许继续导航保护剩余子项，但不能将会话内恢复宣称为跨刷新恢复。无push/部署/远程迁移，未扩展备份或加密范围。


### 2026-10-02：环境入口成熟度漏项修复（本地）

基线 `b4592a0`。补登记可见 `/environments` 的能力、领域来源、操作根与交付账本，保持 partial，并将真实 VM、离页/跨刷新恢复及发布验收缺口归属现有 R8-009。成熟度契约由13/14修复为15/15，页面矩阵151/151、环境页/实际本地Worker-D1专用16/16、项目类型与差异检查通过。通知摘要公共夹具补齐，原有权限和重试断言未放宽。矩阵102（54 P0/47 P1/1 P2），领域审计动态请求封装仍fail-closed失败，未伪造快照或宣称全绿。详见 `docs/product/2026-10-02-environments-maturity-inventory-evidence.md`。主功能29范围内/5关闭/24开放不变；D07、A05/R2-008及导航Task 4仍开放。下一允许本地修复审计封装识别、随后讨论页未知写/离页保护，无外部阻塞。未push/部署/远程迁移。


### 唯一操作编号与精确查询：复验和领域审计对账（本地）

基线 `a068950`。审核评论协议定向119/119复验通过；请求扫描新增有限条件方法/静态展开解析，未知调用仍fail-closed。环境请求四个显式传输点保留冻结意图与取消语义，专用18/18通过。领域30/30及源码快照check、成熟度15/15、项目类型/UI与静态VM入口隔离通过。领域能力34，矩阵105（34 manifest/71 domain，54 P0/50 P1/1 P2）；环境3条漏登记写操作归现有R8-005，评论旧POST源更正为PUT requests，无新增功能父项。详见 `docs/product/navigation-operation-audit-evidence.md`。主清单原30/范围内29/关闭5/开放24，A05、D07、R2-008及导航Task 4仍开放；内存编号不等于跨刷新恢复。下一允许继续讨论页未知写/离页保护，无本地外部阻塞。未push、部署或远程迁移。


### 讨论页未决操作所有权与离页保护（本地）

基线 `d408419`。讨论发送冻结唯一编号、正文、回复及提及对象，未知结果仅允许显式同编号重试；同步去重、陈旧处理器防护及既定草稿离页门禁生效。读取失败/权限撤销隐藏私人内容但不遗忘未决操作，恢复授权后仍核对原操作；跨epoch迟到回执不能清除它。创建与重放均严格校验精确回执，成功释放锁后才更新分页。首次路由11项RED、精确重放1项RED后修复；定向5文件65/65，既有审核评论精确PUT/GET协议复验119/119。扩大179文件3180项为3168通过/12失败；独立原始HEAD四文件复现同样12项，未隐藏、未跳过，也不记全绿。项目类型、组件strict DOM、UI/静态VM隔离、双语、成熟度15/15及领域快照通过。详见 `docs/product/navigation-discussion-operation-owner-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task 4与D07继续开放。讨论目前只有精确回执校验，尚无独立精确查询端点；编号仅内存保存，不代表跨刷新恢复或真实浏览器/VM验收。下一允许核对四文件既有回归失败，再补讨论精确查询与剩余导航子项，无本地外部阻塞。未push、部署或远程迁移。


### 导航扩大回归12项对账与无草稿离页修复（本地）

基线 `6a25d88`。修复阅读器加载/错误占位无缓存草稿时因尚无笔记所有者而错误阻止离页；未知写入、恢复与其他动作锁仍优先拦截。引用夹具补成员和正式导航，项目/权限夹具补独立壳层摘要及状态写确认，最近访问保持畸形响应整体拒绝。生产修复前引用/草稿44项42通过2失败，最终定向95/95；扩大179文件3185/3185通过，原12项失败已消除，增加5项回归而非删除/跳过。项目类型、hook严格DOM、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。证据见 `docs/product/navigation-regression-reconciliation-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除，A05/R2-008、导航Task 4及D07仍开放。下一允许讨论独立精确查询及剩余导航子项，无本地外部阻塞；未push/部署/远程迁移，未将本地测试升级为真实验收。


### 讨论消息独立精确查询（本地三件套）

基线 `f9891d8`。本地补齐“唯一操作编号＋同编号安全重试＋精确查询结果”：显示冻结UUID，新增会话成员/目标/编号精确GET，不依赖分页；GET无写入/通知副作用。客户端严格匹配原正文、回复及提及，复制输入以隔离异步突变，查询与重试互斥；空结果、错误、拒权和跨epoch迟到回执不换号、不遗忘操作。服务/客户端/Worker3项RED、交互6项RED及输入快照2项RED后修复。最终讨论5文件78/78、扩大179文件3198/3198、审核评论既有协议119/119；项目类型、组件strict DOM、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。详见 `docs/product/navigation-discussion-exact-result-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task 4和D07仍开放。编号仍内存保存，下一允许补跨刷新恢复与剩余所有者，无本地外部阻塞；未push/部署/远程迁移，预览页面未更新。


### 讨论未决操作同标签页刷新恢复（本地）

基线 `70b5510`。按会话成员和讨论隔离 sessionStorage，冻结唯一编号、正文、回复与提及；发送前保存并回读校验，恢复后只允许显式精确查询或同编号重试，不自动发送或查询。记录损坏、配额、静默丢写、冲突和清理失败均保留未知状态；授权失败隐藏私人恢复内容，成员/讨论切换及迟到回执不能误清旧记录。定向6文件101/101、扩大180文件3221/3221通过；项目类型、目标文件strict DOM、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。额外全App strict DOM仍有28项既有诊断，在真实基线复跑一致，未声称该额外门禁通过。详见 `docs/product/navigation-discussion-refresh-recovery-evidence.md`。仅同标签页会话恢复，不承诺关闭标签页/重启恢复，不包含普通未提交草稿持久化或原生浏览器验收。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task 4和D07仍开放。无本地外部阻塞，下一允许继续剩余导航边界和既有类型门禁对账；未push/部署/远程迁移，独立预览未更新。


### 全前端严格类型门禁与导航组件修复（本地）

基线 `bba363a`。原项目检查未覆盖全部前端TSX；新增独立DOM/Vite严格配置覆盖全部229个第一方前端TS/TSX，默认typecheck同时保留原Worker/项目检查，smoke纳入门禁合约。真实完整配置先27项类型RED，修复后全绿；ContextRail遗漏onNavigate解构的实际点击错误先1失败/1通过再修复。修复会话守卫、过滤器字面值推断、React清理/ref、状态联合收窄、看板取消状态及图谱工厂/容器校验，不降低类型要求。定向4文件51/51、扩大181文件3227/3227、门禁合约3/3、i18n13/13、App合约8/8、Worker与全前端类型、landing类型、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。详见 `docs/product/navigation-frontend-type-gate-evidence.md`。旧28项App类型诊断仅属历史记录，当前正式前端门禁已通过。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task4与D07仍开放，不能以类型门禁替代原生浏览器/真实身份/VM验收。无本地外部阻塞，允许继续剩余导航所有者与恢复边界核对；未push/部署/远程迁移，独立预览不变。


### 环境元数据离页与草稿结算保护（本地）

基线 `cc25c71`。创建及重命名草稿接入离页确认；删除确认和未知操作阻止普通离页，同步消费确认避免重复写入。创建按唯一编号结算，精确查询/重试成功清除原提交草稿，迟到列表刷新保留新输入。重命名保留原目标/版本，非法输入和取消不隐式提交。新增七例先 RED 后 GREEN，另加两例边界回归。环境页61/61与合约45/45（联合106/106）、Worker/全前端类型、UI构建/静态VM隔离、双语及领域快照通过；操作枚举239文件1031候选并通过校验。详见 `docs/product/environment-navigation-draft-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task4、D04继续开放。正式VM UI仍受G0约束；本地下一步允许继续剩余导航所有者核对。未push、部署、远程迁移，独立预览未更新。
