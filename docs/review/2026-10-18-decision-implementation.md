# 三项决策的实现记录（2026-10-18）

依据用户对全功能评审的三条决定实施，均为**本地实现**，不含生产迁移、部署或真实浏览器验收。

## 决策与结果

| # | 决定 | 结果 |
| --- | --- | --- |
| 1 | 不接受开放注册：注册需邀请码；每位成员只能分享一个邀请码、一次性使用；管理员可无限生成；邀请码绑定新成员；重置密码需校验邀请码；管理员在成员管理查看所有邀请码 | **已实现**（迁移 `0079`、后端服务/路由、登录/设置/成员管理三 tab 前端、测试与文档） |
| 2 | `/agent` 改为真正调用 AgentSession | **已实现**（会话创建/恢复、接地检索 + 严格引用、turn 持久化/终止、前端会话生命周期） |
| 3 | 补审核元数据编辑 UI | **已实现**（标题/Space/Collection/Tag/可见性 + 扩权确认 + 意图重放） |

## 1. 邀请码注册与绑定式重置

**数据**：`migrations/0079_invitations.sql` 新增 `invitations`（`kind=admin|member`、`owner_member_id`、`bound_member_id`、`status=unused|used`、`created_by_member_id`、时间戳）；唯一 `code`、唯一 `bound_member_id`、每成员唯一 `owner_member_id` 部分索引。

**语义**：
- 注册必须携带未使用邀请码；成员插入与码占用在同一 D1 batch（`INSERT ... SELECT WHERE EXISTS(unused)` + `UPDATE ... WHERE status='unused'`，两边 `changes=1`），并发同码只成功一个，失败不消耗码。
- 每位成员首次访问“我的邀请码”时创建一个 `kind=member` 码；终身只能有一个，使用后只读。
- 管理员 `POST /api/admin/invitations` 可无限生成 `kind=admin` 码（每次 1–20），`GET` 分页查看全部码、分享者与绑定成员。
- 重置必须是 `active` 成员、存在绑定码且提供的码常量时间匹配；成功覆盖密码、清锁定、删全部会话、写审计；未知/错码/无绑定/禁用统一失败。
- 码以明文存储（管理员/成员需要读取与复制），日志与审计不写码。

**主要文件**：`src/invitations/*`、`src/routes/{auth,invitations,admin-invitations}.ts`、`src/password/{service,repository}.ts`、`src/app.ts`；`frontend/lib/invitations-data.ts`、`frontend/pages/login-page.tsx`、`frontend/lib/password-auth-data.ts`、`frontend/components/settings/my-invitation-card.tsx`、`frontend/pages/settings-page.tsx`、`frontend/components/admin/invitation-admin-panel.tsx`、`frontend/components/admin/invitation-network-panel.tsx`、`frontend/pages/admin/members-page.tsx`、`frontend/lib/i18n.ts`。

**文档**：新设计 `docs/superpowers/specs/2026-10-18-invitation-code-registration-design.md`；旧开放注册设计与证据已标注被取代；README、生产手册、设置手册、账本 IDN-007/ADM-007 同步。

**验证**：`test/worker/password-auth.test.ts` + `test/worker/invitation-auth.test.ts` 22/22；`test/unit/invitations.test.ts` 11/11；前端邀请码定向 28 通过；`verify-m1-migrations --files` = 79。

### 1.1 历史账户兼容（2026-10-19 补充）

已有密码账户若没有绑定邀请码，重置会统一失败。补充两条路径：

- `POST /api/account/password`：已登录成员设置或修改密码；已有密码必须校验当前密码，无密码账户（如仅 GitHub）可从会话设置首个密码；成功后清除锁定并撤销其它会话，保留当前会话。设置页新增“密码”卡片。
- `migrations/0080_backfill_password_invitations.sql`：为 0079 之前 `password_hash IS NOT NULL` 的成员回填 `kind=admin`、`status=used`、绑定到该成员的邀请码；管理员在成员管理“邀请码”tab 可见并转交，用于无会话找回。没有密码的 GitHub/微信专属成员不回填。

验证：`test/worker/account-password.test.ts` 4/4、`test/unit/frontend-account-password.test.tsx` 4/4；迁移台账更新为 80。

### 1.2 成员可见的邀请码（2026-10-19 补充）

- `GET/POST /api/invitations/mine` 统一返回 `{ boundInvitation, invitation }`：
  - `boundInvitation`：创建本账号的邀请码（注册时使用的码，或 0080 回填码），即无会话重置所需的凭据；
  - `invitation`：本人唯一的分享码；未创建时为 null，已使用时带 `boundEmail`（消费该码的新成员邮箱）。
- 设置页拆成两张卡：“账号绑定的邀请码”和“我的邀请码”；分享码被使用后显示新成员邮箱且只读。
- 安全边界：绑定码对本人可见（重置需要它），但只返回本人数据；接口仍只允许 active member 读取自己的记录。

### 1.3 管理员邀请关系网（2026-10-19 补充）

- 新增 `GET /api/admin/invitations/network`：返回全部成员节点、其邀请人（由绑定邀请码推导）与 `members/invited/roots/maxDepth` 统计。
- 前端 `InvitationNetworkPanel` 挂在 `/admin/members` 的“关系网”tab；使用仓库内置的 **beUI `motion/file-tree`** 表达邀请裂变森林（每个成员最多一个邀请人），点击“查看关系网”后加载，默认展开、显示邮箱/邀请码类型与码/角色/禁用状态；历史回填节点作为根节点并标注。
- 未引入第三方 graph 库或自定义 Canvas：邀请关系在数据上就是森林，beUI 树已满足键盘与展开语义。

验证：worker 关系网与 403 用例、前端 3 个渲染/重试/空态用例通过；全量门禁见 §6。

### 1.4 审核批量处理独立页面（2026-10-19 补充）

- `/admin/submissions` 表格改为占满页面高度；右上角新增“批量处理”入口，跳转 `/admin/submissions/batch`。
- 新页面复用 `useReviewBatch` 与逐项结果组件：仅选择本页待审项，逐项携带 operationId/expectedUpdatedAt；全部成功提交后自动返回审核队列，部分失败留在批量页只重试失败项。
- 该子页面在 `frontend/app-routes.ts` 固定路径分支先于 `/admin/submissions/:id` 匹配；队列页不再展示内联批量工具栏。
- 测试：`frontend-review-batch.test.tsx` 覆盖入口、禁止态、全部成功回跳与部分失败重试；`frontend-workbench-maturity-routes.test.tsx` 增加该子页四态与角色矩阵；能力账本/缺口矩阵/域审计与操作清单同步。

## 2. `/agent` 接入 AgentSession

- `POST /api/agent/sessions/:id/stream` 改为：`startTurn` → 读取历史 → `searchInternal(scope)` → `CitedAnswerService.answer` → 生成后再次授权 citation → `completeTurn`；错误/断流 `terminateTurn`。
- 新增 owner-only `POST /turns/:turnId/terminate`；SSE 帧与知识问答一致，终结 body 增加 `sessionId`/`turnId`。
- 前端改为创建/恢复 AgentSession、加载消息、终止 turn；删除旧 chat conversation feedback/history 依赖；member-scoped localStorage 恢复会话。
- 工具路由保持 allowlist；无发布/删除/改权限/网络/Shell 工具。

**验证**：`test/worker/agent-session.test.ts` 13/13；前端 agent 8 文件 67 通过；`npm run typecheck` 通过。

## 3. 审核元数据编辑 UI

- 审核详情新增“发布信息”表单：标题、Space/Collection（成员目标加载器）、Tag 多选（按 Space 的管理标签加载，保留提交者 tags）、可见性。
- `admin_only → shared` 必须勾选 `data-review-visibility-expansion`；未确认时 Publish 禁用；确认后 payload 带 `visibilityReasonCode:"admin_visibility_expansion"`，非扩权不带。
- 编辑值通过 `publishOverrides` 进入 `prepareReviewDecision`，并纳入 intent；未知结果重试原样重放编辑后的 body。
- 选项加载失败就地错误 + 重试，页头常驻；仅共享 UI 原语。

**验证**：审核定向 12 文件 210 通过；`typecheck:frontend`、legacy audit 通过。

## 门禁与文档一致性

- 迁移台账 78→79：`scripts/verify-m1-migrations.mjs` 与 `scripts/m1-release-contract.test.mjs` 已更新哈希/计数。
- 领域审计：修复 `7ef7055a` 遗留的 artifacts DELETE 漏登记；登记新增邀请码/Agent 操作；删除已移除的 chat scope/cancel/feedback 声明；重新生成 `docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md`；`audit:workbench-domain` 及 31 项领域审计测试通过。
- 缺口矩阵：新增 4 条 domain 缺口（邀请码生成、Studio 产物删除、Agent 会话创建/终止）、移除 2 条已不存在的 chat 缺口；同步 R3/R6 阶段计数与汇总（83 gap：25 P0 / 57 P1 / 1 P2）。
- 前端操作清单重新生成（477 文件 / 1783 候选 / 173 未归属），并更新 `frontend-operation-unassigned-review.md`（新增 11 条 feedback-widget 未挂载候选、App 坐标与指纹）。
- README/账本/手册：invitation-only 恢复；密码重置规则改为绑定邀请码；`ALLOWED_MEMBER_EMAILS` 仅约束 GitHub 登录、撤权用禁用成员。

## 全量门禁

<!-- GATE-RESULT -->
| 阶段 | 结果 |
| --- | --- |
| `npm run check` | **退出码 0** |
| `test:smoke` | 88/88 |
| `test:i18n` | 14/14 |
| `verify:delivery-status` | 30/30 |
| `test:unit` | **414 文件 / 5625 用例通过** |
| `test:worker` | **80 文件 / 1326 用例通过** |
| `verify:landing` | 100/100 |
| `build` | 通过（Vite + secret 扫描 + legacy audit + `wrangler deploy --dry-run`，上传 1737.14 KiB / gzip 329.27 KiB） |
| `audit:workbench-domain` / 其 31 项测试 | 通过（证据已重新生成） |
| `verify:workbench-maturity` | 15/15 |

说明：Workerd 运行中出现 `wrangler` 调试日志写入用户目录的 `EPERM` 告警（沙箱限制），不影响命令退出码与测试结果。
<!-- GATE-RESULT -->

## 剩余风险 / 未覆盖

- 未应用远程 `0078`/`0079`，未部署；生产 schema 仍是旧版本，不能声称已发布。
- 未做真实浏览器/移动键盘/密码管理器/深色主题/双账号验收。
- 邀请码明文与管理员可见是产品要求，但需在生产复核管理员权限与日志/截图泄露面。
- 重置接口未新增独立 IP 限流；绑定码为 16 位随机，发布前按 OPS-009 复核免费层 CPU/暴力面。
- Agent 接地回合不自动调用工具带；工具仍由 API 暴露。旧 chat conversation 反馈面已从 `/agent` 移除，后端端点保留。
- 审核元数据编辑未单独接离页守卫（按本次需求未要求）。
