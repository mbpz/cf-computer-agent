# Roadmap Status Ledger Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the repository's documented product state against code, routes, migrations, tests, and release evidence, then establish one four-dimensional delivery ledger and synchronize README, Roadmap, and the two active checklists.

**Architecture:** Add a machine-validated Markdown ledger as the only current completion source. README becomes a concise product/status entrypoint, Roadmap describes R0–R6 vertical delivery order, and specialist checklists retain atomic implementation detail while linking back to ledger IDs. Historical specs and plans remain immutable execution records and are explicitly excluded from completion counts.

**Tech Stack:** Markdown, Node.js built-in test runner, TypeScript/React/Cloudflare Workers repository contracts, D1 migration evidence

**Spec:** `docs/superpowers/specs/2026-08-29-roadmap-status-ledger-redesign.md`

## Global Constraints

- Use exactly four delivery dimensions: implementation, verification, release, acceptance.
- Allowed status values are exactly `done`, `partial`, `pending`, and `n/a`.
- Never promote local or Workerd evidence to production release or signed browser acceptance.
- Preserve per-user data isolation for tasks, notifications, boards, messages, drafts, private notes, and saved views.
- All formal list surfaces use complete numbered pagination; new write workflows define idempotency and recovery behavior.
- D1 migrations are append-only; do not edit remotely applied migrations.
- Do not read or upload `SECRETS_FILE`; do not deploy, push, or apply remote migrations during this documentation task.
- Treat `@cloudflare/computer` as Preview and Cloudflare free-tier capacity as a revalidation requirement, not a permanent guarantee.
- Preserve unrelated untracked `.DS_Store` and `.pnpm-store/` content.

---

### Task 1: Add the Delivery Ledger Contract

**Files:**
- Create: `scripts/delivery-status-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Markdown table in `docs/product/delivery-status-ledger.md`
- Produces: `npm run verify:delivery-status`, which validates IDs, status values, required evidence, Roadmap references, ready/coming-soon route coverage, and duplicate rows

- [ ] **Step 1: Write the failing contract test**

Create `scripts/delivery-status-contract.test.mjs` with Node's test runner. Parse the ledger table and enforce:

```js
const STATUS_VALUES = new Set(["done", "partial", "pending", "n/a"]);
const REQUIRED_COLUMNS = [
  "ID", "功能", "优先级", "实现", "验证", "发布", "验收", "依赖", "证据", "备注",
];

assert.deepEqual(headers, REQUIRED_COLUMNS);
assert.equal(new Set(rows.map((row) => row.ID)).size, rows.length, "ledger IDs must be unique");
for (const row of rows) {
  for (const field of ["实现", "验证", "发布", "验收"]) {
    assert.ok(STATUS_VALUES.has(row[field]), `${row.ID} has invalid ${field}`);
  }
  if (row.实现 === "done" || row.验证 === "done" || row.发布 === "done" || row.验收 === "done") {
    assert.notEqual(row.证据, "-", `${row.ID} requires evidence`);
  }
}
```

Import `WORKSPACE_ROUTE_CAPABILITIES` through the repository's existing TypeScript-capable test path or parse its literal records. Assert every `ready` and `coming_soon` route appears in one ledger evidence/notes field. Parse Roadmap backtick IDs and assert they exist in the ledger.

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
rtk node --test scripts/delivery-status-contract.test.mjs
```

Expected: FAIL because `docs/product/delivery-status-ledger.md` does not exist.

- [ ] **Step 3: Register the verification command**

Add to `package.json`:

```json
"verify:delivery-status": "node --test scripts/delivery-status-contract.test.mjs"
```

Append `npm run verify:delivery-status` to `test:smoke` so normal `npm run check` prevents documentation drift.

- [ ] **Step 4: Verify the package contract remains valid**

Run:

```bash
rtk npm run verify:delivery-status
rtk npm run test:smoke
```

Expected: the new verifier still fails only because the ledger is absent; existing smoke contracts do not gain unrelated failures.

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/delivery-status-contract.test.mjs package.json
rtk git commit -m "test: enforce delivery status ledger"
```

---

### Task 2: Build the Evidence-Backed Delivery Ledger

**Files:**
- Create: `docs/product/delivery-status-ledger.md`
- Read: `shared/workspace-route-capabilities.ts`
- Read: `src/routes/*.ts`
- Read: `frontend/pages/**/*.tsx`
- Read: `migrations/*.sql`
- Read: `test/unit/**/*`, `test/worker/**/*`
- Read: `docs/operations/evidence/*.md`
- Test: `scripts/delivery-status-contract.test.mjs`

**Interfaces:**
- Consumes: repository implementation and evidence inventory
- Produces: the sole current status ledger with stable domain-prefixed IDs

- [ ] **Step 1: Inventory capabilities from executable artifacts**

Generate a review worksheet with these read-only commands:

```bash
rtk rg -n "path: \"/|availability:" shared/workspace-route-capabilities.ts
rtk rg -n "url\.pathname|^\s*const .*Path = /\^\\/" src/routes
rtk rg --files frontend/pages src migrations test docs/operations/evidence
rtk npm run verify:m1:migrations -- --files
```

Classify each capability under identity, knowledge ingestion, search/reader/chat, shell/navigation, tasks, boards, notifications, messages, governance/analytics, or operations.

- [ ] **Step 2: Create the ledger header and status legend**

Start `docs/product/delivery-status-ledger.md` with:

```markdown
# 产品交付状态总账

更新时间：2026-08-29

> 本文是当前完成情况的唯一权威来源。历史计划中的复选框不参与完成度统计。

状态：`done`、`partial`、`pending`、`n/a`。

| ID | 功能 | 优先级 | 实现 | 验证 | 发布 | 验收 | 依赖 | 证据 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

- [ ] **Step 3: Record implemented product domains**

Add evidence-backed rows for all current ready routes and their backend/data foundations. Use stable IDs:

- `IDN-*`: OAuth, sessions, allowlist, members, per-user isolation
- `KB-*`: submission, parsing, review, publication, reader, search, chat
- `WB-*`: shell, navigation, pagination, scroll, settings
- `TSK-*`: private task CRUD, status/progress/tags/links, numbered pagination
- `ADM-*`: members, roles, menus, spaces, audit, analytics, moderation/assets
- `OPS-*`: migrations, release gates, restore/export, free-tier degradation

For every `done` field, cite a concrete file, test, migration, commit, or evidence document. If production evidence predates the current main commit, mark release or acceptance `partial` rather than `done`.

- [ ] **Step 4: Record missing collaboration functions atomically**

Add at minimum:

```markdown
| NTF-001 | 站内通知数据模型与用户隔离 | P0 | pending | pending | pending | pending | IDN-004 | shared route: `/notifications` | 每条通知必须绑定 recipient_member_id |
| NTF-002 | 幂等通知生成与去重 | P0 | pending | pending | pending | pending | NTF-001 | - | 使用 event_key + recipient 唯一约束 |
| NTF-003 | 通知收件箱、未读和完整数字分页 | P0 | pending | pending | pending | pending | NTF-002, WB-PAGE | - | 读状态更新可重试 |
| BRD-001 | 基于任务的看板视图模型 | P0 | pending | pending | pending | pending | TSK-001 | shared route: `/boards` | 不复制第二套任务权威数据 |
| BRD-002 | 看板列顺序与拖拽幂等更新 | P1 | pending | pending | pending | pending | BRD-001 | - | 乐观并发与失败回滚 |
| MSG-001 | 任务/知识上下文讨论模型 | P1 | pending | pending | pending | pending | IDN-004, TSK-001, KB-READ | shared route: `/messages` | 优先上下文讨论，不先做开放私信 |
| MSG-002 | 会话列表与消息完整数字分页 | P1 | pending | pending | pending | pending | MSG-001, WB-PAGE | - | participant 授权二次校验 |
```

Also add acceptance, accessibility, empty/error states, retention, audit, and production evidence rows so each domain has frontend, backend, isolation, idempotency, pagination, and acceptance coverage.

- [ ] **Step 5: Record known release-evidence gaps**

Add explicit R0 rows for:

- current-main full gate evidence
- remote 0033/0034 migration state
- deployed Worker version containing pagination/tasks/shell/menu changes
- admin and contributor signed browser journeys
- production signed automation regression
- rollback point and custom-domain/workers.dev state

Do not infer these statuses from older release evidence.

- [ ] **Step 6: Run the ledger contract**

```bash
rtk npm run verify:delivery-status
```

Expected: PASS with unique IDs, valid states, all routes represented, and evidence on every completed dimension.

- [ ] **Step 7: Commit**

```bash
rtk git add docs/product/delivery-status-ledger.md
rtk git commit -m "docs: add delivery status ledger"
```

---

### Task 3: Rewrite Roadmap Around R0–R6 Vertical Journeys

**Files:**
- Modify: `ROADMAP.md`
- Test: `scripts/delivery-status-contract.test.mjs`

**Interfaces:**
- Consumes: stable IDs and statuses from `docs/product/delivery-status-ledger.md`
- Produces: R0–R6 sequencing without duplicating atomic implementation state

- [ ] **Step 1: Add a failing Roadmap coverage assertion**

Extend the contract so `ROADMAP.md` must contain exactly these top-level stages:

```js
for (const stage of ["R0", "R1", "R2", "R3", "R4", "R5", "R6"]) {
  assert.match(roadmap, new RegExp(`^## ${stage} — `, "m"));
}
assert.doesNotMatch(roadmap, /^## M[0-9]+ — /m);
```

Require every backticked atomic ID in Roadmap to exist in the ledger.

- [ ] **Step 2: Run RED**

```bash
rtk npm run verify:delivery-status
```

Expected: FAIL because the current Roadmap still uses M0–M8.

- [ ] **Step 3: Replace Roadmap structure**

Rewrite `ROADMAP.md` using:

- Product boundaries and evidence rules from the approved spec.
- Current maturity summary derived from ledger counts.
- R0 status/evidence closure.
- R1 AI knowledge core loop.
- R2 tasks → notifications → boards → contextual messages.
- R3 governance/version/trash/audit.
- R4 mature retrieval/reader/evaluation.
- R5 source workspace/artifacts/bounded agent.
- R6 export/restore/capacity/1.0.

For every stage include:

```markdown
状态：active | planned | blocked

目标：
范围：`LEDGER-ID` …
前置依赖：
退出标准：
- [ ] …
```

Do not claim a stage complete unless its referenced ledger release and acceptance dimensions support it.

- [ ] **Step 4: Run Roadmap and link contracts**

```bash
rtk npm run verify:delivery-status
rtk npm run verify:m1:docs
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add ROADMAP.md scripts/delivery-status-contract.test.mjs
rtk git commit -m "docs: reframe product roadmap around delivery evidence"
```

---

### Task 4: Reconcile the AI Knowledge Checklist

**Files:**
- Modify: `docs/product/ai-knowledge-base-checklist.md`
- Modify: `scripts/verify-m1-docs.mjs` only if the old milestone labels are hard-coded
- Modify: `scripts/m1-release-contract.test.mjs` only if links or status wording require synchronization
- Test: `scripts/delivery-status-contract.test.mjs`

**Interfaces:**
- Consumes: knowledge-domain ledger IDs and existing SRC/ING/PAR/CHK/GOV/IDX/SRCH/READ/CHAT/RES/ART/AGT/COL/AUTH/I18N/EVAL/OPS evidence
- Produces: specialist knowledge checklist whose checkboxes mean implementation plus local/Workerd verification only

- [ ] **Step 1: Add checklist semantics contract**

Require the file to state:

```markdown
复选框仅表示“实现 + 本地/Workerd 验证”完成；发布和验收状态以交付状态总账为准。
```

Require a link to `./delivery-status-ledger.md` and reject the deprecated shorthand pattern `状态：L/W/R/D` in newly summarized gate sections.

- [ ] **Step 2: Run RED**

```bash
rtk npm run verify:delivery-status
```

Expected: FAIL because the checklist still treats several release states and gate checkboxes as mixed completion signals.

- [ ] **Step 3: Reconcile every unchecked atom**

For all currently unchecked items:

- Verify whether implementation/test evidence now exists.
- Check only atoms with reproducible implementation and local/Workerd verification.
- Leave production-only items unchecked.
- Replace stale milestone references with R-stage mapping in the item metadata or section summary.
- Link each section to its ledger ID range.

Explicitly retain pending Cloudflare-resource work such as production R2, Queue, Vectorize, real-provider evidence, remote restore, and production synthetic probes unless current evidence proves otherwise.

- [ ] **Step 4: Reconcile gate summaries**

Replace M0–M8 gate completion boxes with a non-authoritative “historical gate mapping” table:

```markdown
| 历史 Gate | 当前结论 | 新阶段 | 权威状态 |
| --- | --- | --- | --- |
| GATE-M1 | 本地与既有生产证据已存在，当前 main 发布状态需 R0 复核 | R0/R1 | 见总账 |
```

Do not delete historical IDs because release contracts may cite them.

- [ ] **Step 5: Run knowledge documentation gates**

```bash
rtk npm run verify:delivery-status
rtk npm run verify:m1:docs
rtk npm run test:ops:m1
rtk git diff --check
```

Expected: PASS without weakening migration or release-evidence assertions.

- [ ] **Step 6: Commit**

```bash
rtk git add docs/product/ai-knowledge-base-checklist.md scripts/verify-m1-docs.mjs scripts/m1-release-contract.test.mjs
rtk git commit -m "docs: reconcile knowledge delivery checklist"
```

---

### Task 5: Reconcile the Frontend and Workbench Checklist

**Files:**
- Modify: `docs/product/shadcn-ui-frontend-checklist.md`
- Test: `scripts/delivery-status-contract.test.mjs`

**Interfaces:**
- Consumes: WB, TSK, NTF, BRD, MSG, and ADM ledger domains
- Produces: frontend-only implementation/interaction checklist with explicit missing collaboration slices

- [ ] **Step 1: Add a frontend ownership contract**

Require the checklist introduction to say it owns components, routes, interaction states, responsive behavior, accessibility, and frontend release wiring—not backend delivery status.

Require references to ledger IDs for tasks, boards, notifications, messages, analytics, shell, and pagination.

- [ ] **Step 2: Run RED**

```bash
rtk npm run verify:delivery-status
```

Expected: FAIL until the frontend checklist documents the missing collaboration surfaces and the new ownership boundary.

- [ ] **Step 3: Synchronize completed frontend work**

Record verified implementation for:

- shadcn shell and component primitives
- independent sidebar/content scrolling and compact desktop layout
- unified complete-number pagination and URL/history behavior
- tasks page and private mutation recovery
- route capability registry and coming-soon states
- real Tooltip portal/accessibility behavior
- analytics, members, audit, moderation, knowledge, search, and submissions pagination

Link each summary to the relevant WB/TSK/ADM ledger rows and evidence commands.

- [ ] **Step 4: Add missing workbench frontend atoms**

Add unchecked frontend atoms:

- `FE-NTF-001` notification inbox, unread filter/count, numbered pagination, empty/error/loading states
- `FE-NTF-002` notification target navigation and idempotent read-state feedback
- `FE-BRD-001` task-backed board columns, filters, compact responsive layout
- `FE-BRD-002` keyboard-accessible drag/reorder with optimistic rollback
- `FE-MSG-001` contextual thread list and message pagination
- `FE-MSG-002` composer idempotency, retry, failed state, accessibility
- `FE-ACC-001` admin/contributor signed browser acceptance matrix

Each atom must reference its backend ledger dependency; frontend completion cannot make a missing backend feature ready.

- [ ] **Step 5: Run frontend documentation and UI contracts**

```bash
rtk npm run verify:delivery-status
rtk npm run verify:wcag
rtk npx vitest run test/unit/frontend-shell.test.tsx test/unit/frontend-responsive.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-pagination.test.tsx
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add docs/product/shadcn-ui-frontend-checklist.md
rtk git commit -m "docs: reconcile frontend workbench checklist"
```

---

### Task 6: Rewrite README as the Current Product Entry Point

**Files:**
- Modify: `README.md`
- Test: `scripts/delivery-status-contract.test.mjs`

**Interfaces:**
- Consumes: Roadmap stage summary and ledger status
- Produces: concise, non-contradictory onboarding and maturity description

- [ ] **Step 1: Add README drift assertions**

Require links to:

- `ROADMAP.md`
- `docs/product/delivery-status-ledger.md`
- both specialist checklists
- production handbook and current evidence index

Reject stale phrases that claim the old M1 count is the current overall product status.

- [ ] **Step 2: Run RED**

```bash
rtk npm run verify:delivery-status
```

Expected: FAIL because README lacks the delivery ledger and current workbench maturity.

- [ ] **Step 3: Rewrite the status and capability sections**

README must state:

- Personal workbench with AI knowledge base as the first major module.
- User-isolated tasks are implemented and locally verified.
- Unified numbered pagination, independent scrolling, compact shadcn shell, and admin governance are implemented and locally verified.
- Boards, notifications, and messages remain coming soon.
- Current-main production release/acceptance status is determined only by the ledger.
- Optional R2/Vectorize/Queue/Workers AI features degrade without blocking the free text core.

Keep local development, security, deployment, API, and free-tier sections, but remove duplicated milestone prose and stale counts.

- [ ] **Step 4: Run README and full documentation gates**

```bash
rtk npm run verify:delivery-status
rtk npm run verify:m1:docs
rtk npm run test:smoke
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add README.md scripts/delivery-status-contract.test.mjs
rtk git commit -m "docs: refresh workbench product status"
```

---

### Task 7: Final Cross-Document Audit and Summary

**Files:**
- Create: `docs/operations/evidence/2026-08-29-roadmap-reconciliation.md`
- Modify: `docs/product/delivery-status-ledger.md` only for evidence-backed corrections found during final audit
- Modify: `ROADMAP.md`, `README.md`, or checklists only to resolve verified contradictions

**Interfaces:**
- Consumes: all prior task outputs
- Produces: reproducible completion summary and prioritized missing-function backlog

- [ ] **Step 1: Run the full documentation contract**

```bash
rtk npm run verify:delivery-status
rtk npm run verify:m1:docs
rtk npm run test:smoke
rtk npm run verify:wcag
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 2: Run repository gates proportional to documentation risk**

```bash
rtk npm run typecheck
rtk npm run check
```

Expected: PASS. Document the exact smoke, unit, Worker, build, migration, and release-contract counts emitted by this run.

- [ ] **Step 3: Audit route and migration coverage**

```bash
rtk rg -n "availability: \"(ready|coming_soon)\"" shared/workspace-route-capabilities.ts
rtk npm run verify:m1:migrations -- --files
rtk git status --short
```

Expected: every registered route maps to a ledger row; all migration hashes pass; only intended documentation/script changes exist.

- [ ] **Step 4: Write reconciliation evidence**

Create `docs/operations/evidence/2026-08-29-roadmap-reconciliation.md` with:

- checked source files and commit
- counts by product domain and four status dimensions
- contradictions corrected
- missing functions grouped P0/P1/P2
- commands and exact results
- explicit unperformed production actions
- next recommended implementation slice: R0 evidence closure or R2 notifications, depending on ledger blockers

- [ ] **Step 5: Final self-review**

Search for contradictions and placeholders:

```bash
rtk rg -n "M1 的 23|当前下一阶段|TBD|TODO|状态：L/W|状态：R" README.md ROADMAP.md docs/product/delivery-status-ledger.md docs/product/ai-knowledge-base-checklist.md docs/product/shadcn-ui-frontend-checklist.md
rtk npm run verify:delivery-status
rtk git diff --check
```

Expected: no stale current-status claims or placeholders; historical evidence references may remain only when explicitly labeled historical.

- [ ] **Step 6: Commit**

```bash
rtk git add README.md ROADMAP.md docs/product/delivery-status-ledger.md docs/product/ai-knowledge-base-checklist.md docs/product/shadcn-ui-frontend-checklist.md docs/operations/evidence/2026-08-29-roadmap-reconciliation.md scripts/delivery-status-contract.test.mjs package.json
rtk git commit -m "docs: reconcile roadmap and delivery status"
```

## Plan Self-Review

- Spec coverage: all approved status dimensions, document responsibilities, R0–R6 stages, collaboration gaps, user isolation, idempotency, pagination, Cloudflare boundaries, and evidence rules map to Tasks 1–7.
- Placeholder scan: no TBD/TODO or unspecified implementation steps remain.
- Type consistency: ledger columns and allowed status values are identical in the spec, contract, and plan.
- Scope: this plan changes documentation and its verification contract only; it does not implement boards, notifications, messages, deploy code, or apply remote migrations.
