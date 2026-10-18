# 证据：邮箱密码自注册与登录（本地实现）

- 日期：2026-10-18
- 范围：`IDN-007`（新用户自注册 + 邮箱密码登录）
- 性质：本地实现、迁移字节校验、Workerd 集成与 React DOM 测试；**不含**生产迁移、部署或真实浏览器验收

## 实现范围

- `migrations/0078_password_auth.sql`：`members.password_hash`、`failed_login_count`、`locked_until`；canonical email 唯一索引；注册 IP 限流表；删除验证码/邀请表。
- `src/password/hash.ts`：PBKDF2-HMAC-SHA256、100,000 次、16 字节盐、32 字节输出。
- `src/password/repository.ts` / `service.ts`：自注册、邮箱唯一、5 次失败锁定 15 分钟、每 IP 每小时 5 次注册。
- `src/routes/auth.ts`：`POST /auth/register`、`POST /auth/password`；移除 `/auth/email/code*`、`/auth/code` 与邀请 API。
- `frontend/pages/login-page.tsx`：邮箱 + 密码登录、注册模式、确认密码；移除 OTP 组件。
- `frontend/lib/password-auth-data.ts`：注册/登录客户端与错误映射。
- 删除 `src/email-login/`、`src/member-invitations/`、OTP 组件、邀请管理 UI 与相关测试。

## 验证命令

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过（Worker + frontend） |
| `npm run types:check` | 通过（已重新生成绑定类型） |
| `npm run build:ui` | 通过（Vite 产物 + browser-vm build isolation） |
| `npm run verify:m1:migrations -- --files` | `[pass] migration-files count=78` |
| `npx vitest run test/worker` | **78 文件 / 1301 测试通过** |
| `npx vitest run test/unit` | **406 文件 / 5628 测试通过** |
| `npm run test:i18n` | 14 测试通过，双语 key/placeholder 对等 |
| `npm run test:smoke` | 30 测试通过 |
| `node --test scripts/frontend-app-contract.test.mjs` | 9 测试通过 |
| `node --test scripts/frontend-operation-inventory.test.mjs` | 10 测试通过（含人工复核指纹） |
| `npm run verify:wcag` | 通过 |
| `npm run verify:landing` | 通过 |
| `npm run build:legacy-audit` | 通过 |
| `npm run audit:frontend-operations` | 通过 |
| `npm run verify:delivery-status` | 30 测试通过 |

## 行为矩阵（Workerd）

| 检查 | 实测 |
| --- | --- |
| 自注册 | `201` + contributor session；`access_sub=password:<id>`；`member.login` 审计 |
| 密码存储 | `pbkdf2-sha256$100000$<salt>$<hash>`；不含明文；同一密码两次注册盐不同 |
| 弱密码 | `400 PASSWORD_POLICY_INVALID` |
| 已有邮箱（含 GitHub-only） | `409 REGISTRATION_EMAIL_TAKEN`；不覆盖密码/账户 |
| 注册限流 | 同 IP 超过 5 次 → `429 REGISTRATION_RATE_LIMITED`；其他 IP 可继续 |
| 正确密码 | `200` + session；清除失败计数 |
| 错误/未知/无密码邮箱 | 统一 `401 PASSWORD_LOGIN_INVALID`，无 cookie |
| 连续失败 | 第 5 次起 `429 PASSWORD_LOGIN_LOCKED`（900 秒）；15 分钟后恢复 |
| 禁用成员 | 密码正确后 `403 MEMBER_DISABLED` |
| 并发同邮箱注册 | 一个 `201`、一个 `409`；只创建一个成员 |
| 方法/query/跨源 | `405`/`400`/`403` |

## 行为矩阵（React DOM）

- 登录/注册共用同一表单；`[data-login-mode-toggle]` 切换。
- 登录提交精确 `{ email, password }`；成功 `navigate("/")`。
- 注册校验 12–128 位与确认密码；错误映射 taken/rate_limited/weak/locked/disabled。
- GitHub 按钮保留；未配置时显示提示；不再出现验证码或 OTP 输入。
- 管理成员页移除邀请页签/对话框，只保留成员状态操作。

## 未覆盖 / 非声明

- **未应用远程迁移**：`0078` 只在本地 D1/Workerd 测试库执行；生产仍是 `0077` 之后的状态，新端点/前端未部署。
- **无真实浏览器/设备验收**：仅有 happy-dom DOM 测试与构建；未覆盖真实 Chrome/Safari、移动键盘、密码管理器自动填充与视觉对比。
- **无邮件验证/找回密码**：开放注册不验证邮箱所有权；这是产品决策。忘记密码没有自助重置。
- **无回滚点**：`0078` 是向前迁移，删除旧验证码/邀请表；生产应用前需备份并记录回滚点。
- PBKDF2 100,000 次在本地 workerd 实测约 6ms，但未在免费生产 CPU 配额下做真实请求压测。
