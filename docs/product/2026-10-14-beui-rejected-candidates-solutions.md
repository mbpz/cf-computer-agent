# 被否决的 8 个 beUI 候选：需求与解决方案

记录时间：2026-10-14。基线：`3b46c6fd`。

此前逐项否决了 8 个 beUI 候选。否决的是**组件形态**（与仓库既有 API、依赖纪律或数据结构不匹配），不是**背后的需求**。本文对每一项给出需求、解决方案、代价与所需决定；已完成项标注 commit。

## 状态一览

| # | 候选 | 需求 | 解决方案 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `button-base` / `button-stateful` | 按压反馈；异步按钮的 pending/success/error | 按压已用 `SPRING_PRESS` 注入既有 `Button`；再给 `Button` 加可选 `pending`，用已落地的 beUI `Loader` 呈现，**不引入第二套按钮 API** | 按压已完成；pending 待做（可直接做） |
| 2 | `shared-layout-bg` | hover 时滑动的行高亮 | 活动项滑动已落地；hover 版用同一 `layoutId + SPRING_LAYOUT` 手法加在侧栏行上，并用 `useHoverCapable()` 门控（不引入该组件的克隆容器） | **已完成**（`侧栏 hover 滑动`提交） |
| 3 | `animated-toast-stack` | 无落点的瞬时反馈 | 已接入 Provider + 栈；落在两个真实缺口：命令面板的主题切换、**面板发起退出登录失败**（此前账户菜单未挂载，用户完全看不到） | **已完成**（`beUI 通知栈`提交） |
| 4 | `code-block` | 阅读器里的代码呈现与复制 | 已用细粒度 shiki 入口落地到版本对比面板（见 §4） | **已完成**（`beUI code-block`提交） |
| 5 | `streaming-response` | 逐 token 流式 | **原方案不成立**（唯一流式端点不做检索；grounded 答案走 strict JSON schema + 服务端校验，逐 token 与之不相容）。改为方案 A：阶段式进度 | **Phase 1 已完成**（服务端 SSE 出口 + 测试）；Phase 2 客户端待做 |
| 6 | `table` / `table-async` | 可排序/虚拟化的 admin 列表 | 只在一个纯表格列表上落地（推荐 admin 审计页，只读、无写恢复），保留编号分页与 role 语义 | **需要你的决定**（+2 依赖） |
| 7 | `heat-calendar` | 长周期活跃密度 | 服务端把统计范围限制在 1–31 天；要做年视图需新增 365 天密度读，再作为**独立可视化**（年密度 vs 30 天趋势，问的是不同问题，不算重复） | **需要你的决定**（改服务端） |
| 8 | `expandable-tabs` | 图标+标签的页签 | 读源码后确认它是"浮动变形页签条"（展开成浮层、点外部/Esc 收起），不是在流布局里拥有面板的页面页签。改为**在仓库内自建流布局可展开页签**并切到阅读器移动端（见 §8） | **已完成**（`自建流布局页签`提交） |

## 4. `code-block` —— 已落地（细粒度 shiki）

已确认 `code-block.tsx` 依赖 `agent-code.tsx`，后者原本**静态**导入 `shiki`。落地时发现直接用 `import("shiki")` 会把 shiki 的全套语言与主题变成各自独立的 chunk：构建产出 **312 个 chunk、dist 14 MB**。

改为细粒度入口后（`frontend/components/agents/agent-highlighter.ts`）：

- 只带 `bash` / `diff` / `json` / `tsx` / `typescript` 与两个主题；
- 用 JavaScript 正则引擎，省掉数百 KB 的 oniguruma wasm；
- 该入口本身仍是**动态导入**，落在单个 580 KB 懒加载 chunk 里。

结果：构建回到 **4 个 chunk / dist 4.1 MB**，启动包不含 shiki（`verifiedChunks: 4`，manifest 的 `dynamicImports` 只列 shiki 入口、cytoscape 与落地页 runtime）。阅读器的版本对比面板改用 `CodeBlock`（`language="diff"`），统一 diff 文本由 hunk 头 + `±/空格` 前缀生成，保留原有的绝对行号信息。

markdown 正文的代码高亮（路线 B）仍未做：正文走净化 HTML，需要另外改渲染管线。

## 5. `streaming-response` —— 核证后原方案不成立

动手前核了两条链路，结论推翻了本方案的前提：

- UI 的问答走 `POST /api/knowledge/chat`（`src/routes/library.ts:233`），这是**带引用、可复核**的 grounded 答案；
- 全仓唯一的流式端点是 `POST /api/agent/sessions/:id/stream`（`src/routes/agent.ts:71`），其实现是 `ai.run(model, { messages: [{ role: "user", content: question }], stream: true })` —— **裸模型调用，没有检索、没有引用**。

### 为什么 grounded 链路上不能逐 token 流

`src/ai/cited-answer-service.ts:173` 用 `response_format: { type: "json_schema", strict: true }` 取回答，随后 `JSON.parse` 并跑 `validateGrounding(providerAnswer, preparedSources)`，再由 `sourceOrder` 推导引用标记（`[1]`、`[2]`…）。

因此：

1. 流出去的是 **JSON 片段**，不是散文——直接呈现给用户是噪声，之后还得整体替换；
2. 更根本的是**校验顺序**：答案文本只有在 grounding 校验与引用映射通过之后才可展示。把校验前的 token 显示给用户，等于展示未经验证的断言与可能不存在的引用编号，这与产品"带引用、可复核"的核心承诺直接冲突。

### 可选方案（都需要你确认）

- **A（推荐，已选定）**：改为**阶段式进度**而非 token 流——服务端推送真实阶段，客户端用 `agent-activity` / `agent-progress` 呈现，**校验通过后再整段呈现答案**。
- **B**：按原方案消费 `/api/agent/sessions/:id/stream`。**不建议**——那会把 grounded 答案换成无依据的模型输出，是产品级回退。
- **C**：保持现状（加载态占位），不动服务端。

原方案里"客户端消费已有流"的判断是错的（我把它当成了问答链路），特此更正。

### 落地进度

**Phase 1（服务端，已完成）**：

- `src/ai/cited-answer-service.ts` 新增 `CitedAnswerStage = "evidence" | "generating" | "validating"`，`answer(...)` 增加可选 `onStage` 回调，只在**真实发生**的节点上报（证据置信度算出后、进入生成前、进入校验前）；低置信度提前返回 `noEvidence` 时只报 `evidence`。
- `src/routes/library.ts` 把 chat turn 主体提取为共享的 `runChatTurn(services, scope, turn, onStage?)`，**JSON 与 SSE 两条传输共用同一实现**，收据/会话/引用授权行为不会分叉；新增 `POST /api/knowledge/chat/stream`，返回 `text/event-stream`，帧为 `{stage}` … 直到终帧 `{stage:"answer", body}` 或 `{stage:"error", error:{code,message,retryable}}`。
- 能力校验与请求校验仍发生在开流之前，所以 401/403/400 依旧是真实状态码；开流之后的失败只能作为错误帧下发。
- 测试（`test/worker/m1-api.test.ts`）：阶段序列 `retrieving → evidence → generating → validating → answer`、非终帧不带 `body`、同 key 重放只出 `answer` 帧且不再调用模型、AI 失败只出 `error` 帧（`AI_UNAVAILABLE`/retryable）、JSON 传输不变。整套 65 项通过。

**Phase 2（客户端，待做）**：`agent-data.ts` 增加 SSE 读取并把帧映射成与现在**同一套错误语义**（含"流未终结即视为未确认写"）；agent 路由用 beUI `agent-activity`/`agent-progress` 呈现阶段；补客户端测试与浏览器验收。

## 6. `table` 的落地边界

- 选定**一个**列表：推荐 `pages/admin/audit-page.tsx`（只读、无幂等写、无乐观回滚）。
- 保留：编号分页（`DataPagination`）、`aria-current`、行内 `role` 语义、既有 `data-*` 钩子。
- 只替换表头/行/骨架的呈现层，不接管数据获取与分页状态。
- 若不需要排序与虚拟化，可只取 beUI `table` 的骨架行与表头，避免引入 `@tanstack/react-table` 与 `@tanstack/react-virtual`。

## 7. `heat-calendar` 的前置改动

- 服务端 `parseAdminAnalyticsOverview` 强制 `days ∈ [1,31]`，因此年视图需要新的读（例如 `/api/admin/analytics?density=365` 或响应内新增 `yearlyDaily`）。
- 该读必须走同一 D1 事务与同一授权检查，避免出现第二套统计口径。
- 客户端把结果交给 `HeatCalendar`（`endDate` 用 UTC 日历日），与现有 30 天柱状图并列，两者回答不同问题。

## 8. `expandable-tabs` —— 改为在仓库内自建（已完成）

`ExpandableTabs` 并不是"页面页签"，而是**浮动变形页签条**：固定像素尺寸的条，展开时按内容测量把自身 morph 成一个浮层面板，**点击外部或按 Esc 即关闭**（源码注释：`it behaves like an open menu`），且一次只渲染激活项的面板。阅读器需要的是在流布局中、与桌面三栏共用同一批面板的页面页签，两者结构不兼容。

按确认的方向改为**在仓库内自建** `frontend/components/ui/expandable-tabs.tsx`：

- 借 beUI 的观感与手法：一个跨页签滑动的 `layoutId` 药丸（`SPRING_LAYOUT`）+ 激活项标签的展开动画（FLIP，用 `layout`，不改布局属性）；
- 面板仍留在原处（桌面栅格），移动端用现有 CSS 显隐，因此**没有重复 DOM、没有重复 id**；
- `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` 齐备；非激活项保留 `sr-only` 标签，所以无障碍名不丢；
- 再点激活项即清空选择，与阅读器原行为一致。

浏览器实测（受管 Blink）：初始两个页签各 40px（仅图标）、两个面板 `display:none`；点 outline → 该页签 95px、药丸 95px、面板 `block`；切到 sources → 中间帧采到页签的 FLIP 变换（`matrix(2.29,…)`）与药丸位移，稳定后 sources 102px、药丸正好覆盖它（x=68 w=102）；再点一次 → 两页签回到 40px、`aria-selected="false"`、药丸消失、两面板收起。

`ui/tabs.tsx` 仍为已登记的 `unmounted-ui`，按仓库既有处置保留，不因"清理死代码"单方面删除。
