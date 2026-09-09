# Memory Garden 2.0 P2-B Project Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first private Project aggregate so a member can group Goals, Tasks and future Knowledge/Asset references without creating a second permission or ownership system.

**Architecture:** Project is a member-owned D1 entity with explicit lifecycle state and optional `goal_id`; task/knowledge links are added through bounded relation tables that always repeat `member_id` in the authorization predicate. The first slice exposes project CRUD, status, goal relation, and a summary endpoint; project home aggregation and cross-module timeline remain later P4 work.

**Tech Stack:** Cloudflare Workers, D1, existing `TasksRepository`, `GoalsRepository`, route/service patterns, React/Vite/shadcn-style primitives, TypeScript, Vitest.

**Spec:** `docs/product/memory-garden-2.0-product-definition.md`, `docs/product/memory-garden-2.0-roadmap.md`, `docs/product/memory-garden-2.0-checklist.md`

## Global Constraints

- Keep the Cloudflare free-tier and 5–20 private-member boundary.
- Derive `member_id` from the authenticated principal for every project and relation read/write.
- Preserve GitHub OAuth allowlist, admin/contributor roles, server-owned menu filtering, and `workspace.tasks` permission semantics.
- Use append-only local D1 migration; do not apply remote migration or deploy in this plan.
- Every create/link mutation is idempotent by member-scoped client key or unique relation key.
- Lists use opaque cursor pagination, default 20, maximum 50; summaries are bounded and member-scoped.
- Do not read/upload `SECRETS_FILE`.
- Write a failing test before each implementation task and commit each independently.

## Atomic delivery order

### Task 1: Project schema contract

- [x] Add `migrations/0040_workbench_projects.sql` with `projects`, `project_goals`, `project_tasks` and `/projects` menu.
- [x] Enforce project status (`planned | active | paused | completed | archived`), title bounds, member-scoped client key, and unique relation keys.
- [x] Add D1 worker tests for schema, invalid states, replay, member isolation and relation uniqueness.
- [x] Update migration hashes only after SQL is locally verified.

### Task 2: Project repository/service

- [x] Add `src/projects/types.ts`, `repository.ts`, `service.ts`.
- [x] Implement create/get/list/update/status with owner predicates and cursor scope.
- [x] Implement `linkGoal`, `unlinkGoal`, `linkTask`, `unlinkTask` with idempotent relation behavior.
- [x] Implement `summary(memberId, projectId)` returning bounded counts only for owned visible relations.
- [x] Add service tests for replay, cross-member refusal, relation idempotency and status behavior.

### Task 3: Project API and task/goal relation checks

- [x] Add `src/routes/projects.ts` and wire it into `src/app.ts`.
- [x] Expose `/api/projects`, `/api/projects/:id`, `/status`, `/goals`, `/tasks`, and `/summary`.
- [x] Reject client-supplied `memberId`, unknown query/body keys and cross-member goal/task IDs.
- [x] Add route tests and worker route tests.

### Task 4: Project workbench page

- [x] Add `frontend/lib/projects-data.ts` and `frontend/pages/projects-page.tsx`.
- [x] Add `/projects` route, navigation icon, bilingual copy, empty/loading/error states and no-`undefined` contract.
- [x] Render project status, progress summary, linked Goal and bounded task count; do not implement an unbounded project timeline.
- [x] Add SSR/component tests and route access tests.

### Task 5: Evidence and checklist

- [x] Record `PRJ-001` in `docs/product/delivery-status-ledger.md`.
- [x] Mark `MG2-P2-010` as local integration only in the 2.0 checklist.
- [x] Add migration manifest/hash, local acceptance evidence and roadmap maturity updates.
- [x] Run typecheck, unit, focused worker, i18n, build and smoke contracts.

## Stop gate

Stop after local Project CRUD/relation evidence. Project home aggregation, timeline, meetings, decisions, members and production release remain later reviewed work.
