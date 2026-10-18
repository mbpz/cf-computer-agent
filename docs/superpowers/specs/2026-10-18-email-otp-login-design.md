# 设计：邮箱验证码登录（替代管理员转发一次性码）

- 日期：2026-10-18
- 范围：本地实现、迁移与门禁；不含生产迁移、发信域名配置、部署或真实收信验收
- 相关：`IDN-007`

## 问题

`0063` 让管理员签发 43 字符一次性码，再由管理员复制转发给受邀者；本仓库当时没有任何外发邮件能力。这要求管理员参与每次开通，且码经聊天/邮件手工传递，离开产品边界。用户要求改为：用户在登录页输入邮箱，系统把验证码发送到该邮箱，用户收到后登录，并使用 beUI 的 OTP Input 组件。

## 决策

1. **邀请变成授权记录，不再携带登录码。** 管理员仍通过成员管理页授权邮箱；`member_login_invitations` 只保留 `id/email/status/created_at/expires_at/redeemed_at/revoked_at`。首次邮箱验证码登录成功时把 pending 邀请翻为 `redeemed`。
2. **新增 `email_login_codes`。** 六位数字验证码，10 分钟有效，单次使用，最多 5 次错误尝试；按邮箱 60 秒重发冷却、每小时最多 5 封。只存 HMAC-SHA-256 十六进制。
3. **授权来源。** 仅以下地址会收到验证码：`ALLOWED_MEMBER_EMAILS` 中的邮箱、已有 active 成员、未过期的 pending 邀请。对其他地址仍返回 `202 accepted`，不泄露地址是否存在。禁用成员不会收到码。
4. **发信通道。** 通过 Cloudflare Email Sending 的 `send_email` 绑定 `EMAIL`，发件地址为代码常量 `login@memory.crgmhrc.asia`；不新增任何环境变量或 Secret。测试注入 `EmailLoginMailer`，不发起真实投递。若账户未开通 Email Sending，绑定仍存在但投递失败，接口返回可重试的 `503`。
5. **登录 UI。** 邮箱步骤 → 发送验证码 → 六位 OTP 输入（`@beui/otp-input` 手工落盘，见 `frontend/components/motion/otp-input.tsx`）→ 自动/手动提交。保留 GitHub 登录。
6. **无新增环境变量。** `EMAIL` 是 Worker 绑定，不是 Secret；发件地址固定在 `APP_CONFIG.emailLoginFrom`，HMAC pepper 复用既有 `APP_TOKEN`。

## 接口

登录（匿名、要求同源 `Origin`，`/auth/*` 不走 session）：

- `POST /auth/email/code`，请求体精确为 `{ "email": string }`
  - 成功或地址未授权/冷却中：`202 { "status": "accepted" }`
  - 畸形：`400 EMAIL_LOGIN_REQUEST_INVALID`
  - 未绑定 `EMAIL`：`503 EMAIL_LOGIN_UNAVAILABLE`
  - 已授权但普通传输失败：`503 EMAIL_LOGIN_DELIVERY_FAILED`（`retryable: true`；该挑战立即作废）
  - 发送方未验证、域名未开通或收件人受限：`503 EMAIL_LOGIN_UNAVAILABLE`（配置问题，不引导盲目重试；同样作废挑战）
- `POST /auth/email/code/verify`，请求体精确为 `{ "email": string, "code": string }`
  - 成功：`200 { "member": { id, email, role } }` + `__Host-memory-session`
  - 畸形/非六位：`400 EMAIL_LOGIN_REQUEST_INVALID`
  - 无挑战、已使用、过期、错误、达上限、授权已撤销：统一 `401 EMAIL_LOGIN_INVALID`
  - 已有成员被禁用：`403 MEMBER_DISABLED`

管理员（能力 `member:manage`，沿用原守卫）：

- `POST /api/admin/member-invitations` → `201 { "invitation": { id, email, status, createdAt, expiresAt } }`（不再返回 `code`）
- `GET /api/admin/member-invitations`、`POST /api/admin/member-invitations/:id/revoke` 形状不变

`GET /api/auth/providers` 增加 `emailCode: boolean`。

## 数据

迁移 `0077_email_login_codes.sql`：

- 重建 `member_login_invitations`，去掉 `code_hash`/`attempt_count`；复制全部既有行（含 pending/redeemed/revoked）。
- 新建 `email_login_codes(id, email, code_hash, attempt_count, created_at, expires_at, consumed_at)` 与 `(email, created_at DESC, id DESC)`、`created_at` 索引。

迁移可重跑：先 `DROP TABLE IF EXISTS ..._next`，复制后重命名；重复执行只保留既有行。

## 不变量

1. 验证码不落明文、不进日志、不进响应；请求接口对未授权地址与已授权地址返回同一状态。
2. HMAC 使用既有 `APP_TOKEN` 作为 pepper；数据库泄露本身不足以离线枚举六位数。
3. `consume` 用条件 `UPDATE ... WHERE consumed_at IS NULL AND expires_at > ? AND attempt_count < ?`；并发验证只有一个赢家。
4. 邀请 `redeem` 用条件 `UPDATE ... WHERE status='pending' AND expires_at > ?`，并发首个成功者写 `member.code_login` 审计。
5. 邮箱登录创建的新成员恒为 active contributor，不走 bootstrap admin 提升。
6. 发信失败时挑战立即作废，避免“未送达但仍可猜测”的窗口。

## 明确不做

- 不新增公开注册；授权仍只来自 allowlist、既有 active 成员或管理员邀请。
- 不保留管理员转发的一次性码入口；`/auth/code` 与 43 字符码加载逻辑一并移除。
- 不发送营销/批量邮件；不做验证码短信或 WhatsApp。
- 本轮不执行 Cloudflare Email Sending 开通、不部署、不迁移生产、不声明真实收信或生产验收。
