# 设计：邮箱密码自注册与登录

> **已被取代（2026-10-18）：** 用户决定恢复邀请制。注册改为必须使用一次性邀请码，密码重置必须校验绑定到该成员的邀请码；开放注册与“邮箱+新密码直接重置”不再有效。当前契约见 [`2026-10-18-invitation-code-registration-design.md`](./2026-10-18-invitation-code-registration-design.md)。本文保留为历史记录。

- 日期：2026-10-18
- 范围：本地实现、迁移与门禁；不含生产迁移、部署或真实浏览器验收
- 相关：`IDN-007`

## 问题

此前的邮箱验证码方案依赖外发邮件：Cloudflare Email Sending 在当前账户不可用，Resend 又需要额外的 API Key 和域名验证。产品改为不做邮件：新用户直接在登录页注册邮箱和密码，之后用密码登录。

## 决策

1. **开放自注册。** `POST /auth/register` 接受 canonical email 与 12–128 位密码，创建 active contributor，并立即下发会话。
2. **直接重置。** 不生成、不保存恢复码；忘记密码时用邮箱 + 新密码直接重置。已有密码账户与旧一次性授权码账户（`access_sub` 以 `code:` 开头、无密码）都可以设置密码；仅有 GitHub/微信身份的成员仍不可重置。重置清零失败计数并删除该成员全部会话。该流程不要求邮箱所有权或其他额外凭据，任何知道可重置邮箱的人都能替换密码；这是当前产品决策的已知边界。
3. **邮箱唯一。** `members(LOWER(TRIM(email)))` 唯一索引；注册先查重，唯一索引兜住并发。已有成员（包括只有 GitHub 身份的成员）不能被注册覆盖，避免未验证邮箱接管账户。
4. **密码存储。** PBKDF2-HMAC-SHA256，100,000 次，16 字节随机盐，32 字节输出；格式 `pbkdf2-sha256$100000$<salt>$<hash>`。Workerd 实测 100k 约 6ms，适合当前免费 Worker 预算。
5. **登录锁定。** 连续 5 次密码错误后锁定 15 分钟；成功登录清零。未知邮箱也执行一次 PBKDF2，避免明显的时序枚举。
6. **注册限流。** 按 `CF-Connecting-IP` 的 SHA-256 每小时最多 5 个新账户；不存原始 IP。
7. **移除旧路径。** 删除邮箱验证码、Resend、管理员邀请码、OTP 组件与相关表；GitHub OAuth 保持原 allowlist 语义。

## 接口

匿名、要求同源 `Origin`：

- `POST /auth/register`，`{ email, password }` → `201 { member: { id, email, role: "contributor" } }` + `__Host-memory-session`
  - `400 PASSWORD_AUTH_REQUEST_INVALID` / `400 PASSWORD_POLICY_INVALID`
  - `409 REGISTRATION_EMAIL_TAKEN`
  - `429 REGISTRATION_RATE_LIMITED`
- `POST /auth/password`，`{ email, password }` → `200 { member }` + session
  - `401 PASSWORD_LOGIN_INVALID`（邮箱不存在、无密码、密码错误统一）
  - `429 PASSWORD_LOGIN_LOCKED`，`details.retryAfterSeconds`
  - `403 MEMBER_DISABLED`（仅在密码正确后）
- `POST /auth/password/reset`，`{ email, password }` → `204`（不创建会话）
  - `400 PASSWORD_RESET_REQUEST_INVALID` / `400 PASSWORD_POLICY_INVALID`
  - `401 PASSWORD_RESET_INVALID`（未知邮箱、无密码账户、并发条件更新失败统一）
- `GET /api/auth/providers` 保持 `{ github, wechat }`，不再有 `emailCode`。

## 数据（0078）

- `members.password_hash TEXT`、`failed_login_count INTEGER NOT NULL DEFAULT 0`、`locked_until TEXT`。
- 唯一索引 `members_canonical_email ON members(LOWER(TRIM(email)))`。
- `password_registration_attempts(ip_hash, created_at)` 与 `(ip_hash, created_at DESC)` 索引。
- 删除 `email_login_codes` 与 `member_login_invitations`。

## 不变量

1. 密码只存 PBKDF2 记录，不落明文、不进日志/响应。
2. 注册不能覆盖任何已有 email；并发注册只有一个成功。
3. 登录失败计数与锁定是持久化条件更新；成功登录清零。
4. 新账户恒为 contributor，不走 bootstrap admin 提升。
5. 无邮件验证、无邮件找回密码、无恢复码；邮箱 + 新密码即可自助重置，不校验邮箱所有权。旧 `code:` 账户可设置首个密码；GitHub/微信专属账户不可重置。
6. 重置使用空值安全的条件更新 `WHERE password_hash IS 旧值`；成功时删除该成员全部会话并写 `member.password_reset` 审计。

## 明确不做

- 不做邮箱验证、验证码、Magic Link、密码重置邮件或恢复码。
- 不做管理员代设密码或邀请码；管理员仍可禁用账户。
- 不引入新的 Secret/环境变量。
- 本轮不迁移生产、不部署、不做真实浏览器验收。
