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

## 8. 第四批：agent 问答接入流式阶段进度（beUI agent-progress）

### 8.1 取舍

| 候选 | 结论 | 依据 |
| --- | --- | --- |
| `agent-progress` | 采纳 | 加载态需要「正在做什么」的单一权威指示（3×3 脉冲字形 + 动词 + 计时）；仅依赖 `motion` |
| `agent-activity` | 否决 | 是推理/搜索/工具调用的多行轨迹容器；本仓库的阶段是可枚举的 4 个里程碑，当成日志列表会造出并不存在的条目 |
| `thinking-shimmer` | 否决 | 只有文本微光，不携带阶段语义，与既有 loading 呈现重复 |
| `loader` | 已用 | 全局启动等待态已采用；页内使用不表达阶段 |
| `prompt-input` / `message-scroller` / `message-bubble` | 仍否决 | 见第 1 节：这些页面承载恢复、幂等与授权语义，替换面大于收益 |

### 8.2 变更

- 传输：前端从 JSON 端点整体切到 `POST /api/knowledge/chat/stream`（SSE），不留第二套客户端路径。
  - `frontend/lib/agent-data.ts`：新增 `askAgentStream`（可读流逐帧解析）与 `ChatStage` 联合类型；回执校验与归一化抽为 `normalizeChatPayload`，JSON 与流式两种载荷共用同一套规则（流的终端帧与服务端 JSON 响应同形）。
  - 删除已无调用点的 `askAgent`（JSON 客户端）；服务端 `/api/knowledge/chat` 保留，但不再留死客户端。
  - 流在无终端帧时结束 → `CHAT_STREAM_INTERRUPTED`：按未确认写处理，交回既有 keyed-intent 恢复流程，不自动重发。
  - 错误帧携带 `status`，客户端抛出与 JSON 传输同语义的 `ApiRequestError`。
  - 控制器 `request(...)` 新增 `onStage`，并按代次过滤：被后续请求取代的流不再改动 UI。
- UI：`frontend/pages/agent-page.tsx` 的加载态由 `PageState kind="loading"` 换成 `AgentProgress`（阶段文案 + 计时），`frontend/app.tsx` 持有 `stage` 状态并在每次提交时重置。
- 新增 `frontend/components/agents/agent-progress.tsx`：相对上游仅两处改动——导入路径改相对，新增 `ariaLabel` 属性。原因是上游把英文 `", in progress"` 拼进 `aria-label`，在该仓库会造成屏幕阅读器的英文残留。
- i18n：新增 `AGENT_STAGE_RETRIEVING` / `_EVIDENCE` / `_GENERATING` / `_VALIDATING` 中英各 4 条；阶段未知时回落到既有 `AGENT_PREPARING`。
- 夹具与生成物对账：
  - `test/helpers/workbench-maturity-route-fixtures.ts` 的 agent 分支原本只认 `/api/knowledge/chat`，切换后会命中「unplanned request」；改为流式端点（loading → 永不结算、error → 503、其余 → 单个 answer 帧），并删除旧路径分支：若应用退回 JSON 端点，夹具会直接报 unplanned 而不是静默通过。
  - `frontend/pages/agent-page.tsx` 的加载态外包一层 `data-page-state="loading"` + `aria-busy="true"`，保持 `frontend-workbench-maturity-routes.test.tsx` 对「agent loading」的既有选择器契约（该审计按 `main [data-page-state="loading"]` 判定加载态）。
  - 生成物重新对账（有意重新生成，非同义绕过）：`docs/product/frontend-operation-inventory.json` / `.md` 由 289 文件 / 1218 候选更新为 **290 文件 / 1219 候选**（新增项是 `frontend/components/agents/agent-progress.tsx` 的 `role="status"` 候选）；未归属候选保持 **120**，`docs/product/frontend-operation-unassigned-review.md` 中 `frontend/app.tsx` 的审查指纹随本轮改动刷新。

### 8.3 验证

完整本地门禁（本轮实际运行）：`npm run test:smoke` 84/84、`test:i18n` 13/13、`verify:i18n`（keys=434 placeholders=55 files=6）与 delivery-status 30/30；单元 **366 文件 / 5237 用例**；Worker **71 文件 / 1203 用例**；`npm run typecheck`（worker + frontend）全部通过。

- 传输层（`test/unit/frontend-agent-data.test.ts` 16/16）：阶段上报顺序、错误帧（`code`/`status`/`retryable`）、截断流 → `CHAT_STREAM_INTERRUPTED`；原有用例全部迁到流式桩。
- 端到端渲染（`test/unit/frontend-agent-cancellation-route.test.tsx` 新增用例）：服务端只发 `retrieving` 时容器呈现 "Searching your knowledge" 且不含答案文本，终端帧到达后渲染答案。同文件其余用例改桩后通过（75/75）。
- 状态审计：`test/unit/frontend-workbench-maturity-routes.test.tsx` 的 agent 四态（loading / empty / error / ready）在流式夹具下 4/4 通过——loading 所依赖的 `data-page-state="loading"` 契约保持；夹具已删除旧 JSON 端点分支，应用若退回该端点会直接失败而不是静默通过。
- Worker：`test/worker/m1-library.test.ts` 46/46；`test/worker/m1-api.test.ts` 的流式错误帧用例断言含 `status`。
- 真实浏览器（托管 Chromium，非 PiP 窗口）：临时入口渲染 `AgentPage` 并驱动四个阶段——9 格字形 20×20、标签 14px、计时器 3.5s→4.1s 递增、字形透明度在 420ms 内 0.292→0.556（波浪动画实际运行）、`aria-label` 与可见文案一致（无英文残留）、无阶段时回落 "Preparing answer"、0 条控制台错误。该入口已删除。

### 8.4 边界

- 未做生产身份与真实 AI 绑定的浏览器验收：本地无可用 AI 绑定，端到端以流桩驱动。
- SSE 在真实网络下的分块到达与中间代理缓冲未验证；帧按 `\n\n` 分隔、逐帧解析已由单元用例覆盖。
- 未在真机 / Safari 复核；`prefers-reduced-motion` 路径由组件源码（`useReducedMotion`）保证，本轮未模拟。

## 9. 第五批：落地页 3D 场景的视角巡游与 OrbitControls

用户要求：3D 展示需要自动切换各个视角以完整看到动画；随后指定使用 `OrbitControls`。

### 9.1 取舍

| 决定 | 依据 |
| --- | --- |
| 相机由固定 `Vector3(1, 0.9, 1)` 偏移改为**视角表 + 自动巡游** | 原实现只按 feature 取景（`fit()`），朝向永远不变，动画只能从一个角度看到 |
| 接入 three 官方 `OrbitControls`（无需新依赖） | 用户指定；拖拽环绕 + 缩放由成熟实现负责，极角限位 0.55–1.45 防翻转、`enablePan=false`、缩放限位 0.6–2.4 |
| 取景与朝向分工 | 正交相机的取景只由视锥（`halfHeight`）决定，与距离无关：`fit()` 继续负责取景，`direction` 只负责朝向，二者不再互相覆盖；缩放距离留给访客 |
| 巡游由页面驱动（每 6 秒换一个视角） | 刻度条的高亮始终与状态一致，重放回到首个视角；暂停按钮同时暂停动画与巡游 |
| 视角刻度条 | 未采用 beUI `preview-rail`（392 行 + 4 个 hook ≈ 700 行，为 5 个刻度不成比例），改用仓库既有 `layoutId` + `SPRING_LAYOUT` 滑动底片手法（与 shell 导航同源） |

### 9.2 变更

- `workbench-scene-config.ts`：`SCENE_VIEWS`（正面/左侧/右侧/俯视/低角，方位角+仰角弧度）、`SCENE_TOUR_INTERVAL_MS=6000`、`SceneSnapshot.view`。
- `workbench-scene-runtime.ts`：OrbitControls 所有权与朝向插值分离；视图切换在 `SCENE_BUDGET.transitionMs` 内平滑环绕；DEV 下写 `data-scene-view` / `data-scene-azimuth` 便于观测；**控件变更时同步重绘**（暂停时也重绘，否则“暂停即冻结拖拽”）；`draw()` 加重入保护；`dispose()` 释放控件。
- `public-workbench-page.tsx`：巡游计时（标签页隐藏时跳过）、重放归位、视角刻度条（`role=group` + `aria-pressed`）。
- `workbench-copy.ts` / `workbench-landing.css`：中英视角文案与刻度条样式。

### 9.3 验证

- `npm run typecheck` 0 错误；落地页测试 51/51；`npm run build` 全链通过（vite + 落地资源校验 + 密钥扫描 + legacy 审计 + `wrangler deploy --dry-run`，14 个资源文件）。
- 本地 Worker（`wrangler dev --local`，即域名同款服务路径）：`/` 200 外壳（含新构建入口 `assets/index-e4IIsrH1.js`）、`/api/session` **401 `AUTH_REQUIRED`**、`/login` 与两个深链 200、3D 模型 200（650 KB）。
- 真实浏览器（headless Chrome + 软件 WebGL，1440×900，CDP 截图比对）：匿名根渲染落地页（非登录页）、3D 自动加载出现 canvas、**7 秒后画面变化**（自动巡游换视角生效）、暂停后**指针拖拽改变画面**（OrbitControls 生效）。

### 9.4 边界

- 未做真机 / Safari / 触屏双指手势实测；`pointer coarse` 下的 `touch-action: pan-y` 只保证纵向滚动不被夺走，横向拖拽旋转未在触屏设备验证。
- canvas 仍为 `aria-hidden`（装饰性、无键盘操作路径）；拖拽是可选的增强，3D 之外的全部演示内容与登录入口不依赖它。

## 10. 域名「打不开页面」的排查结论（2026-10-15）

按证据排序，**代码侧不是原因**：本地 Worker 已复现域名同款路径并全部 200/401 正常（见 9.3）。

1. **最可能：域名上的版本落后于本地提交。** 生产由 Cloudflare Dashboard 从 `main` 构建（构建命令 `npm run build`、部署 `npx wrangler deploy`，记录于 `docs/operations/2026-09-19-remaining-work-checklist.md:72`）；本仓库近两批改动仍只存在于本地提交（未 push）→ 域名看不到新界面。修复：push 后等 Dashboard 构建，或用 `npm run build && npm run deploy`。
2. **用错入口地址：** `wrangler.jsonc:3-10` 关闭了 `workers_dev` 与 `preview_urls`，只有 `memory.crgmhrc.asia`（`custom_domain`）能打开；workers.dev / Preview URL 必然打不开。这是既有的有意加固，不是缺陷。
3. **会话接口不是 401：** 前端只有 `/api/session` 抛 `401 AUTH_REQUIRED` 才判定匿名并渲染落地页（`frontend/lib/session-state.ts:4-6`、`frontend/app.tsx:194-196`）；若返回 403 `MEMBER_DISABLED`（禁用成员）则按设计进入登录页，若返回 5xx 则进入错误态。
4. **本地 `npm run deploy` 的陷阱（次要）：** `frontend/dist` 被 gitignore 且 `deploy` 本身不构建，直接从笔记本部署会发出陈旧产物（排查时实测本地 dist 时间戳早于两批源码）。Dashboard 路径不受影响。
