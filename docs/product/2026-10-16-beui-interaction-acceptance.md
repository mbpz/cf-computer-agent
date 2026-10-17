# 2026-10-16 beUI 交互验收（逐页功能截图）

日期：2026-10-16。范围：`https://memory.crgmhrc.asia/`，经 omp relay 驱动真实标签页（contributor 会话）。判据来自 beUI skill：**优先使用已安装的 beUI 源组件、不要手搓一次性动效、用 `className` 做布局与小改、不要 fork 内部实现**，并按组件选择表匹配交互类型。

**本轮状态：workspace 21 页 + 管理端 12 页全部实拍完成**（管理端由用户在浏览器中切回管理员会话后补拍）。两个详情页（`/admin/submissions/:id`、`/admin/knowledge/:id`）当前无数据可拍：审核队列 `status=review_pending` 与知识回收站都是空态。

## 1. 截图索引

`silent: true` 的全页截图保存在本机临时目录（`$TMPDIR/omp-sshots-*.webp`，按文件时间对应下表顺序）：

| 顺序 | 入口 | 截到的功能面 | 页面标题 | 动作数 | 控件 | 表格 |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | `/` | 权威摘要 + 最近知识（23 个链接，含 5 个模块入口与条目深链） | 你的工作台 | 0 button | 0 | 0 |
| 2 | `/knowledge` | 回顾周期筛选 + 知识列表（含分享动作、分页） | 已发布知识 | 8 | 1 | 1 |
| 3 | `/knowledge/:id` | 目录/来源面板 + 9 个衍生动作 + 研究运行 + 笔记 | 条目标题（恰一个 h1） | 8 | 7 | 0 |
| 4 | `/search` | 检索 + 类型/作者/日期筛选 + 保存视图 | 搜索知识 | 8 | 6 | 1 |
| 5 | `/agent` | 提问 + 来源范围 + 历史 | 向智能助手提问 | 8 | 1 | 0 |
| 6 | `/submit` | 提交目标/可见性/格式 + 文件选择 + 服务端草稿状态 | 提交知识 | 2 | 7 | 0 |
| 7 | `/my-submissions` | 范围筛选 + 提交列表 | 我的提交 | 1 | 2 | 1 |
| 8 | `/today` | 有界计数 + 2 个外链指标卡 | 今日 | 0 button | 0 | 0 |
| 9 | `/focus` | 选择任务 | 专注 | 1 | 0 | 0 |
| 10 | `/review` | 刷新 + 日/周切换 | 复盘 | 3 | 0 | 0 |
| 11 | `/inbox` | 快速收集 + 状态筛选 + 列表 | 收集箱 | 6 | 1 | 1 |
| 12 | `/tasks` | 新建 + 状态/优先级/截止筛选 + 搜索/标签 + 列表 | 任务 | 6 | 3 | 1 |
| 13 | `/boards` | 四列看板（空态） | 看板 | 0 button | 0 | 4 |
| 14 | `/goals` | 创建 + 行内（管理关联任务 / 归档项的取消归档「恢复」）+ 分页 | 目标 | 6 | 2 | 1 |
| 15 | `/projects` | 创建 + 行内（管理关联 / 时间线 / 取消归档）+ 分页 | 项目 | 6 | 1 | 1 |
| 16 | `/calendar` | 添加日程 + 范围筛选 + 翻页 | 日历 | 4 | 3 | 1 |
| 17 | `/graph` | 视角/时间范围/变更类型筛选 + 画布 | 工作图 | 6 | 1 | 0 |
| 18 | `/environments` | 禁止访问面（contributor 无 `vm:use`） | — | 0 | 0 | 0 |
| 19 | `/notifications` | 阅读状态/类型筛选 + 列表 | 通知 | 6 | 0 | 1 |
| 20 | `/messages` | 翻页（空态） | 消息 | 2 | 1 | 0 |
| 21 | `/settings` | 主题（浅色/深色/跟随系统）+ 语言 | 设置 | 3 | 1 | 0 |

管理端（管理员会话，同一次运行、同一临时目录）：

| 顺序 | 入口 | 截到的功能面 | 页面标题 | 动作数 | 控件 | 表格/行 |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 22 | `/admin` | 概览计数/摘要 + 私有存储维护只读区 | 管理后台 | 2（刷新计数、重试） | 0 | 0 |
| 23 | `/admin/submissions` | 审核队列 + 批量工具栏（全选本页/清除选择/驳回所有选中/请求修改/批量决定）+ 分页 | 审核队列 | 7 | 4 | 1/1（空态） |
| 24 | `/admin/assets` | 状态筛选（queued/processing/succeeded/failed_retryable/failed_terminal）+ 队列表 | 资产队列 | 7 | 1 | 1/1（空态） |
| 25 | `/admin/duplicates` | 重复候选 + 分页 | 重复候选 | 2 | 1 | 1/1（空态） |
| 26 | `/admin/members` | 成员状态筛选（全部/Active/Disabled）+ 行内禁用 + 分页 | 成员 | 7 | 1 | 1/2 |
| 27 | `/admin/roles` | 角色列表 + 创建角色 | 角色与权限 | 1 | 0 | 1/2 |
| 28 | `/admin/menus` | 菜单树编辑器（创建菜单 + 每节点保存/停用/隐藏，33 个控件，节点键 `NAV_HOME/ · 0x0`） | 菜单树 | 7 | 33 | 0 |
| 29 | `/admin/spaces` | 空间与集合（创建空间/编辑空间/标签/创建集合） | 空间与集合 | 4 | 0 | 0 |
| 30 | `/admin/audit` | 审计日志 + 动作筛选（member.login/role.updated/role.created/role.deleted/menu.updated） | 审计日志 | 7 | 1 | 1/20 |
| 31 | `/admin/analytics` | 站点访问统计 + 刷新 | 站点访问统计 | 1 | 1 | 1/20 |
| 32 | `/admin/knowledge/trash` | 知识回收站 | 知识回收站 | 0 | 0 | 1/1（空态） |
| 33 | `/admin/roles/role-admin` | 角色权限编辑（21 个能力控件 + 保存权限 + 返回列表） | 角色与权限 | 2 | 21 | 0 |

管理端导航树（同一会话从 `/api/navigation` 读取，`admin` 组）：`admin-overview → /admin`、`review → /admin/submissions`、`assets → /admin/assets`、`duplicates → /admin/duplicates`、**`governance` 组**（`members → /admin/members`、`roles → /admin/roles`、`menus → /admin/menus`、`spaces → /admin/spaces`、`audit → /admin/audit`、`site-analytics → /admin/analytics`）、`recycle-bin → /admin/knowledge/trash`。即**管理端本就有两级分组**，workspace 侧的知识收缩与之同构。

补充截图（第 34 张）：`/projects/:id/timeline`（项目时间线）。入口不是链接而是行内「时间线」按钮，需点真实按钮才拿到真 id（`/projects/93521135-547d-4463-97f6-00028dbc62f7/timeline`）：标题为项目名，「返回项目」「添加到时间线」、类型/开始时间/截止时间与分页齐全，`data-page-state="empty"` 正确。**仍缺 `message-thread`（`/messages/:id`）**：消息列为空、审阅队列与阅读页均无线程链接，无数据可进入。

## 2. beUI 采用面审计（可判定项）

- **已安装的 16 组 beUI 源组件全部在用**：`drawer`(3 处)、`tabs`(3)、`select`(5)、`switch`(3)、`checkbox`(4)、`input`(8)、`loader`(4)、`table`(2)、`button`(7)、`file-tree`(3)、`scroll-reveal`(2)、`shared-layout-bg`(2)、`number-ticker`(3)、`center-morph-modal`(1)、`animated-toast-stack`(3)、`not-found`(2)。没有"装了不用"的组件。
- 46 个页面/领域文件从 `components/(motion|ui)/` 取 beUI 源；`frontend/components/motion/` 之外的 `motion/react` 直接使用有 9 处，逐个判定后：`agents/{agent-progress,citations,code-block,agent-disclosure}.tsx` 与 `ui/expandable-tabs.tsx` 是 beUI 注册表同名条目的**内联移植**（判定为合规，不算手搓）；`ui/dialog.tsx` 是 beUI 背板的适配层；**`ui/sheet.tsx` 与已安装的 `drawer` 职责重复**；`shell/{app-shell,command-palette}.tsx` 是**手搓**。

## 3. 交互验收发现

| 编号 | 发现 | 依据 | 建议 | 量级 |
| --- | --- | --- | --- | --- |
| I1 | 首页对 `/submit` 有两个不同文案的入口：「打开知识采集」与「收集知识」 | 线上 DOM（23 链接中的两条同指 `/submit`） | 合并为一个动作一个文案（保留"收集知识"式动词短语） | 小 |
| I2 | `ui/sheet.tsx` 与**已安装的** `motion/drawer` 职责重复 | 选择表："侧面板或应用抽屉 → `drawer`"；`drawer` 已被 3 处引用 | 统一到 `drawer`（保留 `sheet` 的调用点则改为轻包装），删除重复件 | 小 |
| I3 | 移动端轻筛选未采用 beUI `bottom-sheet` | 设计研究 §4.5「移动端轻筛选可用 bottom-sheet」；该 slug 本地无对应件 | 先安装并只用于移动端筛选；桌面保持现有筛选行 | 中 |
| I4 | Agent 输入区为手搓 composer | 选择表："Prompt box or composer → `prompt-input`"；该 slug 本地无对应件 | 评估 `prompt-input` 是否覆盖现有守卫（草稿/已知来源/取消），再替换；不覆盖则保留并记录 | 中 |
| I5 | 命令面板为手搓 | 选择表："Cmd+K palette → `command-palette`"；该 slug 本地无对应件 | 该面板承载路由 + 动作（非纯展示），替换须功能对等；作为单独立项 | 中 |
| I6 | 侧栏未采用 beUI `animated-sidebar` | 选择表："App chrome sidebar → `animated-sidebar`"；`app-shell` 手搓动效 | 外壳守卫密集（导航权限、折叠、主题、未读），替换风险高；作为单独立项 | 大 |
| I7 | 无审批/工具权限交互面 | 选择表 `approval-card`/`tool-approval`；当前产品无该流程 | 暂不引入（不为不存在的流程造组件） | — |
| I8 | **已修** `/admin` 维护控制只读区在**永久性**配置缺失下仍提供「重试」 | 线上：该区文案为「本实例未启用维护控制（未配置控制令牌）…本区域保持只读」，`/api/admin/maintenance/status` 稳定 `503`（重试三次皆 503，概览其余 5 个请求全 `200`） | `frontend/components/admin/maintenance-status-panel.tsx` 把 `disabled`（未配置令牌）与 `error`（读取失败）拆开：前者不再渲染任何按钮，改为点明缺的是 Worker secret `MAINTENANCE_CONTROL_TOKEN` 并给出运维手册链接（`data-maintenance-not-configured`/`data-maintenance-runbook`），后者保留重试；`503` 语义不变。手册链接核对过基址与目标文件（`git remote` = `github.com/mbpz/cf-computer-agent`，链接指向 `docs/operations/evidence/2026-09-22-r14-production-activation-preflight.md`，该文件存在；正式运维手册 §7 未列该令牌，故不指它） | 小 |

## 4. 视口与主题

### 4.1 移动端 390×844（20 页实拍）

| 项 | 结果 |
| --- | --- |
| 文档级横向溢出 | **20 页全部为 0**（`documentElement.scrollWidth === clientWidth`），无移动端破版 |
| 移动导航 | 真实开关是顶部的 `<details><summary>`「打开导航」（`SHELL_OPEN_NAVIGATION`），点击后弹出标签为「工作区导航」的 drawer。**更正**：本轮初测曾用 `[aria-label*="导航"]` 判定"20 页均有移动导航入口"——那是匹配到了 `<nav>`/面包屑等地标，属误报（`summary` 不是 button 角色，`role/button[name=…]` 也匹配不到），已改为按真实开关复测 |
| 内部横向滚动容器 | 唯一一处：`/boards` 看板容器内部溢出 857px——**设计内的横向滚动**，非页面级破版，仅记录 |

**M1（点按尺寸，低于 WCAG 2.2 AA 下限）—— 已修**：`/knowledge` 列表行内的「分享」按钮实测高度 **16px**，低于 2.5.8「目标尺寸（最小）」的 24×24 CSS px。修法：`frontend/components/knowledge/knowledge-share-button.tsx` 的按钮加 `inline-flex min-h-6 items-center px-1`（无背景，仅 hover 下划线，观感不变，命中区变大）。

证据（线上真实页面测，因果可归因）：改前按钮 24×16、所在行 16px；应用 `min-height: 24px` 后按钮 **24×32**、所在行 24px、兄弟节点高度不变；移除后回到 16。本地构建产物已包含该工具类：`.min-h-6{min-height:calc(var(--spacing) * 6)}`（=1.5rem=24px）。注意：线上 CSS 是旧构建，**该修复需随下一次部署生效**。

其余 16px 级元素（`/knowledge` 下载链接、研究进度链接）是正文内的文本链接，属 2.5.8 的 inline 例外，未改动。`scripts/wcag-contract.mjs` 只做 CSS token 对比度静态分析、jsdom 又无布局，故不为点按尺寸新增门禁测试（写类名断言等于测源码文本）。

**M2（低于移动建议值）—— 已修**：初测口径修正——我当时按行内可见按钮量到 32px（`size="sm"` 按钮与 chip），而 `FilterSelect` **触发器**实际是 36px（`h-9`）。修复后移动端实测（真实 Chromium，断点 `(width < 64rem)`）：触发器 36→**44**、筛选行 36→**44**、`AppliedFilters` chip 26→**54**、chip 的移除 `×` 16×8→**44×44**、清空按钮 32→**44**、披露触发器 **44**（整行宽）、`/search` 的提交 40→**44**、`ui/tabs` 触发器 32→**44**、`expandable-tabs` 40→**44**；桌面 1440 全部保持不变（`max-lg:` 限定）。

**I3（移动端轻筛选）—— 已采用 beUI `bottom-sheet`，且未引入第二套面板实现**：先验证已装的 `drawer` 能否表达底部抽屉——`frontend/components/motion/drawer.tsx:20` 的 `side` 只接受 `"left" | "right"`，面板是 `fixed inset-y-0` 且只动 `x`，因此不能。于是按 registry payload 手工写入 `frontend/components/motion/bottom-sheet.tsx`（只把 `@/lib/*` 改为相对导入；未覆盖既有 `lib/{ease,presence-gate,touch,utils}`，未新增 npm 依赖）。接入方式是给 `ui/sheet.tsx` 的 `SheetContent` 增加 `side="bottom"` 分支，因此焦点作用域、Tab 循环、焦点归还、`data-focus-scope`/`data-sheet-content`/`data-side`/`data-sheet-open`、Escape、背板关闭与滚动锁仍只存在于那一个适配层。

移动端边界复用既有的 `lib/list-mode.ts`（`(min-width: 1024px)`）store：**桌面分支渲染同一个元素与同一份类名（无额外包裹层）**，`<lg` 时该行移入一个由可见标题命名的底部抽屉，已应用筛选 chip 留在面板之外保持可见、可逐个移除。已接入 `/search`（其筛选行本身是 `<form>`，两侧都渲染表单本身——portal 出去的提交按钮不属任何表单）、`/tasks`、`/notifications`、`/graph`；`/inbox` 只有一个筛选项，保持内联。回归断言：`test/unit/frontend-mobile-filters.test.tsx`（4 条：桌面无披露、面板命名与焦点/滚动锁、Escape 关闭并归还焦点、chip 在面板外仍可清除、搜索行可从面板内提交）。

**一处范畴修正（2026-10-17）**：`/notifications` 的批量动作「标记可见为已读」原本被一并移入筛选面板——**动作不是筛选条件**，现已留在页面内（桌面与移动都在页面，仅带 `max-lg:h-11`），面板内只有两个 `FilterSelect`。`/search` 面板里的「应用筛选」是筛选行自身的提交，属合理留在面板内。相应地，`test/unit/frontend-notifications-route.test.tsx` 的移动端寻址改为"先开披露、在文档范围查找控件"（该套件两条用例主动 `stubListViewport(browser, "mobile")`，jsdom/happy-dom 默认 1024px 宽走桌面分支，故只有它们受影响），其断言本身（URL 同步、分页重启、批量写入只发一次且不回请已清空的末页）未改。

### 4.2 深色主题（8 页实拍）

判据：`prefers-color-scheme: dark` + 应用主题「跟随系统」。结果：`html.dark` 生效，`--background: oklch(0.17 0.02 255)`、`--foreground: oklch(0.93 0.01 255)`，`<meta name="color-scheme" content="light dark">` 存在，截图无浅色残留。

### 4.3 视口矩阵与英文（2026-10-17 补测）

- **视口矩阵**：320×720、768×1024、1280×900 × 20 个 workspace 页面 = 60 组冷加载。**文档级横向溢出全部为 0**；最小可见点按高度三档均为 **24px**（M1 修复后线上已无 16px 控件）。唯二的内部滚动容器是 `/boards` 看板（设计内的横向滚动）与阅读器的 `<pre>`（320 下溢出 1260px、1280 下 1220px——代码行在自身容器内滚动，非页面破版）。
- **英文**（`locale=en`，存于 `localStorage` 的 `memory-garden-locale`）：1440×900 与 390×844 × 20 页 = 40 组。**无未翻译键泄漏**（含下划线的大写键名命中 0 次）、**无横向溢出**；探针标出的"被裁切"元素经复查全部是 `sr-only` 无障碍标签（`clientWidth=1` 且 `hidden`），不是真实裁切。阅读器正文仍是中文（内容本身中文），界面铬件切为英文。
- 仍未做：深色下的全部 33 页与对比度审计。

## 5. 部署与生产核验（2026-10-17）

**部署**：本地门禁 `npm test` 全绿（78 文件 / 1304 测试）→ `npm run build`（dry-run：上传 1687.03 KiB / gzip 320.20 KiB）→ `wrangler d1 migrations apply DB --remote`（远端待应用仅 `0074`，执行 3 条命令）→ `wrangler deploy`（版本 `9a4da2ea-a179-43ee-bb9e-345517ef4632`，自定义域 `memory.crgmhrc.asia`）。

生产实测（contributor 会话，真实冷加载与真实点击）：

| 项 | 结果 |
| --- | --- |
| 服务端导航树 | `workspace → knowledge → [search, agent, submit, my-submissions]`；`submit`/`my-submissions` **不再是一级**（`/api/navigation` 读回） |
| 桌面侧栏 | 点开「AI 知识库」的展开按钮后，恰有 4 个二级项：**知识检索 / AI 助手 / 提交 / 我的提交**（`data-nav-depth="2"`） |
| 首页单一入口（I1） | 指向 `/submit` 的锚点数量 = **1**，文案「收集知识」 |
| 分享按钮（M1） | 3 个按钮实测 **24×32**，计算样式 `min-height: 24px`、`padding-left: 4px` |
| 移动抽屉（I2） | `<summary>`「打开导航」→ 对话框「工作区导航」出现，焦点进入面板（落在「关闭导航」），`body overflow: hidden`；Escape → 对话框消失、`details` 关闭、滚动恢复、**焦点回到摘要** |

**移动抽屉已按树渲染（2026-10-17 追加，部署于版本 `5f790c53`）**：`MobileNavigation` 原先用 `flattenNavigation` 把工作区与管理端目的地平铺成一个列表，移动端因此看不到层级。现在该 helper 返回 `{ node, depth }`，深度按**可见层级**计算（没有 `path` 的纯分组，例如管理端 `governance`，自身不渲染行，其子项不会被缩进到一个看不见的父项下），行上补 `data-nav-node`/`data-nav-depth` 并用 `pl-6` 缩进（覆盖 `px-2`，不用 `ml` 以免面板内产生横向溢出）。

设计取舍：移动端**不做折叠**，一个目的地一行、只是缩进——行数与改动前一致（14 行）、触控行高仍 40px，因此没有一个目的地被藏进展开交互里。生产实测（390×844）：`/knowledge` depth 0 / `padding-left: 8px`，`/search`、`/agent`、`/submit`、`/my-submissions` 均 depth 1 / `padding-left: 24px`，面板横向溢出 0。回归断言：`test/unit/workspace-shell.test.tsx`「keeps the mobile drawer hierarchy so the knowledge family indents under its one top-level entry」。

### 5.1 第三批部署与生产核验（I3/M2/I8，2026-10-17，版本 `4f27b8a0`）

门禁：`npm test`（smoke 88/14/30 + 单元 5629 + worker 1304）、`npm run typecheck`、`npm run build`、`npm run verify:i18n`。

生产实测（用户已登录标签，起点 `/tasks`）：

| 项 | 结果 |
| --- | --- |
| `/notifications` 移动端披露 | 触发器 **44px**；面板 `data-side="bottom"`、两个 `FilterSelect` 均 **44px**、焦点进入面板、`body` 滚动锁 |
| 披露关闭 | Escape → 面板消失、`aria-expanded="false"`、**焦点回到触发器**、滚动恢复 |
| 批量动作 | 「标记可见为已读」在**页面内**（不在面板内）且 **44px** |
| `/tasks` 移动端 | 披露触发器 44px |
| `/tasks` 桌面 1440 | **不渲染披露**、行内选择器仍 36px、页面横向溢出 0 |

**未在 UI 核验**：`/admin` 维护区（需管理员会话；本轮不切角色以免打断 contributor 会话）——该面板由 6 条单测覆盖（未配置态不渲染任何按钮、点明 Worker secret `MAINTENANCE_CONTROL_TOKEN`、给出手册链接、读取失败仍保留重试）。

## 6. 边界

- 管理端 12 个页面已实拍并按同一判据评估；**不可逆写入面（审核决策、成员禁用、菜单编辑、回收站恢复）只评估了控件与文案，未真的执行写入**——那属运维验收，不属交互验收。
- 非缺陷记录（两处都是我的探针错，不是产品缺陷）：① `/api/admin/submissions?page=1&pageSize=1` 返回 `400`——`pageSize` 仅接受 20/50/100，与页面每页选择器一致；② `/projects/acct-project-1791803862816/timeline` 返回 `PROJECT_NOT_FOUND` 并使页面落到 `error` 态——`acct-project-…` 是列表行的显示名称，接口 id 是 UUID；点真实「时间线」按钮后到达 `/projects/93521135-547d-4463-97f6-00028dbc62f7/timeline` 并正常渲染。
- `/admin` 概览首屏约 2.5 秒内有 2 张卡仍在 `loading`，6 秒内稳定为 `empty×2 + ready×3`；每个请求端到端约 0.9 秒（本地到边缘的网络时延），非应用侧慢查询。
- 未做 320/375/768/1280 其余三档视口与英文下的交互评估；本轮为 1440×900 浅色 + 390×844 浅色 + 1440×900 深色（见 §4）。
- 未评估真实 AI 生成过程中的交互（避免计费与配额），仅确认入口与挂载不触发请求。
- 截图为本机临时文件，未纳入仓库；本轮共 62 张位于 `/var/folders/r_/37rc0_zx013_2r7ttv6y34qw0000gn/T/omp-sshots-*.webp`（33 张 1440 浅色桌面/管理端 + 20 张 390×844 移动端 + 8 张 1440 深色 + 1 张项目时间线，按文件时间对应各表顺序），如需长期留档请指定仓库内目录。

## I1／I2／I4 处理结果（2026-10-16 修复）

- **I1 已修复**：`/` 上原有三处指向 `/submit` 的入口（页头「打开知识采集」、收集卡「收集知识」、快捷动作磁贴「收集知识」）收敛为一个动作一个文案——收集卡的「收集知识」/“Capture knowledge”。页头只留标题与说明，`buildWorkbenchSummary` 的快捷动作不再含 `create-knowledge`，失去唯一调用点的 `WORKBENCH_OPEN_CAPTURE` 已从两份目录删除。回归断言：`test/unit/frontend-workbench-home.test.tsx`「offers exactly one capture action to /submit in en|zh-CN」。
- **I2 已修复**：侧面板统一到已安装的 beUI `motion/drawer`。`ui/sheet.tsx` 不再是第二份面板实现，而是 `Drawer` 之上的薄适配层：背板、滑入、Escape、body 滚动锁、背板关闭全由 drawer 承担，适配层只补上调用点必需的模态契约（焦点作用域＝进入面板/循环/归还、`data-focus-scope`、`data-sheet-*` 钩子、`w-72 p-6` 默认面）。外壳移动导航与任务编辑器现均经 `Drawer` 渲染面板；`data-shell-mobile-focus-viewport`、`data-shell-mobile-scroll`、`data-sheet-open` 钩子与移动端焦点视口保留。之所以仍是适配层而非直接调用：`Drawer` 的 props 止于 `open/onOpenChange/side/className/ariaLabel`，调用方无法触及面板元素，焦点作用域与这些钩子只能挂在它的 children 上，散在三处会重复同一份契约。回归断言：`test/unit/workspace-shell.test.tsx`「closes the mobile drawer on Escape and on its backdrop, handing focus back to the trigger」。
- **I4 结论：不替换，保留手搓 composer**（原因写在 `frontend/pages/agent-page.tsx` 的输入区上方）。`@beui/prompt-input` 能承载草稿问题（`value`/`onValueChange`，`id="agent-question"` 经 textarea props 透传，标签关联与两套测试驱动方式都成立）、来源范围控件（本就在组件之外）、写阻断守卫（`disabled`，`app.tsx` 内的 `locked()` 不变）与未知结果恢复路径（`AGENT_INTENT_UNKNOWN` 面板与草稿持久化由路由持有，与输入组件无关）。**不能承载的是提交/取消面**：其发送/停止是纯图标按钮，无障碍名是硬编码英文 `"Send prompt"`／`"Stop generating"`，且 props 无覆盖口（`placeholder`/`aria-label` 只作用于 textarea），采用即让 `AGENT_SUBMIT`（“Ask”/「提问」）与 `AGENT_STOP`（“Stop”/「停止生成」）在这一面失效、中文用户读到英文控件名——违反「保留每个 aria-label 与 i18n key」的判据。安装层面另有两处不匹配：`npx shadcn@latest add @beui/prompt-input` 在本仓库定位不到项目（`frontend/` 无 manifest），实测在 `frontend/next-app/` 生成了一整套 Next.js 脚手架而非落组件；其 payload 还会覆盖 4 个已定制的已安装件（`motion/select.tsx` 的 phosphor 图标改造、`lib/ease.ts`、`lib/utils.ts`、`motion/button/base.tsx`）并新增项目未使用、`components.json` 亦未声明的 `lucide-react`。**已撤销**：脚手架目录已删，仓库树与安装前逐文件哈希一致（`npx shadcn@latest view @beui/prompt-input` 只读校验 slug 与 payload 成功）。

## I5／I6 处理结果（2026-10-17 评估）

判据与 I4 相同：读 registry 权威 payload（`npx shadcn@latest view @beui/command-palette`、`@beui/animated-sidebar`，并取 `https://beui.dev/r/<slug>.json` 的完整 `files[].content` 逐行核对，下文行号即该 payload 的行号），再逐条对照「本仓库现有代码必须保留的保证」。结论：**两个组件都不采用**——各自都有关键保证落在它的公开接口之外，按下述证据保留现有实现（两个组件文件均未改动，未新增文件与依赖，树内无 `frontend/next-app/`）。

### I5 命令面板：不替换（`@beui/command-palette`），保留手搓面板

1. **每条命令的稳定钩子 `data-command-id` 无法承载（决定性）**。payload 自己渲染行按钮，只给 `id={\`${uid}-opt-${idx}\`}`（索引）、`role="option"`、`aria-selected`、`data-index`（payload `components/motion/command-palette.tsx:295-303`），其 `CommandItem` 类型只有 `id/label/group/hint/keywords/icon/badge/onSelect`（同文件 `:24-36`），没有任何属性透传口。现状把 `data-command-id={command.id}` 写在行上（`frontend/components/shell/command-palette.tsx:99`），外壳套件正是按它选行：`test/unit/workspace-shell.test.tsx:90`（`[data-command-id="toggle-theme"]`）、`:98`（`open-settings`）、`:113`（`logout`）。要保留只能在 payload 的行渲染器里加口子——比本仓库既有适配层更深地 fork 其内部（`ui/sheet.tsx` 只在 children 上组合 `drawer`，不改其内部）。
2. **Enter 的键盘语义相反**。payload 把 `onKeyDown` 挂在面板容器上（`:237`），Enter 分支无条件 `e.preventDefault()` 再执行 `rows[active].onSelect()`（`:153-166`）——行按钮按 Enter 时事件冒泡到容器，默认行为被阻止，且执行的是「光标行」而非「焦点行」。现有代码有一条专门的守卫 `if (event.target !== inputRef.current) return`（`command-palette.tsx:92`），正是让行按钮保留原生激活；回归断言 `test/unit/workspace-shell.test.tsx:99-107` 要求 `enter.defaultPrevented === false` 且 `onNavigate` 未被调用。
3. **模态焦点契约与它冲突**。现有面板经 `ui/dialog.tsx:20` 的 `useFocusScope` 渲染：进入面板取首个可聚焦元素（`ui/focus-scope.tsx:17-19`）、Tab 循环（`:23-40`）、关闭归还焦点（`:42`），并暴露 `data-focus-scope`（`ui/dialog.tsx:35`）。payload 只把两层 overlay portal 到 body（`:187-266`），仅用 rAF 聚焦输入框（`:149`），**没有焦点陷阱、没有焦点归还**，也没有这套钩子。
4. **无障碍名退回英文硬编码**。payload 的背板 / 面板 / 列表分别硬编码 `"Close command palette"`（`:194`）、`"Command palette"`（`:222`）、`"Commands"`（`:273`），且无覆盖口；现状是 `SHELL_COMMAND_PALETTE`（`command-palette.tsx:97,98`；`frontend/lib/i18n.ts:654` / `:2672`，「命令面板」）与 `SHELL_COMMAND_PLACEHOLDER`。采用即让中文用户在这一面读到英文控件名，与 I4 的判据同类。
5. **检索语义与既有模型测试绑定**。payload 用 `lib/command-search.ts` 的模糊打分+分组（会重排），现有 `filterCommands` 是「id / label key / 本地化关键词、大小写不敏感、保序」，由 `test/unit/command-palette.test.ts:11-20` 直接断言；替换会让 `frontend/lib/command-palette.ts` 的 `filterCommands` 沦为死代码（测试仍在断言它），并丢掉 `SHELL_COMMAND_EMPTY` / `NAVIGATE` / `EXECUTE` / `CLOSE` 的呈现面（`command-palette.tsx:98,101`）。
6. **安装层面**：payload 声明并使用 `lucide-react`（依赖表 + `:5`），本仓库用 `@phosphor-icons/react`、无该依赖；payload 还带 `lib/ease.ts`、`lib/utils.ts`，会覆盖 `frontend/lib/ease.ts`——本仓库这份在 `SPRING_GLIDE` 里多一个 `type: "spring"`（payload 版缺失，逐行 diff 已验证），覆盖即回退该修正。

### I6 侧栏：不替换（`@beui/animated-sidebar`），保留手搓外壳

1. **行级测试钩子无法承载（决定性）**。桌面栏每行在包装元素上带 `data-nav-node` / `data-nav-depth` / `data-nav-availability`（`frontend/components/shell/app-shell.tsx:181`），行本身是带 `data-route-id` 的锚点（`:179`）。payload 的行部件是封闭 props 工厂：`AnimatedSidebarMenuButtonProps`（payload `components/motion/animated-sidebar.tsx:1013-1025`）与 `AnimatedSidebarMenuSubButtonProps`（`:921-931`）都没有属性透传，渲染出的 `motion.a` / `motion.button`（`:1139` / `:1160`、`:981` / `:999`）因此挂不上 `data-route-id`；套件正是按这些属性解析侧栏：`test/unit/frontend-shell.test.tsx:103-110`（逐行 `{depth, routeId}` 全量比对）、`test/unit/workspace-shell.test.tsx:222-235`。
2. **它会重新引入第二份面板实现（决定性）**。payload 自带移动端面板：portal 到 body 的 `role="dialog"`（`:381-470`，背板硬编码 `aria-label="Close sidebar"` `:390`），自带 body 滚动锁、Tab 陷阱与焦点归还，且 provider 在移动端**把 children 换成它自己的面板**（`:523`，断点 `(max-width: 767px)` `:42`）。本轮 I2 刚把面板收敛到唯一原语 `ui/sheet.tsx`（`frontend/components/ui/sheet.tsx:40` 的焦点作用域与 `data-sheet-*` 钩子，底层 `motion/drawer`），外壳移动抽屉的断言全走这条通道：`workspace-shell.test.tsx:190-235`（`[data-sheet-open] summary`、`data-shell-mobile-focus-viewport`、`data-shell-mobile-scroll`、背板关闭后焦点回到摘要）。采用 animated-sidebar 即让这条通道与它的 portal 面板并存；而移动分支由组件内部 matchMedia 决定、portal 落在 `document.body`，外层 `hidden` 抑制不掉，无法「只取桌面栏」。
3. **布局 / 断点契约不同**。payload 在 flex 包装 `div[data-slot="sidebar-wrapper"]`（`:286`）内以固定宽度动画、`md`（768px）切换，`aside` 为 `h-auto … md:block`（`:552`）；本外壳是 `fixed inset-y-0 … lg:block`（1024px）的栏加内容 `lg:pl-64` 补白（`app-shell.tsx:109`、`:126`），并被 SSR 断言固定：`frontend-shell.test.tsx:44-58`（`data-shell-root`、`lg:h-dvh`、`lg:overflow-hidden`、`data-shell-sidebar-scroll` 的类串、`data-shell-content-scroll`）。
4. **每组两个控件与「即将推出」呈现会变**。现状每个有子项的组是「行按钮 + 独立 caret 按钮」，caret 自带 `aria-expanded` 与 `aria-label`＝「标签 + collapse|expand」（`app-shell.tsx:181`），不可用目的地是 `aria-disabled` 按钮 + `NAV_COMING_SOON` 徽标（`:176`）。payload 把 caret 合进行内（`:1111-1123`）、折叠时隐藏徽标（`:1106`），且在折叠态选中带 `ariaExpanded` 的组会**把整条栏展开**（`:1063`）——与外壳「折叠态保 `sr-only` 标签、隐藏 caret」的行为不同。
5. **安装层面**：同样需要 `lucide-react`（依赖表 + 顶部 import），并会覆盖 `frontend/lib/ease.ts` 与 `components/motion/shared-layout-bg.tsx`（已安装件与 payload 版仅 import 说明符不同，diff 已验证；`ease.ts` 缺 `type: "spring"` 同上）。

因此 `frontend/components/shell/command-palette.tsx` 与 `frontend/components/shell/app-shell.tsx` 本次**未改动**（`git status --short` 只显示本文件与 I8 兄弟任务的文件），两个 slug 的「已安装说明」保持原样（手搓面被登记为本轮的唯一例外，理由如上）。验证：`npm run typecheck` 通过；`npx vitest run test/unit/command-palette.test.ts test/unit/workspace-shell.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-shell-notifications.test.tsx test/unit/frontend-focus-scope.test.tsx` → 5 文件 / 68 测试全绿。遗留（非本轮范围）：面板自身的模态焦点契约（`data-focus-scope`、「关闭后焦点归还触发按钮」）目前只有 `ui/dialog`/`ui/sheet` 层面的单测，面板层没有专门断言——若担心将来有人再换这块，可补一条。

## I8 处理结果（2026-10-17 修复）

- **I8 已修复**：`frontend/components/admin/maintenance-status-panel.tsx` 的非 ready 分支拆成两支。`MAINTENANCE_CONTROL_UNAVAILABLE`（`frontend/lib/admin-maintenance-data.ts:30` 的 `maintenanceControlDisabled`）映射的 `disabled` 态是**永久性配置缺失**，不再渲染 `COMMON_RETRY` 按钮；改为在原有 `role="alert"` / `data-maintenance-control="unavailable"` 容器内补 `data-maintenance-not-configured` 说明（点名缺失的 `MAINTENANCE_CONTROL_TOKEN` Worker secret）与 `data-maintenance-runbook` 链接（模块级常量，注释里记下它在仓库内的同一份文件路径）。新 i18n 键 `ADMIN_MAINTENANCE_DISABLED_RUNBOOK` / `ADMIN_MAINTENANCE_RUNBOOK_LINK` 在 en 与 zh-CN 各一份，parity 由 `npm run verify:i18n` 保证。真正瞬态的读失败（其他错误码）仍走 `error` 分支，保留「重试」按钮，行为不变。
- **503 语义与只读行为不变**：`GET /api/admin/maintenance/status` 仍以 `503 MAINTENANCE_CONTROL_UNAVAILABLE` 表达未配置；该态无任何控件、不发 POST（回归断言里 GET 恰 1 次、非 GET 0 次），也不自动重试。`ready` 态（阶段/epoch/窗口/许可、容量与容量不可读、`data-maintenance-read-only`、排空横幅）未改动，其原有用例全绿。该组件本就是只读面，没有排空/恢复表单（`ADMIN_MAINTENANCE_CONTROL_*` / `BEGIN_DRAIN` / `RESUME` 这些键在 `frontend/` 内无调用点，只有构建产物残留），所以本次改动不触及任何写路径。
- **指向的运维文档**：`docs/operations/evidence/2026-09-22-r14-production-activation-preflight.md`「生产激活顺序」第 2 步（在 Cloudflare Worker 生产环境配置 `MAINTENANCE_CONTROL_TOKEN`，`:16`）。之所以不指向 `docs/operations/production-environment-handbook.md`：该手册 §2 的 secret 表（`:36-46`）与 §7 的 bundle 都还没列这个令牌，指向它会变成第二个死指针。链接用 `blob/HEAD` 形式，避免分支改名后失效。
- 回归断言：`test/unit/frontend-admin-maintenance.test.tsx`「offers no retry for the permanent not-configured state, and explains the missing token and its runbook」（无 button、无 “Try again”、点名令牌、href 到该预检文档）与「keeps the retry for a transient read failure」。验证：`npx vitest run test/unit/frontend-admin-maintenance.test.tsx`（6 passed）、`npm run typecheck`、`npm run verify:i18n` 全绿。未新增 operation 身份，未改 ledger 文件，未重新生成 `docs/product/frontend-operation-inventory.*`。

## I3／M2 处理结果（2026-10-17 移动端轻筛选）

**I3 用哪个 primitive，以及为什么**：先按要求核对已安装件能否表达 bottom sheet——`frontend/components/motion/drawer.tsx:20` 的 `side?: "left" | "right"` 只到左右，面板 `fixed inset-y-0`（`:97`）、动画只有 `x`（`:104`），`ui/sheet.tsx` 也只是它的适配层：**drawer 不能表达从底边升起的表面**。按契约安装 beUI `bottom-sheet`（registry `https://beui.dev/r/bottom-sheet.json` → `frontend/components/motion/bottom-sheet.tsx`，逐字落地，只把 `@/lib/*` 改成本仓库相对路径；payload 里的 `lib/ease.ts`、`lib/presence-gate.tsx`、`lib/touch.ts`、`lib/utils.ts` 本仓库已有同一份实现，未覆盖、未新增运行时依赖）。

它**不是第二个面板实现**：`frontend/components/ui/sheet.tsx` 的 `SheetContent` 新增 `side="bottom"` 分支，焦点作用域（进入面板 / Tab 循环 / 归还）、`data-focus-scope`、`data-sheet-content`、`data-side`、`data-sheet-open`、Escape、背板关闭、body 滚动锁仍只在适配层这一处；侧面板继续走 `Drawer`。`bottom-sheet` 只在自身挂载 effect 之后才 portal，所以适配层用跟随 `open` 的 `bottomReady` 让焦点作用域在同一个提交里就位（`open` 时重新 arm、关闭时 disarm，面板每次打开都是重挂载），否则「首次 open 时 effect 已跑完、节点还没出现」会让焦点停在页面。

**移动端判定与采纳面**：新增 `frontend/components/ui/filter-disclosure.tsx`，复用 `frontend/lib/list-mode.ts` 的 `(min-width: 1024px)` 断点（与表格移动表面同一条边），桌面分支 `return <>{row(rowClassName)}</>`——同一元素、同一类名、同一子节点、无包裹层；低于 `lg` 时该行移入一个带标题的 bottom sheet，页面上只留一个 44px 的 disclosure（`data-filter-disclosure-trigger`、`aria-haspopup="dialog"`、`aria-expanded`，标签 `COMMON_FILTERS`）。已应用 chips 留在面板之外（面板打开时仍可见、仍可单独移除），触发器只带一个 `aria-hidden` 计数徽章。

| 入口 | 行内容 | 处理 |
| --- | --- | --- |
| `/search` | 类型 / 作者 / 发布日期起止 | 行是 `<form>`，经 `renderRow` 在两个表面都渲染该 form 元素（提交按钮只有待在 form 内才会提交，因此不能只把控件 portal 出去）；提交成功后面板自动关闭，草稿被拒时保留面板以显示其 `role="alert"`（`commitFilters` 现在返回是否提交成功） |
| `/tasks` | 搜索 / 状态 / 优先级 / 标签 / 截止 | 移入面板 |
| `/notifications` | 已读 / 类型 +「标记可见已读」 | 移入面板（该按钮的处理函数未变） |
| `/graph` | 查询 / 视角 / 时间范围 / 变更类型 | `CardContent` 留在卡片内，行移入面板 |
| `/inbox` | 仅状态 | **保持行内**：只有一个控件，藏进面板只是多一次点击；M2 对该页只要求点按尺寸 |

面板体 `min-h-[20rem]`（`data-filter-sheet-body`）：beUI 的 select 把 listbox 用 `absolute` 挂在触发器下（`frontend/components/motion/select.tsx:397`），在 sheet 的 `overflow-y-auto` 里会被裁切——预留带高于这些行最长的一份列表（六项），配合组件自身的上下翻转，每个下拉都能完整显示。

**M2 点按尺寸**：规则放在共享件上，不逐调用点重复。`frontend/components/motion/select.tsx` 的触发器基类加 `max-lg:min-h-11`（覆盖全部 `FilterSelect` 调用点，以及 `/agent` 来源范围这类直接用 select 的触发体）；`ui/applied-filters.tsx` 的 chip、移除 `×`、清除全部；`ui/tabs.tsx` 与 `ui/expandable-tabs.tsx` 的触发体；`/search` 的提交与「应用筛选」按钮；`/tasks`、`/notifications`、`/graph` 的行内控件由上述共享件覆盖。

**实测（真实 Chromium，前 → 后）**：

| 控件（class 来源） | 390×844 前 | 390×844 后 | 1440×900 |
| --- | ---: | ---: | ---: |
| `FilterSelect` 触发体（`h-9`） | 36px | **44px** | 36px（未变） |
| 该筛选行 | 36px | **44px** | 36px（未变） |
| `AppliedFilters` chip | 26px | **54px** | 26px（未变） |
| chip 的移除 `×` | 16×8px | **44×44px** | 16×8px（未变） |
| 清除全部（`size="sm"`） | 32px | **44px** | 32px（未变） |
| 新 disclosure 触发体 | — | **44px**（宽 358px = 整行） | 不渲染 |
| 行内 `Input`（`ui/input.tsx` 已是 `h-11`） | 44px | 44px | 44px |
| `/search` 提交与「应用筛选」（`size="md"`） | 40px | **44px** | 40px（未变） |
| `ui/tabs` 触发体 | 32px | **44px** | 32px（未变） |
| `expandable-tabs` 触发体 | 40px | **44px** | 40px（未变） |

**怎么量的**：用本工作树的 Tailwind v4.3.3 CLI 把 `frontend/styles/globals.css` 编译到临时文件，确认新增声明只落在 `@media (width < 64rem)` 内（`.max-lg\:min-h-11{min-height:calc(var(--spacing) * 11)}`、`.max-lg\:h-11`、`.max-lg\:min-w-11`、`.max-lg\:w-full`；页面内 `--spacing: 0.25rem` ⇒ 11×0.25rem = 44px）；把各组件的 class 列表逐字取自源码写进临时 HTML，在真实 Chromium（Chrome for Testing 1208，headless）里 `emulate` 到 390×844 / 1440×900，读 `getBoundingClientRect().height` 与 `getComputedStyle().minHeight`，并用 `matchMedia("(width < 64rem)").matches`（390 为 true、1440 为 false）核对命中的分支。§3 的 M2 记的 32px 对应 `size="sm"` 的按钮；`FilterSelect` 触发体在改动前的实测值是 36px（`h-9`）。

**回归断言**：`test/unit/frontend-mobile-filters.test.tsx`（4 passed）——桌面不出现 disclosure 且行类名不变；disclosure 打开后 `role="dialog"` 由可见标题命名、`data-sheet-content[data-side="bottom"]` 与 `data-focus-scope` 在位、焦点落入面板、`body` 滚动锁生效；Escape 关闭并把焦点交回触发器；面板打开时 chips 仍在面板之外且可移除；`/search` 从面板内提交成功即关闭面板，草稿被拒则保留面板与告警。既有套件：`npx vitest run` 25 文件 / 544 测试（tasks、graph、search、notifications、inbox、knowledge-reader、a11y、list-filters、tabs、workspace-shell、mobile-filters）与 57 文件 / 884 测试（admin、knowledge、my-submissions、environments、i18n、workbench-maturity-routes）全绿；`npm run typecheck` 全绿。

**依赖的 operation 身份（未改 ledger 文件）**：`workbench-search`（KB-007）、`workbench-tasks`（TSK-001／TSK-002）、`workbench-notifications`（NTF-001／NTF-003／NTF-004，其中 `POST /api/notifications/read`「标记可见已读」随行进入面板，处理函数与幂等未变）、`workbench-graph`（WB-GR-001）、`workbench-inbox`（状态筛选留在行内；`PATCH /api/inbox/:id` 属行内动作，未受影响）、`workbench-admin-*`（共享 `FilterSelect` 的队列筛选继承移动端尺寸，行为未变）。

**边界**：① 同属 M2 的 `/goals`、`/projects` 行内动作与 `/settings` 主题三连（`size="sm"` = 32px）不在本次文件范围，未改；② beUI `bottom-sheet` 的背板名是 registry 里硬编码的英文 `"Close bottom sheet"`（与既装 `drawer` 的 `"Close"` 同源，未 fork payload）；③ 本次新增 2 个源文件（`frontend/components/motion/bottom-sheet.tsx`、`frontend/components/ui/filter-disclosure.tsx`）与 1 个 key（`COMMON_FILTERS`，两语言），`docs/product/frontend-operation-inventory.*` 需由持有者重新生成；本轮未跑 build/deploy。
