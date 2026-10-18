# Studio 产物保留生产验收（管理员）

日期：2026-10-18 UTC

生产入口：`https://memory.crgmhrc.asia`

部署版本：`9697d6b3-1196-4181-943f-ddb589011b17`（100%，2026-10-18T03:44:23Z）

前端资源：`assets/index-JiEFeFSV.js`

远程迁移：`0076_studio_artifacts.sql` 已应用，`studio_artifacts` 表存在。

## 范围

在真实生产部署上，用已登录管理员会话对一个验收条目完成"生成闪卡 → 自动保留 → 列表出现 → 再次打开 → 删除 → 审计核对"。未覆盖贡献者、键盘/读屏、多视口或音频/视频类产物。

验收对象：`39fd7d01-0642-48ad-910e-41b0d6abdf63`，当前修订 `252113a9-abbe-430f-a057-de48183068f7`。

## 步骤与观察

1. **只读**：阅读器渲染"AI 衍生内容"与"已保存内容"空态；`GET /api/knowledge/:id/artifacts` 返回 200 `{"artifacts":[]}`。
2. **生成闪卡**：点击"记忆卡"，约 25s 内完成；面板 `data-derivative-status=ready`，内容含问题、答案与来源定位（行 3–3）。
3. **自动保留**：无需额外操作，`已保存内容`出现产物 `357b6109-e73d-4a3c-b6c9-b53d98a57277`；读取返回 `kind=flashcards`、`revisionId=252113a9…`、1 条 citation，payload 仅含 `cards`。
4. **再次打开**：点击已保存条目后，面板回到 `ready`，说明重放走同一规范化路径。
5. **删除**：点击删除后，`已保存内容`行数 0、空态出现；`GET …/artifacts` 返回 `[]`。
6. **审计**：`knowledge.artifact_created` 一条（`03:46:57.071Z`），`knowledge.artifact_deleted` 一条（`03:47:28.395Z`）。
7. **远程计数**：`studio_artifacts=0`、`artifact_created=1`、`artifact_deleted=1`。

## 前置修复

首次写入验收连续返回 `AI_UNAVAILABLE`。直接调用 Workers AI REST 定位到两个原因：

- 配置的 `-fp8-fast` 模型 ID 不在目录；
- 目录内 8B 模型不支持 `response_format=json_schema`（`AiError 5025`）。

修复为 `@cf/mistralai/mistral-small-3.1-24b-instruct`，增加 chat-completion → `{response}` 适配器，并将 AI 超时从 5s 提升到 20s（实测调用约 5s）。修复后本次验收成功。

## 边界

- 仅管理员单条产物的旅程；贡献者、跨成员拒绝、键盘/读屏与多视口未覆盖。
- 最终状态为`已删除`，未保留生产产物；审计仍记录创建与删除各一次。
- 本文不含正文、Cookie、Session、邮箱或令牌。
