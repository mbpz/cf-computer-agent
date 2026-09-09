# Memory Garden 2.0 P2-B Goal Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first private Goal aggregate so a signed-in member can create, list, edit, update progress, archive, and restore personal goals with the same isolation, idempotency, pagination, i18n, and audit boundaries as Inbox and Tasks.

**Architecture:** Add a small D1-backed `goals` aggregate scoped by `member_id`. Expose a member-only Worker API with opaque cursor pagination and explicit status/progress mutations, then add a focused `/goals` workbench page. Goal-to-Project and Goal-to-Task relations remain the next slice; this plan deliberately avoids introducing a project model before the Goal contract is proven.

**Tech Stack:** Cloudflare Workers, D1, existing route/service/repository patterns, React/Vite/shadcn-style local primitives, TypeScript, Vitest, existing i18n and route capability contracts.

**Spec:** `docs/product/memory-garden-2.0-product-definition.md`, `docs/product/memory-garden-2.0-roadmap.md`, `docs/product/memory-garden-2.0-checklist.md`

## Global Constraints

- 产品母体是个人工作台 SaaS，AI 知识库是其中一个模块。
- 每个 Goal 必须由认证 principal 推导 `member_id`，不能信任客户端 member id。
- 保持 GitHub OAuth 白名单、admin/contributor、服务端菜单过滤和现有权限位图。
- 只使用现有 Cloudflare 免费层能力；本切片不引入 R2、Vectorize、Queues、外部分析或第二套鉴权。
- 写入接口必须支持客户端幂等 key；重复提交不能产生重复 Goal。
- 列表使用现有 opaque cursor 分页习惯，默认 20，最大 50。
- 所有用户文案走 i18n；禁止 `undefined`、内部 label key 或未授权数据泄露。
- 不读取或上传 `SECRETS_FILE`，不做生产 D1 migration、生产部署或远程 smoke。
- 每个任务先写失败测试，再实现最小代码，再运行回归并独立提交。

---

## Task 1: 固化 Goal 数据契约和 migration

**Files:**
- Create: `migrations/0039_workbench_goals.sql`
- Create: `src/goals/types.ts`
- Test: `test/worker/goals.test.ts`

**Contract:**

- `status`: `active | paused | completed | archived`
- `progress`: integer from 0 to 100
- `title`: 1–200 characters; `description`: optional bounded text
- `target_at`: optional UTC epoch milliseconds
- `client_key`: member-scoped idempotency key
- indexes: `(member_id, status, updated_at DESC, id DESC)` and unique `(member_id, client_key)`
- migration adds a system menu row `/goals` with `workspace.tasks` permission semantics

- [x] Write failing worker contract tests for migration shape, owner isolation, client-key replay, and bounded pagination.
- [x] Run the focused worker test and observe failure before implementation.
- [x] Add the migration and TypeScript input/output types.
- [x] Run the focused worker test and typecheck.
- [x] Commit `feat: add private goals schema contract`.

## Task 2: Add Goal repository and service

**Files:**
- Create: `src/goals/repository.ts`
- Create: `src/goals/service.ts`
- Test: `test/unit/goals-service.test.ts`

**Interfaces:**
- `GoalsRepositoryPort.insert/findOwned/findByClientKey/listOwned/update/updateStatus/updateProgress`
- `GoalsService.create/list/get/update/setStatus/setProgress`

- [x] Write failing service tests for member isolation, validation, idempotent create, status transitions, and progress monotonicity rules.
- [x] Run focused unit tests and observe failure.
- [x] Implement repository queries with `member_id` predicates on every read/write.
- [x] Implement service validation and retry-safe behavior.
- [x] Run focused unit tests, typecheck, and commit `feat: add private goals service`.

## Task 3: Expose `/api/goals`

**Files:**
- Create: `src/routes/goals.ts`
- Modify: `src/app.ts`
- Test: `test/unit/goals-route.test.ts`

**API:**
- `GET /api/goals?limit=&cursor=&status=` returns `{ items, nextCursor? }`.
- `POST /api/goals` accepts `{ id, clientKey, title, description?, targetAt? }`.
- `GET/PATCH/DELETE /api/goals/:id` reads/edits/archives only the authenticated member’s Goal.
- `POST /api/goals/:id/status` accepts `{ status }`.
- `POST /api/goals/:id/progress` accepts `{ progress }`.

- [x] Add route tests that reject client `memberId`, pass the authenticated member only, enforce exact query/body keys, and map method errors.
- [x] Run focused route tests and observe failure.
- [x] Wire the route and service into the request service factory and dispatcher.
- [x] Run route tests, worker contract tests, and typecheck.
- [x] Commit `feat: expose private goals api`.

## Task 4: Add the Goals workbench page

**Files:**
- Create: `frontend/lib/goals-data.ts`
- Create: `frontend/pages/goals-page.tsx`
- Modify: `frontend/app.tsx`
- Modify: `frontend/lib/i18n.ts`
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/components/shell/app-shell.tsx`
- Test: `test/unit/frontend-goals-page.test.tsx`

- [x] Write failing SSR/component tests for empty, loading, error, create, progress, archive, restore, and locale rendering.
- [x] Run focused frontend tests and observe failure.
- [x] Add normalized API adapter and bounded page UI; never render raw API labels.
- [x] Add bilingual route/menu labels and command palette entry.
- [x] Run frontend tests, i18n verification, and build.
- [x] Commit `feat: add goals workbench page`.

## Task 5: Evidence and release ledger update

**Files:**
- Modify: `scripts/verify-m1-migrations.mjs`
- Modify: `scripts/m1-release-contract.test.mjs`
- Modify: `scripts/delivery-status-contract.test.mjs`
- Modify: `docs/product/memory-garden-2.0-checklist.md`
- Modify: `docs/product/delivery-status-ledger.md`
- Modify: `ROADMAP.md`
- Create: `docs/evidence/2026-09-09-goals-local-acceptance.md`

- [x] Add migration hash/count and route/menu contract evidence.
- [x] Record local-only acceptance and the known unrelated full worker-suite failures separately.
- [x] Run typecheck, i18n verification, focused tests, build, and smoke.
- [x] Commit `docs: record goals vertical slice evidence`.

## Stop Gate

Stop after Task 5. Do not add Project, Goal relations, remote migrations, production deploy, or production acceptance in this plan. Those are the next reviewed P2-B slice.
