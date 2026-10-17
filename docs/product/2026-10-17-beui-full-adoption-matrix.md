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
