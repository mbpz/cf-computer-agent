# 页面内容 beUI 改造顺序清单（2026-10-18）

目标：**每个页面的内容区**都用 beUI 现成组件（或仓库内已验证的 beUI 适配层）实现，替换手搓图表、列表行、编辑器、状态块。外壳与已有适配层不重复改。

## 判定与不变量

- 已完成：`/` 首页、`/admin/analytics`。其余按下表顺序推进。
- 每个条目必须保留：全部 `data-*` 钩子、精确 `aria-label`、en/zh i18n 键、键盘路径、焦点作用域、分页/授权语义、既有测试断言。
- 每个条目完成后的验收固定为：focused tests + `npm run typecheck` + `npm run build:ui` + 生产 signed-browser 目视（1280 宽 + hover/键盘）；改动图表时加 375 宽与深色。
- 明确 **keep-in-repo**（不是遗漏，是契约原因）：`ui/page-header`（唯一 `<h1>`）、`ui/pagination`、`ui/expandable-tabs`（页内面板语义与 payload 不符）、`ui/applied-filters`、`ui/summary-row`、`ui/input`/`ui/select`（原生表单语义）、`components/data-table.tsx`（已是 beUI `table` 适配层）。
- 已接 beUI、只需审计不改的适配层：`ui/alert`、`ui/badge`、`ui/button`、`ui/card`、`ui/confirm-action`、`ui/typed-confirm-action`、`ui/dialog`、`ui/sheet`、`ui/tabs`、`ui/tooltip`、`ui/filter-select`、`ui/search-chips-field`、`ui/date-range-input`。

## Phase 0 — 共享内容原语（先统一，避免每页各做一套）

- [x] 0.1 **数字与指标**：内容区的计数统一 `animated-number`（进入视图）或 `number-ticker`（原地滚动）；清掉手写大数字。验收：admin dashboard / today / review / notifications 四处不再出现裸 `<p>{count}</p>`。
  - 已完成：`/admin`（此前已用 `number-ticker`）、`/today`、`/review`（均 `startOnView={false}`）。`/notifications` 的未读总数保留裸文本：它是 `aria-live` 状态且服务端渲染测试要求连续文案，动画会切断文本节点。
- [x] 0.2 **行操作**：所有表格/列表行内动作统一 `context-menu` 或 `overflow-actions`（二选一按行宽），保留 `aria-label` 与 `data-confirm-action`。首个落地页：tasks、inbox。
  - 已完成：`/tasks` 与 `/inbox` 行操作改走 `overflow-actions`，逐项 `ariaLabel` 与原测试查询一致（`Delete/Complete/Reopen/Archive/Restore/Turn into task`）。
- [x] 0.3 **图表**：把 `composition-chart`、`heat-calendar` 以 registry 源补进 `components/charts/`；仅在有对应数据语义的页面使用（见各页条目），禁止用占比图表达不可加总的 UV。
  - 已完成：两组 registry 源落地 `frontend/components/charts/{composition-chart,heat-calendar}/`，typecheck 通过；按页面条目再接线。
- [ ] 0.4 **表单段落**：多段表单统一 `bouncy-accordion` 分组 + `button-stateful` 提交；保留草稿/失败/未知结果三态。
- [ ] 0.5 **加载与空态**：内容区 loading 统一 `loader`（表格行用 `skeleton` 行）；长任务用 `agent-progress`，推理/搜索阶段用 `thinking-shimmer`。移除手写 `<p aria-busy>` 文案块。
- [ ] 0.6 **浮层**：一律走 `ui/sheet`（drawer/bottom-sheet）或 `ui/dialog`（center-morph-modal）；landing 里直接挂 `motion/drawer` 的一处并入适配层。
- [ ] 0.7 **契约闸门**：扩展前端遗留审计脚本，禁止页面内容区新增手写 `motion/react` 图表/列表/浮层；`keep-in-repo` 列表加入白名单。

## Phase 1 — 只读列表与看板（低风险快赢）

- [ ] 1.1 `/admin` 仪表盘：趋势列表 → `composition-chart`（submissions vs publications）；活动流 → `notification-stack`；指标沿用 `number-ticker`。保留 `data-trend-point/-day/-submissions/-publications`。
- [ ] 1.2 `/admin/roles`：`DataTable` 已是 beUI `table`；只做 `table-async` 语义审计与空态统一，不改行结构。
- [ ] 1.3 `/admin/audit`：同上（只读分页表）；`filter-select`/`applied-filters` 已适配，无内容改造。
- [ ] 1.4 `/admin/assets`：容量 `<dl>` → `donut-chart`（used/max）；预览卡 → `preview-rail`。保留 `data-asset-capacity-*`、`data-asset-preview`。
- [ ] 1.5 `/admin/duplicates`：候选 vs 正本对比 → `preview-rail`（并排高亮）；行操作沿用 `overflow-actions`。
- [ ] 1.6 `/admin/knowledge/trash`：清理动作 → `hold-action-button`；写入结果 → `notification-stack`。保留 `data-trash-feedback`、typed-id 门禁。
- [ ] 1.7 `/admin/knowledge/:id`：修订历史 → `bouncy-accordion`；回滚/回收 pending → `agent-progress`。保留全部 `data-knowledge-*`。
- [ ] 1.8 `/notifications`：未读计数 → `animated-number`；行操作 → `context-menu`；列表本体已是 `notification-stack`。
- [ ] 1.9 `/messages`：移动端列表 → `swipeable-list`，列表刷新 → `pull-to-refresh`；游标分页与撤销态不变。
- [ ] 1.10 `/today`：四个指标 → `animated-number`；四组条目列表 → `preview-rail`。保留 `data-today-target`/`data-today-all`。
- [ ] 1.11 `/review`：完成度 → `composition-chart`；目标列表 → `preview-rail`；周期选择改 `tabs` 分段（保留 radiogroup 语义或迁移后补 `aria-checked`）。

## Phase 2 — 结构化写入页

- [ ] 2.1 `/admin/members`：邀请码卡片列表 → `notification-stack`；行操作 → `overflow-actions`；分页/筛选已适配。
- [ ] 2.2 `/admin/spaces`：Space/Collection 卡 → `project-folder`；集合列表 → `bouncy-accordion`；建/改表单 → `drawer`。保留 `data-space-*-dialog` 与草稿恢复。
- [ ] 2.3 `/admin/menus`：位置数字输入 → `sortable-stack` 拖拽排序；编辑器 → `drawer`；保留 enable/hide/delete 文案与 `data-menu-*`。
- [ ] 2.4 `/admin/roles/new` + `/admin/roles/:id`：权限分组 → `bouncy-accordion`（四组），成员 chip → `overflow-actions` rail；`checkbox`/`input` 已是 beUI 源。
- [ ] 2.5 `/admin/submissions` + `/admin/submissions/:id`：批量工具栏 → `agent-progress`（进度与逐项结果）；正文 → `code-block`；评论 → `message-bubble`。保留 `data-batch-*` 与逐项重试。
- [ ] 2.6 `/goals`：进度内联编辑 → `table-editable`；完成度 → `donut-chart`；`range-slider` 已适配。
- [ ] 2.7 `/projects` + `/projects/:id/timeline`：项目摘要 → `project-folder` + `composition-chart`；时间线条目详情 → `bouncy-accordion`；行操作 → `overflow-actions`。
- [ ] 2.8 `/calendar`：月视图 → `heat-calendar`；范围筛选已用 `date-range-picker`；创建/取消弹层已适配。
- [ ] 2.9 `/tasks` + task editor：行内动作 → `context-menu`，移动端行 → `swipeable-list`；编辑器分组 → `bouncy-accordion`。保留 `data-task-list=desktop|mobile` 与 `aria-keyshortcuts`。
- [ ] 2.10 `/inbox`：采集弹层与行操作沿用 `table-async` + `context-menu`；保留 `data-inbox-capture-*`。
- [ ] 2.11 `/submit`：附件面板 → `attachment-upload`；表单分段 → `bouncy-accordion`；提交 → `button-stateful`；草稿恢复/相似候选保留。
- [ ] 2.12 `/my-submissions`：范围筛选已用 `date-range-picker`；列表沿用 `table-async`；只补空态与行操作一致性。
- [ ] 2.13 `/focus`：会话进度 → `donut-chart`；计时/状态 → `status-bar`（或保留精确 `HH:MM:SS` 输出 + 环形进度）。保留 `data-focus-elapsed`。
- [ ] 2.14 `/boards`：列内卡片移动 → `context-menu`（移动目标）；列 loading → `loader`；`sortable-stack` 已装但未启用，评估后决定启用或保留只读。

## Phase 3 — 复杂内容面

- [ ] 3.1 `/knowledge`：面板卡网格 → `infinite-masonry` 或 `preview-rail`（按面板高度选择）；保留每面板独立加载/重试。
- [ ] 3.2 `/knowledge/:id`：阅读进度 → `scroll-progress`；来源块 → `citations`；相关/反向链接 → `preview-rail`；大纲/移动端 tab 已适配。
- [ ] 3.3 `/search`：保存视图 → `command-palette`（快速切换）+ `overflow-actions`（chip 溢出）；结果列表 `table-async`；`#knowledge-search` 契约不变。
- [ ] 3.4 `/agent`：阶段 → `thinking-shimmer` + `agent-progress`；来源/范围结果 → `tool-result`；问题输入已具备 Enter 发送，评估 `prompt-input` 是否保住 `AGENT_SUBMIT/STOP`。
- [ ] 3.5 `/graph`：检查器动作 → `dock`；建议卡 → `preview-rail`；Cytoscape 画布与 fallback 不动。
- [ ] 3.6 `/messages/:id`：消息 → `message-bubble`；滚动跟随 → `message-scroller`；回复框 → `prompt-input`（保留 operation-key 去重）。
- [ ] 3.7 `/environments`：文件导入面板 → `file-upload`/`attachment-upload`；下载预览 → `preview-rail`；表格/弹层已适配。保留 `data-vm-start` 的禁用语义。
- [ ] 3.8 `/` 公开落地页：场景导览进度 → `status-bar`（步骤状态）或 `scroll-progress`；来源引用 → `citations`；抽屉统一走 `ui/sheet`。场景与文案不动。
- [ ] 3.9 `/login`：错误块 → `alert`（destructive）；GitHub 按钮沿用 `button-base`；保留 `#login-code-*` 门禁。
- [ ] 3.10 `/settings`：语言选择从原生 `select` → `select`/`combobox`；主题切换保留 `aria-pressed` 分段按钮。
- [ ] 3.11 404 / forbidden / coming-soon：统一 `not-found-glitch` 状态面 + `animated-badge`；补 `data-page-state` 与页面 `<h1>`。
- [ ] 3.12 外壳 fork：`AnimatedSidebar*` 与 `ExpandableActionBar` 的两处 fork 回并 registry 源（保留 `data-shell-*`、roving menu 与权限门禁）。

## Phase 4 — 全量验收

- [ ] 4.1 逐页跑 focused tests；新增断言只看可见行为（组件存在、切换后内容变化、键盘路径），不 pin 内部实现。
- [ ] 4.2 `npm run typecheck && npm run build:ui && npm run verify:wcag && npm run verify:i18n && npm test`。
- [ ] 4.3 生产 signed-browser 扫全部 34 个入口 × 375/768/1280 × 浅/深色 × 中/英；记录 `scrollWidth - clientWidth = 0`、焦点顺序、空/错态。
- [ ] 4.4 更新 `docs/product/2026-10-17-beui-full-adoption-matrix.md` 与交付总账证据；发布/验收状态按实际部署与浏览器证据单独记录。

## 顺序理由

1. 先做共享原语：同一行操作/图表/表单模式会在 10+ 页重复，先定契约可避免每页分叉。
2. 再只读页：失败面小、可用截图快速验收，先建立节奏与证据模板。
3. 写入页依赖共享的草稿、确认、浮层契约，放在只读页之后。
4. 复杂面（reader/agent/graph/boards/environments/landing）最后做，它们的替换会牵动键盘与焦点契约。
