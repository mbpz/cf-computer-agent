# beUI 页面内容全量改造证据（2026-10-18）

范围：按 `docs/product/2026-10-18-beui-page-adoption-checklist.md` 的顺序清单，把全部页面的内容区从手搓表格/图表/列表/浮层切到 beUI 现成组件或其仓库内适配层。**这是本地实现与本地验证证据，不提升任何交付行的发布/验收状态。**

## 采用结果

- 已完成页：首页、站点统计、admin 仪表盘、roles/audit（审计）、assets、duplicates、trash、knowledge item、notifications、messages、today、review、members、submissions 详情、goals、projects/timeline、calendar、tasks/editor、inbox（审计）、submit、my-submissions、focus、boards、knowledge、reader、search、agent、graph、thread、environments、landing、login、settings（审计）、404/forbidden/coming-soon。
- 组件：`status-bar`、`donut-chart`、`composition-chart`、`heat-calendar`、`number-ticker`、`animated-number`、`shared-layout-bg`、`preview-rail`、`dock`、`tilt-card`、`overflow-actions`、`hold-action-button`、`bouncy-accordion`、`message-bubble`、`message-scroller`、`code-block`、`loader`、`alert`、`ui/sheet`、`ui/dialog`、`ui/table`（经 `DataTable` 与 `/environments` 直接使用）。
- 机械化闸门：`scripts/frontend-legacy-audit.mjs` 新增 `contentViolations`，禁止 `frontend/pages`、`frontend/features` 下出现原生 `<table>`、直接 `motion/drawer|center-morph-modal|bottom-sheet|morphing-modal` 导入或直接 `motion/react` 导入；全仓当前无违规，landing 白名单已删除。

## 明确保留（契约原因）

- 原生/语义表格：`date-range-picker` 内部日历、图表 `sr-only` 读屏表。（2026-10-18 修正：对比产物矩阵已改 beUI `bouncy-accordion`，`[data-comparison-topic]`/`[data-comparison-cell]` 迁到行包装器，页面内 `<table>` 数为 0；此处原记"保留原生表格"已不成立。）
- 必填字段表单不折叠（submit、roles 权限组）：折叠会让字段进入 `inert`，破坏草稿、校验与既有键盘测试；`bouncy-accordion` 只用于可选分组（FAQ、task editor 的 links/subtasks/dependencies）。
- `/settings` 语言选择已改 `ui/select`（beUI `motion/select` 复合列表箱），该页原生 `<select>` 计数为 0。（2026-10-18 修正：此处原记"保留原生 `<select>`"，与其后零原生基元批次不符。）
- 外壳移动导航开关已归零：`<details>/<summary>` 换成 `ui/button` 触发器（`data-mobile-nav-trigger` + `aria-expanded`），`workspace-shell.test.tsx` 的 4 处选择器随之改为新钩子（行为期望未改）。（2026-10-18 修正：此处原记"仍保留原生 `<details>`"，已不成立。）
- `frontend/components/ui/textarea.tsx` 保留原生 `<textarea>`：**beUI registry（143 slug 实测）没有 textarea slug**，它是这套界面的唯一多行字段适配层；`agents/prompt-input.tsx` 的 textarea 属载荷自身实现（`feedback-widget.tsx` 同）。这三处是 `scripts/frontend-legacy-audit.mjs` 的原生白名单。
- `ui/pagination` **已零原生元素**（全部由 `ui/button` 组合，`PaginationLink` 内部即 beUI `button-base`），registry 也无分页 slug；`ui/skeleton` 是 `<div>` 占位而非原生控件，registry 无 skeleton slug，换 `loader` 会改掉 loading 几何，故保留纯 CSS 变体。（2026-10-18 修正：原文"自绘保留"易被误读成未改造。）
- `/environments` 导入面板保留自定义状态机：同意上传、冻结文件、服务端解析/回执与 `data-import-*`。
- 外壳 `AnimatedSidebar*` / `ExpandableActionBar` 已回并 registry 源（`components/motion/`），但各自就地打补丁以承载 `data-shell-*`、roving menu、权限门禁与 44px 触控目标；补丁点见采用矩阵 §18。「fork 保留」的旧表述不再成立。
- `/notifications` 未读总数保留裸文本：`aria-live` 连续文案契约。

## 验证

- `npm run typecheck`、`npm run build:ui`、`npm run verify:wcag`、`npm run verify:i18n`、`npm run verify:delivery-status`、`node scripts/frontend-legacy-audit.mjs` 全部通过。
- `npm test`（smoke + unit + worker）最终 **78 files / 1310 tests 全绿**。为此对齐了两条 KB-011 契约的过时用例（回到当前修订返回 409；并发生命周期写入时指针/任务/审计原子不变），并删除引用已删 `ui/dropdown-menu` 的死测试。
- 生产扫站：管理员 33 入口 + contributor 22 入口，各 375/768/1280 × zh/en × 浅/深，共 **660 次 `scrollWidth - clientWidth = 0`**；焦点探针 33 路线均可 Tab 进入 skip link → 侧栏 → 内容。
- contributor 由一次性邀请创建，扫站后禁用并删除隔离 profile；管理员与 contributor 均在真实 signed-browser 中执行。
- 修复：768 宽下筛选下拉面板（audit/assets/members）溢出 80px；`filter-select` 关闭态去掉 `min-w-56`，靠近右缘时改为右对齐。
- 空/错态由 focused tests 覆盖，生产未做故障注入。

## 边界

- 本文证明源码改造、全量测试与管理员/contributor 两套生产扫站。
- 采用矩阵与清单同步更新；交付行状态不变。

## 2026-10-18 补充：第一方交互面原生元素归零

按"彻底归零"口径把**第一方**（页面、feature、非载荷组件）里剩下的原生交互元素全部换到 beUI 适配层。registry 实测仍是 143 slug（`curl https://beui.dev/r/registry.json`）。

- 原生 `<button>`：**28 → 0**。改动文件 11 个：`shell/app-shell.tsx`（语言菜单 2、账户设置 1、主题 3、登出 1、移动导航触发器 1）、`ui/applied-filters.tsx`（chip 移除键）、`ui/date-range-input.tsx`（2）、`ui/sheet.tsx`（`SheetClose` 内部）、`ui/filter-select.tsx`（`ComboboxTrigger` 的 `render` 插槽）、`review/review-drafts.tsx`（原本是无 className 的裸按钮）、`submissions/submission-target-picker.tsx`（4）、`assets/asset-availability-panel.tsx`（1）、`assets/asset-upload-panel.tsx`（9，两个 `type="submit"` 保留提交语义）、`knowledge/knowledge-share-button.tsx`、`graph/graph-canvas.tsx`（移动端语义回退列表项）。
- 原生 `<details>/<summary>`：**1 → 0**。移动导航改用 `ui/button` + 既有 `open` state（`aria-expanded` 由触发器自己给出），`border-b bg-card` 随视觉迁到触发器；`SheetContent` 内部一字节未动。
- 映射契约（统一执行）：描边按钮 → `variant="outline" size="sm"`；文本动作 → `ghost`；图标键 → `ghost size="icon"`；一律保留 `type`、`disabled`、`onClick`、`role`、`aria-*`、`data-*`；`h-auto` 用于抵消 beUI 固定高度，`max-lg:min-h-11` 保住 44px 移动触控下限。`motion/button/base` 的 `{...rest}` 在 `type="button"` 之后展开，所以 `type="submit"` 可用（这一点先核实过再批量替换）。
- 闸门升级：`scripts/frontend-legacy-audit.mjs` 的 `COMPONENT_ROOTS` 现在也禁原生 `button` 与 `details/summary`（`native-button`/`native-disclosure`）。豁免改由**机制**判定而不是文件名清单：文件含 `beui.dev` 溯源注释即视为载荷；`components/motion/` 与 `components/charts/`（载荷族私有子模块）整目录豁免；显式白名单只剩 `ui/textarea.tsx`、`agents/prompt-input.tsx`、`agents/message-bubble.tsx`。闸门自测新增 3 个 fixture（第一方原生 button/disclosure 必须报、载荷溯源与 charts 前缀必须豁免）。
- 仍然存在的原生元素（全部在载荷内或 registry 无 slug 处）：`components/motion/**` 与 `components/charts/**` 的载荷实现；`agents/{prompt-input,feedback-widget}.tsx` 的 textarea、`agents/message-bubble.tsx` 的披露触发器、`agents/{citations,todo-list,streaming-response,agent-activity}` 的按钮（均为 beUI 载荷）；`ui/textarea.tsx` 一个字段适配层（registry 无 textarea slug）。
- 验证：`node scripts/frontend-legacy-audit.mjs` → `[pass]`；新增断言后 `frontend-legacy-audit.test.mjs` 通过；各分片自跑 52 / 32+159 / 373 / 46 测试全绿，`npm test` 全量复跑通过；真机（本地 worker + 真实 Chromium）复核：账户菜单 3 个主题 `menuitemradio` 的 `aria-checked` 正确、点 dark 生效并落 localStorage，`/tasks` 的 4 个 `filter-select` 触发器可展开（6 选项）并写入 `?status=`，375 下 `[data-mobile-nav-trigger]` 高 45px、点击后 `aria-expanded=true` 且抽屉打开，全程 `console` 空、两档宽度横向溢出 0。
- 一处旧契约按语义放宽：`scripts/frontend-app-contract.test.mjs` 原先 pin 了 `/<button[\s\S]*data-graph-node-id=/`，现改为 `<(?:Button|button)`——断言意图（移动端语义回退里有带 `data-graph-node-id` 的可点节点）不变，只是不再 pin 元素名（beUI 按钮渲染的仍是 `<button>`）。
