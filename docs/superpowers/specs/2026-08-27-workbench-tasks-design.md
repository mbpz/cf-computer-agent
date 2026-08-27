# Memory Garden 工作台任务模块设计规格

更新时间：2026-08-27

## 1. 背景与定位

工作台四个新版块按「任务 → 看板 → 通知 → 消息」的顺序推进，本文是第一个子项目「任务」的设计。任务模块定位为**个人待办 + 可选关联知识库**：任务是成员的完全私有数据，可选择性挂到一个成员可见的知识条目上（已发布或本人提交），但本质上是独立的工作台待办事项，不承担协作指派职责。

本模块同时是后续子项目的地基：任务变更是看板的数据源、通知的事件源。

必须保持：

- Cloudflare Workers、D1、Durable Objects、Workers AI 的免费层边界；不新增 KV/Queues/Vectorize 依赖。
- 现有 GitHub OAuth 会话体系、`requireCapability` / permission bitmap 授权链、`requireSameOrigin` CSRF 校验。
- append-only 迁移纪律（新迁移编号 0030+，不修改历史迁移）。
- 服务端是最终授权与隔离边界，前端过滤不构成安全控制。

## 2. 隔离原则（贯穿全模块的硬约束）

- 任务是成员完全私有数据。所有 D1 查询在 repository 层强制携带 `member_id`，取自会话解析结果，绝不来自请求体。
- 对他人任务的任何操作（IDOR 尝试）一律返回 **404** 而非 403，避免探测存在性。
- 仅允许会话成员访问；自动化 HMAC 主体对全部任务端点返回 403。
- 越权场景必须有专门的 worker 契约测试覆盖。

## 3. 数据模型

### 3.1 迁移 `0030_workspace_tasks.sql`

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,                  -- 客户端生成 nanoid（幂等键）
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,                  -- ≤200 字符
  notes TEXT NOT NULL DEFAULT '',       -- ≤5000 字符
  status TEXT NOT NULL DEFAULT 'todo',  -- todo|doing|blocked|done|canceled
  progress INTEGER NOT NULL DEFAULT 0,  -- 0-100
  priority TEXT NOT NULL DEFAULT 'medium', -- low|medium|high
  due_at INTEGER,                       -- epoch ms，可空
  completed_at INTEGER,                 -- status→done 时写入
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tasks_member_status_due ON tasks(member_id, status, due_at);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,              -- 冗余隔离列：即使误 join 也不会跨人
  tag TEXT NOT NULL,                    -- ≤32 字符
  PRIMARY KEY (task_id, tag)
);
CREATE INDEX idx_task_tags_member ON task_tags(member_id, tag);

CREATE TABLE task_links (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,              -- 冗余隔离列
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  created_at INTEGER NOT NULL,
  UNIQUE (task_id, knowledge_item_id)
);
```

### 3.2 状态机

- 合法迁移：`todo → doing`、`doing ⇄ blocked`、`todo/doing/blocked → done`、`todo/doing/blocked → canceled`、`done/canceled → todo`（重新打开）。
- `done`、`canceled` 为终态，仅可通过「重新打开」回到 `todo`。
- 进入 `done` 时若 `progress < 100` 自动置 100，并写入 `completed_at`；重新打开时清空 `completed_at`。
- `progress` 仅在非终态（todo/doing/blocked）下可编辑，服务端校验 0–100。

### 3.3 上限（免费层护栏）

配置进 `src/config.ts`，超限返回 409：

| 项 | 上限 |
| --- | --- |
| 每成员任务数 | 500 |
| 每任务标签数 | 10 |
| 每任务关联数 | 5 |

## 4. API 设计（原子级端点）

全部挂 `/api/tasks`，路由文件 `src/routes/tasks.ts`，在 `src/app.ts` 路由链注册。统一遵循现有 JSON 信封约定，请求体上限沿用 `maxJsonRequestBytes`。每个写操作记 `audit_events`。

| 端点 | 方法 | 职责 |
| --- | --- | --- |
| `/api/tasks` | GET | 列表+筛选：状态/优先级/标签/到期（今日/逾期/无）/关键词（标题 LIKE），分页游标查询 |
| `/api/tasks` | POST | 创建（客户端生成 `id` 作为幂等键；校验上限与字段长度；可选 `knowledgeItemId` 一步建立关联） |
| `/api/tasks/summary` | GET | 首页概览：各状态计数、今日到期数、逾期数（单次聚合查询） |
| `/api/tasks/:id` | GET | 详情（含标签 + 关联知识条目的标题/状态快照） |
| `/api/tasks/:id` | PATCH | 编辑基础字段（title/notes/priority/due_at） |
| `/api/tasks/:id` | DELETE | 硬删除（级联清 tags/links；审计留痕） |
| `/api/tasks/:id/status` | POST | 状态流转（校验状态机合法迁移） |
| `/api/tasks/:id/progress` | POST | 更新百分比（0–100，状态须为非终态） |
| `/api/tasks/:id/tags` | PUT | 整体替换标签集（校验 ≤10） |
| `/api/tasks/:id/links` | POST | 关联知识条目（条目须存在且成员可见：已发布或本人提交） |
| `/api/tasks/:id/links/:linkId` | DELETE | 取消关联 |

- 列表页大小 20，游标用 `created_at + id` 复合键，与现有分页风格一致。
- 状态流转、进度、标签、关联各自独立端点：每次变更是独立的审计事件，也是后续通知模块的独立事件源。

### 4.1 幂等性

- **创建**：客户端生成 nanoid 作为任务 `id` 随 POST 提交，服务端 `INSERT OR IGNORE` + 回读；重试同一 `id` 返回已存在资源（200），不产生重复行。link 创建同理，靠 `UNIQUE(task_id, knowledge_item_id)` 约束，冲突时回读既有 link 返回成功。
- **状态/进度/标签**：全部为「设置绝对值」语义——重复提交同一目标值即无变化成功（200 返回当前资源）。状态机只拒绝非法迁移，不拒绝重复到达同一状态。
- **删除**：首次成功 204；重试遇 404 由前端按成功处理（私有数据场景下 404 等于目标状态已达成）。
- **服务层测试**：每个写端点补「重复提交同一请求，数据库只产生一行/无变化」的幂等契约测试。

## 5. 权限与菜单接入

- 在 `src/authorization/permission-bitmap.ts` 追加 bit 20（`0x100000`）`workspace.tasks`（append-only 注册）。
- 任务端点要求：已认证成员 + 持有 `workspace.tasks` bit；无 admin 专属子能力（数据私有，无管理面）。默认角色补挂该 bit 由管理员自助操作，不在迁移里写死。
- `menus` 表插一行「任务」（工作台分组，`required_bits` 含 bit 20）；前端 `frontend/contracts/routes.ts` 镜像新增路由项、`frontend/app-routes.ts` 新增 page kind `tasks`。未持 bit 的成员导航不显示、直连路由得到现有 forbidden 状态页。

## 6. 服务层结构

沿用仓库三层约定，`createRequestServices()` 注入：

```text
src/tasks/
  types.ts        # Task/TaskStatus/TaskPriority/TaskLink DTO + 手写校验（跟随仓库现有风格）
  repository.ts   # 全部 D1 SQL，强制 member_id；不 import service
  service.ts      # 状态机/上限/幂等回读/审计写入
```

审计事件类型追加：`task.created`、`task.updated`、`task.status_changed`、`task.progress_changed`、`task.tags_replaced`、`task.deleted`、`task.linked`、`task.unlinked`。

## 7. 前端结构

```text
frontend/pages/tasks/
  tasks-page.tsx         # 列表页：筛选栏（状态/优先级/标签/到期）+ 分页列表 + 新建入口
  task-detail-sheet.tsx  # 行点击打开的侧边 Sheet：编辑字段、状态切换、进度滑杆、标签、关联列表
  task-create-dialog.tsx # 新建对话框（阅读页复用：预填条目标题 + knowledgeItemId）
  tasks-model.ts         # 状态/优先级/到期的展示映射与徽章配色
frontend/lib/tasks-data.ts  # apiFetch 薄封装，含客户端 nanoid 生成（幂等键）
```

- 列表分页使用现有 `pagination` 组件，页大小 20、游标分页；切换筛选自动回第一页；不做无限滚动。
- 全部使用现有 shadcn/ui 原语（button/card/dialog/sheet/badge/input/label/tabs/pagination/skeleton/page-state）；加载/空态/错误态走 `page-state` 统一模式。
- 卡片行显示：优先级徽章、标题、到期日（逾期红/今日黄）、进度条、标签、关联条目数。
- 知识阅读页操作区加「加入任务」按钮，弹 `task-create-dialog` 创建并关联（创建端点一次请求完成）。
- 首页加「我的任务」概览卡：进行中 N · 今日到期 N · 逾期 N，点击进入任务页（数据来自 `/api/tasks/summary`）。
- i18n：所有新文案同时进 `en` 与 `zh-CN` 目录，i18n 契约测试保证不漏。

## 8. 测试与验收

- `test/unit/tasks-*.test.ts`：repository 隔离（跨成员 0 行）、状态机合法/非法迁移、上限、幂等回读、summary 聚合正确性。
- `test/worker/tasks.test.ts`：HTTP 契约级——正常 CRUD、IDOR（成员 B 访问成员 A 的任务 → 404）、未认证 401、自动化主体 403、CSRF 拒绝、幂等重试只产生一行、缺 bit → 403。
- 前端组件测试（happy-dom）：任务页渲染、筛选交互、创建对话框提交。
- 验收标准：`npm run check` 全绿（vendor + types + tsc + 全部测试 + dry-run deploy），并在 `docs/operations/evidence/` 落一份本阶段发布证据文件。

## 9. 范围外（明确不做）

看板视图、任务分享/指派、到期提醒推送（通知模块职责）、重复任务模板、任务与提交/私有笔记/来源的关联类型。
