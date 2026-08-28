# Memory Garden 工作台统一分页、布局与菜单可用性设计规格

更新时间：2026-08-28

## 1. 背景

工作台当前已经具备知识库、审核、成员、审计、站点统计与任务等页面，但列表交互和页面容器尚未形成统一契约：部分接口使用游标，部分页面使用“加载更多”，已有数字分页组件也缺少总数、页大小与服务端一致性约束。同时，桌面端侧栏和内容区共享页面滚动，菜单中尚未实现的入口仍可点击，造成右侧空白或不可用页面。

本阶段一次性完成三项横向基础设施：

1. 所有正式列表页统一为服务端完整数字分页。
2. 桌面端左侧菜单与右侧内容区独立滚动，并收紧内容密度。
3. 菜单以统一路由能力注册表区分“可用”和“建设中”，杜绝可点击但不可用的入口。

实现继续遵守 Cloudflare 免费服务边界，使用 Workers + D1 现有能力，不为分页引入付费数据库、缓存或队列。

## 2. 目标与范围

### 2.1 纳入统一分页的页面

- 知识库列表
- 搜索结果
- 我的提交
- 成员管理
- 审核队列
- 资产队列
- 重复项队列
- 审计日志
- 站点统计明细
- 任务列表

统计卡片、汇总数字和趋势图不是列表页，不分页；站点统计只有可展开或可浏览的明细集合进入统一分页。

### 2.2 非目标

- 不实现看板、通知、消息等尚未建设的业务功能。
- 不新增无限滚动或客户端全量加载后切片。
- 不把菜单隐藏当作授权控制；服务端权限校验仍是最终边界。
- 不修改历史 D1 migration，只允许追加新 migration 和索引。

## 3. 统一数字分页契约

### 3.1 请求与响应

```ts
type SupportedPageSize = 20 | 50 | 100;

interface NumberedPageRequest {
  page: number;
  pageSize: SupportedPageSize;
}

interface NumberedPage<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: SupportedPageSize;
    total: number;
    totalPages: number;
  };
}
```

- 缺省值为 `page=1`、`pageSize=20`。
- `totalPages` 在 `total=0` 时为 0，否则为 `Math.ceil(total / pageSize)`。
- `page` 必须是正整数；`pageSize` 只接受 20、50、100。
- 每个端点使用显式查询参数白名单。非法值、重复参数和未知参数返回 400。
- 当请求页超过末页但仍在查询窗口内时，返回 200、空 `items`、请求的 `page` 和真实总数元数据，不自动改写页码。
- 最大查询窗口为 10,000 条；当 `(page - 1) * pageSize >= 10_000` 时返回 400。
- 正式页面和正式页面 API 迁移完成后不再暴露 `nextCursor` 或“加载更多”。若内部非页面消费者仍需游标，其工具可保留，但不得成为本契约的一部分。

### 3.2 排序与隔离

- 每个列表必须声明稳定排序，并以唯一 `id` 作为最终 tie-breaker。
- 搜索结果保留相关度主排序，再用 `id` 稳定排序。
- COUNT 与数据查询复用同一套过滤条件和授权作用域，禁止分别手写条件。
- 私有数据的 COUNT 与 SELECT 都必须在 repository 层绑定当前会话成员 ID；成员 ID 不接受客户端输入。
- D1 使用一次 `batch()` 执行 COUNT 与 SELECT，使一次请求内的分页元数据和数据读取具有一致的作用域与失败语义；任一语句失败则整个请求失败，不返回半成品。

### 3.3 Repository 接口

各领域 repository 统一提供等价接口：

```ts
listPage(scope, filters, pagination): Promise<NumberedPage<Row>>
```

分页 SQL 使用参数化 `LIMIT` / `OFFSET`。过滤器构造器同时产出 COUNT 和 SELECT 所需的 `WHERE` 与参数，只有 SELECT 追加排序、limit 和 offset。针对常用过滤与排序组合，通过 append-only migration 增加必要复合索引，并用查询计划或测试数据验证没有明显全表扫描退化。

## 4. 前端分页体系

### 4.1 shadcn/ui 使用方式

采用官方 shadcn/ui 组件源码安装到仓库并按项目风格封装，不增加闭源运行时依赖。优先复用或升级：

- Pagination
- Select
- Table
- ScrollArea
- Skeleton
- Tooltip
- 现有 Button、Badge、Sheet、Dialog、PageState

官方参考：

- https://ui.shadcn.com/docs/components/radix/pagination
- https://ui.shadcn.com/docs/components/base/scroll-area
- https://ui.shadcn.com/docs/components/base/data-table

项目级统一组件为：

```tsx
<DataPagination
  page={page}
  pageSize={pageSize}
  total={total}
  totalPages={totalPages}
  onPageChange={setPage}
  onPageSizeChange={setPageSize}
/>
```

### 4.2 展示与交互

- 桌面端显示首页、尾页、当前页附近数字页码和省略号。
- 显示总条数与当前可见范围，例如“共 238 条，当前 21–40 条”。
- 页大小 Select 提供 20、50、100；切换页大小后回到第 1 页。
- 移动端收敛为上一页、当前页状态、下一页。
- 请求进行中禁用分页控制，仅在列表内容区显示 Skeleton，避免整页闪烁。
- 所有数据来自服务端分页，前端不得先下载全量数据再切片。
- 页码、页大小和业务过滤条件写入 URL；刷新、复制链接和前进后退都可恢复页面状态。
- 过滤条件变化时回到第 1 页。
- 快速切页使用 AbortController 取消旧请求，只有最后一次请求可更新视图。
- 删除使当前页变空且 `page > 1` 时，前端回退一页并仅重试一次。
- 局部请求失败时保留当前已显示数据，在列表区显示可重试错误，不清空整个页面。

## 5. 桌面端独立滚动与紧凑布局

### 5.1 桌面结构

桌面根容器使用 `h-dvh overflow-hidden`，形成明确的两列滚动边界：

```text
AppShell (h-dvh, overflow-hidden)
├── Sidebar
│   ├── Brand (固定)
│   ├── Navigation (min-h-0, flex-1, overflow-y-auto)
│   └── Account/Footer (固定)
└── Workspace
    ├── Topbar (固定 64px)
    └── Main content (min-h-0, overflow-y-auto)
```

- 左侧导航与右侧内容独立滚动，滚轮或触控只作用于指针所在区域。
- 两个滚动区使用 `overscroll-contain`，避免滚动链传递到页面根节点。
- 页面路由、主过滤条件或工作区切换后，右侧内容滚动位置回到顶部；普通弹窗开关不重置位置。
- 滚动条保持可发现性，键盘焦点和焦点环不可被裁切。

### 5.2 移动端

移动端继续使用 Sheet 展示菜单。内容采用正常文档滚动，不制造嵌套双滚动；Sheet 内菜单自身可滚动。

### 5.3 紧凑密度

- 主内容最大宽度提高到 `max-w-[1440px]`，桌面内边距收紧为约 `lg:px-6 lg:py-5`。
- 页面主标题默认 `text-2xl`，减少大面积标题留白。
- 列表、筛选栏与卡片优先使用更紧的 gap 和 `p-3` / `p-4`。
- 长列表可根据页面结构使用 sticky 筛选栏或分页栏，但不得遮挡内容或破坏键盘访问。
- 紧凑不等于缩小可点击区域；交互控件仍满足现有 shadcn 尺寸与可访问性约束。

## 6. 菜单可用性与建设中状态

### 6.1 单一能力注册表

建立框架无关的共享路由能力注册表，由 Worker 导航构建和前端路由解析共同消费，避免两端各自维护实现状态：

```ts
type MenuAvailability = "ready" | "coming_soon";

interface WorkspaceRouteCapability {
  id: string;
  path: string;
  pageKind: string;
  availability: MenuAvailability;
}
```

数据库菜单继续负责树结构、文案和权限位；共享注册表负责“该路由是否已实现”。导航响应将两者合并为：

```ts
interface NavigationNode {
  id: string;
  labelKey: string;
  path: string | null;
  availability: MenuAvailability;
  disabledReason?: "not_implemented";
  children: NavigationNode[];
}
```

例如 `/knowledge`、`/tasks` 标记为 `ready`；`/notifications`、`/messages`、`/boards` 在实现前标记为 `coming_soon`。管理员修改菜单排序或可见性不能把未实现路由强制变成 ready。

### 6.2 用户体验

- ready：保持正常导航行为。
- coming_soon：菜单项不可导航，显示“建设中”Badge；侧栏折叠时通过 Tooltip 表达原因。
- 用户直接访问 coming_soon URL 时，右侧显示统一“功能建设中”页面，而不是空白、404 或崩溃。
- 权限不足仍显示现有 403 页面，不能被“建设中”状态掩盖。
- 未知路径仍是 404，与已注册但建设中的路径严格区分。

### 6.3 一致性校验

增加契约测试：

- 每个 ready 条目必须存在可渲染的 `pageKind` 和前端组件。
- 每个没有可渲染组件的已注册菜单必须是 coming_soon。
- 导航树中的路径必须存在于共享注册表。
- ready 路径直达时不可落入建设中或 404 页面。

## 7. 实施顺序

1. 新增共享分页类型、严格查询参数验证器、D1 COUNT + SELECT helper 与测试。
2. 引入或升级 shadcn/ui 原语，完成 DataPagination 和 URL 分页状态 hook。
3. 以站点统计明细、审计日志、成员管理为首批垂直切片，验证公共契约。
4. 迁移审核、资产、重复项、知识库、搜索、我的提交和任务。
5. 删除正式页面上的“加载更多”和 `nextCursor` 契约，并同步修订旧任务设计规格中的游标描述。
6. 改造 AppShell，实现左右独立滚动和紧凑布局。
7. 建立共享路由能力注册表、建设中菜单状态和统一建设中页面。
8. 完成 Worker、repository、前端组件、路由契约、隔离与回归测试。

实施必须按垂直切片验证，不能先一次性改完所有 API 再补前端；公共分页基础设施稳定后，剩余页面可以按互不冲突的领域并行迁移。

## 8. 错误处理与兼容策略

- 非法、重复、未知查询参数以及超出最大窗口返回 400，并使用现有 JSON 错误信封。
- 超过末页是合法查询，返回 200 空集合。
- COUNT 或 SELECT 任一失败，接口整体失败，不发送不可信的总数。
- 前端在迁移期间只消费对应端点的新数字分页响应，不对同一端点同时兼容两套分页协议。
- 每个端点以前后端和测试同一提交或同一可回滚批次迁移，避免部署窗口出现协议错配。
- 新索引使用 append-only D1 migration；不删除旧索引，待完整发布验证后再单独评估清理。

## 9. 测试与验收

### 9.1 后端

- page/pageSize 默认值、边界、重复参数、未知参数和 10,000 窗口测试。
- COUNT 与 SELECT 在所有过滤组合下使用相同条件。
- 排序字段相同时依靠 ID 保持翻页稳定。
- 成员 A 的列表和 total 永远不包含成员 B 的私有数据。
- 超过末页返回空集合及真实元数据。
- D1 batch 任一查询失败时不返回部分响应。

### 9.2 前端

- 数字页码、省略号、首尾页、20/50/100 Select 与移动端模式。
- URL 初始化、刷新恢复、浏览器前进后退与过滤回到第一页。
- 竞态请求取消、加载禁用、局部错误和删除后回退一页。
- 左右滚动区互不影响；移动端无双滚动。
- ready、coming_soon、403 和 404 四种路由状态正确区分。

### 9.3 最终验收

- 范围内所有列表页都有完整数字页码、总条数和 20/50/100 页大小。
- 所有列表均为服务端分页，URL 可恢复当前状态。
- 私有页面的记录和总数均无跨用户泄漏。
- 左侧菜单和右侧内容可以独立上下滚动，右侧布局明显更紧凑。
- 左侧可点击菜单全部能正常显示功能；未实现项统一禁用并标注“建设中”。
- 使用官方 shadcn/ui 成熟组件并保留项目可定制源码。
- `npm run check` 和新增专项测试全部通过。
- 不新增超出 Cloudflare 免费服务边界的依赖。
