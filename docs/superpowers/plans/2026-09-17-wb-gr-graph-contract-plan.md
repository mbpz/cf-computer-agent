# Personal Work Graph 后端合同与投影 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供经过成员隔离、对象可见性校验、限深和分页保护的 `GET /api/graph`。

**Architecture:** 新增独立 graph projection 模块，从 Knowledge、Tasks、Projects、Goals、Calendar、Inbox 和 Review 的现有 repository/service 读取数据；不新建万能业务表，不直接写图谱数据。路由只返回 GraphSnapshot，所有写操作留给后续领域服务。

**Tech Stack:** TypeScript、Cloudflare Workers、D1、现有 pagination/http/authorization 模块、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-17-personal-ai-work-graph-design.md`

## Global Constraints

- 只从认证 principal 推导 `member_id`。
- 默认 depth=1、节点 50、边 100；最大 depth=2、节点 100、边 200。
- 隐藏对象不能通过节点、边、标题、数量或错误信息泄漏。
- cursor 必须绑定 member、scope、rootId、depth、types。
- 图谱投影不拥有业务写权限。

### Task 1: Graph 类型和规范化工具

**Files:**
- Create: `src/graph/types.ts`
- Create: `src/graph/limits.ts`
- Test: `test/unit/graph-contract.test.ts`

**Interfaces:**
- Produces `GraphNode`, `GraphEdge`, `GraphSnapshot`, `GraphScope`, `GraphQuery`。
- Produces `parseGraphQuery(input: URLSearchParams): GraphQuery`。
- Produces `normalizeGraphSnapshot(nodes, edges, query): GraphSnapshot`。

- [ ] **Step 1: Write the failing test**

```ts
it("rejects depth above two and limits nodes/edges", () => {
  expect(() => parseGraphQuery(new URLSearchParams("depth=3"))).toThrow("GRAPH_QUERY_INVALID");
  expect(normalizeGraphSnapshot(nodes(101), edges(201), query).truncated).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run test/unit/graph-contract.test.ts`
Expected: FAIL because graph types and parser do not exist.

- [ ] **Step 3: Write minimal implementation**

Implement exact enums from the spec, enforce `depth ∈ {1,2}`, `limit ∈ [1,100]`, valid scope/types, stable ID ordering, node deduplication, edge endpoint existence, and `truncated` when either cap is exceeded.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run test/unit/graph-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph/types.ts src/graph/limits.ts test/unit/graph-contract.test.ts
git commit -m "feat: define personal work graph contract"
```

### Task 2: Graph projection service

**Files:**
- Create: `src/graph/repository.ts`
- Create: `src/graph/service.ts`
- Modify: `src/app.ts`
- Test: `test/unit/graph-service.test.ts`

**Interfaces:**
- Produces `GraphProjectionService.get(memberId: string, query: GraphQuery): Promise<GraphSnapshot>`。
- Consumes existing owner-scoped methods from library, tasks, projects, goals, calendar and inbox repositories。

- [ ] **Step 1: Write the failing test**

```ts
it("projects only member-owned objects and removes edges to hidden nodes", async () => {
  const result = await service.get("member-a", { scope: "workspace", rootId: null, depth: 1, types: [], limit: 50 });
  expect(result.nodes.every((node) => node.metadata.memberId !== "member-b")).toBe(true);
  expect(result.edges.every((edge) => result.nodes.some((node) => node.id === edge.source) && result.nodes.some((node) => node.id === edge.target))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run test/unit/graph-service.test.ts`
Expected: FAIL because projection service does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement per-scope loaders, owner predicates, stable `kind:id` node IDs, typed edges, citation IDs only from authorized source records, and deterministic ordering. Do not return `memberId` in public node metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run test/unit/graph-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/graph/repository.ts src/graph/service.ts test/unit/graph-service.test.ts
git commit -m "feat: add authorized work graph projection"
```

### Task 3: Graph API route and pagination

**Files:**
- Create: `src/routes/graph.ts`
- Modify: `src/app.ts`
- Test: `test/worker/graph.test.ts`
- Modify: `scripts/delivery-status-contract.test.mjs`

**Interfaces:**
- Produces `GET /api/graph` with `scope`, `rootId`, `depth`, `types`, `limit`, `cursor`。

- [ ] **Step 1: Write the failing test**

```ts
it("returns 200 for an owned graph and 404 for another member root", async () => {
  expect((await api("/api/graph?scope=project&rootId=project-a&depth=1&limit=50", sessionA)).status).toBe(200);
  expect((await api("/api/graph?scope=project&rootId=project-b&depth=1&limit=50", sessionA)).status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run test/worker/graph.test.ts --pool=workers`
Expected: FAIL because route is not registered.

- [ ] **Step 3: Write minimal implementation**

Require member principal and `tasks:use` capability, reject unknown query keys, parse query through `parseGraphQuery`, call projection service, return request ID headers through existing `jsonResponse`, and map invalid cursors to `GRAPH_PAGE_INVALID`.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run test/worker/graph.test.ts --pool=workers`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/graph.ts src/app.ts test/worker/graph.test.ts scripts/delivery-status-contract.test.mjs
git commit -m "feat: expose private work graph API"
```

### Task 4: Backend contract gate

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/product/delivery-status-ledger.md`
- Create: `docs/evidence/YYYY-MM-DD-work-graph-backend-local-acceptance.md`

- [ ] **Step 1:** Run `rtk npm run typecheck` and focused graph tests.
- [ ] **Step 2:** Run `rtk npm run test:smoke` and confirm delivery route contract.
- [ ] **Step 3:** Record exact tests, limits, isolation cases and no-production-action boundary in the dated evidence file.
- [ ] **Step 4:** Update `WB-GR-001` status to implementation/verification done, release/acceptance pending.
- [ ] **Step 5: Commit**

```bash
git add ROADMAP.md docs/product/delivery-status-ledger.md docs/evidence
git commit -m "docs: record work graph backend acceptance"
```
