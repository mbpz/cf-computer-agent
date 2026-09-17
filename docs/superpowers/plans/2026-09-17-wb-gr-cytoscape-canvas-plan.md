# Cytoscape Canvas 与工作图页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建登录后 `/graph` 工作图页面，以动态加载 Cytoscape.js 的方式展示 GraphSnapshot，并提供无障碍和移动端降级。

**Architecture:** Canvas 组件只负责 Cytoscape 生命周期、布局和视觉事件；数据加载由 frontend lib 负责；Inspector 和写操作由后续计划接入。页面在 Cytoscape 不可用、窄屏或图谱为空时仍可使用列表视图。

**Tech Stack:** React、TypeScript、Vite、Cytoscape.js、Tailwind/shadcn UI、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-17-personal-ai-work-graph-design.md`

## Global Constraints

- 只从 `/api/graph` 消费已授权数据。
- Cytoscape 必须 dynamic import，不进入首页首屏包体。
- 画布路由切换必须销毁实例和监听器。
- 节点数、边数和布局时间必须有界。
- 所有可见文案必须来自 `frontend/lib/i18n.ts`。
- 移动端提供语义化列表替代，不依赖画布完成任务。

### Task 1: 添加依赖和 Graph 数据客户端

**Files:**
- Modify: `package.json`
- Create: `frontend/lib/graph-data.ts`
- Test: `test/unit/frontend-graph-data.test.ts`

**Interfaces:**
- Produces `loadGraph(query, requester, signal): Promise<GraphSnapshot>`。
- Produces strict response normalizers for nodes, edges and snapshot.

- [ ] **Step 1: Write the failing test**

```ts
it("normalizes graph responses and rejects missing endpoints", async () => {
  await expect(loadGraph({}, requesterReturning({ nodes: [{ id: "task:t1" }], edges: [{ id: "e", source: "task:t1", target: "missing" }] }))).rejects.toThrow("GRAPH_RESPONSE_INVALID");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run test/unit/frontend-graph-data.test.ts`
Expected: FAIL because client and dependency do not exist.

- [ ] **Step 3: Write minimal implementation**

Pin Cytoscape.js in `package.json`; implement bounded query encoding, AbortSignal forwarding, strict node/edge normalization and rejection of malformed graph responses.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run test/unit/frontend-graph-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json frontend/lib/graph-data.ts test/unit/frontend-graph-data.test.ts
git commit -m "feat: add graph data client"
```

### Task 2: Cytoscape lifecycle component

**Files:**
- Create: `frontend/components/graph/graph-canvas.tsx`
- Create: `frontend/components/graph/graph-canvas.css`
- Test: `test/unit/frontend-graph-canvas.test.tsx`

**Interfaces:**
- Produces `GraphCanvas({ snapshot, selectedId, onSelect, layout }): JSX.Element`。
- Produces `GraphCanvasHandle.destroy(): void` through ref only if needed by route.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders a semantic fallback and exposes no undefined text", () => {
  const html = renderToStaticMarkup(<GraphCanvas snapshot={snapshot} selectedId={null} onSelect={vi.fn()} layout="concentric" />);
  expect(html).toContain("data-graph-canvas");
  expect(html).not.toContain("undefined");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run test/unit/frontend-graph-canvas.test.tsx`
Expected: FAIL because component does not exist.

- [ ] **Step 3: Write minimal implementation**

Use a stable container ref, dynamically import Cytoscape in `useEffect`, create elements from snapshot, apply `breadthfirst|concentric|cose|grid`, wire tap/select events, and destroy the instance plus listeners during cleanup. Render an accessible list fallback beneath or beside the canvas.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run test/unit/frontend-graph-canvas.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/graph test/unit/frontend-graph-canvas.test.tsx
git commit -m "feat: add cytoscape graph canvas"
```

### Task 3: `/graph` route and navigation

**Files:**
- Create: `frontend/pages/graph-page.tsx`
- Modify: `frontend/app.tsx`
- Modify: `frontend/app-routes.ts`
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/frontend-graph-page.test.tsx`

**Interfaces:**
- Produces `GraphRoute` with loading/error/empty/ready states.
- Adds route capability `{ id: "graph", path: "/graph", pageKind: "graph" }`.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the bilingual graph shell and bounded state", () => {
  const html = renderToStaticMarkup(<GraphPage locale={locale} state={{ kind: "ready", snapshot }} />);
  expect(html).toContain(frontendText(locale, "GRAPH_TITLE"));
  expect(html).not.toContain("undefined");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npx vitest run test/unit/frontend-graph-page.test.tsx`
Expected: FAIL because page and route do not exist.

- [ ] **Step 3: Write minimal implementation**

Add `/graph` capability under Workbench, load the default workspace graph with `loadGraph`, render GraphCanvas and the lens controls, keep query state local until URL restoration is explicitly added in the later plan, and display translated loading/error/truncated states.

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npx vitest run test/unit/frontend-graph-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/pages/graph-page.tsx frontend/app.tsx frontend/app-routes.ts shared/workspace-route-capabilities.ts frontend/lib/i18n.ts test/unit/frontend-graph-page.test.tsx
git commit -m "feat: add work graph workspace page"
```

### Task 4: Canvas quality gate

**Files:**
- Modify: `scripts/frontend-app-contract.test.mjs`
- Modify: `scripts/workbench-landing-build.test.mjs` only if emitted inventory needs explicit graph chunk assertion
- Create: `docs/evidence/YYYY-MM-DD-work-graph-canvas-local-acceptance.md`

- [ ] **Step 1:** Assert graph route imports `GraphPage` and only `/graph` loads Cytoscape.
- [ ] **Step 2:** Assert no `undefined`, no hardcoded UI copy, and both locales render.
- [ ] **Step 3:** Run `rtk npm run typecheck`, focused graph frontend tests and `rtk npm run build`.
- [ ] **Step 4:** Record emitted chunk and mobile fallback evidence.
- [ ] **Step 5: Commit**

```bash
git add scripts docs/evidence
git commit -m "docs: record cytoscape canvas acceptance"
```
