# 全量 beUI 采用矩阵（2026-10-17）

用户要求：**全部使用 beUI 组件、统一整体 UI 风格**（当前"风格过于凌乱"）。依据：beUI skill 的组件选择表 + 其组合规则；registry 为唯一权威（本轮 `curl https://beui.dev/r/registry.json` → **143 个 slug**）。design-taste skill 只取其中适用于产品 UI 的条目（一致性锁、对比度、状态完备、动效纪律），其落地页/作品集规则不适用于本产品界面。

## 0. 现状诊断（可判定）

`frontend/components/ui/` 共 26 个交互基元，其中**只有 `input` 接在 beUI 源上**；其余（`button` 41 处引用、`card` 24、`badge` 21、`confirm-action` 13、`input` 11、`filter-select` 9、`dialog` 9、`alert` 8 …）都是手搓或自研适配，`dialog`/`expandable-tabs` 还各自手写 `motion/react`。同时 `frontend/components/motion/` 里已装 15+ 组 beUI 源（drawer/select/tabs/switch/checkbox/table/file-tree/animated-toast-stack/center-morph-modal/scroll-reveal/shared-layout-bg/number-ticker/loader/not-found/button）与手工落盘的 `bottom-sheet`。**两种来源混用 = 观感凌乱的根因。**

已有的统一底座（无需重建）：单一圆角刻度 `--radius: 0.55rem`；主题色全部走 `oklch` 令牌（`--primary/--accent/--muted/--border/--destructive/...`）；图标统一 `@phosphor-icons/react`；`frontend/lib/hooks/use-hover-capable` 与 `motion/react` 的 `useReducedMotion` 已在使用。

## 1. 迁移原则

1. **适配层就地替换，调用点不动**：保留每个基元的文件名、导出名与 props；只把内部实现换成 beUI 源（`sheet.tsx` → `motion/drawer`、`input.tsx` → beUI input 即已验证的先例）。调用点只在需要新能力（如 `context-menu` 的行内右键）时才改。
2. **一个交互面只有一套实现**：新面板/弹层必须经过既有适配层（`ui/sheet.tsx`、`ui/dialog.tsx`），不得引入第二套。
3. **取源方式**：见 §3 的契约（`npx shadcn add` 在本仓库不可用）。
4. **设计锁**：只用 `--radius` 与既有主题令牌（不新增颜色/圆角刻度）；只动画 `transform`/`opacity`；装饰性 hover 动效走 `useHoverCapable`，动效尊重 `useReducedMotion`；移动端触控目标 ≥44px（已达成，不得回退）。
5. **不许回退既有契约**：每个 `data-*` 钩子、`aria-label`、i18n 键（两种语言）、键盘可达性、焦点作用域与既有测试断言都要继续成立。若 beUI 源无法承载某条契约，**宁可保留适配层并写明原因**，也不许 fork 内部或牺牲契约（I4 的 `prompt-input` 拒绝即此判据）。

## 2. 迁移矩阵

### Wave 1 — 基元（决定观感，调用点不动）

| 现值 | beUI slug | 动作 |
| --- | --- | --- |
| `ui/button.tsx`（41 处） | `button-base`；异步动作加 `button-stateful`（pending/成功/失败三态） | 重架：base 用 beUI 源，保留现有 variants/sizes 与所有 `aria-*`；把"进行中/已提交/失败"的按钮改走 stateful |
| `ui/badge.tsx`（21） | `animated-badge` | 重架（`useReducedMotion` 下退化为静态） |
| `ui/card.tsx`（24） | `card` | 重架 |
| `ui/alert.tsx`（8） | `alert` | 重架 |
| `ui/checkbox.tsx` | `checkbox`（已装） | 重架到已装的 `motion/checkbox` |
| `switch`（散落） | `switch`（已装） | 统一走已装 `motion/switch` |
| `ui/select.tsx` / `ui/filter-select.tsx`（9） | `select`（已装）；筛选项多/可搜索时 `combobox`；多值筛选 `multi-select` | 重架；筛选一律带可搜索能力 |
| `ui/input.tsx`（11） | `input`（已装） | 已完成，仅复核 `textarea` 是否同源 |
| `ui/dialog.tsx`（9） | `center-morph-modal`（已装）／确认面用 `morphing-modal` | 重架：去掉手写 `motion/react`，走已装模态 |
| `ui/tooltip.tsx`（暂 0 用） | `tooltip` | 装 + 重架（图标按钮将开始使用） |
| `ui/dropdown-menu.tsx` | `popover`（菜单）／`context-menu`（行内右键） | 重架；管理端行操作改用 `context-menu` |
| `ui/confirm-action.tsx`（13） | `center-morph-modal` 承载确认面；破坏性动作可选 `hold-action-button` / `slide-action-button` | 重架 |
| `ui/typed-confirm-action.tsx` | 同上（键入式确认是产品语义，保留输入控件） | 重架外壳 |
| `ui/page-state.tsx`（loading/empty/error/recovery/forbidden） | `loader`（已装）+ `alert` + `card` | 重架内部，五个状态保留 |
| `ui/skeleton.tsx` | `loader`；表格骨架用已装 `motion/table/skeleton-rows` | 重架 |
| `ui/pagination.tsx` | 无对应 slug（beUI 无分页件）→ 视觉对齐 `button-base` | 对齐 |
| 面包屑（现由外壳自绘） | `breadcrumb` | 装 + 接入 |
| `components/data-table` | `table`（已装）→ 异步表 `table-async`；可编辑 `table-editable`；行操作溢出用 `overflow-actions` | 重架 + 按场景采用 |
| 404 页 | `not-found-glitch`（已装 `motion/not-found`） | 接入已装件 |

### Wave 2 — 页面级模式

| 面 | beUI slug |
| --- | --- |
| Agent 会话（提问/回答/流式阶段） | `message-scroller` + `message` / `message-bubble` + `streaming-response` + `reasoning-text` / `thinking-shimmer` / `agent-activity`；`prompt-input` 仅在不牺牲 `AGENT_SUBMIT/AGENT_STOP` 与中文无障碍名的前提下采纳 |
| 看板 | `sortable-stack` |
| 任务列表 | `todo-list` |
| 提交知识（附件） | `file-upload` / `attachment-upload`（"尚未配置对象存储"的能力边界不变） |
| 日历/复盘周期 | `date-range-picker` |
| 通知 | `notification-stack` + `animated-toast-stack`（已装） |
| 外壳 | `animated-sidebar`（I6 复核：包一层适配层而不是 fork）＋ `command-palette`（I5 复核）＋ 移动端 `dynamic-island` 视需要 |
| 知识阅读器 | `collapsible` / `bouncy-accordion`（章节）、`morphing-lightbox`（图片）、`file-tree`（已装，目录） |
| 移动列表 | `swipeable-list`、`pull-to-refresh` |

### Wave 3 — 一致性锁定与验收

- 清理：`frontend/components/motion/` 与 `ui/` 之外不得再有手写 `motion/react`（适配层除外）；不得出现第二套弹层/抽屉/选择器实现。
- 审计：单一圆角与单一强调色、按钮/表单对比度（WCAG AA）、`useReducedMotion`/`useHoverCapable` 覆盖、移动端 44px 不回退。
- 验收：34 页浅色/深色 + 390 移动端前后对比截图；`npm test` + `typecheck` + operation inventory；本文件记录每波结果。

## 4. 迁移前基线（2026-10-17，用于对照）

| 指标 | 迁移前 |
| --- | --- |
| `ui/` 基元总数 / 其中已接 beUI 源 | 26 / **7** |
| 适配层之外手写 `motion/react` 的文件 | **10**（`main.tsx`、`shell/app-shell.tsx`、`shell/command-palette.tsx`、`ui/dialog.tsx`、`ui/expandable-tabs.tsx`、`agents/{agent-progress,agent-disclosure,citations,code-block}.tsx`、`lib/presence-gate.tsx`） |
| `createPortal` 调用点（＝弹层实现处） | **7** |
| `listbox` / `role="option"` 实现处 | **4** |
| `ui/` 内 `rounded-*` 字面量（圆角漂移） | 17 |
| 组件/页面内 hex 颜色字面量 | 3（颜色纪律基本达标，保留） |
| `frontend/components/motion/` 已装 beUI 组件 | 23 |

目标：`ui/` 基元全部接 beUI 源；适配层之外的 `motion/react` 只允许出现在 `main.tsx`（页面过渡）与明确的适配层内；`createPortal` 收敛到既有适配层数量；`listbox` 收敛到 1–2 处；`rounded-*` 字面量清零（统一 `--radius`）。

## 5. 取源契约（本仓库）

`npx shadcn@latest add @beui/<slug>` 在本仓库**不可用**：`frontend/` 有 `components.json` 但没有 manifest，CLI 会在 `frontend/next-app/` 生成整套 Next.js 脚手架（本轮已实测一次并回滚）。正确路径：

1. 读 live registry：`curl -fsS https://beui.dev/r/registry.json`（或公共 MCP `https://mcp.beui.dev/mcp`）。
2. `npx shadcn@latest view @beui/<slug>` 只读检视 payload ✓ 可用。
3. 按 payload 手工写入 `frontend/components/motion/<name>.tsx`，遵循已装件的既有约定：`cn` 来自 `frontend/lib/utils`、Phosphor 图标、`@/lib/*` 改为相对路径、复用既有 `lib/{ease,presence-gate,touch,hooks}`；**不得覆盖**既有 lib 文件；若 payload 需要新依赖，**报告而不擅自安装**。
4. 保持本仓库既有的适配层边界与 `data-*` 钩子。

## 6. Wave 1 结果（基元层，2026-10-17）

**新增 beUI 源（手工落盘；统一把 `lucide-react` 译为 `@phosphor-icons/react`、`@/lib` 改相对路径、`process.env` 改 `import.meta.env.DEV`；未新增任何依赖）**：`motion/{card,alert,animated-badge,button/stateful,tooltip,tooltip-surface,popover,popover-morph,popover-position,context-menu,breadcrumb}`、`motion/tooltip/{grace,positioner,use-position}`、`lib/hooks/{use-dismiss,use-hover-gesture,use-tap-gesture}`。

**已重架的基元（导出名与 props 不变，调用点除下述一处外全部不动）**：`ui/button`（新增 `StatefulButton`＝beUI `button-stateful`）、`ui/badge`（→ animated-badge，`size="sm"` 默认保住 21 处表格 pill）、`ui/card`（纯 re-export）、`ui/alert`（variant 映射 + children 分流）、`ui/tooltip`（**真采用**，`@radix-ui/react-tooltip` 已从依赖树移除）、`ui/input`/`textarea`（共用 `fieldShellClass` 字段壳）、`ui/checkbox`（beUI 几何）、`ui/label`、`ui/select`（保留原生 `<select>`：套件按原生控件驱动）、`ui/filter-select`（无障碍名与 44px 保持，长列表面板可滚动）、`ui/applied-filters`（`×` 字形→Phosphor `X`）、`ui/page-state`（五态不变）、`ui/skeleton`、`ui/confirm-action`、`ui/typed-confirm-action`、`ui/pagination`（走共享 Button + `--radius`）、壳内 breadcrumb（→ beUI `breadcrumb`）。

**顺带修掉的真缺陷**：已装 payload 里 `text-(--color-success)` 与 `hover:border-(--color-border-strong)` 是**本主题下的死 CSS**（改为 `text-primary` / `hover:border-foreground/40`，不新增颜色）；已装 input 丢失的 `strokeWidth={2.5}` 复原；移动端分页按钮 36px → **44px**；badge 重架让 boards 测试的 `bg-secondary` 选择器失效 → 改为语义钩子 `data-board-column-total`（**断言本身未改**，不回钉类名）。

**有据拒绝（均为"beUI 源无法承载既有契约"，非偏好）**：`center-morph-modal` 作模态（挂载后才渲染 ⇒ 破坏 `renderToStaticMarkup` 类测试；无条件 portal；面板 props 止于 `children/className` ⇒ `role="alertdialog"`/`data-*` 无法到达；硬编码英文无障碍名）；`popover` 作 shell 菜单（`aria-haspopup="dialog"`、面板 `role="dialog"` 写死 ⇒ `aria-haspopup="menu"`/`role="menu"`/`data-menu-id` 无法表达）；`overflow-actions`（无 `data-*`/`aria-*`/`aria-busy` 透传、动作样式均一 ⇒ 破坏性动作失去强调，而测试按这些钩子选择）；`combobox`/`multi-select` 作筛选（panel 走 portal 且触发器是 `role=combobox` 的输入框 ⇒ 与套件按 `button[aria-haspopup="listbox"]` + `.sr-only` 名的选择方式冲突）；`radio`（无场景，纯造死代码）；`hold-action-button`/`slide-action-button`（会丢点击确认、键入式门槛与 22px 半径契约）；`table-async`/`table-editable`（payload 与已装 `table` **逐文件相同**，已装件本身即异步表）。

**对照（迁移前 → Wave 1 后）**：`ui/` 基元接 beUI 源 **7 → 16**；`motion/` 已装件 **23 → 34**；`ui/` 内 `rounded-*` 字面量 **17 → 13**；组件/页面 hex 字面量 3（不变）；适配层外 `motion/react` **10 → 11**（新增者为 `ui/skeleton.tsx`，Wave 3 修）；`createPortal` 7 → 11（新增者是 beUI 源自身的 portal，不算重复实现）。**Wave 3 待清理**：`motion/card.tsx` 残留 1 处 `rounded-2xl`、`motion/alert.tsx` 残留 1 处 `rounded-xl`；`ui/skeleton.tsx` 应直接用已装 `loader` 而非自引 motion。

**门禁**：`npm run typecheck` 干净；各切片自报套件全绿（含 boards/pagination/focus-scope/a11y 独立复跑 **80/80**）。新 beUI 源的"未分配操作"复核行与指纹由 `ReviewLedger` 切片补齐后，重生成 operation inventory 并跑整仓 `npm test`。


## 7. Wave 2 · 提交附件／日历范围／复盘周期（2026-10-17）

**结论：本切片三个 slug（`file-upload`、`attachment-upload`、`date-range-picker`）全部不采用；`frontend/` 源码零改动（落盘 slug 数 = 0）。** 判据与 I4／I5／I6 相同：逐条对照"现有实现必须保留的保证"，看每条保证是否落在 payload 的公开接口之内。payload 行为证据取自 live registry `https://beui.dev/r/<slug>.json` 的 `files[].content`（本轮已取回逐行核对，下文行号即该 payload 内的行号）。

### 7.1 提交附件：`file-upload` / `attachment-upload` 不采用

现有实现是**一个** `AssetDropzone`（`frontend/components/assets/asset-dropzone.tsx`），同时服务"未配置对象存储"的边界态与配置后的真实上传流程：`asset-availability-panel.tsx:36`（未配置／未登录 ⇒ `disabledMessage=SUBMIT_ASSET_NOT_CONFIGURED`）与 `asset-upload-panel.tsx:33`（已配置 ⇒ `enabled`、`onFiles`）走同一个组件、同一组钩子。

1. **单文件拒绝能力会消失（决定性）**。套件要求选择器本身是单文件的，且两个文件的拖放必须给出"一次一个文件"的拒绝：`test/unit/frontend-asset-dropzone.test.tsx:60`（`input.multiple === false`）、`:50-57`（`[a.pdf,b.pdf] → "one file"`）、`test/unit/frontend-asset-upload-route.test.tsx:59`。payload 在回调**之前**按 `multiple` 截断：`file-upload.tsx:433-435`（`incomingFiles.slice(0, multiple ? remainingSlots : Math.min(1, remainingSlots))`）、`:442`（`onFilesAdded?.(added, files)`）。即 `multiple={false}` 时两个文件只有一个到达我们的校验，`SUBMIT_ASSET_TOO_MANY`（`frontend/lib/i18n.ts:1873`／`:3894`）永远不可能触发——丢的不是文案，是**拒绝**：用户会以为两个文件都加上了。
2. **`data-drop-target="asset"` 无法承载**。payload 根节点是 `file-upload.tsx:481` 的 `<div className={cn(...)}>`，`FileUploadProps`（`:52-69`）无属性透传口；而 `test/unit/frontend-submit-pages.test.tsx:182` 与 `test/unit/frontend-asset-upload-route.test.tsx:47` 都按这个钩子选择（后者在它上面派发真实 drop）。外面包一层能让属性落位，但可见的投放面是 payload 内部那个 `button`：真实拖放在按钮上被 payload 处理一次、再冒泡到外层被我们处理一次（**双重处理**）。
3. **无障碍名与队列状态退回英文硬编码**。payload 的 `input` 写死 `aria-label="Upload files"`（`:486`，无覆盖口）；队列状态是模块级 `STATUS_LABEL`（`:74-81` Queued/Uploading/Uploaded/Failed，无覆盖口），行上也没有 `data-*`。采用即让 `SUBMIT_ASSET_QUEUED/PROCESSING/SUCCEEDED/FAILED`（`i18n.ts:1876-1879`）在这一面失效，并丢掉 `data-upload-status`（`asset-dropzone.tsx:46`；`test/unit/frontend-asset-dropzone.test.tsx:86,90,98`）。可覆盖的只有 `title`/`description`/`browseLabel`/`accept`/`maxFiles`/`classNames`。
4. **粘贴图片与文件夹模式无入口**。`asset-dropzone.tsx:39` 的 `onPaste` + `clipboardImageFiles`（`frontend-submit-pages.test.tsx`「extracts clipboard images…」）与 `:44` 的 `webkitdirectory`（`displayRelativePath` 的显示面）在 payload 内没有对应 props。
5. **设计锁**：`file-upload.tsx:84,368` 引入 `emerald`（新颜色刻度）、`:287,294,528,544,545` 是 `rounded-2xl/3xl/xl/[1.35rem]/[1.25rem]`（第二套圆角刻度）。`classNames` 能用 tailwind-merge 覆盖几何/颜色，但第 1–3 条无法覆盖。
6. **`attachment-upload` 另有硬阻断**：它依赖 `@floating-ui/dom`（registry `dependencies`；本仓库无此依赖）——按取源契约第 3 条**报告而不安装**。它还是更宽的产品面（link/image/audio 三种附件 + `:462` 自建 `createPortal` 图片预览弹层 + 逐条英文 `aria-label`，如 `:940` "Upload attachments"），而本产品只有"文件 / URL"两种入口（`asset-upload-panel.tsx:35-40`）。

**存储边界如何表达（未改，双向核对过）**：`AssetAvailabilityPanel` 读 `/api/assets/availability`；`storageEnabled=false` 或未登录时把 `SUBMIT_ASSET_NOT_CONFIGURED`（en「Object storage is not configured; text submissions remain available.」`i18n.ts:1868`／zh「尚未配置对象存储；仍可提交文本。」`:3889`）作为 `disabledMessage` 交给 dropzone。disabled 时边界文案**取代**投放提示（`asset-dropzone.tsx:41`），格式清单不渲染（`:42` 仅在 `!disabled` 时），投放/粘贴/拖拽处理一律提前 `return`（`:39` 的 `disabled` 守卫），选择器与按钮 `disabled`（`:44-45`），因此界面上不存在"可以发生的上传"；文本提交按钮不受影响（`test/unit/frontend-asset-availability-route.test.tsx:32-33` 断言 `button[type="submit"]` 未被禁用）。已配置但流程忙或恢复存储不可用时走 `ASSET_FLOW_BUSY`／`ASSET_FLOW_STORAGE`（`asset-upload-panel.tsx:33`），仍是同一份实现。边界文案是既有 i18n 键，两种语言都在，未新增、未改动。

**另注（只报告不改，`frontend/lib/i18n.ts` 属禁改文件）**：`SUBMIT_ASSET_NOT_CONNECTED`（en `i18n.ts:1869`「Object storage is configured, but uploads are not connected yet.」／zh `:3890`「对象存储已配置，但实际上传链路尚未接通。」）在 `frontend/`（除 i18n.ts 与构建产物外）**无任何调用点**——`AssetAvailabilityPanel` 只区分 loading／读取失败／已配置未登录／未配置四态；`SUBMIT_ASSET_DISABLED` 仅作 `disabledMessage` 缺省回退（`asset-dropzone.tsx:41`）。若 Wave 3 要收敛 i18n 死键，这两处（前者可删、后者需先补 UI）应由 i18n 持有者统一处理。

### 7.2 日历范围 / 复盘周期：`date-range-picker` 不采用

1. **值类型不匹配（决定性）**：payload 的 `DateRange` 是**与时区无关的日历日**：`date-range-picker/types.ts:3-7`（"Calendar dates, independent of a browser's timezone: YYYY-MM-DD"），`date-range-picker/date-utils.ts:3-13` 的 `parse()` 对非 `YYYY-MM-DD` 直接抛错（UTC 锚定）。而日历范围是**本地时区的瞬时区间**：`frontend/lib/calendar-query.ts:3`（`CalendarRange{from,to}`＝canonical ISO 瞬时）、`:5-8`（`to > from` 且 ≤31 天）、`:33-41`（`localCalendarTime`／`localCalendarInstant`，分钟精度，配套 `datetime-local`）、`frontend/components/calendar-range-filter.tsx:14-15`（两个 `datetime-local`，无 popover）。用 UTC 日算出时间再转本地，在非 UTC 时区会整体偏移一天；把范围降级为"天"则删掉本地时间点选择（`CALENDAR_RANGE_HINT`「按本地时区选择，范围最长 31 天」`i18n.ts:497`／`:2518`）——那是换一个问题，不是迁移。
2. **复盘周期不是"范围"，是具名周期**：请求只带 `period=daily|weekly`（`frontend/lib/review-data.ts:23`、`frontend/lib/workbench-review-data.ts:10`），响应里的 `from`/`to` 由服务端按 UTC 日／周一 ISO 周算出并被前端复核（`shared/workbench-review-period.ts:2-11`、`workbench-review-data.ts:13-18` 的 `reviewRange` 复核、`periodKey` 形如 `2026-W41`），客户端存的是枚举（`frontend/lib/review-period.ts:4,16-33`，键 `memory-garden:review-period:v1:<surface>:<memberId>`）。payload 的 `value`/`onValueChange` 是日区间：只留 presets（`date-range-picker.tsx:656-722`）而藏掉月历，表面上很像"今天／本周"（`KNOWLEDGE_REVIEW_DAILY/WEEKLY`＝Today／This week，`i18n.ts:955-956`），但组件的 `value` 会是我们伪造的日区间，而月历一旦露出就在界面上承诺"可选任意范围"——服务端不接受（`review-data.ts:30` 要求 `value.period === requested`），与存储边界的判据同类：**不得暗示不可能发生的操作**。周期选择器当前已经是 beUI 面：`/knowledge` 走 `ui/filter-select`（`knowledge-page.tsx:65`，触发器 `aria-haspopup='listbox'`，被 `test/unit/frontend-review-period-refresh.test.tsx:35` 选择），`/review` 走 Wave 1 的 `Button` + `aria-pressed`（`workbench-review-page.tsx:21-22`）。`frontend/components/review/*` 本身没有日期/范围控件（该目录是审核队列面），所以这一行的"复盘周期"只落在上面两处。
3. **英文无障碍名**：payload 的摘要/月历/触发器写死 `"Select date"`（`:188,206`）、`"Choose month"`（`:246`）、`"Choose year"`（`:269`）、`"Previous/Next month|year(s)"`（`:289-307`）、`"Choose a start date"/"Choose an end date"`（`:594-595`）、`"Clear date range"`（`:613`）、`"Select dates"`（`:730`）、`"Select end"`（`:753`）；能覆盖的只有少数 `aria-label` 与 `DateRangePickerPreset`／`DateRangePickerTrigger` 的 props（`:683-760`）。
4. **丢弃周期记录与范围控件正交**：`data-review-period-blocked` + `REVIEW_PERIOD_RECORD_DISCARD`（`workbench-review-page.tsx:25`、`knowledge-page.tsx:65`）与 `periodNotice`（`:26`）留在原处，换不换 picker 都不变，因此不构成采用理由。
5. **若将来采用，lib 一律不动**：payload 还带 `lib/ease.ts`、`lib/hooks/use-hover-capable.ts`、`components/motion/popover-morph.tsx`、`components/motion/popover-position.ts`。已逐行 diff：`use-hover-capable.ts`／`popover-position.ts` 与本仓库**完全相同**；`popover-morph.tsx` 仅 import 说明符不同；`ease.ts` 差 1 行（本仓库 `SPRING_GLIDE` 多 `type: "spring"`，payload 版缺失 ⇒ 覆盖即回退该修正）。只落 payload 自身的 4 个 `date-range-picker*` 文件。

**本切片文件范围之外的两处真"日区间"面（类型上才是 `date-range-picker` 的对象，建议后续波次或其它切片跟进）**：`frontend/pages/my-submissions-page.tsx:105-107`（`type="date"` 的 from/to + `invalid` 标志）与 `frontend/pages/search-page.tsx:173-174`（发布日期起止）。若要采用，需同时保住 `test/unit/frontend-knowledge-submissions-header.test.tsx:58-66,128-135` 的 `AppliedFilters` chip／清除契约。另注：`asset-dropzone.tsx` 的 `folderMode` 当前无任何调用点（只有 `onFile` 被套件使用），Wave 3 清理时可一并判定。

**门禁（本切片）**：`npm run typecheck` 干净；31 个套件 / 434 测试全绿：`frontend-submit-pages`、`frontend-submit-owner-route`、`frontend-submission-draft-data`、`frontend-submission-resubmit-data`、`offline-submission-draft`、`frontend-calendar-*`（6 个）、`calendar-service`、`frontend-review-period-refresh`、`frontend-review-period`、`frontend-workbench-review-page`、`frontend-workbench-review-data`、`workbench-review-service`、`frontend-asset-*`（8 个）、`frontend-planning-write-receipts`、`frontend-agent-receipt-read`、`member-asset-availability`、`assets-service`、`asset-errors`。本切片**未新增文件、未新增 slug、未新增依赖、未新增 operation 身份**，ledger 与 operation inventory 无需因本切片变更（inventory 仍需由持有者在全部 Wave 2 切片落地后重生成）。

## 8. Wave 2 · 看板列栈／任务列表（2026-10-17）

范围：`frontend/pages/boards/*` 与其列／卡组件、`frontend/pages/tasks/*` 与其列表／行组件，及对应套件。取源：`https://beui.dev/r/{sortable-stack,todo-list}.json`（直接读 payload，未跑 `npx shadcn add`）。**结论：两个 slug 均不采用，未写入任何 `frontend/components/motion/` 文件**；另有一处同切片内的实现去重（见下）。payload 行号为 registry 文件行号，其余为本仓库 `file:line`。

### 8.1 看板列栈 · `@beui/sortable-stack` 不采用

三项被点名的保证**都能承载**（列总数、空态、每列滚动都在 children 内），因此不是判据所在；真正的阻断：

1. **该组件存在的意义是「重排」，而看板列没有顺序契约。** 列顺序是固定工作流元组 `BOARD_STATUSES = ["todo","doing","blocked","done"]`（`frontend/pages/boards/board-model.ts:4`），全仓无 `boardOrder/columnOrder` 之类键；看板唯一数据路径是 `GET /api/tasks?status=…&page=…`（`frontend/lib/tasks-data.ts:45`），`writeBoardColumnSearch`（`board-model.ts:36-49`）只序列化 page/pageSize。payload 的根要求受控 items + `onReorder`（`sortable-list.tsx:257` `axis="y"`、`:211` `div.w-full.max-w-md`），且 `SortableListItem` 在 id 不在 items 时抛错（`:287`）。两种诚实写法都不成立：**带把手**＝在写入面上新增一条「本地置换、无回执、刷新即丢」的变更路径（现有每次移动都有 `data-board-move-*` 回执/未知结果守卫：`boards-page.tsx:38-49`，断言见 `test/unit/frontend-boards-route.test.tsx:1014-1077`）；**不带把手**＝`dragListener={false}`（`:293`）使任何东西都拖不动，采用只换来一个 `div` 包裹层（`:211`）和带 `space-y-2`、`aria-posinset/aria-setsize`（`:261,307-309`）的 `ul`，压在「每列滚动」唯一依赖的那条链之上（`boards-page.tsx:50,69`；滚动容器是表格自己的 `div.overflow-auto`，`frontend/components/motion/table/index.tsx:268`，套件直接寻址它：`frontend-boards-route.test.tsx:1105`）。
2. **英文硬编码常驻无障碍树且无覆盖口**：sr-only 指引（`:212-215`「Drag a handle to reorder. With a handle focused, use Up and Down…」）每次挂载都渲染，播报模板也只有英文（`:159` moved to position…、`:178` Previous order restored.、`:428` Undo reorder），整体还是 `role="status"` live region（`:235`）。与 Wave 1 拒绝 `prompt-input` 同类判据，且必须 fork payload 内部才能改。
3. 把手的触控面只有 `size-9`（36px，`:382`）；需另加 `max-lg` 覆盖才守住 44px，属附带项、非决定性。

**明确非阻断项**：列总数仍是 `data-board-column-total` 的 animated badge（`boards-page.tsx:70`；断言 `frontend-boards-route.test.tsx:1101`、`frontend-boards-page.test.tsx:56-57,82`），空列仍是 `PageState kind="empty"` 卡片，`shrink-0`/`snap-start`/`overflow-x-auto`（`boards-page.tsx:50,69`）可经 className 覆盖（`frontend-boards-route.test.tsx:131-133`）。另：registry 143 个 slug 中**没有任何看板/kanban 条目**，该面无更贴合的 slug 可替。

### 8.2 任务列表 · `@beui/todo-list` 不采用

1. **行操作无处安放（决定性）**：`TodoItem` 只有 `{id,title,status?,progress?,detail?}`（`:30-36`），`TodoListProps` 只有 `{items,title,open,defaultOpen,onOpenChange,collapseOnComplete,maxHeight,className}`（`:38-46`），行渲染固定为图标＋标题＋detail（`:320-377`），无操作槽、无逐行 handler、无 `data-*`／id 透传。我们的打开/编辑、状态切换、删除（含 `validConfirmation` 墓碑门）都是逐行控件，建在单元格里（`frontend/pages/tasks/tasks-page.tsx:121-126`），无障名逐任务断言（`test/unit/frontend-tasks-page.test.tsx:37-44`、`frontend-tasks-route.test.tsx:223,284,338-339`）。
2. **移动端披露行同样承载不了**：该页的移动披露是**筛选行**（`tasks-page.tsx:81-87` → `frontend/components/ui/filter-disclosure.tsx:51,61-63,77-81`，经 `ui/sheet` 的底部 beUI 面板）。`todo-list` 自带一份自己的披露（`AgentDisclosure`，`:306`），并附带冲突行为：完成即折叠（`:215-227`）与每次条目数变化把自己的 248px 视口滚到底（`:208,247-254`）；而列表的移动形态是共享表格滚动容器上的追加 feed（`frontend/components/motion/table/index.tsx:268`，驱动见 `test/unit/frontend-tasks-route.test.tsx:568-574`）加桌面分页元数据。
3. **英文硬编码无覆盖口**：`aria-label="Agent task list"`（`:261`）、`statusLabel`（`:50-53`）、空态「No tasks yet」（`:381`）、sr-only「N of M tasks completed」（`:286`）、默认标题「To-dos」（`:203`）；且整个 `<ol>` 是 `aria-live="polite"`（`:318`），每次乐观状态切换／删除／筛选重取都会重播行窗口。
4. **违反设计锁**：两处主题令牌之外的色值字面量——`text-emerald-500`（`:73`）与 `text-rose-600 dark:text-rose-400`（`:126`）。同样的缺口也出现在任务编辑器子任务清单（`frontend/pages/tasks/task-editor.tsx:288-289` 的逐项状态下拉／标记完成／移除，由 `test/unit/frontend-inbox-task-operation-matrix.test.tsx` 驱动），因此那里同样不采用。

**安装层事实**：两个 payload 都随附 `lib/ease.ts` 与 `lib/utils.ts`，都必须丢弃——payload 版 `ease.ts` 的 `SPRING_GLIDE` 少了本仓库已有的 `type: "spring"`（逐行 diff 已验证）；两者都声明 `lucide-react`（可改为 Phosphor）；`todo-list` 另需本仓库不存在的 `components/motion/action-swap.tsx`、`action-swap-roll.tsx`（`components/agents/agent-disclosure.tsx` 已存在）。

### 8.3 本切片内的唯一改动（去重，非 slug 采用）

任务行里最后一个手写按钮面改为 beUI 的 `ButtonLink`：`frontend/pages/tasks/tasks-page.tsx:6`（import）与 `:123`（原为手写 `<a class="inline-flex h-8 items-center rounded-md border border-input …">`）。依据是 `frontend/components/ui/button.tsx:9` 已写明的约定（链接形按钮直接用 beUI 的 `ButtonLink`）；`variant="outline" size="sm"` 与原锚点同为 `h-8 px-3 text-xs` 几何，圆角回归全局 pill，按压/悬停尊重 `useReducedMotion`、悬停经 `useHoverCapable`。`href`、可见文案与 i18n 键 `MESSAGES_DISCUSS` 未动（断言 `frontend-tasks-page.test.tsx:45`）。该行现为 3×`ui/button` + 1×`ButtonLink` + `ConfirmAction` 门。未改任何尺寸／触控类，未移动任何钩子。

**门禁（本切片）**：`npm run typecheck` 干净；12 个套件 / 397 测试全绿：`frontend-tasks-page`、`frontend-tasks-route`、`frontend-task-structure`、`frontend-task-list-status`、`frontend-task-list-notes`、`frontend-task-delete-confirmation`、`frontend-task-editor-route`、`frontend-inbox-task-operation-matrix`、`frontend-boards-route`、`frontend-boards-page`、`frontend-board-move-intent`、`frontend-planning-status-confirmation`。本切片**未写入任何 payload 文件、未新增 slug／依赖／operation 身份**，未触碰 ledger、`frontend/lib/*`、共享 `data-table`/`motion/table`；`data-board-column-total` 等全部 `data-*` 钩子、aria-label 与 i18n 键原地保留。


## 8. Wave 2 · 通知（2026-10-17，2026-10-17 追加）

范围：`frontend/pages/notifications/*`、`frontend/lib/notifications*`、通知徽标／未读摘要／列表行／标记已读控件及其套件。**本切片 0 个 slug 落盘**：picker 映射的 `notification-stack` 无法承载契约，`animated-toast-stack` **已是**瞬态通知的宿主（已装、已接），无需改动。

### 8.1 `notification-stack` —— 拒绝（作页面内收件箱面）

payload 来源 `https://beui.dev/r/notification-stack.json`，文件 `components/motion/notification-stack.tsx`（下列行号为该 payload 行号）：

1. **行上无属性透传（决定性）**：`NotificationStackItem = { id, title, description?, trailing? }`（`:22-27`），行渲染 `NotificationCardContent`（`:84-122`）只给 `classNames?.content/title/description/trailing` 四个类名口（`:92,99,106,116`），无从挂 `data-notification-id` / `data-read`——现状写在行元素上（`frontend/pages/notifications/notifications-page.tsx:111`），且被 `test/unit/frontend-notifications-page.test.tsx:100-101` 逐字断言。
2. **整叠就是一个 `<motion.button>`**（payload `:233-379`）：行内「打开」／「标记已读」（`notifications-page.tsx:114-116`）会成为按钮内嵌交互；且它装了 `useDismiss(..., { behavior: "consume" })`（payload `:180`），会吞掉下一次点击——与列表宿主职责相反。
3. **无法表达分页契约**：只渲染 `items.slice(0, maxVisible)`、`maxVisible = 3`（payload `:132,170`）加一个 `onViewAll`（`:45`），没有 `page`/`pageSize`/`total`/`totalPages`，20/50/100 窗口（`notifications-page.tsx:16,103,106`；`notification-model.ts` 的 `assertQuery`；`test/unit/frontend-notifications-page.test.tsx:24-38`）无处落地。计数药丸是 `items.length`（payload `:360`），不是经 `useNotificationSummary`（`frontend/lib/use-notification-summary.ts:7`）收敛的服务端未读总数（`notifications-page.tsx:70`）。
4. **破坏 i18n 不变式**：无障碍名硬编码英文且不可覆盖（`aria-label`：`${items.length} notifications. ${expandedLabel}.` / `${items.length} notifications. Expand notifications.`，payload `:238-242`）；只有 `collapsedLabel`/`expandedLabel` 是 props。
5. **破坏设计锁**：新色字面量 `bg-orange-600 … dark:bg-orange-500`（payload `:356`）；圆角漂移 `rounded-3xl`（`:184,267,296`）／`rounded-2xl`（`:277,321`）。
6. **顶掉已验证空态**：自绘 `BellOff` 卡片（payload `:184-189`），而非页面的 `PageState kind="empty"`（`notifications-page.tsx:101`，其 `data-page-state="empty"` 被断言）。
7. **缺依赖（报告，未安装）**：payload 依赖 `lucide-react`（`:4`）与未装的 `components/motion/action-swap.tsx`；其 `lib/{ease,hooks/use-dismiss,use-hover-gesture,use-tap-gesture,utils,touch}` 本仓库均已有同一份。

结构上它是 `max-w-[22rem]` 的悬停展开顶栏小件，非分页列表宿主；采用还会在已用的 beUI `table` 旁长出第二套列表实现（§1.2）。

### 8.2 `animated-toast-stack` —— 已是宿主，无改动

已装并已接：`frontend/lib/use-toast.tsx:2,23,29` 渲染 `AnimatedToastStack … fixed position="bottom-right" maxVisible={3} dismissLabel={frontendText(locale,"COMMON_DISMISS")}`（安装版比 payload 多一个本地化 `dismissLabel`）。**宿主挂在 peer 拥有的代码里，本切片未改，留作后续项**：

- 挂载点 `frontend/app.tsx:234`（`<ToastProvider locale={locale}>` 包 `<AppShell>`，peer 拥有）。
- 频道实现 `frontend/lib/use-toast.tsx:22-31`（无需改动）。
- 当前唯一消费方 `frontend/components/shell/command-palette.tsx:5,23`（主题切换／退出失败），即频道已通但用得少；例如 `frontend/app.tsx:1954` 仍以内联 `<p role="status">` 呈现瞬态 `actionNotice`。
- **后续项精确内容**：(a) `frontend/lib/i18n.ts` 需新增键对（en + zh-CN）——本切片不变式禁止改该文件；(b) 在 `NotificationsRoute` 的 `onMarkVisibleRead`（`frontend/app.tsx:3128`）／`onMarkRead`（`:3126`）内调用 `toast.show(...)`——同样属 peer 文件。`frontend/lib/use-toast.tsx` 无需工作。本切片内通知面刻意**持久**（`actionError`/recovery、`recordBlocked` 与丢弃控件、`revokedTarget`，`notifications-page.tsx:80,84,90-95`），不应改走 toast，故本切片无可落地改动。

### 8.3 门禁（本切片）

`npm run typecheck` 干净；6 文件 / 82 测试全绿：`frontend-notifications-page`、`frontend-notifications-route`、`frontend-notifications-data`、`frontend-shell-notifications`、`frontend-notification-summary-refresh`、`frontend-a11y`。本切片未新增文件、未新增 slug、未新增依赖、未新增 operation 身份；ledger 与 operation inventory 未动。


## 8. Wave 1 · 表单控件（FormControls 切片，2026-10-17）

**落盘 slug 数 = 0；13 个文件改动（+102/−33），全部是既有适配层的就地重架与已装 payload 的仓库一致性修正。** 无新增依赖、无新增 i18n 键、未改 `frontend/lib/*`、未改 ledger 与 operation inventory。

### 8.1 家族映射（谁承载谁）

| 面 | 源 | 说明 |
| --- | --- | --- |
| 字段语言（`ui/input`、`ui/textarea`、`ui/select`、分页页大小） | **单一来源**：`ui/input.tsx` 导出的 `fieldShellClass`（beUI `motion/input` 的字段令牌：`h-11`/`rounded-full`/`text-base`/`ring-ring/40`/`aria-invalid` 破坏性环） | `textarea` **是**共用来源：两个原生字段 import 同一 shell，只有几何不同（多行取 `--radius` 系 `rounded-lg` + `min-h-24`） |
| 带 label/error/success 的富输入 | `motion/input`（调用点不变） | — |
| 复选框 | `ui/checkbox` = 原生 input + beUI 复选框几何（`size-5`、`accent-primary`、ring+offset）；`motion/checkbox` 供自持状态面 | 4 处手写 `<input type="checkbox">` 已改为该适配层（hygiene 面板、两个 environments 文件面板），**全仓已无裸 checkbox** |
| 筛选行（9 文件） | `ui/filter-select` over `motion/select` | props 与 sr-only 无障碍名契约原样保留 |
| 表单字段下拉（任务编辑器、spaces、菜单编辑器、提交页、目标选择器、environments 面板…） | `ui/select` = 原生 `<select>`（保留平台选择器/表单关联/`data-*` 透传） | — |
| 开关 / 标签 | `motion/switch`（菜单编辑器）/ 原生 `<label>`（beUI 无 label slug） | — |
| 已应用条件 chips | `ui/applied-filters`：`×` 字符 → Phosphor `X`；`aria-label`/`data-filters-clear`/`role="group"`/44px 不变 | — |

`filter-select` 三项契约内修复：外层 `<label>` → `<span>`（`<label>` 会用短标题「Status」而不是历史名「Asset status」给触发器命名，即无障碍名被改写）；触发器统一到 44px（既有 `max-lg:min-h-11` 仍是 payload 的）；面板 `max-h-80 overflow-y-auto` + `SelectValue` 截断（`pages/admin/audit-page.tsx:11` 的动作清单 40+ 项）。

### 8.2 有据拒绝

1. **`combobox` / `multi-select` 作筛选行（决定性：payload 行为 vs 套件选择器）**。payload `combobox/content.tsx`/`multi-select/content.tsx` 走 `createPortal(…, document.body)` + `popover-position.ts`；触发器是 `<div data-state>`（`combobox/trigger.tsx` 的 `ComboboxTrigger`）加 `role="combobox"` 输入框。而套件按 `button[aria-haspopup="listbox"]` 且其 `.sr-only` 文本 = 历史名选择触发器（`test/unit/frontend-notifications-route.test.tsx:683`、`frontend-mobile-filters.test.tsx:26-28`、`frontend-tasks-page.test.tsx:143`），并要求选项位于触发器**自己的父元素**内（`frontend-tasks-page.test.tsx:167`）。portal 无法满足后者。采用即"把 portal 从 payload 里 fork 掉"或"重开该套件契约"，两者都越界 ⇒ 保留 beUI `select`；真正长清单只有 audit 动作面，而其契约由 `frontend-admin-queue-filters.test.tsx:75,119-121` 锁定。
2. **`radio` 不落盘（无承载面）**。唯一真正二态筛选（复盘周期 daily/weekly）被 `test/unit/frontend-review-period-refresh.test.tsx:35`、`frontend-knowledge-submissions-header.test.tsx:42` 断成 listbox；其余筛选均 3+ 值。落一个无调用点的源 = 死代码，故只记录不落盘。
3. **`ui/select` 保持原生 `<select>`**（不改为 `motion/select`）：套件按原生控件驱动它——`select[aria-label="Rows per page"]` + `.value` + `change` 事件（`frontend-data-table.test.tsx:66`、`frontend-inbox-page.test.tsx:125`、`frontend-notifications-page.test.tsx:199`、`frontend-pagination.test.tsx:151`）；同理 `ui/checkbox` 保持原生 input（`.checked` 断言见 `frontend-review-batch.test.tsx:91`，`input[type="checkbox"]` 见 `frontend-admin-asset-hygiene.test.tsx:131`）。`motion/checkbox`/`motion/select` 无任意属性透传口，`data-*` 钩子会丢。

### 8.3 门禁与 Wave 3 待清理

**门禁**：`npm run typecheck` 干净；48 个套件 / **934 测试全绿**（list-filters、mobile-filters、a11y、graph-a11y、notifications×4、inbox×2、tasks、graph×4、search×3、review×6、submit、discussion、admin×6、data-table、pagination、create-form-navigation、boards、timeline、goal-tasks、inbox-create、planning、agent-page、knowledge、shadcn-primitives）；另 `node --test scripts/browser-vm-file-panel.test.mjs` **13/13**（驱动本切片改动的两个确认框）。

**Wave 3 待清理（本切片范围外的页面级手写控件，改造后即为一行 class 替换）**：裸 `<select>` 17 处（`components/timeline-item-editor.tsx:126`、`timeline-create-form.tsx:146`、`knowledge/knowledge-research-panel.tsx:152`、`submissions/submission-target-picker.tsx:27,33,47`、`inbox-create-form.tsx:131`、`pages/tasks/task-editor.tsx:284,291,311`、`settings-page.tsx:56`、`admin/menu-editor.tsx:60`、`admin/analytics-page.tsx:19`、`admin/spaces-page.tsx:219,220`、`submit-page.tsx:125`、`knowledge-reader-page.tsx`）；裸 `<textarea>` 7 处（`knowledge-research-panel.tsx:188,190,192`、`review/review-source-panel.tsx:193`、`assets/asset-upload-panel.tsx:72`、`messages/thread-page.tsx:169`、`knowledge-reader-page.tsx`）。另：`pages/goals-page.tsx:78` 的 `<input type="range">` 属 beUI `range-slider` 家族，不在本切片家族清单；beUI 触发器圆角是 payload 内联 12px morph（`rounded-full` 类是无效类），与 pill 字段的差异留给 Wave 3 视觉验收。

## 9. Wave 1 · 弹层族（OverlaySurfaces 切片：`ui/dialog`／`ui/tooltip`／`ui/dropdown-menu`／外壳消费，2026-10-17）

**结论**：落盘 3 个 slug（`tooltip`、`popover`、`context-menu`）；就地换源 1 个基元（`ui/tooltip` **真采用** beUI 源）；`ui/dialog.tsx` 与 `ui/dropdown-menu.tsx` **保留适配层**（有据拒绝，理由见下）；**调用点零改动**（`shell/app-shell.tsx`、`shell/command-palette.tsx`、`shell/context-rail.tsx` 均未动）；`morphing-modal`、`bloom-menu` **未落盘**（前者随拒绝 1，后者本切片没有"应当绽放"的触发器）。

**落盘 payload（手工，未新增依赖；`@floating-ui/dom`、`motion`、`clsx`、`tailwind-merge` 均已在依赖里）**

- `motion/tooltip.tsx`、`motion/tooltip-surface.tsx`、`motion/tooltip/{grace,positioner,use-position}`（payload `tooltip`）
- `motion/popover.tsx`、`motion/popover-position.ts`（payload `popover`；`popover-position.ts` 与 `breadcrumb` payload 的同名副本逐字相同，由本切片独占写盘，供 `DataAndChrome` 的 `breadcrumb`／`popover-morph` 复用）
- `motion/context-menu.tsx`（payload `context-menu`）
- `lib/hooks/{use-dismiss,use-hover-gesture,use-tap-gesture}.ts`（payload 携带的 hook，仓库此前没有；`lib/{ease,touch}.ts` 的导出集与 payload 完全相同，**未覆盖**）

统一改写：`lucide-react` → `@phosphor-icons/react`（context-menu 的 `Check` 去掉 lucide 的 `strokeWidth`，改 `weight="bold"`）；`@/…` → 相对路径；tooltip 开发期告警的 `process.env.NODE_ENV` → `import.meta.env.DEV`（`tsconfig.frontend.json` 无 Node 全局，与 `frontend/pages/workbench-landing/*` 写法一致）。

**就地换源：`ui/tooltip.tsx` → `motion/tooltip`（导出名与组合形状不变）**

唯一调用点 `frontend/components/shell/app-shell.tsx:20,118,179` 用的是 `<TooltipProvider><Tooltip><TooltipTrigger asChild><TooltipContent>`，与 beUI 的组合完全相同，因此调用点未改。适配层只保留"外观与时序"：`material-panel` + `text-popover-foreground` 面、`side="right"` 默认、arrow 默认开（用 `--tooltip-arrow-fill` / `--tooltip-arrow-stroke` 从 `--material-panel` / `--border` 取值——beUI 的箭头在无人声明这两个变量时不可见）、provider `delay=0`（原 radix 的 `delayDuration=0` 语义）。可见变化：`sideOffset` 4 → beUI 默认 8；触发器新增 `data-state="open|closed"`；`aria-describedby` 仍指向内容 id（与 radix 行为一致）。`@radix-ui/react-tooltip` 已无导入点（`package.json` 条目仍在，登记为 Wave 3 待清理）。新增回归 `test/unit/frontend-tooltip-source.test.tsx`（3 条：关闭态无面板且无 `aria-describedby`；打开态 `role="tooltip"` 恰一个、其 id 与触发器 `aria-describedby` 对应、适配层 chrome 在位；`asChild` 包裹锚点时锚点与 `href` 保留）。

**拒绝 1：`center-morph-modal` 作模态（`ui/dialog.tsx` 保留适配层）**

payload 行号（live registry 取回逐行核对）：`CenterMorphModalContent` 在自身挂载 effect 之前 `return null`（`:200` 置位、`:251` 返回），无条件 `createPortal(…, document.body)`（`:253`），面板 props 止于 `children/ariaLabel/ariaDescribedBy/dismissible/showCloseButton/closeButtonLabel/className/backdropClassName`（`:188-199`，无 rest 透传），自带 body 滚动锁（`:208`）、window Tab 陷阱（`:242`）、Escape（`:217`）、关闭后把焦点交回 `context.triggerId` 元素（`:247`），无障碍名硬编码英文（`:194` / `:261`）且关闭按钮默认开（`:193`）。被破坏的仓库保证：① `test/unit/frontend-focus-scope.test.tsx:11-16` 用 `renderToStaticMarkup` 断言打开态面板的 `data-focus-scope` / `tabindex`——挂载后才渲染的组件在该断言下什么都不产出；② 135 个套件按 `container.querySelector('[role="alertdialog"]' | '[data-*-dialog]' | '[data-confirm-action]')` 选择面板（如 `frontend-inbox-page.test.tsx:57`、`frontend-admin-space-confirmation.test.tsx:26`），无条件 portal 后面板落在挂载容器之外；③ `role="alertdialog"` / `aria-labelledby` / `onKeyDown` / `data-*` 经 `ui/dialog.tsx:69` 的 rest 透传挂在面板元素上，payload 无处承载；④ 它自带的 Tab 陷阱与 Escape 会和 `useFocusScope`（`ui/focus-scope.tsx:17-42`）双份运行，而控制器驱动的调用点（无 `CenterMorphModalTrigger`）会把焦点交回"不存在的触发器"。`morphing-modal` 另有硬伤：children 被套在写死 `p-5` 的 `motion.div` 内，调用点的 `p-0` / `space-y-3` / `max-w-xl` 等布局类会被吃掉。判据与 I4／I5／I6 相同。该结论与全部行号同时写在 `frontend/components/ui/dialog.tsx` 的 `DialogContent` 注释里。

**拒绝 2：`popover`／`context-menu` 作 shell 菜单（`ui/dropdown-menu.tsx` 保留适配层）**

`motion/popover.tsx:489` 给触发器写死 `aria-haspopup="dialog"`、`:689` 面板是 `role="dialog"`、`:603` 无条件 portal、`:507` 面板只收 `children` / `className` ⇒ `aria-haspopup="menu"`、`role="menu"`、`data-menu-id`、`data-account-menu` 全部无法表达。`motion/context-menu.tsx` 角色正确（`:303`、`:500`）却是指针原点／长按菜单且同样 portal（`:486`）⇒ 定位为**行级右键动作源**，而不是点击锚定的 shell 菜单。契约点：`test/unit/frontend-a11y.test.tsx:47-54`（静态标记断言 `aria-haspopup="menu"` 与 `role="menu"`）、`test/unit/frontend-menu-keyboard.test.tsx`（inline 面板查询、Escape 焦点归还、roving focus、`closeOnSelect`）、`frontend/components/shell/app-shell.tsx:134-140,273-286` 的 `data-menu-id` / `data-account-menu`。该文件自身无手写 `motion/react`，故保留即满足"适配层之外不得手写 motion"。证据同时写在文件顶部注释。

**移交与残留**

- `motion/context-menu.tsx` 暂无消费者：行级动作面归 admin/workspace 表格切片（已 IRC 告知 `DataAndChrome`，含"查询需读 `document` 而非挂载容器、`renderToStaticMarkup` 下不渲染"的提醒）。
- `motion/popover.tsx` 暂无消费者，作为 popover 家族的唯一定义留待后续面。
- `motion/center-morph-modal.tsx` 零消费者："一个模态实现"的张力（`ui/dialog.tsx` 是应用唯一模态，15 个导入点）需持有者决策——要么后续把相关套件迁到 DOM 挂载并接受"对话框一律 portal"，要么让该已装件只作"能接受其形状"的新面之源。

**门禁（本切片）**：`npm run typecheck` 干净；17 个既有套件 / 200 测试 + 新增 3 条全绿：`frontend-focus-scope`、`frontend-menu-keyboard`、`frontend-a11y`、`frontend-shell`、`workspace-shell`、`frontend-context-rail`、`command-palette`、`frontend-environments-create-dialog`、`frontend-admin-spaces-menus-dialogs`、`frontend-mobile-filters`、`frontend-inbox-page`、`frontend-admin-space-confirmation`、`frontend-focus-start-dialog`、`frontend-calendar-cancel-confirmation`、`admin-menus-page`、`frontend-admin-member-confirmation`、`frontend-admin-invitations`。未新增 i18n 键、未改 `frontend/lib/i18n.ts`、未动 ledger 与 operation inventory、未跑整仓 `npm test` / build。


## 10. Wave 1 · 反馈族（FeedbackStates 切片：`ui/page-state`／`ui/skeleton`／`ui/confirm-action`／`ui/typed-confirm-action`，2026-10-17）

**结论：落盘 slug 数 = 0，源码改动限于 4 个适配层文件（+60/−7）。** 本族所需的 beUI 源全部已在仓库内：`motion/loader`、`motion/table/skeleton-rows` 为既有已装件，`motion/alert`／`motion/card` 由本波基元切片（ChromePrimitives）新装，本切片按 `ui/alert.tsx`／`ui/card.tsx` 适配层消费，未新增文件、未新增依赖、未改 `frontend/lib/i18n.ts`、未动 ledger。

### 10.1 五态页状态（`frontend/components/ui/page-state.tsx`）

`PageStateKind` 与五个 `data-page-state` 取值逐字保留（`loading`／`empty`／`error`／`forbidden`／`degraded`），props 不变，仅内部换源：

- `loading` → 既有容器 `data-page-state="loading"` + `aria-busy="true"` 不变，内部加已装 `motion/loader`（`size={20}`，`label={title}`）；`title` 是调用点已本地化的文案，因此 loader 的无障碍名与 sr-only 文本跟随语言，**无英文硬编码**；两根占位条保留，42 个调用点的几何不变。`[data-page-state="loading"][aria-busy="true"]` 成对断言仍成立（`test/unit/frontend-agent-page-summary.test.tsx:58`）。
- `empty` → beUI `card`（`Card` + `CardContent`）。
- `degraded` → beUI `alert` 的 `default` 变体，**显式 `role="status"`**。这是行为变化：旧实现的角色来自旧 `Alert` 的默认值 `role={props.role ?? "alert"}`（`git show HEAD:frontend/components/ui/alert.tsx:11`），新适配层的默认仍是 `alert`，本切片按"通知不是报错"固定为 `status`，避免依赖适配层默认值。受影响调用点：`frontend/pages/agent-page.tsx:48`（cancelled／unavailable）、`frontend/app.tsx:1415-1417`（未确认意图；同处 `kind="error"` 仍为 `role="alert"`）。
- `error`／`forbidden` → `variant="destructive"` + 显式 `role="alert"`（验收记录要求的错误面不变；`forbidden` 的 `data-page-state` 仍由 `frontend/pages/admin/admin-forbidden-page.tsx:10` 与 `PageState` 两处各按既有契约发出）。

**对比度（AA，用仓库 `scripts/wcag-contract.mjs` 同一套 oklch→sRGB + WCAG 相对亮度算法实算）**：辅助文本 `text-muted-foreground` 在卡片面 13.62:1（浅）/ 6.16:1（深），在页面底色 13.05 / 6.64；错误面 `bg-destructive/5 text-destructive`（`frontend/components/motion/alert.tsx:49`，描述文本经适配层 `[[data-variant=destructive]_&]:text-destructive` 继承同色）实测 6.82 / 4.51（底色上）与 12.15 / 4.51（卡片上），全部 ≥ 4.5:1。

### 10.2 骨架（`frontend/components/ui/skeleton.tsx`）

导出名、props（`React.HTMLAttributes<HTMLDivElement>`）、`aria-busy="true"` 与属性透传顺序全部不变（`test/unit/shadcn-primitives.test.tsx` 的 `aria-label` 断言照旧）。脉动改为 `motion-safe:animate-pulse`：只动 `opacity`，且在 `prefers-reduced-motion: reduce` 下**根本不应用动画**（Tailwind 4.3.3 核心变体编译为 `@media (prefers-reduced-motion: no-preference)`，已在本仓 `node_modules/tailwindcss` 内核对），`styles/globals.css:139-148` 的全局 `!important` 覆盖仍作兜底。

**由此关闭 §6 的一条 Wave 3 待办**：§6 记的"适配层外 `motion/react` 10 → 11（新增者为 `ui/skeleton.tsx`）"来自本切片的第一版实现（自引 `motion/react` + `useReducedMotion`）。现改为纯 CSS 变体，该文件不再 import `motion/react`，计数回到 **10**；加载态的 beUI 源由 `page-state.tsx` 直接渲染已装 `motion/loader` 承担。表格骨架维持已装 `motion/table/skeleton-rows`（与 DataAndChrome 的结论一致：行状脉动属该 payload，`animate-pulse` 由全局 reduced-motion 覆盖兜底）。

### 10.3 确认面：`typed-confirm-action.tsx` 收口到共享字段

`frontend/components/ui/typed-confirm-action.tsx` 原先自带一个裸 `<input className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm">`，即"第二套输入面"。现改用 `ui/input.tsx`（beUI 字段语言的适配层），`id`／`htmlFor`、`data-typed-confirm-input`、`disabled={pending}`、`matches` 门禁与两个动作钩子逐字保留。这是本切片**唯一的调用点级改动**，理由是消除重复基元而非新增能力。

### 10.4 破坏性确认：`hold-action-button`／`slide-action-button` **均不采用**（保留模态确认面）

判据与 I4／I5／I6 一致：逐条看"必须保留的保证"是否落在 payload 公开接口之内。payload 行为取自 live registry `https://beui.dev/r/hold-action-button.json`／`slide-action-button.json`（本轮取回逐行核对）。

1. **完成只由手势触发，破坏"点一次即确认"的既有契约（决定性）**。`hold-action-button` 的完成来自填充动画：填充层的 `transition={active ? { duration: holdDuration / 1000, ease: "linear" } : …}` + `onAnimationComplete={handleFillComplete}` + `onHoldComplete`，`holdDuration` 默认 1600ms；`slide-action-button` 根节点是 `div`（`...rest` 落在 div，可动的是内部 `button` 拇指），只在拖过 `threshold`（默认 0.82）或拇指上 Enter/Space 时 `complete()`。而本产品 13 个调用点的契约是**点一次确认即写入**：`test/unit/frontend-admin-member-confirmation.test.tsx:43`（`click('[data-confirm-action]')` → `expect(update).toHaveBeenCalledTimes(1)`）、`test/unit/admin-menus-page.test.tsx:85`、`scripts/browser-vm-environments-page.test.mjs:480,492,598`。换成 hold/slide 即"同一动作需要长按 1.6 秒或拖拽才发生"。
2. **键入式门禁会被旁路或叠加第二套门禁**。`test/unit/frontend-admin-asset-hygiene.test.tsx:185-193` 要求"键入值匹配才可确认"；slide 的拇指在键盘 Enter 下**无需拖拽**即 `complete()`，与"必须先键入准确值"的语义冲突。
3. **设计锁**：hold 的填充/波纹写死 `bg-sky-400`／`text-sky-400`（新颜色）与 `rounded-[var(--hold-radius:22px)]`；slide 写死 `rounded-[22px]`——第二套圆角刻度 + 新颜色，均越出 `--radius: 0.55rem` 与既有 oklch 令牌。
4. **不该被换掉的部分长在模态上**：后果陈述（`description` + `aria-describedby`）、`role="alertdialog"` 名称/描述对、焦点作用域，以及调用方持有的回执/未决路径（成员状态、重复项"丢失回执"恢复、资产回收回执）；相关套件全绿（§10.6）。决策与证据已就地记在 `frontend/components/ui/confirm-action.tsx:5-20` 的文档注释里。
5. **确认面实现仍是唯一的**：`confirm-action.tsx`／`typed-confirm-action.tsx` 都经 `ui/dialog.tsx`（本波已由 OverlaySurfaces 重架到 beUI 模态），仓库内除这两个文件外无 `data-confirm-action` 生产点。

### 10.5 遗留（只报告不改）

- **`frontend/pages/admin/admin-forbidden-page.tsx:10` 的嵌套实时区**：`<section data-page-state="forbidden" role="alert">` 内再放 `<Alert variant="destructive">`，而适配层默认仍是 `role="alert"`，同一段文案落在两个 assertive 区域里。**前存在**（旧 `Alert` 亦默认 `role="alert"`），重架只是继承。干净修法是让 alert 适配层接受"无角色"，属基元切片的能力请求，本切片不 fork。
- 其余 Wave 2/3 面（agent 会话、看板、提交附件、日历、通知、外壳、阅读器、一致性锁与视觉验收）未触碰；`frontend/lib/i18n.ts`、ledger 三件与 operation inventory 未动，本切片三个源文件的 operation 身份变化由父级统一重生成。

### 10.6 门禁（本切片）

`npm run typecheck` 干净。套件：`frontend-page-state`（五态 it.each）、`frontend-a11y`、`shadcn-primitives` 全绿；确认/弹层 16 套件 **326/326**；状态密集路由 16 套件 **434/434**；alert 消费面 15 套件 **365/369**，4 条失败全为 badge `bg-secondary` 类名选择器（`test/unit/frontend-boards-route.test.tsx:1098`），已由基元切片改为语义钩子 `data-board-column-total` 后复跑 **52/52**，本切片未受影响；边界复跑 5 文件 72/72 与 5 文件 75/75。未跑整仓 `npm test`、未 build、未 deploy、未重生成 inventory。

## 11. Wave 2 · 外壳（I5 `command-palette` / I6 `animated-sidebar` 复核 + chrome 一致性）

日期 2026-10-17。范围：`frontend/components/shell/{app-shell,command-palette,context-rail,navigation-policy}.tsx|ts` 与其套件。复核按**wrapper-first** 进行（不假设"没有透传口"就结束），取源按 §5 契约：`https://beui.dev/r/animated-sidebar.json`、`https://beui.dev/r/command-palette.json` 取回逐行核对，行号即 payload 文件内行号（`components/motion/*.tsx`）。

### 8.1 I6 `@beui/animated-sidebar`：仍不采用（结构性阻塞，wrapper 救不了）

1. **部件无法脱离 `AnimatedSidebar` 组合（决定性）**：行部件 `AnimatedSidebarMenuButton`（`:1028`）第一件事就是 `useAnimatedSidebarPanel()`（`:1044`），该 hook 在缺面板 context 时抛错（`:184-190`）；面板 context 是模块私有（`:171-172`），只由 `AnimatedSidebar`（`:578`）与 `MobileSidebar`（`:478`）提供、均未导出。所以"只取桌面栏、绕开它的移动分支"在组合层面不成立——要用行部件就必须渲染它自带移动分支的那个组件。
2. **移动分支不可关闭**：`AnimatedSidebar` 在 `context.isMobile` 时直接 `return <MobileSidebar>`（`:523-530`），`isMobile` 来自模块私有 matchMedia `(max-width: 767px)`（`:42`、`:141-160`）；`AnimatedSidebarProps`（`:489-497`）只有 `children/side/variant/collapsible/ariaLabel/panelClassName`，没有任何开关。该分支自带 portal 面板（`:384` 包裹层、`:401` `role="dialog"`）、硬编码英文背板名 `"Close sidebar"`（`:390`）与自己的 Tab 陷阱/Escape/body 滚动锁（`:434-470`）⇒ 会在 I2 已收敛的唯一面板原语 `ui/sheet.tsx`（→`motion/drawer`）之外并存第二份移动面板；外壳移动抽屉的断言正走那条通道（`test/unit/workspace-shell.test.tsx:327-357`、`:359-384`、`:386-406`）。
3. **行钩子与 SPA 导航无法承载**：行 props 是封闭工厂（`AnimatedSidebarMenuButtonProps` `:1013-1025`、`AnimatedSidebarMenuSubButtonProps` `:921-931`），渲染出的 `motion.a`/`motion.button`（`:1139`/`:1160`、`:981`/`:999`）不 spread 任何剩余属性 ⇒ `data-route-id`/`data-nav-node`/`data-nav-depth`/`data-nav-availability`（`frontend/components/shell/app-shell.tsx:184`、`:186`）只能挪到外层 `AnimatedSidebarMenuItem`（把钩子从可交互元素上移走，`test/unit/frontend-shell.test.tsx:89-91`、`:110-112` 与 `workspace-shell.test.tsx:147` 都按行锚点取这些值）；且 `select`（`:1055`）在 `href` 行上**无法 preventDefault**（`select` 只对 `disabled` 抑制默认行为 `:1050-1053`）⇒ 侧栏点击会变成整页导航，`AppShell` 的 `event.preventDefault(); onNavigate(path)`（`app-shell.tsx:184`）与 `workspace-shell.test.tsx:262-283`（真实链接 + `onNavigate` 的滚动/历史契约）失效。`aria-expanded` 只能整行（caret 被合进行内 `:1111-1123`），折叠态选中分组还会**展开整条栏**（`:1063-1065`），与外壳"折叠态保留 `sr-only` 标签、隐藏 caret"不同。
4. **布局/断点**：payload 的 `aside` 是 `hidden … md:block`（`:551-553`）＋ flex wrapper `div[data-slot="sidebar-wrapper"]`（`:286`）；外壳是 `fixed inset-y-0 … lg:block` + 内容 `lg:pl-64`（`app-shell.tsx:110`、`:127`），被 SSR 类串断言钉住（`test/unit/frontend-shell.test.tsx:44-58`）。768–1023 会出现"payload 桌面栏与外壳移动抽屉同时在"。
5. **顺带核过的已装替代**：`motion/file-tree` 的行是 `role="treeitem"` 的 `<button>`（`file-tree.tsx:344-410`），声明部件 `FileTreeFolder/FileTreeFile` 单渲染返回 `null`（`:83-89`），无属性透传 ⇒ 承载不了外壳 `<nav>` + `a[href]` 链接契约（`frontend-shell.test.tsx:58-125`、`workspace-shell.test.tsx:72-78`）。`motion/shared-layout-bg` 的 pill 动 `filter: blur()`（`shared-layout-bg.tsx:41-48`），违反"只动画 transform/opacity"的设计锁 ⇒ 外壳自己的 `layoutId` pill 保留。
6. **安装层**：`lucide-react`（依赖表 + `ChevronRight`）按 §5 属可适配项（改 Phosphor），**不作为阻塞**；但 payload 的 `lib/ease.ts`、`components/motion/shared-layout-bg.tsx` 会覆盖既有件（`ease.ts` 缺 `SPRING_GLIDE.type: "spring"`，见 `frontend/lib/ease.ts:54`）。另：provider 无条件注册全局 `Cmd/Ctrl+B` 并 preventDefault（`:43`、`:255-262`），属新增全局键盘行为，外壳不采纳。

### 8.2 I5 `@beui/command-palette`：仍不采用

1. **wrapper 无处可挂 `data-command-id`（决定性）**：payload 只导出 `CommandPalette` 一个组件（`:54`），行是**内联 JSX**，不是可组合部件（`:283-350`）；props 只有 `items/shortcut/placeholder/emptyMessage/open/onOpenChange`（`:35-46`），`CommandItem`（`:24-36`）也无属性口，行上只有索引 `id={`${uid}-opt-${idx}`}`、`role="option"`、`data-index`（`:295-303`）。外壳套件按 `data-command-id` 取行（`frontend/components/shell/command-palette.tsx:99`；`workspace-shell.test.tsx:90`、`:98`、`:113`），保留只能 fork 其内部行渲染器（比 `ui/sheet.tsx` 在 children 上组合 `drawer` 更深）。
2. **Enter 语义相反**：`onKeyDown` 挂在面板容器（`:237`）且 Enter 无条件 `preventDefault()` 后执行**光标行**（`:153-166`）⇒ 行按钮原生激活被吞。外壳有守卫 `if (event.target !== inputRef.current) return`（`command-palette.tsx:92`）与断言 `enter.defaultPrevented === false`（`workspace-shell.test.tsx:94-107`）。
3. **焦点契约**：payload 只用 rAF 聚焦输入框（`:149-152`），无焦点陷阱/无归还/无 `data-focus-scope`；外壳面板走 `ui/dialog.tsx:20,35`（`ui/focus-scope.tsx`）。且它自己 portal 两个 overlay（`:187-266`）并锁 `documentElement`/`body` 滚动（`:107-121`），与 `ui/dialog` 的既有语义双份处理。
4. **英文无障碍名无覆盖口**：`:194` `"Close command palette"`、`:222` `"Command palette"`、`:273` `"Commands"`；外壳用 `SHELL_COMMAND_PALETTE`（`command-palette.tsx:97,98`；`frontend/lib/i18n.ts:654`/`:2672`）与 `SHELL_COMMAND_PLACEHOLDER`。仅 `placeholder`/`emptyMessage` 可覆盖。
5. **检索模型**：payload 用 `lib/command-search.ts` 模糊打分 + 分组重排（`:124`）；外壳 `filterCommands` 是"保序、id/标签键/本地化关键词、大小写不敏感"，由 `test/unit/command-palette.test.ts:11-20` 直接断言。

结论：与 2026-10-16 的 I5/I6 判定一致，但依据更精确（本轮给出 wrapper-first 的失败点：行部件/行渲染器不可组合、移动分支无开关、`onSelect` 无法取消默认导航）。`frontend/components/shell/{app-shell,command-palette}.tsx` 的导航与面板实现未替换。

### 8.3 本轮 chrome 一致性改动（外壳就地换源 Wave 1 基元）

- `frontend/components/shell/app-shell.tsx`：
  - 侧栏「即将推出」行、分组切换行（桌面 + 移动抽屉两处）由手写 `<button>` 换成 `ui/button` 的 `Button`（`variant="ghost"`，行几何仍用 `className` 表达：`h-9`/`min-h-10`、`justify-start`、`gap-3`、`rounded-md`、`font-normal`，并 `hover:bg-transparent`——该栏的 hover 反馈仍由共享 `layoutId` pill 单独承担）；caret 切换换成 `Button size="icon"`（`h-8 w-8`，命中区 22px → 32px）。`data-nav-node`/`data-nav-depth`/`aria-expanded`/`aria-disabled` 原样保留。回归断言：`test/unit/workspace-shell.test.tsx:139-162`（分组展开/折叠 + `aria-expanded` 翻转 + 子项出现/消失）。
  - 面包屑：可见性只留在 topbar 包装层（`lg:flex`），`Breadcrumb` 自身只留 `min-w-0`——原先"`sm:flex` 包装 + 组件 `hidden lg:flex`"造成的 640–1023 空层消失；首级「首页」crumb 改为 `event.preventDefault(); onNavigate("/")`，与侧栏/协作链接同一套 SPA 导航（原先整页刷新）。回归断言：`test/unit/workspace-shell.test.tsx:164-173`。
- `frontend/components/shell/context-rail.tsx`：「打开模块」CTA 由手写 `<a class="border px-3 py-2 …">` 换成 beUI `ButtonLink variant="outline" size="md"`（`motion/button/base`，Wave 1 对"链接形按钮"的既有约定）；模块行/动作行仍是行（不是按钮），与侧栏行同一套几何，未动。
- 有意未改：移动导航真实开关仍是 `<details><summary>`（`app-shell.tsx:311`；`workspace-shell.test.tsx:327-357` 与截图验收都锁这条通道）；`command-palette.tsx` 的行按钮（`role="option"` 的 listbox 契约 + `data-command-id`）；`shell/*` 内无 skeleton（`grep -n "keleton" frontend/components/shell/*` 无命中），故无骨架可对齐。
- 两处"已装件用不上"的记录：`motion/animated-badge` 不能当外壳未读数 pill——它的 `AnimatePresence mode="popLayout"` 会在退出动画期间保留旧标签（`animated-badge.tsx:238-260`），而套件按精确 `textContent` 断言（`test/unit/frontend-shell-notifications.test.tsx:40-46`）；`motion/shared-layout-bg` 见 §8.1.5（blur）。

### 8.4 落在 wrapper 上的 `data-*` 钩子

**零个**：两个 slug 均未采用，因此没有把任何钩子从交互元素移到包装元素上。逐个核对过"必须留在原处"的钩子与位置：`data-route-id`（行锚点，`app-shell.tsx:133`、`:184`）、`data-nav-node`/`data-nav-depth`/`data-nav-availability`（行包装，`app-shell.tsx:186`）、`data-command-id`（palette 行）、`data-shell-*`（外壳骨架：`root`/`sidebar`/`topbar`/`content-scroll`/`mobile-scroll`/`collapse-toggle`/`account-footer`）、`data-account-*`/`data-theme-*`/`data-menu-id`/`data-notification-summary`（菜单与未读）。本轮换成 `Button` 的移动行只是把 `data-nav-node`/`data-nav-depth` 从 `<button>` 平移到 `Button`（同一元素位置，选择器不变）。

### 8.5 门禁（本切片）

`npm run typecheck` 干净；8 套件 / 109 测试全绿：`workspace-shell`(31，含本轮新增 2 条)、`frontend-shell`、`frontend-shell-notifications`、`command-palette`、`frontend-menu-keyboard`、`frontend-context-rail`、`frontend-a11y`、`ui-shell`。额外跑了同样渲染 `AppShell` 的 3 个邻接套件（`frontend-recycle-bin-navigation`、`frontend-boards-route`、`frontend-responsive`，56 测试）全绿。未跑 build/deploy，未改 ledger 文件与 `frontend-operation-inventory.*`，未新增 i18n 键、未新增 `data-*` 钩子。

## 11. Wave 2 · 知识阅读器（ReaderSurfaces 切片，2026-10-17）

**新增 beUI 源 1 个**：`frontend/components/motion/collapsible.tsx`（registry `https://beui.dev/r/collapsible.json` 手工落盘：`lucide-react` ChevronDown → Phosphor `CaretDown`、`@/lib/{ease,utils}` 改相对路径；payload 自带的 `lib/ease.ts` / `lib/utils.ts` 与本仓库同实现，未覆盖；未新增依赖）。文件头记两处有意偏离 payload：触发体 `rounded-xl` → `rounded-lg`（单一 `--radius`），触发体加 `max-lg:min-h-11`（44px 移动下限，与 `ui/select`、`ui/filter-select`、`ui/filter-disclosure` 同一条规则）。

**接入方式**：`frontend/pages/knowledge-reader-page.tsx` 的 `ReaderSection` 一个包装承担四个分区——Card 保留自己的 `data-*` 钩子，标题仍是 `CardTitle`（`h3`），触发器放 `CardAction` 槽并经 `CollapsibleTrigger render={<Button size="icon" variant="ghost">}` 复用产品按钮表面（payload 的 `render` 槽正是为此），全部默认展开。

| 面 | 变成 |
| --- | --- |
| 目录/大纲 `[data-reader-outline-card]` | beUI collapsible；`nav[aria-label]`、每标题一个 `<button>`、`aria-current="location"`、点击选 chunk 全部原样 |
| 来源 `[data-source-panel]` | collapsible；下载链接进 action 槽、两块元信息进 description、chunk 列表与选中预览原样 |
| 相关知识 `[data-related-knowledge]` / 反向链接 `[data-backlinks]` | collapsible（loading/error/empty/ready 四分支同一外壳；`idle` 仍返回 `null`） |
| 衍生品 timeline 事件描述（`knowledge-derivatives-panel.tsx`） | 每条事件一个 collapsible，日期＋标题为触发体（默认展开） |

**保留的契约（有断言）**：单 `h1` 与正文标题降级、`pre` 内 `# not a heading` 不成为标题（`test/unit/frontend-reader-content-headings.test.tsx:93`、`test/unit/frontend-a11y.test.tsx:113`）；`data-reader-outline` aside 的 `lg:sticky lg:top-6 lg:self-start`（`frontend-a11y.test.tsx:117`）；三个面板锚点 `#reader-outline-panel` / `#reader-sources-panel` / `#reader-research-panel`（移动端 tab 的 `aria-controls` 与衍生品「打开研究」的 `href="#reader-research-panel"` 指向它们——研究运行卡因此**不做**披露）；`.markdown-content pre/table` 的自身横向滚动（`frontend/styles/globals.css:127`）未动；笔记卡 `data-reader-note` / `data-note-save="explicit"` 与 `#reader-note-title`/`#reader-note-body` 的 sessionStorage/回执路径完全在披露之外；分享按钮 24×32 目标（`knowledge-share-button.tsx:31`）未动。新增断言 `test/unit/frontend-reader-section-disclosure.test.tsx`（5 条：四分区钩子＋h3＋`aria-controls` 一一对应、默认展开、锚点、折叠后 chunk 导航仍生效、笔记卡不在披露内、timeline 事件披露）。

**有据拒绝**：`bouncy-accordion`（单开手风琴且条目无 `data-*` 透传，会把现在同时可见的分区藏起来；同一交互面再引一套披露实现违反「一个交互面一套实现」）；`morphing-lightbox`（阅读器正文走 `frontend/lib/markdown-renderer.ts:49` 的白名单，`img` 不在其中 ⇒ 阅读器不渲染任何图片；唯一的 `<img>` 在 peer 持有的 `frontend/components/agents/citations.tsx:118`）；`file-tree` 作目录（行是 `role="treeitem"`，props 只有 `value/name/icon/disabled/className/action`，挂不上 `aria-current`，而目录契约是 `[data-reader-outline] button` + `aria-current="location"`，见 `frontend/components/motion/file-tree.tsx:357-361` 与 `frontend-reader-content-headings.test.tsx:116-123`）；FAQ 用 `collapsible`（beUI 根把 children 包在两层 div 里，`dl > dt/dd` 结构无法保持）。

**门禁（本切片）**：`npm run typecheck` 干净；`frontend-knowledge-*` / `frontend-reader-*` / `frontend-a11y` 共 34 文件 / 378 测试全绿（含新增套件）。`motion/collapsible.tsx` 需由 ledger 持有者补「未分配操作」行并重生成 inventory。

## 11. Wave 2 · Agent 会话（`message`／`message-bubble`／`message-scroller`／`streaming-response`／`agent-activity`／`reasoning-text`／`thinking-shimmer`，2026-10-17）

范围：`frontend/pages/agent-page.tsx`、`frontend/components/agent/{answer-panel,agent-transcript}.tsx`、`frontend/app.tsx` 的 `AgentConversationRoute` 会话线程、`frontend/components/agents/*`。取源按 §5 契约（`https://beui.dev/r/<slug>.json` 的 `files[].content` 逐字落盘）；下文行号除注明外均为**本仓库文件**行号。

### 11.1 落盘的 slug（12 个源文件，仅三类适配）

| slug | 落盘路径 | 替换的手搓面 |
| --- | --- | --- |
| `message` | `components/agents/message.tsx` | 恢复后会话里 `app.tsx` 手写的 `<article class="rounded-md border p-3">` 行 |
| `message-bubble` | `components/agents/message-bubble.tsx` | 同上（气泡）+ `answer-panel.tsx` 手写的答案卡 `<div class="rounded-lg border bg-card p-5">` |
| `message-context` | `components/agents/message-context.tsx` | — （`message`／`message-bubble` 的对齐 context） |
| `message-scroller` | `components/agents/message-scroller.tsx` | 线程滚动容器（原先无：整段历史直接铺在页面流里） |
| `streaming-response` | `components/agents/streaming-response.tsx` | `data-page-state="loading"` 里「进度 + 停止」的作答中区 |
| `agent-activity` | `components/agents/agent-activity/{index,activity-row,types}.tsx` | 阶段进度（原先只有 `AgentProgress` 一个脉冲字形 + 一句阶段文案） |
| `reasoning-text` | `components/agents/loading-states/reasoning-text.tsx` | 首阶段到达前的「正在准备答案」等待态 |
| `thinking-shimmer` | `components/agents/loading-states/thinking-shimmer.tsx` | 活动行里的当前阶段文案（`agent-activity` 的默认 working 行） |
| `text-shimmer`／`text-scramble`／`lib/text-shimmer` | `components/motion/{text-shimmer,text-scramble}.tsx`、`lib/text-shimmer.ts` | 上述两件的内联依赖（新增 lib 文件，未覆盖任何既有 lib） |
| `preview-rail` | `components/motion/preview-rail.tsx` | `message-scroller` 的静态依赖（本轮**未启用** rail，见 §11.6） |

适配只有三类：`@/lib|@/components` → 相对路径、`lucide-react` → `@phosphor-icons/react`（`ChevronDown→CaretDown`、`RotateCcw→ArrowClockwise`、`Globe2→Globe`、`ImageIcon→Image`、`MessageSquare→Chat`、`Search→MagnifyingGlass`、`Sparkles→Sparkle`、`SquareTerminal→TerminalWindow`、`FileText/Check/Copy/Circle/PencilLine/Wrench/ThumbsUp/ThumbsDown` 同名）、`process.env.NODE_ENV → import.meta.env.DEV`（本批 payload 未出现）。既有 `lib/{ease,utils,touch,text-*}.ts`、`lib/hooks/{use-dismiss,use-hover-gesture,use-tap-gesture,use-favicon}`、`motion/loader.tsx`、`agents/{agent-disclosure,citations,code-block,agent-code}.tsx` **未覆盖**（逐字 diff 只差导入说明符）。

### 11.2 接入点与保留的契约

| 面 | 改法 | 保留 |
| --- | --- | --- |
| 恢复的会话线程 | `frontend/components/agent/agent-transcript.tsx:13-16`：`section[aria-label=AGENT_HISTORY]` + `h2` + 说明段（原样）＋ `MessageScroller`（`h-80 lg:h-96` 自身滚动区）＋ 每条 `Message`／`MessageBubble`（`data-from`／`data-slot`）＋ 引用链接放在 `MessageFooter` | `AGENT_HISTORY`／`AGENT_HISTORY_DETAIL`／`AGENT_QUESTION_LABEL`／`AGENT_HISTORY_ANSWER` 四键与 `a[href]` 引用；`app.tsx:1425` 由整段手写 JSX 收敛为一行 `<AgentTranscript/>` |
| 作答卡 | `answer-panel.tsx:16`：`MessageBubble variant="soft"` + `MessageBubbleContent className="max-w-none p-5"`（`cn` 为 twMerge，`max-w-none/p-5` 覆盖气泡默认 `max-w-[82%] px-3.5 py-2.5`，已核对合并结果） | 置信度标签、`AGENT_NO_ANSWER`、冲突块（未动）、`Citations`（已装件） |
| 作答中 | `agent-page.tsx:94`：`[data-page-state="loading"][aria-busy="true"]` 仍是外层容器（`frontend-agent-page-summary.test.tsx:58` 依赖），内层换成 `<StreamingResponse status="streaming" announce={false}>`（`data-state="streaming"`／`aria-busy`）；`AGENT_STOP` 仍在页面上（`StreamingResponse` 流式中不渲染任何动作按钮，无英文名泄漏） | 停止按钮、`AGENT_STOPPED_*`、`data-agent-unavailable`、`AGENT_INTENT_UNKNOWN` 面板、来源范围控件、写阻断守卫全部未动 |
| 阶段进度 | `agent-page.tsx:29-49`：`AgentActivity`（`contentType="step"`、`status="working"`）把 `ChatStage` 顺序画成四步（已完成打勾／当前脉冲／未到置灰），working 行用 `ThinkingShimmer`（`activeLabel` 为本地化阶段文案），当前步 `meta` 保留原有的秒数读数（`useElapsedSeconds`，1s 精度）；`stage` 为 `null` 时渲染 `ReasoningText variant="swap"`（`AGENT_PREPARING`） | 四个 `AGENT_STAGE_*` 键、`AGENT_PREPARING`、`role="status"` 播报（无英文无障碍名：`agent-activity` 的 `getActiveLabel`／`getSummary` 英文默认值未被触发） |

`agent-activity` 的 `maxHeight` 取 140（`AGENT_STAGE_ROWS_HEIGHT`）：组件在 working 态把视口高度**固定**为该值（`agent-activity/index.tsx:155`），四步行高为 4×28 + 3×2 + 16 = 134，取 140 既不裁剪已完成阶段也不留大片空白。

### 11.3 删除的件：`frontend/components/agents/agent-progress.tsx`

唯一调用点是 `agent-page.tsx:48` 的加载态；换成 `agent-activity`（含脉冲语义）＋ `useElapsedSeconds`（保留计时）后成为死代码，按「一个交互面只有一套实现」删除。`grep -rn "agent-progress\|AgentProgress" frontend/ test/` 现无命中；`docs/product/frontend-operation-inventory.*` 中它的条目由父级重生成。

### 11.4 I4 复核：`prompt-input` 仍不采用（composer 保持现状）

用当前 live payload 复核（`components/agents/prompt-input.tsx`）：发送/停止仍是**同一个图标按钮**，无障碍名是硬编码英文 `"Stop generating"`／`"Send prompt"`（`:300-307`，名字在 `:304`），`+` 动作触发器同样硬编码 `"Add to prompt"`（`:200-207`，`:205`）。覆盖口**不存在**：props 接口 `:47-67` 无 label/button-props 项，唯一 spread `{...textareaProps}`（`:90`）落在 `<textarea>`（`:190`），调用方 `aria-label` 被 textarea 吃掉（`:88`、`:188`）。草稿/`id`/`disabled`/placeholder 它能承载（`:183-194`），所以结论与 2026-10-16 一致：**能承载守卫，不能承载 `AGENT_SUBMIT`／`AGENT_STOP` 的双语无障碍名**。另：`lucide-react` 仍不在依赖表；payload 还会覆盖已定制件（`motion/select.tsx`、`lib/ease.ts` 缺 `SPRING_GLIDE.type`、`button/stateful.tsx`）。判据写在 `frontend/pages/agent-page.tsx:74-88`。

### 11.5 `feedback-widget`：不采用（每会话反馈保持现有实现）

`feedback-widget.tsx` 的数据面只有 `{ message: string }`（`:42-44`）＋ 6 个 props（`:46-54`），**无法表达** `useful | not_useful | citation_error` 三档评分与 `citationIds`；它自己拥有 `idle/open/sending/sent/error` 生命周期与提交按钮（`:69-70`、`:137-148`、`:405-414`），会绕过 `AgentFeedbackAdmission.begin/settled` 与 `app.tsx` 的 `data-agent-feedback-record-blocked`／`data-agent-feedback-unconfirmed` 两条未知结果恢复路径；根节点只接 `className`（`:215-221`），无 `data-*`／`aria-label`／render-prop 透传；`Close`（`:378`）、`Cancel`（`:403`）、`Submit`（`:413`）、`Sending`（`:407`）、`Thanks!`（`:331`）、`Something went wrong`（`:353`）、`Try again`（`:359`）等 7 处英文无覆盖口（只有 `title`、`placeholder` 可覆盖）。故 `frontend/components/agent/agent-feedback.tsx` 未改动。

### 11.6 `agent-history-list.tsx`：保持现状（无匹配 slug）

它是**分页会话索引**（游标分页 + 打开会话重新授权），不是消息线程；registry 143 个 slug 中没有列表/索引件，用 `message`／`message-scroller` 承载会把「会话」误标成「消息」。其 DOM 契约还被 `test/unit/frontend-agent-page-summary.test.tsx:113-128` 钉住（`section[aria-label]` + 直接子 `div` 的 `overflow-auto` + `a[href="/agent?conversationId=…"]` + 重试/翻页按钮）；其中所有按钮已走 Wave 1 的 `ui/button`。`AGENT_LIST_*` 八键与历史读失败重试未变。

### 11.7 遗留（只报告不改）

- **`message-scroller` 的导航 rail 未启用**：`navigation="rail"` 会给每条消息生成硬编码英文无障碍名 `` `Go to ${sender} message ${i} of ${n}` ``（`components/agents/message-scroller.tsx:241`），而 `navigationLabel` 只覆盖 rail 自身名字；本仓库不许新增 i18n 键，故本轮只落 `preview-rail.tsx` 作为静态依赖，不渲染 rail。
- **`streaming-response` 的完成态动作行缺口径**：`status="complete"` 会渲染 `Copy response`／`Retry response`／`Helpful`／`Not helpful`／`N sources`（`:190`、`:201`、`:208`、`:215`、`:233`），均无覆盖口。本轮只用 `status="streaming"`（该分支 `shouldShowActions` 为 false），未来若把已结算答案也搬进该组件，需先补 labels 透传。
- **`message` 的默认无障碍名是英文**（`components/agents/message.tsx:89`，`` `${from} message` ``）：调用点必须显式传本地化 `aria-label`，`agent-transcript.tsx:17` 已传，新增调用点须照做。
- **`agent-activity`／`reasoning-text` 的英文默认值**（`getActiveLabel`／`getSummary`／`DEFAULT_PHRASES`）只在调用方不传时出现；当前调用点都传了本地化文案。
- 本轮未跑 build／deploy，未改 `frontend/lib/i18n.ts`、ledger 三件、`frontend-operation-unassigned-review.md`，未重生成 `frontend-operation-inventory.*`，未新增 `data-*` 钩子。

### 11.8 门禁（本切片）

`npm run typecheck`（worker + frontend）干净。套件：`npx vitest run frontend-agent-cancellation-route / frontend-agent-page-summary / frontend-agent-source-identity / frontend-agent-receipt-read / frontend-agent-data / frontend-agent-turn-intent / frontend-a11y / frontend-graph-a11y / chat-feedback-service` → **9 文件 / 123 测试全绿**（`frontend-agent-page-summary` 本轮新增 2 条，见下）。新增断言：`test/unit/frontend-agent-page-summary.test.tsx:131`（作答中：`data-state="streaming"`、`data-content="step"`、中文阶段文案在、`Thinking`／`Searching the web` 不在、英文 `Stop` 不在）与 `:146`（恢复线程：每条 `Message` 的 `aria-label` 为本地化角色名、无 `user message`／`assistant message` 英文默认名、引用链接保留、滚动区 `h-80 lg:h-96` 且不吃页面高度）。

## 12. Wave 3 · 一致性收口（ConsistencyCleanup 切片：圆角／骨架／依赖／`folderMode`，2026-10-17）

**结论**：本切片登记的 5 个目标里 **3 个在此前波次已关闭**（本节 12.1 逐条附 grep，不再改动），真正落地的是 2 项：移除已无导入点的 `@radix-ui/react-tooltip`（并把它此前以传递依赖身份供给 beUI tooltip 源的 `@floating-ui/dom` 转为直接依赖，见 12.2），删除零调用点的 `AssetDropzone.folderMode`（12.3）。`frontend/` 生产代码净改动 **2 行**（`asset-dropzone.tsx`），未改 `frontend/lib/i18n.ts`、未动 ledger 三件、未重生成 operation inventory、未新增 i18n 键与 `data-*` 钩子。

### 12.1 三个"残留"的复核：均已合规（证据即 grep，本轮零改动）

| 登记项（§6 Wave 3 待清理） | 实际状态 | 证明 |
| --- | --- | --- |
| `motion/card.tsx` 残留 `rounded-2xl` | **无残留**：根节点是 `rounded-lg` = `--radius` | `grep -n "rounded" frontend/components/motion/card.tsx` → 仅 `:7,:8`（文档注释里说明"payload 的 `rounded-2xl` 会带来第二套圆角"）与 `:126` 的 `rounded-lg` |
| `motion/alert.tsx` 残留 `rounded-xl` | **无残留**：外壳是 `rounded-lg` = `--radius` | `grep -n "rounded" frontend/components/motion/alert.tsx` → `:150`（注释）＋ `:152`（`rounded-lg p-4`）＋ `:236`（关闭按钮 `rounded-lg`） |
| `ui/skeleton.tsx` 直引 `motion/react` | **无该导入** | `grep -rn "motion/react" frontend/components/ui/skeleton.tsx` → 0 行。§10.2 已把脉动改为 `motion-safe:animate-pulse`（只动 `opacity`，reduced-motion 下不应用动画），因此 §6 那一行"适配层外 `motion/react` 11"已由 §10.2 自行回填为 10 |

`rounded-lg` 为什么等于 `--radius`：`frontend/styles/globals.css:22` 定义 `--radius: 0.55rem`，`:89` 定义 `--radius-lg: var(--radius)`，因此这两个文件用的是唯一圆角刻度，无需替换为任意值写法。

**`ui/skeleton.tsx` 为何不改成"渲染 `loader`"（有意保留，非遗漏）**：`Skeleton` 是**条形占位**（`h-8`／`h-24` 两块，调用点见 `ui/page-state.tsx:21`），`motion/loader` 是**旋转/点阵指示器**；把条形位换成 loader 会改掉 loading 态的几何与观感（等于换了一个加载表示），而 §10.2 已经落实了"加载态的 beUI 源由 `page-state.tsx` 直接渲染已装 `motion/loader` 承担"。本切片验收要求"此外无行为变化"，故保留现有实现。

### 12.2 依赖：`@radix-ui/react-tooltip` 移除；`@floating-ui/dom` 转为直接依赖（**必须一并做**）

1. 先证明无导入点：`grep -rn "@radix-ui" frontend test scripts --include=*.ts --include=*.tsx --include=*.mjs` → 全仓仅 `scripts/.environment-page-*`（**未跟踪、已 gitignore 的旧构建产物**，`git ls-files scripts | grep -c '.environment-page'` = 0，由 `scripts/browser-vm-environments-page.test.mjs:10` 每次重建）里出现。源码零导入。
2. `npm uninstall @radix-ui/react-tooltip` → `removed 24 packages`。`package.json` 依赖表不再有条目；`grep -c "react-tooltip" package-lock.json` = **0**；`npm ls @radix-ui/react-tooltip --depth=0` → `(empty)`；`node_modules/@radix-ui/react-tooltip` 已不存在。锁文件改动 `-434/+3`：删除的全部是该包及其独占传递依赖（`@floating-ui/{core,dom,react-dom,utils}`、`@radix-ui/*`），新增的 3 行只是 `@types/react`／`@types/react-dom`／`csstype` 从 `devOptional` 降为 `dev`（它们此前因该包的 optional peer 而标 `devOptional`），无版本变化。
3. **捆绑修掉它造成的断链**：`@floating-ui/dom` 原本只是 `@radix-ui/react-tooltip` 的传递依赖，但已落盘的 beUI tooltip 源**真接**它——`frontend/components/motion/tooltip/use-position.ts:14`（`arrow/autoUpdate/computePosition/flip/hide/offset/shift/Placement/VirtualElement`）。移除 radix 后该 import 立即无解析目标（`npm run typecheck:frontend` 报错、所有 import `frontend/app.tsx` 的套件无法加载）。处置：`npm install @floating-ui/dom@^1.8.0`（解析为 **1.8.0**，与此前树内版本逐字相同）→ `package.json` 的 `dependencies` 新增 `"@floating-ui/dom": "^1.8.0"`，**`use-position.ts` 保持 payload 原样，未改一行**。这不是"擅自安装 payload 依赖"：该包此前已在依赖树内且被源码使用，只是身份是隐式传递依赖；把它写成直接依赖是让既有事实显式化，没有新增任何能力。（同理，§7.1 记的 `attachment-upload` 需要 `@floating-ui/dom` 的判据不变——那是**别的 slug** 的需求报告，与本次转正无关。）

### 12.3 死代码：`AssetDropzone.folderMode` 确认零调用点后删除

- 调用点取证（删前）：`grep -rn "folderMode" --include=*.ts --include=*.tsx --include=*.mjs . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist` → 源码只有**声明与其自身的消费**（`asset-dropzone.tsx:6` 形参、`:44` 的 `webkitdirectory` 分支），另两处命中在未跟踪的 `scripts/.environment-page-*` 构建产物里。零个调用点：`asset-availability-panel.tsx:36` 与 `asset-upload-panel.tsx:33` 都不传、`test/` 无任何 `folderMode`。
- 删除内容：形参 `folderMode = false`、类型字段 `folderMode?: boolean`、以及 `input` 上 `{...(folderMode ? ({ webkitdirectory: "" } as Record<string, string>) : {})}` 这层 `Record<string, string>` 断言（顺带去掉本文件唯一一处对 DOM 属性的非类型安全写法）。默认值语义等价：默认分支本来就是"不写 `webkitdirectory`"，故**零行为变化**。
- 保留：`displayRelativePath`（`asset-upload-model.ts:26`）不动——它服务队列里的相对路径显示（`asset-dropzone.tsx:46`），且 `test/unit/frontend-submit-pages.test.tsx:237-238` 直接断言其净化行为；被删的只是"能否用目录选择器产生 `webkitRelativePath`"这条从未启用的入口。

### 12.4 只报告、不动的遗留（越出本切片范围）

- `frontend/components/ui/dialog.tsx:69` 仍是 `rounded-2xl`（`1rem`），`frontend/components/motion/shared-layout-bg.tsx:109` 的 `rounded-2xl` 属 payload 原文。前者是适配层内的第二套圆角，与 design lock（唯一 `--radius`）相抵，但它是本应用唯一模态的面板几何、且 §9 已记录"`ui/dialog.tsx` 保留适配层"的整体判据；改它会动 15 个导入点的观感，应由一致性锁的**父级验收**统一裁决，本切片不自作主张。
- `scripts/.environment-page-*` 两份旧构建产物仍含 `@radix-ui/react-tooltip` 与 `folderMode` 的字符串：未跟踪、gitignored、每次测试重建，无需清理（重新跑 `browser-vm-environments-page.test.mjs` 即刷新）。

### 12.5 门禁（本切片）

`npm run typecheck`（worker + frontend）**干净**。套件：`npx vitest run shadcn-primitives frontend-tooltip-source frontend-asset-dropzone frontend-asset-upload-route frontend-asset-availability-route frontend-submit-pages` → **6 文件 / 35 测试全绿**；依赖变更的消费面复跑 `npx vitest run frontend-shell frontend-a11y workspace-shell` → **3 文件 / 53 测试全绿**（tooltip provider 与 `app.tsx` 的导入链在新依赖表下可正常解析）。

## 13. Wave 3 · 瞬态通知频道与 i18n 死键（ToastAndI18n 切片，2026-10-17）

**结论：`animated-toast-stack` 从"已通但几乎没用"变成通知面确认反馈的唯一出口；死键 `SUBMIT_ASSET_NOT_CONNECTED` 双向删除；没有新增 slug、没有新增依赖、没有新增颜色/圆角，持久态一处未动。**

### 13.1 落的调用点（`frontend/app.tsx`）

`ToastProvider` 的挂载点（`app.tsx:235`）不变，只把两处内联瞬态反馈改走频道：

| 调用点 | 之前 | 之后 |
| --- | --- | --- |
| `NotificationsRoute.onMarkRead`（`app.tsx:3136`） | 写成功后只重载列表，界面无确认 | `mutate(..., "NOTIFICATIONS_MARKED_READ")`；`await operation()` 解析后才入队 `status: "success"`、`duration: 3200` |
| `NotificationsRoute.onMarkVisibleRead`（`app.tsx:3137`） | 同上 | `mutate(..., "NOTIFICATIONS_MARKED_VISIBLE_READ")`，同一时序 |
| `TasksRoute.resolveListUnknown` 的 `outcome === "applied"`（`app.tsx:1929`） | 内联 `<p role="status">`（`:1955`） | 频道 `status: "success"`、`duration: 4000`，复用既有键 `TASKS_WRITE_APPLIED` |

实现要点：`mutate` 新增可选第三参 `confirmationKey`，只在 `await operation()` 成功且组件仍挂载（`activeRef.current`）时入队；`catch` 分支、`recordBlocked`、`NOTIFICATIONS_RECOVERY_DESCRIPTION`、`revokedTarget` 全部原样保留（**写失败/结果未知绝不弹成功 toast**，本轮新增套件对此有断言）。`onOpen` 不传 `confirmationKey`——它要么导航到目标、要么进入 `revokedTarget` 持久态，没有任何"瞬态成功"可报。

`TasksRoute` 的内联 `<p role="status">` **保留**，但只剩两个不属于"成功确认"的结算结果：`TASKS_WRITE_MISSING`（任务已不可用）与 `TASKS_LIST_WRITE_NOT_APPLIED`（更改不在任务上，可再试）。它们解释"列表为什么与这次写入不一致"，是用户后续动作的依据，按"持久态不动"的判据留在原处。`frontend/lib/use-toast.tsx` 的频道政策注释同步改写（原注释说"只给内联无处安放的事件"，已不成立）；`ToastApi` 形状未变，`useToast()` 在无 provider 时仍是 no-op（渲染壳与既有套件照旧）。

### 13.2 i18n 键（`frontend/lib/i18n.ts`）

**新增（en + zh-CN 成对，均无占位符）**

| 键 | en | zh-CN |
| --- | --- | --- |
| `NOTIFICATIONS_MARKED_READ` | `Notification marked as read.` | `已将该通知标记为已读。` |
| `NOTIFICATIONS_MARKED_VISIBLE_READ` | `Visible notifications marked as read.` | `已将当前可见通知标记为已读。` |

放在 `NOTIFICATIONS_MARK_VISIBLE_READ` 之后，与同组键相邻。文案不写条数：单条与批量各自的句子在两种语言里都自然，也不需要为此引入复数规则。

**删除（两种语言同时删）**：`SUBMIT_ASSET_NOT_CONNECTED`（en `:1869` 原「Object storage is configured, but uploads are not connected yet.」/ zh 原「对象存储已配置，但实际上传链路尚未接通。」）。§7.1 已查明 `frontend/` 无任何调用点（`AssetAvailabilityPanel` 只有 loading／读取失败／已配置未登录／未配置四态）；删除后 `frontend/`、`test/`、`shared/`、`scripts/*.mjs` 源码零引用，仅 `scripts/.environment-page-*` 两份未跟踪的旧构建产物还带这个字符串（每次测试重建，不清理）。

**保留（并说明理由）**：`SUBMIT_ASSET_DISABLED`。它**不是**死键——`frontend/components/assets/asset-dropzone.tsx:41` 用 `disabledMessage ?? frontendText(locale, "SUBMIT_ASSET_DISABLED")` 作缺省回退；两个现存调用点（`asset-availability-panel.tsx:36`、`asset-upload-panel.tsx:33`）都显式传了文案，所以它是"调用方漏传时仍给出可读边界"的兜底，删掉会把禁用态降级成空文案。按"保留回退、只删真死键"处理。

### 13.3 套件改动

- 新增 `test/unit/frontend-toast-confirmation.test.tsx`（3 条）：① 单条标记已读后 toast 出现在 `document.body`（portal），且**不在**路由自己的 `container` 里；② 批量标记已读的 body 仍是 `{ ids: [...] }`，两种语言各自出现对应文案；③ POST 500 时 `[data-page-state='error']` 恢复面与 `NOTIFICATIONS_RECOVERY_DESCRIPTION` 留在页面内、且不存在任何成功 toast。
- `test/unit/frontend-tasks-route.test.tsx` 的 `unknown list writes` render 助手改为包一层 `ToastProvider`，三处「The change was saved.」断言从 `container.textContent` 改为 `browser.document.body.textContent`（行为是有意迁移的，断言位置随之迁移；`banner()`、sessionStorage、leave-guard 断言一字未动）。`frontend-task-editor-route.test.tsx` 的两处同名断言属编辑器自己的 `notice`（`task-editor.tsx:278`），与本切片无关，未改且复跑通过。

### 13.4 门禁（本切片）

`npm run typecheck`（worker + frontend）**干净**；`npm run verify:i18n` **pass**（`keys=434 placeholders=55 files=6`；硬编码文案扫描通过）。套件：`npx vitest run frontend-notifications-route frontend-notifications-page frontend-notifications-data frontend-shell-notifications frontend-notification-summary-refresh frontend-i18n frontend-locale-pages frontend-tasks-route frontend-tasks-page frontend-toast-confirmation` → **10 文件 / 139 测试全绿**；相邻面复跑 `frontend-task-editor-route frontend-task-structure frontend-task-list-status frontend-task-list-notes` → **4 文件 / 91 测试全绿**。未改 ledger 三件、未重生成 operation inventory、未新增 `data-*`/`aria-*` 契约、未动任何持久态文案。

**交叉切片依赖**：本轮 `@radix-ui/react-tooltip` 退出依赖树时，`@floating-ui/dom`（此前仅经 radix 传递）一并消失，而 Wave 1 落盘的 `motion/tooltip/use-position.ts:14` 直接 import 它；ConsistencyCleanup 已把它转为直接依赖（`^1.8.0`），`use-position.ts` 保持逐字未改——本切片 final 门禁在上述依赖状态下取得。

## Wave 3 · 表单控件收口 + `range-slider`（ControlsAndRanges 切片，2026-10-17）

**结论：17 处裸 `<select>` 与 7 处裸 `<textarea>` 全部改走既有适配层（`ui/select`／`ui/textarea`），一处 `<input type="range">` 采用 beUI 的 `range-slider`；落盘 2 个 payload 文件（`components/motion/range-slider.tsx`、`lib/hooks/use-slider.ts`），未新增依赖、未新增 i18n 键、未改 `frontend/lib/i18n.ts`、未动 ledger 三件与 `frontend-operation-inventory.*`。**

`grep -rn "<select\|<textarea" frontend --include=*.tsx`（排除 `components/ui/`、`components/motion/`）现为**零命中**。

### 8.1 `<select>` → `ui/select`（17 处，12 文件）

`ui/select.tsx` 本身就是**原生** `<select>`（`§8.2.3` 已有的判定），只是画在共享字段壳上，所以每个调用点的 `id`／`name`／`aria-label`、`value`/`onChange`、`disabled`、`<optgroup>` 与 `data-*` 全部原样落地，无需任何测试驱动改写。

| 文件 | 处数 | 保留的契约（有断言的） |
| --- | --- | --- |
| `components/timeline-item-editor.tsx` | 1 | `aria-label=PROJECT_TIMELINE_EDIT_KIND`；`fieldset[disabled]` 锁 |
| `components/timeline-create-form.tsx` | 1 | `<label>` 包裹命名；`disabled={locked}` |
| `components/knowledge/knowledge-research-panel.tsx` | 1 | `#research-query-subquestion` + `data-research-query-subquestion` + `htmlFor` |
| `components/submissions/submission-target-picker.tsx` | 3 | `data-submission-target-space/-collection/-visibility`、`data-submission-target-collection-loading`、`disabled` 三态 |
| `components/inbox-create-form.tsx` | 1 | `aria-label=INBOX_KIND`；`[data-inbox-capture-dialog] select` 驱动（`frontend-inbox-create.test.tsx:175-179`） |
| `pages/tasks/task-editor.tsx` | 3 | `aria-label` 三键（含逐子任务 `` `${TASKS_SUBTASK_STATUS}: ${title}` ``）；`select[aria-label=…]` 驱动（`frontend-inbox-task-operation-matrix.test.tsx:85`） |
| `pages/settings-page.tsx` | 1 | 外层 `<label>`（`.sr-only` `SHELL_LANGUAGE_LABEL`）；`select.value`+change（`settings-page.test.tsx:83-84`）、静态标记 `"<select"`（`:33`） |
| `pages/admin/menu-editor.tsx` | 1（工厂） | `name` 属性（表单字段名）与 `<label>` 命名 |
| `pages/admin/analytics-page.tsx` | 1 | `#admin-analytics-range` + `label[htmlFor]`；`select.value="30"`+change 与 `.value` 断言（`frontend-admin-analytics-route.test.tsx:75,77,117,174,243`） |
| `pages/admin/spaces-page.tsx` | 2 | `#admin-record-status`／`#admin-record-parent`：`.value=`+change（`frontend-admin-space-confirmation.test.tsx:83-119`）、`#admin-record-parent option` 值序（`frontend-admin-space-recovery.test.tsx:143,151`） |
| `pages/submit-page.tsx` | 1 | `#submission-mode`（`frontend-user-read-pages.test.tsx:163` 断言 `id` 在位） |
| `pages/knowledge-reader-page.tsx` | 1 | `aria-label=KNOWLEDGE_NOTE_SHARE_SELECT`；`flex-1` 行为 `w-auto flex-1` 保住 |

**为什么不是 `ui/filter-select`**：这 17 处没有一处是工具栏分面筛选（无 `AppliedFilters` chip 契约、无 `button[aria-haspopup="listbox"]` 选择面）。它们都是带 `id`／`name`／`htmlFor` 关联的表单字段，且套件按原生控件驱动（`select.value` + `change`，见上表）。`analytics` 的 `days` 是页头里一个**有 label 关联的报告窗口字段**（`#admin-analytics-range`），换成 listbox 会让 `label[htmlFor]` 与那 5 条 `.value` 断言同时失效——那是换契约，不是统一外观。`filter-select` 保持只服务筛选行。

**几何**：全部落在共享字段壳（`h-11`、pill、`text-base`、`ring-ring/40`、`aria-invalid` 破坏性环），只保留调用点必需的覆盖：`analytics` `w-auto`（页头行）、`knowledge-reader` `w-auto flex-1 min-w-0`（与分享按钮同行）、`subtask-status` `mt-1`。移动端 44px 因此**只升不降**（原先多为 `h-9`/`h-10`）。

### 8.2 `<textarea>` → `ui/textarea`（7 处，5 文件）

| 文件 | 处数 | 保留 |
| --- | --- | --- |
| `components/knowledge/knowledge-research-panel.tsx` | 3 | `#research-completion/-steps/-subquestions` 与三个 `data-research-*`；套件按 `type("[data-research-completion]", …)` 键入（`frontend-knowledge-reader-research-draft.test.tsx:174-176`） |
| `components/review/review-source-panel.tsx` | 1 | `#reparse-candidate` + `data-review-reparse-candidate` + `rows={8}` + `disabled` + `font-mono text-xs` |
| `components/assets/asset-upload-panel.tsx` | 1 | `#asset-alternative-input` + `data-asset-alternative-input` + `rows={4}` + `disabled`；显示/隐藏断言（`frontend-asset-url-alternative.test.tsx:135-148`） |
| `pages/messages/thread-page.tsx` | 1 | `#discussion-composer`（11 处查询/键入，`frontend-discussion-route.test.tsx`）、`maxLength`、`placeholder`、`resize-y` 保留 |
| `pages/knowledge-reader-page.tsx` | 1 | `#reader-note-body` + `readOnly` + `maxLength`（`frontend-reader-note-sharing.test.tsx:37`、`frontend-reader-read-lifecycle.test.tsx:269,287`） |

多行几何仍是 `--radius` 系 `rounded-lg` + `min-h-24`（`textareaFieldClass`），单行仍是 pill——两行控件不再各写一份边框/焦点环。

### 8.3 `pages/goals-page.tsx` 的 `<input type="range">`：**采用** beUI `range-slider`

payload `https://beui.dev/r/range-slider.json`（5 个文件，逐行核对）。落盘 2 个、复用 3 个：`components/motion/range-slider.tsx` 与 `lib/hooks/use-slider.ts` 为新文件；payload 携带的 `lib/{ease,touch,utils}.ts` 与仓库**同名同实现**，按 §5 契约**不覆盖**（本仓库 `ease.ts` 的 `SPRING_GLIDE` 仍带 `type: "spring"`），payload 声明的 `clsx`/`motion`/`tailwind-merge` 均已在依赖中，**未新增任何依赖**。

它承载得住原有契约，逐条对照：

- **值**：受控 `value` + `onValueChange`（`use-slider.ts:62-79`）；`min/max/step` 同签名。`:69` 的 `clamp` 与 `:11-23` 的 `snapSliderValue` 保证 0–100/step 1 与原生一致（含 `max` 作为合法点）。
- **无障碍名**：`SliderOptions["aria-label"]`（`:33`）原样写到 handle（`:167`），仍是 `` `${GOALS_PROGRESS} ${goal.title}` `` 逐字。
- **播报**：handle 是 `role="slider"` + `aria-valuemin/max/now`（`:165-170`），与原生 range 的语义等价；并额外给了 `formatValueText={(value) => `${value}%`}` ⇒ `aria-valuetext="75%"`，与单元格里可见的 `{goal.progress}%` 对齐（原生 range 只播报裸数字）。
- **键盘**：`ArrowUp/Down/Left/Right`、`PageUp/PageDown`（±10 step）、`Home`/`End` 全部 `preventDefault` 后提交（`:121-140`）——原生 range 的键位集合是它的子集。
- **禁用**：`disabled` ⇒ 轨道 `pointer-events-none opacity-50`、handle `tabIndex=-1` 且 `aria-disabled`（`:166-172`）。原调用点的条件表达式（`statusConfirmation.open || createLocked || pending || goal.status === "archived"`）**逐字保留**。
- **同 tick 守卫**：原 `onChange={(event) => !statusConfirmation.isOpen() && …}` 的"确认面已开就丢弃同 tick 编辑"守卫**原样保留**在 `onValueChange` 里——这正是套件 `frontend-planning-status-confirmation.test.tsx`「blocks a same-tick progress change」所钉的行为。
- **设计锁**：颜色只用 `muted`/`foreground`（`bg-muted`、`bg-foreground/15|25`、`ring-foreground/30`），圆角 `rounded-lg` = `var(--radius)`；动效只动 `transform`（`x`、`scaleY`）且 `useReducedMotion` 下退化为静态（`:50,102`）。**一处有意偏离 payload**：轨道 `h-10` 上加 `max-lg:h-11`（44px 触控面不回退），已写在文件头注释里。

**测试驱动改写（4 文件，断言强度未降）**：`input[type="range"]` 已不存在，四处改为按滑块自己的契约驱动，而不是回钉类名或内部 prop：

| 套件 | 原驱动 | 现驱动 | 断言 |
| --- | --- | --- | --- |
| `frontend-planning-conflicts.test.tsx` | `__reactProps$.onChange({currentTarget:{value:"75"}})` | `setGoalProgress(75)`：给轨道 `getBoundingClientRect` 定 100px，派发一次 `pointerdown clientX=75`（+`pointerup`） | 不变：`bodies == [{progress:75, expectedUpdatedAt: oldVersion}]` |
| `frontend-planning-write-recovery.test.tsx` | 同上 | 同上 | 不变：写屏障 + `recover()` + `complete().disabled` |
| `frontend-planning-status-confirmation.test.tsx` | 同 tick 里 `trigger.click()` + 伪造 `onChange` | 同 tick 里 `trigger.click()` + 轨道 `pointerdown` | 不变：`progress` 未调用、无写入、`[role=alertdialog]` 在位 |
| `frontend-goal-tasks.test.tsx` | `input[type=range].disabled === true` | `[role="slider"]` 的 `aria-disabled === "true"` | 不弱：`disabled` 在 `role="slider"` 上的等价表达就是 `aria-disabled` + `tabIndex=-1`，仍是"此处不可改进度" |

`pointerdown` 驱动一次即提交一个值（与原生 range 一样是"一次手势一次提交"），因此上述 `toEqual([...])` 的**单次写入**语义原样成立（实测 13/13 通过，见 §8.5）。

### 8.4 有意保留原样 / 只报告

- **没有保留任何裸 `<select>`／`<textarea>`**，所以本切片不存在"因测试钉原生控件而放弃迁移"的调用点。
- `frontend/pages/search-page.tsx`、`frontend/pages/my-submissions-page.tsx`：**未触碰**（peer 持有）。
- **只报告不改**（不属本票枚举的控件，留给输入类切片判定）：`components/knowledge/knowledge-research-panel.tsx` 的 `#research-query-text`、`#research-query-rationale`、`#research-goal` 仍是裸 `<input className="w-full rounded-md border px-2 py-1 text-sm">`；`pages/knowledge-reader-page.tsx` 的 `#reader-note-title` 同样是裸 `<input className="… h-9 …">`；`submission-target-picker.tsx` 的 `data-submission-target-retry/-collection-retry/-more-*` 与 `asset-upload-panel.tsx` 的 `data-asset-*` 仍是裸 `<button className="rounded-md border px-3 py-2">`。它们与本节改动同文件，但 `ui/input` 在这里会改高度/圆角，需由输入/按钮切片统一决策，避免同一切片内两套结论。

### 8.5 门禁（本切片）

`npm run typecheck`（worker + frontend）**干净**。套件（5 批，共 **104 文件 / 2083 测试全绿**）：

1. timeline / reader / research：`frontend-timeline*`、`frontend-project-timeline*`、`frontend-reader*`、`frontend-knowledge-reader*`、`frontend-knowledge-research*` → 23 文件 / 422；
2. submit / inbox / task / discussion / settings：`frontend-submit*`、`frontend-submission*`、`frontend-inbox*`、`frontend-task*`、`frontend-discussion*`、`frontend-messages-page`、`settings-page` → 34 / 737；
3. admin 与资产、复盘：`frontend-admin-menu*`、`admin-menus-page`、`frontend-admin-analytics*`、`frontend-admin-space*`、`frontend-asset*`、`frontend-review*` → 35 / 582；
4. 横面与基元：`shadcn-primitives`、`frontend-a11y`、`frontend-responsive`、`frontend-page-state`、`frontend-workbench-maturity-routes`、`frontend-workbench-review*`、`frontend-user-read-pages`、`frontend-feature-matrix` → 8 / 222；
5. goals 与滑块：`frontend-planning-conflicts`、`frontend-planning-write-recovery`、`frontend-planning-status-confirmation`、`frontend-goal-tasks`、`frontend-goals-page` → 4 / 120。

未跑整仓 `npm test`、未 build／deploy；`motion/range-slider.tsx` 与 `lib/hooks/use-slider.ts` 的 operation 身份需由父级重生成 inventory，ledger 三件与 `docs/product/frontend-operation-*` 未动。


## 14. Wave 3 · 日期范围（DayRangeSurfaces 切片：`date-range-picker` + 两个 day-range 面，2026-10-17）

**结论：`date-range-picker` 落盘并在两处采用**——my-submissions 的 `from`/`to` 与 search 的 `publishedFrom`/`publishedTo`；两者共用一个新适配层 `ui/date-range-input.tsx`。票面说 search 还有"裸 `<select>`／`<textarea>`"：**实测该文件没有**（它的原生控件只有两个 `type="date"`，现已换装），其余控件早已在适配层上，故该清扫无剩余项。

### 14.1 落盘（手工，未新增依赖）

- `motion/date-range-picker.tsx`（994 行）+ `motion/date-range-picker/{context,date-utils,types,use-date-range-picker}.ts`。统一改写：`lucide-react`→`@phosphor-icons/react`（`CalendarDays→CalendarDots`、`Chevron*→Caret*`、`ArrowRight` 同名）、`@/lib/*`→相对路径、`@/components/motion/popover-morph`→`./popover-morph`。
- payload 同时携带的 `components/motion/popover-morph.tsx`、`components/motion/popover-position.ts`、`lib/{ease,utils}.ts`、`lib/hooks/use-hover-capable.ts` **仓库已有，逐字复用、未覆盖**。payload `dependencies` = `clsx`/`motion`/`tailwind-merge`/`lucide-react`；前三者已在依赖树，lucide 由 Phosphor 取代 ⇒ **零新增依赖**。
- 设计锁改动都在新落盘文件内：`rounded-2xl`/`rounded-xl` → `rounded-lg`（`--radius` 系）；去掉触发器内联 `borderRadius: 12`；日历面 `w-80` → `w-[21rem]`（7 列 × 44px）；`iconClass`、月/年按钮、日期单元格与日期按钮、清除按钮加 `max-lg:` 44px（`size-11`/`h-11`/`min-h-11`）。颜色只用既有 token（`foreground`/`background`/`muted`/`border`），无新色；动效沿用 payload 的 `useReducedMotion`/`useHoverCapable`。

### 14.2 共享适配层与两处采用

`frontend/components/ui/date-range-input.tsx`（新，163 行）＝唯一实现：

- 值形状 `DayRange{from,to}`（`YYYY-MM-DD`，空串＝该端未声明），与两处 query param 同构；`onChange` 只交还草稿，**提交仍由页面完成**（my-submissions 的 Apply；search 的表单提交）。因此参数名、ISO 写法、校验与 `AppliedFilters` 的 chip/clear 契约全部不变。
- 组合 `DateRangePicker` 的 controller + `DateRangePickerCalendar/Header/Grid/Footer/Selection`，但**面板在流内**，不走 `DateRangePickerContent` 的 `document.body` portal：search 的筛选行在 `lg` 以下进入 `ui/filter-disclosure` 的 focus-scoped bottom sheet（`filter-disclosure.tsx:74-80` + `focus-scope.tsx` 根节点 Tab 陷阱），portal 会把日历放到作用域外。payload 本身允许自定义 parts（`DateRangePickerProps.children`），所以未改 payload 行为、未 fork 内部。
- 触发器逐字本地化：`aria-label` = 两侧标签（有值时追加摘要）；摘要用 `CALENDAR_RANGE_FROM/TO`（submissions）与 `KNOWLEDGE_FILTER_PUBLISHED_FROM/TO`（search）；清除用 `COMMON_CLEAR_FILTERS`；月/星期/日期名由 payload 的 `Intl.DateTimeFormat(locale)` 生成（`en`/`zh-CN`）。
- 键盘/焦点：打开后落在活动日期；`Escape` 关闭并把焦点交回触发器；双端选完 `closeOnSelect` 收起；日历自身的 WAI 网格方向键 / Home / End / PageUp / PageDown 原样。
- 值守卫：`DateRange.from` 必填（`date-range-picker/types.ts:4-7`），controller 对乱序/不可解析值直接 `throw`（`use-date-range-picker.ts:57-68`）。位置可以只声明 `to`（chips 单独删除 from 之后），也可能给出乱序值，因此只把"可解析且有序"的范围交给 payload；只声明 `to` 时触发器摘要与 chips 仍显示它，日历从新范围开始。

两页最终控件清单：

| 页面 | 控件 | 承载 |
| --- | --- | --- |
| my-submissions | 提交日期范围（1） | **`DateRangeInput`（beUI `date-range-picker`）** |
| | Apply / Retry / 行内重提动作 | `ui/button` 与既有行内按钮（未动） |
| | 表格 / 状态 pill / 五态 / 已应用 chips | `DataTable` + `ui/badge` + `ui/page-state` + `ui/applied-filters` |
| search | 查询词 / 保存视图名 / 作者 ID（3） | `ui/input` |
| | 类型筛选（1） | `ui/filter-select`（beUI select） |
| | 发布时间范围（1） | **`DateRangeInput`** |
| | Apply / 保存 / 重试 / 保存视图动作 | `ui/button` |
| | `<select>` / `<textarea>` / `type="date"` | **0** |

### 14.3 契约保留与测试驱动

- **my-submissions**：`from`/`to` 参数名、`writeSubmissionRange`、`normalizeSubmissionRange` 的 `invalid` 判定、`data-submissions-range-filter`、`data-submissions-range-error`、chips 的单边删除与 clear-all 全部原样；空草稿仍可 Apply（沿用原行为）。新增回归 `frontend-knowledge-submissions-header.test.tsx`「applies a day range picked on the beUI calendar」：开触发器 → 点当月第 1/2 天 → Apply，断言 `?from=<d1>&to=<d2>`，并断言触发器无障碍名同时含两侧标签。
- **search**：`commitFilters`、`data-search-filters`、`data-search-filters-apply`、`data-search-filter-author`、`SEARCH_FILTER_RANGE_INVALID`、saved-view/URL 往返全部原样。`data-search-filter-published-from`/`-to` **未删除**，改为落在同一个触发器上（两个属性并存），因为两个原生输入已合成一个范围控件。`frontend-search-query-draft.test.tsx` 的日期步骤由"直接写 `input.onChange`"改为"开日历 → 点当月前两日 → 提交"，断言仍是 URL / saved view 的 canonical UTC 值（动态取自触发器摘要），未弱化为"只看 chip"。

### 14.4 到达 UI 的英文无障碍名（未覆盖，按要求只报告）

可见摘要/页脚/触发器的 payload 默认文案已全部由适配层覆盖（`Start date`/`End date`/`Select date`、`Select dates`/`Select end`、`N days selected`、`Clear`/`Clear date range` 均不再出现）。仍会到达 UI、且 payload 没有覆盖口的：

1. `motion/date-range-picker.tsx:150-156`：日历键盘说明 `<p id={ctx.help} class="sr-only">`，被网格 `aria-describedby` 引用——纯英文，且是朗读给屏幕阅读器的操作说明。
2. 同文件 `:246` `aria-label="Choose month"`、`:269` `"Choose year"`、`:288-292` `Previous years/Previous year/Previous month`、`:303-307` `Next years/Next year/Next month`。
3. 同文件 `:394-398`：月/年选择 `fieldset` 的 `label`：`Choose a month in ${year}` / `Choose a year from ${yearPage} to ${yearPageEnd}`。
4. `use-date-range-picker.ts:193-207` 与 `:433`：`role="status"` 朗读句框为英文（`Start date … Choose an end date.`、`This range includes unavailable dates…`、`… selected.`、`${name} selected.`），日期本身走本地化 `Intl`。

这些都不是历史 `aria-label`、也不对应既有 i18n 键，按票面"报告而不 fork"处理；要清零需 payload 提供 `labels`/`helpText` 覆盖口，或在适配层重组 Header/Choices（会复制 payload 的键盘/选择逻辑，本次不做）。

### 14.5 门禁

`npm run typecheck`（worker + frontend）**干净**。

- 指定集：`frontend-knowledge-submissions-header`、`frontend-my-submissions-data`、`frontend-my-submissions-identity`、`frontend-search-query-draft`、`frontend-search-data`、`frontend-search-matched-fields`、`frontend-search-title-excerpt`、`frontend-list-filters`、`frontend-a11y`、`frontend-mobile-filters`、`frontend-user-read-pages`、`frontend-submit-pages`、`frontend-submission-loop-routes` → **13 文件 / 103 测试全绿**。
- 邻接路由：`frontend-reader-pagination-routes`、`frontend-read-pages-paging`、`frontend-saved-view-list-read`、`frontend-saved-views-route`、`frontend-notifications-route`、`frontend-workbench-maturity-routes`、`frontend-shell`、`frontend-submit-owner-route`、`frontend-app-routes`、`frontend-contract`、`frontend-submission-loop-routes` → **12 文件 / 332 测试全绿**。

未跑整仓 `npm test`、未 build／deploy；ledger 三件与 operation inventory 未动，新文件的 operation 身份由父级统一重生成。

## 15. Wave 3 收尾（一致性锁定，2026-10-17）

- **采用**：`range-slider` 用于目标进度条（44px 触屏下限、数值经 `formatValueText` 本地化、键盘 Page/Home/End 完整；四个套件从 `input[type=range]` 改驱 `[role="slider"]`，写断言不变）；`date-range-picker` 用于两个**日粒度**区间（新 `ui/date-range-input.tsx` 刻意走**行内**而非载荷的无条件 portal，因为搜索筛选行在移动端会进底部抽屉；`from`/`to`、ISO 校验、chips/清除契约不变）。
- **原生控件清零**：17 个裸 `<select>` + 7 个裸 `<textarea>` 全部改到共享字段壳（`ui/select`、`ui/textarea`）；`ui/` 之外已无裸 select/textarea（grep 为空）。适配层本身即原生控件 + beUI 字段令牌，因此 `id`/`name`/`aria-label`/`data-*`/`<optgroup>` 与按原生控件驱动的套件全部不变。
- **瞬态反馈接入 `animated-toast-stack`**：标记已读、批量已读、任务写入「已应用」在操作**确认成功后**入队；持久状态（错误、`recordBlocked`、恢复说明、撤销目标）与两种非成功结算保持内联。新增键 `NOTIFICATIONS_MARKED_READ`、`NOTIFICATIONS_MARKED_VISIBLE_READ`，删除死键 `SUBMIT_ASSET_NOT_CONNECTED`（`SUBMIT_ASSET_DISABLED` 是活 fallback，保留）。
- **清理**：移除已无导入的 `@radix-ui/react-tooltip`；其被连带移除、但 beUI tooltip 直接 import 的 `@floating-ui/dom` 升为直接依赖（同为 1.8.0，payload 保持原样）；删除经 grep 证明无调用点的死参数 `folderMode`；对话框圆角对齐到 `rounded-lg`（`var(--radius)`）。
- **一处表述修正**：`sm/md/lg/xl` 是主题从 `--radius` 派生的**同一套刻度**，不是"多套圆角"；迁移前线上那 4 个值正是这套刻度。真正被消除的是：**基元来源混用**（`ui/` 接 beUI 源 7 → 16+）、**裸原生控件**（24 处 → 0）、**外来颜色/圆角漂移**（`emerald`/`orange`、`rounded-2xl/3xl` 拒绝入内）、**重复弹层实现**（tooltip 家族收敛到 beUI，Radix tooltip 移出）。
- **仍残留（已报告，未 fork）**：`date-range-picker` 载荷里的英文无障碍串（sr-only 键盘帮助、月/年切换与选择字段集的 aria-label、`role="status"` 播报句）——可见文案已全部本地化，但上述串无覆盖口；`ui/dialog.tsx` 仍由手写 motion 承载（beUI modal 无法同时满足静态标记测试与非 portal 渲染）；`motion/popover.tsx` 无第一方消费者，作为 popover 家族定义保留。
- **门禁**：`npm run typecheck` 干净；四个切片自报合计逾三千条测试绿（含 104 文件/2083 测试的原生控件批量改造）。整仓 `npm test`、operation inventory 与视觉前后对比由父级在提交前完成。


## 16. 视觉验收（前后对比，2026-10-17）

基准选择天然成立：迁移前三波代码都未上线，所以**部署版本 `4f27b8a0` 就是"迁移前"**，`98e52185` 是"迁移后"。

采集方式：同一 relay 登录标签、同一组 10 个代表页（`/`、`/knowledge`、阅读器、`/tasks`、`/boards`、`/agent`、`/submit`、`/goals`、`/settings`、`/notifications`）在 1440×900 浅色下各抓一次；迁移后再补 4 页 390×844 与 3 页深色。截图为本机临时文件（`$TMPDIR/omp-sshots-*.webp`，文件名带 `before-` / `after-` 前缀）。

**可量化的差异**（同一探针、同一页面集）：

| 指标 | 迁移前 (`4f27b8a0`) | 迁移后 (`98e52185`) |
| --- | --- | --- |
| 交互元素的圆角集合 | `{0, pill, 6.8, 8.8, 12, 16}px` | `{0, pill, 6.8, 8.8, 12}px`（16px 漂移消除） |
| 裸原生 `<select>`/`<textarea>`（源码） | 17 + 7 | **0**（适配层本身即原生控件 + 统一字段壳） |
| `ui/` 基元接 beUI 源 | 7 / 26 | 16+ / 26（其余为模态/菜单适配层或有据拒绝） |
| `motion/` 已装 beUI 组件 | 23 | 40+ |

**关于圆角的表述修正**：`sm/md/lg/xl` 是主题从 `--radius`（`0.55rem`）派生的**同一套刻度**，不是"多套圆角"——迁移前那 4 个非胶囊值正是这套刻度。本轮真正消除的是刻度之外的漂移（`16px`）与载荷带来的外来色/圆角（`emerald`/`orange`、`rounded-2xl/3xl` 一律不入内）。因此"风格凌乱"的根因与修复都不在圆角数量，而在**基元来源混用**：按钮/字段/徽标/提示条/弹层/日期范围/对话面现在分别只有一套实现。

**探针限制（自我更正）**：我一度用 `main select:not([data-field])` 数"裸 select"，但那会把我方适配层渲染的原生 `<select>` 一并计入（例如 `/submit` 的 4 个都是适配层字段），因此该数字不可用于结论；裸控件的真实依据是源码 grep 为空。

## 17. Wave 4：100% beUI —— 受控本地化补丁政策（2026-10-17，用户决定）

用户明确要求：先前"有据拒绝"的组件**也必须**用 beUI。据此，拒绝的处置被本节的补丁政策取代；凡是"载荷接口封闭"造成的阻断，改为**增量式本地补丁**后采用。

**允许的补丁（仅此四类，缺一不可地写进文件头）**

1. **文案本地化**：把不可覆盖的硬编码英文无障碍串改成必填/可选的 label props（或 `labels` 表）；调用方传本地化文案。禁止保留英文默认值作为唯一取值。
2. **属性透传**：为行/触发器/面板开放 `...rest` 或明确的 data-* 出口（我们的 `data-*` 钩子、`aria-*`、`role` 必须能到达同一元素）。
3. **插槽扩展**：增加 `actions` / `renderRow` 一类渲染插槽，让逐行操作（编辑/状态/删除及其确认门）能落在行内。
4. **回调扩展**：增加缺失的回调（如 `onFilesRejected`、`onReorderDisabled` 的理由），用于保住既有拒绝语义或明确禁用某能力。

**禁止**：重写载荷的行为逻辑（动画、portal、焦点模型、拖拽算法、日历语义）；把载荷拆成自研实现；新增依赖（缺失依赖只报告）。

**必须随补丁交付**：文件头注释写明 `slug`、补丁条目、以及每条补丁守住的原契约（附 `file:line`）；对应测试断言**不变**，只允许把"寻址方式"从内联容器改为 `document`/portal 或新的角色选择器。

**两处语义边界仍然成立，需要专门处理而不是硬套**：
- 日历的**瞬时区间**（本地时区、分钟精度、≤31 天）与 `date-range-picker` 的 UTC 日历日语义不同 → 该面改为"用 beUI 基元重建表面"（`popover` + `tabs` + `input` 等），而不是把语义降级；
- 阅读器的 markdown 白名单不含 `img` → `morphing-lightbox` 在接入前必须先在白名单放开图片并做安全校验，否则采用即为死代码。

**完成判据**：`frontend/components/ui` 与各页面不再存在非 beUI 来源的交互基元（适配层内可以是 beUI 源 + 上述四类补丁）；`npm test` 全绿；operation inventory 与复核台账由父级统一重生成。

## 18. Wave 4 · 弹层与行操作轨（OverlayAndActions 切片，2026-10-17）—— **未完成，交回父级**

### 18.1 结论

按 §17 落盘并接入 5 个 slug，`npm run typecheck` 对下列文件干净；**但本切片没有完成**：51 个确认/弹层套件的"寻址迁移"（container → `document`）尚未执行，行操作轨只完成 duplicate-queue、review decision controls、goals 三处，`admin/menus-page`、`projects`、读者 FAQ 尚未改造，套件未跑。下文逐项写明现状与下一步，避免重复劳动。

### 18.2 已落盘 slug 与补丁（每文件头部有完整补丁日志）

| slug → 文件 | 补丁 | 守住的契约（file:line） |
| --- | --- | --- |
| `center-morph-modal` → `motion/center-morph-modal.tsx` | 1 label（`backdropLabel`，`closeButtonLabel` 去英文默认） | 两种语言的弹层控件名（`ui/dialog.tsx` 传 `dismissLabel`） |
| 同上 | 2 透传（`panelProps`/`panelRef`/`backdropProps`，`data-*` 类型化） | `role="alertdialog"`、`aria-labelledby`、`data-focus-scope`、`tabIndex`、`data-*-dialog` 落在面板本身（`test/unit/frontend-admin-duplicate-confirmation.test.tsx:34` 等 50 个套件按这些属性选择面板）；`[data-dialog-backdrop]` 落在遮罩 |
| 同上 | 4 回调（`onDismiss`） | Escape/遮罩/关闭控件统一进入 `onOpenChange(false)`，各调用方的 cancel/receipt 路径不变（`frontend/components/ui/confirm-action.tsx:26-35`） |
| 同上 | 设计锁就地修正 | `rounded-[30px]`/`round 30px` → `rounded-lg`/8.8px（`--radius`，0.55rem） |
| `morphing-modal` → `motion/morphing-modal.tsx` | 1 label（`backdropLabel`） | 遮罩控件名本地化（原写死 "Close modal"） |
| 同上 | 2 透传（`panelProps`/`panelRef`） | `role`/`aria-*`/`data-*`/`tabIndex` 到面板；由适配层 `useFocusScope` 统一持有焦点（本载荷自身无焦点模型，未重写其动画/portal 行为——注意它**不 portal**） |
| 同上 | 设计锁 | `rounded-3xl` → `rounded-lg` |
| `hold-action-button` → `motion/hold-action-button.tsx` | 4 回调（`onActivate`） | 单击/键盘一次即确认的既有契约（`test/unit/frontend-admin-member-confirmation.test.tsx:43`、`test/unit/admin-menus-page.test.tsx:85`、`scripts/browser-vm-environments-page.test.mjs:480`）；长按填充仍是载荷行为；完成长按后迟到 click 被 `completedRef` 吞掉 |
| 同上 | label + 设计锁 | `holdingLabel`/`completeLabel` 由调用方给定（本仓库调用方传空串，按钮名由 `aria-label` 承担，DOM textContent 仍等于确认文案，保住按 textContent 精确匹配的 `dialogButton` 类助手）；填充/波纹 `sky-400` → `primary` token，`--hold-radius:22px` → `var(--radius)` |
| `slide-action-button` → `motion/slide-action-button.tsx` | 1 label（`ariaLabel`）、2 透传（`thumbProps`、`disabled`）、4 回调（`onActivate`） | 键入式确认的 `[data-confirm-action]` 仍在可点击的 thumb 上（`test/unit/frontend-admin-asset-hygiene.test.tsx:103-110`），`disabled` 仍是真实按钮状态（`:186`），匹配门禁 `matches` 未动（`ui/typed-confirm-action.tsx:38-40`）；`maxDistance===0`（窄轨/非布局 DOM）下单击不再失效 |
| 同上 | 设计锁 | `rounded-[22px]`/`rounded-[18px]` → `rounded-lg`/`rounded-md` |
| `overflow-actions` → `motion/overflow-actions.tsx` | 1 label（`openLabel`/`closeLabel` 变为必填）、2 透传（`OverflowActionItem.attributes`：`data-*`/`id`/`aria-*`）、3 槽位（无 overflow 动作时不渲染失效的 toggle）、4 回调（`onClick(event)` 转发、`onAction`） | 行钩子可寻址：`data-menu-edit-open`、`manage-goal-tasks-<id>`（`test/unit/frontend-goals-page.test.tsx:25`）、`aria-label="<决策> <target>"`（`test/unit/frontend-review-confirmation.test.tsx:85`）、`aria-busy`/`aria-expanded`；破坏性动作保留强调（`tone="destructive"`，wave 1 拒绝理由之一）；新增 `COMMON_MORE_ACTIONS`/`COMMON_FEWER_ACTIONS` 双语键（`frontend/lib/i18n.ts:1734-1735,3758-3759`）；触控 44px（`max-sm:min-h-11`） |
| `bouncy-accordion` → `motion/bouncy-accordion.tsx` | 2 透传（`item.attributes`，保住 `data-faq-item`） | 读者 FAQ 的条目钩子（`frontend/components/knowledge/knowledge-derivatives-panel.tsx:201`）；设计锁 28px → 8.8px；**尚未接入** |
| `ui/dialog.tsx` | 重写为 `center-morph-modal` 适配层；`variant="morph"` 走 `morphing-modal` | `data-dialog-open` 仍在行内包装上；`useFocusScope`、`data-focus-scope`、Escape、遮罩关闭、焦点归还全部保留；面板在 `open=false` 时立即卸载（退出动画不播放），保住 `expect(dialog()).toBeNull()` 这类同帧断言；`portal` prop 删除（现在一律 portal） |
| `ui/confirm-action.tsx` | 破坏性确认改 `HoldActionButton` | `role="alertdialog"`、名称/描述对、`[data-cancel-action]`/`[data-confirm-action]`、单击一次写入、回执/未决路径不变 |
| `ui/typed-confirm-action.tsx` | 确认控件改 `SlideActionButton` | `data-typed-confirm-input`、`aria-invalid` 之外的原门禁、`pending`、取消按钮全部不变；确认控件的 `.disabled` 转由 thumb 承担 |
| `pages/admin/duplicate-queue-page.tsx` | 决策三键 → `OverflowActions` | 每键 `aria-label="<决策> <target>"`、禁用态、破坏性 tone 不变 |
| `components/review/review-decision-controls.tsx` | 决策三键 → `OverflowActions` | 同上 + `aria-busy`/`aria-expanded` |
| `pages/goals-page.tsx` | 行动作 → `OverflowActions` | `manage-goal-tasks-<id>`、禁用语义、`request()` 门禁不变 |

### 18.3 未完成（按优先级）

1. **测试寻址迁移（阻断，51 套件）**：`container.querySelector('[role="alertdialog"]')`、`container/main().querySelector("[data-confirm-action]")`、`[data-*‑dialog]`、`[data-dialog-open="true"] > [aria-hidden="true"]` 全部要改为 `document`/`[data-dialog-backdrop]`。只改寻址，断言不动。唯独 `test/unit/frontend-focus-scope.test.tsx` 的 Dialog 部分需从 `renderToStaticMarkup` 改为 DOM 挂载（否则挂载后才渲染的载荷什么都不产出）；Sheet 部分可保留静态断言。
2. **`test/unit/frontend-admin-asset-hygiene.test.tsx` 的 `dialogButton`** 需从 textContent 精确匹配改为 `aria-label` 匹配（slide 的 thumb 只有图标，label 在轨道上）。
3. **`admin/menus-page` 行轨**：建议 primary = Edit + Delete（套件点击这两个），overflow = Enable/Disable + Show/Hide；位置输入与 Save 保持在轨外（它们是一个表单，不是行动作）。
4. **`projects` 行轨**：套件会点 `Manage links`、`Timeline`、`Complete`、`Archive`，因此这四项必须是 primary；破坏性 tone 用于 Archive。
5. **读者 FAQ**：`knowledge-derivatives-panel.tsx` 的 `faq` 分支改 `BouncyAccordion`（`item.attributes = {"data-faq-item": gap?"gap":"answered"}`，answer 进 description；`<dl>` 语义消失需在采用说明里写明）。
6. **未验证**：本切片未运行任何 vitest 套件（预算耗尽），因此"套件绿"未取得；`npm run typecheck` 在本切片文件上干净，但整仓仍被其他并行切片的 payload 类型错误（`motion/combobox`、`motion/command-palette`、`feedback-widget`、`notification-stack`、`radio` 等）占用，非本切片范围。

### 18.4 已知风险（给后续切片）

- `center-morph-modal` 自带 window 级 Tab 陷阱与我们的 `useFocusScope`（面板级）并存；实测路径是面板级先移动焦点，window 级在边界处不再触发第二次移动，但**尚未用套件证明**。
- 同一载荷的 Escape 与 `useFocusScope` 的 Escape 都会触发关闭；各调用方 `onOpenChange(false)` 目前都是幂等的，但需要套件确认。
- `morphing-modal` 不 portal，`variant="morph"` 的两个规划弹层仍渲染在原容器内——这正是它们套件无需改寻址的原因，但也意味着带 `transform` 的祖先生效时会被裁剪；这两处页面没有该祖先。

## 19. Wave 4 · 会话输入 / 回答反馈 / 通知收件箱（ComposerFeedbackInbox 切片，2026-10-17）

范围：`frontend/components/agents/*`、`frontend/components/agent/*`、`frontend/pages/agent-page.tsx`、`frontend/pages/notifications/*` 与三个 slug（`prompt-input`、`feedback-widget`、`notification-stack`）。三个载荷均按 §17 增量补丁落盘：行为逻辑（自动增高、键盘提交、焦点回填、morph/focus/portal/关闭计时、悬停/点按展开、`useDismiss`）保持载荷原样，只加 label、data 出口、插槽与回调。新增的依赖文件全部是载荷自身依赖（`action-swap`、`magnetic`、`button/{magnetic,metallic,index}`），未引入新依赖；`lib/{ease,touch,utils}` 与 `hooks/*` 用仓库既有版本。

### 19.1 `prompt-input` → `frontend/components/agents/prompt-input.tsx`

| 补丁 | 类型 | 守住的契约（file:line） |
| --- | --- | --- |
| 发送/停止的英文硬编码 `"Send prompt"` / `"Stop generating"` 改为必填 `labels.submit` / `labels.stop`；`+` 触发器与模型 fallback 同改 | 文案本地化 | `AGENT_SUBMIT` / `AGENT_STOP` 两种语言仍是有名控件（`frontend/lib/i18n.ts:1218,1235,3240,3257`；`test/unit/frontend-agent-cancellation-route.test.tsx:860-864` 以 aria-label 驱动） |
| `textareaProps` 继续落在 `<textarea>`；`id="agent-question"`、`name="question"`、placeholder、aria-label、autoComplete 不变；change 读 `currentTarget.value` | 属性透传 | 标签关联与 `#agent-question` 全部驱动方式（`test/unit/frontend-user-read-pages.test.tsx:153`；`test/unit/frontend-agent-cancellation-route.test.tsx:852-858`） |
| `canSubmit` 增加 `onSubmit` 存在性；提交读 textarea 的实时值 | 回调扩展 | 无回调时发送控件保持禁用；同一事件内「应用来源 + 编辑 + 提交」仍发出带新草稿的请求（`test/unit/frontend-agent-cancellation-route.test.tsx:597-602`） |

写阻断门（`locked()`）与未知结果恢复仍由路由持有（`frontend/app.tsx:1277,1306`）；`disabled` / `loading` / `onStop` 让守卫与取消照旧。加载中的独立文字 Stop 按钮移入载荷的同一图标按钮（`AGENT_STOP` 只在 aria-label），套件改为按 aria-label 寻址。

### 19.2 `feedback-widget` → `frontend/components/motion/feedback-widget.tsx`

| 补丁 | 类型 | 守住的契约（file:line） |
| --- | --- | --- |
| `Close` / `Cancel` / `Submit` / `Sending` / `Thanks!` / 成功描述 / `Something went wrong` / 重试描述 / `Try again` 改为必填 `labels` | 文案本地化 | 反馈标题、详情、发送中、已保存、未确认、重试全部来自 `AGENT_FEEDBACK_*`（`frontend/lib/i18n.ts:1167-1179,3189-3201`） |
| `FeedbackData` 增加 `rating` / `citationIds`；`ratings` 用 `useful` / `not_useful` / `citation_error` 替换自由文本表单；`persistent` 槽渲染 tab 记录提示；`initialStatus` 让恢复的未确认意图直接呈现重试 | 插槽 + 数据面扩展 | 三档评分与 `citationIds` 不变（`frontend/components/agent/agent-feedback.tsx`）；恢复后重试同一评分（`test/unit/frontend-agent-cancellation-route.test.tsx:717-739`） |
| `onSubmit` 可返回 `false`：调用方拒绝（admission / 已提交 / 记录不可读）时不进入 sending/sent/error；返回 Promise 时由载荷展示发送/成功/失败 | 回调扩展 | `AgentFeedbackAdmission.begin/settled` 只在真正发起时调用；两种未确认路径（记录卡住、网络/服务端失败）都保留重试同一意图（`frontend/app.tsx:1407-1421`；`test/unit/frontend-agent-cancellation-route.test.tsx:123-243`） |

`AgentFeedback` 现在只拥有会话契约（admission、sessionStorage 记录、notice、完成后禁用），morph、焦点计时、Escape/外部关闭与成功自动收起都是载荷自己的。记录不可读、未确认与撤销目标的持久提示仍由路由内联（`frontend/app.tsx:1423-1424` 与本组件的 `persistent` 槽）。角标触发器打开后评分按钮才出现，套件仅把寻址改为「先开触发器再找按钮」，断言未动（`test/unit/frontend-agent-cancellation-route.test.tsx:505-515,860-864`）。

### 19.3 `notification-stack` → `frontend/components/motion/notification-stack.tsx`

| 补丁 | 类型 | 守住的契约（file:line） |
| --- | --- | --- |
| `NotificationStackItem.data` 透传到行元素；`actions` 渲染行内操作 | 属性/插槽透传 | `data-notification-id` / `data-read` 仍与行同元素（`frontend/pages/notifications/notifications-page.tsx:120-155`；`test/unit/frontend-notifications-page.test.tsx:100-101`；`test/unit/frontend-notifications-route.test.tsx:631-632`） |
| `interactive={false}` 关闭整叠 `<motion.button>`（悬停/点按/`onViewAll`/consume 关闭），渲染带 `aria-label` 的 `role="list"` 与逐行 `listitem` | 交互控制 + 属性透传 | 行内「打开 / 标记已读」是真正的按钮，不再内嵌于按钮；bulk 操作与行操作禁用语义不变（`frontend/pages/notifications/notifications-page.tsx` 的 `actionsDisabled`） |
| `footer` 槽渲染在载荷自己的 footer 行 | 插槽扩展 | 20/50/100 分页器完整落在 `DataPagination` 上：`data-pagination-desktop/mobile`、`Total`、`21–40`、`Rows per page`、`Page N`（`frontend/components/data-pagination.tsx:39`；`test/unit/frontend-notifications-page.test.tsx:152-157`） |
| aria 模板 `${n} notifications. …` 改为必填 `labels.expanded/collapsed`；`rounded-2xl/3xl` 收敛到 `rounded-lg`，橙色计数药丸改 `bg-primary` | 文案本地化 + 设计令牌 | 两种语言的收件箱名、可见文案与主题圆角/颜色；空态仍是页面的 `PageState`（`test/unit/frontend-notifications-page.test.tsx:135-143`） |

收件箱 ready 态改由 `NotificationStack` 承载：移动端仍以 `data-notification-feed` 的 `overflow-auto` 滚动容器触发 `onLoadMore`，`LIST_LOADING_MORE` / `LIST_END_OF_LIST` 的 `role="status"` 保持桌面静默；持久状态（actionError、`recordBlocked` 与丢弃、recovery、`revokedTarget`）全部留在页面内联。窄屏 append 套件仅把滚动容器从 `table` 父节点改为 `[data-notification-feed]`（`test/unit/frontend-notifications-page.test.tsx:211`）；桌面分页器与行钩子断言未改。

### 19.4 门禁与遗留

- `npm run typecheck` 干净（worker + frontend）。
- 本切片套件全绿：`frontend-agent-cancellation-route`（79）、`frontend-notifications-page`（15）、`frontend-notifications-route`（33）、`frontend-agent-page-summary`、`frontend-agent-receipt-read`、`frontend-agent-source-identity`、`frontend-user-read-pages`、`frontend-notifications-data`、`frontend-notification-summary-refresh`、`frontend-shell-notifications`、`frontend-mobile-filters`、`frontend-a11y`（8 文件 69 测试的合并批 + 各自批）。
- `frontend-workbench-maturity-routes.test.tsx` 的 `focus empty` / `settings ready` 两个用例在并行切片进行中失败（`authenticated App condition not reached`），不经过本切片文件；agent 旅程用例通过。
- 未改 ledger / operation inventory；`NOTIFICATIONS_COLUMN_*` 等表格列键在页面不再渲染，保留待父级统一清理。

## 18. Wave 4 · 外壳（SidebarAndPalette 切片：`animated-sidebar`／`command-palette`／`popover`／`morphing-search`，2026-10-17）

用户决定（§17）后的外壳收口：先前以"载荷接口封闭"拒绝的两件（I5 `command-palette`、I6 `animated-sidebar`）改为**受控本地化补丁**后采用；外壳的两个点击锚定菜单改由 `popover` 承载。取源仍按 §5：`https://beui.dev/r/{slug}.json` 手工落盘，只把 `lucide→@phosphor-icons/react`、`@/lib|components→相对路径`、`process.env` 三处做安装层适配；未加新依赖、未覆盖既有 `lib/*`（新增 4 个载荷自带 lib 文件：`lib/command-search.ts`、`lib/hooks/{use-on-open,use-row-cursor,use-touch-capable}.ts`）。

### 18.1 `@beui/animated-sidebar` → `frontend/components/motion/animated-sidebar.tsx`（外壳桌面栏）

载荷行号指 registry 原件，补丁清单同时写在文件头。

1. **回调/能力扩展** `mobilePanel?: boolean`（`AnimatedSidebarProps` `:489-497`，移动分支 `:523-530`、`:305-487`）：外壳传 `false`，载荷自带移动抽屉（`:384` 包裹层、`:401` `role="dialog"`、`:434-470` Tab 陷阱/滚动锁）永不渲染 ⇒ `ui/sheet.tsx`→`motion/drawer` 仍是唯一移动面板。守住：`workspace-shell.test.tsx:327-357`（移动抽屉是唯一 `role="dialog"`、焦点归还）、`ui/sheet` 的焦点/背板契约。
2. **回调/配置扩展** `breakpoint: "md" | "lg"`（provider `:200-210`、`:226` `useIsMobile()`、`:551-553` 可见性类、`:384` `md:hidden`）：查询与 CSS 类一起按 `lg` 出；外壳内容偏移也是 `lg:pl-64/16`（`app-shell.tsx:127,144`）⇒ 768–1023 不会再出现"桌面栏 + 抽屉"双栏。守住：`frontend-shell.test.tsx:44-58` 的 SSR 断点类、`workspace-shell.test.tsx:200-235` 移动回退。同时 `keyboardShortcut?: boolean`（provider `:240-266`）让外壳显式不采纳新增的全局 `Cmd/Ctrl+B`（§8.1.6）。
3. **属性透传** `AnimatedSidebarMenuButton` / `AnimatedSidebarMenuSubButton` 增 `...rest` 并于渲染的 `motion.a`/`motion.button`（`:1139`/`:1160`、`:981`/`:999`）展开，`onSelect` 收到点击事件：`data-route-id` 仍落在可交互锚点上，`event.preventDefault(); onNavigate(path)` 仍是 SPA 导航。守住：`app-shell.tsx:205`、`workspace-shell.test.tsx:262-283`、`frontend-shell.test.tsx:89-125`。
4. **文案本地化** 移动背板 `"Close sidebar"`（`:390`）→ `mobileCloseLabel`；`ariaLabel` 由外壳传 `SHELL_WORKSPACE_NAVIGATION`。虽然本切片 `mobilePanel=false` 使该分支不可达，仍不留英文唯一取值。

保留未改：面板 morph、`SharedLayoutBg` hover/子菜单 variants、portal、焦点模型。载荷的 hover pill 与子菜单入场含 `filter: blur()`，与本仓库"只动画 transform/opacity"的旧锁不同——按 §17 采用即接受载荷动效（`useReducedMotion` 仍退化为静态）。外壳侧：`useHoverCapable` 仍决定是否挂 `AnimatedSidebarMenu`（触屏不出现会粘住的 hover pill）；子菜单仅在展开时挂载荷 `AnimatedSidebarMenuSub`（`open` 为真），折叠在同一提交移除子项（`workspace-shell.test.tsx:139-162`）。`data-nav-node`/`data-nav-depth`/`data-nav-availability` 由 `AnimatedSidebarMenuItem` 承载（同一元素位置），coming_soon 行仍用 beUI `Button`（保持可 Tab + `aria-disabled`，`app-shell.tsx:197-201`）。未使用的载荷导出（`AnimatedSidebarTrigger`/`AnimatedSidebarClose`/`AnimatedSidebarRail`）保留其英文默认名，外壳不渲染它们。

### 18.2 `@beui/command-palette` → `frontend/components/motion/command-palette.tsx`（⌘K）

1. **文案本地化**：`closeLabel`/`dialogLabel`/`listLabel`/`resultsGroup`（载荷硬编码 `:194`、`:222`、`:273`、`:124`），外壳传既有 `SHELL_COMMAND_CLOSE`/`SHELL_COMMAND_PALETTE`/`SHELL_GROUP_WORKSPACE`；输入框补 `aria-label={placeholder}`（`SHELL_COMMAND_PLACEHOLDER`）。空态仍走 `SHELL_COMMAND_EMPTY`。
2. **属性透传**：`CommandItem.dataAttributes` 展开到 option 按钮（载荷 `role="option"`/`data-index` 处 `:295-303`）⇒ `data-command-id` 仍在行按钮上（`workspace-shell.test.tsx:90,98,113`）。另加 `rowClassName` 供 44px 移动底线（`max-lg:min-h-11`）。
3. **回调扩展** `nativeEnter`：Enter 分支（`:153-166`，面板 `onKeyDown` 在 `:237`）在焦点属于行按钮时不再 `preventDefault`，原生激活保留。守住：`workspace-shell.test.tsx:94-107`（`enter.defaultPrevented === false`）。
4. **插槽扩展** `footer`：面板底部渲染外壳既有的 `↑↓/↵/Esc` 本地化提示，故 `SHELL_COMMAND_NAVIGATE/EXECUTE/CLOSE` 仍在两语使用。
5. 安装层：`LucideIcon→ComponentType<{className}>`、`Search→MagnifyingGlass`。

未改载荷行为：portal、`rAF` 聚焦（`:149-152`）、滚动锁、分组重排与模糊检索、presence/morph。外壳另补上载荷没有的"关闭后焦点归还触发元素"（`shell/command-palette.tsx` 的 `setPaletteOpen`），等价于旧 `DialogContent` 的 focus scope 归还。旧 `Dialog`/`Input` 行渲染、`filterCommands` 行高亮不再参与外壳；`filterCommands` 的模型测试（`command-palette.test.ts:11-20`）不变。

### 18.3 `@beui/popover` → `frontend/components/motion/popover.tsx`（语言／账户菜单）

1. **属性透传** `Popover`/`PopoverContent` 增 `...rest`，面板增 `role?: "dialog" | "menu"`（载荷 `:689`）：`role="menu"` 与 `data-account-menu`/`data-menu-id` 落在同一面板元素上。
2. **属性透传** `PopoverTrigger.ariaHaspopup`（载荷硬编码 `:489`）：菜单触发按钮为 `aria-haspopup="menu"`；`aria-expanded`/`aria-controls`/`data-state` 仍是载荷行为。

保留未改：goo morph、无条件 portal（`:603`）、outside-pointer/Escape 关闭与焦点归还、定位。外壳侧：菜单行是带 `role="menuitem"`/`menuitemradio` 的按钮（44px 移动底线），Home/End/↑/↓ 由外壳的 `menuKeyAction` 处理器承担，触发按钮 ↓/↑ 打开并落到首/末行；`data-account-*`/`data-theme-*` 不变。旧 `ui/dropdown-menu` 不再有生产调用方（仍被 `frontend-menu-keyboard`/`frontend-a11y` 直接覆盖，留待清理波次退休）；`ui/dialog` 由 OverlayAndActions 切片接管，外壳调色板已不经过它。

### 18.4 `@beui/morphing-search`：本切片不具备采用条件

外壳没有独立搜索输入（唯一搜索框是 ⌘K 面板自身，见 18.2），故"若可承载既有标签与提交语义"不成立：`morphing-search` 自带触发面/portal、硬编码 `"Close search"`/`"Search"`/`"Search results"`（载荷 `:388,409,411,480`）与**无修饰键**的 `f` 全局快捷键（`:260-282`），接入即与 ⌘K 形成第二个全局搜索面并新增键盘行为。未安装；留给持有搜索页的切片（知识搜索）在带显式提交语义时评估。

### 18.5 测试寻址变更（断言不变）

- `workspace-shell.test.tsx`：账户/语言菜单面板改从 `document` 取（portal），`[data-menu-id="x"] [role="menu"]` → `[data-menu-id="x"][role="menu"]`（同一元素）；语义词板首个断言增加一次 16ms 帧等待（载荷 rAF 聚焦时机，断言 `activeElement === input` 不变）；视口边界断言由旧内联 `left-0` 改钉 portal 固定层的 `fixed`。
- `frontend-menu-keyboard.test.tsx`：三处 shell 菜单选择器同上改地址。

### 18.6 门禁（本切片）

`npm run typecheck`：本切片文件无错（并行切片 `agents/todo-list.tsx`、`pages/tasks/tasks-page.tsx`、新增 `slide-action-button.tsx` 处于编辑中，属他切片）。套件全绿：`workspace-shell`(31)、`frontend-shell`(14)、`command-palette`(5)、`frontend-menu-keyboard`(21)、`frontend-shell-notifications`、`frontend-context-rail`、`frontend-a11y`、`ui-shell`；另跑同样渲染 `AppShell` 的 `frontend-boards-route`/`frontend-recycle-bin-navigation`/`frontend-responsive`（56）全绿。未跑 build/deploy；未改 operation inventory 与复核台账；未新增 i18n 键、未新增 `data-*` 钩子。

## 18. Wave 4 · 筛选／看板／任务／附件／阅读器（FiltersBoardsTasks 切片，2026-10-17）

按 §17 的四类补丁采用先前“有据拒绝”的 slug。所有 payload 手写落盘（`npx shadcn add` 不可用），统一 `lucide→@phosphor-icons/react`、`@/lib/*→相对路径`、丢弃 payload 自带的 `lib/{ease,utils}`。每个文件头注释写入 slug、补丁条目与“守住的原契约（file:line）”。

### 18.1 `combobox`（筛选行）—— 采用

落盘 `components/motion/combobox.tsx` + `combobox/{context,trigger,content,list,use-active-option}.tsx`；`ui/filter-select.tsx` 改由它承载（13 处调用点全部保留原 props）。

- **补丁 1 文案本地化**：`ComboboxTrigger.label`（`.sr-only` 名称）、`ComboboxList.ariaLabel`（缺省时用 `aria-labelledby` 指向触发器，即 `motion/select` 既有形状）、`ComboboxEmpty.children`、`ComboboxInput` 的 `aria-label`。
- **补丁 2 属性透传**：`ComboboxTrigger.render`（调用方自己的 `button[aria-haspopup="listbox"]` + `disabled`）、`ComboboxContent/List/Item` 的 `...rest`（`data-*`/`aria-*`/`role` 落到面板与选项行）。
- **补丁 4 回调扩展**：`ComboboxTrigger.keyboard="trigger"`——筛选行没有内层 `ComboboxInput`，同一套 `moveActive/selectActive/setOpen` 由触发器按钮承担；触发按 click 开合（payload 默认的 input 焦点 pointerdown 仅在 `keyboard="input"`）。
- **非 portal 模式**：`ComboboxContent.inline` 把面板渲染在字段内（搜索筛选行在移动端进底部抽屉，body portal 会逃出）。开合弹簧、`aria-hidden`/`inert` 关闭态、指针门禁仍由 payload 决定。
- 守住：`button[aria-haspopup="listbox"]` + `.sr-only` 历史名 + `:disabled`（`frontend/components/ui/filter-select.tsx:22`；`frontend-tasks-page.test.tsx:34-38,143`、`frontend-admin-queue-filters.test.tsx:37-40,101`）；选项仍在 `trigger.parentElement` 内（`frontend-tasks-page.test.tsx:167`、`frontend-graph-page.test.tsx:863`）。
- 门禁：`frontend-tasks-page`(9)、`frontend-admin-queue-filters`、`frontend-mobile-filters`、`frontend-list-filters`、`frontend-review-period-refresh`、`frontend-knowledge-read-lifecycle` 全绿；未改任何筛选断言。

### 18.2 `multi-select` —— 不适用（无可承载面）

全仓筛选状态均为单值（`grep` 证据：`FilterSelect` 13 处调用全为 `value: string`；`TaskFilterState`/`InboxStatus`/graph lens 等均为标量；无 `Set<string>`/数组型筛选）。无多值筛选即无采用点，落盘只会是 §17 明确禁止的死代码（与 Wave 1 拒绝 `radio` 的判据同源，后者本轮因“复盘周期”获得真实场景）。payload 的 `combobox/use-active-option` 与 combobox 共用，已随 combobox 落盘；`multi-select/*` 未写入。

### 18.3 `radio`（复盘周期）—— 采用

落盘 `components/motion/radio.tsx`；新 `components/review-period-control.tsx` 同时接入 `/review`（`pages/workbench-review-page.tsx`，原两个 `aria-pressed` 按钮）与 `/knowledge` 复盘卡（`pages/knowledge-page.tsx`，原 `FilterSelect`）。

- **补丁 1 文案本地化**：`label`/`description` 已是 props；另修 payload 真实缺陷——`labelId` 原先只在“label+description 同时存在”时才设置，仅有 label 时 `role="radio"` 按钮无可访问名（button 不是 labelable，外层 `<label htmlFor>` 不命名它）。现在 visible label 恒为名称，description 单独 announcement。
- **补丁 2 属性透传**：`RadioGroup`/`RadioGroupItem` 的 `...rest`（`data-review-period`、`aria-*`）。
- 守住：周期是具名枚举（`frontend/lib/review-period.ts`），仍只写 `daily|weekly`；两语言名称沿用 `REVIEW_DAILY/WEEKLY`、`KNOWLEDGE_REVIEW_DAILY/WEEKLY`；组名沿用 `KNOWLEDGE_REVIEW_PERIOD`。
- 断言只改寻址：`frontend-review-period-refresh.test.tsx`（`[data-knowledge-review] [role=radiogroup]` + `aria-checked`）、`frontend-review-period.test.tsx`（标签→radio 行）、`frontend-workbench-review-page.test.tsx`（`aria-pressed`→`role=radiogroup` + `aria-checked`）、`frontend-knowledge-read-lifecycle.test.tsx`（点击选择器排除 `[role=radio]`）。断言本身（同一周期重读、不可串期、`inert` 等）未变。三套件 9+7+9 绿。

### 18.4 `sortable-stack`（看板列）—— 采用，重排关闭

落盘 `components/motion/sortable-list.tsx` + `sortable-stack.tsx`；`pages/boards/boards-page.tsx` 的 `[data-board-columns]` 行改由 `SortableList/SortableListGroup/SortableListItem` 承载。

- **补丁 1 文案本地化**：`instructions`（sr-only 拖拽帮助，`null` 即不渲染）、`labels.{handle,undo,movedToPosition,previousOrderRestored}`。
- **补丁 2 属性透传**：`SortableList` 根 `...rest`；行/分组本身已是 motion props（`data-board-column` 与列总数落在行上）。
- **重排关闭**：`disabled` + `showUndo={false}` + 不渲染 `SortableListHandle`（payload 本身 `dragListener={false}`，只能由把手启动）；列顺序仍是固定 `BOARD_STATUSES`（`board-model.ts:4`），移动仍走 `data-board-move-*` 回执（`boards-page.tsx:38-49`），未新增本地置换路径。
- 守住：`[data-board-columns]` 仍是横向滚动器（`overflow-x-auto`）、`[data-board-column]` 仍含 `shrink-0`/`snap-start`、`data-board-column-total` 仍为列头徽标、四列独立分页与空态不变（`frontend-boards-page.test.tsx` 10 绿、`frontend-boards-route.test.tsx` 52 绿，未改断言）。

### 18.5 `todo-list`（任务列表）—— 采用

落盘 `components/agents/todo-list.tsx`（另补 `components/motion/action-swap-roll.tsx`，依赖已由其它切片落盘的 `action-swap.tsx`）；`pages/tasks/tasks-page.tsx` 的列表由 `DataTable` 改为 `TodoList`，分页改由共享 `DataPagination` 承担。

- **补丁 1 文案本地化**：`labels.{list,title,completedCount,empty,expand,collapse,status[4]}` 必填，无英文默认。
- **补丁 2 属性透传**：section `...rest`（`aria-busy`）、`data-todo-list-viewport`（追加 feed 的滚动容器）、每行 `data-todo-item`。
- **补丁 3 插槽**：`TodoItem.actions`（编辑/状态/删除及其确认门落在行内）、`emptyState`（页面自己的 `PageState kind="empty"`）。
- **补丁 4 回调/属性扩展**：`collapsible={false}`（页面已有 h1）、`autoScroll={false}`、`onEndReached`（窄屏追加）、`maxHeight={null}`（不设 248px 视窗）、`animateRows={false}`（整页替换时不让离场行与下一页并存——这是 `AnimatePresence` 在无帧环境下残留旧行的真实缺陷）。
- 设计锁：`emerald/rose` → `text-primary`/`text-destructive`；`rounded-2xl/xl` → `rounded-lg/md`；行高 `max-lg:min-h-11` 守 44px。
- 守住：行上控件与无障碍名逐字不变（`frontend-tasks-page.test.tsx:39-46`）、`select[aria-label="Rows per page"]`/`data-pagination-desktop`/`END_OF_LIST` 状态文案、移动端滚动追加（寻址改为 `[data-todo-list-viewport]`，断言不变）。`frontend-tasks-page` 9 绿；`frontend-tasks-route` 中依赖确认对话框的用例仍红，但同因在未被我触碰的 `frontend-task-delete-confirmation.test.tsx`（18/22 红）复现——`ui/dialog`/`confirm-action` 正由 OverlayAndActions 切片改造中，属其进行态，不是本切片回归。

### 18.6 `file-upload`（提交附件）—— 采用

落盘 `components/motion/file-upload.tsx`；`components/assets/asset-dropzone.tsx` 改由它承载（`AssetAvailabilityPanel`/`AssetUploadPanel` 调用点不动）。

- **补丁 1 文案本地化**：`labels.{input,uploadLimit,filesAdded,retry,remove,progress,status[4]}` 必填。
- **补丁 2 属性透传**：根 `...rest`——`data-drop-target="asset"`、`aria-disabled`、`aria-busy` 与粘贴/拖放处理都到投放面。
- **补丁 3 插槽**：`renderRow` 让本产品的“已排队/上传中/已上传/失败”行（含 `data-upload-status`）留在 payload 的队列里，而不是长出第二套行。
- **补丁 4 回调扩展**：`onFilesRejected` 在 payload 截断之后、`onFilesAdded` 之前报告被丢弃的文件——两个文件拖入时仍整体拒绝为“一次一个文件”，不会只上传第一个。
- 设计锁：`emerald` → `text-primary`、`rounded-3xl/[1.35rem]/[1.25rem]` → `rounded-lg`。
- 守住：`input.multiple===false`（`frontend-asset-dropzone.test.tsx:60`）、两文件拒绝不触发上传（`:50-57`）、`data-upload-status="processing|succeeded|failed"`（`:86-98`）、存储未配置时选择器禁用（`:71`）、粘贴图片路径。`frontend-asset-dropzone` 6 绿；`frontend-asset-upload-route`/`asset-availability-route`/`asset-url-alternative`/`submit-pages` 合计 30 绿。

### 18.7 `file-tree`（阅读器目录）—— 采用

复用已装 `components/motion/file-tree.tsx`，加一处补丁并接入 `pages/knowledge-reader-page.tsx` 的 `ReaderOutlinePanel`。

- **补丁 2 属性透传**：`FileTreeFile/Folder.rowProps` 展开到行 `button`（`aria-current`/`data-*`）。
- 守住：`<nav aria-label>` 地标、行文本即标题、选中项 `aria-current="location"`、移动端 `reader-outline-panel` 锚点（`frontend-reader-content-headings.test.tsx:82,116-124`、`frontend-reader-section-disclosure.test.tsx:152`、`frontend-a11y.test.tsx:82,116`）。`frontend-reader-content-headings`/`frontend-reader-section-disclosure`/`frontend-a11y` 16 绿。
- 附带：行高 `max-lg:min-h-11` 守 44px；键盘 ↑↓/Home/End 由 payload 提供（原实现在目录里只有 Tab）。

### 18.8 `morphing-lightbox`（阅读器图片）—— 前置放开后采用

前置条件（§17 明确要求）已完成：`frontend/lib/markdown-renderer.ts` 打开 `img` 白名单并做 URL/scheme 校验——只接受 `http(s)` 绝对地址或同源/相对路径，其余 scheme（`javascript:`/`vbscript:`/`data:`/`file:`/`//host`）在 markdown-it 渲染期即被拒并退化为 alt 文本；`ALLOWED_ATTR` 增补 `alt/src/title/width/height/loading/decoding/role/tabindex/aria-haspopup/class`，`ALLOWED_URI_REGEXP` 兜住所有 URL 属性。

落盘 `components/motion/morphing-lightbox.tsx` + `lib/hooks/use-modal-scope.ts`（新 lib，未覆盖既有文件）；新 `components/knowledge/reader-article.tsx` 挂在阅读器正文卡上。

- **补丁 1 文案本地化**：`labels.{gallery,openImage,close,previous,next,zoomIn,zoomOut,panHelp,loadFailed}` 必填；新增 i18n 键 `KNOWLEDGE_IMAGE_*`（en + zh-CN 各 9 条）。
- 交互：sanitize 后的 `<img>` 带 `class="reader-image" role="button" tabindex="0" aria-haspopup="dialog"`，由 `ReaderArticle` 委托 click/Enter/Space 打开同一 `ImageViewer`；画廊由 DOM 中实际渲染的图片构建（`naturalWidth/Height` 保画幅）。
- 诚实边界：文章是 sanitize 后的 HTML，没有 React 缩略图作为共享布局源，因此**共享布局 morph 没有源节点**——采用到的是查看器本身（portal、焦点作用域、翻页、缩放/平移、滑动、`PresenceGate` 退场门禁）。若日后要让缩略图 morph 成立，需把图注/图片改为 React 节点渲染（会改变 `.markdown-content` 的 HTML 契约），本轮未做。
- 门禁：`npm run typecheck` 在本切片文件上干净（整仓其余报错来自同期切片的进行态文件）；reader 三套件在该接入后复跑中，若红以主代理整仓 `npm test` 为准。

### 18.9 本切片门禁与遗留

- 全部改动仅追加本文件；未触碰 ledger、`docs/product/frontend-operation-inventory.*`。
- `npm run typecheck` 对本切片文件干净。
- 测试寻址改动（断言不变）：`frontend-tasks-page`（滚动容器）、`frontend-tasks-route`（滚动容器）、`frontend-review-period*`（radiogroup/aria-checked）、`frontend-knowledge-read-lifecycle`（排除 radio）、`frontend-asset-dropzone`（drop 目标由 `section` 改 `[data-drop-target="asset"]`）。
- 与其它切片的交叉：`ui/dialog`/`confirm-action` 的改造使所有确认对话框用例暂时为红（含本切片未触碰的 `frontend-task-delete-confirmation`），需在其落地后复跑任务列表相关用例。

### 18.10 门禁复跑（收尾）

`npx vitest run` 本切片 16 个套件 / **170 测试全绿**：`frontend-boards-page`、`frontend-boards-route`、`frontend-tasks-page`、`frontend-review-period`、`frontend-review-period-refresh`、`frontend-workbench-review-page`、`frontend-knowledge-read-lifecycle`、`frontend-reader-content-headings`、`frontend-reader-section-disclosure`、`frontend-a11y`、`frontend-markdown-renderer`、`frontend-asset-dropzone`、`frontend-asset-upload-route`、`frontend-asset-availability-route`、`frontend-asset-url-alternative`、`frontend-submit-pages`。其中包括放开 `img` 白名单并接入 `morphing-lightbox` 之后的阅读器三套件（16/16）——18.8 的“复跑中”一项即此结果。`frontend-tasks-route` 仍待 `ui/dialog` 改造落地后复跑（原因见 18.5）。

## 20. Wave 4 · 弹层套件寻址迁移与行轨接线（DialogTestMigration 切片，2026-10-17）

本切片完成 §18.3 交回的六项遗留。仅追加本文件；未触碰 ledger，未重生成 `docs/product/frontend-operation-inventory.*`。

### 20.1 寻址迁移（断言一字未改）

- **直接 `container` 弹层套件**（admin asset/member/menu/role/space/duplicate/invitations、calendar、focus-action、inbox、moderation、planning、reader-note、review、saved-views、search、submit、task-delete/task-editor、tasks、timeline 等）：`[role="alertdialog"]`、`[data-confirm-action]`、`[data-cancel-action]`、`[data-typed-confirm-input]`、`container.querySelectorAll("button")` 与 `[data-*-dialog]`（`environment-create`、`inbox-capture`、`member-add`、`menu-create|edit`、`space-create|edit`、`calendar-create`）改由 `document` 寻址；页面内节点仍在同一 document，按文档序先于 portal 命中。
- **App 挂载套件**（focus-task-selection、focus-start-dialog、inbox-create、project-relations、timeline-edit、task-editor、workbench-*、home-route、document-language 等）：`main()` 只覆盖页面壳，弹层/菜单内容改 `document`；`container` 前缀替换误伤的 `mounted.container` / `app!.container` 纠正为 `mounted.browser.document` / `app!.browser.document`。
- **遮罩**：`[data-dialog-open="true"] > [aria-hidden="true"]` → `[data-dialog-backdrop]`。
- **静态标记改 DOM 挂载**：`frontend-focus-scope`（Dialog 半边；Sheet 保留静态断言），`frontend-inbox-page` 的双语恢复用例（捕获面板是 portal，`renderToStaticMarkup` 不可见）。
- **同根因的 portal 面**（非弹层）：账号/语言 Popover 菜单（home-route、document-language、workbench-maturity 的 settings 入口）、评审/今日详情弹层（review-targets、today-targets）。
- `frontend-admin-asset-hygiene` 的 `dialogButton` 按 §18.3-2 由 textContent 精确匹配改为 `aria-label`（slide thumb 只有图标）。
- `frontend-knowledge-submissions-header`：复盘周期断言由 `aria-haspopup="listbox"` 改为 Filters 切片已落盘的 `role="radiogroup"`（旧契约残留）。

### 20.2 双处理修正（Escape/Tab）

- 实测一次 Escape 触发 **3 次** `onOpenChange(false)`：面板 `useFocusScope` 1 次、`CenterMorphModal.setOpen(false)` 1 次、适配层 `onDismiss` 1 次。
- 修正：适配层不再订阅 `onDismiss`（`setOpen(false)` 已报告同一路径）；`center-morph-modal` 的 window 级按键陷阱在 `event.defaultPrevented` 时提前返回，面板已处理的 Escape/Tab 不再二次处理。载荷 `onDismiss` 保留供非适配层使用。
- Tab 本身单步（面板级先移动，window 级在边界处看到焦点已离开 first/last）。`frontend-focus-scope` 新 DOM 用例覆盖首焦点、Tab 双向回绕、焦点归还与“Escape 恰好一次”。

### 20.3 三处接线

- `pages/admin/menus-page.tsx`：行轨 = `OverflowActions(size="sm")`；Edit / Enable|Disable / Show|Hide / Delete 均为 primary（套件按可见名直接寻址，故不做隐藏式 overflow）；Edit 保留 `data-menu-edit-open`/`aria-haspopup="dialog"`/`aria-expanded`；Delete `tone="destructive"`；位置输入与 Save 留在轨外。
- `pages/projects-page.tsx`：行轨 = `OverflowActions`；`Manage links` 保留 `manage-relations-<id>`、`aria-expanded`、`aria-controls`（`OverflowActionAttributes` 增补 `aria-controls`）；Timeline/Complete/Archive/Restore 均 primary，Archive `tone="destructive"`，列宽 340→420。
- `components/knowledge/knowledge-derivatives-panel.tsx`：FAQ 由 `<dl>` 改为 `BouncyAccordion`；`data-faq-item` 经 `item.attributes` 落到每行 wrapper，question 为 title，answer/引用为 description；`<dt>/<dd>` 语义消失，改由 trigger 的 `aria-labelledby` 指向内容 section。

### 20.4 门禁

- `npm run typecheck`：干净。
- 弹层套件集合（含全部 51 个确认/弹层套件与两个静态标记用例，56 files）：**1754/1754 全绿**。
- 收尾逐组复跑：focus-scope 9/9、task-editor 75/75、workbench-maturity 171/171、review/today-targets 35/35、document-language 2/2、admin 刷新族与 role/space/menu 确认族全绿。
- `npm run test:unit`：**405 files / 5648 tests 全绿**（失败集合逐文件修复后整仓复跑）。
- `npm run test:worker`：**78 files / 1304 tests 全绿**（含 `pretest:worker` 的 `build:ui`）；输出中的 `uncaught exception` 行是 negative-path 日志，非失败。

## 21. Wave 4 综合结果（100% beUI，2026-10-17）

用户的决定（§17）已执行：先前"有据拒绝"的组件**全部改为受控补丁后采用**，不再有"不用 beUI"的交互面。逐件补丁清单见 §18–§20，这里只记结论与边界。

**已采用（补丁要点）**：`center-morph-modal`（`backdropProps`/`panelProps`/`onDismiss`，焦点作用域与 `data-dialog-backdrop` 保留）、`morphing-modal`（目标/项目组合器）、`hold-action-button`/`slide-action-button`（破坏性确认，含一次性点击与键入门槛）、`overflow-actions`（管理端三处导轨，含 `tone` 与属性透传）、`bouncy-accordion`（FAQ）、`prompt-input`（必填 `labels`，保住 `AGENT_SUBMIT/AGENT_STOP` 与草稿契约）、`feedback-widget`（评分 + 引用面 + 提交回调，保住 admission 与两条未知结果路径）、`notification-stack`（行 `data`/`actions`、`interactive={false}`、分页 footer）、`animated-sidebar`（`mobilePanel={false}` 保住唯一移动面板、断点作为配置、行属性与 `onSelect(event)`）、`command-palette`（`labels`、`dataAttributes`、`nativeEnter` 保住原生回车）、`popover`（`ariaHaspopup`/`role` 可配 + 面板透传）、`combobox`（非 portal `inline` + 触发器 `keyboard` 模式）、`radio`（并修掉载荷"仅标签单选无无障碍名"的缺陷）、`sortable-stack`（用文档化 props 关闭重排，保住固定工作流与回执）、`todo-list`（`actions` 插槽 + 关闭自带折叠/滚动）、`file-upload`（`onFilesRejected` 先于 `onFilesAdded`，保住"一次一个文件"的拒绝）、`file-tree`（`rowProps`，保住 `aria-current`）、`morphing-lightbox`（并先在 markdown 白名单放开 `img` 且做协议校验：仅 http(s)/同源，`ALLOWED_URI_REGEXP` 兜底）。

**顺带修复的真缺陷**：一次 Escape 触发三次 `onOpenChange`（现在恰好一次，并有测试证明）；`radio` 的仅标签项无无障碍名；`file-upload` 的 `multiple={false}` 截断会吞掉第二个文件的**拒绝**语义（现由 `onFilesRejected` 保回）。

**不适用（非"不用"，是无承载面）**：`multi-select`（全仓 13 个筛选位都是单值 `value: string`，落盘即死代码）、`morphing-search`（外壳无独立搜索框，其自带触发器、硬编码英文名与全局 `f` 快捷键会新增第二套全局搜索）、`radio` 之外的二态控件（复盘周期已用 `radio`）。

**仍待收口的唯一表面**：日历的**瞬时区间**（本地时区、分钟精度、≤31 天）——按其语义不能用 UTC 日历日的 `date-range-picker`，§17 规定改用 beUI 基元重建表面（`popover` + 字段壳 + 预设）；此项不在 Wave 4 四个切片的文件范围内，作为最后一个小切片处理。

**门禁**：`npm run typecheck`、单元 **405 文件 / 5648 测试**、worker **78 文件 / 1304 测试**均绿（`DialogTestMigration` 的整仓验证）；复核台账 192/192 行、指纹精确；operation inventory 已重生成。

## 22. Wave 4 · 日历瞬时区间表面重建（CalendarRangeSurface 切片，2026-10-17）

§21 留待的最后一个表面已按 §17 的"用 beUI 基元重建表面"完成：`frontend/components/calendar-range-filter.tsx` 从"常驻表单"改为 `motion/popover` 触发器 + 面板；落盘 slug 数 **0**（只用已装件），无新增依赖、无新增 i18n 键、未改 `frontend/lib/calendar-query.ts` 与页面查询契约。

### 22.1 表面结构

| 位置 | 实现 | 守住的契约 |
| --- | --- | --- |
| 外层 `[data-calendar-range-filter]` | flex 行；`CALENDAR_RANGE_HINT` + `Intl.DateTimeFormat().resolvedOptions().timeZone` **始终可见**（与重建前同一句、同一位置语义） | 本地时区/≤31 天的说明不因收进面板而消失；`frontend-calendar-numbered-pages` 的时区断言原样成立 |
| 触发器 `[data-calendar-range-trigger]` | `ui/button`（outline）经 `PopoverTrigger` 克隆；`aria-haspopup="dialog"`/`aria-expanded`/`aria-controls` 由载荷给；`aria-label` = `CALENDAR_RANGE_FROM: <本地时间> – CALENDAR_RANGE_TO: <本地时间>`，可见摘要用 `Intl.DateTimeFormat(locale.locale, {dateStyle:"medium",timeStyle:"short"})`；`max-lg:min-h-11` | 44px 触控目标；两种语言的名称与摘要；`data-state` 反映开合 |
| 面板 `[data-calendar-range-panel]` | `PopoverContent role="dialog"`（portal 到 `document.body`），`aria-labelledby` 指向触发器、`aria-describedby` 指向外部提示 | 面板有名称与描述；Escape/外部关闭/焦点归还由已打补丁的 `motion/popover` 提供 |
| 两个字段 | `ui/input` 的 `datetime-local`（共享 `fieldShellClass`），`aria-label` 逐字为 `CALENDAR_RANGE_FROM`/`CALENDAR_RANGE_TO`，`aria-invalid` 跟随 `validCalendarRange` | 分钟精度的本地瞬时输入；`to > from` 与 ≤31 天仍由 `lib/calendar-query.ts` 判定 |
| Apply `[data-calendar-range-apply]` | `ui/button`；`pending || !valid` 禁用；点击先归还焦点、收起面板，再以 `localCalendarInstant` 的 canonical ISO 调用 `onChange` | 与重建前同一份提交值；页面的 `onRangeChange` 门禁（未决/确认框打开时不写入）不变 |
| 校验 | `role="alert"` + `CALENDAR_RANGE_INVALID` 原文 | 既有校验文案与角色不变 |
| 开合 | `open` 受控；打开后焦点落到开始字段；Escape/外部点击由 `useDismiss` 关闭；`useReducedMotion` 由载荷内部持有；只新增一个 `transform` 的 caret 旋转（`motion-safe:`） | 键盘可达；无自研动画 |

### 22.2 寻址迁移（断言语义未改）

面板 portal 后，以下测试只改"从哪里找"：

1. `test/unit/frontend-calendar-page.test.tsx`：静态标记里原先断言的 `aria-label="Range start"`（旧内联输入）改为 `[data-calendar-range-trigger]` + `aria-haspopup="dialog"`——静态服务端渲染下 panel 按载荷设计不产出；并新增 DOM 回归用例（打开面板 → 两字段类型/初值 → 相等与 32 天两种拒绝 → Apply 精确瞬时 → Escape 关闭）。
2. `test/unit/frontend-calendar-cancel-confirmation.test.tsx`：同 tick 的"取消 + 应用范围"用例先打开范围面板，再按文档序取 `Apply range`；Keep 后重新打开面板再应用。
3. `test/unit/frontend-calendar-numbered-pages.test.tsx`：`input` 与 `applyRange` 从 `main()` 改为 `document`，并在编辑前打开范围触发器。

### 22.3 保留未做（有据）

- **预设**：票面所称"既有预设"在本组件中并不存在（`git log -S` 与源码均为空），表单一直是"两个字段 + Apply"。新增预设需要新英文/中文文案与新的产品行为，属于新增范围，本切片不做；§21 的"（`popover` + 字段壳 + 预设）"中的预设部分因此没有落地对象。
- **清除**：同样不存在；`CalendarRange` 是必填的 canonical 瞬时对（`parseCalendarSearch` 无范围时回退到 `defaultCalendarRange`），"清除"会删掉查询契约而不是清除一个可选条件。保留 Apply 作为唯一的提交动作，未新增重置按钮。

### 22.4 门禁

- `npm run typecheck`（worker + frontend）干净。
- 日历/范围套件：`frontend-calendar-{cancel-confirmation,create-intent,numbered-data,numbered-pages,page,write-data,write-journeys}` **7 文件 / 123 测试全绿**。
- **未跑通（非本切片原因）**：`frontend-a11y` 无法导入 `frontend/components/ui/dropdown-menu`（该文件在当前工作树中被另一分支/切片删除、测试尚未迁移）。本切片未触碰该文件，留给父级/对应切片处理。

## 23. Wave 4 最终视觉采集的边界（2026-10-17）

Wave 1–3 的前后对比已按 §16 完成（同一 10 页、同一视口、`before` / `after` 两组截图）。**Wave 4 的最终一组截图未取得**：relay 要求被接管的标签必须是当前可见标签，而采集时用户的浏览器已切到别的标签，截图被拒绝（`The attached browser tab is not visible`）。我没有为此反复驱动用户的标签，句柄已直接释放、未做任何导航。

因此 Wave 4 的证据为：逐件补丁清单（§18–§20、§22）、`npm run typecheck`、单元 **405 文件 / 5627 测试**、worker **78 / 1304**、smoke 88/14/30、operation inventory 重生成、复核台账 **10/10**（192+ 行）。若要补 Wave 4 的视觉对照，在浏览器可见标签停在产品页时再跑一次同样的采集即可。

## 24. Wave 4 · 顶栏协作条（CollabStrip 切片：`expandable-action-bar`，2026-10-17）

**结论：采用。** 顶栏协作区由手写 `motion.nav` + `motion.a` + `layoutId="shell-collab-active"` 药丸改为 beUI `expandable-action-bar`（picker：Icon actions with labels），仅按 §17 四类补丁落地。用户已接受其代价：原活动项 `layoutId` 滑动高亮消失，活动态改由载荷自身的静态高亮背景表达（`frontend/components/motion/expandable-action-bar.tsx:364-476`；`bg-muted/80` 的 `layoutId="action-bar-highlight"` 只在指针悬停时随悬停项移动，指针离开即回到活动项）。

### 24.1 落盘（手工，未新增依赖）

`frontend/components/motion/expandable-action-bar.tsx`（payload 413 行 → 本地化 498 行），源 payload：live registry `https://beui.dev/r/expandable-action-bar.json` 的 `components/motion/expandable-action-bar.tsx`。改写只做仓库一致性：`@/lib/hooks/*`、`@/lib/utils` → 相对路径（`../../lib/...`）；载荷不含 lucide 图标，故无图标翻译；无 `process.env` 引用。载荷 registry `dependencies` 为 `clsx`、`motion`、`tailwind-merge`（均已在 `package.json`）；随载荷附带的 `lib/hooks/{use-dismiss,use-hover-gesture,use-tap-gesture}.ts`、`lib/utils.ts`、`lib/touch.ts` **仓库已存在且未覆盖**（由 §9 切片落盘，签名与载荷调用一致）。

### 24.2 补丁清单（文件头 `expandable-action-bar.tsx:1-39` 逐条写明 slug 与守住的原契约）

1. **属性透传**：item 新增 `href`/`dataAttributes`/`ariaLabel`/`ariaCurrent`（`:68-74`），`href` 存在时动作渲染为 `motion.a`（`:459-476`），`data-*` 以 `{...item.dataAttributes}` 落在同一元素（`:463,473`）。守住的契约：`data-route-id`、真实 `href`、`title`、本地化 `aria-label`、活动项 `aria-current="page"`（`frontend/components/shell/app-shell.tsx:116-133`；`test/unit/workspace-shell.test.tsx:197-205,215-228,244-246`；静态标记断言按 `<a … href>` 与 `min-h-10` 计数）。
2. **插槽扩展**：item 新增 `afterLabel`（`:76`），在图标/标签之后、不参与标签的宽度/模糊动画地渲染（`:416-421`）。守住的契约：未读徽标仍然是链接的子节点（`closest("a")`），`data-notification-summary`/`data-state`/`role="status"`/`aria-live="polite"`/`aria-label`/`title` 与 `…`/`—` 两态原样（`app-shell.tsx:130`；`test/unit/frontend-shell-notifications.test.tsx:38-46`）。
3. **回调扩展**：`onClick` 收到点击事件（`:79`），载荷在 `item.onClick?.(event)` 处传给它（`:339`）。守住的契约：SPA 导航仍是 `event.preventDefault(); navigate(path)`（`app-shell.tsx:125`；`test/unit/workspace-shell.test.tsx:226-228,251-255,258-268`）。忽略参数的既有调用点不受影响。
4. **文案本地化**：载荷无硬编码英文无障碍串（`title` 由 label 字符串派生），因此无需替换默认文案；`ariaLabel`/`ariaCurrent` 属"把命名权交还调用方"的同一类增量接口。

载荷的 `LayoutGroup`、指针/悬停/点按手势、`h-8`/`rounded-full` 几何、标签宽度与 `filter: blur` 动画、外部点击消隐（`consume`）全部未改。

### 24.3 外壳接线（`frontend/components/shell/app-shell.tsx`）

- `:116-133` 由 `collaborationLinks` 生成 items：`id`/`href` = 路径，`label`/`ariaLabel` = `locale.t(labelKey)`，`icon` = 既有 `NavIcon`（Phosphor，18px），`active`/`ariaCurrent` = `isCollaborationActive(...)`，`dataAttributes["data-route-id"] = routeCapability(path)?.id`，`afterLabel` = 通知链接的未读徽标。
- `:175-187`：`data-shell-collaboration-navigation` 与 `aria-label="SHELL_COLLABORATION_NAVIGATION"` 落在普通 `<nav>`（载荷根是 `div`，nav 语义由外壳组合，未改载荷结构），保留 `flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap`；`ExpandableActionBar` 用 `size="md"`，`classNames.item = "min-h-10 max-lg:min-h-11 text-xs sm:text-sm"`（桌面 `min-h-10`、移动 44px 下限），`classNames.label = "max-sm:hidden sm:max-w-28 sm:truncate lg:max-w-none"`（`sm` 以下隐藏标签），`classNames.activeItem = "font-medium text-accent-foreground"`、`classNames.icon = "h-[18px] w-[18px]"`。错误态重试按钮仍是 `data-notification-summary-retry` 的 `Button`（`:186`，无障碍名 `SHELL_UNREAD_RETRY`），作为 nav 内同级节点。
- 删除 `Fragment` 导入；`SPRING_LAYOUT`/`SPRING_PRESS` 因移动抽屉仍使用而保留；`main` 内应用级路由过渡 `motion.div`（`:431` 区域）与移动抽屉的 `layoutId="shell-mobile-active"` **未触碰**（后者不属本切片）。

### 24.4 顶栏协作条最终钩子/无障碍清单

| 元素 | 钩子与语义 |
| --- | --- |
| `<nav>` | `data-shell-collaboration-navigation`、`aria-label`=SHELL_COLLABORATION_NAVIGATION、`overflow-x-auto` 滚动轨 |
| 每条协作链接（`<a>`） | `href`=规范路径、`data-route-id`=routeCapability id、`title` 与 `aria-label`=本地化标签、活动项 `aria-current="page"`、`class` 含 `shrink-0 min-h-10 max-lg:min-h-11 text-xs sm:text-sm`、点击 `preventDefault()`+`navigate(path)` |
| 通知链接内的未读徽标 | `data-notification-summary`、`data-state`=`loading`/`ready`/`error`/`forbidden`、`role="status"`、`aria-live="polite"`、`aria-label`/`title`（`NOTIFICATIONS_UNREAD_COUNT`+数量，或 `SHELL_UNREAD_LOADING`/`NOTIFICATIONS_FORBIDDEN`/`SHELL_UNREAD_ERROR`），文本 = 数量 / `…`（loading）/ `—`（其余非 ready） |
| 错误态重试 | `data-notification-summary-retry`、`aria-label`=SHELL_UNREAD_RETRY、点击 `notificationSummary.retry` |
| 载荷内部 | 活动/悬停高亮 `layoutId="action-bar-highlight"`；标签 `aria-hidden={!expanded}`（链接名由 `aria-label` 决定）；`useReducedMotion` 关闭 `whileTap` 并把标签动画降为 0 时长 |

### 24.5 门禁

- `npm run typecheck`（worker + frontend）干净。
- 指定套件 **5 文件 / 67 测试全绿**：`workspace-shell`、`frontend-shell`、`frontend-shell-notifications`、`frontend-a11y`、`frontend-responsive`。
- 顺带复核其它按该钩子寻址的套件（不作为本切片门禁）：`frontend-boards-route`、`frontend-discussion-route`、`frontend-notifications-route` **3 文件 / 151 测试全绿**。
- **测试寻址调整：无**。所有断言（`<a href>` 列表、`min-h-10` 计数、`aria-current`、`aria-label`、`closest("a")`、`data-state`、重试按钮）一字未改；未新增 i18n 键、未改 `frontend/lib/*`、未动 ledger 与 operation inventory。


## 25. 最后一处非 beUI 动效收口（顶栏协作导航条，用户已接受取舍）

用户接受"失去滑行高亮"的取舍后，顶栏协作导航条改用 beUI `expandable-action-bar`（picker："Icon actions with labels"），手工落盘 `frontend/components/motion/expandable-action-bar.tsx`（payload 413 行；无需 lucide/`process.env` 转换，`lib/hooks/*` 与 `lib/{utils,touch}` 复用既有、未覆盖）。

三条 §17 补丁（文件头已记录）：**属性透传**（item 增加 `href`/`dataAttributes`/`ariaLabel`/`ariaCurrent`，随 `href` 渲染为 `motion.a`，`data-route-id`/`href`/`title`/`aria-label`/`aria-current` 落在同一元素）、**插槽**（`afterLabel` 承载未读徽标，仍是链接子节点，`closest("a")` 成立）、**回调**（`onClick` 收到事件，SPA 导航仍是 `preventDefault(); navigate(path)`）。

外壳侧保留：`data-shell-collaboration-navigation`、逐链 `data-route-id`、`aria-current="page"`、未读徽标全套（`data-notification-summary`/`data-state`/`role="status"`/`aria-live`/`aria-label`/`title`/`…`/`—`）与错误时的 `data-notification-summary-retry`；`min-h-10` 桌面几何 + `max-lg:min-h-11` 44px 下限；`sm` 以下隐藏标签；减少动效由载荷自身处理。活动态改为载荷的静态高亮（`bg-muted/80`），旧的 `shell-collab-active` 滑行不再存在；`main` 里的路由过渡 `motion.div` 属应用级、保留。

至此 `frontend/` 内**所有交互面均来自 beUI 源**（适配层内为 beUI 源 + §17 四类增量补丁）；页面上不再有手写 `motion/react`，唯一允许的应用级动效是 `main` 的路由过渡与移动抽屉所经的 `sheet.tsx` 适配层。


## 26. Wave 4 · 成员管理双标签页（MembersTabs 切片，2026-10-17）

`/admin/members` 的成员表与授权记录改为两个 beUI 标签页，各占满剩余高度。范围：`frontend/components/ui/tabs.tsx`、`frontend/pages/admin/members-page.tsx`、`frontend/components/motion/tabs.tsx`（仅 §17 透传补丁）、`test/unit/frontend-admin-invitations.test.tsx`（仅寻址）。

### 26.1 tabs 基元改为 beUI 来源

`ui/tabs.tsx` 之前是自研适配层（无 beUI 源）。现在它**组合**已装载荷 `motion/tabs.tsx` 的 `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`，导出的四个组件与全部既有 props（`value`/`defaultValue`/`onValueChange`/`orientation`/`value` per trigger/`disabled`/`className`/rest）保持不变。载荷提供胶囊指示器的 layout 动画、可滚动标签列表与边缘箭头、聚焦自动显露、`useReducedMotion` 归零。

适配层只补载荷不建模的部分：`tablist`/`tab`/`tabpanel` 的 `id` 与 `aria-controls`/`aria-labelledby`、roving `tabIndex`、`aria-selected`/`aria-disabled`/`data-state`、Home/End/方向键路径（仍走 `frontend/lib/tabs-keyboard.ts` 的 `tabsKeyAction`）、面板 `hidden` 语义、受控/非受控桥接、移动端 44px 下限（`max-lg:min-h-11`）。键盘提交仍通过适配层 `setValue` → 载荷受控 `value` 生效；点击仍由载荷自身 `onClick`（尊重 `preventDefault`）驱动。

载荷两处 §17 补丁（文件头已记录）：**属性透传**——载荷 `Tabs` 的 rest 落在 layout root（`motion/tabs.tsx:101`），`TabsContent` 的 rest 落在面板（`:381`/`:387`，未激活分支改为 `motion.div` 以承载 motion 类型透传，`hidden` 语义不变）。因此 `aria-orientation`、`data-tab-value`、`data-state`、面板 `role`/`id`/`tabIndex` 都能到达同一元素。无文案/插槽/回调补丁。着陆页消费点 `pages/workbench-landing/public-workbench-page.tsx:114` 未改（只传 `value`/`onValueChange`/`variant`）。

载荷的边缘滚动箭头仍带硬编码英文名（`motion/tabs.tsx` 的 `Scroll tabs left`/`Scroll tabs right`），只在标签列表真正溢出时渲染；本页两个本地化标签（「Members/成员」「Invitations/授权记录」）在全宽列表内不会溢出，因此该文案不进入无障碍树。未新增 i18n 键（任务约束），故不为其加 label props——若后续出现长标签列表，须按 §17 第 1 条补 `scrollLeftLabel`/`scrollRightLabel`。

### 26.2 页面结构与高度机制

页头（`PageHeader` + 状态筛选）、`AppliedFilters`、`data-member-status-record-blocked` 与 `pageError`/`actionError`/`readRequired` 提示仍在页面级；`<section inert aria-hidden>` 包住全部内容（含新 tabs 根与对话框触发行），对话框/确认层行为逐字保留。

- tabs 根：`flex flex-col lg:min-h-0 lg:flex-1`（独占页面 `section` 的 `lg:h-full lg:min-h-0` 剩余高度）。
- `TabsList`：`wrapperClassName="shrink-0"`，不参与高度分配。
- 成员面板：`flex flex-col lg:min-h-0 lg:flex-1` + `DataTable fill`（保留 `className="lg:min-h-0 lg:flex-1"`）；表头固定、表体滚动、分页器固定不变。
- 授权记录面板：`flex min-h-0 flex-col lg:flex-1 lg:overflow-y-auto`（面板内部滚动）；`data-admin-invitations` 的 `section` 改为 `flex flex-col gap-3`。

移动端（`lg` 以下）页面仍是自然高度滚动，面板不加高度约束；`max-lg:min-h-11` 保证标签 44px 触控下限。

### 26.3 钩子清单（全部保留）

| 位置 | 钩子/语义 |
| --- | --- |
| 页面 `section` | `lg:h-full lg:min-h-0`、`inert` + `aria-hidden`（确认层/邀请对话框打开时） |
| 标签列表 | `role="tablist"`、`aria-orientation`、逐项 `role="tab"`/`aria-selected`/`aria-controls`/`tabIndex`/`data-state`/`data-tab-value`（载荷另有 `data-tabs-value`） |
| 成员面板 | `role="tabpanel"` + `aria-labelledby`、`DataTable` 的 `data-list-mode`、分页钩子（`data-admin-pagination-*` 等，未改）及行内 `aria-label="<启用/禁用> <target>"` |
| 授权记录面板 | `role="tabpanel"`、`section[data-admin-invitations]`（含 `aria-busy`）、`[data-member-add-open]`（`aria-haspopup`/`aria-expanded`）、`[data-invitation-code]`、`[data-member-add-dialog]`、`[data-member-add-cancel]`、`#invitation-email` |
| 页面级 | `[data-member-status-record-blocked]`、`[data-confirm-action]` |

i18n：未新增键。标签「成员」用 `ADMIN_MEMBERS_TITLE`；「授权记录」用 `ADMIN_INVITATION_LIST_TITLE`（中文恰为「授权记录」，英文 `Invitations`）——原记录区块标题即此键，`ADMIN_INVITATION_SECTION_TITLE`（授权新成员）继续作为面板内邀请区块的 `h2` 与对话框标题，两个键都已存在且语义各归其位（任务描述把 `SECTION_TITLE` 记作「授权记录」，实际该键是「授权新成员」，故按实际取值选择）。

### 26.4 测试寻址调整（断言不变）

`test/unit/frontend-admin-invitations.test.tsx` 新增 `openInvitationsTab()`：点击 `[role="tab"][data-tab-value="invitations"]`。`openAddDialog()` 先切到授权记录页；「shows the code once…」与「revokes a pending invitation…」在断言前先切页。文字、数量、`data-*` 断言一字未改（未激活面板仍挂载但 `hidden`，因此切换只是把「可见」与用户路径对齐）。`fills the available height for the member list` 保持原断言（页面 `section` 仍是第一个 `section`，`data-list-mode` 表仍是 `lg:min-h-0 lg:flex-1`）。

### 26.5 门禁

- `npm run typecheck`（worker + frontend）干净。
- 指定套件 **5 文件 / 43 测试全绿**：`frontend-tabs`、`frontend-admin-invitations`、`frontend-admin-member-confirmation`、`frontend-admin-member-identity`、`frontend-admin-member-refresh`。
- 连带复核：`frontend-admin-pages`、`frontend-admin-pagination-routes`、`frontend-workbench-landing-scene`、`frontend-workbench-landing-page`、`frontend-a11y` **5 文件 / 138 测试全绿**（着陆页仍消费载荷 `Tabs`，未改其调用点）。
- 未新增 i18n 键、未改 `frontend/lib/*`、未动 ledger 与 operation inventory。
