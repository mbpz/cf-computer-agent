# Area D — 交互统一性与前端质量评审

> 独立评审（只读）。对象：git HEAD `4d00e381`（main，工作树干净）。
> 基准文档：`docs/product/2026-10-16-authenticated-workspace-interaction-contract.md`（下称 **交互契约**）、`docs/product/2026-10-18-beui-page-adoption-checklist.md`（下称 **采用清单**）、`docs/product/2026-10-17-beui-full-adoption-matrix.md`、`docs/product/shadcn-ui-frontend-checklist.md`、`docs/product/2026-10-16-beui-interaction-acceptance.md`、`docs/product/2026-10-14-frontend-*-evidence.md`、`docs/product/2026-09-25-functional-checklist-*`。
> 严重度：P0=核心交互/可访问性/数据正确性破坏或违反硬性契约；P1=主要交互不一致、用户可感知；P2=局部不一致/可维护性风险；P3=风格/文档。

## 覆盖与方法

### 实际执行的检查（全部通过）

| 命令 | 结果 |
| --- | --- |
| `node scripts/wcag-contract.mjs` | exit 0 |
| `node scripts/frontend-legacy-audit.mjs` | `[pass] legacy UI rollback files retained; frontend source/dist has no legacy references (4 files); pages and shared components use beUI primitives: no raw select, checkbox, text input, textarea, button or disclosure outside a vendored payload` |
| `node scripts/frontend-operation-inventory.mjs --check` | `475 source files, 1760 source operation candidates`，exit 0 |
| `node scripts/verify-i18n.mjs` | `[pass] i18n keys=434 placeholders=55 files=6` / `[pass] i18n-hardcoded-copy ast=typescript html=dom` |
| `node --test scripts/paged-list-contract.test.mjs scripts/frontend-app-contract.test.mjs scripts/frontend-typecheck-contract.test.mjs` | **17 pass / 0 fail** |
| `node --test scripts/i18n-contract.test.mjs` | **14 pass / 0 fail**（含应用内联目录 key/占位符 parity，`i18n-contract.test.mjs:378-395`） |

> 注意：`verify-i18n` 的“434 keys / 6 files”**不是** React 应用的目录（见 D-05），通过该闸门不能证明应用内 i18n 完整。

### 静态扫描（rg，覆盖 `frontend/**`，排除 `dist/`）

`<h1`、`<select`、`role="alert"`、`aria-busy`、`PageState`、`PageHeader`、`AppliedFilters`、`FilterSelect`、`window.confirm`、`ConfirmAction|TypedConfirmAction|HoldActionButton`、`TODO|FIXME|@ts-ignore|: any|console\.`、`prefers-reduced-motion|useReducedMotion`、`toLocale*|Intl.DateTimeFormat`、`label="[A-Z]…`、`#hex` 颜色、`DataTable`/`hasMore`、`StatefulButton`、`registerWorkspaceLeaveGuard`、`createNumberedRequestController`、`PageState` 早返回（逐文件比较 `PageHeader` 与首个 `return <PageState` 的行号）等。另用一次性 node 脚本比对 `frontend/lib/i18n.ts` 两份内联目录（en/zh-CN，各 2 040 key）的 key 与占位符一致性。

### 逐页矩阵的诚实边界

- **静态覆盖 100%**：全部 31 个注册路由 + 7 个参数化页（阅读页、线程、时间线、审核详情、知识项、角色新建/详情）+ 公开/not-found/coming-soon 面都做了定向扫描（壳常驻、h1、筛选控件、状态分支、分页用法、确认控件）。
- **完整阅读**约 20 个文件：`page-header.tsx`、`page-state.tsx`、`filter-select.tsx`、`applied-filters.tsx`、`data-table.tsx`、`data-pagination.tsx`、`numbered-page.ts`、`list-mode.ts`、`focus-scope.tsx`、`ui/dialog.tsx` 头注、`theme.ts`、`responsive-contract.ts`、`styles/globals.css`、`home-page.tsx`、`focus-page.tsx`、`project-timeline-page.tsx`、`inbox-page.tsx`、`goals-page.tsx`、`projects-page.tsx`、`notifications-page.tsx`、`messages-page.tsx`、`thread-page.tsx`、`agent-page.tsx`、`environments-page.tsx`、`knowledge-reader-page.tsx`（局部）、admin dashboard/audit/assets/members/spaces/recycle-bin/knowledge-item 页、`app.tsx` 的壳/装配段与 15 个左右路由容器、`command-palette.tsx`、`shared/workspace-route-capabilities.ts`、`frontend/lib/route-access.ts`、`src/authorization/policy.ts`、`src/routes/session.ts`、`src/routes/admin.ts`（相关段）。
- **其余文件为定位式抽样**（grep 命中行 + 邻域），未逐行通读。
- **未执行任何浏览器交互**：375/320 布局、真实键盘 Tab 序列、深色主题渲染均未实测；矩阵中键盘/焦点一列基于代码契约（`useFocusScope`、`Escape` 监听、`data-*` 钩子）而非运行时验证。见「局限与未覆盖」。

## 结论摘要

1. **“已迁移”的页面确实统一，但统一性有明确的三个缺口**：交互契约 §2.1（壳常驻）在 `/`、`/focus`、`/projects/:id/timeline` 三页被整页早返回破坏——loading/error 时标题（以及时间线的返回按钮）消失；这三页同时**没有使用 `PageHeader`**，标题字号/结构与环境其余页面分叉（D-01/D-07）。
2. **“条件变化后不展示旧行”只落实了一部分**：`/tasks`、`/knowledge`、`/inbox`、`/admin/members`、`/admin/assets` 有显式 query 失效/陈旧窗口保护，`/admin/audit` 仍是 `old.kind === "ready" ? old : error`，筛选变化后失败会保留上一条件的行并叠加错误提示（D-02）。这正是交互契约 §2.2 点名的反模式。
3. **i18n 的最大问题不是“缺 key”，而是“中文界面里出现英文”且闸门看不见**：`verify-i18n` 的“434 keys”校验的是 `public/locales`（旧公开站），React 应用实际用 `frontend/lib/i18n.ts` 内联目录（en/zh 各 2 040 key）；应用目录的 key/占位符一致性由 `scripts/i18n-contract.test.mjs:378-395` 覆盖，但“硬编码英文”扫描只覆盖 `public/`，所以 tasks 三个筛选的选项、审计/资产/成员队列的筛选标签与选项的英文都漏网（D-03/D-05）。
4. **权限一致性仍有一处能力表与 API 不对齐**：`/admin/submissions` 路由声明 `knowledge:review`，队列列表 API 要求 `submission:read-all`（自定义角色掩码下会“可见→403”或“隐藏→可用”）；另发现 `vm:use` 能力永不由 `/api/session` 签发，环境页启动前哨必然失败（潜在，当前 VM 会话本身不可用）（D-04/D-10）。
5. **共享原语质量较高**：全仓无原生 `<select>`、无 `any`/`ts-ignore`/`TODO`/`console`（仅 vendored tooltip 一处 `console.warn`），`PageState` 统一 `data-page-state` + `role="alert"`，`DataTable` 统一桌面分页/移动 feed，对话框/抽屉共享 `useFocusScope`（初始焦点、Tab 环、Escape、焦点恢复），`main.tsx` 用 `MotionConfig reducedMotion="user"` 且 `globals.css` 有 reduced-motion 兜底。危险操作绝大多数走 `ConfirmAction`/`TypedConfirmAction`/`HoldActionButton`。
6. **结构性问题集中在 `app.tsx`（4 664 行）**：31 个路由容器组件、12 份重复的 session identity key、13 处离页守卫、5 份手写的“筛选键变化→回到 loading”逻辑（其中审计那份漏了）、4 个路由容器已拆到 `pages/admin/*-route.tsx` 而其余仍在 `app.tsx`（D-11）。

## 逐页一致性矩阵

图例：✅ 符合契约；⚠️ 有偏差/例外；❌ 违反；n/a 不适用；`—` 未逐项实测。
列说明：**壳**=loading/error/denied 时头部与工具栏是否常驻；**h1**=恰好一个 `<h1>` 且来自 `PageHeader`；**筛选**=FilterSelect/AppliedFilters 与 URL 条件可见可移除；**五态**=loading/empty/error/forbidden/ready 是否齐备；**分页**=共享 `DataTable`+`DataPagination`+`numbered-page`；**确认**=危险操作确认控件；**键焦**=键盘/焦点/Escape；**i18n**=双语。

| # | 路由 | 壳 | h1 | 筛选 | 五态 | 分页 | 确认 | 键焦 | i18n | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/` | ❌ | ⚠️ | n/a | ⚠️ | ⚠️ | n/a | ✅ | ✅ | 早返回 `home-page.tsx:75-76`；手写 h1 `:90`；recent 用自绘“加载更多” `:149-151`；含死代码 `LegacyHomePage` `:196` |
| 2 | `/knowledge` | ✅ | ✅ | ✅ | ✅ | ✅ | n/a（分享用 `window.confirm`⚠️） | ✅ | ✅ | 回顾周期 `FilterSelect`；URL 筛选 `AppliedFilters`；条件变化清行 `app.tsx:1075` |
| 3 | `/search` | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ | 筛选行 + `SearchChipsField` chips（等价 AppliedFilters） |
| 4 | `/agent` | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ | 来源范围 beUI `Select`；`PromptInput` Enter/停止 |
| 5 | `/submit` | ✅ | ✅ | n/a | ✅ | n/a | ✅ 丢弃草稿 `ConfirmAction` | ✅ | ✅ | `StatefulButton`；草稿/未知结果恢复 |
| 6 | `/my-submissions` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ resubmit OverflowActions | ✅ | ✅ | 范围 `DateRangeInput` + `AppliedFilters` |
| 7 | `/graph` | ✅ | ✅ | ✅ | ✅ | n/a | n/a | ✅ | ✅ | 禁止态不渲染已应用筛选（避免暴露文本） |
| 8 | `/tasks` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 删除/完成 | ✅ | ⚠️ | 选项标签硬编码英文 `tasks-page.tsx:148-151` |
| 9 | `/goals` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ 状态确认 | ✅ | ✅ | **页面无任何筛选控件**，与交互契约矩阵行 54 不符（D-06） |
| 10 | `/projects` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | 同上（`search` 只用于写恢复，不是筛选） |
| 11 | `/calendar` | ✅ | ✅ | ✅（范围控件） | ✅ | ✅ | ✅ 取消日程 | ✅ | ✅ | `heat-calendar`；范围筛选 `date-range-picker` |
| 12 | `/today` | ✅ | ✅ | n/a | ✅ | n/a | n/a | ✅ | ✅ | 头部先声明后分支：`today-page.tsx:18-23`（正面样板） |
| 13 | `/focus` | ❌ | ⚠️ | n/a | ✅ | n/a | ✅ 完成/放弃 | ✅ | ✅ | 早返回 `focus-page.tsx:66-67`；手写 h1 `:71`；`FocusRoute` 恢复态另有手写 h1 `app.tsx:2873/2879` |
| 14 | `/review` | ✅ | ✅ | ✅（周期 radiogroup） | ✅ | n/a | n/a | ✅ | ✅ | 保留 `aria-checked` 语义；`composition-chart` |
| 15 | `/inbox` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 条件变化失败清行（`clearReadFailure`） |
| 16 | `/boards` | ✅ | ✅ | n/a（列即状态） | ✅ | ✅（每列） | ✅ 移动 | ✅ 键盘移动 Select | ✅ | 列 loading 用 beUI `Loader` |
| 17 | `/environments` | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ 丢弃/重命名 | ✅ | ✅ | forbidden 分支换掉页头（`environments-page.tsx:27`），但外壳同权限门先拦截，实际不可达；VM 启动前哨问题见 D-10 |
| 18 | `/settings` | ✅ | ✅ | n/a | ✅ | n/a | n/a | ✅ | ✅ | 语言已用 beUI `Select`（采用清单说“保留原生 select”，文档过期，D-14） |
| 19 | `/admin` | ✅ | ✅ | 范围按钮 | ✅（分片） | n/a | n/a | ✅ | ✅ | 指标各自 loading/error/forbidden，不伪造 0 |
| 20 | `/admin/submissions` | ✅ | ✅ | 无筛选 | ✅ | ✅ | ✅ 决策 | ✅ | ✅ | 能力表/API 不对齐，D-04 |
| 21 | `/admin/duplicates` | ✅ | ✅ | 无 | ✅ | ✅ | ✅ | ✅ | ✅ | 对比/详情卡保留 |
| 22 | `/admin/assets` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ + `TypedConfirmAction`（孤儿回收） | ✅ | ⚠️ | 筛选标签英文；陈旧窗口保护 `app.tsx:4525-4526` |
| 23 | `/admin/members` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | 筛选标签英文；`invalidateQuery` `app.tsx:4084` |
| 24 | `/admin/roles` | ✅ | ✅ | n/a | ✅ | ✅ | n/a | ✅ | ✅ | — |
| 25 | `/admin/roles/new` | ✅ | ✅ | n/a | ✅ | n/a | ✅ 丢弃 | ✅ | ✅ | — |
| 26 | `/admin/roles/:id` | ✅ | ✅ | n/a | ✅ | n/a | ✅ | ✅ | ✅ | 加载期用通用标题，不伪造角色名 |
| 27 | `/admin/menus` | ✅ | ✅ | n/a | ✅ | 树 | ✅ | ✅ | ✅ | 拖拽排序为审计保留（采用清单 2.3） |
| 28 | `/admin/spaces` | ✅ | ✅ | n/a | ✅ | 卡片+游标 | ✅ | ✅ | ✅ | 集合游标 `load more` |
| 29 | `/admin/knowledge/trash` | ✅ | ✅ | n/a | ✅ | ⚠️ | ✅ `HoldActionButton`+typed id | ✅ | ✅ | 游标“加载更多”按钮在表外（`recycle-bin-page.tsx:185`），与共享 pager 不同 |
| 30 | `/admin/audit` | ✅ | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ⚠️ | **筛选变化失败保留旧行**（`app.tsx:4367`，D-02）；标签英文 |
| 31 | `/admin/analytics` | ✅ | ✅ | `days` 范围（契约允许） | ✅ | ✅ | n/a | ✅ | ✅ | `days` 属范围控件 |
| 32 | `/notifications` | ✅ | ✅ | ✅ | ✅ | ✅ `DataPagination`（非 DataTable） | n/a | ✅ | ✅ | 时间显示原始 ISO（D-08） |
| 33 | `/messages` | ✅ | ✅ | n/a | ✅ | ⚠️ `DiscussionCursorPagination`（20/50） | n/a | ✅ | ✅ | 分页语义与共享 pager 不同（D-12） |
| 34 | `/messages/:id` | ✅ | ✅ | n/a | ✅（含 revoked） | ⚠️ 同上 | n/a | ✅ operation-key + 结果核对 | ✅ | 原始 ISO 时间 |
| 35 | `/knowledge/:id` | ✅ | ✅ | n/a | ✅ | n/a | n/a | ✅ | ✅ | 加载期标题已修（契约 §3 记录，代码 `knowledge-reader-page.tsx:110-130` 一致） |
| 36 | `/projects/:id/timeline` | ❌ | ⚠️ | n/a | ✅ | ✅ | ✅ 编辑器丢弃 | ✅ | ⚠️ | 早返回 `project-timeline-page.tsx:28-29`；手写 h1 `:31`；`toLocaleString()` 未传 locale `:50` |
| 37 | `/admin/submissions/:id` | ✅ | ✅ | n/a | ✅ | n/a | ✅ | ✅ | ✅ | 评论时间原始 ISO |
| 38 | `/admin/knowledge/:id` | ✅ | ✅ | n/a | ✅ | 修订游标 | ⚠️ 行内两段式确认 `knowledge-item-page.tsx:148-153` | ✅ | ✅ | 未复用 `ConfirmAction` |
| 39 | 公开/外壳面 | ✅ | ✅ | n/a | ✅ | n/a | n/a | ✅ | ✅ | `/login`、`/`（未登录 landing）、coming-soon、not-found、外壳 403（现在有 h1，`admin-forbidden-page.tsx:12`） |

## 发现

| ID | 严重度 | 标题 | 位置 | 对应契约条款 | 说明与证据 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | **P1** | 三个页面在 loading/error 时整页早返回，卸载标题（时间线还卸载返回按钮） | `frontend/pages/home-page.tsx:75-76`；`frontend/pages/focus-page.tsx:66-67`；`frontend/pages/project-timeline-page.tsx:28-29` | 交互契约 §2.1（首屏/刷新/失败不卸载页面头部与工具栏）、§2.3（状态只落内容区） | 三处都是 `if (state.kind === "loading") return <PageState …/>`，`ready` 分支才渲染 `<h1>`；对比已迁移页 `today-page.tsx:18-23` 把 `header` 变量提到分支之前。`PageState` 头注也写明“只用于内容区，不替代整页”（`docs/product/2026-10-16-authenticated-workspace-interaction-contract.md:15`）。`/focus` 连 403/冲突态的 `FocusRoute` 恢复面板也整页替换（`app.tsx:2872-2883`）。 | 三页改为“页头常量 + 内容区切三态”的既有模式；时间线把返回按钮/标题留在 `section` 外层；恢复态面板放进内容区并复用 `PageHeader`。 |
| D-02 | **P1** | `/admin/audit` 筛选条件变化后失败仍保留上一条件的行 | `frontend/app.tsx:4367`（`setState((old) => old.kind === "ready" ? old : { kind: "error", message })`），通知路径 `app.tsx:4389` 的 `changeFilter` | 交互契约 §2.2（条件变化后的失败不展示上一条件的行） | 新条件请求失败时 `state` 仍是上一筛选的 ready 窗口，页面同时显示新 `Action` chip + 旧行 + `localError`（`audit-page.tsx:26-30` 分支）。同类页面已处理：assets 用 `displayedQueryRef` + `staleWindow`（`app.tsx:4525-4526`），members 用 `invalidateQuery()`（`app.tsx:4084`）。 | 在 `changeFilter`/effect 里同步 `setState({kind:"loading"})`（或记录 `displayedQueryRef`，陈旧窗口失败落 error），与 members/assets 对齐；补一条“筛选变化失败后旧行消失”的测试。 |
| D-03 | **P1** | 中文界面出现硬编码英文：列表筛选项/筛选标签/应用条件 | `frontend/pages/tasks/tasks-page.tsx:148-151`；`frontend/pages/admin/audit-page.tsx:19,20-24`；`frontend/pages/admin/asset-queue-page.tsx:39,40-44`；`frontend/pages/admin/members-page.tsx:119,120-124` | 采用清单“每个条目必须保留 en/zh i18n 键”；契约 §1 FilterSelect/AppliedFilters 统一语义 | tasks 三个 `FilterSelect` 的 `label` 走 i18n 但 `options` 全是 `"All"/"todo"/"doing"/…`；三个 admin 队列的 `label=`/`ariaLabel=`/`options.label` 与 `AppliedFilters` 的 `Status: …`/`Action: …` 前缀全是英文。`verify-i18n` 只扫 `public/`（`scripts/verify-i18n.mjs:10,46`），因此闸门不报。应用内目录本身是完整的（2 040×2 key、占位符 0 差异）。 | 选项标签改 `frontendText(locale, …)`（新增 TASKS_STATUS_TODO 等既有键即可复用）；`AppliedFilters` 的 label 用带占位符的 i18n 键；ariaLabel 若要保历史可访问名可继续固定英文，但可见文案必须本地化。 |
| D-04 | **P2** | `/admin/submissions` 路由能力表与队列读取 API 不一致 | 声明：`shared/workspace-route-capabilities.ts:77`（`capability: "knowledge:review"`）；API：`src/routes/admin.ts:253-254`（`/api/admin/submissions` 要求 `submission:read-all`）；调用：`frontend/lib/admin-review-data.ts:11` | 交互契约 §2.4（导航入口必须与服务端 capability 一致，不得提供 API 会拒绝的入口） | 自定义角色（`role_members` 掩码）成员若只有 `knowledge:review`：`routeAccessAllowed` 通过（`frontend/lib/route-access.ts:16-19` 允许掩码位），`/admin/submissions` 外壳放行但列表 GET 403 → 页面显示“无法加载”。反向（只有 `submission:read-all`）则导航隐藏该子入口但 API 允许读取（隐藏但可用）。管理员两种能力都有，故日常不可见；本轮已为 `/admin/analytics` 修过同类错配。 | 二选一收敛：把路由声明改为 `submission:read-all`（并让 `canReview` 继续单独管决策），或让队列读取改走 `knowledge:review` 的端点；补掩码组合的断言。 |
| D-05 | **P2** | 双 i18n 目录并存；`verify-i18n` 只校验 legacy 目录且硬编码扫描不含 `frontend/` | `frontend/lib/i18n.ts:12`（内联目录，en/zh-CN 各 2 040 key）；`public/locales/en.js`/`zh-CN.js`（434 key）；`scripts/verify-i18n.mjs:10,33-48`；`public/i18n.js:1`；应用目录 parity 由 `scripts/i18n-contract.test.mjs:378-395` 覆盖 | 采用清单 §4.2（`npm run verify:i18n` 作为完成门禁） | `frontendText` 只读内联目录（`i18n.ts:4191-4193`）；旧公开站脚本仍读 `public/i18n.js`。`verify-i18n` 的 `files=6` 全部在 `public/` 下、报出的是 434 key，容易被当成“应用 i18n 已通过”；应用目录的 key/占位符由 `i18n-contract.test.mjs` 保护（本轮实测 2 040/2 040、占位符 0 差异），**但** `frontend/` 源码里的硬编码副本（D-03）没有任何脚本扫描。 | 把 `verify-i18n` 的 AST 扫描根扩到 `frontend/`（保留 public 作为 legacy 断言）；在输出里区分 legacy/app 两套数字；明确 `public/locales` 为 legacy 只读。 |
| D-06 | **P2** | 交互契约矩阵声称 `/goals`、`/projects` 有 FilterSelect + AppliedFilters，代码不存在 | 文档：`docs/product/2026-10-16-authenticated-workspace-interaction-contract.md:54`；代码：`frontend/pages/goals-page.tsx:45-70`、`frontend/pages/projects-page.tsx:38-75`（仅 PageHeader/创建按钮，无筛选控件）；路由 `search` 仅传给 `usePlanningWriteRecovery`（`app.tsx:2144,2272`） | 文档准确性（评审基准不可盲信）；契约 §1 不要求所有页必须有筛选 | `goals-page`/`projects-page` 没有任何筛选行，也没有 URL 筛选可移除。矩阵把三页并成一行“FilterSelect + AppliedFilters”，与代码不符（`/inbox` 才是成立的）。 | 修正矩阵：goals/projects 标为“无列表条件（n/a）”，或明确它们的设计是“仅分页”；避免后续按文档误判回归。 |
| D-07 | **P2** | 三个页面不使用 `PageHeader`，标题排版与其余 30+ 页分叉 | `frontend/pages/home-page.tsx:90`（`text-3xl`）；`frontend/pages/focus-page.tsx:71`（`text-2xl`，图标+标题手搓）；`frontend/pages/project-timeline-page.tsx:31`（`text-2xl`，返回按钮+标题+描述+Badge 手搓）；另 `app.tsx:2873/2879` 两处恢复态手写 h1 | 契约 §1（PageHeader 是“应用唯一页头”，恰好一个 h1、description 单行、status 真实状态、icon 槽） | `PageHeader` 标题是 22px/`-.02em`（`page-header.tsx:28`），手写页分别是 30px/24px；没有 `aria-describedby` 关联、没有 `status` 槽、图标不统一。视觉/可访问性上都是另一套页头。 | 三页改用 `PageHeader`（时间线可把返回按钮放 `actions`，私有 Badge 放 `status`；focus 的计时器保持内容区）；恢复态也复用同一页头。 |
| D-08 | **P2** | 日期/时间展示不统一：同一产品里既有本地化格式也有原始 ISO 字符串 | 原始 ISO：`notifications-page.tsx:134`、`thread-page.tsx:157`、`knowledge-page.tsx:44`（publishedAt）、`admin-dashboard-page.tsx:108`、`knowledge-item-page.tsx:136`、`agent/agent-history-list.tsx:35`、`review/review-comments-panel.tsx:21`；本地化：`tasks-page.tsx:125`、`inbox-page.tsx:91`、`admin/analytics-page.tsx:131-133`、`calendar-cancel-confirmation.tsx:43`；未传 locale：`project-timeline-page.tsx:50`（`new Date(...).toLocaleString()`） | 用户原话“交互统一”；采用清单“en/zh i18n 键”隐含有序展示约束 | 中文界面里通知/线程/知识列表/仪表盘活动流直接显示 `2026-10-18T12:34:56.000Z`，而 tasks/inbox/analytics 显示本地化日期；时间线的 `toLocaleString()` 用浏览器默认 locale，可能与界面语言不一致。 | 抽一个共享 `formatDateTime(value, locale, {dateStyle,timeStyle,timeZone})`（`<time dateTime>` 保留原值），全站替换；时间线显式传 `locale.locale`。 |
| D-09 | **P2** | 危险/隐私操作的确认模式不统一（行内确认、原生 `confirm`） | 行内两段式：`frontend/pages/admin/knowledge-item-page.tsx:148-153`（回滚）；原生 `window.confirm`：`frontend/components/knowledge/knowledge-share-button.tsx:24`（经 `frontend/lib/system-share.ts:15`） | 用户原话“写操作统一”；采用清单 0.2/1.6 的确认控件约束 | 回滚会移动发布指针，却用页面内嵌确认块；其余 destructive 动作统一走 beUI `ConfirmAction`/`TypedConfirmAction`/`HoldActionButton`（30+ 处）。知识分享是隐私动作，用浏览器原生 confirm，样式/焦点/可访问名都不受应用控制，且无法被现有测试与键盘契约覆盖。 | 回滚改用 `ConfirmAction`（保留 `data-knowledge-rollback-confirm` 与确认文案键）；分享确认改用 `ConfirmAction`（或系统 share sheet 前不再二次确认，直接依赖 `navigator.share`）。 |
| D-10 | **P2** | `vm:use` 能力永不由会话签发，环境 VM 启动前哨必然失败 | `frontend/features/environments/authenticated-vm-runtime.ts:32`（`!session.capabilities.includes('vm:use')`） vs `src/authorization/policy.ts:22-44`（contributor/admin/automation 三组能力列表均无 `vm:use`）；`src/routes/session.ts:17` | 权限一致性（前端可见/可用与服务端能力一致） | `/api/session` 返回 `capabilitiesFor(principal)`，其中永不含 `vm:use`；`requiredPermission: "workspace.vm"` 只体现在掩码。因此任何真实用户执行 start/restore 前哨都会 `ACCOUNT_AUTHORITY_CHANGED`。当前 `/environments` 按设计是 metadata-only、`createSession()` 直接抛 `VM_SESSION_UNAVAILABLE`（`environment-vm-composition.ts:6-14,47`），所以用户可感知后果目前被掩盖；一旦接入 VM 引擎，所有启动都会被这条检查拦住。测试也未覆盖该文件（`rg ACCOUNT_AUTHORITY_CHANGED test` 无命中）。 | 把检查改为与后端同一判定（`routeAccessAllowed`/`hasPermission(mask,'workspace.vm')`），或让 `/api/session` 增加掩码派生的能力；补一条单测。 |
| D-11 | **P2** | `app.tsx` 单体结构与重复样板；筛选失效逻辑手写 5 份（其中 1 份错） | `frontend/app.tsx`（4 664 行，31 个 `export function *Route`）；重复样板：12× `key={JSON.stringify([session?.member.id, …, [...capabilities].sort()])}`（如 `:239,265-276`）、13× `registerWorkspaceLeaveGuard`、21× `setState({ kind: "loading" })`；筛选键重置 5 份手写：`:1075,1226,1699,1780-1853` + inbox 依赖 effect `:2056`；路由容器拆分不一致：4 个在 `frontend/pages/admin/{admin-dashboard-route,knowledge-item-route,recycle-bin-route,review-detail-route}.tsx`，其余 27 个仍在 `app.tsx` | 可维护性（用户原话“核心功能能力”的可持续性） | 同一“查询身份 + 刷新 + 恢复锁”模式在不同页面各自实现，D-02 正是手写差异的结果；identity key 与 leave guard 的重复使“新增一页”需要复制 3-5 段样板，审计/回归成本高。`numbered-page` 已提供 `createNumberedRequestController`，但筛选键失效没有共享原语。 | 抽 `useSessionIdentityKey()`、`useNumberedListQuery({ key, load, keepOnRefreshFailure })`（内置“同查询保留/条件变化清行”），把 5 份手写逻辑收敛；把剩余路由容器逐步移到 `pages/*-route.tsx`（与已拆的 4 个一致）。 |
| D-12 | **P3** | 三套分页语义并存 | 共享：`frontend/components/data-table.tsx:68-102` + `data-pagination.tsx`（20/50/100，桌面 pager + 移动 feed）；游标“加载更多”：`recycle-bin-page.tsx:185`、`knowledge-page.tsx`（各面板 SectionMore）、`knowledge-item-page.tsx:145-146`、`spaces-page.tsx`（集合游标）；自绘游标分页：`messages/thread-page.tsx:202-205`（20/50，`DiscussionCursorPagination`） | 契约 §4（服务端分页沿用 DataTable）；采用清单 1.9/3.6 保留游标 | 同一个“消息”界面里，`/messages` 用 20/50 自绘 pager，`/notifications` 用共享 `DataPagination`（20/50/100），列表表格用 `DataTable`；`/admin/knowledge/trash` 的“加载更多”按钮在表外，桌面端没有总数/范围读数。均可用，但语义与文案密度不一致。 | 在交互契约里显式登记“cursor 列表”为例外并统一外观（按钮位置、`role=status` 播报、总数文案）；或让 `DataTable` 支持 cursor 模式，把回收站/知识面板的“加载更多”收进同一容器。 |
| D-13 | **P3** | 死代码/未使用载荷 | `frontend/app.tsx:452-460`（`useInitialReadRetry` 定义后无调用）；`frontend/pages/home-page.tsx:29-38,196`（`LegacyHomeState`/`LegacyHomePage` 整段兼容层，`app.tsx` 只传 `WorkbenchHomeState`）；`frontend/components/assets/asset-state.ts`（无任何 import，且含英文标签）；`frontend/components/motion/context-menu.tsx`（791 行，全仓零引用，行操作最终选 `overflow-actions`）；`frontend/app.tsx:3733` `ReviewQueueSession` 声明并接收 `search` 但未使用 | 可维护性/采用真实性 | 死代码会误导“beUI 采用”判断（看起来装了 context-menu 其实没用），也让 i18n/审计扫描把无效文案算进来。`LegacyHomePage` 还包含第二套手写 h1 与手搓按钮样式。 | 删除或标注 `@deprecated` 并在测试中锁定不引用；`asset-state.ts`/`context-menu.tsx` 删除或移到 `components/motion/_unused`；`ReviewQueueSession` 去掉未用 prop。 |
| D-14 | **P3** | 采用清单/契约与代码不一致（两个方向） | ① `docs/product/2026-10-18-beui-page-adoption-checklist.md:107-108` 称 `/settings` 语言“审计保留原生 `<select>`”，代码已是 beUI `Select`（`frontend/pages/settings-page.tsx:5,58`；代码改动 `90808bc0` 早于文档 `9711c32d`）；② 交互契约 `:72` 称“禁止访问表面没有标题级元素”，代码已有 `<h1>`（`frontend/pages/admin/admin-forbidden-page.tsx:12`，采用清单 3.11 也已记录） | 评审基准准确性；采用真实性 | 文档低估了采用程度（settings）并保留了一条已不成立的“已知差异”（forbidden h1）。两者都会让后续评审/验收得出错误结论。 | 更新两处文档；把“原生 select”例外从清单删除（全仓已 0 处原生 select，legacy audit 也会拦）。 |
| D-15 | **P3** | 图表/状态色用硬编码 hex 而非主题 token | `frontend/pages/workbench-review-page.tsx:53-55`、`frontend/pages/admin/admin-dashboard-page.tsx:75-76`、`frontend/pages/admin/analytics-page.tsx:71`、`frontend/components/assets/asset-hygiene-panel.tsx:181`、`frontend/components/charts/status-bar/context.ts:35-39` | 契约 §1“设计 token 沿用 globals.css 现值，不新增体系”；采用清单“改动图表时加深色主题验收” | 这些 hex 不随 `.dark` 切换（未在深色下实测对比度，但同一色值同时用于浅/深主题）；且 `status-bar/context.ts` 还带英文默认标签（该文件当前无引用）。与前一条死代码叠加，风险主要是“未来接线时带入”。 | 图表色改用 `var(--chart-*)`/`--primary` 派生（analytics 的 `DailyStatus` 已示范 `color-mix(... var(--primary) ...)`）；删除未用的 status-bar 默认英文标签。 |
| D-16 | **P3** | 硬编码英文 aria-label（中文界面读屏器会读英文） | `frontend/components/shell/app-shell.tsx:246`（`aria-label={`${label} ${expanded ? "collapse" : "expand"}`}`）；其余硬编码 `aria-label` 集中在 vendored `components/motion/**` 与 `components/charts/**`（如 `tabs.tsx:240,267`、`table/table-header.tsx:194`） | 采用清单“精确 `aria-label` 必须保留”与 i18n 双语要求 | 侧栏分组展开/收起按钮的可访问名是 `${label} collapse`，中文界面下混合语言。内联目录里已有 `COMMON_EXPAND`/`COMMON_COLLAPSE`（`frontend-i18n.test.ts:35-37`），说明这是漏改。 | 改为 `locale.t(expanded ? "COMMON_COLLAPSE" : "COMMON_EXPAND")`；vendored 层的默认英文按 §17 patch 由适配层传入本地化 label（`dialog`/`sheet` 已是该模式）。 |

## 结构性问题与重复模式

1. **页面装配的两层结构已成事实标准，但拆分不彻底**：`app.tsx` 承担路由容器（数据获取、恢复锁、离页守卫），`frontend/pages/*` 只做投影；4 个较新的容器已拆到 `pages/admin/*-route.tsx`，其余 27 个仍在 `app.tsx`。两种放置方式混用，使 `app.tsx` 无法按页拆分测试，也让“同一模式哪份是参考实现”不明确（D-11）。
2. **“查询身份 / 刷新保留 / 条件变化清行 / 未知结果恢复”没有共享原语**，每个列表各写一遍。正面样板存在（`knowledge`/`search`/`my-submissions`/`tasks`/`inbox`/`members`/`assets`），反面样板也存在（`audit`，D-02）。这是当前最值得抽取的一个 hook：`useNumberedListQuery`（输入：条件键、load 函数；输出：state/pending/retry/page），把“同查询保留旧行、条件变化先回 loading”固化。
3. **确认/写操作样板重复但一致**：`ConfirmAction`、`TypedConfirmAction`、`HoldActionButton`、`StatefulButton`、`useCreateDraft`、`registerWorkspaceLeaveGuard` 的采用率高（30+ 确认点、24 处离页守卫），是仓库最健康的部分；仅 2 处例外（D-09）。
4. **i18n 是“两套系统、两个不同覆盖面的检查”**：应用用 `frontend/lib/i18n.ts` 内联目录（2 040×2，key/占位符由 `i18n-contract.test.mjs` 校验），公开/legacy 用 `public/locales`（434×2，由 `verify-i18n` 校验）。两套都对，但没有脚本扫描 `frontend/` 源码里的硬编码副本，因此中文界面英文漏网（D-03/D-05）。
5. **共享原语本身的契约质量高**：`PageHeader`（`aria-describedby`、icon 不并入标题名）、`PageState`（`data-page-state` + loading `aria-busy` + error/forbidden `role="alert"` + degraded `role="status"`）、`FilterSelect`（`aria-haspopup="listbox"`、`sr-only` 历史可访问名、面板靠近右缘右对齐）、`AppliedFilters`（`role="group"`、逐项 `aria-label`、移动端 44px）、`DataTable`（同查询刷新保留行、移动端 feed + skip 播报）、`useFocusScope`（初始焦点/Tab 环/Escape/焦点恢复）、`main.tsx` `MotionConfig reducedMotion="user"` + `globals.css:139-147` 兜底。这些问题不在共享层，而在“是否用了共享层”。
6. **扫描结论（结构性卫生）**：全仓前端无 `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`；无 `TODO/FIXME/HACK`；`console.*` 仅 vendored `components/motion/tooltip.tsx:498` 一处 `console.warn`；无原生 `<select>`（legacy audit 也会拦）；`window.confirm` 仅分享一处（D-09）。

## 局限与未覆盖

- **无浏览器执行**：未验证 375px/320px 真实布局、深色主题渲染、真实 Tab 顺序/焦点恢复、触屏手势。矩阵中的键盘/焦点一列依据代码契约（`useFocusScope`、`Escape` 监听、`data-*` 钩子）判断；采用清单 §4.3 声称的 660 次生产测量无法在只读评审中复现。
- **未跑全量门禁**（按要求禁止 `npm run check/test/build`）：仅运行了 4 个快速 node 契约脚本与 2 组 `node --test` 契约测试（17 + 14 pass）。未运行 vitest 单页套件，因此“某页已有断言保护”只以代码与文档记录为依据，未重新执行。
- **未审计后端/数据库**：权限结论基于 `shared/workspace-route-capabilities.ts` 与 `src/routes/*.ts` 的静态对照；未验证自定义角色掩码的真实数据分布（D-04 的影响面取决于是否实际存在“只有 knowledge:review”或“只有 submission:read-all”的角色组合）。
- **`/environments` 的 forbidden 分支不可达**是按外壳 `matchRoute` + `requiredPermission` 推断的（`frontend/lib/router.ts:17-30`、`app-shell.tsx:108`），未在浏览器证实。
- **i18n 硬编码只做了模式扫描**（`label="[A-Z]…`、`label: "[A-Za-z]…`、`role`、`aria-label`），可能漏掉中英混排或模板拼接；D-03 的清单是“已确认”的子集，不代表唯一。
- **未统计运行时性能/包体**：`app.tsx` 的拆分建议基于可维护性，不是基于实测加载数据。
- 本评审未修改任何源码；唯一写入文件为本报告。
