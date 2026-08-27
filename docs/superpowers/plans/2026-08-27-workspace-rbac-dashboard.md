# Memory Garden 工作台与 RBAC 位图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏 GitHub OAuth 和 Cloudflare 免费层边界的前提下，把现有 React/Vite 前端升级为 shadcn 工作台，并加入 AI 知识库一级导航、角色权限位图和管理员菜单树治理。

**Architecture:** 采用兼容演进。先在前端建立可折叠 AppShell 和一级导航，再以版本化权限注册表实现 BigInt/十六进制位图；`capabilities` 继续作为旧合同投影。D1 追加 roles、role_members、menus migration，Worker 服务端重新校验 active member 和权限，前端仅消费已过滤菜单树。

**Tech Stack:** React 19, Vite 8, TypeScript, Tailwind CSS v4, shadcn/ui New York 本地组件, Phosphor icons, Cloudflare Workers, D1, Vitest。

**Spec:** `docs/superpowers/specs/2026-08-27-workspace-rbac-dashboard-design.md`

## Global Constraints

- 保留 GitHub OAuth、D1 Session、admin/contributor 角色和现有 `/api/session`、`/auth/github` 合同。
- 仅使用 Cloudflare 免费层；权限权威数据存 D1，不能引入 Redis/KV 作为授权来源。
- 位图以十六进制字符串传输和持久化，服务端用 `bigint` 运算，禁止用 JavaScript `number` 保存完整 mask。
- 所有写路径重新校验 active member、权限和资源范围，并记录安全审计。
- 不修改已发布 migration，只新增 migration。
- 每个任务必须先写失败测试，再实现最小代码，再运行对应测试。

### Task 1: 固化权限注册表与位图工具

**Files:**
- Create: `src/authorization/permission-bitmap.ts`
- Modify: `src/authorization/policy.ts`
- Test: `test/unit/permission-bitmap.test.ts`

**Interfaces:**
- Produces `PERMISSION_BITS`, `permissionMaskFor`, `capabilitiesForMask`, `parsePermissionMask`, `hasPermission`。

- [ ] Step 1: 为 18 个固定权限、未知 key、非法十六进制、越界 bit 和 mask 投影写失败测试。
- [ ] Step 2: 运行 `rtk npx vitest run test/unit/permission-bitmap.test.ts`，确认新测试失败。
- [ ] Step 3: 用 `bigint` 实现注册表、mask 解析、集合投影和稳定排序。
- [ ] Step 4: 将现有 admin/contributor policy 映射到固定 mask，保留原 capabilities 字符串。
- [ ] Step 5: 运行同一测试与 `rtk npm run typecheck`，确认通过。
- [ ] Step 6: 提交 `feat: add permission bitmap compatibility layer`。

### Task 2: AppShell 工作台布局和一级 AI 知识库导航

**Files:**
- Modify: `frontend/components/shell/app-shell.tsx`
- Modify: `frontend/contracts/routes.ts`
- Modify: `frontend/styles/globals.css`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/workspace-shell.test.tsx`

**Interfaces:**
- Consumes `ROUTES`, `SessionSnapshot`, `LocaleRuntime`。
- Produces stable `data-shell-sidebar`, `data-shell-topbar`, `data-nav-group` and route `/knowledge` first-level navigation.

- [ ] Step 1: 写桌面侧栏收起、移动 Sheet、面包屑、语言/用户菜单位置和真实 i18n 文案测试。
- [ ] Step 2: 运行 `rtk npx vitest run test/unit/workspace-shell.test.tsx`，确认失败。
- [ ] Step 3: 用现有 shadcn Button/Sheet/DropdownMenu 重构 shell，统一 token 和 active ancestor。
- [ ] Step 4: 增加工作台与 AI 知识库导航文案，所有可选字段通过 `displayValue` 回退。
- [ ] Step 5: 运行 shell 测试、`rtk npm run verify:i18n` 和 `rtk npm run typecheck`。
- [ ] Step 6: 提交 `feat: reshape frontend as knowledge workspace shell`。

### Task 3: D1 角色和菜单树 migration

**Files:**
- Create: `migrations/0029_workspace_rbac.sql`
- Create: `src/authorization/menu-tree.ts`
- Test: `test/unit/menu-tree.test.ts`

**Interfaces:**
- Produces `buildMenuTree(rows, mask)` and validation helpers for depth, cycles, required bits and i18n keys。

- [ ] Step 1: 为树排序、权限过滤、孤立父节点、循环、重复 path 和四层限制写失败测试。
- [ ] Step 2: 运行 `rtk npx vitest run test/unit/menu-tree.test.ts`，确认失败。
- [ ] Step 3: 创建 `roles`、`role_members`、`menus` 表，插入 admin/contributor 系统角色和现有导航菜单。
- [ ] Step 4: 实现纯函数树构造和写入校验，禁止修改系统节点。
- [ ] Step 5: 运行 migration verifier、菜单测试和 `rtk npm run typecheck`。
- [ ] Step 6: 提交 `feat: add workspace roles and menu tree schema`。

### Task 4: Session 权限投影与服务端授权门禁

**Files:**
- Modify: `src/identity/session.ts`
- Modify: `src/routes/session.ts`
- Modify: `src/authorization/policy.ts`
- Modify: `frontend/contracts/api.ts`
- Test: `test/unit/session-permission-projection.test.ts`
- Test: `test/worker/session.test.ts`

**Interfaces:**
- `GET /api/session` may return `permissionMask` and `menuTree`; legacy `capabilities` remains unchanged。

- [ ] Step 1: 写 admin/contributor 投影、禁用成员、非法 mask 和旧 payload 兼容测试。
- [ ] Step 2: 运行 `rtk npx vitest run test/unit/session-permission-projection.test.ts test/worker/session.test.ts`，确认失败。
- [ ] Step 3: 从 active member role 生成 mask/capabilities，按权限过滤菜单树。
- [ ] Step 4: 在角色/菜单管理路由统一要求 `role:manage` / `menu:manage`。
- [ ] Step 5: 运行 worker 回归、`rtk npm run typecheck` 和 i18n verifier。
- [ ] Step 6: 提交 `feat: expose permission-aware workspace session`。

### Task 5: 管理员角色权限页面

**Files:**
- Create: `frontend/pages/admin/roles-page.tsx`
- Create: `frontend/lib/admin-roles-data.ts`
- Create: `src/authorization/roles-repository.ts`
- Create: `src/routes/admin-roles.ts`
- Modify: `frontend/app.tsx`
- Modify: `frontend/app-routes.ts`
- Modify: `src/app.ts`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/admin-roles-page.test.tsx`

- [ ] Step 1: 写加载、空、错误、权限矩阵、差异预览和保存禁用态测试。
- [ ] Step 2: 运行测试确认失败。
- [x] Step 3: 实现角色列表、权限分组 checkbox、十六进制 mask 预览和保存确认。
- [x] Step 4: 实现 D1 roles/role_members 查询与更新 API，服务端要求 `role:manage` 并记录审计。
- [x] Step 5: 接入 `/admin/roles` 路由和 admin capability guard。
- [x] Step 6: 运行页面/Worker 测试、类型检查和 WCAG 合同。
- [ ] Step 7: 提交 `feat: add admin role permission matrix`。

### Task 6: 管理员菜单树页面与 API

**Files:**
- Create: `frontend/pages/admin/menus-page.tsx`
- Create: `frontend/lib/admin-menus-data.ts`
- Create: `src/routes/admin-menus.ts`
- Modify: `src/app.ts`
- Modify: `frontend/app.tsx`
- Modify: `frontend/app-routes.ts`
- Test: `test/unit/admin-menus-page.test.tsx`
- Test: `test/worker/admin-menus.test.ts`

- [x] Step 1: 写 contributor 403、admin 树读取、排序移动、启停和循环拒绝测试。
- [x] Step 2: 运行 worker/page 测试确认失败。
- [x] Step 3: 实现菜单树读取、排序/启停/可见性更新 API 和服务端结构校验。
- [x] Step 4: 接入 `/admin/menus` 工作台页面与 `menu:manage` guard。
- [x] Step 5: 运行菜单 Worker/page/typecheck 回归；创建/删除操作保留到下一切片。
- [ ] Step 3: 实现 D1 查询、树构造、move/toggle API 和审计事件。
- [ ] Step 4: 实现树形页面、父子层级、位置移动、启停和系统节点保护。
- [ ] Step 5: 运行 `rtk npx vitest run test/worker/admin-menus.test.ts test/unit/admin-menus-page.test.tsx`、typecheck、i18n/WCAG。
- [ ] Step 6: 提交 `feat: add admin menu tree governance`。

### Task 7: 工作台首页和统一页面状态

**Files:**
- Modify: `frontend/pages/home-page.tsx`
- Modify: `frontend/pages/knowledge-page.tsx`
- Modify: `frontend/pages/admin/admin-dashboard-page.tsx`
- Modify: `frontend/components/ui/page-state.tsx`
- Test: `test/unit/workspace-dashboard.test.tsx`

- [ ] Step 1: 写指标卡、最近内容、快捷入口、empty/error/loading 和 undefined 扫描测试。
- [ ] Step 2: 运行测试确认失败。
- [ ] Step 3: 实现工作台摘要、AI 知识库入口、最近活动和管理员摘要。
- [ ] Step 4: 统一 PageState、表格、筛选和按钮状态，移除英文 `NAV_*` 以及 undefined 泄漏。
- [ ] Step 5: 运行前端单测、`rtk npm run typecheck`、`rtk npm run verify:i18n`、`rtk npm run verify:wcag`。
- [ ] Step 6: 提交 `feat: complete workspace dashboard states`。

### Task 8: 独立站点统计菜单与管理员看板

**Files:**
- Modify: `frontend/contracts/routes.ts`
- Modify: `frontend/pages/admin/analytics-page.tsx`
- Modify: `frontend/lib/admin-analytics-data.ts`
- Modify: `frontend/lib/i18n.ts`
- Modify: `src/routes/admin.ts`
- Test: `test/unit/admin-analytics-page.test.tsx`
- Test: `test/worker/analytics.test.ts`

**Interfaces:**
- Consumes `GET /api/admin/analytics/overview?days=1..31` and existing `POST /api/telemetry/pageview`.
- Produces admin-only `NAV_SITE_ANALYTICS` route, totals, daily rows, range filter and safe empty/error/loading states.

- [ ] Step 1: 写 contributor 403、admin aggregation、5-minute dedupe、empty/error/loading 和无敏感字段响应测试。
- [ ] Step 2: 运行 `rtk npx vitest run test/unit/admin-analytics-page.test.tsx test/worker/analytics.test.ts`，确认失败。
- [ ] Step 3: 将 `/admin/analytics` 菜单文案改为 `NAV_SITE_ANALYTICS`，权限切换到 `analytics:read` 并保留旧 policy 投影。
- [ ] Step 4: 完善站点统计页面的访问量、独立访客、登录用户和按日趋势展示，所有数值非法时归一化为 0。
- [ ] Step 5: 运行页面/Worker 测试、`rtk npm run typecheck`、`rtk npm run verify:i18n` 和 `rtk npm run verify:wcag`。
- [ ] Step 6: 提交 `feat: add admin-only site analytics workspace menu`。

### Task 9: 集成验证与发布证据

**Files:**
- Modify: `ROADMAP.md`
- Modify: `docs/product/ai-knowledge-base-checklist.md`
- Create: `docs/operations/workspace-rbac-release-checklist.md`

- [ ] Step 1: 运行 `rtk npm run typecheck`。
- [ ] Step 2: 运行权限、菜单、session、shell、页面和 worker 测试集合。
- [ ] Step 3: 运行 `rtk npm run verify:i18n`、`rtk npm run verify:wcag`、`rtk npm run build`。
- [ ] Step 4: 运行现有 GitHub OAuth、退出登录、disabled contributor 和 API 403 回归。
- [ ] Step 5: 记录版本 ID、脱敏 request ID 和未完成的生产 migration，不把本地证据冒充远程证据。
- [ ] Step 6: 提交 `docs: add workspace rbac release evidence checklist`。
