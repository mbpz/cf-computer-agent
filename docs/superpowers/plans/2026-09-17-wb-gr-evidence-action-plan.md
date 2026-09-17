# Evidence Path 与 Graph to Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户从工作图节点和边查看证据，并通过现有领域服务创建任务、行动项、项目关联或 Focus。

**Architecture:** Inspector 读取 GraphNode 的公开 metadata 和专用 detail API；Evidence Path 只复用已授权 citation/chunk 回读；所有写操作调用既有 TasksService、ProjectsService、ProjectTimelineService、CalendarService 或 FocusService，不修改 Graph 表。

**Tech Stack:** React、TypeScript、现有知识 Reader、Tasks、Projects、Focus、Calendar 服务、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-17-personal-ai-work-graph-design.md`

## Global Constraints

- 不允许图谱前端自行拼接或保存业务写模型。
- 每个 action 使用 client key，重试必须幂等。
- citation 只来自授权对象；不可见 citation 返回统一 not found。
- 操作失败必须保留用户输入并显示 retryable 状态。

### Task 1: Inspector 数据模型与选择状态

**Files:**
- Create: `frontend/components/graph/graph-inspector.tsx`
- Create: `frontend/lib/graph-inspector.ts`
- Modify: `frontend/pages/graph-page.tsx`
- Test: `test/unit/frontend-graph-inspector.test.tsx`

- [ ] **Step 1:** 写测试覆盖节点类型、状态、href、metadata 和空选择。
- [ ] **Step 2:** 运行 `rtk npx vitest run test/unit/frontend-graph-inspector.test.tsx`，确认失败。
- [ ] **Step 3:** 实现严格的 Inspector model，未知字段使用 `COMMON_VALUE_UNAVAILABLE`，禁止渲染 `undefined`。
- [ ] **Step 4:** 重新运行 focused test，确认通过。
- [ ] **Step 5:** 提交 `git commit -m "feat: add graph inspector"`。

### Task 2: Evidence Path

**Files:**
- Create: `frontend/components/graph/graph-evidence-panel.tsx`
- Modify: `frontend/lib/knowledge-reader-data.ts` only for shared citation normalizer if required
- Modify: `frontend/pages/graph-page.tsx`
- Test: `test/unit/frontend-graph-evidence.test.tsx`
- Test: `test/worker/graph-evidence.test.ts`

- [ ] **Step 1:** 写测试：授权 citation 显示 source/chunk/location；缺失 citation 显示证据缺口；跨成员 citation 返回 404。
- [ ] **Step 2:** 运行 focused frontend/Worker tests，确认失败。
- [ ] **Step 3:** 实现边选择 → citation panel → Reader 深链；复用现有 citation API，不返回来源正文到 graph snapshot。
- [ ] **Step 4:** 运行 `rtk npx vitest run test/unit/frontend-graph-evidence.test.tsx test/worker/graph-evidence.test.ts --pool=workers`。
- [ ] **Step 5:** 提交 `git commit -m "feat: add graph evidence path"`。

### Task 3: Graph to Action

**Files:**
- Create: `frontend/lib/graph-actions.ts`
- Modify: `frontend/pages/graph-page.tsx`
- Modify: `frontend/lib/projects-data.ts`
- Modify: `frontend/lib/tasks-data.ts`
- Modify: `frontend/lib/focus-data.ts`
- Test: `test/unit/frontend-graph-actions.test.ts`
- Test: `test/worker/graph-actions.test.ts`

- [ ] **Step 1:** 写测试覆盖 knowledge→task、decision→action item、task→focus、project→timeline，以及重复 client key。
- [ ] **Step 2:** 运行 focused tests，确认失败。
- [ ] **Step 3:** 实现 action dispatcher：根据节点类型调用现有 API；将 client key 由浏览器生成一次并保留到重试结束；不接受客户端 memberId。
- [ ] **Step 4:** 运行 `rtk npx vitest run test/unit/frontend-graph-actions.test.ts test/worker/graph-actions.test.ts --pool=workers`。
- [ ] **Step 5:** 提交 `git commit -m "feat: add graph to action workflows"`。

### Task 4: 键盘、命令和移动端闭环

**Files:**
- Modify: `frontend/components/graph/graph-canvas.tsx`
- Modify: `frontend/components/graph/graph-inspector.tsx`
- Modify: `frontend/pages/graph-page.tsx`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/frontend-graph-a11y.test.tsx`

- [ ] **Step 1:** 写测试覆盖 Tab → 节点列表 → Inspector → action button 的顺序和 focus-visible。
- [ ] **Step 2:** 运行测试，确认失败。
- [ ] **Step 3:** 实现 Escape 清除选择、Enter 打开 Inspector、箭头键切换列表、窄屏隐藏画布但保留列表。
- [ ] **Step 4:** 运行 `rtk npx vitest run test/unit/frontend-graph-a11y.test.tsx`。
- [ ] **Step 5:** 提交 `git commit -m "feat: make work graph keyboard accessible"`。
