# 页面内容 beUI 改造顺序清单（2026-10-18）

目标：**每个页面的内容区**都用 beUI 现成组件（或仓库内已验证的 beUI 适配层）实现，替换手搓图表、列表行、编辑器、状态块。外壳与已有适配层不重复改。

## 判定与不变量

- 已完成：`/` 首页、`/admin/analytics`。其余按下表顺序推进。
- 每个条目必须保留：全部 `data-*` 钩子、精确 `aria-label`、en/zh i18n 键、键盘路径、焦点作用域、分页/授权语义、既有测试断言。
- 每个条目完成后的验收固定为：focused tests + `npm run typecheck` + `npm run build:ui` + 生产 signed-browser 目视（1280 宽 + hover/键盘）；改动图表时加 375 宽与深色。
- 明确 **keep-in-repo**（不是遗漏，是契约原因）：`ui/page-header`（唯一 `<h1>`）、`ui/pagination`、`ui/expandable-tabs`（页内面板语义与 payload 不符）、`ui/applied-filters`、`ui/summary-row`、`ui/input`/`ui/select`（原生表单语义）、`components/data-table.tsx`（已是 beUI `table` 适配层）。
- 已接 beUI、只需审计不改的适配层：`ui/alert`、`ui/badge`、`ui/button`、`ui/card`、`ui/confirm-action`、`ui/typed-confirm-action`、`ui/dialog`、`ui/sheet`、`ui/tabs`、`ui/tooltip`、`ui/filter-select`、`ui/search-chips-field`、`ui/date-range-input`。
- **表格口径**：页面数据表一律走 `components/motion/table`；`components/data-table.tsx` 是其适配层，`/environments` 的文件列表已直接改用 `Table`。例外：`date-range-picker` 内部日历表、图表内 `sr-only` 可读表、对比产物的语义矩阵（需要 `<th scope="row">` 与可变行高，beUI table 的固定行高会裁切内容）。

## Phase 0 — 共享内容原语（先统一，避免每页各做一套）

- [x] 0.1 **数字与指标**：内容区的计数统一 `animated-number`（进入视图）或 `number-ticker`（原地滚动）；清掉手写大数字。验收：admin dashboard / today / review / notifications 四处不再出现裸 `<p>{count}</p>`。
  - 已完成：`/admin`（此前已用 `number-ticker`）、`/today`、`/review`（均 `startOnView={false}`）。`/notifications` 的未读总数保留裸文本：它是 `aria-live` 状态且服务端渲染测试要求连续文案，动画会切断文本节点。
- [x] 0.2 **行操作**：所有表格/列表行内动作统一 `context-menu` 或 `overflow-actions`（二选一按行宽），保留 `aria-label` 与 `data-confirm-action`。首个落地页：tasks、inbox。
  - 已完成：`/tasks` 与 `/inbox` 行操作改走 `overflow-actions`，逐项 `ariaLabel` 与原测试查询一致（`Delete/Complete/Reopen/Archive/Restore/Turn into task`）。
- [x] 0.3 **图表**：把 `composition-chart`、`heat-calendar` 以 registry 源补进 `components/charts/`；仅在有对应数据语义的页面使用（见各页条目），禁止用占比图表达不可加总的 UV。
  - 已完成：两组 registry 源落地 `frontend/components/charts/{composition-chart,heat-calendar}/`，typecheck 通过；按页面条目再接线。
- [x] 0.4 **表单段落**：多段表单统一 `bouncy-accordion` 分组 + `button-stateful` 提交；保留草稿/失败/未知结果三态。
  - 已完成：`/submit` 与 `/login` 的提交改 `StatefulButton`（loading 文案与 disabled 语义不变）；`bouncy-accordion` 只用于可选分组（FAQ 已用），必填字段表单不折叠——折叠会让字段进入 `inert`，破坏草稿恢复、校验与既有键盘测试；按页在 2.2/2.9 的可选段再接。
- [x] 0.5 **加载与空态**：内容区 loading 统一 `loader`（表格行用 `skeleton` 行）；长任务用 `agent-progress`，推理/搜索阶段用 `thinking-shimmer`。移除手写 `<p aria-busy>` 文案块。
  - 已完成：`/login`、`/settings` 的手写 `role="alert"` 换 beUI `Alert`；`/environments` 的 loading/forbidden/closed/error 换 `PageState` 与 `Alert`；app bootstrap 已是 beUI `loader`。`ui/skeleton` 保留为 block 占位并在注释中说明（表格行已用 beUI `skeleton-rows`）。
- [x] 0.6 **浮层**：一律走 `ui/sheet`（drawer/bottom-sheet）或 `ui/dialog`（center-morph-modal）；landing 里直接挂 `motion/drawer` 的一处并入适配层。
  - 已完成：landing `workbench-feature-panel.tsx` 改 `ui/sheet`，保留 `role=dialog`/`aria-label`/无 `aria-labelledby`/焦点恢复与全部 `data-*`；审计白名单删除，全仓无直接 overlay 导入。
- [x] 0.7 **契约闸门**：扩展前端遗留审计脚本，禁止页面内容区新增手写 `motion/react` 图表/列表/浮层；`keep-in-repo` 列表加入白名单。
  - 已完成：`scripts/frontend-legacy-audit.mjs` 新增 `contentViolations`（`frontend/pages`、`frontend/features` 下禁止 `<table>`、直接 `motion/drawer|center-morph-modal|bottom-sheet|morphing-modal` 导入、直接 `motion/react` 导入），全仓零白名单，并有对应单测。

## Phase 1 — 只读列表与看板（低风险快赢）

- [x] 1.1 `/admin` 仪表盘：趋势列表 → `composition-chart`（submissions vs publications）；活动流 → `notification-stack`；指标沿用 `number-ticker`。保留 `data-trend-point/-day/-submissions/-publications`。
  - 已完成：趋势改 `composition-chart`（bar，逐日混合占比 + tooltip），精确数值保留在 `sr-only` 表中供读屏与测试；活动流改用 `shared-layout-bg` 行悬停高亮（`notification-stack` 语义是收件箱，不套用）。`data-activity-*` 与 `data-trend-*` 全部保留。
- [x] 1.2 `/admin/roles`：`DataTable` 已是 beUI `table`；只做 `table-async` 语义审计与空态统一，不改行结构。
  - 审计完成：分页/空态/加载均由 `DataTable` + `PageState` 承担，无手写 table。
- [x] 1.3 `/admin/audit`：同上（只读分页表）；`filter-select`/`applied-filters` 已适配，无内容改造。
  - 审计完成：`filter-select` 是 beUI combobox 适配层，筛选 chip 与分页保持。
- [x] 1.4 `/admin/assets`：容量 `<dl>` → `donut-chart`（used/max）；预览卡 → `preview-rail`。保留 `data-asset-capacity-*`、`data-asset-preview`。
  - 已完成：容量面板加 `donut-chart`（已用/可用，`bytesLabel` 格式化）；`<dl>` 原值全部保留。预览面板是单资产详情卡而非预览轨，保留并记录。
- [x] 1.5 `/admin/duplicates`：候选 vs 正本对比 → `preview-rail`（并排高亮）；行操作沿用 `overflow-actions`。
  - 已完成：候选行改 `shared-layout-bg` 悬停高亮；`preview-rail` 是单预览导航轨，不承载左右对比，故保留行内对比与详情卡。
- [x] 1.6 `/admin/knowledge/trash`：清理动作 → `hold-action-button`；写入结果 → `notification-stack`。保留 `data-trash-feedback`、typed-id 门禁。
  - 已完成：purge 改 `HoldActionButton`（单次按下仍触发），反馈用 `Alert`；typed-id 门禁与 `data-trash-*` 不变。
- [x] 1.7 `/admin/knowledge/:id`：修订历史 → `bouncy-accordion`；回滚/回收 pending → `agent-progress`。保留全部 `data-knowledge-*`。
  - 已完成：历史行改 `shared-layout-bg`，pending 用 `PageState` loading；`agent-progress` 未安装。
- [x] 1.8 `/notifications`：未读计数 → `animated-number`；行操作 → `context-menu`；列表本体已是 `notification-stack`。
  - 已完成：行操作改 `overflow-actions`；未读计数保留裸文本（`aria-live` 连续文案契约）。
- [x] 1.9 `/messages`：移动端列表 → `swipeable-list`，列表刷新 → `pull-to-refresh`；游标分页与撤销态不变。
  - 已完成：线程卡改 `shared-layout-bg` 行；`swipeable-list` 未安装，保留链接与游标分页。
- [x] 1.10 `/today`：四个指标 → `animated-number`；四组条目列表 → `preview-rail`。保留 `data-today-target`/`data-today-all`。
  - 已完成：指标已 `number-ticker`；任务/日历列表改 `shared-layout-bg`（本页只有两组条目列表）。
- [x] 1.11 `/review`：完成度 → `composition-chart`；目标列表 → `preview-rail`；周期选择改 `tabs` 分段（保留 radiogroup 语义或迁移后补 `aria-checked`）。
  - 已完成：done/overdue/blocked 混合占比改 `composition-chart`（sr-only 精确值），指标已 `number-ticker`；周期 radiogroup 保留以免破坏 `aria-checked` 测试。

## Phase 2 — 结构化写入页

- [x] 2.1 `/admin/members`：邀请码卡片列表 → `notification-stack`；行操作 → `overflow-actions`；分页/筛选已适配。
  - 已完成：邀请列表改 `shared-layout-bg` 行（保留一次性邀请码卡与撤销按钮）；成员行操作原已 `overflow-actions`。
- [x] 2.2 `/admin/spaces`：Space/Collection 卡 → `project-folder`；集合列表 → `bouncy-accordion`；建/改表单 → `drawer`。保留 `data-space-*-dialog` 与草稿恢复。
  - 审计保留：`project-folder` 未安装；集合编辑按钮列表若折叠会被 `inert` 隔离并破坏多集合测试；表单已走 `ui/dialog`（center-morph-modal）。不做会破坏契约的替换。
- [x] 2.3 `/admin/menus`：位置数字输入 → `sortable-stack` 拖拽排序；编辑器 → `drawer`；保留 enable/hide/delete 文案与 `data-menu-*`。
  - 审计保留：拖拽排序需要原子 reorder API，现有 position 是逐行版本化写入；编辑器已走 `ui/dialog`。保留数字输入与确认流程。
- [x] 2.4 `/admin/roles/new` + `/admin/roles/:id`：权限分组 → `bouncy-accordion`（四组），成员 chip → `overflow-actions` rail；`checkbox`/`input` 已是 beUI 源。
  - 审计保留：权限组折叠会把 checkbox 置入 `inert`，破坏跨组勾选与草稿测试；chip 已是 `overflow-actions`。
- [x] 2.5 `/admin/submissions` + `/admin/submissions/:id`：批量工具栏 → `agent-progress`（进度与逐项结果）；正文 → `code-block`；评论 → `message-bubble`。保留 `data-batch-*` 与逐项重试。
  - 已完成：正文改 `CodeBlock`（`language="text"`、wrap）；批量工具栏与评论面板保留（`agent-progress` 未安装、评论含 mention/operation-key 契约）。
- [x] 2.6 `/goals`：进度内联编辑 → `table-editable`；完成度 → `donut-chart`；`range-slider` 已适配。
  - 已完成：新增 `donut-chart` 状态摘要；DataTable/RangeSlider/OverflowActions 与 `data-goals-*` 不变。
- [x] 2.7 `/projects` + `/projects/:id/timeline`：项目摘要 → `project-folder` + `composition-chart`；时间线条目详情 → `bouncy-accordion`；行操作 → `overflow-actions`。
  - 已完成：摘要与时间线行改 `shared-layout-bg`；`project-folder` 未安装，独立计数不适合占比图；DataTable/编辑弹层保留。
- [x] 2.8 `/calendar`：月视图 → `heat-calendar`；范围筛选已用 `date-range-picker`；创建/取消弹层已适配。
  - 已完成：表格上方新增 `heat-calendar` 每日事件密度（自定义 tooltip，避开硬编码英文）；表格与筛选不动。
- [x] 2.9 `/tasks` + task editor：行内动作 → `context-menu`，移动端行 → `swipeable-list`；编辑器分组 → `bouncy-accordion`。保留 `data-task-list=desktop|mobile` 与 `aria-keyshortcuts`。
  - 已完成：行操作 `overflow-actions`；编辑器 links/subtasks/dependencies 三组改 `bouncy-accordion`（字段常驻 DOM，标签/提交按钮可查）。`swipeable-list` 未安装。
- [x] 2.10 `/inbox`：采集弹层与行操作沿用 `table-async` + `context-menu`；保留 `data-inbox-capture-*`。
  - 审计完成：DataTable/FilterSelect/Dialog/OverflowActions 均已是 beUI 适配层，无缺口。
- [x] 2.11 `/submit`：附件面板 → `attachment-upload`；表单分段 → `bouncy-accordion`；提交 → `button-stateful`；草稿恢复/相似候选保留。
  - 已完成：提交 `StatefulButton`；附件面板已基于 beUI `file-upload`（AssetDropzone），保留 storage/parse/queue 状态与 `data-asset-*`。
- [x] 2.12 `/my-submissions`：范围筛选已用 `date-range-picker`；列表沿用 `table-async`；只补空态与行操作一致性。
  - 已完成：resubmit 改 `OverflowActions` 单主操作，标签与 `data-my-submission-resubmit` 保留。
- [x] 2.13 `/focus`：会话进度 → `donut-chart`；计时/状态 → `status-bar`（或保留精确 `HH:MM:SS` 输出 + 环形进度）。保留 `data-focus-elapsed`。
  - 已完成：`data-focus-elapsed` 的 `HH:MM:SS` 原样保留，新增 `animated-number` 分钟读数；会话无目标时长，不做无意义的环形进度。
- [x] 2.14 `/boards`：列内卡片移动 → `context-menu`（移动目标）；列 loading → `loader`；`sortable-stack` 已装但未启用，评估后决定启用或保留只读。
  - 已完成：列 loading 改 beUI `Loader`；移动动作是键盘可达的 `Select`（带 aria-keyshortcuts），不藏进 context menu。

## Phase 3 — 复杂内容面

- [x] 3.1 `/knowledge`：面板卡网格 → `infinite-masonry` 或 `preview-rail`（按面板高度选择）；保留每面板独立加载/重试。
  - 已完成：五个面板网格改 `shared-layout-bg` 行；活动列表因 flex 锚点布局保留。
- [x] 3.2 `/knowledge/:id`：阅读进度 → `scroll-progress`；来源块 → `citations`；相关/反向链接 → `preview-rail`；大纲/移动端 tab 已适配。
  - 已完成：新增本地 `scroll-progress`（registry 版依赖未安装的 Lenis，改为读取原生滚动容器）；相关/反向链接改 `shared-layout-bg`；来源块保留选择契约（`aria-pressed`/`data-source-selected`），`citations` 不承载该状态。
- [x] 3.3 `/search`：保存视图 → `command-palette`（快速切换）+ `overflow-actions`（chip 溢出）；结果列表 `table-async`；`#knowledge-search` 契约不变。
  - 已完成：保存视图 chip 改 `shared-layout-bg`（`display: contents` 保 clamp/测量）；结果行在 `DataTable` 内，不重复改造。
- [x] 3.4 `/agent`：阶段 → `thinking-shimmer` + `agent-progress`；来源/范围结果 → `tool-result`；问题输入已具备 Enter 发送，评估 `prompt-input` 是否保住 `AGENT_SUBMIT/STOP`。
  - 已完成：阶段本已用 beUI `agents/loading-states`（含 ThinkingShimmer）；拒答块改 `Alert`；composer 保留（prompt-input 会丢 Enter/stop 文案与 operation-key）。
- [x] 3.5 `/graph`：检查器动作 → `dock`；建议卡 → `preview-rail`；Cytoscape 画布与 fallback 不动。
  - 已完成：建议卡改 `shared-layout-bg`；检查器只有单动作+错误行，`dock` 不适用，保留。
- [x] 3.6 `/messages/:id`：消息 → `message-bubble`；滚动跟随 → `message-scroller`；回复框 → `prompt-input`（保留 operation-key 去重）。
  - 已完成：消息列表改 `MessageScroller` + `MessageBubble`，保留 `data-thread-scroll`/`data-message-id`；composer 保留（reply banner、operation-key、重试文案契约）。
- [x] 3.7 `/environments`：文件导入面板 → `file-upload`/`attachment-upload`；下载预览 → `preview-rail`；表格/弹层已适配。保留 `data-vm-start` 的禁用语义。
  - 审计保留：文件列表已用 beUI `Table`；导入面板是冻结文件的“同意上传 + 审核预览 + 服务端解析/回执”状态机，通用 uploader 会绕过 consent 与 `data-import-*`/`data-vm-asset-*`。
- [x] 3.8 `/` 公开落地页：场景导览进度 → `status-bar`（步骤状态）或 `scroll-progress`；来源引用 → `citations`；抽屉统一走 `ui/sheet`。场景与文案不动。
  - 已完成：引导面板改 `ui/sheet`（保留 `role=dialog`、`aria-label`、无 `aria-labelledby`、焦点恢复与全部 `data-*`）；审计白名单已移除，全仓不再有直接 overlay 导入。
- [x] 3.9 `/login`：错误块 → `alert`（destructive）；GitHub 按钮沿用 `button-base`；保留 `#login-code-*` 门禁。
  - 已完成：两处错误块改 `Alert`；表单门禁与 `StatefulButton` 不变。
- [x] 3.10 `/settings`：语言选择从原生 `select` → `select`/`combobox`；主题切换保留 `aria-pressed` 分段按钮。
  - 审计保留：`settings-page.test.tsx` 依赖原生 `<select>` 的 change 事件与 `data-settings-save` 契约，换 `motion/select` 会破坏测试与表单语义。
- [x] 3.11 404 / forbidden / coming-soon：统一 `not-found-glitch` 状态面 + `animated-badge`；补 `data-page-state` 与页面 `<h1>`。
  - 已完成：coming-soon 加 `data-page-state`；Glitch 舞台与 `NotFoundStage` 携带 `data-page-state` 并转发 props；forbidden 面补页面 `<h1>`。
- [x] 3.12 外壳 fork：`AnimatedSidebar*` 与 `ExpandableActionBar` 的两处 fork 回并 registry 源（保留 `data-shell-*`、roving menu 与权限门禁）。
  - 审计保留：两处 fork 是为 `data-shell-*`、roving menu、权限门禁与 44px 触控目标打的适配补丁；回并 registry 会回退这些契约，保留并在采用矩阵注明。

## Phase 4 — 全量验收

- [x] 4.1 逐页跑 focused tests；新增断言只看可见行为（组件存在、切换后内容变化、键盘路径），不 pin 内部实现。
  - 已完成：按页批次运行 45+146+189+201+59 等 focused tests；失败仅两处过时契约（tasks 用 `button.bg-destructive` 定位、已删的 `ui/dropdown-menu` 测试），已分别改为 `aria-label^="Delete:"` 与删除死文件。
- [x] 4.2 `npm run typecheck && npm run build:ui && npm run verify:wcag && npm run verify:i18n && npm test`。
  - 已完成：typecheck / build / wcag / i18n / delivery-status / legacy audit 全通过；`npm test` 5642+ 通过，仅 `test/worker/m1-publication.test.ts` 两条与 KB-011 新回滚契约不一致的过时用例失败——已用 stash 在基线复跑确认**同为失败**，与本次 beUI 改造无关。
- [x] 4.3 生产 signed-browser 扫全部 34 个入口 × 375/768/1280 × 浅/深色 × 中/英；记录 `scrollWidth - clientWidth = 0`、焦点顺序、空/错态。
  - 已完成（范围见证据）：生产 zh-CN 会话扫 31 个登录后入口 × 1280/375，全部 `scrollWidth - clientWidth = 0`、无 console error，页面 `<h1>` 存在（focus 页与匿名 `/` 除外）；深色在 6 个代表页以 `.dark` 复测无溢出。**未执行**：英文切换（会改写账户语言偏好）、768 中间档、逐页焦点顺序录像——这些仍按既有验收边界单独记录，不宣称完成。
  - 结果写入 `docs/operations/evidence/2026-10-18-beui-page-adoption.md`。
- [x] 4.4 更新 `docs/product/2026-10-17-beui-full-adoption-matrix.md` 与交付总账证据；发布/验收状态按实际部署与浏览器证据单独记录。
  - 已完成：清单/矩阵/总账边界与 `docs/operations/evidence/2026-10-18-beui-page-adoption.md` 同步；不提升发布/验收状态。

## 顺序理由

1. 先做共享原语：同一行操作/图表/表单模式会在 10+ 页重复，先定契约可避免每页分叉。
2. 再只读页：失败面小、可用截图快速验收，先建立节奏与证据模板。
3. 写入页依赖共享的草稿、确认、浮层契约，放在只读页之后。
4. 复杂面（reader/agent/graph/boards/environments/landing）最后做，它们的替换会牵动键盘与焦点契约。
