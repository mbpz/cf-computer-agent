# 证据：/agent 接入 AgentSession 与接地回答（本地实现）

- 日期：2026-10-18
- 范围：`KB-009`（有界只读知识 Agent 与可恢复会话）
- 性质：本地实现与 Workerd/React 测试；**不含**生产部署、真实身份或 signed-browser 验收

## 实现范围

- 后端 `src/routes/agent.ts`：
  - `POST /api/agent/sessions` 创建 member-bound AgentSession DO；`GET /api/agent/sessions/:id`、`GET/POST .../messages` 保持 owner-scoped。
  - `POST /api/agent/sessions/:id/stream` 重写为接地回合：`startTurn` → 读取历史 → `LibraryService.searchInternal(scope, query, chatScope)` → `CitedAnswerService.answer` → 生成后再次 `readCitation` 复核引用授权 → `completeTurn` 持久化答案；失败/取消/断流调用 `terminateTurn`。
  - SSE 帧与知识问答一致（`retrieving`/`evidence`/`generating`/`validating`、终结 `answer`、失败 `error`）；终结 body 增加 `sessionId`/`turnId`，并保留 `conversationId=sessionId` 兼容共享校验。
  - 新增 owner-only `POST /api/agent/sessions/:id/turns/:turnId/terminate`。
  - `tools` 路由与 allowlist 不变（search/read/compare/conflicts/draft），不提供发布、删除、改权限、任意网络或 Shell。
- `src/app.ts`：`routeAgentApi` 改为依赖对象（sessions/ai/tools/library/citedAnswers/workScope）。
- 前端：
  - `frontend/lib/agent-data.ts`：新增 `createAgentSession`/`loadAgentSession`/`loadAgentMessages`/`terminateAgentTurn`/`askAgentSessionStream` 与会话控制器；终结帧严格校验 session/turn 身份。
  - `frontend/lib/agent-session-store.ts`：member-scoped localStorage 会话恢复；404/403 清除。
  - `frontend/app.tsx`：`/agent` 改为 session 生命周期（URL `conversationId` 承载 sessionId），保留 scope、未确认恢复、离页守卫与 data-* 契约。
  - 删除旧 chat conversation feedback/history 组件与其意图模块；`/agent` 不再调用 `/api/knowledge/chat/conversations*`。

## 行为矩阵

| 检查 | 实测 |
| --- | --- |
| 会话创建/读取 | 201 + owner 校验；跨成员 404 |
| 消息列表 | 最新在前、limit 有界、owner-scoped |
| 接地回答 | 无证据时走严格拒答（不调用模型）；有证据时只引用本轮 sources 内 citationId |
| 引用复核 | 生成后再次授权 citation；任一失效则整条答案不落库 |
| 持久化 | 成功后 completeTurn 写入 assistant 消息；失败/断流 terminate，不阻塞下一回合 |
| 终止 | owner-only；重复终止返回同一终态 |
| 历史恢复 | 同一 session 的消息可作为后续提问上下文；引用必须以本轮检索重新授权 |
| 前端恢复 | 刷新/重进 `/agent` 恢复 session 与消息；失效会话清除并新建 |
| 工具边界 | 仍只有 allowlist 工具；无发布/删除/权限/网络/Shell |

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npx vitest run test/worker/agent-session.test.ts` | 13/13 通过 |
| 前端 agent 测试（8 文件） | 67 通过 |
| `npm run typecheck` | 通过 |
| `npm run check`（HEAD 工作树） | 退出码 0（unit 410 文件/5606、worker 79 文件/1321、smoke 88+14+30、landing 100） |

## 未覆盖 / 非声明

- 未做真实浏览器、真实 AI 配额/断流、跨设备会话与生产验收。
- 工具带仍由 API 暴露但接地回合不自动调用；turn 使用检索 + 严格引用问答，而不是模型自由调用工具。
- 旧 chat conversation 反馈面从 `/agent` 移除，相关后端端点保留供兼容/历史。
