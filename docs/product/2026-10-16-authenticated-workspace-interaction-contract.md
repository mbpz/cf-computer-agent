# 登录后工作台交互契约与页面迁移矩阵

日期：2026-10-16。状态：**实施中**。范围：`docs/product/2026-10-15-authenticated-workspace-design-research.md` 方案 A（清晰工具型工作台）的落地契约与逐页迁移进度。

本文件回应研究文档 §7.3「书面设计评审」：固定共享组合的接口与状态语义，并按入口记录迁移证据。**它不是 beUI 官方组件文档，也不表示逐页行为验收已完成。**

## 1. 共享组合（项目自有，非 beUI 组件）

| 组合 | 文件 | 接口 | 契约 |
| --- | --- | --- | --- |
| PageHeader | `frontend/components/ui/page-header.tsx` | `{ title, description?, status?, icon?, actions?, className? }` | 恰好一个 `<h1>`；`description` 最多一行上下文并由 `aria-describedby` 关联；`status` 承载私有/只读/已归档等**真实状态文本**（不只靠颜色）；`icon` 是标题前的可选 Phosphor 字形，**不进入**标题可访问名；动作行由共享组件负责换行 |
| FilterSelect | `frontend/components/ui/filter-select.tsx` | `{ label, ariaLabel, value, options, onChange, disabled, className }` | beUI `Select`，历史可访问名以 `sr-only` 文本进触发器内部，保持 `aria-haspopup="listbox"`；DOM 不再是原生 `<select>` |
| AppliedFilters | `frontend/components/ui/applied-filters.tsx` | `{ filters: { id, label, onRemove }[], onClear, clearLabel, ariaLabel }` | 无生效条件时渲染空；有则给出可移除条件（`aria-label="<clearLabel>: <label>"`、`data-filters-clear`）与清空入口，容器为 `role="group"` |
| DataTable | `frontend/components/data-table.tsx` | 既有 | 刷新期间保持行挂载（`loading` 只透传给 `Table`），空数据换 `emptyState`；服务端分页与稳定行标识不变 |
| PageState | `frontend/components/ui/page-state.tsx` | 既有 | `loading`（`aria-busy`）/`empty`/`degrades`/`error`（`role="alert"`）只用于**内容区**，不替代整页 |

设计 token 沿用 `frontend/styles/globals.css` 现值，不新增体系：`--radius: 0.55rem`（`--radius-sm/md/lg` 派生）、`--ease-out: cubic-bezier(.16,1,.3,1)`、`--ease-in-out`、`--ease-drawer`；强调色、`--muted`、`--border`、`--accent` 未改动。标题字号 22px、字距 `-.02em`；正文/操作文字 14–16px（§4.6 建议值中的前两档已按此实现）。

## 2. 状态契约（§4.3 / §4.5）

1. **页面壳常驻**：首次加载、刷新与读取失败都不卸载页面头部与工具栏；加载/错误/空态落在内容区。
2. **旧结果保留**：同一查询的刷新失败保留已加载行并就地报错；**筛选条件变化后的失败不展示上一条件的行**（避免把旧结果伪装成新条件的答案）。
3. **操作错误就地**：动作错误留在对应面板（`role="alert"`），页级 toast 只作辅助，不承载唯一恢复入口；未知写入继续由各页 `*WriteRecovery` 保留操作编号与核验入口。
4. **权限一致**：客户端可见入口必须与服务端要求的 capability 一致，不得让导航提供 API 会拒绝的入口。

## 3. 本轮已验证的修复

| 项 | 事实 | 证据 |
| --- | --- | --- |
| 分析入口权限错配 | `/admin/analytics` 的 API（`overview`/`activity`）要求 `audit:read`，而路由能力表曾声明 `analytics:read` 并附带一条能力桥接，导致导航出现 API 必然 403 的入口 | 声明改为 `audit:read`，移除桥接；`routeAccessAllowed` 断言覆盖：仅 `analytics:read` → false、含 `audit:read` → true、掩码位 13 → true、掩码位 14（analytics）→ false（`test/unit/frontend-shell.test.tsx`） |
| 403 表面重复 | 外壳与各页各自渲染一份「禁止访问」文案 | 统一为单一表面 `frontend/pages/admin/admin-forbidden-page.tsx`，外壳用通用文案渲染该组件，管理端保留其原页面文案作为默认值；`data-page-state="forbidden"` 与 `role="alert"` 保留 |
| PageHeader 图标位 | 工作台各页头部均为「图标 + 标题」结构 | 新增 `icon` 槽位，字形在 `<h1>` 之前且不并入标题文本（`test/unit/frontend-page-header.test.tsx` 断言顺序与标题名） |
| 知识浏览三页头部/筛选统一 | `/knowledge`、`/my-submissions` 此前在加载/错误时用整页早返回卸载头部；`/knowledge` 回顾周期是原生 `<select>`；仅存在于 URL 的知识筛选不可见 | 三页改用常驻 PageHeader；回顾周期改 shared FilterSelect（保留历史可访问名与 daily/weekly 值）；知识 URL 筛选与提交范围改由 AppliedFilters 呈现并可逐项移除/清空；筛选条件变化时列表状态重置，避免把上一条件的行当作新条件的答案，同查询刷新仍保留旧行。证据：`test/unit/frontend-knowledge-submissions-header.test.tsx` |
| 任务列表壳常驻 | 页面本地 `FilterSelect` 复制件、手写头部（`<h1>` + 搜索/筛选网格）与整页早返回同时存在：加载/错误时头部与筛选整体消失，且 `:118` 的原生 `<select>` 与共享组件重复 | 删除页内复制件，改用共享 `FilterSelect ×3`、`PageHeader`、`AppliedFilters`，`PageState` 移入内容区；新增任务列表断言：一个标题 `<h1>`、三个 beUI listbox 及其历史可访问名与选项值、可移除条件 + 清空入口（`test/unit/frontend-tasks-page.test.tsx`） |
| 条件变化的旧行 | 同一查询刷新失败保留行并就地报错；条件集变化（选择筛选或提交文本筛选）后旧条件的行不再作为新条件的答案展示，失败即进入错误内容区 | 路由以条件键重置为 `loading`（`frontend/app.tsx` `appliedFiltersRef`），仅条件变化时触发；`test/unit/frontend-tasks-route.test.tsx` 断言条件变化失败后上一条件行消失、头部与筛选仍在 |
| 管理端壳常驻 | `frontend/pages/admin/` 的审核队列、审计、资产队列、重复候选、成员、角色列表、角色详情、菜单树、空间与集合、站点统计、审核详情共 11 处页内早返回曾使头部（及工具栏）在加载/读取失败时整体卸载；成员状态筛选是原生 `<select>`（无 AppliedFilters） | 头部（及筛选行）上移到状态分支之上，只有内容区在 loading / error / ready 间切换；加载态由裸 `Skeleton` 改为 `PageState kind="loading"`；成员状态改共享 `FilterSelect`（保留可访问名 `Member status` 与选项值）+ `AppliedFilters`；`admin` 概览页本就常驻，未改动；请求形态、分页、决策/发布流程、审核队列路由状态与恢复锁、草稿与离页守卫均未改动。证据：`npx vitest run test/unit/frontend-admin-pages.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-admin-queue-filters.test.tsx test/unit/frontend-admin-analytics-route.test.tsx`（前者新增「加载与读取失败时标题 `<h1>` 仍在」逐页断言） |

| 阅读页加载期标题 | 阅读页在加载期间即渲染「Untitled knowledge」，既让读者看到一个并不存在的标题，也使「确实无标题」与「尚未加载」不可区分（另有套件据该字符串判断就绪，因此提前退出等待） | 标题按状态取值：ready 才使用条目标题或 `KNOWLEDGE_UNTITLED` 兜底，loading 用 `KNOWLEDGE_READER_LOADING`，error 用 `COMMON_VALUE_UNAVAILABLE`；`description`/`status` 仍仅在 ready 出现。证据：`npx vitest run test/unit/frontend-knowledge* test/unit/frontend-reader* test/unit/frontend-a11y.test.tsx`（27 文件 / 349 用例） |
| 真实浏览器核验（§4.2/§4.3） | 单元测试只能证明 DOM 契约，不能证明布局是否真的常驻、是否横向溢出 | 用真实 Chromium 挂载真实页面（外层为真实 `AppShell`）核验 10 个页面状态：`/calendar` ready/loading/error、`/today` loading、`/agent` loading、`/knowledge/:id` loading/error、`/inbox` loading/error、`/graph` error、`/goals` error。结果：每个页面状态**恰好一个标题 `<h1>`**；loading 与 error 下头部仍在；`/inbox` 的筛选触发器与快速捕获按钮、`/graph` 的三个 beUI 筛选在失败态仍在（原生 `<select>` 计数为 0）；1280px 与 375px 下块级与外壳横向溢出均为 0。核验用的一次性探针与本地 vite 服务已在核验后删除 |

| 未归属候选人工对账 | 本轮统一使 `frontend/app.tsx`、`frontend/features/environments/environments-page.tsx`、`frontend/pages/admin/role-detail-page.tsx` 的候选坐标位移与源文件指纹变化，`scripts/frontend-operation-inventory.test.mjs` 因此两次失败（候选集合与指纹） | 按候选自身锚点（kind/tag/owner/handlers/labels/arguments 等）在文件内建立双射后重定位 20 行，逐字保留原裁定，刷新 3 个指纹，无新增或删除候选。证据：`node --test scripts/frontend-operation-inventory.test.mjs`（10 通过）；`npm run test:smoke`（88 + 14 + 30 通过、0 失败，含 legacy audit、App/WCAG 合同、操作清单、i18n 与台账校验） |

## 4. 迁移矩阵

状态含义：`migrated` 已改用共享组合**并经本轮本地验证**（该页所在套件通过，且逐页断言「加载与读取失败时标题仍在」）；`partial` 该行还有未验证部分；`pending` 未开始。**`migrated` 只表示头部/筛选/壳常驻契约，不表示该页的产品行为验收已完成**（见 §5）。

重要更正（本轮已收敛）：审核队列**曾**不是「壳常驻」的参考实现——`ReviewQueuePage` 的 `PageHeader` 原先位于两个早返回之后（`frontend/pages/admin/review-queue-page.tsx`），加载/错误时同样卸载头部。本轮已把管理端各页的头部（含筛选/工具栏）上移到状态分支之上，只有内容区在 loading / error / ready 之间切换。路由继续无条件渲染页面并传入 `state`（`ReviewQueueSession` 的请求状态、刷新保留与恢复锁未改动）。

| 模板 | 入口 | 头部 | 查询/筛选 | 壳常驻（§4.3） | 状态与证据 |
| --- | --- | --- | --- | --- | --- |
| 管理概览 | `/admin`、`/admin/analytics` | PageHeader | 范围控件（`days` 属范围而非列表条件，保留原有控件） | 是 | migrated（`frontend-admin-*` 33 文件 / 585 用例；本轮修 `audit:read` 权限错配） |
| 管理队列 | `/admin/submissions`、`/admin/assets`、`/admin/duplicates`、`/admin/audit`、审核队列 | PageHeader | FilterSelect + AppliedFilters | 是（五处页内早返回已移除） | migrated（同上；新增逐页「加载/失败时标题仍在」断言） |
| 管理配置/详情 | `/admin/members`、`/admin/roles`、`/admin/menus`、`/admin/spaces`、`/admin/submissions/:id` | PageHeader | 成员状态改共享 FilterSelect + AppliedFilters；角色/菜单/空间无列表条件 | 是（五处早返回已移除） | migrated（同上） |
| 工作对象列表 | `/inbox`、`/goals`、`/projects` | PageHeader（图标经 `icon` 槽；`status` 承载「Private to you」文本） | FilterSelect + AppliedFilters | 是 | migrated（21 文件 / 469 用例；浏览器核验 `/inbox`、`/goals`） |
| 个人工作概览 / 多维视图 | `/today`、`/review`、`/calendar` | PageHeader | 维持现有范围控件 | 是（`/calendar` 仅错误分支需移动） | migrated（16 文件 / 228 用例；浏览器核验三态） |
| 阅读页 | `/knowledge/:id` | PageHeader（此前**无 `<h1>`**；加载期标题不再伪装） | 目录 `lg:sticky`（外壳仍是唯一纵向滚动容器） | 是 | migrated（27 文件 / 349 用例；浏览器核验 loading/error） |
| AI 工作区 | `/agent` | PageHeader + SummaryRow | 来源范围改 beUI Select（`#agent-scope-kind` 由包裹 Label 提供可访问名） | 是 | migrated（99 用例；浏览器核验 loading） |
| 知识浏览 | `/knowledge`、`/search`、`/my-submissions` | PageHeader（`BookOpen`/`Files`/`MagnifyingGlass`；`/knowledge` 的 `status` 承载「Private」） | `/knowledge`：回顾周期改 FilterSelect，URL 筛选以 AppliedFilters 呈现；`/my-submissions`：范围控件保留 + 生效范围以 AppliedFilters 呈现；`/search`：沿用既有查询行 | 是 | migrated（`frontend-knowledge-submissions-header.test.tsx` + 知识/阅读套件） |
| 内容提交 | `/submit` | PageHeader（保留 `submission-description` 供表单 `aria-describedby`） | n/a | 是（本就常驻） | migrated（4 文件 / 31 用例） |
| 协作 | `/notifications`、`/messages`、`/messages/:id` | PageHeader（`Bell`/`ChatCircle`；线程返回链接与刷新进动作行） | `/notifications`：FilterSelect ×2（历史名 Read status / Notification type）+ AppliedFilters | 是（三处整页早返回已移除） | migrated（14 文件 / 315 用例） |
| 账号设置 | `/settings` | PageHeader（去掉与侧栏品牌重复的 eyebrow） | n/a（语言选择是持久偏好，保留原生控件） | 是 | migrated（同上） |
| 图谱/环境 | `/graph`、`/environments` | PageHeader（`ChartLine`） | `/graph`：Input + FilterSelect ×3 + AppliedFilters（禁止态不渲染已应用条件，避免暴露私有筛选文本）；`/environments`：类型筛选改 FilterSelect + AppliedFilters | 是 | migrated（同上；浏览器核验 `/graph` 失败态三个筛选仍在） |
| 任务列表 | `/tasks` | PageHeader（`Checks`） | FilterSelect ×3 + 搜索/标签 + AppliedFilters | 是 | migrated（10 文件 / 226 用例；页内 `FilterSelect` 复制件已删除） |
| 看板 | `/boards` | PageHeader | 无列表筛选（列即状态） | 是（本就常驻） | migrated（同上） |

## 5. 边界

- 本轮不改公开落地页、登录页、后端授权、成员隔离与数据模型；不改 URL、分页、幂等与草稿/写入守卫。
- 「阅读时不必拉回末尾」在 `/agent` 已满足：现有实现没有自动滚动，且流式传输只发一个终结答案帧，因此**不新增**滚动跟随逻辑。
- 迁移只统一头部、筛选与应用条件；表格容器、服务端分页与局部滚动沿用既有 `DataTable`，不引入组件内置排序。
- **拒绝/撤权清理用两种机制**：`/calendar` 由路由标记 `denied` 后显式关闭创建界面并删除私有草稿（401/403/404）；`/goals`/`/projects` 的创建与确认浮层仍以 `ready` 为门，因此拒绝时随内容区卸载（可重试的读取失败仍按设计保留已确认意图）。两者都满足各自既有断言，但机制不同，后续统一前不要假定它们等价。
- **禁止访问表面没有标题级元素**：外壳级 403 复用 `frontend/pages/admin/admin-forbidden-page.tsx`（`role="alert"` + `data-page-state="forbidden"`），其标题是 `AlertTitle`（`div`）。管理端页面自身仍有 `PageHeader` 提供 `<h1>`；外壳整页替换时页面上没有 `<h1>`。WCAG 2.2 不要求每页必须有 `<h1>`，故本轮不改，记录为已知差异。
- **浏览器核验的范围**：真实 Chromium 覆盖 1280px 与 375px、浅色主题、英文界面下的 10 个页面状态（见 §3）。**未**覆盖 320/768px、深色主题、中文界面、键盘/触屏操作、真实登录态与生产环境。
- **阅读页目录吸附**仅以类名与祖先链证据（`lg:sticky lg:top-6 lg:self-start`，外壳仍是唯一纵向滚动容器）支持；浏览器核验只覆盖其 loading/error 态，未渲染已就绪的正文。
- 尚未完成：逐页截图审计、34 类入口的完整状态矩阵、真实身份与生产部署后的 signed-browser 验收。
