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
- [ ] Commit evidence and functional changes; no release operations.

## Execution evidence

2026-10-02 Task 1: behavior RED21/24 failed; GREEN24/24; combined3files87/87, strict core types, project typecheck, build:ui and checklist tests9/9 passed. Runtime wiring and native navigation remain unimplemented; see `docs/product/2026-10-02-navigation-gate-core-evidence.md`.

Task 2续行（基线4478d21）：共享window准入和25处导航副作用迁移；原40个writer变为39个受保护writer+1个确认会话结束入口。真实TasksRoute新增2项先失败（被拦URL但仍多发读取）后通过；20文件437/437，追加异常/重入后共享位置15/15，类型/UI构建/清单测试通过。DOM测试使用.tsx避免被Worker-only tsconfig纳入，另独立严格DOM类型检查；见 `docs/product/navigation-atomic-route-commits-evidence.md`。尚无TaskEditor注册或history拦截，不关闭A05。

Task 3（基线9d126ca）：编辑器双入口与真实App侧栏接入同步draft/intent保护，RED6失败/31通过→GREEN37/37；扩展后22文件490/490、项目与严格DOM类型/UI构建/双语/清单通过。复用现有i18n文案，未改i18n.ts。见 `docs/product/navigation-task-editor-bridge-evidence.md`；Task 4及父项仍开放。

Task 3后续修正：同事件输入→保存的五类写入口统一读取同步draft，RED4行为失败→编辑器54/54，完整22文件495/495；类型/构建/双语/清单通过。详见桥接证据附录，父项仍开放。

Task 4能力核验：官方WHATWG正文核验成功；内置浏览器原生探针复现cancelable=false时precommitHandler抛错并移动URL，验证traverseTo真实key恢复原条目，见 `docs/product/navigation-history-capability-evidence.md`。仅能力子项完成；运行时适配/未知边界/完整版本/刷新与集成验收仍开放。

Task 4核心续行（基线57bb774）：两阶段prepare/permit与独立历史状态机已通过RED→GREEN；最终23文件530/530，类型/UI构建/双语/清单验证通过。新增commit卸载与排队重放取消竞态回归，详见 `docs/product/navigation-history-traversal-core-evidence.md`。这只是运行时接入的前置子项；原始popstate订阅未改，Task 4的完整RED覆盖、浏览器适配、原生验收与父项均不勾选。下一步直接执行实际端口及获准位置订阅接入，不重复设计批准。

Task 4运行时续行（基线20b4038）：真实浏览器端口、accepted位置订阅、App查询/hash读取、恢复故障UI、注销迟到命令隔离已接入。行为RED及补充边界后最终23文件545/545、类型/UI/双语门禁通过；内置浏览器真实App夹具验证Back取消/确认、Forward、pending/unknown草稿保留。见 `docs/product/navigation-history-runtime-evidence.md`。完整RED边界与原生门禁仍不勾选：刷新后epoch、跨document、键盘/触控及完整版本未验收。提交步骤待Task 4全部边界完结；本轮允许原子提交运行时与证据，不代表整个Task 4结束。
