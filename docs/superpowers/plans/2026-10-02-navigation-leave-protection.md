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

Files: modify `frontend/lib/workspace-location.ts`, `frontend/app.tsx` and audited writer consumers; add `test/unit/frontend-workspace-location.test.ts`.

Interface: writeWorkspaceHistory retains existing callers but accepts admitted side-effect callbacks. registerWorkspaceLeaveGuard is per-window. Security session-end invalidates pending decisions explicitly.

- [ ] Write RED tests proving canceled navigation leaves URL/events/query side effects untouched.
- [ ] Bind coordinator to window; migrate all writer call sites whose query refs/invalidation/state updates occur outside the admitted commit.
- [ ] Test canonical replace, same-page pagination and successful logout separately; regression-test affected routes.
- [ ] Commit verified atomic routing changes with coverage inventory.

### Task 3: Task editor bridge

Files: modify `frontend/pages/tasks/task-editor.tsx`, `frontend/lib/i18n.ts`; test real TasksRoute and InboxRoute task opening.

- [ ] Write RED for dirty navigation, default keep, discard once, pending/unknown rejection, same-event write/leave, old confirmation and unmount.
- [ ] Register synchronous draft/write-lock reads; reuse ConfirmAction and existing close protection; invalidate on denied access and cleanup.
- [ ] Run both actual route entry tests and prior 31 task-editor tests, task APIs and dirty tests; preserve partial-form baselines.
- [ ] Commit verified explicit-navigation bridge. Keep history traversal open until Task 4.

### Task 4: History adapter and full local acceptance

Files: shared location/history adapter, its tests, App subscription consumers where necessary, native evidence report.

- [ ] Verify official browser history/navigation semantics and supported runtime capabilities; record compatibility evidence before choosing adapter details.
- [ ] Write RED covering accepted-position subscription, back/forward cancel/confirm, repeated traversal, unknown entries, reload/session boundaries and event deduplication.
- [ ] Implement traversal admission using verified entry identity/position; never infer unknown deltas, never silently accept dirty traversal.
- [ ] Re-run all navigation, shell, task/inbox/editor, notifications/messages, query pagination tests; typecheck, build:ui, test:i18n, verify:i18n and checklist audit.
- [ ] Obtain actual native history/refresh/keyboard evidence or leave that gate explicitly open; update product checklist only to proven scope.
- [ ] Commit evidence and functional changes; no release operations.

## Execution evidence

2026-10-02 Task 1: behavior RED21/24 failed; GREEN24/24; combined3files87/87, strict core types, project typecheck, build:ui and checklist tests9/9 passed. Runtime wiring and native navigation remain unimplemented; see `docs/product/2026-10-02-navigation-gate-core-evidence.md`.
