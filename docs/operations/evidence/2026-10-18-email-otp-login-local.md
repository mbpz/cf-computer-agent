# 证据：邮箱验证码登录（本地实现、Workerd 与 React 验证）

- 日期：2026-10-18
- 范围：`IDN-007`（管理员授权邮箱 + 邮件六位验证码）
- 性质：本地实现、迁移字节校验、Workerd 集成、React DOM 测试；**不含**生产迁移、部署、真实收信或真实浏览器验收

## 实现范围

- `migrations/0077_email_login_codes.sql`：重建 `member_login_invitations`（去掉 `code_hash`/`attempt_count`）并新建 `email_login_codes`。
- `src/email-login/`：Resend 发信、HMAC-SHA-256 验证码存储、请求/验证服务与 D1 仓库。
- 只新增 `RESEND_API_KEY`；发件地址固定在 `APP_CONFIG.emailLoginFrom`，HMAC pepper 复用既有 `APP_TOKEN`，区分大小写。
- `src/routes/auth.ts`：新增 `POST /auth/email/code`、`POST /auth/email/code/verify`；移除 `POST /auth/code`。
- `src/routes/admin.ts`：邀请签发返回授权记录，不再返回明文码。
- `frontend/pages/login-page.tsx`：邮箱 → 发送验证码 → 六位 OTP → 登录；保留 GitHub。
- `frontend/components/motion/otp-input.tsx`：手工落盘 `@beui/otp-input`，按仓库主题修正颜色/圆角并保留媒体钩子。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过（Worker + frontend） |
| `npm run types:check` | 通过（重新生成 `worker-configuration.d.ts`） |
| `npm run build:ui` | 通过（Vite 产物 + browser-vm build isolation） |
| `npm run verify:m1:migrations -- --files` | `[pass] migration-files count=77` |
| `npx vitest run test/worker` | **79 文件 / 1318 测试通过** |
| `npx vitest run test/unit` | **410 文件 / 5654 测试通过** |
| `npx vitest run test/unit/email-login-mailer.test.ts test/unit/frontend-email-login-data.test.ts` | **2 文件 / 7 测试通过** |
| `npm run test:i18n` | 14 测试通过，双语 key/placeholder 对等 |
| `npm run test:smoke` | 30 测试通过 |
| `node --test scripts/frontend-app-contract.test.mjs scripts/frontend-legacy-audit.test.mjs scripts/frontend-typecheck-contract.test.mjs` | 13 测试通过 |
| `node --test scripts/frontend-operation-inventory.test.mjs` | 10 测试通过（含人工复核指纹） |
| `npm run verify:wcag` | 通过 |
| `npm run verify:landing` | 100 测试通过 |
| `npm run build:legacy-audit` | 通过（无原生控件/旧引用） |
| `npm run audit:frontend-operations` | 通过（478 源文件 / 1775 候选） |
| `npm run verify:delivery-status` | 30 测试通过（Roadmap 成熟度与总账一致） |

## 行为矩阵（Workerd）

| 检查 | 实测 |
| --- | --- |
| allowlist 邮箱请求验证码 | `202 accepted`；发出 1 封六位码；DB 只存 64 位 HMAC，行内不含明文 |
| 未知邮箱请求 | `202 accepted`；不发信、不写行（不泄露地址是否存在） |
| 畸形请求 / 非 POST / query / 跨源 | `400 EMAIL_LOGIN_REQUEST_INVALID` / `405` + `Allow: POST` / `400` / `403` |
| 60 秒冷却与每小时 5 封 | 冷却内 `202` 但不发信；每 61 秒递增到 5 封后停止 |
| 首次登录（allowlist 新邮箱） | `200` + contributor 会话；`access_sub=code:<uuid>`；`member.login` 审计 |
| 已有管理员邮箱 | `200`，返回 `role=admin` |
| 验证码单次使用 | 首次 `200`；重放 `401 EMAIL_LOGIN_INVALID`，无 cookie |
| 错误尝试 | 5 次 `401` 后计数为 5；正确码仍 `401` |
| 过期 | 10 分钟后 `401`，不创建成员 |
| 错误邮箱 | 用 A 邮箱的码验证 B 邮箱 → `401` |
| 邀请授权新地址 | 管理员签发后请求/验证成功；邀请变 `redeemed`；`member.code_login` 审计 1 条 |
| 撤销邀请 | 撤销后不再发信；撤销前签发的码验证 `401`，不创建成员 |
| 禁用成员 | 请求不发信；禁用后验证 `403 MEMBER_DISABLED`，无 cookie |
| 发信失败 | 普通传输错误：`503 EMAIL_LOGIN_DELIVERY_FAILED`（`retryable`）；发送方未验证/域名未开通：`503 EMAIL_LOGIN_UNAVAILABLE`；挑战均立即 `consumed_at` |
| 未配置 `RESEND_API_KEY` | 请求/验证均 `503 EMAIL_LOGIN_UNAVAILABLE`；`/api/auth/providers.emailCode=false` |
| 并发验证 | 同一码两个请求 → 一个 `200`、一个 `401`，只创建一个成员 |
| 管理员邀请签发 | `201 { invitation }`，响应与列表均无 `code`；表结构不含旧码列 |

## 行为矩阵（React DOM / 静态）

- 登录页保留 GitHub，邮箱表单在 `emailCodeEnabled=false` 时显示未配置文案。
- 发送请求体为 `{ email }`；成功后出现 `[data-otp-input]`，显示收件邮箱与通用“若可登录则已发送”提示。
- 六位数字输入自动提交 `{ email, code }`；成功后 `navigate("/")`。
- `401` 统一显示“验证码无效”；`403` 显示禁用；`503` 显示未配置/发送失败。
- 重发按钮 60 秒倒计时并禁用；“使用其他邮箱”返回邮箱步骤。
- 成员管理页授权回执使用 `[data-invitation-issued]`，不再显示/复制明文码。

## 生产观察（2026-10-18，只读）

- 最新部署 `73e75fec`（11:23:07Z）已包含 `emailCode:true`；远程 D1 无待应用迁移。
- 11:23:38Z 的请求为 `apples398@163.com` 生成了 `email_login_codes` 行，`created_at` 与 `consumed_at` 同为 `11:23:38.788Z`——发送绑定抛错后按设计立即作废。
- 同一时间 `wrangler email sending list` / `settings` 均返回 `Unauthorized [code: 2036]`；`crgmhrc.asia` 与 `memory.crgmhrc.asia` 均无 Email Sending 所需的 MX/DKIM/DMARC 记录。
- 结论：验证码逻辑已执行到发信步骤，但 Cloudflare Email Sending 尚未为该域名开通；不是收件箱、垃圾邮件或前端提交失败。该次观察后按方案 2 改用 Resend，代码不再依赖 Email Sending 绑定。

## 未覆盖 / 非声明

- **未发起真实投递**：本机没有 `RESEND_API_KEY` 且发件域名未在 Resend 验证。Workerd 测试注入 `EmailLoginMailer`，单测用捕获 fetch 核对 Resend 请求体与错误分类。真实收件箱、退信、SPF/DKIM/DMARC 未验证。
- **未应用远程迁移**：`0077` 只在本地 D1/Workerd 测试库执行；生产仍是 `0063` 之后的状态，新端点/前端未部署。
- **无真实浏览器/设备验收**：仅有 happy-dom DOM 测试与静态渲染；未覆盖真实 Chrome/Safari、移动键盘、OTP 自动填充（SMS/iOS）和视觉对比。
- **无回滚点**：`0077` 是向前迁移；它重建邀请表，不能靠删表回滚。生产应用前需按手册备份并记录回滚点。
- `member.code_login_denied` 审计类型保留用于历史行；新邮箱验证码路径不再写该动作。
