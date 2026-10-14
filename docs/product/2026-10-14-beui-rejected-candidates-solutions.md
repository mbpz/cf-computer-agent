# 被否决的 8 个 beUI 候选：需求与解决方案

记录时间：2026-10-14。基线：`3b46c6fd`。

此前逐项否决了 8 个 beUI 候选。否决的是**组件形态**（与仓库既有 API、依赖纪律或数据结构不匹配），不是**背后的需求**。本文对每一项给出需求、解决方案、代价与所需决定；已完成项标注 commit。

## 状态一览

| # | 候选 | 需求 | 解决方案 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `button-base` / `button-stateful` | 按压反馈；异步按钮的 pending/success/error | 按压已用 `SPRING_PRESS` 注入既有 `Button`；再给 `Button` 加可选 `pending`，用已落地的 beUI `Loader` 呈现，**不引入第二套按钮 API** | 按压已完成；pending 待做（可直接做） |
| 2 | `shared-layout-bg` | hover 时滑动的行高亮 | 活动项滑动已落地；hover 版用同一 `layoutId + SPRING_LAYOUT` 手法加在侧栏行上，并用 `useHoverCapable()` 门控 | 活动项已完成；hover 待做（可直接做） |
| 3 | `animated-toast-stack` | 无落点的瞬时反馈 | 已接入 Provider + 栈；落在两个真实缺口：命令面板的主题切换、**面板发起退出登录失败**（此前账户菜单未挂载，用户完全看不到） | **已完成**（`beUI 通知栈`提交） |
| 4 | `code-block` | 阅读器里的代码呈现与复制 | 已用细粒度 shiki 入口落地到版本对比面板（见 §4） | **已完成**（`beUI code-block`提交） |
| 5 | `streaming-response` | 答案逐 token 流式呈现 | 服务端已有 `/api/agent/sessions/:id/stream`；客户端消费 `ReadableStream` 并保留 `agent-turn-intent` 的未确认写语义 | 已批准，**进行中** |
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

## 8. `expandable-tabs` —— 改为在仓库内自建（已完成）

`ExpandableTabs` 并不是"页面页签"，而是**浮动变形页签条**：固定像素尺寸的条，展开时按内容测量把自身 morph 成一个浮层面板，**点击外部或按 Esc 即关闭**（源码注释：`it behaves like an open menu`），且一次只渲染激活项的面板。阅读器需要的是在流布局中、与桌面三栏共用同一批面板的页面页签，两者结构不兼容。

按确认的方向改为**在仓库内自建** `frontend/components/ui/expandable-tabs.tsx`：

- 借 beUI 的观感与手法：一个跨页签滑动的 `layoutId` 药丸（`SPRING_LAYOUT`）+ 激活项标签的展开动画（FLIP，用 `layout`，不改布局属性）；
- 面板仍留在原处（桌面栅格），移动端用现有 CSS 显隐，因此**没有重复 DOM、没有重复 id**；
- `role="tablist"` / `role="tab"` / `aria-selected` / `aria-controls` 齐备；非激活项保留 `sr-only` 标签，所以无障碍名不丢；
- 再点激活项即清空选择，与阅读器原行为一致。

浏览器实测（受管 Blink）：初始两个页签各 40px（仅图标）、两个面板 `display:none`；点 outline → 该页签 95px、药丸 95px、面板 `block`；切到 sources → 中间帧采到页签的 FLIP 变换（`matrix(2.29,…)`）与药丸位移，稳定后 sources 102px、药丸正好覆盖它（x=68 w=102）；再点一次 → 两页签回到 40px、`aria-selected="false"`、药丸消失、两面板收起。

`ui/tabs.tsx` 仍为已登记的 `unmounted-ui`，按仓库既有处置保留，不因"清理死代码"单方面删除。
