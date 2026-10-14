# 被否决的 8 个 beUI 候选：需求与解决方案

记录时间：2026-10-14。基线：`3b46c6fd`。

此前逐项否决了 8 个 beUI 候选。否决的是**组件形态**（与仓库既有 API、依赖纪律或数据结构不匹配），不是**背后的需求**。本文对每一项给出需求、解决方案、代价与所需决定；已完成项标注 commit。

## 状态一览

| # | 候选 | 需求 | 解决方案 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `button-base` / `button-stateful` | 按压反馈；异步按钮的 pending/success/error | 按压已用 `SPRING_PRESS` 注入既有 `Button`；再给 `Button` 加可选 `pending`，用已落地的 beUI `Loader` 呈现，**不引入第二套按钮 API** | 按压已完成；pending 待做（可直接做） |
| 2 | `shared-layout-bg` | hover 时滑动的行高亮 | 活动项滑动已落地；hover 版用同一 `layoutId + SPRING_LAYOUT` 手法加在侧栏行上，并用 `useHoverCapable()` 门控 | 活动项已完成；hover 待做（可直接做） |
| 3 | `animated-toast-stack` | 无落点的瞬时反馈 | 已接入 Provider + 栈；落在两个真实缺口：命令面板的主题切换、**面板发起退出登录失败**（此前账户菜单未挂载，用户完全看不到） | **已完成**（`beUI 通知栈`提交） |
| 4 | `code-block` | 阅读器里的代码呈现与复制 | 分两步：阅读器**来源片段面板是 React 面**，可直接用 beUI `code-block`；markdown 正文里的代码块走 `dangerouslySetInnerHTML`，要highlighting就得引入 shiki（大）或改渲染管线 | 需先定 A/B（见下） |
| 5 | `streaming-response` | 答案逐 token 流式呈现 | 服务端已有 `/api/agent/sessions/:id/stream`；客户端消费 `ReadableStream` 并保留 `agent-turn-intent` 的未确认写语义 | **需要你的决定**（改前端写入路径） |
| 6 | `table` / `table-async` | 可排序/虚拟化的 admin 列表 | 只在一个纯表格列表上落地（推荐 admin 审计页，只读、无写恢复），保留编号分页与 role 语义 | **需要你的决定**（+2 依赖） |
| 7 | `heat-calendar` | 长周期活跃密度 | 服务端把统计范围限制在 1–31 天；要做年视图需新增 365 天密度读，再作为**独立可视化**（年密度 vs 30 天趋势，问的是不同问题，不算重复） | **需要你的决定**（改服务端） |
| 8 | `expandable-tabs` | 图标+标签的页签 | 阅读器移动端的 `role="tablist"` 双标签切换就是它；同时 `ui/tabs.tsx` 零消费，应删除而不是保留死原语 | 可直接做 |

## 4. `code-block` 的两条路线

- **路线 A（推荐，无需新依赖）**：只把 beUI `code-block` 用在阅读器的**来源片段面板**（`data-reader-outline` 旁边的 chunk 文本，含行号）。这是纯 React 面，不涉及 markdown 管线。
- **路线 B（高亮正文代码）**：markdown 正文由 `renderSafeMarkdown` 输出净化 HTML。要加语法高亮，需引入 shiki（多语法包，体积大）或等价的高亮器，并把初始化放到懒加载 chunk 里，以维持 `verify:browser-vm:build` 的 gzip 预算检查。

`code-block` 本体依赖 shiki，因此**无论哪条路线，只要引入该组件就会带入 shiki**；若只想拿到"代码外壳 + 复制按钮"的观感而不带高亮，应改为在仓库内自建等价外壳（这与"优先使用 beUI 源码"冲突，需你确认取舍）。

## 5. `streaming-response` 的具体做法

服务端已经具备（`src/routes/agent.ts`）：

- `POST /api/agent/sessions/:id/stream`，请求体 `{question}`；
- 响应 `content-type: text/event-stream; charset=utf-8`、`cache-control: no-store`，并带 `x-agent-turn-id`；
- 上游流被 `withPersistedAssistant(...)` 包裹：**边流边落库**，事后可用 `GET /api/agent/sessions/:id/turns/:turnId` 查该 turn 的权威结果；
- 进入流之前先 `stub.startTurn(memberId, question)`，因此重放同一问题会创建新 turn。

客户端落地步骤：

1. `askAgent` 增加流式分支：POST 上述路径，记录 `x-agent-turn-id`。
2. 解析 SSE 帧（`data:` 行）增量更新 `{ kind: "streaming", text }`。
3. **收据权威性**：流正常结束不等于已持久化——结束后用 `GET .../turns/:turnId` 复核，保持与现有 `CHAT_RECEIPT_UNKNOWN` 同一标准。
4. **中断处理**：不自动重发；用同一 turn id 查询权威结果，查不到就落回"结果未确认"提示（与现有未确认写一致）。
5. 渲染用 beUI `streaming-response`（或 `message` + `message-scroller`）。
6. 测试：部分帧、中途 500、用户取消、刷新后按 turn id 恢复、重复问题不重放。

代价：触及 agent 的写入与恢复路径，属于独立功能批次，需签名浏览器验收。**这一项要你点头才动。**

## 6. `table` 的落地边界

- 选定**一个**列表：推荐 `pages/admin/audit-page.tsx`（只读、无幂等写、无乐观回滚）。
- 保留：编号分页（`DataPagination`）、`aria-current`、行内 `role` 语义、既有 `data-*` 钩子。
- 只替换表头/行/骨架的呈现层，不接管数据获取与分页状态。
- 若不需要排序与虚拟化，可只取 beUI `table` 的骨架行与表头，避免引入 `@tanstack/react-table` 与 `@tanstack/react-virtual`。

## 7. `heat-calendar` 的前置改动

- 服务端 `parseAdminAnalyticsOverview` 强制 `days ∈ [1,31]`，因此年视图需要新的读（例如 `/api/admin/analytics?density=365` 或响应内新增 `yearlyDaily`）。
- 该读必须走同一 D1 事务与同一授权检查，避免出现第二套统计口径。
- 客户端把结果交给 `HeatCalendar`（`endDate` 用 UTC 日历日），与现有 30 天柱状图并列，两者回答不同问题。

## 8. 顺带清理

`frontend/components/ui/tabs.tsx` 在第一方源码中零消费（仅自身定义），属于死重；随 `expandable-tabs` 落地时一并删除，并同步 `docs/product/frontend-operation-unassigned-review.md` 的对应指纹与坐标。
