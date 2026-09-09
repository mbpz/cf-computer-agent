# Memory Garden 2.0 原子 Checklist

状态说明：`[ ]` 未完成；`[R]` 保留现有能力并纳入新工作台；`[N]` 新能力；`[I]` 集成或回归。

权威规格：[memory-garden-2.0-product-definition.md](./memory-garden-2.0-product-definition.md)

## P0 产品内核

- [ ] `MG2-P0-001` 固化 Personal Work OS 产品定位。
- [ ] `MG2-P0-002` 固化个人用户、普通成员、管理员边界。
- [ ] `MG2-P0-003` 固化 Workspace、Space、InboxItem、Goal、Project、Task、KnowledgeItem、Asset、Conversation、ActivityEvent 对象。
- [ ] `MG2-P0-004` 固化目标、项目、任务、知识、收件箱状态机。
- [ ] `MG2-P0-005` 固化对象关系和导航规则。
- [ ] `MG2-P0-006` 固化服务端菜单和权限矩阵。
- [ ] `MG2-P0-007` 固化 AI 输出来源、置信度和缺口契约。
- [ ] `MG2-P0-008` 固化 Cloudflare 免费层资源边界。
- [ ] `MG2-P0-009` 固化 2D 主产品与 3D 可选展示边界。

## P1 工作台 Shell

- [I] `MG2-P1-001` 工作台首页路由和主布局。
- [I] `MG2-P1-002` 顶部栏：搜索、命令中心、语言、主题、用户菜单。
- [I] `MG2-P1-003` 一级导航和服务端菜单过滤。
- [I] `MG2-P1-004` 统一右侧上下文栏。
- [I] `MG2-P1-005` 页面标题、面包屑和返回行为。
- [I] `MG2-P1-006` 空状态组件。
- [I] `MG2-P1-007` 加载状态组件。
- [I] `MG2-P1-008` 错误状态组件。
- [I] `MG2-P1-009` `Cmd/Ctrl + K` 命令面板。
- [I] `MG2-P1-010` 全量中英文文案和占位符校验。
- [I] `MG2-P1-011` 深色、浅色和减少动态效果。
- [I] `MG2-P1-012` 移动端降级和键盘导航。
- [ ] `MG2-P1-013` 未登录入口与登录后回跳。
- [ ] `MG2-P1-014` 退出后服务端会话失效与前端状态清理。

### P1 本地集成证据（2026-09-09）

- 工作树分支：`codex/memory-garden-2.0-workbench-core`；生产、main、远程 D1 和 secrets 均未在本阶段修改。
- 实现提交：`ee0b052` 模块契约、`6242104` 摘要适配器、`b1c4b8c` 工作台首页、`640d292` 命令面板、`35bf956` 模块导航与上下文栏。
- 验证：`rtk npm run typecheck`、`rtk npm run verify:i18n`、`rtk npm run verify:m1:docs`、`rtk npm run test:unit`（191 files / 1741 tests）、`rtk npm run build` 全部通过。
- 范围边界：`[I]` 只表示当前隔离工作树的本地实现和回归；仍需后续 main 集成、Cloudflare 部署、生产 smoke、signed browser 和真实辅助技术验收后，才能将对应 release/acceptance 状态提升为 `done`。

## P2 收件箱与个人工作

- [I] `MG2-P2-001` InboxItem 数据模型和列表。
- [I] `MG2-P2-002` 快速文本输入。
- [ ] `MG2-P2-003` 链接和文件输入。
- [ ] `MG2-P2-004` AI 结果转 InboxItem。
- [ ] `MG2-P2-005` InboxItem 转知识。
- [I] `MG2-P2-006` InboxItem 转任务。
- [ ] `MG2-P2-007` InboxItem 转项目。
- [ ] `MG2-P2-008` InboxItem 转日程。
- [I] `MG2-P2-009` Goal 创建、编辑、归档和进度。
- [I] `MG2-P2-010` Project 创建、编辑、状态和成员。
- [ ] `R MG2-P2-011` 保留当前任务 CRUD、状态、优先级、标签和知识关联。
- [I] `MG2-P2-012` 任务子项和依赖。
- [ ] `MG2-P2-013` 任务列表、看板、时间线和日历视图。
- [ ] `MG2-P2-014` 内部日程和时间块。
- [ ] `MG2-P2-015` 今日视图和专注模式。
- [ ] `MG2-P2-016` 每日/每周复盘。

### P2-A Inbox 本地集成证据（2026-09-09）

- 工作树分支：`codex/memory-garden-2.0-workbench-core`；未修改 main、生产 D1、生产 Worker 或 `SECRETS_FILE`。
- 后端提交：`73ce141`，包含 `0038_workbench_inbox.sql`、owner-scoped D1 repository/service/route、幂等 client key、opaque cursor、归档/恢复和显式转任务。
- 前端同一工作树已接入 `/inbox`、中英文文案、快速文本/链接收集、归档/恢复、转任务和加载更多；Inbox 知识 promotion、文件原件持久化仍未完成，不能标记为已实现。
- 验证：Inbox 单元/worker/route 测试 10 项通过；Inbox 前端静态渲染测试 2 项通过；`rtk npm run typecheck`、`rtk npm run verify:i18n`、路由契约测试通过；此前完整 `rtk npm run build` dry-run 已通过。
- 边界：`[I]` 仅代表当前隔离工作树的本地证据，待本地完整回归、main 集成、Cloudflare 部署、生产 smoke 和 signed browser 验收后再提升发布状态。

### P2-B Goal 本地集成证据（2026-09-09）

- 工作树分支：`codex/memory-garden-2.0-workbench-core`；未修改 main、生产 D1、生产 Worker 或 `SECRETS_FILE`。
- 实现提交：`53f0b11`（`0039_workbench_goals.sql` 与迁移契约）、`5094fdb`（owner-scoped Goal repository/service）、`dbc4950`（`/api/goals` Worker 路由与 app wiring）；当前工作树继续包含 Goals 页面、双语菜单和本地验证改动。
- 已验证：Goal migration worker 4 项、service 3 项、route 3 项、frontend SSR 2 项；`rtk npm run typecheck`、`rtk npm run verify:i18n`、`rtk npm run verify:m1:migrations -- --files` 通过。
- 范围：Goal 创建、编辑、状态（active/paused/completed/archived）、进度、归档/恢复、成员隔离、幂等 client key、opaque cursor 和 `/goals` 页面已完成本地集成；Goal 与 Project/Task 的关联、生产 migration、部署、signed browser 仍 pending。

### P2-B Project 本地集成证据（2026-09-09）

- 工作树分支：`codex/memory-garden-2.0-workbench-core`；未修改 main、生产 D1、生产 Worker 或 `SECRETS_FILE`。
- 实现提交：`dd8ce4b`（`0040_workbench_projects.sql`、项目表、目标/任务关系表和 migration contract）、`95467f4`（Project repository/service、成员隔离、幂等关系和有界摘要）、`393664b`（`/api/projects` 路由与 Worker wiring）、`124008c`（`/projects` 页面、导航和双语文案）。
- 已验证：Project migration 4 项、service 3 项、route 3 项、frontend SSR 2 项；`rtk npm run typecheck`、`rtk npm run verify:i18n` 通过。
- 范围：Project 创建、编辑、状态、归档/恢复、进度摘要、Goal/Task owner 校验、关系幂等和有界页面已完成本地集成；成员管理、时间线、会议、生产 migration、部署与 signed browser 仍 pending。

### P2-C C1 任务结构本地集成证据（2026-09-09）

- 工作树分支：`codex/memory-garden-2.0-workbench-core`；未修改 main、生产 D1、生产 Worker 或 `SECRETS_FILE`。
- 实现：`0041_workbench_task_structure.sql`、`src/tasks/structure.ts`、`src/tasks/repository.ts`、`src/tasks/service.ts`、`src/routes/tasks.ts`。
- 已验证：子任务成员隔离、位置唯一性、依赖自环拒绝、跨成员依赖拒绝、关系幂等；任务 service 16 项、C1 worker migration 2 项、typecheck 通过。
- 范围：当前为后端/数据契约本地集成；任务页面交互、Calendar、Today、Focus、Review、生产 migration、部署与 signed browser 仍 pending。

## P3 知识与 AI

- [ ] `R MG2-P3-001` 保留当前文本、Markdown、代码、PDF、Office、表格和网页解析。
- [ ] `R MG2-P3-002` 保留审核、发布、版本、回收站、恢复和检索授权。
- [ ] `R MG2-P3-003` 保留收藏、保存视图、相似知识、反向链接和引用。
- [ ] `MG2-P3-004` 统一采集器入口。
- [ ] `MG2-P3-005` 统一知识详情页和右侧上下文栏。
- [ ] `MG2-P3-006` AI 摘要、FAQ、时间线、报告、学习卡和测验入口统一化。
- [ ] `MG2-P3-007` 从知识提取任务和项目。
- [ ] `MG2-P3-008` AI 输出来源、引用、置信度和缺口展示。
- [ ] `MG2-P3-009` Workers AI 不可用时的搜索/引用降级。
- [ ] `MG2-P3-010` AI 结果写回知识前的确认和审计。

## P4 项目、会议与协作

- [ ] `MG2-P4-001` 项目主页聚合目标、任务、知识、资产和活动。
- [ ] `MG2-P4-002` 项目时间线和风险。
- [ ] `MG2-P4-003` 会议记录和议程。
- [ ] `MG2-P4-004` AI 从会议提取摘要、决策和行动项。
- [ ] `R MG2-P4-005` 保留评论、讨论和审核能力。
- [ ] `MG2-P4-006` 评论回复、提及和通知。
- [ ] `MG2-P4-007` 决策记录和项目复盘。
- [ ] `MG2-P4-008` 团队活动时间线。

## P5 数据与治理

- [ ] `MG2-P5-001` 个人工作数据页。
- [ ] `R MG2-P5-002` 保留站点访问量、登录用户和地域统计。
- [ ] `MG2-P5-003` 知识访问排行和无结果搜索统计。
- [ ] `MG2-P5-004` AI 使用量和内容质量统计。
- [ ] `MG2-P5-005` 成员活跃度和任务完成率。
- [ ] `R MG2-P5-006` 保留成员、角色、权限位图、菜单、空间和审计。
- [ ] `MG2-P5-007` 统计与治理接口的服务端权限回归。
- [ ] `MG2-P5-008` 个人数据与管理员数据的显示隔离。

## P6 3D Landing Page

- [ ] `MG2-P6-001` 匿名根路径 Landing Page，不改变登录后工作台路由。
- [ ] `MG2-P6-002` 等距微缩工作室场景，表达个人工作台 SaaS 而非单一知识库。
- [ ] `MG2-P6-003` Inbox、Knowledge、AI、Tasks、Projects、Collaboration、Admin 等功能热点。
- [ ] `MG2-P6-004` 自动演示时间线：收集 → 整理 → 理解 → 执行 → 协作 → 复盘。
- [ ] `MG2-P6-005` 播放、暂停、跳过、重播和进度提示。
- [ ] `MG2-P6-006` GitHub 登录 CTA、邀请制和隐私边界说明。
- [ ] `MG2-P6-007` 热点卡片和功能说明全部由 DOM/i18n 提供。
- [ ] `MG2-P6-008` 不读取真实用户数据、不创建访客业务数据。
- [ ] `MG2-P6-009` WebGL 不可用时使用静态海报和 2D 流程说明。
- [ ] `MG2-P6-010` 移动端、低性能和减少动态效果降级。
- [ ] `MG2-P6-011` 首屏资源、构建体积和运行时内存验收。
- [ ] `MG2-P6-012` 仅使用 Cloudflare 免费能力和构建期静态资源，不引入额外付费服务。

## P7 稳定发布

- [ ] `MG2-P7-001` GitHub OAuth 白名单回归。
- [ ] `MG2-P7-002` disabled member 会话拒绝回归。
- [ ] `MG2-P7-003` 管理员/普通成员菜单和 API 隔离回归。
- [ ] `MG2-P7-004` i18n、主题、无障碍和移动端回归。
- [ ] `MG2-P7-005` D1 migration 和数据保留回归。
- [ ] `MG2-P7-006` Cloudflare 免费层容量与成本证据。
- [ ] `MG2-P7-007` 生产匿名和已授权 smoke。
- [ ] `MG2-P7-008` 2.0 发布、回滚和运维文档。
