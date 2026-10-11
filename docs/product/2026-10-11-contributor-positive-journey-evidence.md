# 贡献者正向旅程（本地）证据

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `8418f1c523802f4129e4bf5e347258f0ff7326d4`（本地未推送，领先 origin 2）。

## 范围与结论边界

本记录如实登记一次**本地合成会话**驱动的贡献者**正向**旅程：对 `role-contributor` 掩码（`0x1600c3` = bit `0,1,6,7,17,18,20`）**允许**的写/读流程，实测写成功、**所有者可读回**、且**第二个成员（`acceptance-contributor-2`）读不到**——即“既允许又隔离”，而非仅仅“允许”。

已有的授权矩阵（`tools/acceptance/check-local-authorization.mjs`）证明的是**拒绝面**（贡献者在管理端 `403`、跨成员读隔离）；本记录补齐**允许面**。两者合起来才是贡献者授权面的完整本地烟测。

本记录**不翻转任何 checkbox**：功能清单范围 29、关闭 5、开放 24（D08 排除）不变。**不构成 D05/D06/D04 任何验收**：会话是**合成本地身份**（非真实账户）。**未 push、未部署、未 `wrangler ... --remote`、未远程迁移 D1、未读取 `.dev.vars`/`SECRETS_FILE` 或任何 secret**。

## 本地栈（精确）

- `wrangler dev --port 8787`（`wrangler@4.119.0`），监听 `127.0.0.1:8787`；本地 D1 `memory-garden-control-plane`；DO 绑定 `KNOWLEDGE`/`AGENT_SESSIONS`/`MAINTENANCE` 均本地。
- 合成本地成员：`acceptance-contributor-1`、`acceptance-contributor-2`（role `contributor` → `role-contributor`，`allow_bits = 0x1600c3`），各一行 43 字符 base64url token 的 `auth_sessions`（`token_hash` = SHA-256 hex）。**不是真实账户/身份**。
- 可写空间经 `GET /api/spaces` 发现为 `default`（`kind = shared`、`status = active`、`read_only = 0`）。

## 端点发现（先读源码，后写脚本）

同源（CSRF）护栏：`src/app.ts:204-206` 对 member 主体的**非安全方法**调用 `requireSameOrigin(request, APP_CONFIG.canonicalOrigin)`；`src/http.ts:79-91` 要求 `Origin` 头**恰好等于** `src/config.ts:13-14` 的 `canonicalOrigin` `https://memory.crgmhrc.asia`。故所有写请求都带该 `Origin`，否则一律 `403 FORBIDDEN`，检查将失去意义。

权限映射：`src/authorization/policy.ts:26-31`（contributor 能力集含 `submission:create`/`submission:read-own`/`knowledge:read`/`tasks:use`）、`:68-79`（掩码回退）、`:81-90`（`requireCapability`，member 主体以 `permissionMask` 判定）；位定义 `src/authorization/permission-bitmap.ts:8-29`（`submission:create`=6、`submission:read-own`=7、`workspace.tasks`=20）。

| 流 | 方法/路径 | 路由 file:line | 权限 | 服务/仓储 file:line |
| --- | --- | --- | --- | --- |
| 草稿创建 | `POST /api/submissions/drafts` | `src/routes/member.ts:363-370` | `submission:create` (bit 6) | `src/submissions/service.ts:57-68`；`src/submissions/repository.ts:95-117` |
| 草稿读回 | `GET /api/submissions/drafts/:id` | `src/routes/member.ts:372-390` | `submission:read-own` (bit 7) | `src/submissions/service.ts:70-73`；`src/submissions/repository.ts:122-126`（按 `submitter_id` 过滤） |
| 我的提交 | `GET /api/submissions/mine` | `src/routes/member.ts:431-441` | `submission:read-own` (bit 7) | `src/submissions/service.ts:244-251`；`listOwned` 按 `submitter_id` |
| 空间发现 | `GET /api/spaces` | `src/routes/member.ts:242-246` | 仅需 member（无能力位） | `src/spaces/service.ts:17`；`src/spaces/repository.ts:77-80` |
| 收件箱创建 | `POST /api/inbox` | `src/routes/inbox.ts:22-45` | 路由级 `tasks:use` (bit 20) | `src/inbox/service.ts:25-35` |
| 收件箱读回 | `GET /api/inbox/:id` | `src/routes/inbox.ts:68-72` | `tasks:use` | `src/inbox/repository.ts:39-41`（`member_id` 过滤） |
| 收件箱列表 | `GET /api/inbox` | `src/routes/inbox.ts:22-45` | `tasks:use` | `src/inbox/repository.ts:47-51` |
| 任务创建 | `POST /api/tasks` | `src/routes/tasks.ts:23-36` | 路由级 `tasks:use` (bit 20) | `src/tasks/service.ts:41-72`；`normalizeTaskCreate` `:401-429` |
| 任务读回 | `GET /api/tasks/:id` | `src/routes/tasks.ts:135-140` | `tasks:use` | `src/tasks/service.ts:90-92`；`requireOwned` `:393-396`（`TASK_NOT_FOUND` 404） |
| 任务列表 | `GET /api/tasks` | `src/routes/tasks.ts:23-36` | `tasks:use` | 按 `member_id` 过滤 |

请求体（均为 `strictRecord` 白名单，见 `src/routes/member.ts:499-513`）：草稿 `{ requestedSpaceId, kind:"text", title, content }`（`member.ts:276-290`；`normalizeDraft` 要求 `kind ∈ {text,markdown,code}`、`requestedSpaceId` 为非空 ≤128 字符且有界 id，且 INSERT 要求空间 `kind != 'legacy' AND read_only = 0 AND status = 'active'`）；收件箱 `{ clientKey, kind:"text", content }`（`kind=text` 时 `sourceUrl` 必须缺省/`null`，`src/inbox/service.ts:90-105`）；任务 `{ id, title }`——**body 必须携带客户端生成的 `id`**：`normalizeTaskCreate` 对空 `id` 抛 `TASK_INVALID` 400（`validId` 正则 `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`，`src/tasks/service.ts:401-407,504-506`），这也是前端总发 `crypto.randomUUID()` 的原因。

前端调用点（交叉核对，非本轮改动）：`frontend/lib/my-submissions-data.ts:18`（`GET /api/submissions/mine`）、`frontend/lib/submission-data.ts:31`（`POST /api/submissions`，全量提交，非草稿路径）、`frontend/lib/inbox-data.ts:55-56,89`（`POST`/`GET /api/inbox`）、`frontend/lib/tasks-data.ts:81-84,73`（`POST /api/tasks` 带 `id`、`GET /api/tasks/:id`）。

> 说明：任务书候选里的 “`POST /api/submissions` (draft create)” 实际是 `createWithSourceVersion`（需要真实内容并建 `sources`/`source_versions`）；纯草稿路由是 `POST /api/submissions/drafts`，更简单且天然按 `submitter_id` 隔离，故本检查采用草稿路由 + `GET /api/submissions/mine`。
>
> **刻意未纳入：favourite / note。** 二者都要求一条**可读的已发布知识项**。已发布项需要 KnowledgeBase DO 的 VFS 中确实存在一个 SHA-256 等于 `revisions.content_sha256` 的文件，否则读取侧返回 `PUBLISHED_CONTENT_CORRUPT`；在**不写 KnowledgeBase DO VFS**的前提下无法干净地造出这样一项。按任务约束**跳过**（不做伪造），故本轮正向后端流程为草稿 / 收件箱 / 任务三条；favourite 写路径的**拒绝面**（对不可读项 `PUT /api/knowledge/<id>/favorite` → `404`）已由 `check-local-authorization.mjs` 覆盖。

## 执行序列

严格顺序：**seed → 启动 dev → 检查 → 停止 dev → cleanup**（避免在 dev 服务同一本地 D1 时并发 `wrangler d1 execute`——该并发此前崩过 dev server）：

```
node tools/acceptance/seed-local-members.mjs
npx wrangler dev --port 8787            # 待 "Ready on http://127.0.0.1:8787"
node tools/acceptance/check-local-contributor-journey.mjs
# 停止 dev 后
node tools/acceptance/cleanup-local-members.mjs
```

## 逐条实测状态（原文）

首轮 `POST /api/tasks` 返回 **400 `TASK_INVALID`**——原因是**本次请求形状**缺 `id`（非产品缺陷）：`normalizeTaskCreate` 要求客户端提供 `id`。补入 `id: crypto.randomUUID()` 后全绿。修正后的完整输出（`check-local-contributor-journey.mjs`，退出码 0）：

```
Discovered writable space: default

Contributor positive-path journey against http://127.0.0.1:8787

PASS  contributor-1 POST /api/submissions/drafts                                      201
PASS  contributor-1 GET /api/submissions/drafts/f0a7ff00-1634-4f13-8e4e-43ca8194077e  200
PASS  contributor-1 draft read back the created id                                    f0a7ff00-1634-4f13-8e4e-43ca8194077e
PASS  contributor-2 GET draft f0a7ff00-1634-4f13-8e4e-43ca8194077e (owner isolation)  404
PASS  contributor-1 GET /api/submissions/mine                                         200
PASS  contributor-1 mine contains the draft                                           true
PASS  contributor-2 GET /api/submissions/mine                                         200
PASS  contributor-2 mine excludes the draft                                           false
PASS  contributor-1 POST /api/inbox                                                   201
PASS  contributor-1 GET /api/inbox/91739bb1-1d0a-473c-8538-1949759ea6b2               200
PASS  contributor-1 inbox read back the created id                                    91739bb1-1d0a-473c-8538-1949759ea6b2
PASS  contributor-2 GET inbox 91739bb1-1d0a-473c-8538-1949759ea6b2 (owner isolation)  404
PASS  contributor-2 GET /api/inbox                                                    200
PASS  contributor-2 inbox list excludes the item                                      false
PASS  contributor-1 POST /api/tasks                                                   201
PASS  contributor-1 GET /api/tasks/dd54b520-9d56-4a0e-87e1-30a54e248e8a               200
PASS  contributor-1 task read back the created id                                     dd54b520-9d56-4a0e-87e1-30a54e248e8a
PASS  contributor-2 GET task dd54b520-9d56-4a0e-87e1-30a54e248e8a (owner isolation)   404
PASS  contributor-2 GET /api/tasks                                                    200
PASS  contributor-2 task list excludes the task                                       false

20/20 checks passed.
PASS: contributor allowed flows succeeded and every created object stayed owner-scoped.
```

（草稿/收件箱/任务 id 为每轮随机，故上表 id 仅为本轮实例。）

## 隔离断言

- 草稿：`acceptance-contributor-2 GET /api/submissions/drafts/<id>` → **404**；`GET /api/submissions/mine` → **200** 且列表**不含**该草稿（`submitter_id` 过滤，`src/submissions/repository.ts:122-126,354-357`）。
- 收件箱：`acceptance-contributor-2 GET /api/inbox/<id>` → **404**；`GET /api/inbox` → **200** 且列表**不含**该项（`member_id` 过滤，`src/inbox/repository.ts:39-41,47-51`）。
- 任务：`acceptance-contributor-2 GET /api/tasks/<id>` → **404**（`requireOwned`，`src/tasks/service.ts:393-396`）；`GET /api/tasks` → **200** 且列表**不含**该任务。

## 缺陷

**缺陷：无。** 唯一一次非 2xx 是首轮 `POST /api/tasks` 的 `400 TASK_INVALID`，已核实为**本次请求形状**缺失必填 `id`（前端同样发送 `crypto.randomUUID()`），补上后 `201`；非产品缺陷。其余每一步均与源码预期一致。

## 门禁

- `npm run audit:functional-checklist` → 退出码 `0`；`inScope: 29`、`completed: 5`、`remaining: 24`、`excludedIds: ["D08"]`（`completedIds: A03,A04,B03,C07,D03`）。
- `npm run check` → 退出码 `0`（`vendor:check`/`types:check`/`typecheck`/`typecheck:landing`/`npm test`/`build` 全过）。其中 vitest `Test Files 362 passed (362)`、`Tests 5206 passed (5206)`、`fail 0`（另一批 vitest `70 passed (70)` / `1178 passed (1178)`）；`node:test` 段 `79/79`、`13/13`、`30/30`、`97/97` 均 `fail 0`；`build:secrets`、`frontend-legacy-audit`、`wrangler deploy --dry-run` 均通过。

## 清理（本地 D1）

停止 dev 后运行 `cleanup-local-members.mjs`（本轮已扩展任务/收件箱子表删除，见下），退出码 `0`，残留全零。原文：

```
Cleanup deletes applied (FK-safe order). Captured seed ids: 0 note(s), 0 item(s), 0 revision(s), 0 source(s), 2 submission(s).

Residual counts:
  private_note_shares                      0
  private_notes                            0
  knowledge_favorite_operation_receipts    0
  knowledge_favorites                      0
  task_links                               0
  task_subtasks                            0
  task_dependencies                        0
  task_tags                                0
  tasks                                    0
  inbox_items                              0
  chunks                                   0
  revisions                                0
  knowledge_items                          0
  source_versions                          0
  sources                                  0
  submissions                              0
  menus (probe)                            0
  role_members                             0
  auth_sessions                            0
  members                                  0

PASS: all residual counts are zero.
```

`8787` 无监听（清理前后均 `lsof` 为空）。`cleanup-local-members.mjs` 增补了 `task_links → task_subtasks → task_dependencies → task_tags → tasks → inbox_items`（`task_links` 先于 `knowledge_items`，`inbox_items` 先于 `submissions`），是对既有 FK 安全删除链的扩展，`--local` 限定，无远程操作。

## 改动文件（仅验收工具与文档，未动产品代码/测试/迁移）

- 新增 `tools/acceptance/check-local-contributor-journey.mjs`。
- 修改 `tools/acceptance/cleanup-local-members.mjs`（扩展任务/收件箱子表删除与残留计数）。
- 修改 `tools/acceptance/README.md`（新增该脚本的行与 (ii-bis) 章节、更新清理顺序）。
- 本文件 `docs/product/2026-10-11-contributor-positive-journey-evidence.md`。

`git diff --stat -- migrations/` 为空；`src/`、`frontend/`、`test/` 未改。**未 commit、未 push。**

## 明确非声明

- 会话为**合成本地身份**（`acceptance-contributor-1/2`），**不是真实账户**；token 仅在本地栈有效。
- 本记录**不构成 D05/D06/D04/D08 验收**，不替代真实身份旅程，也不替代真实桌面浏览器验收。
- 仅本地：未 `--remote`、未部署、未远程迁移、未读 secret；脚本只写本地 D1 合成行并打印合成 token。
- 运行本检查**不翻转任何 checkbox**；父项计数 29/5/24（D08 排除）不变。
