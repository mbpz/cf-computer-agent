# 有头真 Chrome 全路由渲染/报错扫描（本地）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `8aa25e870927ca1f3ef58187ebaba5a4c730e7b9`（本地，领先 origin 4 个提交，**未推送**）。

## 范围与结论边界

本记录如实登记一次**有头真 Chrome（macOS）经 CDP** 驱动的**全路由原生渲染/报错扫描**：对应用当前 **28 条路由**逐条 `page.goto` 后约 **1.4 s** 沉降，然后实测 `[data-route-id]` 存在性、`main` 区域存在性、页面正文与控制台条目（每次测量前 `clearConsole()`）。

**结论：本轮未发现缺陷。** 28 条路由**全部**渲染出带真实正文的 `main` 区域；每条均报告 `loading: false`、`denied: false`、`errorish: false`，且 **0 条控制台 error/warn 条目**。**没有**任何路由为空屏、卡死、拒绝或控制台报错。

**本记录不构成任何验收**：会话是**合成本地会话**（非真实身份），本地透传代理只是**测试 harness（非产品代码）**，浏览器是 **`--user-data-dir` 隔离在 `/tmp`** 的有头 Chrome。**未 push、未部署、未 `wrangler ... --remote`、未远程迁移 D1、未写入 secrets**。

**明确范围限制（重要）**：本扫描是**只读渲染/报错扫描**——按路由**加载并观察渲染**，**不操作**任何按钮、对话框、表单或写入路径（**未执行任何变更/交互**）。因此它**不覆盖路由级“操作”能力**，`A01`（全部可见操作枚举）与 `A02`（每个操作绑定 handler/API/授权/持久化/测试证据）**仍然开放**。

## 本地栈（精确）

- `wrangler dev` 监听 `127.0.0.1:8787`（本地栈）。
- 本机通过验收工具箱注入**合成本地 ADMIN 会话**（**不是真实账户/身份**）。
- 本地**透传代理**监听 `127.0.0.1:8791`，转发至 `:8787` 并注入 `__Host-memory-session` cookie；该代理**仅为本地 harness，非产品组件**。
- 有头真 Chrome 经 **CDP** 连接该代理，`--user-data-dir` 隔离在**独立 `/tmp`**（**非用户日常浏览器**）；窗口 **1280×900**。
- 每条路由：`page.goto` → 约 **1.4 s** 沉降 → `clearConsole()` 后测量 `[data-route-id]`、`main`、页面正文与控制台条目。

**导航路由 id 覆盖**：每条路由上均存在 **21 个**导航路由 id：home、knowledge、submit、my-submissions、inbox、goals、projects、calendar、today、focus、review、environments、graph、admin、admin-submissions、admin-assets、admin-duplicates、tasks、boards、notifications、messages。

## 逐路由实测（28 条）

所有路由：`main` 渲染 ✓、控制台 error/warn **0**、`loading: false`、`denied: false`、`errorish: false`。下表“首屏副本样本”为**实测正文的截断摘录**。

| # | 路由 | `main` 渲染 | 控制台条目 | 首屏副本样本（截断） |
| ---: | --- | --- | ---: | --- |
| 1 | `/` | ✓ | 0 | `个人工作台 你的工作台 在一个私有工作台中规划、理解并推进工作。 打开知识采集 …` |
| 2 | `/knowledge` | ✓ | 0 | `已发布知识 每条可信知识的最新可见修订。 回顾清单 … 此周期没有需要处理的知识。` |
| 3 | `/submit` | ✓ | 0 | `提交知识 添加有边界、可审核的知识条目。 新建提交 标题 格式 内容 Markdown 代码 Markdown 添加文件 尚未配置对象存储；…` |
| 4 | `/my-submissions` | ✓ | 0 | `我的提交 跟踪审核和重新提交状态。 还没有提交。 总计 0 · 当前显示 0–0 每页行数 20 50 100` |
| 5 | `/inbox` | ✓ | 0 | `收集箱 先收集零散想法、链接和参考内容… 仅自己可见 快速收集 … 收集状态 全部状态 待整理` |
| 6 | `/goals` | ✓ | 0 | `目标 把方向拆成每天都能推进… 仅自己可见 创建目标 添加目标 还没有目标 总计 0 …` |
| 7 | `/projects` | ✓ | 0 | `项目 把目标和任务聚合到… 创建项目 添加项目 还没有项目 总计 0 …` |
| 8 | `/calendar` | ✓ | 0 | `日历 把私人日程和专注时间块放进同一个工作节奏里。 仅自己可见 按本地时区选择，范围最长 31 天… Asia/Sha…` |
| 9 | `/today` | ✓ | 0 | `今日 只展示当前真正需要关注的工作。 · 2026-10-11 UTC 0 未完成任务 0 今日安排 0 待处理收件箱 0 进行中项目 快照…` |
| 10 | `/focus` | ✓ | 0 | `专注 同一时间只保持一个私有专注会话。 开始专注 选择任务 开始专注` |
| 11 | `/review` | ✓ | 0 | `复盘 把近期工作整理成私有的下一步视图。 · 2026-10-11 刷新复盘 每日 每周 0 已完成 0 已逾期 0 已阻塞 0 专注分钟…` |
| 12 | `/graph` | ✓ | 0 | `工作图 探索你的知识与日常工作之间的私有关系。 0 个对象 图谱视角 全部工作区 知识 工作 全部时间 最近 7 天 …` |
| 13 | `/tasks` | ✓ | 0 | `任务 管理仅属于你的工作事项。 新建任务 状态 todo doing blocked done canceled 优先级 low mediu…` |
| 14 | `/boards` | ✓ | 0 | `看板 按当前工作流推进仅属于你的任务。 待办 0 此列暂无任务 总计 0 · 当前显示 0–0 每页行数 20 50 100 进行中 …` |
| 15 | `/notifications` | ✓ | 0 | `通知 查看仅属于当前工作区账号的更新。 未读 0 全部 未读 已读 全部 任务状态已变更 …` |
| 16 | `/messages` | ✓ | 0 | `消息 查看当前有权访问的任务和知识上下文讨论。 暂无上下文讨论 第 1 页 每页行数 20 50 上一页 下一页` |
| 17 | `/environments` | ✓ | 0 | `Linux 环境 管理你的环境记录。VM 启动、终端和本地存储尚未接入；本页不会启动 VM 或自动联网。 创建环境 名称 类型 个人环境 临…` |
| 18 | `/admin` | ✓ | 0 | `治理中心 管理后台 在不绕过服务器授权的前提下管理工作区。 刷新计数 工作区当前总数，分别读取自已授权列表；不按站点访问日期筛选。 审核队列…` |
| 19 | `/admin/submissions` | ✓ | 0 | `审核队列 在发布前审核提交内容。 暂无待审核提交。 … 总计 0 · 当前显示 0–0 每页行数 20 50 100` |
| 20 | `/admin/assets` | ✓ | 0 | `资产队列 查看解析状态、警告和预览。 Status All queued processing succeeded failed_retry` |
| 21 | `/admin/duplicates` | ✓ | 0 | `重复候选 管理员可处理完全重复提交；贡献者不会看到候选正文。 暂无待处理的重复候选。 …` |
| 22 | `/admin/members` | ✓ | 0 | `成员 管理贡献者访问权限；Worker 是最终授权来源。 Status All Active Disabled acceptance-adm…` |
| 23 | `/admin/roles` | ✓ | 0 | `治理中心 角色与权限 使用有界权限矩阵查看和调整角色访问范围。 角色列表 Administrator 1 名成员 系统 Contributo…` |
| 24 | `/admin/menus` | ✓ | 0 | `治理中心 菜单树 查看导航层级，并安全调整自定义菜单项。 创建菜单 导航层级 SHELL_GROUP_WORKSPACE workspace…` |
| 25 | `/admin/spaces` | ✓ | 0 | `空间与集合 保持知识边界明确且可审核。 创建空间 Default default 编辑空间: Default 创建集合: Default 集…` |
| 26 | `/admin/audit` | ✓ | 0 | `审计日志 该工作区的不可变治理事件。 Action All member.login member.identity_linked memb…` |
| 27 | `/admin/analytics` | ✓ | 0 | `治理中心 站点访问统计 查看选定周期内的隐私优先访问量与登录成员聚合数据。 统计时间范围 最近 7 天 最近 14 天 最近 30 天 刷新…` |
| 28 | `/settings` | ✓ | 0 | `个人工作台 设置 管理工作区偏好设置。 账号 当前工作区身份信息。 邮箱 acceptance-admin@example.invalid …` |

## 解读

**解读（如实登记）**：真实有头 Chrome 在本地合成管理会话下，应用当前 **28 条路由**均**成功渲染**并给出符合该路由语义的**真实正文**；**无**空屏/卡死/拒绝/控制台报错路由；**无缺陷**。本扫描为**只读渲染/报错扫描**，**未**操作任何按钮/对话框/写入路径，因此**路由级操作覆盖未被验证**。

## 明确非声明

- 会话为**合成本地会话**（合成 ADMIN 会话），**不是真实身份/账户**；透传代理**只是本地本地 harness，不是产品代码**；浏览器为**独立 `/tmp` profile 隔离的有头 Chrome**，**非用户日常浏览器**。
- 本记录**不是** A01/A02/D05/D06/D04 任何验收：**不**证明真实成员/权限旅程，**不**替代目标桌面浏览器上的真实登录验收，**不**证明隐藏的操作（按钮/对话框/变更）行为。
- 本记录是**只读渲染/报错扫描**：**路由级操作覆盖（按钮/对话框/写入）未被本扫描执行**，故 `A01`/`A02` **保持开放**。
- **不改变任何计数**：功能清单父项 **29 在范围内 / 5 已关闭 / 24 开放**（D08 排除）不变，**未翻转任何 checkbox**。
- **未发布、未部署、未 push、未远程迁移**。

## 与同批记录的边界

本扫描与同批的 **`2026-10-11-native-matrix-evidence.md`（4×2×2 视口/主题/语言矩阵）**、**`2026-10-11-multi-member-isolation-sweep-evidence.md`（多成员授权/隔离扫描）** 互为补充：三者均是**合成本地会话**下的原生观察，**均不构成 D05/D06/D04 验收**，也**均不覆盖路由级操作**。

## 同一轮发现并修复：菜单 Escape 关闭缺口（macOS 点击打开）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `65d5fcbde187711f2d660de734072da6516e256c`（本地，**未推送**）。本增量记录同一轮有头真 Chrome（macOS）原生交互测试中**发现并修复**的一个可访问性缺陷。

### 原生观察

在有头真 Chrome（macOS、`--user-data-dir` 隔离 `/tmp`、1280×900、合成本地会话）中，用**鼠标点击**打开外壳的**语言菜单**（`menuId="language"`）后：触发按钮 `aria-expanded="true"`、`[role="menu"]` 可见。按下 **`Escape`** 后：`aria-expanded` **仍为 `true`**、`[role="menu"]` **仍可见** —— **未被关闭**。而用**外部指针点击**（`pointerdown` 落在菜单之外）**可以**关闭它。对照：命令面板（command palette）同一情境下 **`Escape` 可关闭**。

### 已核验的根因（源码）

`Escape` 当时**仅**由包装层的 React `onKeyDown`（`frontend/components/ui/dropdown-menu.tsx` 中 `DropdownMenu` 包装 `<div data-menu-id=… onKeyDown={handleKeyDown}>`）与 `DropdownMenuContent` 自身的 keydown handler 处理。在 macOS 上，**点击 `<button>` 不会把焦点移给它**，因此焦点**停留在 `document.body`**；`Escape` 的 keydown **不会经过**包装层，两个 handler 均不触发 → 菜单不关闭。

### 修复

`frontend/components/ui/dropdown-menu.tsx`（`DropdownMenu`，既有 outside-dismiss effect 内，第 65–74 行新增 handler；第 79、84 行注册/注销）：在菜单 `open` 期间新增 **`document` 级 `keydown` 监听**，忽略 `event.defaultPrevented` 与非 `Escape` 键，命中后调用既有 `setOpen(false, "escape")`（其内部已将焦点还原到触发按钮）；菜单关闭/清理时移除监听。既有的 **Enter/Space/Arrow/Home/End 行为、键盘打开时的焦点移动、outside-dismiss 语义、受控/非受控 API 均未改动**。

**为什么不会重复处理**：包装层/内容 handler 命中 `Escape` 时调用 `event.preventDefault()`；本 `document` 监听通过 `defaultPrevented` 检查观察到此标记后直接返回，因此同一 keydown 不会被消费两次。真实浏览器中原生 keydown 是 **cancelable** 的，故 `preventDefault()` 会正确置位 `defaultPrevented`。

### 回归断言（`test/unit/frontend-menu-keyboard.test.tsx`，新增 4 条）

- **(a) macOS 点击打开**：焦点置于 `document.body`、以鼠标 `click()` 打开菜单，再在 `document` 上派发 `Escape` → 菜单关闭（`[role="menu"]` 为 `null`）、焦点回到触发按钮。
- **(b) 焦点在内容内**（既有行为保持）：焦点在菜单项上派发 `Escape` → 关闭且焦点回到触发按钮，且 `onOpenChange` **恰好被调 2 次**（打开 1 + 关闭 1），证明未重复处理。
- **(c) 菜单已关闭时**：在 `document` 上派发 `Escape` → `onOpenChange` **未被调用**、无异常。
- **(d) 外壳账户菜单实例**：`AppShell` 渲染的账户菜单（`data-menu-id="account-desktop"`）鼠标打开后，`document` 上的 `Escape` 关闭之。

### 变异检测（mutation evidence）

对每条新断言，临时移除/破坏**新增的 document 监听**后运行聚焦测试文件，捕获原始失败，再**逐字节还原**（`diff` 与变异前副本一致，且 `git diff` 中无残留变异标记）。`+actual -expected` 摘录：

| 变异 | (a) macOS | (b) 焦点在内容内 | (c) 已关闭 | (d) 账户菜单 |
| --- | --- | --- | --- | --- |
| **M1** 移除 `document.addEventListener("keydown", dismissOnEscape)` 注册 | **RED**（菜单仍可见：`expected <div role="menu"> to be null`） | GREEN | GREEN | **RED**（`expected <div data-account-menu="true"> to be null`） |
| **M2** 去掉 `defaultPrevented` 守卫 | GREEN | **RED**（`expected vi.fn() to be called 2 times, but got 3 times` = 重复处理） | GREEN | GREEN |
| **M3** 去掉 effect 顶部 `if (!open) return;`（关闭态也注册监听） | GREEN | GREEN | **RED**（`expected vi.fn() to not be called at all, but actually been called 1 times`） | **RED** |

（M3 下 (d) 亦失败系副作用：关闭态监听在其他菜单上误触发。）**还原后** 聚焦文件 **21 passed / 0 failed**。

### 修复后原生确认

修复后，本地 dev server 提供重新构建的 bundle `/assets/index-BpYetGvB.js`，在有头 Chrome（CDP，相同本地栈/代理/合成 admin 会话）中复测：**语言菜单**点击后触发按钮 `aria-expanded="true"` 且可见 `[role="menu"]` 为 1，按 `Escape` 后语言触发按钮的 `aria-expanded` 消失（仅侧栏折叠开关仍为 `true`）、可见 `[role="menu"]` 为 **0**、`document.activeElement` 为 `BUTTON`（焦点回到触发按钮）；**账户菜单**（`账户菜单：acceptance-…`）点击后 `aria-expanded="true"` + 1 个可见菜单，按 `Escape` 后已关闭（`aria-expanded` 清除、0 个可见菜单、焦点在 `BUTTON`）。与上文**修复前**值（两菜单均保持打开；仅外部 `pointerdown` 可关闭）形成对照。

边界：仍为本地 harness 代理后的**合成本地会话**、独立 `/tmp` profile 的**有头 Chromium**；键盘/浮层行为**仅在本地验证**，**不是 A05/D05/D06/D04 验收**，**计数不变**，**未部署/未 push/未远程迁移**。

### 明确非声明

- 原生观察为**本地有头真 Chrome（macOS）+ 合成本地会话**；键盘/浮层行为**仅在本地验证**。
- 本增量**不是 A05/D05/D06/D04 任何验收**，**未翻转任何 checkbox**，**不改变任何计数**（功能清单父项 **29 在范围内 / 5 已关闭 / 24 开放**，D08 排除）。
- **未发布、未部署、未 push、未远程迁移**；改动保持**本地未提交**。
- 除该下拉菜单外**未触碰任何产品行为**（`migrations/` 无改动）。

### 弹层 Escape 巡检（有头，2026-10-11）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `e0d9111840e443b3cf5fb1ac1901a1ccc33c42f3`（本地，领先 origin 6 个提交，**未推送**）。本增量记录同一有头真 Chrome（macOS）原生交互轮次中的**弹层（overlay）Escape 关闭巡检**。

**方法**：有头真 Chrome 经 **CDP** 连接本地栈（`wrangler dev` :8787）+ 本地 harness 透传代理 :8791（注入合成 admin 会话），`--user-data-dir` 隔离独立 `/tmp` profile，窗口 **1280×900**。每条路由：`page.goto` → 约 **1.6 s** 沉降 → 点击指定控件 → 约 **0.7 s** → 按 **`Escape`** → 约 **0.6–0.7 s**；计数**可见**的 `[role='dialog'], [role='alertdialog'], dialog` 元素。

**逐条目实测（点击 → Escape 前后可见弹层数）**：

| 路由 | 控件 | 点击前 | 点击后 | Escape 后 | 判定 |
| --- | --- | ---: | ---: | ---: | --- |
| `/tasks` | `新建任务` | 0 | **1**（弹层标签 `新建任务`） | **0** | Escape **可关闭** ✓ |
| `/goals` | `添加目标` | 0 | 0 | 0 | **内联表单**，无弹层 |
| `/projects` | `添加项目` | 0 | 0 | 0 | **内联表单**，无弹层 |
| `/inbox` | `加入收集箱` | 0 | 0 | 0 | **内联表单**，无弹层 |
| `/calendar` | `添加日程` | 0 | 0 | 0 | **内联表单**，无弹层 |
| `/admin/menus` | `创建菜单` | 0 | 0 | 0 | **内联表单/面板**，无弹层 |
| `/admin/spaces` | `创建空间` | 0 | 0 | 0 | **内联表单/面板**，无弹层 |
| `/admin/roles` | `创建角色` | 0 | 0 | 0 | **内联表单/面板**，无弹层 |

可见输入框数（佐证为内联表单而非弹层）：tasks **6**、goals **3**、projects **3**、inbox **4**、calendar **6**。`/admin/members` **不存在** `添加成员` 按钮（点击目标缺失，未执行点击）。

**HYGIENE（零写入核验）**：整轮巡检结束后，本地 D1 计数**全为 0** —— `goals` 0、`projects` 0、`inbox_items` 0、`calendar_events` 0、`tasks` 0、`submissions` 0 —— 即该**只读巡检未写入任何数据**。

**解读（如实登记）**：本应用可被键盘关闭的弹层为**命令面板**（Escape ✓，早前已验）、**外壳账户/语言菜单**（Escape ✓ **在上述修复后**）以及 `/tasks` 的 `新建任务` 弹层（Escape ✓）；其余创建类 UI 均为**内联表单**，不存在弹层 Escape 语义，故无对应期望。本轮巡检**未发现新缺陷**。

**明确非声明**：

- 会话为本地 harness 代理后的**合成本地会话**、独立 `/tmp` profile 的**有头 Chromium**，**仅本地**；**不是 A05/A01/A02/D05/D06/D04 任何验收**。
- **不改变任何计数**：功能清单父项 **29 在范围内 / 5 已关闭 / 24 开放**（D08 排除）不变，**未翻转任何 checkbox**。
- **未部署/未 push/未远程迁移**；`migrations/` 无改动。

### 本地浏览器写入被同源守卫拒绝 + 错误态可恢复（2026-10-11）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `60c598ba55e203f31ebd5558b056257b3ed52d06`（本地，领先 origin 7 个提交，**未推送**）。本增量记录同一有头真 Chrome（macOS）经 CDP 的原生交互轮次中，对 `/tasks` 执行一次 **UI 写入旅程**的实测结果：写入被**同源（CSRF）守卫拒绝**，且因此触发的错误态**可恢复**。

**方法**：有头真 Chrome 经 **CDP** 连接本地栈（`wrangler dev` :8787）+ 本地 harness 透传代理 :8791（注入合成 admin 会话），`--user-data-dir` 隔离独立 `/tmp` profile，窗口 **1280×900**。

**实测（UI 写入尝试）**：在 `/tasks` 打开 `新建任务` 对话框，用键盘在 `任务标题` 字段填入标题并回车提交。对话框**关闭**，但任务**未被创建** —— 本地 D1 `tasks` 计数为 **0**；随后 `/tasks` 页面进入**加载错误态**：`role="alert"` 文案 `无法加载页面。重新搜索`，仅有一个 `重新搜索` 重试按钮（标题取自 `COMMON_UNABLE_TO_LOAD`，见 `frontend/pages/tasks/tasks-page.tsx:61`）。

**已核验根因（本地 dev-server 日志）**：`POST /api/tasks → 403 Forbidden`。这是应用的**同源（CSRF）守卫**：浏览器的 Origin 为本地 harness origin，而应用把规范 origin 钉在 `https://memory.crgmhrc.asia`（`src/config.ts:11`），不安全方法要求 `Origin: https://memory.crgmhrc.asia`。**该 403 是同源守卫，不是授权结论；本地 localhost origin 上的浏览器写入在设计上不可行。**

**已核验恢复**：点击页面的 `重新搜索` 重试会重新读取，页面恢复正常渲染（`任务 管理仅属于你的工作事项。 … 暂无任务 总计 0 · …`），且 `role="alert"` 消失 —— 即该错误态是**瞬时且可恢复**的。

**解读（如实登记）**：

- (a) 同源守卫约束**已在** `docs/product/2026-10-11-multi-member-isolation-sweep-evidence.md` 记录；本地写入覆盖因此来自**规范 `Origin` 的 HTTP 脚本**（`tools/acceptance/check-local-contributor-journey.mjs`，20/20）以及仓库的单元/DOM 批次 —— **原生 UI 写入旅程无法在本地执行**（除非以 HTTPS 路由规范 origin），故此处**不作任何声称**。
- (b) 写入返回 403 清空受保护列表，与项目既有的 **401/403 策略**一致；重试可恢复页面。
- (c) 对于**写入**被拒，错误文案是**通用的**（`COMMON_UNABLE_TO_LOAD` + `SEARCH_RETRY`）—— 登记为一条**待产品决策的观察**，本会话**刻意不改动**。

**明确非声明**：

- 会话为本地 harness 代理后的**合成本地会话**、独立 `/tmp` profile 的**有头 Chromium**，**仅本地**；**不是 A01/A02/A05/D05/D06/D04 任何验收**。
- **不改变任何计数**：功能清单父项 **29 在范围内 / 5 已关闭 / 24 开放**（D08 排除）不变，**未翻转任何 checkbox**。
- **未部署/未 push/未远程迁移**；`migrations/` 无改动。

### 本地原生 UI 写入旅程跑通（规范 origin HTTPS 前端，2026-10-11）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `88a864fd47494143140e67da41ab10bb0e69c275`（本地，领先 origin 8 个提交，**未推送**）。本节接续上一节：上一节记录 localhost origin 的写入被同源守卫拒绝；本轮**以规范 origin 的 HTTPS 前端**在本地跑通同一 `/tasks` 的**原生 UI 写入闭环**。

**方法（纯本地 harness，无仓库改动）**：

1. 为规范主机签发自签证书：`openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/mg-tls.key -out /tmp/mg-tls.crt -days 1 -subj "/CN=memory.crgmhrc.asia" -addext "subjectAltName=DNS:memory.crgmhrc.asia"`。
2. 在 `127.0.0.1:9443` 起本地 Bun HTTPS 前端，代理 `wrangler dev`（8787），注入合成会话 cookie **并把 `Origin` 头改写为 `https://memory.crgmhrc.asia`**（仅 harness；真实部署校验真实 Origin）。
3. 有头 Chrome 以 `--ignore-certificate-errors --no-proxy-server --host-resolver-rules="MAP memory.crgmhrc.asia:9443 127.0.0.1:9443"` 启动（`--no-proxy-server` 必需：系统代理会绕过映射，导致页面 `ERR_CONNECTION_CLOSED`）。

**为何需要**：应用把规范 origin 钉在 `https://memory.crgmhrc.asia`（`src/config.ts:11`），不安全方法要求同源 `Origin`，localhost origin 在设计上一律被拒。

**实测旅程（有头 Chrome，`https://memory.crgmhrc.asia:9443/tasks`，合成 admin 会话）**：

- `新建任务` → 在 `任务标题` 输入 `journey-write-<timestamp>` → **回车（键盘提交）** → 对话框关闭，行出现：列表文本 `… journey-write-… 编辑 待办 中 讨论 完成 删除 总计 1 · 当前显示 1–1 每页行数 20 50 100`。
- `编辑` 打开**任务编辑器对话框**（字段：任务标题、任务备注、任务优先级、任务截止时间、保存任务、任务状态、保存状态、任务进度、保存进度、任务标签（英文逗号分隔）、保存标签、知识条目 ID、关联知识、子任务标题、添加子任务、添加依赖、关闭任务编辑器）。
- 行内 `删除` → 确认对话框 `删除此任务？ <title> (<id>) — 将永久删除此任务及其任务标签和关联。不会删除关联的知识内容。此操作无法撤销。`，按钮 `取消` / `永久删除`；点击 `永久删除` 关闭并回到 `暂无任务 总计 0 · 当前显示 0–0`。
- DB 计数：旅程中 `tasks` = **1**；删除后 = **0**。追加式审计经 UI 写入 `task.created` / `task.deleted`（合成成员）。

**明确非声明**：

- 自签本地 TLS、合成身份、本地 harness（**`Origin` 改写属 harness，非应用行为**）、独立 `/tmp` profile；**不是 D05/D06/D04 任何验收**（非真实身份、非真实部署）。
- **不改变任何计数**：功能清单父项 **29 在范围内 / 5 已关闭 / 24 开放**（D08 排除）不变，**未翻转任何 checkbox**。
- **未部署/未 push/未远程迁移**；`migrations/` 无改动。
