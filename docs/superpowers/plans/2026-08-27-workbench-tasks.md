# 工作台「任务」模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Memory Garden 工作台新增成员私有的任务模块(个人待办 + 可选关联知识条目),含 D1 存储、原子级 API、shadcn/ui 前端与完整测试。

**Architecture:** 单 Worker 内新增 `src/tasks/` 三层模块(types/repository/service)+ `src/routes/tasks.ts`,经 `createRequestServices()` 注入、`dispatchApiRequest()` 分发。数据存 D1(迁移 0032),强制 `member_id` 隔离;权限沿用 `requireCapability` 字符串能力(`tasks:use`),同时在 permission bitmap 注册 bit 20(`workspace.tasks`)供菜单/角色治理。前端新增 `/tasks` 页面、首页概览卡与知识阅读页入口。

**Tech Stack:** Cloudflare Workers + D1 + TypeScript 严格模式 + React 19 + Tailwind 4 + shadcn/ui(new-york/slate)+ Vitest(`@cloudflare/vitest-pool-workers`)。

**Spec:** `docs/superpowers/specs/2026-08-27-workbench-tasks-design.md`(已批准,含全部字段/端点/幂等/隔离决策)。

## Global Constraints

- 迁移 append-only:新文件 `migrations/0032_workspace_tasks.sql`,绝不修改历史迁移(0030/0031 已被占用)。
- 时间存储:spec 规定 `tasks` 表时间列一律 epoch ms INTEGER;repository 层映射为 ISO 字符串对外。
- 隔离:所有 SQL 强制 `member_id`;跨成员访问一律 404(`TASK_NOT_FOUND`),不返回 403。
- 幂等:创建用客户端 id `INSERT OR IGNORE` + 回读;状态/进度/标签为绝对值语义,重复提交返回当前资源;删除重试的 404 由前端按成功处理。
- 上限(写入 `src/config.ts`):每成员任务 500、每任务标签 10、每任务关联 5、标题 ≤200 字符、备注 ≤5000 字符、标签 ≤32 字符。
- 状态机:`todo→doing`、`doing⇄blocked`、`todo/doing/blocked→done|canceled`、`done/canceled→todo`(重开);进 `done` 时 progress<100 自动置 100 并写 completed_at,重开清空;progress 仅非终态可改。
- 端点仅限会话成员;自动化主体 403;非安全方法过 `requireSameOrigin`(已在 `src/app.ts` 全局生效,无需新代码)。
- i18n:所有新文案同时进 `frontend/lib/i18n.ts` 的 `en` 与 `zh-CN` catalog(legacy `public/locales/` 不动)。
- 前端不新增依赖;ID 用 `crypto.randomUUID()`。
- 每个 Task 结束时 `git commit`;最终验收 `npm run check` 全绿。

## File Structure

```
后端
  migrations/0032_workspace_tasks.sql        (Create) 三张表 + 菜单行
  src/config.ts                              (Modify) 任务上限常量
  src/authorization/permission-bitmap.ts     (Modify) bit 20 "workspace.tasks"
  src/authorization/policy.ts                (Modify) Capability "tasks:use" + mask 投影
  src/audit/types.ts                         (Modify) 8 个 task.* 审计动作
  src/tasks/types.ts                         (Create) DTO + 过滤器 + summary
  src/tasks/repository.ts                    (Create) 全部 D1 SQL
  src/tasks/service.ts                       (Create) 校验/状态机/幂等/审计
  src/routes/tasks.ts                        (Create) HTTP 端点
  src/app.ts                                 (Modify) 注入 + 分发 + workspaceRoutes
前端
  frontend/lib/tasks-data.ts                 (Create) API 薄封装
  frontend/pages/tasks/tasks-model.ts        (Create) 展示映射
  frontend/pages/tasks/tasks-page.tsx        (Create) 列表页(筛选+分页)
  frontend/pages/tasks/task-detail-sheet.tsx (Create) 详情侧边 Sheet
  frontend/pages/tasks/task-create-dialog.tsx(Create) 新建对话框(阅读页复用)
  frontend/contracts/routes.ts               (Modify) "tasks:use" + /tasks 路由
  frontend/app-routes.ts                     (Modify) pageKind "tasks"
  frontend/app.tsx                           (Modify) TasksRoute + 阅读页入口
  frontend/pages/home-page.tsx               (Modify) 任务概览卡
  frontend/pages/knowledge-reader-page.tsx   (Modify) 「加入任务」按钮
  frontend/lib/i18n.ts                       (Modify) 双语 key
测试
  test/worker/tasks.test.ts                  (Create) D1 持久化 + HTTP 契约
  test/unit/tasks-service.test.ts            (Create) 服务层单测
  test/unit/frontend-tasks.test.ts(x)        (Create) 前端数据层/组件测试
  docs/operations/evidence/2026-08-27-workbench-tasks.md  (Create) 发布证据
```

**Consumes/Produces 接口契约(跨任务引用,实现者必读):**
- `TasksRepository implements TasksRepositoryPort`(Task 2 定义)——service(Task 3/4)与 worker 测试(Task 5)依赖其方法签名。
- `TasksService`(Task 3/4 定义)——`routeTasksApi`(Task 5)依赖:`create/get/list/summary/update/delete/setStatus/setProgress/replaceTags/addLink/removeLink`。
- `TasksServiceOptions { id?, now?, audit? }`;audit 为 `Pick<AuditRepository, "writeAudit"> | undefined`。
- 前端:`loadTasks/createTask/...`(Task 6)被页面(Task 7/9)依赖;`TaskItem`/`TaskSummary` 类型贯穿。
- 错误码固定:`TASK_INVALID`(400)、`TASK_NOT_FOUND`(404)、`TASK_LIMIT_REACHED`/`TASK_TAG_LIMIT`/`TASK_LINK_LIMIT`(409)、`TASK_TRANSITION_INVALID`(422)、`TASK_PROGRESS_INVALID`(400)、`TASK_KNOWLEDGE_NOT_FOUND`(404)、`TASK_PAGE_INVALID`(400)。

---

### Task 1: 迁移 0032 + 权限位 + 能力注册

**Files:**
- Create: `migrations/0032_workspace_tasks.sql`
- Modify: `src/config.ts`(在 `maxBatchReviewActions: 20,` 之后插入)
- Modify: `src/authorization/permission-bitmap.ts`(PERMISSION_BITS 末尾)
- Modify: `src/authorization/policy.ts`

**Interfaces:**
- Produces: `APP_CONFIG.maxTasksPerMember/maxTaskTags/maxTaskLinksPerTask/maxTaskTitleChars/maxTaskNotesChars/maxTaskTagChars`;permission bit `"workspace.tasks": 20`;Capability `"tasks:use"`(admin+contributor 均持有);菜单行 `menu-tasks`。

- [ ] **Step 1: 写迁移文件**

`migrations/0032_workspace_tasks.sql`:

```sql
-- Workbench tasks: per-member private todo entities with optional knowledge links.
-- Timestamps are epoch milliseconds; the repository maps them to ISO strings.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('todo', 'doing', 'blocked', 'done', 'canceled')),
  progress INTEGER NOT NULL CHECK(progress >= 0 AND progress <= 100),
  priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
  due_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tasks_member_status_due ON tasks(member_id, status, due_at);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (task_id, tag)
);
CREATE INDEX idx_task_tags_member ON task_tags(member_id, tag);

CREATE TABLE task_links (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  created_at INTEGER NOT NULL,
  UNIQUE (task_id, knowledge_item_id)
);
CREATE INDEX idx_task_links_member ON task_links(member_id, task_id);

INSERT OR IGNORE INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
VALUES ('menu-tasks', 'menu-workspace', 'tasks', 'NAV_TASKS', '/tasks', 'CheckSquare', 'workspace', 6, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
```

- [ ] **Step 2: 注册 permission bit**

`src/authorization/permission-bitmap.ts` 在 `"search:use": 18,` 之后加一行(bit 索引 append-only):

```ts
  "search:use": 18,
  "workspace.tasks": 20,
```

- [ ] **Step 3: 注册 legacy capability 与 mask 投影**

`src/authorization/policy.ts`:
1. `Capability` union 末尾加 `| "tasks:use"`;
2. `contributorCapabilities` 数组末尾加 `"tasks:use"`;
3. `adminCapabilities` 数组末尾加 `"tasks:use"`;
4. `permissionMaskForPrincipal` 的 admin 列表末尾加 `"workspace.tasks"`,contributor 列表末尾加 `"workspace.tasks"`。

- [ ] **Step 4: 任务上限常量**

`src/config.ts` 在 `maxBatchReviewActions: 20,` 之后插入:

```ts
  maxTasksPerMember: 500,
  maxTaskTags: 10,
  maxTaskLinksPerTask: 5,
  maxTaskTitleChars: 200,
  maxTaskNotesChars: 5_000,
  maxTaskTagChars: 32,
```

- [ ] **Step 5: 验证(迁移测试 + 类型)**

Run: `npx vitest run test/worker/migrations.test.ts && npx tsc --noEmit`
Expected: 全部 PASS,tsc 无错误。

- [ ] **Step 6: Commit**

```bash
git add migrations/0032_workspace_tasks.sql src/config.ts src/authorization/permission-bitmap.ts src/authorization/policy.ts
git commit -m "feat: add workspace tasks migration and permission registration"
```

---

### Task 2: `src/tasks/types.ts` + `src/tasks/repository.ts`(D1 持久化)

**Files:**
- Create: `src/tasks/types.ts`
- Create: `src/tasks/repository.ts`
- Test: `test/worker/tasks.test.ts`(本任务先写 repository 部分)

**Interfaces:**
- Produces(Task 3/5 依赖)——`TasksRepositoryPort` 完整签名:

```ts
export interface TasksRepositoryPort {
  insert(input: TaskCreate): Promise<boolean>;                    // false = id 已存在(幂等)
  findOwned(memberId: string, id: string): Promise<Task | null>;
  list(memberId: string, request: TaskListRequest): Promise<TaskPage>;
  update(memberId: string, id: string, input: TaskUpdate): Promise<Task | null>;
  updateStatus(memberId: string, id: string, status: TaskStatus, completedAt: number | null, progress: number, updatedAt: number): Promise<Task | null>;
  updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Task | null>;
  delete(memberId: string, id: string): Promise<boolean>;
  countByMember(memberId: string): Promise<number>;
  summary(memberId: string, now: Date): Promise<TaskSummary>;
  listTags(memberId: string, taskId: string): Promise<string[]>;
  replaceTags(memberId: string, taskId: string, tags: readonly string[]): Promise<void>;
  listLinks(memberId: string, taskId: string): Promise<TaskLink[]>;
  insertLink(link: TaskLinkInsert): Promise<boolean>;             // false = UNIQUE 冲突(幂等)
  findLink(memberId: string, taskId: string, knowledgeItemId: string): Promise<TaskLink | null>;
  deleteLink(memberId: string, taskId: string, linkId: string): Promise<boolean>;
  countLinks(memberId: string, taskId: string): Promise<number>;
  isKnowledgeVisible(memberId: string, knowledgeItemId: string): Promise<boolean>;
}
```

- [ ] **Step 1: 写 types.ts**

`src/tasks/types.ts`:

```ts
import type { Page, PageRequest } from "../pagination";

export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high";
export type TaskDueFilter = "today" | "overdue" | "none";

export const TASK_STATUSES: readonly TaskStatus[] = ["todo", "doing", "blocked", "done", "canceled"];
export const TASK_PRIORITIES: readonly TaskPriority[] = ["low", "medium", "high"];

export interface Task {
  id: string;
  memberId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  progress: number;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCreate {
  id: string;
  memberId: string;
  title: string;
  notes: string;
  priority: TaskPriority;
  dueAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskUpdate {
  title: string;
  notes: string;
  priority: TaskPriority;
  dueAt: number | null;
  updatedAt: number;
}

export interface TaskLink {
  id: string;
  taskId: string;
  knowledgeItemId: string;
  knowledgeTitle: string | null;
  createdAt: string;
}

export interface TaskLinkInsert {
  id: string;
  taskId: string;
  memberId: string;
  knowledgeItemId: string;
  createdAt: number;
}

export interface TaskListFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  tag?: string;
  due?: TaskDueFilter;
  q?: string;
}

export interface TaskListRequest extends PageRequest {
  filters: TaskListFilters;
}

export type TaskPage = Page<Task>;

export interface TaskSummary {
  todo: number;
  doing: number;
  blocked: number;
  done: number;
  canceled: number;
  dueToday: number;
  overdue: number;
}
```

- [ ] **Step 2: 写失败测试(repository 层,真实 D1)**

`test/worker/tasks.test.ts`:

```ts
/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { TasksRepository } from "../../src/tasks/repository";
import type { TaskCreate, TaskLinkInsert } from "../../src/tasks/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = 1_777_777_000_000; // 2026-05-02T00:30:00.000Z (固定值,due 过滤断言用)
const DAY = 86_400_000;

describe("tasks repository", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
  });

  it("inserts once, treats duplicate ids as ignored, and keeps owners isolated", async () => {
    const repository = new TasksRepository(env.DB);
    const input = taskCreate({ id: "task-a", memberId: "member-a" });
    expect(await repository.insert(input)).toBe(true);
    expect(await repository.insert(taskCreate({ id: "task-a", memberId: "member-a", title: "replay" }))).toBe(false);
    expect((await repository.findOwned("member-a", "task-a"))?.title).toBe("Test task");
    expect(await repository.findOwned("member-b", "task-a")).toBeNull();
    expect(await repository.countByMember("member-a")).toBe(1);
  });

  it("lists with status/tag/due/q filters and a stable cursor", async () => {
    const repository = new TasksRepository(env.DB);
    await seedTasks(repository);
    const all = await repository.list("member-a", { limit: 10, filters: {} });
    expect(all.items).toHaveLength(4);
    expect(all.nextCursor).toBeUndefined();
    const doing = await repository.list("member-a", { limit: 10, filters: { status: "doing" } });
    expect(doing.items.map((task) => task.id)).toEqual(["task-2"]);
    const tagged = await repository.list("member-a", { limit: 10, filters: { tag: "urgent" } });
    expect(tagged.items.map((task) => task.id)).toEqual(["task-1"]);
    const overdue = await repository.list("member-a", { limit: 10, filters: { due: "overdue" } });
    expect(overdue.items.map((task) => task.id)).toEqual(["task-3"]);
    const today = await repository.list("member-a", { limit: 10, filters: { due: "today" } });
    expect(today.items.map((task) => task.id)).toEqual(["task-2"]);
    const noDue = await repository.list("member-a", { limit: 10, filters: { due: "none" } });
    expect(noDue.items.map((task) => task.id)).toEqual(["task-4"]);
    const searched = await repository.list("member-a", { limit: 10, filters: { q: "alpha" } });
    expect(searched.items.map((task) => task.id)).toEqual(["task-1"]);
    const paged = await repository.list("member-a", { limit: 2, filters: {} });
    expect(paged.items.map((task) => task.id)).toEqual(["task-4", "task-3"]);
    const next = await repository.list("member-a", { limit: 2, filters: {}, cursor: paged.nextCursor });
    expect(next.items.map((task) => task.id)).toEqual(["task-2", "task-1"]);
  });

  it("summarizes status counts, due-today and overdue for open tasks only", async () => {
    const repository = new TasksRepository(env.DB);
    await seedTasks(repository);
    const summary = await repository.summary("member-a", new Date(NOW));
    expect(summary).toEqual({ todo: 2, doing: 1, blocked: 0, done: 1, canceled: 0, dueToday: 1, overdue: 1 });
  });

  it("replaces tags, keeps them member-scoped, and cascades on delete", async () => {
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-1", memberId: "member-a" }));
    await repository.replaceTags("member-a", "task-1", ["urgent", "reading"]);
    await repository.replaceTags("member-a", "task-1", ["urgent"]);
    expect(await repository.listTags("member-a", "task-1")).toEqual(["urgent"]);
    expect(await repository.listTags("member-b", "task-1")).toEqual([]);
    expect(await repository.delete("member-a", "task-1")).toBe(true);
    expect(await repository.countByMember("member-a")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM task_tags").first<{ n: number }>()).toMatchObject({ n: 0 });
  });

  it("inserts links idempotently and resolves knowledge visibility", async () => {
    await seedKnowledge("member-a");
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-1", memberId: "member-a" }));
    const link = linkInsert({ id: "link-1", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a" });
    expect(await repository.insertLink(link)).toBe(true);
    expect(await repository.insertLink(linkInsert({ id: "link-2", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a" }))).toBe(false);
    expect(await repository.countLinks("member-a", "task-1")).toBe(1);
    expect(await repository.findLink("member-a", "task-1", "knowledge-a")).toMatchObject({ id: "link-1", knowledgeTitle: "Alpha Guide" });
    expect(await repository.listLinks("member-a", "task-1")).toHaveLength(1);
    expect(await repository.isKnowledgeVisible("member-a", "knowledge-a")).toBe(true);
    expect(await repository.isKnowledgeVisible("member-b", "knowledge-a")).toBe(true); // shared 对所有成员可见
    expect(await repository.isKnowledgeVisible("member-a", "knowledge-missing")).toBe(false);
    expect(await repository.deleteLink("member-a", "task-1", "link-1")).toBe(true);
    expect(await repository.deleteLink("member-a", "task-1", "link-1")).toBe(false);
  });
});

function taskCreate(overrides: Partial<TaskCreate> = {}): TaskCreate {
  return {
    id: "task-default", memberId: "member-a", title: "Test task", notes: "", priority: "medium",
    dueAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function linkInsert(overrides: Partial<TaskLinkInsert> = {}): TaskLinkInsert {
  return { id: "link-default", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a", createdAt: NOW, ...overrides };
}

async function seedTasks(repository: TasksRepository): Promise<void> {
  await repository.insert(taskCreate({ id: "task-1", memberId: "member-a", title: "Alpha review", createdAt: NOW - 4 * 1000, updatedAt: NOW - 4 * 1000 }));
  await repository.insert(taskCreate({ id: "task-2", memberId: "member-a", title: "Beta draft", createdAt: NOW - 3 * 1000, updatedAt: NOW - 3 * 1000 }));
  await repository.insert(taskCreate({ id: "task-3", memberId: "member-a", title: "Gamma", createdAt: NOW - 2 * 1000, updatedAt: NOW - 2 * 1000 }));
  await repository.insert(taskCreate({ id: "task-4", memberId: "member-a", title: "Delta", createdAt: NOW - 1 * 1000, updatedAt: NOW - 1 * 1000 }));
  await env.DB.prepare("UPDATE tasks SET status = 'doing', due_at = ? WHERE id = 'task-2'").bind(NOW).run();
  await env.DB.prepare("UPDATE tasks SET status = 'done', progress = 100, completed_at = ?, due_at = ? WHERE id = 'task-4'").bind(NOW, NOW + 5 * DAY).run(); // done 不计入 today/overdue
  await env.DB.prepare("UPDATE tasks SET due_at = ? WHERE id = 'task-1'").bind(NOW + 5 * DAY).run();
  await env.DB.prepare("UPDATE tasks SET due_at = ? WHERE id = 'task-3'").bind(NOW - DAY).run();
  await env.DB.prepare("INSERT INTO task_tags (task_id, member_id, tag) VALUES ('task-1', 'member-a', 'urgent')").run();
}

async function seedKnowledge(ownerId: string): Promise<void> {
  const hash = "c".repeat(64);
  const now = "2026-01-01T00:00:00.000Z";
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('task-submission', ?, 'default', 'markdown', 'published', 'Alpha Guide', '# Alpha', ?, ?)").bind(ownerId, now, now).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('task-source', ?, 'default', 'markdown', 'Alpha Guide', ?, ?)").bind(ownerId, now, now).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('task-source-version', 'task-source', 'task-submission', 1, '# Alpha', ?, 'm1-v1', ?)").bind(hash, now).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-a', 'default', NULL, 'active', 'indexed', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('task-revision', 'knowledge-a', 'task-source-version', '/workspace/published/default/knowledge-a/revision.md', ?, 'Alpha Guide', '[]', 'shared', ?, ?)").bind(hash, ownerId, now).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'task-revision' WHERE id = 'knowledge-a'").run();
}
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run test/worker/tasks.test.ts`
Expected: FAIL(找不到 `../../src/tasks/repository` 模块)。

- [ ] **Step 4: 实现 repository.ts**

`src/tasks/repository.ts`:

```ts
import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor } from "../pagination";
import type { Task, TaskCreate, TaskLink, TaskLinkInsert, TaskListRequest, TaskPage, TaskStatus, TaskSummary, TaskUpdate } from "./types";

type TaskRow = {
  id: string; member_id: string; title: string; notes: string; status: TaskStatus;
  progress: number; priority: Task["priority"]; due_at: number | null; completed_at: number | null;
  created_at: number; updated_at: number;
};
type LinkRow = { id: string; task_id: string; knowledge_item_id: string; title: string | null; created_at: number };
type SummaryRow = { status: TaskStatus; due_at: number | null };

export interface TasksRepositoryPort {
  insert(input: TaskCreate): Promise<boolean>;
  findOwned(memberId: string, id: string): Promise<Task | null>;
  list(memberId: string, request: TaskListRequest): Promise<TaskPage>;
  update(memberId: string, id: string, input: TaskUpdate): Promise<Task | null>;
  updateStatus(memberId: string, id: string, status: TaskStatus, completedAt: number | null, progress: number, updatedAt: number): Promise<Task | null>;
  updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Task | null>;
  delete(memberId: string, id: string): Promise<boolean>;
  countByMember(memberId: string): Promise<number>;
  summary(memberId: string, now: Date): Promise<TaskSummary>;
  listTags(memberId: string, taskId: string): Promise<string[]>;
  replaceTags(memberId: string, taskId: string, tags: readonly string[]): Promise<void>;
  listLinks(memberId: string, taskId: string): Promise<TaskLink[]>;
  insertLink(link: TaskLinkInsert): Promise<boolean>;
  findLink(memberId: string, taskId: string, knowledgeItemId: string): Promise<TaskLink | null>;
  deleteLink(memberId: string, taskId: string, linkId: string): Promise<boolean>;
  countLinks(memberId: string, taskId: string): Promise<number>;
  isKnowledgeVisible(memberId: string, knowledgeItemId: string): Promise<boolean>;
}

const taskColumns = "id, member_id, title, notes, status, progress, priority, due_at, completed_at, created_at, updated_at";
const OPEN_STATUSES = "('todo', 'doing', 'blocked')";

export class TasksRepository implements TasksRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async insert(input: TaskCreate): Promise<boolean> {
    const result = await this.db.prepare(
      `INSERT OR IGNORE INTO tasks (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'todo', 0, ?, ?, ?, ?)`,
    ).bind(input.id, input.memberId, input.title, input.notes, input.priority, input.dueAt, input.createdAt, input.updatedAt).run();
    return result.meta.changes === 1;
  }

  async findOwned(memberId: string, id: string): Promise<Task | null> {
    return mapTask(await this.db.prepare(
      `SELECT ${taskColumns} FROM tasks WHERE member_id = ? AND id = ? LIMIT 1`,
    ).bind(memberId, id).first<TaskRow>());
  }

  async list(memberId: string, request: TaskListRequest): Promise<TaskPage> {
    const cursor = request.cursor === undefined ? undefined : decodeListCursor(request.cursor);
    const conditions = ["member_id = ?"];
    const bindings: (string | number)[] = [memberId];
    const { filters } = request;
    if (filters.status) { conditions.push("status = ?"); bindings.push(filters.status); }
    if (filters.priority) { conditions.push("priority = ?"); bindings.push(filters.priority); }
    if (filters.tag) {
      conditions.push("id IN (SELECT task_id FROM task_tags WHERE member_id = ? AND tag = ?)");
      bindings.push(memberId, filters.tag);
    }
    if (filters.due) {
      const now = Date.now();
      const startOfDay = now - (now % 86_400_000);
      const endOfDay = startOfDay + 86_400_000;
      if (filters.due === "none") conditions.push("due_at IS NULL");
      if (filters.due === "today") { conditions.push(`due_at >= ? AND due_at < ? AND status IN ${OPEN_STATUSES}`); bindings.push(startOfDay, endOfDay); }
      if (filters.due === "overdue") { conditions.push(`due_at < ? AND status IN ${OPEN_STATUSES}`); bindings.push(startOfDay); }
    }
    if (filters.q) { conditions.push("title LIKE ? ESCAPE '\\'"); bindings.push(`%${escapeLike(filters.q)}%`); }
    if (cursor) { conditions.push("(created_at < ? OR (created_at = ? AND id < ?))"); bindings.push(cursor.createdAt, cursor.createdAt, cursor.id); }
    const rows = await this.db.prepare(
      `SELECT ${taskColumns} FROM tasks WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, id DESC LIMIT ?`,
    ).bind(...bindings, request.limit + 1).all<TaskRow>();
    const items = rows.results.slice(0, request.limit).map((row) => mapTaskRow(row)!);
    const lastRow = rows.results[request.limit - 1];
    return {
      items,
      ...(rows.results.length > request.limit && lastRow ? { nextCursor: encodeOpaqueCursor({ v: 1, createdAt: lastRow.created_at, id: lastRow.id }) } : {}),
    };
  }

  async update(memberId: string, id: string, input: TaskUpdate): Promise<Task | null> {
    const result = await this.db.prepare(
      `UPDATE tasks SET title = ?, notes = ?, priority = ?, due_at = ?, updated_at = ? WHERE member_id = ? AND id = ?`,
    ).bind(input.title, input.notes, input.priority, input.dueAt, input.updatedAt, memberId, id).run();
    return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;
  }

  async updateStatus(memberId: string, id: string, status: TaskStatus, completedAt: number | null, progress: number, updatedAt: number): Promise<Task | null> {
    const result = await this.db.prepare(
      `UPDATE tasks SET status = ?, completed_at = ?, progress = ?, updated_at = ? WHERE member_id = ? AND id = ?`,
    ).bind(status, completedAt, progress, updatedAt, memberId, id).run();
    return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;
  }

  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number): Promise<Task | null> {
    const result = await this.db.prepare(
      `UPDATE tasks SET progress = ?, updated_at = ? WHERE member_id = ? AND id = ?`,
    ).bind(progress, updatedAt, memberId, id).run();
    return result.meta.changes === 1 ? this.findOwned(memberId, id) : null;
  }

  async delete(memberId: string, id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM tasks WHERE member_id = ? AND id = ?").bind(memberId, id).run();
    return result.meta.changes === 1;
  }

  async countByMember(memberId: string): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE member_id = ?").bind(memberId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async summary(memberId: string, now: Date): Promise<TaskSummary> {
    const rows = await this.db.prepare(
      `SELECT status, due_at FROM tasks WHERE member_id = ?`,
    ).bind(memberId).all<SummaryRow>();
    const startOfDay = now.getTime() - (now.getTime() % 86_400_000);
    const endOfDay = startOfDay + 86_400_000;
    const summary: TaskSummary = { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 };
    for (const row of rows.results) {
      summary[row.status] += 1;
      if (row.status === "todo" || row.status === "doing" || row.status === "blocked") {
        if (row.due_at !== null && row.due_at < startOfDay) summary.overdue += 1;
        if (row.due_at !== null && row.due_at >= startOfDay && row.due_at < endOfDay) summary.dueToday += 1;
      }
    }
    return summary;
  }

  async listTags(memberId: string, taskId: string): Promise<string[]> {
    const rows = await this.db.prepare(
      "SELECT tag FROM task_tags WHERE member_id = ? AND task_id = ? ORDER BY tag",
    ).bind(memberId, taskId).all<{ tag: string }>();
    return rows.results.map((row) => row.tag);
  }

  async replaceTags(memberId: string, taskId: string, tags: readonly string[]): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM task_tags WHERE member_id = ? AND task_id = ?").bind(memberId, taskId),
      ...tags.map((tag) => this.db.prepare(
        "INSERT INTO task_tags (task_id, member_id, tag) VALUES (?, ?, ?)",
      ).bind(taskId, memberId, tag)),
    ]);
  }

  async listLinks(memberId: string, taskId: string): Promise<TaskLink[]> {
    const rows = await this.db.prepare(
      `SELECT tl.id, tl.task_id, tl.knowledge_item_id, r.title, tl.created_at
       FROM task_links tl
       LEFT JOIN knowledge_items ki ON ki.id = tl.knowledge_item_id
       LEFT JOIN revisions r ON r.id = ki.current_revision_id
       WHERE tl.member_id = ? AND tl.task_id = ?
       ORDER BY tl.created_at DESC, tl.id DESC`,
    ).bind(memberId, taskId).all<LinkRow>();
    return rows.results.map(mapLinkRow);
  }

  async insertLink(link: TaskLinkInsert): Promise<boolean> {
    const result = await this.db.prepare(
      "INSERT OR IGNORE INTO task_links (id, task_id, member_id, knowledge_item_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(link.id, link.taskId, link.memberId, link.knowledgeItemId, link.createdAt).run();
    return result.meta.changes === 1;
  }

  async findLink(memberId: string, taskId: string, knowledgeItemId: string): Promise<TaskLink | null> {
    const row = await this.db.prepare(
      `SELECT tl.id, tl.task_id, tl.knowledge_item_id, r.title, tl.created_at
       FROM task_links tl
       LEFT JOIN knowledge_items ki ON ki.id = tl.knowledge_item_id
       LEFT JOIN revisions r ON r.id = ki.current_revision_id
       WHERE tl.member_id = ? AND tl.task_id = ? AND tl.knowledge_item_id = ? LIMIT 1`,
    ).bind(memberId, taskId, knowledgeItemId).first<LinkRow>();
    return row ? mapLinkRow(row) : null;
  }

  async deleteLink(memberId: string, taskId: string, linkId: string): Promise<boolean> {
    const result = await this.db.prepare(
      "DELETE FROM task_links WHERE member_id = ? AND task_id = ? AND id = ?",
    ).bind(memberId, taskId, linkId).run();
    return result.meta.changes === 1;
  }

  async countLinks(memberId: string, taskId: string): Promise<number> {
    const row = await this.db.prepare(
      "SELECT COUNT(*) AS n FROM task_links WHERE member_id = ? AND task_id = ?",
    ).bind(memberId, taskId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async isKnowledgeVisible(memberId: string, knowledgeItemId: string): Promise<boolean> {
    const row = await this.db.prepare(
      `SELECT 1 AS visible FROM knowledge_items ki
       JOIN revisions r ON r.id = ki.current_revision_id
       WHERE ki.id = ? AND ki.status = 'active' AND (r.visibility = 'shared' OR r.published_by = ?) LIMIT 1`,
    ).bind(knowledgeItemId, memberId).first<{ visible: number }>();
    return row !== null;
  }
}

function mapTask(row: TaskRow | null): Task | null {
  return row ? mapTaskRow(row) : null;
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    memberId: row.member_id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    progress: row.progress,
    priority: row.priority,
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    completedAt: row.completed_at === null ? null : new Date(row.completed_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapLinkRow(row: LinkRow): TaskLink {
  return {
    id: row.id,
    taskId: row.task_id,
    knowledgeItemId: row.knowledge_item_id,
    knowledgeTitle: row.title,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

type TaskListCursor = { v: 1; createdAt: number; id: string };

function decodeListCursor(value: string): TaskListCursor {
  try {
    const decoded = decodeOpaqueCursor(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.v !== 1 || typeof record.id !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.id)
      || !Number.isSafeInteger(record.createdAt) || (record.createdAt as number) < 0) throw new Error();
    return { v: 1, createdAt: record.createdAt as number, id: record.id };
  } catch {
    throw new AppError("TASK_PAGE_INVALID", "Task page cursor is invalid", 400);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/gu, (match) => `\\${match}`);
}
```

(cursor 一律用 epoch 毫秒数字编码/绑定,与 INTEGER 列直接比较;`lastRow` 取原始行而非映射后的 ISO Task。)

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/worker/tasks.test.ts`
Expected: 5 个测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/tasks/types.ts src/tasks/repository.ts test/worker/tasks.test.ts
git commit -m "feat: add tasks types and D1 repository"
```

---

### Task 3: `src/tasks/service.ts`(校验/状态机/幂等/上限)

**Files:**
- Create: `src/tasks/service.ts`
- Test: `test/unit/tasks-service.test.ts`

**Interfaces:**
- Consumes: `TasksRepositoryPort`(Task 2)、`APP_CONFIG`(Task 1)。
- Produces(Task 4/5 依赖):

```ts
export interface TasksServiceOptions {
  id?: () => string;          // 审计事件/关联行的 id 生成器,测试注入
  now?: () => Date;
  audit?: Pick<AuditRepository, "writeAudit">;
}
export interface TaskCreateInput { id?: unknown; title?: unknown; notes?: unknown; priority?: unknown; dueAt?: unknown; knowledgeItemId?: unknown; }
export interface TaskUpdateInput { title?: unknown; notes?: unknown; priority?: unknown; dueAt?: unknown; }
export class TasksService {
  async create(memberId: string, input: TaskCreateInput): Promise<{ task: Task; created: boolean; link?: TaskLink }>;
  async get(memberId: string, id: string): Promise<TaskDetail>;            // { task, tags, links }
  async list(memberId: string, request?: PageRequest & { filters?: TaskListFilters }): Promise<TaskPage>;
  async summary(memberId: string): Promise<TaskSummary>;
  async update(memberId: string, id: string, input: TaskUpdateInput): Promise<Task>;
  async delete(memberId: string, id: string): Promise<void>;
  async setStatus(memberId: string, id: string, status: unknown): Promise<Task>;
  async setProgress(memberId: string, id: string, progress: unknown): Promise<Task>;
  async replaceTags(memberId: string, id: string, tags: unknown): Promise<string[]>;
  async addLink(memberId: string, taskId: string, knowledgeItemId: unknown): Promise<TaskLink>;
  async removeLink(memberId: string, taskId: string, linkId: string): Promise<void>;
}
```

- [ ] **Step 1: 写失败单测**

`test/unit/tasks-service.test.ts`(Fake repository,模式仿 `test/unit/saved-views-service.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { TasksService } from "../../src/tasks/service";
import type { TasksRepositoryPort } from "../../src/tasks/repository";
import type { Task, TaskCreate, TaskLink, TaskLinkInsert, TaskListRequest, TaskPage, TaskSummary, TaskUpdate } from "../../src/tasks/types";
import type { PageRequest } from "../../src/pagination";

const NOW = new Date("2026-08-26T00:00:00.000Z");

describe("TasksService", () => {
  it("creates with a client id, replays the same id idempotently, and audits once", async () => {
    const repository = new FakeTasksRepository();
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    const first = await service.create("member-a", { id: "task-1", title: "  Alpha  ", notes: "note", priority: "high", dueAt: "2026-08-30T00:00:00.000Z" });
    expect(first.created).toBe(true);
    expect(first.task.title).toBe("Alpha");
    const replay = await service.create("member-a", { id: "task-1", title: "Alpha", priority: "medium" });
    expect(replay.created).toBe(false);
    expect((await service.list("member-a")).items).toHaveLength(1);
    expect(audit.events.filter((event) => event.action === "task.created")).toHaveLength(1);
  });

  it("validates fields and enforces the member task limit", async () => {
    const repository = new FakeTasksRepository();
    repository.count = 500;
    const service = createService(repository);
    await expect(service.create("member-a", { title: "x".repeat(201) })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.create("member-a", { title: "ok", priority: "urgent" })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.create("member-a", { title: "ok", dueAt: "not-a-date" })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.create("member-a", { title: "ok" })).rejects.toMatchObject({ code: "TASK_LIMIT_REACHED", status: 409 });
  });

  it("enforces the status machine, terminal behavior, and idempotent re-sends", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    const created = (await service.create("member-a", { id: "task-1", title: "Alpha" })).task;
    await expect(service.setStatus("member-a", "task-1", "done")).rejects.toMatchObject({ code: "TASK_TRANSITION_INVALID", status: 422 });
    await expect(service.setStatus("member-a", "task-1", "doing")).resolves.toMatchObject({ status: "doing" });
    await expect(service.setStatus("member-a", "task-1", "doing")).resolves.toMatchObject({ status: "doing" }); // 幂等重发
    const done = await service.setStatus("member-a", "task-1", "done");
    expect(done.progress).toBe(100);
    expect(done.completedAt).toBe(NOW.toISOString());
    await expect(service.setProgress("member-a", "task-1", 40)).rejects.toMatchObject({ code: "TASK_PROGRESS_INVALID", status: 400 });
    await expect(service.setStatus("member-a", "task-1", "doing")).rejects.toMatchObject({ code: "TASK_TRANSITION_INVALID", status: 422 });
    const reopened = await service.setStatus("member-a", "task-1", "todo");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.progress).toBe(100); // 重开不回退进度
    void created;
  });

  it("validates progress bounds, non-terminal states, and idempotent updates", async () => {
    const service = createService(new FakeTasksRepository());
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await expect(service.setProgress("member-a", "task-1", 101)).rejects.toMatchObject({ code: "TASK_PROGRESS_INVALID", status: 400 });
    await expect(service.setProgress("member-a", "task-1", 2.5)).rejects.toMatchObject({ code: "TASK_PROGRESS_INVALID", status: 400 });
    await expect(service.setProgress("member-a", "task-1", 40)).resolves.toMatchObject({ progress: 40 });
    await expect(service.setProgress("member-a", "task-1", 40)).resolves.toMatchObject({ progress: 40 });
  });

  it("replaces tags with dedupe and limits, keeps owner isolation on every path", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await expect(service.replaceTags("member-a", "task-1", ["urgent", "urgent", "reading"])).resolves.toEqual(["reading", "urgent"]);
    const tooMany = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    await expect(service.replaceTags("member-a", "task-1", tooMany)).rejects.toMatchObject({ code: "TASK_TAG_LIMIT", status: 409 });
    await expect(service.replaceTags("member-a", "task-1", ["x".repeat(33)])).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.get("member-b", "task-1")).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.update("member-b", "task-1", { title: "hacked" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.setStatus("member-b", "task-1", "doing")).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.delete("member-b", "task-1")).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
  });

  it("links only visible knowledge, idempotently, and under the link limit", async () => {
    const repository = new FakeTasksRepository();
    repository.visibleKnowledge.add("knowledge-a");
    const service = createService(repository);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    const link = await service.addLink("member-a", "task-1", "knowledge-a");
    expect(link.knowledgeItemId).toBe("knowledge-a");
    await expect(service.addLink("member-a", "task-1", "knowledge-a")).resolves.toMatchObject({ id: link.id }); // 幂等回读
    await expect(service.addLink("member-a", "task-1", "knowledge-b")).rejects.toMatchObject({ code: "TASK_KNOWLEDGE_NOT_FOUND", status: 404 });
    repository.linkCount = 5;
    await expect(service.addLink("member-a", "task-1", "knowledge-c")).rejects.toMatchObject({ code: "TASK_LINK_LIMIT", status: 409 });
  });
});

function createService(repository: FakeTasksRepository, audit?: FakeAudit): TasksService {
  let next = 0;
  return new TasksService(repository, {
    id: () => `generated-${++next}`,
    now: () => NOW,
    ...(audit ? { audit } : {}),
  });
}

class FakeAudit {
  readonly events: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  async writeAudit(input: { action: string; metadata: Record<string, unknown> }) {
    this.events.push({ action: input.action, metadata: input.metadata });
    return input as never;
  }
}

class FakeTasksRepository implements TasksRepositoryPort {
  tasks = new Map<string, Task>();
  tags = new Map<string, string[]>();
  links = new Map<string, TaskLink>();
  visibleKnowledge = new Set<string>(["knowledge-a"]);
  count = 0;
  linkCount = 0;

  async insert(input: TaskCreate): Promise<boolean> {
    if (this.tasks.has(input.id)) return false;
    this.tasks.set(input.id, {
      id: input.id, memberId: input.memberId, title: input.title, notes: input.notes, status: "todo", progress: 0,
      priority: input.priority, dueAt: input.dueAt === null ? null : new Date(input.dueAt).toISOString(),
      completedAt: null, createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString(),
    });
    return true;
  }
  async findOwned(memberId: string, id: string) {
    const task = this.tasks.get(id);
    return task && task.memberId === memberId ? task : null;
  }
  async list(memberId: string, request: TaskListRequest): Promise<TaskPage> {
    return { items: [...this.tasks.values()].filter((task) => task.memberId === memberId).slice(0, request.limit) };
  }
  async update(memberId: string, id: string, input: TaskUpdate) {
    const task = await this.findOwned(memberId, id);
    if (!task) return null;
    Object.assign(task, { title: input.title, notes: input.notes, priority: input.priority, updatedAt: new Date(input.updatedAt).toISOString() });
    return task;
  }
  async updateStatus(memberId: string, id: string, status: Task["status"], completedAt: number | null, progress: number, updatedAt: number) {
    const task = await this.findOwned(memberId, id);
    if (!task) return null;
    Object.assign(task, { status, progress, completedAt: completedAt === null ? null : new Date(completedAt).toISOString(), updatedAt: new Date(updatedAt).toISOString() });
    return task;
  }
  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number) {
    const task = await this.findOwned(memberId, id);
    if (!task) return null;
    Object.assign(task, { progress, updatedAt: new Date(updatedAt).toISOString() });
    return task;
  }
  async delete(memberId: string, id: string) {
    return (await this.findOwned(memberId, id)) !== null && this.tasks.delete(id);
  }
  async countByMember(memberId: string) { return this.count || [...this.tasks.values()].filter((task) => task.memberId === memberId).length; }
  async summary(): Promise<TaskSummary> { return { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 }; }
  async listTags(memberId: string, taskId: string) { return this.tags.get(taskId) ?? []; }
  async replaceTags(memberId: string, taskId: string, tags: readonly string[]) { this.tags.set(taskId, [...tags]); }
  async listLinks(memberId: string, taskId: string) { return [...this.links.values()].filter((link) => link.taskId === taskId); }
  async insertLink(link: TaskLinkInsert) {
    if (this.links.has(link.id)) return false;
    this.links.set(link.id, { id: link.id, taskId: link.taskId, knowledgeItemId: link.knowledgeItemId, knowledgeTitle: "Title", createdAt: new Date(link.createdAt).toISOString() });
    return true;
  }
  async findLink(memberId: string, taskId: string, knowledgeItemId: string) {
    return [...this.links.values()].find((link) => link.taskId === taskId && link.knowledgeItemId === knowledgeItemId) ?? null;
  }
  async deleteLink(memberId: string, taskId: string, linkId: string) { return this.links.delete(linkId); }
  async countLinks(memberId: string, taskId: string) { return this.linkCount || [...this.links.values()].filter((link) => link.taskId === taskId).length; }
  async isKnowledgeVisible(memberId: string, knowledgeItemId: string) { return this.visibleKnowledge.has(knowledgeItemId); }
}
```

注:FakeAudit/writeAudit 的参数形状只需覆盖 `action`/`metadata`,Task 4 会把真实类型换成 `CreateAuditEvent`;单测在 Task 4 后保持通过(服务只传合法事件)。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/tasks-service.test.ts`
Expected: FAIL(找不到 `../../src/tasks/service` 模块)。

- [ ] **Step 3: 实现 service.ts(本任务先不含审计调用,Task 4 接入)**

`src/tasks/service.ts`:

```ts
import { APP_CONFIG } from "../config";
import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { AuditRepository } from "../audit/repository";
import type { TasksRepositoryPort } from "./repository";
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskLink, type TaskListFilters, type TaskPage, type TaskStatus, type TaskSummary } from "./types";

export interface TaskCreateInput { id?: unknown; title?: unknown; notes?: unknown; priority?: unknown; dueAt?: unknown; knowledgeItemId?: unknown; }
export interface TaskUpdateInput { title?: unknown; notes?: unknown; priority?: unknown; dueAt?: unknown; }

export interface TaskDetail { task: Task; tags: string[]; links: TaskLink[]; }

export interface TasksServiceOptions {
  id?: () => string;
  now?: () => Date;
  audit?: Pick<AuditRepository, "writeAudit">;
}

/** 合法状态迁移表;done/canceled 为终态,仅可重开回 todo。 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["doing", "done", "canceled"],
  doing: ["todo", "blocked", "done", "canceled"],
  blocked: ["todo", "doing", "done", "canceled"],
  done: ["todo"],
  canceled: ["todo"],
};

export class TasksService {
  private readonly id: () => string;
  private readonly now: () => Date;

  constructor(private readonly repository: TasksRepositoryPort, private readonly options: TasksServiceOptions = {}) {
    this.id = options.id || (() => crypto.randomUUID());
    this.now = options.now || (() => new Date());
  }

  async create(memberId: string, input: TaskCreateInput): Promise<{ task: Task; created: boolean; link?: TaskLink }> {
    const normalized = normalizeCreate(input);
    const existing = await this.repository.findOwned(memberId, normalized.id);
    if (existing) return { task: existing, created: false };
    if (await this.repository.countByMember(memberId) >= APP_CONFIG.maxTasksPerMember) {
      throw new AppError("TASK_LIMIT_REACHED", "Task limit reached", 409);
    }
    const now = this.now().getTime();
    const inserted = await this.repository.insert({
      id: normalized.id, memberId, title: normalized.title, notes: normalized.notes,
      priority: normalized.priority, dueAt: normalized.dueAt, createdAt: now, updatedAt: now,
    });
    const task = await this.repository.findOwned(memberId, normalized.id);
    if (!task) throw new AppError("TASK_NOT_FOUND", "Task not found", 404, true);
    let link: TaskLink | undefined;
    if (normalized.knowledgeItemId) {
      link = (await this.linkKnowledge(memberId, task, normalized.knowledgeItemId)).link;
    }
    return { task, created: inserted, ...(link ? { link } : {}) };
  }

  async get(memberId: string, id: string): Promise<TaskDetail> {
    const task = await this.requireOwned(memberId, id);
    return { task, tags: await this.repository.listTags(memberId, task.id), links: await this.repository.listLinks(memberId, task.id) };
  }

  async list(memberId: string, request?: PageRequest & { filters?: TaskListFilters }): Promise<TaskPage> {
    return this.repository.list(memberId, {
      ...parsePageRequest(request?.limit, request?.cursor),
      filters: normalizeFilters(request?.filters),
    });
  }

  async summary(memberId: string): Promise<TaskSummary> {
    return this.repository.summary(memberId, this.now());
  }

  async update(memberId: string, id: string, input: TaskUpdateInput): Promise<Task> {
    await this.requireOwned(memberId, id);
    const normalized = normalizeUpdate(input);
    const updated = await this.repository.update(memberId, id, { ...normalized, updatedAt: this.now().getTime() });
    if (!updated) throw notFound();
    return updated;
  }

  async delete(memberId: string, id: string): Promise<void> {
    const task = await this.requireOwned(memberId, id);
    if (!await this.repository.delete(memberId, id)) throw notFound();
    return void task;
  }

  async setStatus(memberId: string, id: string, status: unknown): Promise<Task> {
    const task = await this.requireOwned(memberId, id);
    const next = normalizeStatus(status);
    if (task.status === next) return task; // 绝对值语义:重复提交即成功
    if (!TRANSITIONS[task.status].includes(next)) {
      throw new AppError("TASK_TRANSITION_INVALID", "Task status transition is invalid", 422);
    }
    const now = this.now().getTime();
    const completedAt = next === "done" ? now : null;
    const progress = next === "done" && task.progress < 100 ? 100 : task.progress;
    const updated = await this.repository.updateStatus(memberId, id, next, next === "done" ? completedAt : null, progress, now);
    if (!updated) throw notFound();
    return updated;
  }

  async setProgress(memberId: string, id: string, progress: unknown): Promise<Task> {
    const task = await this.requireOwned(memberId, id);
    if (task.status === "done" || task.status === "canceled") {
      throw new AppError("TASK_PROGRESS_INVALID", "Task progress is not editable in a terminal status", 400);
    }
    if (typeof progress !== "number" || !Number.isSafeInteger(progress) || progress < 0 || progress > 100) {
      throw new AppError("TASK_PROGRESS_INVALID", "Task progress must be an integer from 0 to 100", 400);
    }
    if (task.progress === progress) return task; // 幂等
    const updated = await this.repository.updateProgress(memberId, id, progress, this.now().getTime());
    if (!updated) throw notFound();
    return updated;
  }

  async replaceTags(memberId: string, id: string, tags: unknown): Promise<string[]> {
    const task = await this.requireOwned(memberId, id);
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string")) {
      throw invalid("TASK_INVALID", "Task fields are invalid");
    }
    const normalized = [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))];
    if (normalized.length > APP_CONFIG.maxTaskTags) {
      throw new AppError("TASK_TAG_LIMIT", "Task tag limit reached", 409);
    }
    if (normalized.some((tag) => [...tag].length > APP_CONFIG.maxTaskTagChars || /[\u0000-\u001f\u007f-\u009f]/u.test(tag))) {
      throw invalid("TASK_INVALID", "Task fields are invalid");
    }
    await this.repository.replaceTags(memberId, task.id, normalized);
    return normalized;
  }

  async addLink(memberId: string, taskId: string, knowledgeItemId: unknown): Promise<TaskLink> {
    const task = await this.requireOwned(memberId, taskId);
    if (typeof knowledgeItemId !== "string" || !validId(knowledgeItemId)) {
      throw invalid("TASK_INVALID", "Task fields are invalid");
    }
    return (await this.linkKnowledge(memberId, task, knowledgeItemId)).link;
  }

  async removeLink(memberId: string, taskId: string, linkId: string): Promise<void> {
    await this.requireOwned(memberId, taskId);
    if (!await this.repository.deleteLink(memberId, taskId, linkId)) throw notFound();
  }

  private async linkKnowledge(memberId: string, task: Task, knowledgeItemId: string): Promise<{ link: TaskLink; created: boolean }> {
    const existing = await this.repository.findLink(memberId, task.id, knowledgeItemId);
    if (existing) return { link: existing, created: false };
    if (!await this.repository.isKnowledgeVisible(memberId, knowledgeItemId)) {
      throw new AppError("TASK_KNOWLEDGE_NOT_FOUND", "Knowledge item is not visible", 404);
    }
    if (await this.repository.countLinks(memberId, task.id) >= APP_CONFIG.maxTaskLinksPerTask) {
      throw new AppError("TASK_LINK_LIMIT", "Task link limit reached", 409);
    }
    const inserted = await this.repository.insertLink({
      id: this.id(), taskId: task.id, memberId, knowledgeItemId, createdAt: this.now().getTime(),
    });
    const link = await this.repository.findLink(memberId, task.id, knowledgeItemId);
    if (!link) throw new AppError("TASK_NOT_FOUND", "Task not found", 404, true);
    return { link, created: inserted };
  }

  private async requireOwned(memberId: string, id: string): Promise<Task> {
    if (!validId(id)) throw notFound();
    const task = await this.repository.findOwned(memberId, id);
    if (!task) throw notFound();
    return task;
  }
}

function normalizeCreate(input: TaskCreateInput): {
  id: string; title: string; notes: string; priority: Task["priority"]; dueAt: number | null; knowledgeItemId: string | null;
} {
  if (!input || typeof input !== "object") throw invalid("TASK_INVALID", "Task fields are invalid");
  const record = input as Record<string, unknown>;
  const id = record.id === undefined ? "" : record.id;
  if (typeof id !== "string" || !validId(id)) throw invalid("TASK_INVALID", "Task fields are invalid");
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || [...title].length > APP_CONFIG.maxTaskTitleChars || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const notes = record.notes === undefined || record.notes === null ? "" : record.notes;
  if (typeof notes !== "string" || [...notes].length > APP_CONFIG.maxTaskNotesChars || /[\u0000-\u001f\u007f-\u009f]/u.test(notes)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const priority = record.priority === undefined ? "medium" : record.priority;
  if (typeof priority !== "string" || !TASK_PRIORITIES.includes(priority as Task["priority"])) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const dueAtMs = parseOptionalDue(record.dueAt);
  const knowledgeItemId = record.knowledgeItemId === undefined || record.knowledgeItemId === null ? null : record.knowledgeItemId;
  if (knowledgeItemId !== null && (typeof knowledgeItemId !== "string" || !validId(knowledgeItemId))) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  return {
    id, title, notes, priority: priority as Task["priority"], dueAt: dueAtMs,
    knowledgeItemId: knowledgeItemId as string | null,
  };
}

function normalizeUpdate(input: TaskUpdateInput): { title: string; notes: string; priority: Task["priority"]; dueAt: number | null } {
  if (!input || typeof input !== "object") throw invalid("TASK_INVALID", "Task fields are invalid");
  const record = input as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || [...title].length > APP_CONFIG.maxTaskTitleChars || /[\u0000-\u001f\u007f-\u009f]/u.test(title)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const notes = record.notes === undefined || record.notes === null ? "" : record.notes;
  if (typeof notes !== "string" || [...notes].length > APP_CONFIG.maxTaskNotesChars || /[\u0000-\u001f\u007f-\u009f]/u.test(notes)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  const priority = record.priority === undefined ? "medium" : record.priority;
  if (typeof priority !== "string" || !TASK_PRIORITIES.includes(priority as Task["priority"])) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  return { title, notes, priority: priority as Task["priority"], dueAt: parseOptionalDue(record.dueAt) };
}

function normalizeFilters(value?: TaskListFilters): TaskListFilters {
  if (!value) return {};
  const filters: TaskListFilters = {};
  if (value.status !== undefined) {
    if (typeof value.status !== "string" || !TASK_STATUSES.includes(value.status)) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.status = value.status;
  }
  if (value.priority !== undefined) {
    if (typeof value.priority !== "string" || !TASK_PRIORITIES.includes(value.priority)) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.priority = value.priority;
  }
  if (value.tag !== undefined) {
    if (typeof value.tag !== "string" || !value.tag || [...value.tag].length > APP_CONFIG.maxTaskTagChars) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.tag = value.tag;
  }
  if (value.due !== undefined) {
    if (value.due !== "today" && value.due !== "overdue" && value.due !== "none") throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.due = value.due;
  }
  if (value.q !== undefined) {
    if (typeof value.q !== "string" || [...value.q].length > APP_CONFIG.maxTaskTitleChars) throw invalid("TASK_PAGE_INVALID", "Task filters are invalid");
    filters.q = value.q.trim();
  }
  return filters;
}

function normalizeStatus(status: unknown): TaskStatus {
  if (typeof status !== "string" || !TASK_STATUSES.includes(status as TaskStatus)) {
    throw invalid("TASK_INVALID", "Task fields are invalid");
  }
  return status as TaskStatus;
}

/** 接受 ISO 字符串或 epoch 毫秒;null/undefined 清空截止日。 */
function parseOptionalDue(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return ms;
  }
  throw invalid("TASK_INVALID", "Task fields are invalid");
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
}

function invalid(code: "TASK_INVALID" | "TASK_PAGE_INVALID", message: string): AppError {
  return new AppError(code, message, 400);
}

function notFound(): AppError {
  return new AppError("TASK_NOT_FOUND", "Task not found", 404);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/tasks-service.test.ts`
Expected: 6 个测试 PASS。若 `AppError` 构造不支持第 4 参数 `retryable`,参照 `src/http.ts:3` 的实际签名调整(`new AppError(code, message, status)` 即可)。

- [ ] **Step 5: Commit**

```bash
git add src/tasks/service.ts test/unit/tasks-service.test.ts
git commit -m "feat: add tasks service with status machine and idempotency"
```

---

### Task 4: 审计动作注册 + 服务层审计接入

**Files:**
- Modify: `src/audit/types.ts`(AuditActionMap、auditActions、validateMetadata)
- Modify: `src/tasks/service.ts`(接入 writeAudit)
- Test: `test/unit/tasks-service.test.ts`(追加断言)

**Interfaces:**
- Consumes: `TasksService`(Task 3)。
- Produces: 审计动作 `task.created/task.updated/task.status_changed/task.progress_changed/task.tags_replaced/task.deleted/task.linked/task.unlinked`,resourceType 统一 `"task"`。

- [ ] **Step 1: 在单测中追加审计断言(先失败)**

在 `test/unit/tasks-service.test.ts` 的 `describe("TasksService", ...)` 内追加:

```ts
  it("writes audit events for every mutation and skips idempotent replays", async () => {
    const repository = new FakeTasksRepository();
    repository.visibleKnowledge.add("knowledge-a");
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    await service.create("member-a", { id: "task-1", title: "Alpha", knowledgeItemId: "knowledge-a" });
    await service.create("member-a", { id: "task-1", title: "Alpha" }); // 幂等重放,不审计
    await service.setProgress("member-a", "task-1", 40);
    await service.setProgress("member-a", "task-1", 40); // 幂等,不审计
    await service.setStatus("member-a", "task-1", "doing");
    await service.setStatus("member-a", "task-1", "doing"); // 幂等,不审计
    await service.replaceTags("member-a", "task-1", ["urgent"]);
    await service.update("member-a", "task-1", { title: "Alpha v2", priority: "high" });
    await service.addLink("member-a", "task-1", "knowledge-a"); // 已在创建时关联,幂等回读,不审计
    const done = await service.setStatus("member-a", "task-1", "done");
    await service.delete("member-a", "task-1");
    expect(audit.events.map((event) => event.action)).toEqual([
      "task.created", "task.progress_changed", "task.status_changed", "task.tags_replaced",
      "task.updated", "task.status_changed", "task.deleted",
    ]);
    expect(audit.events[0]?.metadata).toEqual({ status: "todo", priority: "medium" });
    expect(audit.events.at(-1)?.metadata).toEqual({ status: done.status });
    expect(audit.events.find((event) => event.action === "task.status_changed" && event.metadata.previousStatus === "doing")?.metadata)
      .toEqual({ previousStatus: "doing", status: "done" });
  });

  it("audits unlinks with the knowledge item id", async () => {
    const repository = new FakeTasksRepository();
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    const link = await service.addLink("member-a", "task-1", "knowledge-a");
    await service.removeLink("member-a", "task-1", link.id);
    expect(audit.events.map((event) => event.action)).toEqual(["task.created", "task.linked", "task.unlinked"]);
    expect(audit.events[2]?.metadata).toEqual({ knowledgeItemId: "knowledge-a" });
  });
```

同时把 `FakeAudit` 改为接收完整的 `CreateAuditEvent`(文件顶部补 `import type { CreateAuditEvent } from "../../src/audit/types";`):

```ts
class FakeAudit {
  readonly events: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  async writeAudit(input: CreateAuditEvent) {
    this.events.push({ action: input.action, metadata: input.metadata as unknown as Record<string, unknown> });
    return input;
  }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/tasks-service.test.ts`
Expected: 新增 2 个测试 FAIL(`audit.events` 为空——服务尚未写审计)。

- [ ] **Step 3: 注册审计动作**

`src/audit/types.ts`:

1. 顶部 import 区追加:`import type { TaskPriority, TaskStatus } from "../tasks/types";`
2. `AuditActionMap` 内 `"agent.tool_called"` 条目之后追加:

```ts
  "task.created": { resourceType: "task"; metadata: { status: TaskStatus; priority: TaskPriority } };
  "task.updated": { resourceType: "task"; metadata: { priority: TaskPriority } };
  "task.status_changed": { resourceType: "task"; metadata: { previousStatus: TaskStatus; status: TaskStatus } };
  "task.progress_changed": { resourceType: "task"; metadata: { progress: number } };
  "task.tags_replaced": { resourceType: "task"; metadata: { count: number } };
  "task.deleted": { resourceType: "task"; metadata: { status: TaskStatus } };
  "task.linked": { resourceType: "task"; metadata: { knowledgeItemId: string } };
  "task.unlinked": { resourceType: "task"; metadata: { knowledgeItemId: string } };
```

3. `auditActions` 数组末尾(`"agent.tool_called",` 之后)追加同名 8 个字符串;
4. `validateMetadata` 的 switch 中 `"agent.tool_called"` case 之后追加:

```ts
    case "task.created": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["status", "priority"]));
      if (!isTaskStatus(metadata.status) || !isTaskPriority(metadata.priority)) throw invalidMetadata();
      return safeMetadata({ status: metadata.status, priority: metadata.priority });
    }
    case "task.updated": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["priority"]));
      if (!isTaskPriority(metadata.priority)) throw invalidMetadata();
      return safeMetadata({ priority: metadata.priority });
    }
    case "task.status_changed": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["previousStatus", "status"]));
      if (!isTaskStatus(metadata.previousStatus) || !isTaskStatus(metadata.status)) throw invalidMetadata();
      return safeMetadata({ previousStatus: metadata.previousStatus, status: metadata.status });
    }
    case "task.progress_changed": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["progress"]));
      if (typeof metadata.progress !== "number" || !Number.isSafeInteger(metadata.progress)
        || metadata.progress < 0 || metadata.progress > 100) throw invalidMetadata();
      return safeMetadata({ progress: metadata.progress });
    }
    case "task.tags_replaced": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["count"]));
      if (typeof metadata.count !== "number" || !Number.isSafeInteger(metadata.count)
        || metadata.count < 0 || metadata.count > 10) throw invalidMetadata();
      return safeMetadata({ count: metadata.count });
    }
    case "task.deleted": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["status"]));
      if (!isTaskStatus(metadata.status)) throw invalidMetadata();
      return safeMetadata({ status: metadata.status });
    }
    case "task.linked":
    case "task.unlinked": {
      assertResourceType(resourceType, "task");
      const metadata = readPlainDataObject(input, new Set(["knowledgeItemId"]));
      if (!isBoundedId(metadata.knowledgeItemId)) throw invalidMetadata();
      return safeMetadata({ knowledgeItemId: metadata.knowledgeItemId });
    }
```

5. 文件底部校验 helper 区追加:

```ts
function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "doing" || value === "blocked" || value === "done" || value === "canceled";
}
function isTaskPriority(value: unknown): value is TaskPriority {
  return value === "low" || value === "medium" || value === "high";
}
```

- [ ] **Step 4: 服务层接入审计**

`src/tasks/service.ts`:

1. 顶部追加 `import type { AuditAction, CreateAuditEvent } from "../audit/types";`
2. 类内追加私有方法:

```ts
  private async emitAudit(action: AuditAction, memberId: string, taskId: string, metadata: CreateAuditEvent["metadata"]): Promise<void> {
    if (!this.options.audit) return;
    await this.options.audit.writeAudit({
      id: this.id(), actorKind: "member", actorId: memberId, action,
      resourceType: "task", resourceId: taskId, metadata, createdAt: this.now().toISOString(),
    } as CreateAuditEvent);
  }
```

3. 各方法插入调用(仅在真实变更时;幂等 early-return 分支不审计):
   - `create`:`inserted === true` 时 `await this.emitAudit("task.created", memberId, task.id, { status: "todo", priority: normalized.priority });`
   - `update`:更新成功后 `await this.emitAudit("task.updated", memberId, updated.id, { priority: normalized.priority });`
   - `delete`:删除成功后 `await this.emitAudit("task.deleted", memberId, task.id, { status: task.status });`
   - `setStatus`:仅在 `task.status !== next` 分支内、更新成功后 `await this.emitAudit("task.status_changed", memberId, updated.id, { previousStatus: task.status, status: next });`
   - `setProgress`:仅在进度变化分支内 `await this.emitAudit("task.progress_changed", memberId, updated.id, { progress });`
   - `replaceTags`:替换后 `await this.emitAudit("task.tags_replaced", memberId, task.id, { count: normalized.length });`
   - `linkKnowledge`:`created === true` 时 `await this.emitAudit("task.linked", memberId, task.id, { knowledgeItemId });`
   - `removeLink`:改为先 `const links = await this.repository.listLinks(memberId, taskId); const target = links.find((item) => item.id === linkId); if (!target) throw notFound();`,删除成功后 `await this.emitAudit("task.unlinked", memberId, taskId, { knowledgeItemId: target.knowledgeItemId });`

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/unit/tasks-service.test.ts && npx vitest run test/unit/audit.test.ts && npx tsc --noEmit`
Expected: 全部 PASS(若既有 `test/unit/audit.test.ts` 枚举全部动作,按其现有模式补 task.* 条目)。

- [ ] **Step 6: Commit**

```bash
git add src/audit/types.ts src/tasks/service.ts test/unit/tasks-service.test.ts
git commit -m "feat: audit task lifecycle events"
```

---

### Task 5: `src/routes/tasks.ts` + `src/app.ts` 接线 + HTTP 契约测试

**Files:**
- Create: `src/routes/tasks.ts`
- Modify: `src/app.ts`(import、createRequestServices、dispatchApiRequest、workspaceRoutes)
- Test: `test/worker/tasks.test.ts`(追加 HTTP describe 块)

**Interfaces:**
- Consumes: `TasksService`(Task 3/4)、`requireCapability`("tasks:use",Task 1)。
- Produces: `/api/tasks*` 全部端点(见规格第 4 节);`MemberRouteServices` 风格的 `TasksRouteServices { tasks: TasksService }`。

- [ ] **Step 1: 写失败 HTTP 契约测试**

在 `test/worker/tasks.test.ts` 底部追加(harness 仿 `test/worker/favorites.test.ts`):

```ts
import { createExecutionContext } from "cloudflare:test";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";

describe("tasks HTTP contract", () => {
  let sessionA = "";
  let sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await seedKnowledge("member-a");
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => new Date(NOW) });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-b"))!)).token;
  });

  it("creates idempotently, lists, updates, transitions, and deletes", async () => {
    const created = await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha", priority: "high", dueAt: "2026-08-30T00:00:00.000Z" }) });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ task: { id: "task-1", title: "Alpha", status: "todo", priority: "high" }, created: true });
    const replay = await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ created: false });
    await expect((await api("/api/tasks?limit=20", sessionA)).json()).resolves.toMatchObject({ items: [{ id: "task-1" }] });
    await expect((await api("/api/tasks/summary", sessionA)).json()).resolves.toMatchObject({ todo: 1 });
    await expect((await api("/api/tasks/task-1", sessionA)).json()).resolves.toMatchObject({ task: { id: "task-1" }, tags: [], links: [] });
    const patched = await api("/api/tasks/task-1", sessionA, { method: "PATCH", body: JSON.stringify({ title: "Alpha v2", notes: "note", priority: "low", dueAt: null }) });
    expect(await patched.json()).toMatchObject({ task: { title: "Alpha v2", priority: "low", dueAt: null } });
    const status = await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "doing" }) });
    expect(await status.json()).toMatchObject({ status: "doing" });
    const progress = await api("/api/tasks/task-1/progress", sessionA, { method: "POST", body: JSON.stringify({ progress: 40 }) });
    expect(await progress.json()).toMatchObject({ progress: 40 });
    const tags = await api("/api/tasks/task-1/tags", sessionA, { method: "PUT", body: JSON.stringify({ tags: ["urgent"] }) });
    expect(await tags.json()).toEqual({ tags: ["urgent"] });
    const linked = await api("/api/tasks/task-1/links", sessionA, { method: "POST", body: JSON.stringify({ knowledgeItemId: "knowledge-a" }) });
    expect(await linked.json()).toMatchObject({ link: { knowledgeItemId: "knowledge-a", knowledgeTitle: "Alpha Guide" } });
    const detail = await api("/api/tasks/task-1", sessionA);
    expect(await detail.json()).toMatchObject({ tags: ["urgent"], links: [{ knowledgeItemId: "knowledge-a" }] });
    const unlinked = await api(`/api/tasks/task-1/links/${(await (await api("/api/tasks/task-1", sessionA)).json()).links[0].id}`, sessionA, { method: "DELETE" });
    expect(unlinked.status).toBe(204);
    const removed = await api("/api/tasks/task-1", sessionA, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect((await api("/api/tasks?limit=20", sessionA)).status).toBe(200);
  });

  it("returns 404 for another member's task on every path (IDOR)", async () => {
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    for (const [path, init] of [
      ["/api/tasks/task-1", { method: "GET" }],
      ["/api/tasks/task-1", { method: "PATCH", body: JSON.stringify({ title: "hacked" }) }],
      ["/api/tasks/task-1", { method: "DELETE" }],
      ["/api/tasks/task-1/status", { method: "POST", body: JSON.stringify({ status: "doing" }) }],
      ["/api/tasks/task-1/progress", { method: "POST", body: JSON.stringify({ progress: 10 }) }],
      ["/api/tasks/task-1/tags", { method: "PUT", body: JSON.stringify({ tags: ["x"] }) }],
      ["/api/tasks/task-1/links", { method: "POST", body: JSON.stringify({ knowledgeItemId: "knowledge-a" }) }],
    ] as const) {
      expect((await api(path, sessionB, init)).status).toBe(404);
    }
  });

  it("rejects anonymous, automation, CSRF-forged, and invalid-transition requests", async () => {
    expect((await api("/api/tasks?limit=20", "")).status).toBe(401);
    const automation = await fetch("https://memory.crgmhrc.asia/api/tasks?limit=20", {
      headers: { authorization: "Bearer worker-test-token" },
    });
    expect(automation.status).toBe(403);
    const forged = await new Request("https://memory.crgmhrc.asia/api/tasks", {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${sessionA}`, "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ id: "task-x", title: "Forged" }),
    });
    const context = createExecutionContext();
    const response = await createApp().fetch!(forged as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(403);
    await api("/api/tasks", sessionA, { method: "POST", body: JSON.stringify({ id: "task-1", title: "Alpha" }) });
    const transition = await api("/api/tasks/task-1/status", sessionA, { method: "POST", body: JSON.stringify({ status: "done" }) });
    expect(transition.status).toBe(422);
    const audit = await env.DB.prepare("SELECT action FROM audit_events WHERE action LIKE 'task.%' ORDER BY created_at").all<{ action: string }>();
    expect(audit.results.map((row) => row.action)).toEqual(["task.created"]);
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
```

顶部 import 修正为:`import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";`(补充 `waitOnExecutionContext`)。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/worker/tasks.test.ts`
Expected: HTTP describe 3 个测试 FAIL(404,路由不存在)。

- [ ] **Step 3: 实现 routes/tasks.ts**

`src/routes/tasks.ts`:

```ts
import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { TasksService } from "../tasks/service";
import type { TaskDueFilter, TaskListFilters, TaskPriority, TaskStatus } from "../tasks/types";
import { pageRequest } from "./member";
import { strictRecord } from "./member";

export interface TasksRouteServices { tasks: TasksService; }

export async function routeTasksApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: TasksRouteServices,
): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/tasks")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);

  if (url.pathname === "/api/tasks") {
    if (request.method === "GET") {
      requireExactQuery(url, ["limit", "cursor", "status", "priority", "tag", "due", "q"]);
      const filters = taskFilters(url);
      return jsonResponse(await services.tasks.list(member.memberId, { ...pageRequest(url), filters }), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["id", "title", "notes", "priority", "dueAt", "knowledgeItemId"],
      "TASK_INVALID",
    );
    const result = await services.tasks.create(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  if (url.pathname === "/api/tasks/summary") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.tasks.summary(member.memberId), 200, context.requestId);
  }

  const status = /^\/api\/tasks\/([^/]+)\/status$/.exec(url.pathname);
  if (status) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["status"], "TASK_INVALID");
    return jsonResponse(await services.tasks.setStatus(member.memberId, decodePathId(status[1]!), input.status), 200, context.requestId);
  }

  const progress = /^\/api\/tasks\/([^/]+)\/progress$/.exec(url.pathname);
  if (progress) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["progress"], "TASK_INVALID");
    return jsonResponse(await services.tasks.setProgress(member.memberId, decodePathId(progress[1]!), input.progress), 200, context.requestId);
  }

  const tags = /^\/api\/tasks\/([^/]+)\/tags$/.exec(url.pathname);
  if (tags) {
    if (request.method !== "PUT") return methodNotAllowed("PUT", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["tags"], "TASK_INVALID");
    return jsonResponse({ tags: await services.tasks.replaceTags(member.memberId, decodePathId(tags[1]!), input.tags) }, 200, context.requestId);
  }

  const links = /^\/api\/tasks\/([^/]+)\/links$/.exec(url.pathname);
  if (links) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["knowledgeItemId"], "TASK_INVALID");
    return jsonResponse({ link: await services.tasks.addLink(member.memberId, decodePathId(links[1]!), input.knowledgeItemId) }, 201, context.requestId);
  }

  const link = /^\/api\/tasks\/([^/]+)\/links\/([^/]+)$/.exec(url.pathname);
  if (link) {
    if (request.method !== "DELETE") return methodNotAllowed("DELETE", context);
    requireNoQuery(url);
    await services.tasks.removeLink(member.memberId, decodePathId(link[1]!), decodePathId(link[2]!));
    return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": context.requestId } });
  }

  const task = /^\/api\/tasks\/([^/]+)$/.exec(url.pathname);
  if (task) {
    requireNoQuery(url);
    const id = decodePathId(task[1]!);
    if (request.method === "GET") return jsonResponse(await services.tasks.get(member.memberId, id), 200, context.requestId);
    if (request.method === "PATCH") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["title", "notes", "priority", "dueAt"], "TASK_INVALID");
      return jsonResponse(await services.tasks.update(member.memberId, id, input), 200, context.requestId);
    }
    if (request.method === "DELETE") {
      await services.tasks.delete(member.memberId, id);
      return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": context.requestId } });
    }
    return methodNotAllowed("DELETE, GET, PATCH", context);
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function taskFilters(url: URL): TaskListFilters {
  const filters: TaskListFilters = {};
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const tag = url.searchParams.get("tag");
  const due = url.searchParams.get("due");
  const q = url.searchParams.get("q");
  if (status !== null) filters.status = status as TaskStatus;
  if (priority !== null) filters.priority = priority as TaskPriority;
  if (tag !== null) filters.tag = tag;
  if (due !== null) filters.due = due as TaskDueFilter;
  if (q !== null) filters.q = q;
  return filters;
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function requireExactQuery(url: URL, allowedKeys: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new AppError("TASK_PAGE_INVALID", "Task query parameters are invalid", 400);
    }
  }
}
```

(若 `src/routes/member.ts` 未导出 `strictRecord`/`pageRequest` 之外的 helper,直接从该文件 import;它们均已 `export`。)

- [ ] **Step 4: app.ts 接线**

`src/app.ts` 四处修改:

1. import 区(savedViews import 旁)追加:

```ts
import { TasksRepository } from "./tasks/repository";
import { TasksService } from "./tasks/service";
import { routeTasksApi } from "./routes/tasks";
```

2. `workspaceRoutes` 集合中 `"/my-submissions",` 之后追加 `"/tasks",`;
3. `createRequestServices` 返回对象中 `savedViews: ...` 行之后追加:

```ts
    tasks: new TasksService(new TasksRepository(env.DB), { audit }),
```

4. `dispatchApiRequest` 中 `const member = await routeMemberApi(...)` 之后、`routeAdminApi` 之前追加:

```ts
  const tasks = await routeTasksApi(request, url, context, principal, { tasks: services.tasks });
  if (tasks) return tasks;
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/worker/tasks.test.ts && npx tsc --noEmit`
Expected: repository 5 + HTTP 3 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/routes/tasks.ts src/app.ts test/worker/tasks.test.ts
git commit -m "feat: expose tasks API endpoints"
```

---

### Task 6: 前端数据层 `frontend/lib/tasks-data.ts` + `frontend/pages/tasks/tasks-model.ts`

**Files:**
- Create: `frontend/lib/tasks-data.ts`
- Create: `frontend/pages/tasks/tasks-model.ts`
- Test: `test/unit/frontend-tasks-data.test.ts`

**Interfaces:**
- Consumes: `apiFetch`(现有)。
- Produces(Task 7/9 依赖):`TaskItem`/`TaskSummary`/`TaskLinkItem` 类型;`loadTasks(filters, cursor?)`、`loadTaskSummary()`、`createTask(input)`(内部生成 `crypto.randomUUID()` 幂等键)、`loadTaskDetail(id)`、`updateTask(id, patch)`、`deleteTask(id)`、`setTaskStatus(id, status)`、`setTaskProgress(id, progress)`、`replaceTaskTags(id, tags)`、`addTaskLink(taskId, knowledgeItemId)`、`removeTaskLink(taskId, linkId)`;model 侧 `taskStatusKey/taskPriorityKey/dueInfo/isTerminalStatus`。

- [ ] **Step 1: 写失败测试**

`test/unit/frontend-tasks-data.test.ts`(仿 `test/unit/frontend-saved-views.test.ts` 的 fake fetcher 模式):

```ts
import { describe, expect, it } from "vitest";
import { createTask, loadTaskSummary, loadTasks, deleteTask } from "../../frontend/lib/tasks-data";
import { dueInfo, taskPriorityKey, taskStatusKey } from "../../frontend/pages/tasks/tasks-model";

function fetchJson(payload: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("tasks data layer", () => {
  it("loads a normalized page and summary", async () => {
    const page = await loadTasks({}, fetchJson({ items: [{ id: "task-1", title: "Alpha", status: "doing", progress: 40, priority: "high", dueAt: "2026-08-26T00:00:00.000Z" }], nextCursor: "c" }));
    expect(page.items[0]).toMatchObject({ id: "task-1", status: "doing", priority: "high", progress: 40 });
    expect(page.nextCursor).toBe("c");
    const summary = await loadTaskSummary(fetchJson({ todo: 1, doing: 2, blocked: 0, done: 3, canceled: 0, dueToday: 1, overdue: 0 }));
    expect(summary.doing).toBe(2);
  });

  it("creates with a client-generated idempotency key", async () => {
    let captured: Request | undefined;
    const requester = (async (input: RequestInfo | URL) => { captured = new Request(input); return new Response(JSON.stringify({ task: { id: "task-1", title: "Alpha", status: "todo", progress: 0, priority: "medium", createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z" }, created: true }), { status: 201 }); }) as unknown as typeof fetch;
    const result = await createTask({ title: "Alpha" }, requester);
    expect(result.task.title).toBe("Alpha");
    const body = JSON.parse(await (captured as Request).text());
    expect(typeof body.id).toBe("string");
    expect(body.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u);
  });

  it("treats a 404 on delete as success", async () => {
    const gone = (async () => new Response(null, { status: 404, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    await expect(deleteTask("task-gone", gone)).resolves.toBeUndefined();
    const error = (async () => new Response(JSON.stringify({ error: { code: "TASK_NOT_FOUND", message: "x", retryable: false } }), { status: 500 })) as unknown as typeof fetch;
    await expect(deleteTask("task-broken", error)).rejects.toMatchObject({ status: 500 });
  });
});

describe("tasks model", () => {
  it("maps status and priority to i18n keys", () => {
    expect(taskStatusKey("todo")).toBe("TASKS_STATUS_TODO");
    expect(taskStatusKey("canceled")).toBe("TASKS_STATUS_CANCELED");
    expect(taskPriorityKey("high")).toBe("TASKS_PRIORITY_HIGH");
  });

  it("classifies due dates relative to today", () => {
    const today = new Date("2026-08-27T12:00:00.000Z");
    expect(dueInfo("2026-08-26T00:00:00.000Z", "todo", today).kind).toBe("overdue");
    expect(dueInfo("2026-08-27T23:00:00.000Z", "doing", today).kind).toBe("today");
    expect(dueInfo("2026-08-27T23:00:00.000Z", "done", today).kind).toBe("none");
    expect(dueInfo(null, "todo", today).kind).toBe("none");
    expect(dueInfo("2026-09-01T00:00:00.000Z", "todo", today).kind).toBe("later");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/frontend-tasks-data.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 tasks-model.ts**

`frontend/pages/tasks/tasks-model.ts`:

```ts
import type { TaskPriority, TaskStatus } from "./task-types";

export type { TaskPriority, TaskStatus };

export function taskStatusKey(status: TaskStatus): string {
  return { todo: "TASKS_STATUS_TODO", doing: "TASKS_STATUS_DOING", blocked: "TASKS_STATUS_BLOCKED", done: "TASKS_STATUS_DONE", canceled: "TASKS_STATUS_CANCELED" }[status];
}

export function taskPriorityKey(priority: TaskPriority): string {
  return { low: "TASKS_PRIORITY_LOW", medium: "TASKS_PRIORITY_MEDIUM", high: "TASKS_PRIORITY_HIGH" }[priority];
}

export function priorityBadgeClass(priority: TaskPriority): string {
  return priority === "high" ? "border-destructive/40 text-destructive" : priority === "low" ? "text-muted-foreground" : "";
}

export function isTerminalStatus(status: TaskStatus): boolean {
  return status === "done" || status === "canceled";
}

export type DueInfo = { kind: "overdue" | "today" | "later" | "none"; date: Date | null };

/** 终态任务的到期日不再参与今日/逾期判定。 */
export function dueInfo(dueAt: string | null, status: TaskStatus, now = new Date()): DueInfo {
  if (!dueAt || isTerminalStatus(status)) return { kind: "none", date: null };
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return { kind: "none", date: null };
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86_400_000;
  const time = date.getTime();
  if (time < startOfToday) return { kind: "overdue", date };
  if (time < endOfToday) return { kind: "today", date };
  return { kind: "later", date };
}
```

`frontend/pages/tasks/task-types.ts`(前端本地类型,避免从 `src/` 深层 import;页面与数据层共用):

```ts
export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "canceled";
export type TaskPriority = "low" | "medium" | "high";
```

- [ ] **Step 4: 实现 tasks-data.ts**

`frontend/lib/tasks-data.ts`:

```ts
import { ApiRequestError, apiFetch, type Fetcher } from "./api";

export interface TaskItem {
  id: string;
  title: string;
  notes: string;
  status: "todo" | "doing" | "blocked" | "done" | "canceled";
  progress: number;
  priority: "low" | "medium" | "high";
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskLinkItem { id: string; taskId: string; knowledgeItemId: string; knowledgeTitle: string | null; createdAt: string; }
export interface TaskSummary { todo: number; doing: number; blocked: number; done: number; canceled: number; dueToday: number; overdue: number; }
export interface TaskFilters { status?: string; priority?: string; tag?: string; due?: string; q?: string; }
export interface TaskPage { items: TaskItem[]; nextCursor?: string; }
export interface TaskDetail { task: TaskItem; tags: string[]; links: TaskLinkItem[]; }
export interface TaskCreateInput { title: string; notes?: string; priority?: string; dueAt?: string | null; knowledgeItemId?: string; }

function taskQuery(filters: TaskFilters, cursor?: string): string {
  const params = new URLSearchParams();
  params.set("limit", "20");
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.due) params.set("due", filters.due);
  if (filters.q) params.set("q", filters.q);
  if (cursor) params.set("cursor", cursor);
  return `/api/tasks?${params.toString()}`;
}

export async function loadTasks(filters: TaskFilters, requester: Fetcher = fetch, cursor?: string): Promise<TaskPage> {
  const data = await apiFetch<{ items?: unknown[]; nextCursor?: string }>(taskQuery(filters, cursor), { requester });
  return { items: Array.isArray(data.items) ? data.items.filter((item): item is TaskItem => normalizeTask(item) !== null).map(normalizeTask as (value: unknown) => TaskItem) : [], ...(data.nextCursor ? { nextCursor: data.nextCursor } : {}) };
}

export async function loadTaskSummary(requester: Fetcher = fetch): Promise<TaskSummary> {
  return apiFetch<TaskSummary>("/api/tasks/summary", { requester });
}

export async function loadTaskDetail(id: string, requester: Fetcher = fetch): Promise<TaskDetail> {
  return apiFetch<TaskDetail>(`/api/tasks/${encodeURIComponent(id)}`, { requester });
}

export async function createTask(input: TaskCreateInput, requester: Fetcher = fetch): Promise<{ task: TaskItem; created: boolean }> {
  return apiFetch<{ task: TaskItem; created: boolean }>("/api/tasks", {
    requester,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: crypto.randomUUID(), ...input }),
  });
}

export async function updateTask(id: string, patch: { title: string; notes: string; priority: string; dueAt: string | null }, requester: Fetcher = fetch): Promise<TaskItem> {
  return apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}`, {
    requester, method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
  });
}

export async function deleteTask(id: string, requester: Fetcher = fetch): Promise<void> {
  try {
    await apiFetch<void>(`/api/tasks/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
  } catch (error) {
    // 删除重试遇 404 等价于目标已达成。
    if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
  }
}

export async function setTaskStatus(id: string, status: string, requester: Fetcher = fetch): Promise<TaskItem> {
  return apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/status`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
  });
}

export async function setTaskProgress(id: string, progress: number, requester: Fetcher = fetch): Promise<TaskItem> {
  return apiFetch<TaskItem>(`/api/tasks/${encodeURIComponent(id)}/progress`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ progress }),
  });
}

export async function replaceTaskTags(id: string, tags: string[], requester: Fetcher = fetch): Promise<string[]> {
  const data = await apiFetch<{ tags?: unknown }>(`/api/tasks/${encodeURIComponent(id)}/tags`, {
    requester, method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags }),
  });
  return Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [];
}

export async function addTaskLink(taskId: string, knowledgeItemId: string, requester: Fetcher = fetch): Promise<TaskLinkItem> {
  const data = await apiFetch<{ link?: unknown }>(`/api/tasks/${encodeURIComponent(taskId)}/links`, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ knowledgeItemId }),
  });
  const link = data.link as TaskLinkItem | undefined;
  if (!link || typeof link.id !== "string") throw new Error("TASK_LINK_INVALID");
  return link;
}

export async function removeTaskLink(taskId: string, linkId: string, requester: Fetcher = fetch): Promise<void> {
  await apiFetch<void>(`/api/tasks/${encodeURIComponent(taskId)}/links/${encodeURIComponent(linkId)}`, { requester, method: "DELETE" });
}

function normalizeTask(value: unknown): TaskItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string") return null;
  return {
    id: record.id,
    title: record.title,
    notes: typeof record.notes === "string" ? record.notes : "",
    status: isStatus(record.status) ? record.status : "todo",
    progress: typeof record.progress === "number" ? record.progress : 0,
    priority: isPriority(record.priority) ? record.priority : "medium",
    dueAt: typeof record.dueAt === "string" ? record.dueAt : null,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
  };
}

function isStatus(value: unknown): value is TaskItem["status"] {
  return value === "todo" || value === "doing" || value === "blocked" || value === "done" || value === "canceled";
}
function isPriority(value: unknown): value is TaskItem["priority"] {
  return value === "low" || value === "medium" || value === "high";
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/unit/frontend-tasks-data.test.ts && npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/tasks-data.ts frontend/pages/tasks/task-types.ts frontend/pages/tasks/tasks-model.ts test/unit/frontend-tasks-data.test.ts
git commit -m "feat: add frontend tasks data layer"
```

---

### Task 7: 任务页面三组件(列表 / 详情 Sheet / 新建对话框)

**Files:**
- Create: `frontend/pages/tasks/task-create-dialog.tsx`
- Create: `frontend/pages/tasks/task-detail-sheet.tsx`
- Create: `frontend/pages/tasks/tasks-page.tsx`
- Test: `test/unit/frontend-tasks-page.test.tsx`

**Interfaces:**
- Consumes: Task 6 数据层与 model;现有 `Button/Card/Dialog/Sheet/Badge/Input/Label/PageState/Skeleton` 原语;`frontendText`。
- Produces(Task 8/9 依赖):
  - `TasksPage({ locale, state, filters, page, onPageChange, onFilterChange, onCreate, onOpenDetail, pending })`
  - `TaskCreateDialog({ locale, open, onOpenChange, defaultTitle?, knowledgeItemId?, onCreate, pending, error })`——`onCreate(input: TaskCreateInput): Promise<void>`
  - `TaskDetailSheet({ locale, task, tags, links, open, onOpenChange, onUpdate, onStatusChange, onProgressChange, onTagsReplace, onRemoveLink, onDelete, pending })`
  - 状态类型:`TasksPageState = { kind: "loading" } | { kind: "error"; message?: string } | { kind: "ready"; items: readonly TaskItem[] }`;分页用 `{ page: number; cursorStack: string[]; nextCursor: string | null }`(cursor 栈实现前进/后退)。

- [ ] **Step 1: 写失败组件测试**

`test/unit/frontend-tasks-page.test.tsx`(happy-dom,仿现有 `.test.tsx` 模式;查 `test/unit/frontend-user-read-pages.test.tsx` 的 render 辅助方式,以下用原生 `createRoot`):

```tsx
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { TasksPage } from "../../frontend/pages/tasks/tasks-page";
import { TaskCreateDialog } from "../../frontend/pages/tasks/task-create-dialog";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { TaskItem } from "../../frontend/lib/tasks-data";

const locale = createLocaleRuntime({ navigatorLanguage: "en" });

afterEach(() => { document.body.innerHTML = ""; });

describe("TasksPage", () => {
  it("renders ready items with status, priority, and progress", () => {
    render(<TasksPage locale={locale} state={{ kind: "ready", items: [task({ id: "task-1", title: "Alpha", status: "doing", priority: "high", progress: 40 })] }} filters={{}} pagination={{ page: 1, cursorStack: [], nextCursor: null }} onPageChange={() => undefined} onFilterChange={() => undefined} onCreate={() => undefined} onOpenDetail={() => undefined} pending={false} />);
    expect(document.body.textContent).toContain("Alpha");
    expect(document.body.textContent).toContain("In progress");
    expect(document.body.querySelector<HTMLElement>("[data-task-progress]")?.getAttribute("aria-valuenow")).toBe("40");
  });

  it("shows loading and empty states", () => {
    render(<TasksPage locale={locale} state={{ kind: "loading" }} filters={{}} pagination={{ page: 1, cursorStack: [], nextCursor: null }} onPageChange={() => undefined} onFilterChange={() => undefined} onCreate={() => undefined} onOpenDetail={() => undefined} pending={false} />);
    expect(document.body.getAttribute("aria-busy")).toBe("true");
    render(<TasksPage locale={locale} state={{ kind: "ready", items: [] }} filters={{}} pagination={{ page: 1, cursorStack: [], nextCursor: null }} onPageChange={() => undefined} onFilterChange={() => undefined} onCreate={() => undefined} onOpenDetail={() => undefined} pending={false} />);
    expect(document.body.textContent).toContain("No tasks yet");
  });
});

describe("TaskCreateDialog", () => {
  it("submits trimmed title and forwards the knowledge link", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<TaskCreateDialog locale={locale} open defaultTitle="  Alpha Guide  " knowledgeItemId="knowledge-a" onOpenChange={() => undefined} onCreate={onCreate} pending={false} error={null} />);
    const submit = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("Create task"))!;
    await act(async () => { submit.click(); });
    expect(onCreate).toHaveBeenCalledWith({ title: "Alpha Guide", notes: "", priority: "medium", dueAt: null, knowledgeItemId: "knowledge-a" });
  });
});

function render(node: React.ReactNode): Root {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  act(() => root.render(node));
  return root;
}

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return { id: "task-1", title: "Task", notes: "", status: "todo", progress: 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-08-26T00:00:00.000Z", updatedAt: "2026-08-26T00:00:00.000Z", ...overrides };
}
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/frontend-tasks-page.test.tsx`
Expected: FAIL(组件不存在)。

- [ ] **Step 3: 实现 task-create-dialog.tsx**

`frontend/pages/tasks/task-create-dialog.tsx`:

```tsx
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { TaskCreateInput } from "../../lib/tasks-data";

const PRIORITIES = ["low", "medium", "high"] as const;

export function TaskCreateDialog({ locale, open, onOpenChange, defaultTitle = "", knowledgeItemId, onCreate, pending, error }: {
  locale?: LocaleRuntime;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle?: string;
  knowledgeItemId?: string;
  onCreate: (input: TaskCreateInput) => Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [dueAt, setDueAt] = useState("");
  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    await onCreate({
      title: trimmed, notes: notes.trim(), priority,
      dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null,
      ...(knowledgeItemId ? { knowledgeItemId } : {}),
    });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>{frontendText(locale, "TASKS_CREATE_TITLE")}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1"><Label htmlFor="task-title">{frontendText(locale, "TASKS_TITLE_LABEL")}</Label><Input id="task-title" value={title} maxLength={200} onChange={(event) => setTitle(event.currentTarget.value)} /></div>
        <div className="space-y-1"><Label htmlFor="task-notes">{frontendText(locale, "TASKS_CREATE_NOTES")}</Label><textarea id="task-notes" value={notes} maxLength={5000} onChange={(event) => setNotes(event.currentTarget.value)} className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="task-priority">{frontendText(locale, "TASKS_PRIORITY_LABEL")}</Label><select id="task-priority" value={priority} onChange={(event) => setPriority(event.currentTarget.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">{PRIORITIES.map((value) => <option key={value} value={value}>{frontendText(locale, `TASKS_PRIORITY_${value.toUpperCase()}`)}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="task-due">{frontendText(locale, "TASKS_DUE_LABEL")}</Label><Input id="task-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.currentTarget.value)} /></div>
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>{frontendText(locale, "TASKS_CANCEL")}</Button>
        <Button disabled={pending || !title.trim()} onClick={() => void submit()}>{frontendText(locale, pending ? "TASKS_CREATE_SUBMITTING" : "TASKS_CREATE_SUBMIT")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
```

- [ ] **Step 4: 实现 task-detail-sheet.tsx**

`frontend/pages/tasks/task-detail-sheet.tsx`(编辑基础字段、状态切换、进度滑杆、标签、关联列表、删除;所有变更通过回调上报,由 app.tsx 的 route 层调 API):

```tsx
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { TaskItem, TaskLinkItem } from "../../lib/tasks-data";
import { isTerminalStatus, priorityBadgeClass, taskPriorityKey, taskStatusKey, type TaskStatus } from "./tasks-model";

const NEXT_STATUSES: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["doing", "done", "canceled"],
  doing: ["todo", "blocked", "done", "canceled"],
  blocked: ["todo", "doing", "done", "canceled"],
  done: ["todo"],
  canceled: ["todo"],
};

export function TaskDetailSheet({ locale, task, tags, links, open, onOpenChange, onUpdate, onStatusChange, onProgressChange, onTagsReplace, onRemoveLink, onDelete, pending }: {
  locale?: LocaleRuntime;
  task: TaskItem | null;
  tags: readonly string[];
  links: readonly TaskLinkItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (patch: { title: string; notes: string; priority: string; dueAt: string | null }) => Promise<void>;
  onStatusChange: (status: TaskStatus) => Promise<void>;
  onProgressChange: (progress: number) => Promise<void>;
  onTagsReplace: (tags: string[]) => Promise<void>;
  onRemoveLink: (linkId: string) => Promise<void>;
  onDelete: () => Promise<void>;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [tagInput, setTagInput] = useState("");
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes);
    setPriority(task.priority);
    setDueAt(task.dueAt ? task.dueAt.slice(0, 10) : "");
    setTagInput("");
  }, [task?.id, task?.updatedAt]);
  if (!task) return null;
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{frontendText(locale, taskStatusKey(task.status))}</Badge>
          <Badge variant="outline" className={priorityBadgeClass(task.priority)}>{frontendText(locale, taskPriorityKey(task.priority))}</Badge>
        </SheetTitle>
      </SheetHeader>
      <div className="space-y-5 px-4 pb-8">
        <div className="flex flex-wrap gap-2">
          {NEXT_STATUSES[task.status].map((status) => (
            <Button key={status} size="sm" variant="outline" disabled={pending} onClick={() => void onStatusChange(status)}>{frontendText(locale, `TASKS_MOVE_TO_${status.toUpperCase()}`)}</Button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="detail-progress">{frontendText(locale, "TASKS_PROGRESS")}: {task.progress}%</Label>
          <input id="detail-progress" data-task-progress type="range" min={0} max={100} step={5} defaultValue={task.progress} disabled={pending || isTerminalStatus(task.status)} aria-valuenow={task.progress}
            onChange={(event) => { const next = Number(event.currentTarget.value); if (next !== task.progress) void onProgressChange(next); }} className="w-full" />
        </div>
        <div className="space-y-1"><Label htmlFor="detail-title">{frontendText(locale, "TASKS_TITLE_LABEL")}</Label><Input id="detail-title" value={title} maxLength={200} onChange={(event) => setTitle(event.currentTarget.value)} /></div>
        <div className="space-y-1"><Label htmlFor="detail-notes">{frontendText(locale, "TASKS_CREATE_NOTES")}</Label><textarea id="detail-notes" value={notes} maxLength={5000} onChange={(event) => setNotes(event.currentTarget.value)} className="min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="detail-priority">{frontendText(locale, "TASKS_PRIORITY_LABEL")}</Label><select id="detail-priority" value={priority} onChange={(event) => setPriority(event.currentTarget.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">{["low", "medium", "high"].map((value) => <option key={value} value={value}>{frontendText(locale, `TASKS_PRIORITY_${value.toUpperCase()}`)}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="detail-due">{frontendText(locale, "TASKS_DUE_LABEL")}</Label><Input id="detail-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.currentTarget.value)} /></div>
        </div>
        <Button size="sm" disabled={pending} onClick={() => void onUpdate({ title: title.trim(), notes: notes.trim(), priority, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null })}>{frontendText(locale, "TASKS_SAVE")}</Button>
        <div className="border-t pt-4">
          <p className="text-xs font-medium">{frontendText(locale, "TASKS_TAGS")}</p>
          <div className="mt-2 flex flex-wrap gap-1">{tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
          <div className="mt-2 flex gap-2">
            <Input value={tagInput} maxLength={32} placeholder={frontendText(locale, "TASKS_TAGS_ADD")} onChange={(event) => setTagInput(event.currentTarget.value)} className="h-8 max-w-48" />
            <Button size="sm" variant="outline" disabled={pending || !tagInput.trim()} onClick={() => { const next = [...new Set([...tags, tagInput.trim()])]; setTagInput(""); void onTagsReplace(next); }}>{frontendText(locale, "TASKS_TAGS_ADD")}</Button>
          </div>
        </div>
        <div className="border-t pt-4">
          <p className="text-xs font-medium">{frontendText(locale, "TASKS_LINKS")}</p>
          {links.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">{frontendText(locale, "TASKS_LINKS_EMPTY")}</p> : <ul className="mt-2 space-y-1">{links.map((link) => <li key={link.id} className="flex items-center justify-between gap-2 text-sm"><a href={`/knowledge/${encodeURIComponent(link.knowledgeItemId)}`} className="truncate hover:text-primary">{link.knowledgeTitle || link.knowledgeItemId}</a><button type="button" className="text-xs text-muted-foreground hover:underline" disabled={pending} onClick={() => void onRemoveLink(link.id)}>{frontendText(locale, "TASKS_LINK_REMOVE")}</button></li>)}</ul>}
        </div>
        <div className="border-t pt-4">
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => void onDelete()}>{frontendText(locale, "TASKS_DELETE")}</Button>
        </div>
      </div>
    </SheetContent>
  </Sheet>;
}
```

- [ ] **Step 5: 实现 tasks-page.tsx**

`frontend/pages/tasks/tasks-page.tsx`(列表 + 筛选栏 + 游标分页;分页状态由父层持有,组件渲染上一页/下一页按钮):

```tsx
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { PageState } from "../../components/ui/page-state";
import { frontendText, type LocaleRuntime } from "../../lib/i18n";
import type { TaskFilters, TaskItem } from "../../lib/tasks-data";
import { dueInfo, isTerminalStatus, priorityBadgeClass, taskPriorityKey, taskStatusKey } from "./tasks-model";

export type TasksPageState = { kind: "loading" } | { kind: "error"; message?: string } | { kind: "ready"; items: readonly TaskItem[] };
export interface TasksPagination { page: number; cursorStack: readonly string[]; nextCursor: string | null; }

export function TasksPage({ locale, state, filters, pagination, onPageChange, onFilterChange, onCreate, onOpenDetail, pending }: {
  locale?: LocaleRuntime;
  state: TasksPageState;
  filters: TaskFilters;
  pagination: TasksPagination;
  onPageChange: (page: number) => void;
  onFilterChange: (filters: TaskFilters) => void;
  onCreate: () => void;
  onOpenDetail: (task: TaskItem) => void;
  pending: boolean;
}) {
  if (state.kind === "loading") return <PageState kind="loading" title={frontendText(locale, "APP_LOADING_TITLE")} />;
  if (state.kind === "error") return <PageState kind="error" title={state.message || frontendText(locale, "TASKS_ERROR")}><Button className="mt-4" variant="outline" onClick={() => onFilterChange({ ...filters })}>{frontendText(locale, "COMMON_RETRY")}</Button></PageState>;
  return <section className="space-y-6" aria-busy={pending}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{frontendText(locale, "TASKS_TITLE")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{frontendText(locale, "TASKS_DESCRIPTION")}</p>
      </div>
      <Button onClick={onCreate}>{frontendText(locale, "TASKS_CREATE")}</Button>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-tasks-filters>
      <select aria-label={frontendText(locale, "TASKS_FILTER_STATUS")} value={filters.status ?? ""} onChange={(event) => onFilterChange({ ...filters, status: event.currentTarget.value || undefined })} className="h-9 rounded-md border bg-background px-2 text-sm">
        <option value="">{frontendText(locale, "TASKS_FILTER_ALL")}</option>
        {["todo", "doing", "blocked", "done", "canceled"].map((status) => <option key={status} value={status}>{frontendText(locale, taskStatusKey(status as TaskItem["status"]))}</option>)}
      </select>
      <select aria-label={frontendText(locale, "TASKS_FILTER_PRIORITY")} value={filters.priority ?? ""} onChange={(event) => onFilterChange({ ...filters, priority: event.currentTarget.value || undefined })} className="h-9 rounded-md border bg-background px-2 text-sm">
        <option value="">{frontendText(locale, "TASKS_FILTER_ALL")}</option>
        {["low", "medium", "high"].map((priority) => <option key={priority} value={priority}>{frontendText(locale, taskPriorityKey(priority as TaskItem["priority"]))}</option>)}
      </select>
      <select aria-label={frontendText(locale, "TASKS_FILTER_DUE")} value={filters.due ?? ""} onChange={(event) => onFilterChange({ ...filters, due: event.currentTarget.value || undefined })} className="h-9 rounded-md border bg-background px-2 text-sm">
        <option value="">{frontendText(locale, "TASKS_FILTER_ALL")}</option>
        <option value="today">{frontendText(locale, "TASKS_FILTER_DUE_TODAY")}</option>
        <option value="overdue">{frontendText(locale, "TASKS_FILTER_DUE_OVERDUE")}</option>
        <option value="none">{frontendText(locale, "TASKS_FILTER_DUE_NONE")}</option>
      </select>
      <Input aria-label={frontendText(locale, "TASKS_FILTER_TAG")} value={filters.tag ?? ""} maxLength={32} placeholder={frontendText(locale, "TASKS_FILTER_TAG")} onChange={(event) => onFilterChange({ ...filters, tag: event.currentTarget.value || undefined })} />
      <Input aria-label={frontendText(locale, "TASKS_FILTER_SEARCH")} value={filters.q ?? ""} maxLength={200} placeholder={frontendText(locale, "TASKS_FILTER_SEARCH")} onChange={(event) => onFilterChange({ ...filters, q: event.currentTarget.value || undefined })} />
    </div>
    {state.items.length === 0 ? <p className="text-sm text-muted-foreground">{frontendText(locale, "TASKS_EMPTY")}</p> : <div className="divide-y rounded-lg border">{state.items.map((task) => <TaskRow key={task.id} locale={locale} task={task} onOpen={() => onOpenDetail(task)} />)}</div>}
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">{frontendText(locale, "TASKS_PAGE")}: {pagination.page}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={pagination.page <= 1 || pending} onClick={() => onPageChange(pagination.page - 1)}>{frontendText(locale, "TASKS_PAGE_PREVIOUS")}</Button>
        <Button size="sm" variant="outline" disabled={!pagination.nextCursor || pending} onClick={() => onPageChange(pagination.page + 1)}>{frontendText(locale, "TASKS_PAGE_NEXT")}</Button>
      </div>
    </div>
  </section>;
}

function TaskRow({ locale, task, onOpen }: { locale?: LocaleRuntime; task: TaskItem; onOpen: () => void }) {
  const due = dueInfo(task.dueAt, task.status);
  return <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-accent">
    <Badge variant="outline" className={priorityBadgeClass(task.priority)}>{frontendText(locale, taskPriorityKey(task.priority))}</Badge>
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.title}</span>
    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" data-task-progress aria-valuenow={task.progress} role="progressbar"><span className="block h-full bg-primary" style={{ width: `${task.progress}%` }} /></span>
    {!isTerminalStatus(task.status) && due.kind !== "none" && <Badge variant={due.kind === "overdue" ? "destructive" : "outline"}>{due.kind === "overdue" ? frontendText(locale, "TASKS_DUE_OVERDUE") : due.kind === "today" ? frontendText(locale, "TASKS_DUE_TODAY") : (due.date?.toISOString().slice(0, 10) ?? "")}</Badge>}
    <Badge variant="secondary">{frontendText(locale, taskStatusKey(task.status))}</Badge>
  </button>;
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run test/unit/frontend-tasks-page.test.tsx`
Expected: PASS。若 `Dialog/Sheet` 原语 props 与上述用法不符(如 `SheetContent` 类名),按 `frontend/components/ui/` 实际签名调整。

- [ ] **Step 7: Commit**

```bash
git add frontend/pages/tasks test/unit/frontend-tasks-page.test.tsx
git commit -m "feat: add tasks page components"
```

---

### Task 8: 路由 / 导航 / i18n 接线 + TasksRoute

**Files:**
- Modify: `frontend/contracts/routes.ts`
- Modify: `frontend/app-routes.ts`
- Modify: `frontend/app.tsx`(TasksRoute + renderPage case)
- Modify: `frontend/lib/i18n.ts`(en + zh-CN 两个 catalog)

**Interfaces:**
- Consumes: Task 6/7 组件与数据层;Task 5 的 API。
- Produces: `/tasks` 可导航路由;`TasksRoute` 状态机(列表 + 筛选 + 游标分页 + 新建 + 详情 Sheet 的全部编排)。

- [ ] **Step 1: 路由注册**

`frontend/contracts/routes.ts`:
1. `FrontendCapability` union 追加 `| "tasks:use"`;
2. `ROUTES` 数组 `my-submissions` 行之后追加:

```ts
  { path: "/tasks", labelKey: "NAV_TASKS", group: "workspace", capability: "tasks:use" },
```

`frontend/app-routes.ts`:
1. `PageKind` union 追加 `| "tasks"`;
2. `pageKindForPath` 中 `if (pathname === "/my-submissions") ...` 之后追加:

```ts
  if (pathname === "/tasks") return "tasks";
```

- [ ] **Step 2: i18n 双语 key**

`frontend/lib/i18n.ts` 的 `en` catalog(放在 `NAV_SITE_ANALYTICS` 附近导航区 + `HOME_*` 之后业务区)追加:

```ts
    NAV_TASKS: "Tasks",
    TASKS_TITLE: "My tasks",
    TASKS_DESCRIPTION: "Private to-do items with optional links to published knowledge.",
    TASKS_EMPTY: "No tasks yet.",
    TASKS_ERROR: "Unable to load tasks.",
    TASKS_CREATE: "New task",
    TASKS_CREATE_TITLE: "Create a task",
    TASKS_CREATE_NOTES: "Notes",
    TASKS_CREATE_SUBMIT: "Create task",
    TASKS_CREATE_SUBMITTING: "Creating…",
    TASKS_CREATE_ERROR: "Unable to create the task.",
    TASKS_TITLE_LABEL: "Title",
    TASKS_PRIORITY_LABEL: "Priority",
    TASKS_DUE_LABEL: "Due date",
    TASKS_CANCEL: "Cancel",
    TASKS_SAVE: "Save",
    TASKS_DELETE: "Delete task",
    TASKS_PROGRESS: "Progress",
    TASKS_TAGS: "Tags",
    TASKS_TAGS_ADD: "Add tag",
    TASKS_LINKS: "Linked knowledge",
    TASKS_LINKS_EMPTY: "No linked knowledge.",
    TASKS_LINK_REMOVE: "Remove",
    TASKS_STATUS_TODO: "To do",
    TASKS_STATUS_DOING: "In progress",
    TASKS_STATUS_BLOCKED: "Blocked",
    TASKS_STATUS_DONE: "Done",
    TASKS_STATUS_CANCELED: "Cancelled",
    TASKS_PRIORITY_LOW: "Low",
    TASKS_PRIORITY_MEDIUM: "Medium",
    TASKS_PRIORITY_HIGH: "High",
    TASKS_MOVE_TO_TODO: "Reopen",
    TASKS_MOVE_TO_DOING: "Start",
    TASKS_MOVE_TO_BLOCKED: "Block",
    TASKS_MOVE_TO_DONE: "Complete",
    TASKS_MOVE_TO_CANCELED: "Cancel task",
    TASKS_DUE_TODAY: "Due today",
    TASKS_DUE_OVERDUE: "Overdue",
    TASKS_FILTER_STATUS: "Status",
    TASKS_FILTER_PRIORITY: "Priority",
    TASKS_FILTER_TAG: "Tag",
    TASKS_FILTER_DUE: "Due",
    TASKS_FILTER_SEARCH: "Search title",
    TASKS_FILTER_ALL: "All",
    TASKS_FILTER_DUE_TODAY: "Due today",
    TASKS_FILTER_DUE_OVERDUE: "Overdue",
    TASKS_FILTER_DUE_NONE: "No due date",
    TASKS_PAGE: "Page",
    TASKS_PAGE_PREVIOUS: "Previous page",
    TASKS_PAGE_NEXT: "Next page",
    TASKS_ACTION_ERROR: "The task change failed. Please try again.",
```

`zh-CN` catalog 追加(key 一一对应):

```ts
    NAV_TASKS: "任务",
    TASKS_TITLE: "我的任务",
    TASKS_DESCRIPTION: "私有待办事项,可选关联已发布知识条目。",
    TASKS_EMPTY: "还没有任务。",
    TASKS_ERROR: "无法加载任务。",
    TASKS_CREATE: "新建任务",
    TASKS_CREATE_TITLE: "创建任务",
    TASKS_CREATE_NOTES: "备注",
    TASKS_CREATE_SUBMIT: "创建",
    TASKS_CREATE_SUBMITTING: "创建中…",
    TASKS_CREATE_ERROR: "任务创建失败。",
    TASKS_TITLE_LABEL: "标题",
    TASKS_PRIORITY_LABEL: "优先级",
    TASKS_DUE_LABEL: "截止日期",
    TASKS_CANCEL: "取消",
    TASKS_SAVE: "保存",
    TASKS_DELETE: "删除任务",
    TASKS_PROGRESS: "进度",
    TASKS_TAGS: "标签",
    TASKS_TAGS_ADD: "添加标签",
    TASKS_LINKS: "关联知识",
    TASKS_LINKS_EMPTY: "暂无关联知识条目。",
    TASKS_LINK_REMOVE: "移除",
    TASKS_STATUS_TODO: "待办",
    TASKS_STATUS_DOING: "进行中",
    TASKS_STATUS_BLOCKED: "受阻",
    TASKS_STATUS_DONE: "已完成",
    TASKS_STATUS_CANCELED: "已取消",
    TASKS_PRIORITY_LOW: "低",
    TASKS_PRIORITY_MEDIUM: "中",
    TASKS_PRIORITY_HIGH: "高",
    TASKS_MOVE_TO_TODO: "重新打开",
    TASKS_MOVE_TO_DOING: "开始",
    TASKS_MOVE_TO_BLOCKED: "标记受阻",
    TASKS_MOVE_TO_DONE: "完成",
    TASKS_MOVE_TO_CANCELED: "取消任务",
    TASKS_DUE_TODAY: "今日到期",
    TASKS_DUE_OVERDUE: "已逾期",
    TASKS_FILTER_STATUS: "状态",
    TASKS_FILTER_PRIORITY: "优先级",
    TASKS_FILTER_TAG: "标签",
    TASKS_FILTER_DUE: "到期",
    TASKS_FILTER_SEARCH: "搜索标题",
    TASKS_FILTER_ALL: "全部",
    TASKS_FILTER_DUE_TODAY: "今日到期",
    TASKS_FILTER_DUE_OVERDUE: "已逾期",
    TASKS_FILTER_DUE_NONE: "无截止日期",
    TASKS_PAGE: "页码",
    TASKS_PAGE_PREVIOUS: "上一页",
    TASKS_PAGE_NEXT: "下一页",
    TASKS_ACTION_ERROR: "任务变更失败,请重试。",
```

- [ ] **Step 3: app.tsx 增加 TasksRoute**

`frontend/app.tsx`:

1. import 区追加:

```ts
import { TasksPage, type TasksPageState, type TasksPagination } from "./pages/tasks/tasks-page";
import { TaskCreateDialog } from "./pages/tasks/task-create-dialog";
import { TaskDetailSheet } from "./pages/tasks/task-detail-sheet";
import { createTask, deleteTask, loadTaskDetail, loadTasks, removeTaskLink, replaceTaskTags, setTaskProgress, setTaskStatus, updateTask, type TaskFilters, type TaskItem } from "./lib/tasks-data";
import type { TaskStatus } from "./pages/tasks/task-types";
```

2. `renderPage` 的 switch 中 `case "my-submissions": ...` 之后追加 `case "tasks": return <TasksRoute locale={locale} />;`
3. 文件底部(route 函数区)追加:

```tsx
function TasksRoute({ locale }: { locale: LocaleRuntime }) {
  const [state, setState] = useState<TasksPageState>({ kind: "loading" });
  const [filters, setFilters] = useState<TaskFilters>({});
  const [pagination, setPagination] = useState<TasksPagination>({ page: 1, cursorStack: [], nextCursor: null });
  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const [detail, setDetail] = useState<{ tags: string[]; links: { id: string; knowledgeItemId: string; knowledgeTitle: string | null }[] } | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPage = (nextFilters: TaskFilters, cursor?: string) => {
    setState({ kind: "loading" });
    void loadTasks(nextFilters, fetch, cursor).then((page) => {
      setState({ kind: "ready", items: page.items });
      setPagination((previous) => cursor === undefined
        ? { page: 1, cursorStack: [], nextCursor: page.nextCursor ?? null }
        : { page: previous.page + 1, cursorStack: [...previous.cursorStack, cursor], nextCursor: page.nextCursor ?? null });
    }).catch(() => setState({ kind: "error", message: frontendText(locale, "TASKS_ERROR") }));
  };

  useEffect(() => { fetchPage(filters); }, []);
  // 筛选变化回第一页;输入框防抖 300ms 由调用方(App 内)不做,直接 onChange 触发会导致频繁请求——
  // 因此 tag/q 输入只在 blur/Enter 时提交:onFilterChange 由页面直接回调,这里用 debounce ref。
  useEffect(() => {
    const timer = setTimeout(() => fetchPage(filters), filters.q === undefined && filters.tag === undefined ? 0 : 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const reloadDetail = async (task: TaskItem) => {
    setDetailTask(task);
    setDetail(null);
    try { const loaded = await loadTaskDetail(task.id); setDetail({ tags: loaded.tags, links: loaded.links }); }
    catch { setDetail({ tags: [], links: [] }); }
  };

  const runAction = async (action: () => Promise<TaskItem | void>) => {
    if (pending || !detailTask) return;
    setPending(true);
    setActionError(null);
    try { const result = await action(); if (result) await reloadDetail(result); else await reloadDetail(detailTask); }
    catch { setActionError(frontendText(locale, "TASKS_ACTION_ERROR")); }
    finally { setPending(false); }
    fetchPage(filters);
  };

  const create = async (input: Parameters<typeof createTask>[0]) => {
    setCreatePending(true);
    setCreateError(null);
    try { await createTask(input); setCreateOpen(false); fetchPage(filters); }
    catch { setCreateError(frontendText(locale, "TASKS_CREATE_ERROR")); }
    finally { setCreatePending(false); }
  };

  return <>
    <TasksPage
      locale={locale} state={state} filters={filters} pagination={pagination} pending={pending}
      onPageChange={(page) => {
        if (page === pagination.page + 1 && pagination.nextCursor) fetchPage(filters, pagination.nextCursor);
        else if (page === pagination.page - 1) { const cursor = pagination.cursorStack[page - 2]; fetchPage(filters, cursor); }
      }}
      onFilterChange={setFilters}
      onCreate={() => setCreateOpen(true)}
      onOpenDetail={(task) => void reloadDetail(task)}
    />
    {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
    <TaskCreateDialog locale={locale} open={createOpen} onOpenChange={setCreateOpen} onCreate={create} pending={createPending} error={createError} />
    <TaskDetailSheet
      locale={locale} task={detailTask} tags={detail?.tags ?? []} links={detail?.links ?? []} open={detailTask !== null}
      onOpenChange={(open) => { if (!open) setDetailTask(null); }}
      onUpdate={(patch) => runAction(() => updateTask(detailTask!.id, patch))}
      onStatusChange={(status: TaskStatus) => runAction(() => setTaskStatus(detailTask!.id, status))}
      onProgressChange={(progress: number) => runAction(() => setTaskProgress(detailTask!.id, progress))}
      onTagsReplace={(tags: string[]) => runAction(() => replaceTaskTags(detailTask!.id, tags).then(() => undefined))}
      onRemoveLink={(linkId: string) => runAction(() => removeTaskLink(detailTask!.id, linkId))}
      onDelete={() => runAction(async () => { await deleteTask(detailTask!.id); setDetailTask(null); })}
      pending={pending}
    />
  </>;
}
```

(若 lint 报 `fetchPage` 缺依赖,按仓库现有 route 组件的写法放宽或用 `useCallback` 包裹;`useEffect` 双跑问题遵循现有代码同样处理。)

- [ ] **Step 4: 验证**

Run: `npx tsc --noEmit && npm run verify:i18n && npx vitest run test/unit/frontend-tasks-page.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-shell.test.tsx test/unit/navigation.test.ts`
Expected: 全部 PASS(导航 shell 测试若断言 ROUTES 数量/文案,按其模式更新期望)。

- [ ] **Step 5: Commit**

```bash
git add frontend/contracts/routes.ts frontend/app-routes.ts frontend/app.tsx frontend/lib/i18n.ts
git commit -m "feat: route the tasks workspace page"
```

---

### Task 9: 首页概览卡 + 知识阅读页「加入任务」入口

**Files:**
- Modify: `frontend/pages/home-page.tsx`
- Modify: `frontend/pages/knowledge-reader-page.tsx`
- Modify: `frontend/app.tsx`(HomeRoute 加载 summary;KnowledgeReaderRoute 加对话框)
- Modify: `frontend/lib/i18n.ts`(补 4 个 key)
- Test: `test/unit/frontend-tasks-page.test.tsx`(追加两条)

**Interfaces:**
- Consumes: `loadTaskSummary`/`createTask`/`TaskCreateDialog`(Task 6/7)。
- Produces: `HomePage` 新可选 prop `tasks?: { doing: number; dueToday: number; overdue: number } | null`(undefined=隐藏);`KnowledgeReaderPage` 新可选 prop `onAddToTask?: () => void`。

- [ ] **Step 1: 追加失败测试**

在 `test/unit/frontend-tasks-page.test.tsx` 追加:

```tsx
import { HomePage } from "../../frontend/pages/home-page";

describe("HomePage tasks card", () => {
  it("renders the task overview when summary is present and hides it otherwise", () => {
    render(<HomePage locale={locale} state={{ kind: "ready", total: 0, pending: 0, published: 0 }} tasks={{ doing: 2, dueToday: 1, overdue: 3 }} />);
    expect(document.body.textContent).toContain("In progress");
    expect(document.body.textContent).toContain("3");
    render(<HomePage locale={locale} state={{ kind: "ready", total: 0, pending: 0, published: 0 }} />);
    expect(document.body.textContent).not.toContain("My tasks");
  });
});
```

- [ ] **Step 2: i18n 补 key**

`frontend/lib/i18n.ts` 两个 catalog 各追加(紧挨 HOME_* 键):

```ts
    HOME_TASKS_TITLE: "My tasks",
    HOME_TASKS_DOING: "In progress",
    HOME_TASKS_DUE_TODAY: "Due today",
    HOME_TASKS_OVERDUE: "Overdue",
    HOME_TASKS_OPEN: "Open tasks",
    KNOWLEDGE_READER_ADD_TASK: "Add to tasks",
```

zh-CN 对应:

```ts
    HOME_TASKS_TITLE: "我的任务",
    HOME_TASKS_DOING: "进行中",
    HOME_TASKS_DUE_TODAY: "今日到期",
    HOME_TASKS_OVERDUE: "已逾期",
    HOME_TASKS_OPEN: "打开任务",
    KNOWLEDGE_READER_ADD_TASK: "加入任务",
```

- [ ] **Step 3: home-page.tsx 加概览卡**

`frontend/pages/home-page.tsx`:

1. props 加可选字段:`tasks?: { doing: number; dueToday: number; overdue: number } | null`;
2. 在「快捷操作」Card 之后(`</div></section>` 结束前)追加一张卡:

```tsx
{tasks && <Card><CardHeader><CardTitle>{frontendText(locale, "HOME_TASKS_TITLE")}</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3 text-center">{[[frontendText(locale, "HOME_TASKS_DOING"), tasks.doing], [frontendText(locale, "HOME_TASKS_DUE_TODAY"), tasks.dueToday], [frontendText(locale, "HOME_TASKS_OVERDUE"), tasks.overdue]].map(([label, value]) => <div key={label as string}><p className="text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}<a href="/tasks" className="col-span-3 rounded-md border px-3 py-2 text-sm hover:bg-accent">{frontendText(locale, "HOME_TASKS_OPEN")}</a></CardContent></Card>}
```

3. `frontend/app.tsx` 的 `HomeRoute` 改为加载 summary(失败静默隐藏):

```tsx
function HomeRoute({ locale }: { locale: LocaleRuntime }) {
  const [recent, setRecent] = useState<Array<{ id: string; title: string }>>([]);
  const [tasks, setTasks] = useState<{ doing: number; dueToday: number; overdue: number } | null>(null);
  useEffect(() => {
    let active = true;
    void loadRecentKnowledge().then((items) => { if (active) setRecent(items.map((item) => ({ id: item.id, title: item.title }))); }).catch(() => { if (active) setRecent([]); });
    void loadTaskSummary().then((summary) => { if (active) setTasks({ doing: summary.doing, dueToday: summary.dueToday, overdue: summary.overdue }); }).catch(() => { if (active) setTasks(null); });
    return () => { active = false; };
  }, []);
  return <HomePage locale={locale} state={{ kind: "ready", total: 0, pending: 0, published: 0, recent }} tasks={tasks} />;
}
```

顶部 import 追加 `import { loadTaskSummary } from "./lib/tasks-data";`。

- [ ] **Step 4: 阅读页入口**

`frontend/pages/knowledge-reader-page.tsx`:
1. props 追加 `onAddToTask?: () => void;`
2. 操作按钮区(收藏按钮旁)追加:

```tsx
{onAddToTask && <Button size="sm" variant="outline" onClick={onAddToTask}>{frontendText(locale, "KNOWLEDGE_READER_ADD_TASK")}</Button>}
```

`frontend/app.tsx` 的 `KnowledgeReaderRoute`:
1. 追加状态:`const [taskDialogOpen, setTaskDialogOpen] = useState(false); const [taskPending, setTaskPending] = useState(false); const [taskError, setTaskError] = useState<string | null>(null);`
2. 成功渲染分支的 `<KnowledgeReaderPage ...>` 追加 prop:

```tsx
onAddToTask={() => setTaskDialogOpen(true)}
```

3. 该 return 语句外层包 fragment 并渲染对话框:

```tsx
  return <>
    <KnowledgeReaderPage locale={locale} state={{ kind: "ready" }} revision={state.revision} renderMarkdown={renderSafeMarkdown} diffState={diffState} onCompare={showDiff} relatedState={relatedState} backlinkState={backlinkState} favorite={favorite} onToggleFavorite={toggleFavorite} onAddToTask={() => setTaskDialogOpen(true)} />
    <TaskCreateDialog
      locale={locale} open={taskDialogOpen} onOpenChange={setTaskDialogOpen}
      defaultTitle={state.revision.title?.trim() || frontendText(locale, "KNOWLEDGE_UNTITLED")}
      knowledgeItemId={knowledgeItemId}
      pending={taskPending} error={taskError}
      onCreate={async (input) => {
        setTaskPending(true); setTaskError(null);
        try { await createTask(input); setTaskDialogOpen(false); }
        catch { setTaskError(frontendText(locale, "TASKS_CREATE_ERROR")); }
        finally { setTaskPending(false); }
      }}
    />
  </>;
```

- [ ] **Step 5: 验证 + Commit**

Run: `npx vitest run test/unit/frontend-tasks-page.test.tsx && npx tsc --noEmit && npm run verify:i18n`
Expected: PASS。

```bash
git add frontend/pages/home-page.tsx frontend/pages/knowledge-reader-page.tsx frontend/app.tsx frontend/lib/i18n.ts test/unit/frontend-tasks-page.test.tsx
git commit -m "feat: add tasks overview card and reader entry"
```

---

### Task 10: 全量验收 + 发布证据

**Files:**
- Create: `docs/operations/evidence/2026-08-27-workbench-tasks.md`

- [ ] **Step 1: 全量门禁**

Run: `npm run check`
Expected: vendor check + `wrangler types --check` + `tsc --noEmit` + 全部测试(smoke/unit/worker)+ `wrangler deploy --dry-run` 全绿。任何失败先修复再继续;导航相关契约测试(`frontend-app-contract`、`frontend-legacy-audit`、wcag)失败时按其输出补契约(如新路由需在 legacy audit 允许清单外声明)。

- [ ] **Step 2: 手动冒烟(wrangler dev)**

Run: `npm run dev`(另开终端 `npm run dev:ui` 或直接访问 dev URL)
验证清单:
1. 侧边栏出现「任务」入口;`/tasks` 打开列表页,空态文案正确;
2. 新建任务 → 列表出现;行点击打开 Sheet,切状态/改进度/加标签/删任务全部生效;
3. 阅读某知识条目 →「加入任务」→ 任务出现在列表且详情含关联链接;
4. 首页出现任务概览卡,数字与列表一致;
5. 中文/英文切换后所有任务页文案正确;
6. 另一账号登录看不到前者任务(直连 `/api/tasks/<id>` 得 404)。

- [ ] **Step 3: 写发布证据文件**

`docs/operations/evidence/2026-08-27-workbench-tasks.md`(格式参照 `docs/operations/evidence/` 下既有文件):

```markdown
# 工作台任务模块发布证据(2026-08-27)

- 变更范围:migrations/0031、src/tasks、src/routes/tasks.ts、src/audit/types.ts(task.*)、
  src/authorization(bit 20 + tasks:use)、frontend(/tasks 页面、首页概览卡、阅读页入口)。
- 验收命令:`npm run check` 全绿(附终端输出摘要)。
- 手动冒烟:六项清单全部通过(附每项一句话证据)。
- 隔离验证:IDOR worker 契约测试通过(成员 B 访问成员 A 任务 → 404)。
- 幂等验证:创建重放/状态重发/进度重发/关联重放 均只产生一行且不重复审计。
- 回滚说明:迁移为纯新增表+菜单行,回滚应用版本即可;数据表保留不影响既有功能。
```

- [ ] **Step 4: Commit**

```bash
git add docs/operations/evidence/2026-08-27-workbench-tasks.md
git commit -m "docs: record workbench tasks release evidence"
```

---

## Self-Review 记录

- 规格覆盖:§2 隔离(Task 2/5)、§3 数据模型与状态机(Task 1/2/3)、§3.3 上限(Task 1/3)、§4 API 全部端点(Task 5)、§4.1 幂等(Task 3/5/6)、§5 权限与菜单(Task 1/8)、§6 服务层(Task 2/3/4)、§7 前端(Task 6/7/8/9)、§8 测试验收(Task 2-10)、§9 范围外未引入。
- 已知实现注意点:cursor 必须 epoch 毫秒数字绑定(Task 2 已修正);`AppError` 构造签名以 `src/http.ts` 为准;组件原语 props 以 `frontend/components/ui/` 实际签名为准。
