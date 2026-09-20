# Temporal Graph、AI 编排与发布闸门 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加工作图时间变化、AI 建议和最终质量闸门，使图谱能支持项目复盘与下一步工作建议。

**Architecture:** 时间过滤优先使用现有 `created_at/updated_at/starts_at/due_at`，不新增图数据库；AI 复用现有 Workers AI 适配器和 citation 约束，输出 suggestion/draft；发布阶段只补合同和证据，不隐含远程迁移或生产部署。

**Tech Stack:** Cloudflare D1、Workers AI、React、TypeScript、Vitest、Node test、Vite。

**Spec:** `docs/superpowers/specs/2026-09-17-personal-ai-work-graph-design.md`

## Global Constraints

- 时间查询必须继续绑定 `member_id`，默认 7 天、最大 90 天。
- AI 建议必须带 citation 或明确 evidence gap。
- AI 不自动写入业务对象，promotion 由用户确认。
- 不新增付费服务，不执行生产 migration/deploy。

### Task 1: 时间范围与关系变化

**Files:**
- Modify: `src/graph/types.ts`
- Modify: `src/graph/service.ts`
- Modify: `src/routes/graph.ts`
- Modify: `frontend/lib/graph-data.ts`
- Modify: `frontend/pages/graph-page.tsx`
- Test: `test/unit/graph-temporal-service.test.ts`
- Test: `test/worker/graph-temporal.test.ts`

- [x] **Step 1:** 写测试覆盖 `from/to`、默认 7 天、最大 90 天、跨成员时间对象不可见。
- [ ] **Step 2:** 运行 focused tests，确认失败。未保留独立 red-run 证据；最终 focused 与回归结果已记录。
- [x] **Step 3:** 增加严格时间参数、稳定排序和 `changeKind: added|updated|completed|archived`，只返回有权对象。
- [x] **Step 4:** 运行 `rtk npx vitest run test/unit/graph-temporal-service.test.ts test/worker/graph-temporal.test.ts --pool=workers`。
- [x] **Step 5:** 提交 `git commit -m "feat: add temporal work graph filters"`。

### Task 2: 现有 Mindmap 与 Graph DTO 适配

**Files:**
- Create: `src/graph/mindmap-adapter.ts`
- Modify: `src/ai/mindmap-service.ts` only for exported adapter types if necessary
- Test: `test/unit/graph-mindmap-adapter.test.ts`
- Test: `test/worker/graph-mindmap.test.ts`

- [ ] **Step 1:** 写测试覆盖节点/边 citation、未知 endpoint、证据不足和成员权限。
- [ ] **Step 2:** 运行 focused tests，确认失败。
- [ ] **Step 3:** 将 MindmapResult 转为 `kind=knowledge` 和 `kind=derived` 的 GraphNode/GraphEdge；无 citation 的关系转为 evidence gap，不作为事实边。
- [ ] **Step 4:** 运行 `rtk npx vitest run test/unit/graph-mindmap-adapter.test.ts test/worker/graph-mindmap.test.ts --pool=workers`。
- [ ] **Step 5:** 提交 `git commit -m "feat: adapt grounded mindmap to work graph"`。

### Task 3: AI 工作建议

**Files:**
- Create: `src/graph/ai-suggestions.ts`
- Create: `src/routes/graph-suggestions.ts`
- Modify: `src/app.ts`
- Create: `frontend/lib/graph-suggestions.ts`
- Modify: `frontend/pages/graph-page.tsx`
- Test: `test/unit/graph-ai-suggestions.test.ts`
- Test: `test/worker/graph-suggestions.test.ts`

- [ ] **Step 1:** 写测试覆盖会议→决策、决策→行动项、任务→知识建议和 AI unavailable。
- [ ] **Step 2:** 运行 focused tests，确认失败。
- [ ] **Step 3:** 实现严格 JSON schema、5 秒超时、最多 8 条建议、每条 suggestion 的 citationIds 和 `promotionRequired=true`；不执行写入。
- [ ] **Step 4:** 运行 `rtk npx vitest run test/unit/graph-ai-suggestions.test.ts test/worker/graph-suggestions.test.ts --pool=workers`。
- [ ] **Step 5:** 提交 `git commit -m "feat: add grounded graph suggestions"`。

### Task 4: 性能、无障碍和完整回归

**Files:**
- Modify: `scripts/frontend-app-contract.test.mjs`
- Modify: `scripts/formal-pagination-contract.test.mjs`
- Modify: `scripts/wcag-contract.mjs`
- Create: `docs/evidence/YYYY-MM-DD-work-graph-release-readiness.md`
- Modify: `ROADMAP.md`
- Modify: `docs/product/delivery-status-ledger.md`

- [ ] **Step 1:** 添加动态 Cytoscape chunk、节点/边上限、生命周期销毁、无 `undefined` 和 i18n 合同。
- [ ] **Step 2:** 添加 graph API owner predicate、cursor、隐藏对象不泄漏、AI evidence gap 合同。
- [ ] **Step 3:** 运行完整闸门：

```bash
rtk npm run typecheck
rtk npm run test:unit
rtk npm run test:worker
rtk npm run build
rtk npm run test:smoke
```

- [ ] **Step 4:** 记录本地证据，明确未执行远程 migration、生产部署和 `SECRETS_FILE` 操作。
- [ ] **Step 5:** 提交 `git commit -m "docs: record work graph release readiness"`。
