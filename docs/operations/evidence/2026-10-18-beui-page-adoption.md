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

- `npm run typecheck:frontend`、`npm run typecheck`。
- `npm test`（smoke + unit + worker）：5642+ 通过；仅 `test/worker/m1-publication.test.ts` 两条与 KB-011 新回滚契约不一致的过时用例失败，已用 stash 在基线上复跑确认同为失败，与本次改造无关。
- `npm run build:ui`、`npm run verify:wcag`、`npm run verify:i18n`、`npm run verify:delivery-status`。
- 生产部署后按 1280/375 抽查改动页（首页、统计、admin、tasks、reader、landing），记录 `scrollWidth - clientWidth = 0` 与关键交互。
- 2026-10-18 生产扫站（zh-CN 会话）：31 个登录后入口 × 1280/375 全部 `scrollWidth - clientWidth = 0`、无 console error；深色 `.dark` 抽查首页/knowledge/tasks/admin/analytics/messages 亦无溢出。
- 未覆盖：英文切换（会改写账户偏好）、768 中间档、逐页焦点顺序录像与真实 AT 语音。

## 边界

- 本文只证明源码改造与本地/生产抽查，不证明所有角色、所有视口或 AT（屏幕阅读器语音）已完成验收。
- 采用矩阵与清单同步更新；交付行状态不变。
