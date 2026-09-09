# Memory Garden 2.0 Workbench Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first executable 2.0 slice: a Personal Workbench SaaS shell that unifies the existing knowledge, AI, task, collaboration, analytics, and administration capabilities without introducing a paid Cloudflare dependency.

**Architecture:** Keep the existing React/Vite/shadcn frontend and Worker/D1/DO backend. Add a shared module registry above the existing route capabilities, compose the workbench overview from existing read APIs, and keep the public 3D Landing Page isolated from the authenticated 2D application shell. P0/P1 use existing data sources; no D1 migration is required for the shell slice.

**Tech Stack:** React, TypeScript, Vite, shadcn-style local primitives, Phosphor icons, Cloudflare Workers, D1, Durable Objects, Vitest, React server-render tests, and existing i18n runtime.

**Spec:** `docs/product/memory-garden-2.0-product-definition.md`, `docs/product/memory-garden-2.0-roadmap.md`, `docs/product/memory-garden-2.0-checklist.md`

## Global Constraints

- 产品母体必须是个人工作台 SaaS，AI 知识库是其中的核心模块。
- 登录后的 2D 工作台是权威产品；匿名 3D 只用于 Landing Page 自动演示。
- 必须在 Cloudflare 免费服务范围内完成，不新增固定成本。
- 不新增 R2、Vectorize、Queues、第三方分析 SaaS 或外部模型服务依赖。
- 保持 GitHub OAuth 白名单、admin/contributor、服务端菜单过滤和现有权限位图。
- 所有用户可见文案必须使用 i18n；不得渲染 `undefined` 或内部 key。
- 每个 UI 任务必须有渲染测试，并使用浏览器验证登录后和未登录状态。
- 使用 `rtk` 前缀执行命令；使用 `apply_patch` 编辑文本文件；不推送远程。

---

## 文件边界

### 新建

- `shared/workbench-modules.ts`：一级工作台模块、模块标签、入口路径和模块排序的唯一静态契约。
- `frontend/lib/workbench-data.ts`：从既有 API 结果构建工作台摘要的纯函数和请求编排器。
- `frontend/components/shell/command-palette.tsx`：命令面板的展示与键盘交互。
- `frontend/lib/command-palette.ts`：命令项类型、过滤和路由命令构造。
- `frontend/components/shell/context-rail.tsx`：通用右侧上下文操作栏。
- `test/unit/workbench-modules.test.ts`：模块注册表和排序测试。
- `test/unit/workbench-data.test.ts`：工作台摘要归一化和错误降级测试。
- `test/unit/command-palette.test.ts`：命令过滤、快捷键和路由构造测试。
- `test/unit/frontend-workbench-home.test.tsx`：工作台首页渲染和交互测试。

### 修改

- `shared/workspace-route-capabilities.ts`：为已有路由增加 `moduleKey` 和模块入口映射，保持现有 `group` 兼容。
- `frontend/lib/navigation-data.ts`：消费模块映射，同时保留服务端树和权限过滤。
- `frontend/components/shell/app-shell.tsx`：接入模块分组、命令面板、上下文栏和移动端降级。
- `frontend/pages/home-page.tsx`：从旧的三张统计卡升级为工作台总览。
- `frontend/app.tsx`：接入工作台摘要请求、命令面板动作和路由状态。
- `frontend/lib/i18n.ts`：添加所有工作台 Shell、模块和状态文案。
- `test/unit/frontend-shell.test.tsx`：补齐模块导航、命令面板和右侧栏契约。
- `test/unit/frontend-navigation-data.test.ts`：补齐模块字段的服务端树解析和降级行为。
- `test/unit/workspace-dashboard.test.tsx`：保留旧首页数据契约并迁移到新总览。
- `test/unit/frontend-i18n.test.ts`：增加新 key 的双语和 placeholder 检查。

### 不在本计划内

- Inbox、Goal、Project、Calendar、Meeting 的 D1 数据模型和业务 API；这些属于 P2 独立计划。
- 新的统计维度、外部连接器、Agent 自动化和 R2 原件存储。
- 3D Landing Page 的 Blender/GLB 资产工作；已有独立设计与实现计划负责。
- 生产部署、远程 migration、域名路由和 secrets 更新。

---

## Task 1: 建立 Personal Workbench 模块契约

**Files:**
- Create: `shared/workbench-modules.ts`
- Modify: `shared/workspace-route-capabilities.ts`
- Test: `test/unit/workbench-modules.test.ts`
- Test: `test/unit/frontend-navigation-data.test.ts`

**Interfaces:**

```ts
export type WorkbenchModuleKey =
  | "workbench" | "knowledge" | "work" | "collaboration" | "assets" | "data" | "admin";

export interface WorkbenchModuleDefinition {
  key: WorkbenchModuleKey;
  labelKey: string;
  entryPath: string;
  order: number;
  adminOnly?: boolean;
}

export const WORKBENCH_MODULES: readonly WorkbenchModuleDefinition[];
export function moduleForPath(pathname: string): WorkbenchModuleDefinition | undefined;
```

- `shared/workspace-route-capabilities.ts` 的 `WorkspaceRouteCapability` 增加 `moduleKey: WorkbenchModuleKey`。
- 未迁移的现有路径统一映射到 `workbench`、`knowledge`、`work`、`collaboration` 或 `admin`；不得修改既有 capability 判断。
- `frontend/lib/navigation-data.ts` 继续拒绝非法深度、非法 `labelKey`、非法 `path` 和未知权限结构。

- [ ] **Step 1: 写失败测试**：断言所有现有 ready 路由都有合法 `moduleKey`，模块入口唯一且顺序稳定。
- [ ] **Step 2: 运行测试确认失败**：

```bash
rtk npx vitest run test/unit/workbench-modules.test.ts test/unit/frontend-navigation-data.test.ts
```

预期：缺少模块注册表或 `moduleKey` 字段时失败。

- [ ] **Step 3: 实现最小契约**：新增 `WORKBENCH_MODULES`、`moduleForPath`，为现有路由补齐字段；不引入数据库迁移。
- [ ] **Step 4: 运行测试确认通过**：同一命令输出全部 PASS。
- [ ] **Step 5: 提交**：

```bash
rtk git add shared/workbench-modules.ts shared/workspace-route-capabilities.ts test/unit/workbench-modules.test.ts test/unit/frontend-navigation-data.test.ts
rtk git commit -m "feat: add workbench module registry"
```

## Task 2: 构建工作台摘要数据适配器

**Files:**
- Create: `frontend/lib/workbench-data.ts`
- Test: `test/unit/workbench-data.test.ts`
- Modify: `frontend/app.tsx`

**Interfaces:**

```ts
export interface WorkbenchSummary {
  taskCount: number;
  overdueTaskCount: number;
  recentKnowledge: readonly { id: string; title: string; summary: string }[];
  recentActivity: readonly { id: string; label: string; href: string | null; createdAt: string }[];
  quickActions: readonly { id: string; href: string; labelKey: string }[];
}

export function buildWorkbenchSummary(input: {
  tasks?: readonly TaskItem[];
  knowledge?: readonly RecentKnowledgeItem[];
  activity?: readonly WorkspaceActivityItem[];
}): WorkbenchSummary;
```

- 所有缺失数组默认空数组；缺失标题使用 `KNOWLEDGE_UNTITLED` 的显示层回退，不向组件传递 `undefined`。
- 日期只在展示层格式化；纯函数保持可测试。
- 请求失败时返回 `PageState` 可消费的错误对象，不让一个模块失败导致整个 App 崩溃。

- [ ] **Step 1: 写失败测试**：覆盖空输入、缺失标题、逾期任务计数、活动链接和稳定排序。
- [ ] **Step 2: 运行测试确认失败**：

```bash
rtk npx vitest run test/unit/workbench-data.test.ts
```

- [ ] **Step 3: 实现 `buildWorkbenchSummary`**，只组合已有 `tasks-data`、`knowledge-data` 和 `activity-data` 的结果类型。
- [ ] **Step 4: 接入 `app.tsx` 的首页加载**，保留旧 API controller 的取消和过期响应保护。
- [ ] **Step 5: 运行测试确认通过**：

```bash
rtk npx vitest run test/unit/workbench-data.test.ts test/unit/workspace-dashboard.test.tsx
```

- [ ] **Step 6: 提交**：

```bash
rtk git add frontend/lib/workbench-data.ts frontend/app.tsx test/unit/workbench-data.test.ts test/unit/workspace-dashboard.test.tsx
rtk git commit -m "feat: compose workbench overview data"
```

## Task 3: 重构工作台首页

**Files:**
- Modify: `frontend/pages/home-page.tsx`
- Create: `test/unit/frontend-workbench-home.test.tsx`
- Modify: `frontend/lib/i18n.ts`

**Interfaces:**

```tsx
export type WorkbenchHomeState =
  | { kind: "loading" }
  | { kind: "ready"; summary: WorkbenchSummary }
  | { kind: "error"; message: string };

export function HomePage(props: {
  state: WorkbenchHomeState;
  locale?: LocaleRuntime;
  onCommand?: (commandId: string) => void;
}): JSX.Element;
```

- 页面区块固定为：今日摘要、收件箱入口、任务、最近知识、活动时间线、AI 入口、快速操作。
- 快速操作只链接已有真实路由：`/submit`、`/tasks`、`/knowledge`、`/search`、`/agent`。
- 空状态必须有可操作 CTA；错误状态必须显示 retry；所有用户文案来自 i18n。
- 不在首页引入新 D1 表，不模拟未实现的 Inbox/Goal/Project 数据。

- [ ] **Step 1: 写失败渲染测试**：验证标题、七个区域、空状态、错误状态、快速操作链接和无 `undefined`。
- [ ] **Step 2: 运行测试确认失败**：

```bash
rtk npx vitest run test/unit/frontend-workbench-home.test.tsx
```

- [ ] **Step 3: 重写 `HomePage`**，使用现有 shadcn Card、Badge、Button、PageState，保持响应式布局。
- [ ] **Step 4: 添加中英文 i18n key**，key 使用 `WORKBENCH_*` 命名，不把英文文案写入 JSX。
- [ ] **Step 5: 运行测试确认通过**：

```bash
rtk npx vitest run test/unit/frontend-workbench-home.test.tsx test/unit/frontend-i18n.test.ts
```

- [ ] **Step 6: 提交**：

```bash
rtk git add frontend/pages/home-page.tsx frontend/lib/i18n.ts test/unit/frontend-workbench-home.test.tsx
rtk git commit -m "feat: redesign authenticated workbench home"
```

## Task 4: 接入全局命令面板

**Files:**
- Create: `frontend/lib/command-palette.ts`
- Create: `frontend/components/shell/command-palette.tsx`
- Modify: `frontend/components/shell/app-shell.tsx`
- Modify: `frontend/app.tsx`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/command-palette.test.ts`
- Modify: `test/unit/frontend-shell.test.tsx`

**Interfaces:**

```ts
export interface CommandPaletteItem {
  id: string;
  labelKey: string;
  keywords: readonly string[];
  href?: string;
  action?: "create-note" | "create-task" | "ask-ai" | "toggle-theme" | "logout";
  capability?: string;
}

export function filterCommands(items: readonly CommandPaletteItem[], query: string): CommandPaletteItem[];
export function defaultCommands(session: SessionSnapshot): readonly CommandPaletteItem[];
```

- `Cmd/Ctrl+K` 打开；`Escape` 关闭；上下键移动；Enter 执行；输入为空显示按模块分组的常用命令。
- 需要权限的命令必须使用现有 session capability/permission mask 过滤。
- `create-note`、`create-task` 在 P1 只跳转到真实页面，不直接写 API。
- 命令面板不能绕过路由权限或调用管理员接口。

- [ ] **Step 1: 写失败纯函数测试**：大小写、中文 label、关键词、权限过滤和稳定排序。
- [ ] **Step 2: 运行测试确认失败**：

```bash
rtk npx vitest run test/unit/command-palette.test.ts
```

- [ ] **Step 3: 实现命令模型和过滤函数**。
- [ ] **Step 4: 实现可访问 Dialog/Command UI**，复用现有 `Dialog`、`Button`、`Input`，不引入新的 UI 依赖。
- [ ] **Step 5: 接入 `AppShell` 和 `app.tsx`**，验证路由跳转、主题切换和 logout 仍复用现有 handlers。
- [ ] **Step 6: 运行测试确认通过**：

```bash
rtk npx vitest run test/unit/command-palette.test.ts test/unit/frontend-shell.test.tsx
```

- [ ] **Step 7: 提交**：

```bash
rtk git add frontend/lib/command-palette.ts frontend/components/shell/command-palette.tsx frontend/components/shell/app-shell.tsx frontend/app.tsx frontend/lib/i18n.ts test/unit/command-palette.test.ts test/unit/frontend-shell.test.tsx
rtk git commit -m "feat: add workbench command palette"
```

## Task 5: 统一模块导航和右侧上下文栏

**Files:**
- Create: `frontend/components/shell/context-rail.tsx`
- Modify: `frontend/components/shell/app-shell.tsx`
- Modify: `frontend/lib/navigation-data.ts`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/frontend-shell.test.tsx`
- Test: `test/unit/frontend-navigation-data.test.ts`

**Interfaces:**

```tsx
export function ContextRail(props: {
  pathname: string;
  locale: LocaleRuntime;
  collapsed?: boolean;
  onClose?: () => void;
}): JSX.Element;
```

- 左侧显示模块入口和当前模块子项；右侧只显示当前路由允许的上下文操作。
- 个人用户不渲染 Admin 模块；服务端返回的 coming-soon 节点只能展示禁用态，不能伪装成可用页面。
- 移动端使用 Sheet；桌面端使用可折叠 rail；键盘焦点顺序为顶部栏 → 左导航 → 主内容 → 右侧栏。
- 继续保持导航树最大深度 4 和已有 `navigation-data` fail-closed 行为。

- [ ] **Step 1: 写失败渲染测试**：管理员/普通成员模块差异、当前模块标记、上下文栏关闭和移动端 Sheet。
- [ ] **Step 2: 运行测试确认失败**：

```bash
rtk npx vitest run test/unit/frontend-shell.test.tsx test/unit/frontend-navigation-data.test.ts
```

- [ ] **Step 3: 实现 `ContextRail`**，只消费 `pathname` 和 locale，不直接请求 API。
- [ ] **Step 4: 让 `AppShell` 使用 `moduleForPath` 和服务端导航树**，保留管理员 direct-path 403。
- [ ] **Step 5: 增加中英文模块和右侧栏文案**。
- [ ] **Step 6: 运行测试确认通过**。
- [ ] **Step 7: 提交**：

```bash
rtk git add frontend/components/shell/context-rail.tsx frontend/components/shell/app-shell.tsx frontend/lib/navigation-data.ts frontend/lib/i18n.ts test/unit/frontend-shell.test.tsx test/unit/frontend-navigation-data.test.ts
rtk git commit -m "feat: group workbench navigation by module"
```

## Task 6: P0/P1 门禁与浏览器验收

**Files:**
- Modify: `docs/product/memory-garden-2.0-checklist.md`
- Modify: `docs/product/delivery-status-ledger.md` only if the existing ledger has a matching P0/P1 row.
- Test: existing frontend and worker suites.

- [ ] **Step 1: 运行静态与类型门禁**：

```bash
rtk npm run typecheck
rtk npm run verify:i18n
rtk npm run verify:m1:docs
```

- [ ] **Step 2: 运行新增定向测试**：

```bash
rtk npx vitest run test/unit/workbench-modules.test.ts test/unit/workbench-data.test.ts test/unit/frontend-workbench-home.test.tsx test/unit/command-palette.test.ts test/unit/frontend-shell.test.tsx test/unit/frontend-navigation-data.test.ts
```

- [ ] **Step 3: 运行完整前端构建和单元测试**：

```bash
rtk npm run build
rtk npm run test:unit
```

- [ ] **Step 4: 使用浏览器验证未登录 Landing Page → GitHub 登录入口 → 登录后工作台；验证命令面板、模块导航、主题、语言、退出和 403 direct path。**
- [ ] **Step 5: 仅在证据齐全时更新 checklist 的 P0/P1 条目；不得用截图替代 API 权限或错误状态证据。**
- [ ] **Step 6: 提交文档和验收记录**：

```bash
rtk git add docs/product/memory-garden-2.0-checklist.md docs/product/delivery-status-ledger.md
rtk git commit -m "docs: record workbench core acceptance"
```

## 计划自审

- P0/P1 只消费已有数据接口，不提前引入 Inbox、Goal、Project、Calendar 的 D1 迁移。
- AI 知识库被纳入 `knowledge` 模块，不再占据整个产品导航。
- 3D Landing Page 保持匿名、静态演示、无真实数据、无额外付费服务；不与认证工作台耦合。
- 所有新增 UI 任务均包含 i18n、无 `undefined`、权限隔离、响应式和浏览器验收。
- 本计划没有覆盖 P2–P7 的独立子系统；完成 P0/P1 后分别创建工作管理、AI Copilot、协作治理和 Landing Page 验收计划。
