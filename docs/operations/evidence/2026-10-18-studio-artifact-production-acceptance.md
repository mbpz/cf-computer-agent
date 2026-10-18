# Studio 产物保留生产验收

日期：2026-10-18 UTC

生产入口：`https://memory.crgmhrc.asia`

部署版本：`9697d6b3-1196-4181-943f-ddb589011b17`（100%，2026-10-18T03:44:23Z）

前端资源：`assets/index-JiEFeFSV.js`

远程迁移：`0076_studio_artifacts.sql` 已应用，`studio_artifacts` 表存在。

## 范围

在真实生产部署上，用已登录管理员会话对一个验收条目完成"生成闪卡 → 自动保留 → 列表出现 → 再次打开 → 删除 → 审计核对"；并补充贡献者会话旅程、375/768/1280 三档视口、纯键盘操作，以及浏览器 AX 树中的可访问名称核对。未覆盖真实屏幕阅读器语音播放、音频/视频类产物，以及闪卡以外的产物类型。

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

## 贡献者旅程

- 管理员签发一次性邀请（测试邮箱，代码只返回一次，未写入文档）；在隔离的 managed Chromium 中通过 `/auth/code` 换取 contributor session（成员 `0766bf9d…`）。
- 贡献者打开同一阅读器；**仅用键盘**把焦点移到"记忆卡"并按 Enter，约 25s 完成；产物 `e676f5b7-bb6b-415c-b4b7-e63f534ad49a` 自动保留并出现在已保存列表。
- 焦点移到已保存条目并按 Enter，面板回到 `ready`；焦点移到删除并按 Enter，列表清空、空态出现。
- 结束后管理员将临时贡献者置为 `disabled`；当次计数 `studio_artifacts=0`、`artifact_created=2`、`artifact_deleted=2`（含管理员一次）。随后为 AX 检查额外创建并删除一件产物，最终远程为 `created=3`、`deleted=3`、残留 0。

## 键盘与视口

- 375×812、768×900、1280×800 三档：`scrollWidth - clientWidth = 0`，已保存条目完整位于视口内。
- 生成、重开、删除均通过 `focus()` + Enter 完成，未使用鼠标点击。
- 已保存条目的打开/删除按钮带可访问名称；组件测试同时断言 `aria-label`。
- 阅读器结果标签显示"结果 · 思维导图、闪卡与测验已保存到你的 Studio 内容"。

## 真实屏幕阅读器方案（REA）

- **浏览器 AX 树已验证**：`rea inspect-web-page`（证据 `ev_261a8a8260dfde35c6ffb323321b6e1c33113f0ad3953f31fc7d3c765280de15`）在真实生产阅读器上捕获 509 个无障碍节点，其中：
  - `button` name=`打开 2026-10-18T04:24:17.909Z 保存的记忆卡`，`ignored=false`
  - `button` name=`删除已保存内容`，`ignored=false`
  - `StaticText` name=`已保存内容`

  这是 Chrome 通过 CDP 暴露、并进一步映射到 macOS `NSAccessibility` 的同一棵树。为完成该检查临时创建的产物 `949e277c…` 已在捕获后删除，不留残置。
- **原生 AX 路径（2026-10-18 复核后已可读）**：授予辅助功能后 `AXIsProcessTrusted=true`。`rea observe-native-ui` 在 AT 客户端运行时捕获到 `AXWebArea` 与 Web 内容（362 节点，含导航、衍生命令与可访问名称）；AT 客户端退出后同一窗口只剩 98 个浏览器壳节点，说明 Chrome 仅在存在 AT 客户端时启用渲染端无障碍。授权绑定宿主二进制路径（本次为 `/opt/homebrew/Cellar/omp/18.11.3/bin/omp`），升级 omp 后需重新授权。
- **屏幕阅读器语音不在本次范围**：语音取证依赖音频采集或读屏辅助技术，本次不执行。

## 2026-10-18 复核：产物类型矩阵与测验缺陷

- 通过 omp Chrome relay 在同一验收条目（用户真实登录会话）生产验证 `mindmap` 与 `flashcards`：生成后已保存列表出现 `打开 … 保存的思维导图/记忆卡`，`GET /artifacts/:id` 回读 `kind`、payload 与引用一致；随后按 id 删除，最终 `artifacts=[]`。
- `quiz` 在生产稳定失败：UI 落在 `data-derivative-status=unavailable-degraded`，直接 `POST /api/knowledge/:id/quiz` 返回 503 `AI_UNAVAILABLE`，耗时 9–11s。
- 诊断（临时诊断字段已移除）：Workers AI binding 在 464 字符处停止，`finish_reason=stop`、`completion_tokens=234`；把 `max_tokens` 从 2400 提到 8000、关闭 `strict`、移除 `response_format` 都未修复（移除后 913 字符，仍非完整 JSON）。同一份用户提示（373 字符）通过 REST 直连同一模型可完成并返回 1 题，但 `prompt_tokens` 为 370（binding 为 358），说明 binding 与 REST 不是同一条模型/分词路径。
- 修复与部署：测验固定使用 `@cf/meta/llama-4-scout-17b-16e-instruct`，保留 2,400 tokens / 60s 预算；部署 `dc7487fb-d51b-46b3-a06b-cb22ab269e15` 后，生产 UI 生成 `quiz` 成功（200，1 题，1 条引用），`GET /artifacts/:id` 回读 `kind=quiz`，随后按 id 删除，`artifacts=[]`。
- 更正：初版把根因写成"共享 700-token 截断"只对 REST 路径成立，不是 binding 的根因；上一条保留该更正。

## 边界

- 未使用真实屏幕阅读器；本记录只证明键盘路径、可访问名称、原生 AX 树与三档视口，不宣称 AT 全矩阵。
- 管理员与贡献者各自完成一次单产物旅程；跨成员拒绝由 Workerd 用例覆盖（其他成员列表为空、读取 404）。
- 产物类型矩阵：仓库只定义 `mindmap | flashcards | quiz`（`src/studio/artifacts.ts`），不存在音视频产物；生产已验证 `mindmap` 与 `flashcards`，`quiz` 生产失败（见上节），待部署修复后重验。
- 最终删除产物；审计保留创建/删除记录。临时贡献者已禁用。
- 本文不含正文、Cookie、Session、邮箱或令牌。
