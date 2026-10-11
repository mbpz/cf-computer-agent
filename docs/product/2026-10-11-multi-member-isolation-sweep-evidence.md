# 多成员授权/隔离扫描证据（本地）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `4e144762eec0edba98f3dc8586a569e4bb1a3a75`（本地未推送）。

## 范围与结论边界

本记录如实登记一次**本地合成的多成员授权/隔离扫描**（checklist D05 在本地可执行的那一部分）：在三个合成本地成员之间，逐项核对会话接口、admin 越权面、成员作用域数据（收藏、操作回执、私有笔记、我的提交）以及原生浏览器下的管理路由拒绝 UI。

**结论：缺陷：无。** 本轮扫描未发现越权访问、成员间数据泄露或响应式缺陷：contributor 对全部 admin 面返回 `403`，成员作用域读只返回本人数据，跨成员服务端操作回执返回 `404`（不泄露是否存在），原生导航不含任何 admin 入口且直达 admin 路由一律渲染 `403` 拒绝提示而非空白/卡死。

本记录**不翻转任何 checkbox**：功能清单原 30 父项、D08 排除后范围 29、关闭 5、开放 24 不变。本记录**不构成 D05/D06/D04 任何验收**（见“明确非声明”）。

## 本地栈（精确）

- 本地 D1 植入**三个合成成员**，每个各有一行 `auth_sessions`：
  - `member-iso-admin`：role `admin`，关联 `role-admin`，能力掩码 `0x37ffff`。
  - `member-iso-a`、`member-iso-b`：role `contributor`，关联 `role-contributor`，能力掩码 `0x1600c3`。
- 会话经**本地透传代理**注入（仅本地 harness，**非产品代码**）；浏览器为 **CDP 驱动的真无头 Chrome**。
- 所有写请求携带 `Origin: https://memory.crgmhrc.asia`（应用硬编码的规范来源，`src/config.ts:11`）；无该 Origin 的不安全方法会被同源（CSRF）守卫拒绝。

## 一、会话接口

| 会话 | `GET /api/session` |
| --- | ---: |
| `member-iso-admin` | 200 |
| `member-iso-a` | 200 |
| `member-iso-b` | 200 |
| 无 cookie | 401 |
| 伪造 43 字符 token | 401 |

## 二、admin 越权面（contributor A vs. admin 对照）

| 端点 | contributor A | admin（对照） |
| --- | ---: | ---: |
| `GET /api/admin/menus` | 403 | 200 |
| `GET /api/admin/members` | 403 | 200 |
| `GET /api/admin/roles` | 403 | 200 |
| `GET /api/admin/spaces` | 403 | — |
| `GET /api/admin/assets` | 403 | — |
| `GET /api/admin/duplicates` | 403 | — |
| `GET /api/admin/audit-events` | 403 | — |
| `GET /api/admin/audit-events?page=1&pageSize=10` | — | 200 |
| `GET /api/admin/analytics/overview` | 403 | — |
| `GET /api/admin/submissions` | 403 | — |

## 三、写边界（证明 403 是授权而非 CSRF）

| 请求 | 观察 |
| --- | --- |
| contributor A `POST /api/admin/menus`（带规范 Origin） | 403 `FORBIDDEN` |
| 同一调用作为 admin（带规范 Origin） | **201 ok** |
| contributor `DELETE /api/admin/spaces/<id>` | 403 `FORBIDDEN` |
| contributor A `PUT /api/knowledge/<不可读 id>/favorite` | 404 `FAVORITE_NOT_FOUND`（不泄露该条目是否存在） |

对照写明：同一次 `POST /api/admin/menus` 在 admin 会话下返回 `201`，说明规范 Origin 守卫**已通过**，contributor 的 `403` 是**授权**结论而非同源守卫拦截。

## 四、成员作用域数据（实测）

**收藏作用域**（真实条目 `km-iso-item-1`，共享/已发布，owner 为 A）：

| 观察 | 结果 |
| --- | --- |
| A `GET /api/knowledge/km-iso-item-1/favorite` | `{"favorite":true}` |
| B 同 `GET` | `{"favorite":false}` |
| A 收藏列表 | 含该条目 |
| B 收藏列表 | `{"items":[]}` |

**操作回执边界**：

| 观察 | 结果 |
| --- | --- |
| A `PUT /api/knowledge/km-iso-item-1/favorite {"operationId":"iso-seed-op-1"}` | 201，返回回执 |
| A 以同编号重放 | 201，**逐字节等价**响应体（`operation.createdAt` 相同，无第二次副作用） |
| A `GET /api/knowledge/favorites/operations/iso-seed-op-1` | 200 |
| **B 同 `GET`** | **404 `FAVORITE_OPERATION_NOT_FOUND`**（回执按成员作用域，不披露他人操作） |

**私有笔记**：

| 观察 | 结果 |
| --- | --- |
| A `PUT /api/knowledge/km-iso-item-1/note`（`{title, body, citations:[{revisionId:"km-iso-rev-1", chunkId:"km-iso-chunk-1", startLine:1, endLine:2}]}`） | 200（`visibility: private`、`access: owner`） |
| A `GET` 该笔记 | 返回笔记 |
| **B `GET` 该笔记** | `{"note":null}` |
| A `GET /api/knowledge/notes` | 含该笔记 |
| B `GET /api/knowledge/notes` | `{"items":[]}` |

**我的提交**：

| 观察 | 结果 |
| --- | --- |
| A `GET /api/submissions/mine` | 含 A 的种子提交 |
| B `GET /api/submissions/mine` | `{"items":[],"total":0}` |

## 五、原生浏览器拒绝 UI（contributor A）

- 导航含 **16** 个 `[data-route-id]`，其中 **零** 个 `admin*` 条目、**零** 条 `/admin*` 链接。
- 直达 `/admin`、`/admin/menus`、`/admin/members`、`/admin/roles`、`/admin/audit`、`/admin/analytics` 各渲染告警 `403：访问被拒绝当前服务器会话没有访问此路由所需的能力。`，**无** admin 数据表格、**无** admin 路由 id，**无**卡死或空白状态。

## 六、harness 事实与可复现性说明

记录以下事实，以免本证据被误读：

- **规范 Origin 守卫**：不安全方法若缺少 `Origin: https://memory.crgmhrc.asia`，会被同源（CSRF）守卫拒绝。之前观察到的那次 `403` 是**同源守卫**，不是授权结论——**不得**把无 Origin 的 `403` 报告为授权发现。
- **可读知识条目的前置条件**：除 D1 行链（`submissions` → `sources` → `source_versions` → `revisions` → `knowledge_items` → `chunks`）外，还需 KnowledgeBase Durable Object VFS 内存在**已发布文件**，且其字节的 SHA-256 等于 `revisions.content_sha256`；否则读取端以 `PUBLISHED_CONTENT_CORRUPT` 拒绝内容不匹配。
- **种子脚本**位于 `/tmp`，**不在仓库内**。
- 之前 `/api/admin/audit`、`/api/admin/analytics` 上的 `404` 是**路径写错**（真实端点为 `/api/admin/audit-events` 与 `/api/admin/analytics/overview`），**不是缺陷**。

## 本地清理（扫描后）

扫描完成后已从本地 D1 移除**全部合成行**并核验零残留：`members`、`knowledge_items`、`private_notes`、`knowledge_favorites`、`knowledge_favorite_operation_receipts`、`submissions`、`sources`、`source_versions`、`revisions`、`chunks` 以及探针菜单（`key='iso-probe'`）均报 **0 行**；种子成员的 `role_members` 与 `auth_sessions` 行亦已删除。

删除顺序受外键约束（首次尝试曾以 `SQLITE_CONSTRAINT_FOREIGNKEY` 失败），需按序执行：先 `private_note_shares` 再 `private_notes`；先 `knowledge_favorites`/`knowledge_favorite_operation_receipts` 再 `members`；且须先将 `knowledge_items.current_revision_id` 置 `NULL` 再删 `revisions` 行——随后 `chunks` → `revisions` → `knowledge_items` → `source_versions` → `sources` → `submissions`。

种子发布进 KnowledgeBase Durable Object VFS 的 markdown 文件**保留为惰性本地状态**（其 D1 revision 行已删除）。两个种子脚本与 harness 代理位于 `/tmp` 并已删除；扫描 harness **未创建或修改任何仓库文件**。

## 缺陷：无

本轮多成员授权/隔离扫描**未发现缺陷**；上表所有越权调用均被 `403`/`404` 正确拒绝，所有成员作用域读均只返回本人数据，原生管理路由拒绝 UI 完整可读。

## 明确非声明

- 三个成员为**合成本地成员**，**不是真实身份**；本地透传代理**只是本地 harness，不是产品代码**。
- 本记录**不构成 D05/D06/D04 验收**，不替代真实账户/角色旅程，也不替代目标桌面浏览器（Chrome/Edge）上的验收。
- 未发布、未部署、未 `wrangler ... --remote`、未远程迁移 D1、未写入 secrets。
- 父项计数 **29 范围内 / 5 已关闭 / 24 未关闭**（D08 排除）**不变**，未翻转任何 checkbox。
