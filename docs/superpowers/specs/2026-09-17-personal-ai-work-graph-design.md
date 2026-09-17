# Memory Garden 2.0：个人 AI 工作台与 Personal Work Graph 设计规格

**状态：** 已确认设计，待规格书审阅后进入实现计划

**日期：** 2026-09-17

## 1. 产品定义

Memory Garden 2.0 是一个面向个人和 5–20 人私有小团队的 **Personal AI Workbench**。它把信息捕获、知识理解、工作规划、执行和复盘组织在同一个工作台中。

知识库是认知底座之一，不是产品边界。产品价值链是：

```text
Capture → Understand → Decide → Execute → Review
```

Cytoscape.js 的定位不是“知识库思维导图”，而是跨模块的 **Personal Work Graph**：把知识、任务、项目、目标、会议、决策、行动项和日历对象连接成可探索、可追溯、可执行的关系层。

## 2. 固定边界

- 仅支持 5–20 名受邀成员的私有工作台。
- 继续使用 Cloudflare 免费层：Workers、D1、Durable Objects、Workers AI、静态 Assets；不引入新的付费基础设施。
- 保留 GitHub OAuth、D1 Session、HMAC Automation 和现有管理员/普通成员分工。
- 不做公开注册、多租户 SaaS、计费、套餐、企业目录同步或外部协作网络。
- 每个用户的数据查询和写入必须由认证 principal 推导 `member_id`，不能信任客户端传入的成员字段。
- 所有列表和图谱结果必须有界；默认分页/限深，最大结果数由服务端强制。
- 所有创建和重试写入必须使用 client key 或等价幂等键。
- AI 只能返回草稿、建议或带证据的关系；不得自动发布、删除、改权限或调用任意外部工具。
- 不读取、不上传、不写入 `SECRETS_FILE`；生产迁移、部署和验收保持单独审批。

## 3. 产品信息架构

一级导航：

| 模块 | 责任 | 主要对象 |
| --- | --- | --- |
| 工作台 | 今日总览、跨模块入口 | 今日摘要、提醒、下一步 |
| 收集箱 | 把外部信息带入工作台 | Inbox、草稿、附件、链接 |
| 知识库 | 保存可复用认知资产 | Knowledge、Revision、Source、Chunk |
| AI 助手 | 基于授权知识辅助理解和规划 | Answer、Citation、Draft |
| 任务 | 管理可执行工作 | Task、Subtask、Dependency |
| 项目 | 组织一组目标和工作 | Project、Goal、Project Task |
| 日历 | 安排时间和事件 | Calendar Event、Focus Block |
| 专注 | 记录实际执行 | Focus Session |
| 工作图谱 | 跨对象关系探索和操作 | Graph Node、Graph Edge |
| 复盘 | 反馈和周期性总结 | Daily Review、Weekly Review |
| 管理设置 | 管理成员、权限、菜单、统计 | Member、Role、Menu、Analytics |

## 4. 领域边界与权威数据

不创建一个覆盖所有业务的万能表。每个领域继续维护自己的权威数据，图谱只生成只读投影：

```text
Knowledge / Task / Project / Goal / Calendar / Inbox / Review
                            ↓
                    authorization projection
                            ↓
                    Personal Work Graph
                            ↓
                     Cytoscape.js canvas
```

图谱投影不拥有领域数据的最终写权限。图谱中的操作必须调用原领域服务，例如“创建任务”调用 TasksService，“加入项目”调用 ProjectsService。

## 5. Graph 数据合同

### 5.1 节点

```ts
interface GraphNode {
  id: string;
  kind:
    | "knowledge" | "task" | "project" | "goal"
    | "meeting" | "decision" | "action_item"
    | "inbox" | "calendar" | "focus";
  label: string;
  status: string | null;
  href: string | null;
  metadata: Record<string, string | number | null>;
}
```

### 5.2 边

```ts
interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind:
    | "related" | "backlink" | "references"
    | "belongs_to" | "depends_on" | "blocks"
    | "decided_in" | "creates" | "scheduled_for"
    | "reviewed_in" | "derived";
  label: string;
  weight: number;
  citationIds: string[];
}
```

### 5.3 快照

```ts
interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  rootId: string | null;
  depth: number;
  truncated: boolean;
}
```

默认限制：深度 1、节点 50、边 100；服务端最大深度 2、节点 100、边 200。超限必须返回 `truncated: true`，不能静默截断。

## 6. API 设计

第一阶段使用 D1 投影，不引入图数据库。

```text
GET /api/graph
```

参数：

```text
scope=knowledge|project|workspace
rootId=<optional>
depth=1|2
types=knowledge,task,project
limit=50
cursor=<opaque cursor>
```

服务端流程：

1. 从 session principal 取得 `member_id`。
2. 校验 scope、rootId、depth、types、limit 和 cursor。
3. 查询各领域权威数据，并在每个领域执行 owner predicate。
4. 删除不可见节点及其边，不返回隐藏对象存在性。
5. 生成稳定节点 ID、边 ID 和 citationIds。
6. 应用数量限制、排序和 opaque cursor。
7. 返回 `GraphSnapshot`。

图谱写操作不直接修改图数据，统一转发到领域 API：

- `POST /api/tasks`
- `POST /api/projects/:id/timeline`
- `POST /api/calendar/events`
- 现有知识、Inbox、Focus 和 Review API

## 7. Cytoscape.js 前端架构

### 7.1 加载策略

- 通过 `import("cytoscape")` 动态加载。
- Graph 页面之外不加载 Cytoscape。
- 画布销毁时调用 Cytoscape destroy，避免路由切换泄漏事件和 DOM。
- 3D Landing 继续使用现有 Three.js lazy chunk，两者互不耦合。

### 7.2 页面结构

```text
┌──────────────┬──────────────────────────┬──────────────────┐
│ Graph Lens   │ Cytoscape Canvas         │ Inspector        │
│              │                          │                  │
│ 全部工作      │ Focus + Context          │ 当前对象          │
│ 知识关系      │ 节点选择                 │ 证据              │
│ 项目关系      │ 框选                     │ 关联任务          │
│ 任务关系      │ 局部展开                 │ 快速操作          │
│ 时间关系      │ 路径高亮                 │ 历史变化          │
└──────────────┴──────────────────────────┴──────────────────┘
```

### 7.3 布局策略

- `breadthfirst`：项目、目标、任务层级
- `concentric`：中心知识或项目邻域
- `cose`：跨模块关系探索
- `grid`：搜索结果和孤立节点

第一阶段只使用 Cytoscape 内置布局，避免额外布局扩展导致包体和维护成本上升。

## 8. 核心交互

### 8.1 Focus + Context

- 中心对象保持高亮。
- 一级邻居完整显示。
- 二级邻居降级显示。
- 三级关系默认隐藏。
- “展开邻域”使用有界请求，而不是一次性加载整图。

### 8.2 Evidence Path

边点击后显示关系证据：

```text
对象 A → 关系 → SourceVersion → Chunk → 行号/页码/Slide/Sheet
```

没有可验证 citation 的 AI 关系显示为“建议关系”，不能显示为事实关系。

### 8.3 Graph to Action

- 知识节点：打开阅读器、问 AI、创建任务、加入项目。
- 项目节点：打开项目、查看目标、查看行动项、查看时间线。
- 会议节点：查看记录、提取决策、创建行动项。
- 决策节点：查看证据、关联项目、创建后续任务。
- 任务节点：标记完成、进入 Focus、查看相关知识。

### 8.4 Temporal Diff

- 本周新增对象。
- 最近完成任务。
- 最近新增决策。
- 项目关系变化。
- 过期知识和未完成行动项。

## 9. AI 边界

AI 可做：

- Inbox 分类。
- 会议记录摘要。
- 决策提取。
- 行动项提取。
- 关系建议。
- 项目下一步建议。
- 复盘建议。

AI 不可做：

- 自动发布知识。
- 自动删除或归档数据。
- 自动改变成员权限。
- 绕过领域服务写入图谱。
- 创建无 citation 的事实关系。

所有 AI 输出都必须具备 `draft` 或 `suggested` 语义，并由用户确认后再调用领域写接口。

## 10. 阶段路线

### G0：合同与投影基础

- Graph DTO、节点/边枚举、限深、限量、分页和错误码。
- 统一 authorization projection。
- 跨成员和隐藏对象不泄漏测试。

### G1：Cytoscape Canvas

- 动态加载、生命周期、样式、布局、空态和降级列表。
- `/graph` 路由和中英文文案。
- 键盘、移动端和性能基线。

### G2：知识工作图

- Related、Backlink、引用关系。
- Reader 深链、citation Inspector、邻域展开。
- 孤立知识和过期知识视图。

### G3：跨模块工作图

- Project、Goal、Task、Meeting、Decision、Action Item。
- compound project node。
- 项目、任务、知识和决策路径。

### G4：图谱操作闭环

- Inspector 快速操作。
- 创建任务、加入项目、创建行动项、进入 Focus。
- 路径高亮、关系筛选、图谱搜索和快捷键。

### G5：时间与复盘

- 时间范围筛选。
- 项目关系变化。
- Weekly Review 图谱摘要。
- 阻塞任务、过期知识、未完成行动项。

### G6：AI 工作编排

- 会议到决策。
- 决策到行动项。
- 任务到知识建议。
- 项目下一步草稿。
- 用户确认后 promotion。

### G7：发布与验收

- unit、Worker、frontend、a11y、包体和 smoke。
- 本地 acceptance evidence。
- 迁移哈希、远程 D1、部署、生产 smoke 和 signed browser 单独审批。

## 11. 非目标

- 不建设 Neo4j 或外部图数据库。
- 不把 Cytoscape.js 用于 3D Landing。
- 不把图谱作为新的业务数据源。
- 不做公开社交图谱或跨租户关系。
- 不引入 Slack、Notion、Google Calendar 等外部连接器作为本阶段前置条件。

## 12. 验收标准

### 功能

- 用户可以从知识、项目、任务和会议进入图谱。
- 用户可以在图谱中选择对象、查看 Inspector、查看证据并跳转回原页面。
- 用户可以从图谱创建任务、行动项或 Focus。
- 所有关系都有类型；事实关系具备 citation。

### 安全

- 成员只能看到自己的私有对象。
- 猜测 ID、修改 query、伪造 rootId 不能读取其他成员数据。
- 隐藏对象不会通过节点数量、边数量、标题或错误信息泄漏。

### 质量

- 图谱页面无 `undefined`。
- 动态加载不影响首页首屏包体。
- 50 节点以内交互保持流畅；超过上限明确显示截断状态。
- 画布支持键盘替代路径和移动端列表降级。
- 生产部署前必须保留本地、部署和浏览器验收证据的边界。
