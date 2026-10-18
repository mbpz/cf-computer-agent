> **已被取代（2026-10-18）：** 本设计的管理员转发一次性码路径已由[邮箱验证码登录设计](./2026-10-18-email-otp-login-design.md)取代；邀请记录现在只作为授权，验证码由用户请求并由邮件发送。本文保留为历史决策记录。

# 设计：管理员授权的邮箱 + 一次性登录码（新用户开通）

- 日期：2026-10-11
- 状态：方案已确认（四项决策由用户拍板），实现进行中
- 范围：本地实现 + 测试 + 门禁；不含生产迁移/部署授权

## 问题

当前只有 GitHub OAuth 一条登录路径，且放行依赖白名单：邮箱不在 `ALLOWED_MEMBER_EMAILS` 内即 `403 MEMBER_NOT_ALLOWED`，**不创建任何成员**（`src/members/service.ts:61-78`）。管理员身份只在"尚无活跃管理员"且邮箱等于 `BOOTSTRAP_ADMIN_EMAIL` 时授予，另有唯一索引 `one_active_admin` 限一个；其余一律 `contributor`。因此新用户无法自行注册，也没有"管理员开通某邮箱"的正规通道。

## 目标与已定决策

| 项 | 决策 |
| --- | --- |
| 开通方式 | 管理员登录后在**成员管理**页录入邮箱并生成一次性登录授权码；不新增路由/能力，复用既有 `member:manage` |
| 授权码 | **43 字符 base64url**（与会话令牌同形，256 位随机）；**24 小时**有效期 |
| 交付 | **生成后由管理员复制转发**（本仓库当前**无任何外发邮件能力**：`wrangler.jsonc` 无 `send_email`，无第三方邮件客户端；站内通知因 `recipient_member_id` 外键指向已存在成员，无法投递给尚不存在的邮箱） |
| 现有管理员邮箱 | **拒绝发码**（`409 INVITATION_ADMIN_EMAIL`），避免"发码"被误当登录后门 |
| 登录入口 | **保留 GitHub**（管理员与既有成员）+ 新增邮箱 + 授权码 |
| 角色 | 该路径创建的账号**恒为 `contributor`**，任何情况下不创建/提升 admin |

## 冻结接口契约

管理员（能力 `member:manage`，沿用 `src/routes/admin.ts` 的守卫与错误形状）：

- `POST /api/admin/member-invitations`，请求体精确为 `{ "email": string }` → `201 { "invitation": { id, email, status: "pending", createdAt, expiresAt }, "code": string }`。明文 `code` **仅此一次**返回，之后不可再取、不得入日志。
  - `400 INVITATION_REQUEST_INVALID`、`403`（能力）、`409 INVITATION_ALREADY_PENDING`、`409 INVITATION_ADMIN_EMAIL`
- `GET /api/admin/member-invitations` → `200 { "items": [ { id, email, status, createdAt, expiresAt } ] }`（**不含码**）
- `POST /api/admin/member-invitations/:id/revoke` → `200 { "invitation": { id, email, status: "revoked" } }`；`404 INVITATION_NOT_FOUND`、`409 INVITATION_NOT_PENDING`

公开登录（`/auth/*` 已由 `src/app.ts:161-171` 分发到 `routeAuth`）：

- `POST /auth/code`，请求体精确为 `{ "email": string, "code": string }` → 成功后经既有会话助手写入 `__Host-memory-session` cookie，并返回 `200 { "member": { id, email, role: "contributor" } }`（前端随后跳转 `/`）
- 校验失败（邮箱不存在/码错/过期/已撤销/已兑换/达尝试上限）**统一** `401 CODE_LOGIN_INVALID`，不泄露邀请是否存在；请求体畸形 `400 CODE_LOGIN_REQUEST_INVALID`

## 强制不变量

1. 仅存 `sha256` 十六进制，常数时间比较；签发后无论日志还是响应都不得再出现明文码。
2. **并发下单次使用**：兑换用条件更新 `UPDATE … WHERE id = ? AND status = 'pending' AND expires_at > ?` 并要求 `changes() = 1`，两次并发兑换不可能都成功。
3. 角色强制 `contributor`；即使邮箱等于 `BOOTSTRAP_ADMIN_EMAIL` 也不得创建或提升 admin。
4. 24 小时过期；按邀请持久化 `attempt_count`，失败上限 **5 次**，达上限后**静默锁定**（仍返回统一 `401`）。
5. 成员解析与 GitHub 路径一致（先按规范化邮箱匹配既有成员，缺失才创建），新建时用独立主体命名空间（如 `code:<uuid>`）并复用 `MembersRepository.insert`/`insertWithAudit`；受邀邮箱**无需**在 `ALLOWED_MEMBER_EMAILS` 中——邀请本身即授权。
6. 所有状态变更经既有强类型审计映射（`src/audit/types.ts`，需新增动作键并保持 `validateMetadata` 一致），采用 `db.batch([mutation, auditStatement])`。
7. 不新增路由与能力 id；前端改动落在既有成员管理页与登录页。

## 数据

迁移 `0063`：新表 `member_login_invitations`（`id`、`email`、`code_hash`、`status ∈ {pending, redeemed, revoked}`、`attempt_count`、`created_at`、`expires_at`、`redeemed_at`、`revoked_at`），含部分唯一索引 `UNIQUE(email) WHERE status='pending'` 与 `created_at DESC, id DESC` 索引；兑换走条件更新并沿用 `0034`/`0060` 的幂等守卫风格。成员归属不落该表：兑换成功后由 `member.code_login` 审计（含 `email`）与成员行本身溯源，不额外写入 `redeemed_member_id`。迁移文件 sha256 需同步钉入 `scripts/verify-m1-migrations.mjs`（仅 `localMigrations`）与 `scripts/m1-release-contract.test.mjs`。

## 明确不做

- 不加邮件发送通道（属独立工作项：`send_email` 绑定或第三方 API + 发信域名 + 从地址 + 新 secret + 发送模块）。
- 不做自助注册/自助申请入口（开通**只能**由管理员在成员管理页发起）。
- 不改 GitHub OAuth 路径与既有白名单语义。
- 本轮不执行生产迁移/部署（另有授权流程）。

## 证据：本地端到端冒烟（2026-10-11）

方法：真实本地栈 —— `wrangler dev`（:8787）+ 两个规范 origin HTTPS 前端（:9443 注入合成管理员会话；:9444 匿名、透传浏览器自身 cookie），全部经真实 `/api/*`、`/auth/code` 路径；另用有头 Chrome 走真实 UI。所有校验与写入均为真栈行为，非 mock。

| 检查 | 实测 |
| --- | --- |
| 管理员签发（`POST /api/admin/member-invitations`） | **201**；码长 **43** 且匹配 `^[A-Za-z0-9_-]{43}$`；`expiresAt` = 签发 +24h |
| 列表（`GET`） | **200**，响应**不含**明文码 |
| 受邀者兑换（`POST /auth/code`） | **200** → `{member:{id,email,role:"contributor"}}` + `Set-Cookie: __Host-memory-session` |
| 兑换后会话 `/api/session` | role = **contributor**，5 项能力 |
| 该成员 `/api/navigation` | **18** 条 path、**无 `/admin*`**；工作台十项（`/tasks /boards /inbox /goals /projects /graph /calendar /today /focus /review`）齐备 |
| 同一码二次兑换 | `CODE_LOGIN_INVALID`（单次使用） |
| 给现有管理员邮箱发码 | **409 `INVITATION_ADMIN_EMAIL`** |
| 撤销 | `revoked`；其后兑换 → `CODE_LOGIN_INVALID` |

真实 UI 观察：成员管理页出现「授权新成员」区块（受邀请邮箱输入 + `生成授权码`），确认弹层文案为「确认生成一次性登录授权码？ 将为 <邮箱> 生成一次性登录授权码。该码只显示一次，之后无法再次获取。」；确认后区块显示 `<邮箱> 的登录授权码 <码>` + `复制授权码` + 「此码只显示一次。请立即复制，之后无法再次显示。」 + 有效期。登录页同时保留 `使用 GitHub 登录` 与新的 `使用邮箱验证码登录`（邮箱 + 一次性验证码，两个字段非空后提交按钮才可用；失败时只显示单一通用文案「该邮箱与验证码未通过验证。」）。

### 冒烟中排除的假象（记录以免他人重复追查）
- 首次在成员页看到「无法加载授权记录」与 `GET /api/admin/member-invitations` **500**：原因是**本机 dev D1 停在 `0062`、尚无 `member_login_invitations` 表**（worker 测试用的是临时库、每次自动跑全部迁移，所以 18 项测试全绿）。执行 `npm run db:migrate:local` 后即正常；**非代码缺陷**。
- 一度以为签发出的码是 45 字符：实为**我转录时多打 2 个字符**；接口与 DOM 均为 43 字符。
- 合成输入在**后台标签页**会被丢弃（`visibilityState: hidden`），需 `bringToFront()`；置前后 0ms/25ms/逐字三种节奏的输入**均完整写入**，输入节点不发生重挂载——即登录表单不存在「快速输入丢字符」问题。

### 待办（已发现、未改）
- 落地页文案仍为「工作台采用邀请制，请使用已获准的 **GitHub** 账号登录」，在新增邮箱+码路径后已过时；属产品措辞决定，未擅自改动。

### 非声明
- 未对 `0063` 执行任何远程迁移或部署（生产仍在 `0062`），生产侧无写入。
- contributor 侧效果由**服务端投影**（`/api/session`、`/api/navigation`）与 UI 渲染共同证实，未使用第二个真实身份。
