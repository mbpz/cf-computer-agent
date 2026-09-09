# Memory Garden 2.0 P2 Personal Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first complete personal-work loop inside the existing Cloudflare-only workbench: capture into a private Inbox, then promote an Inbox item into a task or knowledge submission without breaking current task, knowledge, auth, or admin boundaries.

**Architecture:** Add a small D1-backed `inbox_items` aggregate scoped by `member_id`, with a Worker repository/service/route and a React data adapter/page. Keep promotion commands explicit and idempotent: Inbox-to-task calls the existing TasksService contract, while Inbox-to-knowledge creates a normal submission through the existing member route. Do not introduce R2, Queues, Vectorize, external analytics, or a second auth system. Goal, Project, Calendar, and Review remain later P2 slices after this vertical slice is accepted.

**Tech Stack:** Cloudflare Workers, D1, existing service/repository/route patterns, React/Vite/shadcn-style local primitives, TypeScript, Vitest, existing i18n and route capability contracts.

**Spec:** `docs/product/memory-garden-2.0-product-definition.md`, `docs/product/memory-garden-2.0-roadmap.md`, `docs/product/memory-garden-2.0-checklist.md`

## Global Constraints

- 产品母体是个人工作台 SaaS，AI 知识库是其中一个模块。
- Inbox、任务、知识数据必须由认证 principal 推导 `member_id`，不能信任客户端 member id。
- 保持 GitHub OAuth 白名单、admin/contributor、服务端菜单过滤和现有权限位图。
- 只使用 Cloudflare 免费层已有 Worker、D1、Durable Objects、Workers AI 和静态 Assets；不新增 R2、Vectorize、Queues 或第三方 SaaS。
- 写入接口必须支持客户端幂等 key；重复提交不能产生重复 Inbox 或任务。
- 列表使用现有 opaque cursor 分页习惯，默认 20，最大 50。
- 所有用户文案走 i18n；禁止 `undefined`、内部 label key 或未授权数据泄露。
- 不读取或上传 `SECRETS_FILE`，不做生产部署和远程 migration。
- 每个任务先写失败测试，再实现最小代码，再运行回归并单独提交。

## 文件边界

### 新建

- `migrations/0038_workbench_inbox.sql`：私有 Inbox 表、索引、幂等约束和菜单入口。
- `src/inbox/types.ts`：Inbox 状态、输入、输出和分页类型。
- `src/inbox/repository.ts`：D1 查询、插入、更新、归档和 owner-scoped 分页。
- `src/inbox/service.ts`：principal 之外的业务规则、幂等和状态迁移。
- `src/routes/inbox.ts`：`/api/inbox` REST 路由和错误映射。
- `frontend/lib/inbox-data.ts`：API 归一化、分页和 mutation adapter。
- `frontend/pages/inbox-page.tsx`：Inbox 列表、快速收集、状态和 promotion UI。
- `test/unit/inbox-service.test.ts`：服务层 owner/idempotency/state tests。
- `test/unit/frontend-inbox-page.test.tsx`：渲染、空态、错误和 promotion tests。
- `test/worker/inbox.test.ts`：Worker route、隔离、分页和 idempotency tests。

### 修改

- `src/app.ts`：注册 InboxService，并在 API dispatcher 接入 Inbox route。
- `src/routes/member.ts`：复用现有 submission 输入校验/创建契约，必要时抽出共享 helper。
- `src/tasks/service.ts`：提供最小的 member-scoped `createFromInbox` 或复用现有 create 输入，不绕过审计和通知。
- `frontend/app.tsx`：增加 `/inbox` route、请求状态、创建/归档/promote handlers。
- `frontend/lib/i18n.ts`：补齐 Inbox 双语 key。
- `shared/workspace-route-capabilities.ts`：增加 `/inbox` 路由和 `knowledge` 模块映射。
- `frontend/components/shell/app-shell.tsx`：将 Inbox 放入模块导航和命令面板。
- `docs/product/memory-garden-2.0-checklist.md`：在证据通过后标记 P2 Inbox 原子项为 `[I]`。

### 不在本计划内

- Goal、Project、Calendar、Meeting、复盘数据模型。
- 文件原件持久化、R2 上传、异步解析队列。
- AI 自动分类和自动写回；本阶段只提供显式 promotion。
- 生产 D1 migration、生产部署、secrets、域名和浏览器生产验收。

---

## Task 1: 固化 Inbox 数据契约和 migration

**Files:**
- Create: `migrations/0038_workbench_inbox.sql`
- Create: `src/inbox/types.ts`
- Test: `test/worker/inbox.test.ts`

**Contract:**

- `status`: `inbox | archived | promoted`
- `kind`: `text | link | file_ref`
- `content`: bounded text, no binary payload
- `source_url`: optional URL
- `client_key`: required idempotency key scoped by member
- `promoted_task_id`, `promoted_submission_id`: nullable references for traceability
- indexes: `(member_id, status, created_at DESC, id DESC)` and unique `(member_id, client_key)`

- [x] Step 1: Write failing worker/migration tests for schema, owner isolation, status checks, and duplicate client key.
- [x] Step 2: Run `rtk npx vitest run test/worker/inbox.test.ts` and confirm failure because migration/route is absent.
- [x] Step 3: Add migration and types without wiring HTTP.
- [x] Step 4: Run migration contract tests and typecheck.
- [x] Step 5: Commit `feat: add private inbox schema contract`.

## Task 2: Implement owner-scoped Inbox repository/service/route

**Files:**
- Create: `src/inbox/repository.ts`
- Create: `src/inbox/service.ts`
- Create: `src/routes/inbox.ts`
- Modify: `src/app.ts`
- Test: `test/unit/inbox-service.test.ts`
- Test: `test/worker/inbox.test.ts`

**Contract:**

- `GET /api/inbox?cursor=&limit=&status=` returns opaque-cursor page.
- `POST /api/inbox` accepts `{id, clientKey, kind, content, sourceUrl}` and derives member from principal.
- `PATCH /api/inbox/:id` accepts `{status}` only; archive is reversible before promotion.
- `POST /api/inbox/:id/promote/task` and `/promote/knowledge` are explicit, idempotent commands.
- no route accepts `memberId` from request body/query.

- [x] Step 1: Write failing service tests for owner isolation, cursor bounds, duplicate client key replay, invalid transition, and retry-safe promotion.
- [x] Step 2: Run focused tests and confirm RED.
- [x] Step 3: Implement repository/service/route using existing AppError, pagination, audit, and principal patterns.
- [x] Step 4: Add dispatcher wiring and run worker tests.
- [x] Step 5: Commit `feat: add private inbox api` (`73ce141`).

## Task 3: Add Inbox frontend and route

**Files:**
- Create: `frontend/lib/inbox-data.ts`
- Create: `frontend/pages/inbox-page.tsx`
- Modify: `frontend/app.tsx`
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/components/shell/app-shell.tsx`
- Modify: `frontend/lib/command-palette.ts`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/frontend-inbox-page.test.tsx`
- Test: `test/unit/frontend-shell.test.tsx`

- [x] Step 1: Write SSR tests for capture form, empty/loading/error states, archive action, promotion actions, and no undefined.
- [x] Step 2: Run focused tests and fix the loading-state assertion against the shared PageState contract.
- [x] Step 3: Implement API adapter and route-owned controller with stale-request protection.
- [x] Step 4: Add bilingual UI, module entry, and command `Capture to Inbox`.
- [x] Step 5: Run frontend tests, typecheck, and i18n verification.
- [ ] Step 6: Commit `feat: add private inbox workbench flow`.

## Task 4: Close the Inbox vertical slice locally

- [x] Run migration verification, focused Worker/frontend tests, full unit suite, typecheck, i18n, and build dry-run.
- [x] Add local evidence to `docs/product/memory-garden-2.0-checklist.md` for `MG2-P2-001`, `MG2-P2-002`, and `MG2-P2-006`; leave file/knowledge promotion unchecked.
- [x] Commit `docs: record inbox vertical slice evidence`.
- [ ] Stop for review before starting Goal/Project or any production migration.

## Next plans after this slice

1. `P2-B`: Goal and Project aggregates with explicit task/knowledge links.
2. `P2-C`: Calendar, Today view, focus mode, and recurring review.
3. `P3-A`: AI capture classification and evidence-preserving promotion.
4. `P4-A`: Project timeline, meetings, decisions, and action-item extraction.
