# 2026-10-14 前端交互动效层（beUI + motion）本地证据

基线：`main` / `40536a51`，工作树干净。本轮为本地源码与本地验证，**未 push、未部署、未远程迁移、未读取或写入任何密钥**，不构成生产发布或签名浏览器验收。

## 1. 范围

用户要求「整体交互优化」，覆盖登录后工作台与匿名落地页，并以 beUI 组件与 `motion` 运行时落地。

**本轮完成**：动效令牌与全局交互层（shell 导航、路由过渡、共享原语、404）、落地页滚动揭示、命令面板定位缺陷修复、测试环境 DOM 全局补全、生成物对账。

**本轮明确未做**：按页替换 agent / knowledge / 数据表等密集页面（`prompt-input`、`message-scroller`、`message-bubble`、`citations`、`code-block`、`agent-activity`、`thinking-shimmer`、`table`、`heat-calendar`、`number-ticker` 等）。这些页面承载恢复、幂等与授权语义，逐页替换是独立批次，本轮不声称完成。

## 2. 依赖与来源

- 新增 `motion@^14.2.0`（beUI 运行时）。`lucide-react` 曾随首次安装引入，核对后确认第一方源码零引用，**已移除**。
- beUI 源码取自公开注册表 `https://beui.dev/r/{slug}.json`（2026-10-14 拉取）：`loader`、`scroll-reveal`、`not-found`（`glitch` + `shared`）与 `lib/hooks/use-hover-capable.ts`；`frontend/lib/ease.ts` 为 beUI 动效令牌（弹簧与曲线常量）。
- **未采用**的候选与理由：
  - `button-base` / `button-stateful`：与仓库既有 `buttonVariants` 并行的第二套按钮 API（`rounded-full`、另一套 variant 名），会整体改视觉并冲击断言类名的既有测试；改为把 beUI 的 `SPRING_PRESS` 物理注入既有 `Button`。
  - `shared-layout-bg`：固定 `flex w-full flex-col` 容器且仅由 `onMouseEnter` 驱动，不适配横向 topbar，触屏上会残留 hover 态；改为直接移植其 `layoutId + SPRING_LAYOUT` 手法。
  - `animated-toast-stack`：工作台写路径均为持久、可复核的内联状态（未知写结果不自动重发），没有合适的非权威瞬时反馈调用点，接入即成为死代码。
- `frontend/components.json` 增加 `registries["@beui"]`，使 skill 文档中的 `shadcn add @beui/<slug>` 安装路径可用。
- 模块别名：`tsconfig.json` 增加 `paths["@/*"]`，`vite.config.ts` 与 `vitest.config.ts` 增加对应 `resolve.alias`。编辑器 TS 服务（`typescript-native`）在缺 `baseUrl` 时不解析该 `paths`，故落地文件统一改用相对导入，与仓库既有约定一致。

## 3. 交互变更

| 文件 | 变更 | 可观察结果 |
| --- | --- | --- |
| `frontend/app.tsx` | 路由内容 `motion.div`（仅入场，无退场）；启动等待态改用 beUI `Loader`；404 改用 `NotFoundGlitch` | 导航后内容淡入上移；404 呈现故障码与首页 CTA |
| `frontend/components/shell/app-shell.tsx` | 侧栏/顶栏/移动端导航活动项改为 `layoutId` 滑块；导航项与协作链接加按压反馈；收起/展开改用 `--ease-out`；路由内容过渡 | 活动高亮在导航项之间滑动；侧栏 64↔256 平滑过渡 |
| `frontend/components/ui/button.tsx` | 注入 `SPRING_PRESS` 的 `whileTap`/`whileHover` | 指针按压轻微缩放；键盘激活保持静态表面 |
| `frontend/components/ui/dialog.tsx` | 打开时淡入缩放；新增可选 `portal` | 对话框入场；面板可脱离包含块渲染 |
| `frontend/components/ui/sheet.tsx` | 抽屉侧向滑入 + 淡入 | 移动端导航面板滑入 |
| `frontend/components/shell/command-palette.tsx` | 结果行 `layoutId` 高亮；面板启用 `portal` | 上下键时高亮在结果行间滑动；面板在视口居中 |
| `frontend/pages/workbench-landing/public-workbench-page.tsx` | `ScrollReveal` 包裹 demo / flow / footer 区段 | 滚动进入视口时淡入上移 |
| `frontend/styles/globals.css` | `:root` 增加 `--ease-out` / `--ease-in-out` / `--ease-drawer` | 与 `lib/ease.ts` 对应的 CSS 曲线 |

动画一律遵守 `useReducedMotion()`；`globals.css` 既有的 `prefers-reduced-motion` 兜底保留。仅动画 `transform`/`opacity`（`filter` 仅用于 404 舞台的装饰层）。

## 4. 本轮发现的缺陷与修复

1. **命令面板定位（既有缺陷，非本轮引入）**：`<header>` 的 `backdrop-blur` 使其成为 `position: fixed` 后代的包含块，面板实际以 64px 顶栏为基准居中并被视口裁切（实测对话框 y≈-227.75）。为面板启用新增的 `DialogContent portal` 后父节点变为 `BODY`，在 652×677 视口下实测中心 317.5 / 338.59，与视口中心一致。`portal` 默认关闭，其余对话框 DOM 位置不变。
2. **测试环境 DOM 全局缺失**：仓库多个测试自行 `vi.stubGlobal("window", browser)` 但不暴露 `Element` / `HTMLElement` 等构造器，`motion` 的 WAAPI 探测因此抛 `ReferenceError`，并以 unhandled rejection 形式污染 76 个文件、33 个无关用例。新增 `test/setup/dom-globals.ts`，惰性镜像当前被 stub 的 `window`（含可写 backstop，避免破坏既有 `stubGlobal` 用法）。

## 5. 验证（本轮实际运行）

### 5.1 完整本地门禁

`npm run check` 退出 0：

- smoke 84/84、i18n 13/13、`verify:i18n`（keys=434 placeholders=55 files=6）与 delivery-status 30/30 通过；
- unit **366 文件 / 5235 用例全部通过，0 unhandled errors**；
- Worker **71 文件 / 1200 用例全部通过**；
- landing 97/97；`build`（vite build、构建产物来源与 gzip 预算、密钥扫描、legacy 回滚文件审计 4 项、wrangler dry-run）通过。

生成物对账（有意重新生成，非绕过）：`frontend-operation-inventory.json/.md` 由 272 文件 / 1203 候选更新为 **278 文件 / 1208 候选**；未归属候选由 110 变为 **114**，逐项记录在 `docs/product/frontend-operation-unassigned-review.md`。其中 `frontend/app.tsx` 的返回首页链接候选迁移到 `frontend/components/motion/not-found/shared.tsx`，新增 `loader.tsx`（3）与 `not-found/shared.tsx`（2）未归属项，并同步 `app.tsx`、落地页与三个 motion 来源指纹。`frontend-operation-inventory.test.mjs` 10/10 通过。

### 5.2 浏览器实测（托管 Chromium，真实渲染）

以临时入口（验证后删除）在本地 vite 服务上注入会话桩，驱动真实点击与按键：

| 检查 | 观测 |
| --- | --- |
| shell 挂载、控制台 | 侧栏/顶栏渲染，13 个导航节点，**0 条控制台错误** |
| 路由入场过渡 | 点击后 60ms `opacity 0.566` / `translateY 4.83px`，稳定后 `transform: none` / `opacity 1` |
| 侧栏活动滑块 | 点 `/tasks` → `/boards`，滑块 x 由 358.77 移至 396.77（同尺寸同 y） |
| 顶栏协作导航 | 同步选中 `/boards` |
| 侧栏收起 | 宽度 64px ↔ 256px 往返 |
| 命令面板 | 13 个结果、单一选中行、高亮滑块随 `ArrowDown` 下移 40px；面板中心 317.5 / 338.59（修复前 y≈-227.75） |
| 移动端抽屉 | 120ms 时 `translateX(-1.26px)` / `opacity 0.96`，稳定后 `transform: none` |
| 404 页 | 呈现 beUI 故障码 `404` |

`will-change` 在过渡结束后保持 `auto`（实测空值），未留下包含块副作用。

### 5.3 未验证 / 边界

- 未做签名浏览器、原生客户端、移动真机的正式验收；未部署、未发布。
- 未在真实浏览器以 `prefers-reduced-motion: reduce` 复核（当前浏览器后端不支持该模拟），该路径仅在组件层与 CSS 层有源码保证。
- 浏览器实测使用会话桩与本地 vite 服务，不等于生产身份、真实数据或生产 API 的交互验收。
- 本轮未改写的页面（agent、knowledge、数据表等）不因本证据获得任何动效或验收结论。

## 6. 第二批：agent 答案面板接入 beUI citations

### 6.1 取舍

同批次候选共三个，只采纳一个：

| 候选 | 结论 | 依据 |
| --- | --- | --- |
| `citations` | 采纳 | 答案面板的来源列表就是引用列表；`Citations` 提供折叠、计数与动画 |
| `code-block` | 否决 | 依赖 shiki 语法高亮，且需要一个 React 组件挂载点；阅读器代码块来自 markdown → 净化 HTML 的 `dangerouslySetInnerHTML`，接入需重构渲染管线 |
| `streaming-response` | 否决 | 服务端有 `/api/agent/sessions/:id/stream`，但前端未消费该流；套用会伪装不存在的逐 token 流式能力 |

### 6.2 变更

- `frontend/components/agent/answer-panel.tsx`：来源区由常开 `<div>` + `<h3>` 列表改为 beUI `Citations`（`defaultOpen`，来源默认可见，用户可收起），标题沿用本地化 `AGENT_SOURCES`，上下文行（`spaceId`/`collectionId`/行号）保持原有文案。
- 新增 beUI 落地文件：`frontend/components/agents/citations.tsx`、`frontend/components/agents/agent-disclosure.tsx`、`frontend/lib/favicon.ts`、`frontend/lib/hooks/use-favicon.ts`。
- 落地适配（相对上游的偏移，均已记录）：
  - 图标由 `lucide-react` 换为仓库既有的 `@phosphor-icons/react`，不引入第二个图标库；
  - `CitationRow` 不再无条件 `target="_blank"`：仅绝对外部 URL 新开标签页，工作区内部深链（`/knowledge/<id>#<citationId>`）留在 SPA 内；
  - 内部导入改为相对路径（与仓库约定一致）；
  - 去掉 `Citations` 的英文默认标题 `"Sources"`，标题一律由调用方本地化传入。

### 6.3 验证

确定性 DOM 校验（happy-dom，临时 harness，验证后删除）：折叠按钮 `aria-expanded="true"`、标题与计数渲染、内部链接 `target`/`rel` 均为 `null`、上下文行精确等于 `Context: space-1 · collection-1 · lines 2–4`；点击后 `aria-expanded="false"`、受控面板 `aria-hidden="true"`、带 `inert`、高度 0；绝对外部来源仍为 `target="_blank"` + `rel="noreferrer noopener"`。

浏览器实测（托管 Chromium，真实点击）：折叠按钮呈现为 `来源2`（标题 + 计数）、`aria-expanded="true"`，两条内部引用链接 `target`/`rel` 均为 `null` 且保留 `#cite-*` 深链锚点；点击后 `aria-expanded="false"`、面板 `aria-hidden="true"`、`inert`、高度 0，箭头在 90ms 采样时处于旋转中（`matrix(0.67,0.74,-0.74,0.67,…)`），稳定后 `transform: none`。

工具注记：本轮浏览器验证期间，同源页面被 PiP 浏览器的 HTTP 缓存命中，曾返回改动前的 `answer-panel` 模块；改用新端口（新来源）后取到最新模块。这是本地工具的缓存行为，不是产品缺陷。`npm run check` 的构建与模块来源检查不受影响。

### 6.4 边界

- 仍未做签名浏览器、原生与真机验收；未部署。
- 第二 CTA 与未调用的内联角标 `Citation` 仍为未接线项，已记入 `docs/product/frontend-operation-unassigned-review.md`。
- 该批次不影响知识阅读器本身的引用/反向链接面板与 markdown 代码块渲染，这两处本轮未改。

## 7. 第三批：admin 指标接入 beUI number-ticker

### 7.1 取舍

| 候选 | 结论 | 依据 |
| --- | --- | --- |
| `number-ticker` | 采纳 | 管理概览计数与统计站三张卡是纯数值展示；数字在范围切换/刷新时滚动而非硬切 |
| `table` / `table-async` | 否决 | 需新增 `@tanstack/react-table` 与 `@tanstack/react-virtual`，并把承载分页、权限判定与写恢复语义的 admin 列表改写为虚拟化表格；收益不足抵偿回归面 |
| `heat-calendar` | 否决 | 唯一可用数据源是 7/14/30 天的 `daily` 序列，而该页已有可读的柱状趋势图：替换会降低趋势可读性，并列展示则是同一数据两种图形 |
| `expandable-tabs` | 否决 | 无调用点：通用 `Tabs` 原语在第一方源码中零消费，唯一的 tablist 是阅读器的移动端 2 项切换 |

### 7.2 变更

- 新增 `frontend/components/motion/number-ticker.tsx`（仅相对上游改动两行导入路径）。
- `frontend/pages/admin/admin-dashboard-page.tsx` 的三个计数与 `frontend/pages/admin/analytics-page.tsx` 的三张统计卡改用 `NumberTicker`。
- 采用 `startOnView={false}`：这些卡片始终在首屏，挂载即武装，滚动不由 IntersectionObserver 决定。
- `test/unit/frontend-admin-dashboard-route.test.tsx` 的取值辅助改为读取可访问文本（`[data-metric-value] .sr-only`）。原因：该组件把值渲染三次（sr-only 可访问文本、占位隐式数字、0–9 滚动列），动画中的可见节点其 `textContent` 本就不稳定；可访问文本始终是权威计数，断言意图不变。

### 7.3 验证

- 单元：`frontend-admin-dashboard-route.test.tsx` 与 `frontend-admin-analytics-route.test.tsx` 共 20 项通过；分析页既有断言均为子串断言，不受可访问文本+视觉双份渲染影响。
- 浏览器（Blink / 受管 Google Chrome，真实渲染）：管理概览三张卡的可访问文本为 `47` / `61` / `25`；数字滚动列在约 150ms 采样时 `currentTime=146`、`transform: matrix(1,0,0,1,0,-89.39)`（滚动中），稳定后两列为 `-132px` 与 `-231px`，即 4.4em 与 7.7em（字号 30px），显示 `47`，与可访问文本一致。
- **工具边界（重要）**：托管 PiP 浏览器（WKWebView）在 `document.visibilityState === "hidden"` 时不推进动画——实测 `rafFrames=0`、`document.timeline.currentTime` 停滞，连用一个普通元素的 WAAPI 动画 `currentTime` 也停在 0。因此该窗口不能用来判断任何动画是否生效；本轮动画结论以真实 Blink 渲染为准。曾在 PiP 观察到的「数字停在 0」由此解释为该窗口的动画停摆，不是产品缺陷，相应的临时改动已回退（该文件现在只与上游相差两行导入路径）。

### 7.4 边界

- 管理列表（`table`）与活动热力图（`heat-calendar`）本轮不采纳，理由见 7.1，不属于已交付范围。
- 未在真实 Safari / 真机复核数字滚动；Blink 已实测，WebKit 结论不成立（该窗口动画停摆，无有效观测）。
