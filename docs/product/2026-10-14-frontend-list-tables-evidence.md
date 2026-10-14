# 2026-10-14 列表表格化与菜单树（beUI table / file-tree）本地证据

基线：`main` / `441cb523`，工作树干净。本轮为本地实现与本地验证，**未 push、未部署、未远程迁移、未读取或写入任何密钥**，不构成生产发布或签名浏览器验收。

## 1. 范围（用户决定）

用户要求：菜单树需要一个 tree 组件；很多使用分页的页面需要一个 table 组件。经确认的三个决定：

| 决定点 | 选择 |
| --- | --- |
| 表格与分页的关系 | 改用 `onEndReached` 无限滚动，编号分页退役 |
| 迁移范围 | 树 + 组件 + 全部 21 个 `DataPagination` 消费者 |
| 功能开关 | 不启用排序 / 行选择 / 列宽列序 / 内联编辑（无调用点即死 UI） |

**本轮完成**：beUI `table` 与 `file-tree` 落地（含本地适配）、共享 `DataTable` 包装、21 个列表页 + 3 个编辑器组件 + 环境页迁移、19 条路由改追加语义、编号分页机件与死代码删除、菜单树换 `file-tree`、契约脚本替换、生成物与文档对账。

**本轮明确未做**：游标分页面（admin spaces、讨论串 `DiscussionCursorPagination`、knowledge 活动面板）保持原样；表格排序/行选择/列宽列序/内联编辑不启用；真实身份与生产 API 的浏览器验收。

## 2. 依赖与来源

- beUI 源码取自公开注册表 `https://beui.dev/r/{slug}.json`（2026-10-14 拉取）：`table`（16 文件）、`file-tree`（4 文件，含内部依赖 `shared-layout-bg.tsx`）、`lib/touch.ts`；`lib/utils.ts` 仓库已有一致实现，未覆盖；`lib/ease.ts` 上游少了 `SPRING_GLIDE` 的 `type: "spring"` 一行，按「保留本地改动」还原仓库版本。
- 新增 npm 依赖：`@tanstack/react-virtual`（beUI table 的虚拟化运行时）。
- 图标：上游用 `lucide-react`，本仓库统一 `@phosphor-icons/react`（`frontend/components.json` 的 `iconLibrary` 已是 phosphor）；映射为 `ArrowLineDown` / `ArrowLineUp` / `ArrowLineLeft` / `ArrowLineRight` / `DotsThreeVertical` / `DotsThree` / `Trash` / `CaretUp` / `CaretDown` / `CaretRight` / `DotsSixVertical`。
- 导入路径按仓库约定改为相对导入（编辑器 TS 服务不解析 `@/*`）。
- **本地适配（相对上游的每一处改动）**：
  - `Table`：新增 `ariaLabel`（表格可访问名，上游无）、`TableColumn.cellClassName`（多行单元格覆盖默认 `truncate`）、`Table.virtualize`（默认 `true`，本仓库一律 `false`）。
  - `FileTree`：`name` 由 `string` 放宽为 `ReactNode`；新增 `action` 插槽，行控件渲染在行按钮**之外**（行按钮内嵌交互控件是无效 HTML）。

## 3. 取舍

| 候选 / 决定 | 结论 | 依据 |
| --- | --- | --- |
| beUI `table` | 采纳 | 渲染真 `<table>`、受控排序、`onEndReached` + 骨架行 + 空态；本批只用其表格与追加能力 |
| `table-async` 与 `table` | 同一份源码 | 两者文件清单完全一致，异步只是文档页的用法；不做第二套 |
| `virtualize={false}` | 采纳（本地适配） | 本仓库列表是**有界服务端窗口**（每页 20 行、按 totalPages 终止），虚拟化没有收益却带来代价：固定行高裁切多行内容、DOM 依赖测量尺寸（无布局环境下渲染 0 行）、破坏 find-in-page/打印/可访问性 |
| 编号分页（`DataPagination`） | 退役 | 用户选择无限滚动；页长选择器与「跳到第 N 页」深链随之一并移除 |
| beUI `file-tree` | 采纳 | 提供 `role="tree"`、roving tabindex、方向键/Home/End、分支动画与 selection 滑块；菜单树保留全部行内编辑控件（位置草稿、确认弹窗、系统行不可编辑/删除） |
| `KnowledgeCard` / `SearchResultList` | 删除 | 其列表体被 `DataTable` 取代后无应用内消费者；分享逻辑抽出为 `KnowledgeShareButton` 由卡片与列表共同复用，分享生命周期测试改判新主体 |
| 讨论串游标分页 | 保留 | 线程顺序语义与「编号分页」不同，且不在用户指定的 21 个页面内 |

## 4. 变更

### 4.1 共享层

- `frontend/components/data-table.tsx`（新增）：`rows / columns(cell, cellClassName, width, align) / rowId / ariaLabel / emptyState / loading / hasMore / onLoadMore / locale / rowHeight / maxHeight / minHeight / loadingMoreLabel / endOfListLabel`。语义：分页结果**追加**；视口未填满时自动补拉下一页（否则近底触发永远不会发生）；`role="status"` 只在有可播报文本时渲染（常驻空 live region 会污染可访问性树并破坏既有 `[role="status"]` 为 null 的断言）。
- `frontend/components/motion/table/**`、`frontend/components/motion/file-tree.tsx`、`frontend/components/motion/shared-layout-bg.tsx`、`frontend/lib/touch.ts`：vendored（见第 2 节）。

### 4.2 页面

全部 21 个列表体换为 `DataTable`（行高按内容取 56–160，宁可大不可裁）：

| 分组 | 页面 |
| --- | --- |
| 管理员 | `admin/audit-page`、`admin/analytics-page`、`admin/asset-queue-page`、`admin/duplicate-queue-page`、`admin/members-page`、`admin/review-queue-page` |
| 成员 | `knowledge-page`、`search-page`、`my-submissions-page`、`tasks/tasks-page`、`inbox-page`、`notifications/notifications-page`、`boards/boards-page`（四列各自一张表） |
| 规划 | `goals-page`、`projects-page`、`project-timeline-page`、`calendar-page` |
| 组件 | `components/focus-task-picker`、`components/goal-tasks-editor`、`components/project-relations-editor` |
| 环境 | `features/environments/environments-page`（自建 prev/next 删除，按 `EnvironmentManager` 快照累加，保留 500 页硬上限） |

保留项（逐页核对）：所有既有 `data-*` 标记、`role`、`aria-label`、权限判定、写恢复（pending / record-blocked / unknown-write / leave guard / 不重发 POST）、初始 loading 与 error 的 `PageState`、空状态经 `emptyState={<PageState kind="empty" .../>}` 传入（`data-page-state="empty"` 载体不丢）。

### 4.3 路由

19 条路由改为追加语义（编号页 URL 状态删除，筛选参数保留）：`listPageSize = 20`、路由自持 controller、仅在 `generation` 当前时写 state、`targetPage > 1` 追加否则替换、失败保留已加载窗口、`onLoadMore` 在 `page >= totalPages` 时短路。写后回读一律回到第 1 页替换窗口（版本条件写使整窗失效）。

### 4.4 删除

`frontend/components/data-pagination.tsx`、`frontend/components/ui/pagination.tsx`、`test/unit/frontend-pagination.test.tsx`、`frontend/components/knowledge/knowledge-card.tsx`、`frontend/components/search/search-result-list.tsx`、`scripts/formal-pagination-contract.test.mjs`（由新契约取代）、`test/fixtures/formal-source-braces.tsx`；i18n 键 `PAGINATION_TOTAL` / `PAGINATION_VISIBLE` / `PAGINATION_MOBILE_SUMMARY` / `ENV_PAGINATION` / `ENV_PREVIOUS` / `ENV_NEXT` / `ENV_PAGE`；`FrontendPaginationLabels` 收窄为仍在使用的 5 个字段（讨论串游标分页）；`app.tsx` 的 `samePageQuery` / `sameSearchQuery` / `sameNotificationQuery`；三处 `nextCursor`「Load more」死分支。`parsePageSearch` / `writePageSearch` / `createNumberedRequestController` / `normalizeNumberedPage` / `supportedPageSizes` **保留**（数据层仍在用于服务端页码契约与 URL 校验）。

### 4.5 契约与门禁

- `scripts/infinite-list-contract.test.mjs`（新增，替代 `formal-pagination-contract.test.mjs`）：21 个列表面必须渲染 `<DataTable>` 且传 `onLoadMore`、不得再出现编号分页标记；全仓第一方源码不得再引用 `DataPagination` / `components/data-pagination`；`frontend/app.tsx` 必须使用 `listPageSize` 且不再传 `onPageChange` / `onPageSizeChange`；服务端窗口契约（`supportedPageSizes` / `normalizeNumberedPage` / `listPageSize`）保持不变；并带一个**能捕获违规的反例夹具**（`test/fixtures/infinite-list-contract.tsx`）。
- `scripts/i18n-contract.test.mjs`：新增工作台词表（`frontend/lib/i18n.ts`）的**中英键与占位符 parity** 校验——此前只有落地页词表受此保护。
- `tsconfig.json` 的 `lib` 增加 `DOM` / `DOM.Iterable`（原因见第 6 节）。

### 4.6 菜单树

`frontend/pages/admin/menus-page.tsx`：树结构交给 `FileTree`（`role="tree"`、方向键导航、折叠状态、selection 滑块），每行编辑控件仍由页面自己的行组件持有（位置草稿、`ConfirmAction`、系统行不可编辑/删除、位置冲突尝试恢复）。行名渲染两行（`labelKey` + `path · requiredBits`），徽标与控件在行按钮之外。

## 5. 验证（本轮实际运行）

- 完整本地门禁：`npm run test:smoke` **86/86**、`test:i18n` **14/14**、`verify:i18n`（keys=434 placeholders=55 files=6 + 硬编码文案 AST）、`verify:delivery-status` **30/30**；单元 **366 文件 / 5225 用例**全通过；Worker 套件 **71 文件 / 1203 用例**全通过；`npm run typecheck`（worker + frontend）**0 错误**。
- 页面级测试合并跑：**25 文件 / 344 用例**全通过。
- 真实浏览器（托管 Chromium，非 PiP 窗口）：
  - `MySubmissionsRoute` 探针：首屏 20 行 → 表格内滚动触底追加至 25 行（无重复）→ 末页播报 "No more items" → 二次滚动不再请求；0 控制台错误。
  - `AdminMembersRoute` 探针（注入数据层）：首屏 20 行（20 个唯一邮箱，无分页器）→ 滚动追加至 40 行（40 个唯一邮箱）→ 行内状态按钮 → 确认弹窗 → 注入的 `update` 记录 `update:member-1:disabled` → 写后按契约回读第 1 页；0 控制台错误。
  - 菜单树探针：`role="tree"` + 7 个 treeitem 且 `aria-level` 为 1,2,3,3,2,1,2 → 折叠生效（7→3）→ 行内控件在位（系统行无编辑/删除，状态行显示 Enable/Show）→ 改位号 → 确认弹窗 → 写回调收到 `position: 9` 与 `expected` 快照；0 控制台错误。
  - 三个探针均为临时入口，验证后已删除。
- 生成物对账（有意重新生成，非绕过）：操作清单 `290 → 304` 文件 / `1219 → 1232` 候选；未归属候选 `120 → 120`（新增 0：本批引入的未归属候选随被替换组件一并删除）；`frontend/app.tsx` 与 `frontend/features/environments/environments-page.tsx` 的人工复核指纹已刷新，其余未归属行逐条未变。

## 6. 边界（未验证 / 有意取舍）

- **`tsconfig.json` 的 lib 增加 DOM**：本批 vendored 的表格与触摸工具是 DOM 组件，而 worker 门禁（`tsc --noEmit`）会经 `test/**/*.ts` 的导入图编译到它们。此前「worker 侧误用 DOM 会被编译器拦住」是一条**隐式**保证（无对应显式检查）；本批改为编译器不再拦截，属已知削弱。要恢复应改门禁结构或新增显式检查，属独立工作。
- `test/unit/markdown-renderer.test.ts` 与 `test/unit/m1-mutation-matrix.test.ts` 中 6 处 happy-dom 节点传参改为按调用签名窄化（仅类型层，无行为变化）。
- 未做真实身份 / 生产 API / 真机 / Safari 的浏览器验收；`prefers-reduced-motion` 路径未实测。
- 「跳到第 N 页」深链与页长选择（20/50/100）能力随无限滚动移除：列表只保留筛选参数。
- 游标分页面未迁移：admin spaces、讨论串、knowledge 活动面板。
- 历史文档（`docs/operations/evidence/*`、`docs/product/2026-09-13-workbench-extended-route-audit.md` 等）保留原状，其「数字分页」表述描述的是本批之前的模型；当前模型以本文件与 `docs/product/delivery-status-ledger.md` 的 `WB-PAGE` 行为准。

## 7. 复现命令

```
npm run typecheck
npm run test:smoke
npx vitest run test/unit
npm run test:worker
```
