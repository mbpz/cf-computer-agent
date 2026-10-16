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
| I8 | `/admin` 维护控制只读区在**永久性**配置缺失下仍提供「重试」 | 线上：该区文案为「本实例未启用维护控制（未配置控制令牌）…本区域保持只读」，`/api/admin/maintenance/status` 稳定 `503`（重试三次皆 503，概览其余 5 个请求全 `200`） | 配置类原因不给「重试」，改为说明「如何在运维手册中启用控制令牌」并链接运维文档；`503` 仍是正确语义 | 小 |

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

**M2（低于移动建议值）**：多处筛选/切换触发体实测 **32px**——`/search` 类型、`/agent` 来源范围、`/tasks` 状态、`/inbox` 状态、`/graph` 视角与时间范围、`/notifications` 两组筛选、`/goals` 与 `/projects` 行内动作、`/settings` 主题。满足 24px 下限，低于移动端常用的 44px 建议；建议移动断点下提升到 44px 或扩大热区。

### 4.2 深色主题（8 页实拍）

判据：`prefers-color-scheme: dark` + 应用主题「跟随系统」。结果：`html.dark` 生效，`--background: oklch(0.17 0.02 255)`、`--foreground: oklch(0.93 0.01 255)`，`<meta name="color-scheme" content="light dark">` 存在，截图无浅色残留。

### 4.3 本节边界

未做 320/768/1280 三档视口、英文（`en`）文案长度对移动端筛选行与表格的影响、深色下的全部 33 页与对比度审计。

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
