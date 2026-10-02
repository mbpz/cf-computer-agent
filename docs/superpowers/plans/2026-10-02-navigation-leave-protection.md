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
