# beUI 页面内容全量改造证据（2026-10-18）

范围：按 `docs/product/2026-10-18-beui-page-adoption-checklist.md` 的顺序清单，把全部页面的内容区从手搓表格/图表/列表/浮层切到 beUI 现成组件或其仓库内适配层。**这是本地实现与本地验证证据，不提升任何交付行的发布/验收状态。**

## 采用结果

- 已完成页：首页、站点统计、admin 仪表盘、roles/audit（审计）、assets、duplicates、trash、knowledge item、notifications、messages、today、review、members、submissions 详情、goals、projects/timeline、calendar、tasks/editor、inbox（审计）、submit、my-submissions、focus、boards、knowledge、reader、search、agent、graph、thread、environments、landing、login、settings（审计）、404/forbidden/coming-soon。
- 组件：`status-bar`、`donut-chart`、`composition-chart`、`heat-calendar`、`number-ticker`、`animated-number`、`shared-layout-bg`、`preview-rail`、`dock`、`tilt-card`、`overflow-actions`、`hold-action-button`、`bouncy-accordion`、`message-bubble`、`message-scroller`、`code-block`、`loader`、`alert`、`ui/sheet`、`ui/dialog`、`ui/table`（经 `DataTable` 与 `/environments` 直接使用）。
- 机械化闸门：`scripts/frontend-legacy-audit.mjs` 新增 `contentViolations`，禁止 `frontend/pages`、`frontend/features` 下出现原生 `<table>`、直接 `motion/drawer|center-morph-modal|bottom-sheet|morphing-modal` 导入或直接 `motion/react` 导入；全仓当前无违规，landing 白名单已删除。

## 明确保留（契约原因）

- 原生/语义表格：`date-range-picker` 内部日历、图表 `sr-only` 读屏表、对比产物矩阵（行头 + 可变行高）。
- 必填字段表单不折叠（submit、roles 权限组）：折叠会让字段进入 `inert`，破坏草稿、校验与既有键盘测试；`bouncy-accordion` 只用于可选分组（FAQ、task editor 的 links/subtasks/dependencies）。
- `/settings` 语言选择保留原生 `<select>`：测试与表单事件契约依赖。
- `/environments` 导入面板保留自定义状态机：同意上传、冻结文件、服务端解析/回执与 `data-import-*`。
- 外壳 `AnimatedSidebar*` / `ExpandableActionBar` fork 保留：承载 `data-shell-*`、roving menu、权限门禁与 44px 触控目标。
- `/notifications` 未读总数保留裸文本：`aria-live` 连续文案契约。

## 验证

- `npm run typecheck`、`npm run build:ui`、`npm run verify:wcag`、`npm run verify:i18n`、`npm run verify:delivery-status`、`node scripts/frontend-legacy-audit.mjs` 全部通过。
- `npm test`（smoke + unit + worker）最终 **78 files / 1310 tests 全绿**。为此对齐了两条 KB-011 契约的过时用例（回到当前修订返回 409；并发生命周期写入时指针/任务/审计原子不变），并删除引用已删 `ui/dropdown-menu` 的死测试。
- 生产扫站：管理员 33 入口 + contributor 22 入口，各 375/768/1280 × zh/en × 浅/深，共 **660 次 `scrollWidth - clientWidth = 0`**；焦点探针 33 路线均可 Tab 进入 skip link → 侧栏 → 内容。
- contributor 由一次性邀请创建，扫站后禁用并删除隔离 profile；管理员与 contributor 均在真实 signed-browser 中执行。
- 修复：768 宽下筛选下拉面板（audit/assets/members）溢出 80px；`filter-select` 关闭态去掉 `min-w-56`，靠近右缘时改为右对齐。
- 空/错态由 focused tests 覆盖，生产未做故障注入；真实屏幕阅读器语音仍未作为本记录范围。

## 边界

- 本文证明源码改造、全量测试与管理员/contributor 两套生产扫站；不证明 AT（屏幕阅读器语音）已完成验收。
- AT 语音复核（2026-10-18）：VoiceOver 可运行，原生 AX 树可读（`AXWebArea` 与可访问名称）；但 `VoiceOver.sdef` 的 `last phrase`/`vo cursor` 在运行时返回 -1728，系统日志不记录播报文本，`group.com.apple.VoiceOver` 偏好容器被 TCC 拒绝访问，字幕面板无法程序化开启。语音取证只剩音频采集 + 转写，超出本次范围。
- 采用矩阵与清单同步更新；交付行状态不变。
