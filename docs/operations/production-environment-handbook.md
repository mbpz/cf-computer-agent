# Memory Garden 生产环境运维与部署手册

> 适用环境：`https://memory.crgmhrc.asia`  
> Worker：`memory-garden-agent`  
> D1：`memory-garden-control-plane`  
> 更新时间：2026-08-20

本手册是生产运维入口，覆盖 GitHub OAuth、D1 migration、Worker 版本化部署、验收、故障排查和回滚。七项配置的逐项生成、CLI 和 Dashboard 操作见 [生产环境变量手动配置手册](./production-settings-manual.md)；详细的密钥装载脚本、自动化 smoke 和回滚约束分别以 [GitHub OAuth 部署手册](./github-oauth-setup.md)、[生产 smoke 手册](./smoke-test.md) 和 [回滚手册](./rollback.md) 为准。

## 1. 安全边界

- 远程 migration、secret 写入、版本上传、版本部署和生产 smoke 都会改变或访问生产环境，必须逐项获得明确授权。
- 不把任何 secret 写入仓库、`wrangler.jsonc`、`.dev.vars`、命令参数、终端记录、日志或发布证据。
- 禁止使用明文 `echo`、URL query、聊天消息或截图传递 secret。
- 不使用 `wrangler secret put`、`wrangler versions secret bulk` 或普通 `npm run deploy` 完成本次发布。它们无法证明 secret 所在版本与本地已评审代码完全一致。
- 生产只使用自定义域名。`workers_dev` 和 `preview_urls` 必须保持关闭。
- D1 migration 是向前追加操作，不通过删除表、删除行或逆向 migration 回滚。
- 不删除或重置 `KnowledgeBase` Durable Object、VFS、索引、journal 或已有笔记。
- 此前曾在终端/聊天中出现过 APP token 明文，生产发布时必须生成并部署新的 `APP_TOKEN`，旧值立即作废。

## 2. 当前生产状态与故障结论

截至 2026-08-20 的只读检查结果：

- 自定义域名已经可访问。
- `/auth/github` 返回 `OAUTH_CONFIG_INVALID`。
- Worker secret 列表中只有 `APP_TOKEN`，缺少 GitHub OAuth 和自动化签名配置。
- 远程 D1 仍有两个待应用 migration：
  - `0001_phase1_control_plane.sql`
  - `0002_github_auth.sql`
- 当前生产流量指向 Worker version `433a1370-1224-4ff1-a111-9135f14f337b`。

因此，本次错误不是 GitHub allowlist 或成员状态导致的；请求在 OAuth 启动阶段就因缺少 `GITHUB_OAUTH_CLIENT_ID` 或 `GITHUB_OAUTH_CLIENT_SECRET` 被拒绝。发布前必须重新执行下面的只读检查，不能把以上快照当作实时状态。

```bash
rtk npx wrangler whoami
rtk npx wrangler secret list
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
rtk npx wrangler versions list
rtk npx wrangler deployments status
```

只记录 secret 名称、migration 文件名、版本 ID 和部署比例，不记录 secret 值。

## 3. 生产资源清单

| 资源 | 生产值 | 说明 |
|---|---|---|
| 自定义域名 | `memory.crgmhrc.asia` | 唯一生产入口 |
| Worker | `memory-garden-agent` | API、OAuth 和静态页面 |
| D1 | `memory-garden-control-plane` | 成员、空间、提交、审计、OAuth session |
| D1 binding | `DB` | database ID 已在 `wrangler.jsonc` 中配置 |
| Durable Object | `KnowledgeBase` | migration tag 必须保持 `v1` |
| Durable Object binding | `KNOWLEDGE` | 笔记 VFS、索引和恢复 journal |
| Workers AI binding | `AI` | Agent 回答生成 |
| Static Assets binding | `ASSETS` | `public/`，Worker-first |
| GitHub OAuth | GitHub OAuth App | 浏览器用户登录；不依赖 Cloudflare Zero Trust |

## 4. 发布前准备

### 4.1 本地环境

```bash
node --version
rtk npx wrangler --version
rtk npx wrangler whoami
rtk git status --short
rtk git rev-parse HEAD
```

要求：

- Wrangler 为项目锁定的 v4 版本；
- 已登录正确的 Cloudflare account；
- 当前 commit 是准备发布并已经评审的 commit；
- 除明确知晓的本地文件外，工作区无未提交代码；
- 发布证据中记录 commit SHA，但不记录 secret。

### 4.2 本地验证

以下命令不修改生产环境：

```bash
rtk npm ci
rtk npm run db:migrate:local
rtk npm run check
rtk npm audit --omit=dev
```

只有全部通过后才能进入远程操作。`db:migrate:local` 只验证本地 disposable D1，不能证明远程 migration 已应用。

## 5. 创建 GitHub OAuth App

在 GitHub Developer Settings 创建 OAuth App，使用以下固定值：

| 字段 | 值 |
|---|---|
| Application name | `Memory Garden` |
| Homepage URL | `https://memory.crgmhrc.asia` |
| Authorization callback URL | `https://memory.crgmhrc.asia/auth/github/callback` |

生成 client secret 后立即保存到批准的密码管理器。不要把 client secret 写进 issue、聊天、GitHub Actions 日志或仓库。

## 6. Worker 生产配置：来源、生成和作用

一次发布必须包含以下完整配置。它们不是全部由命令随机生成：GitHub 两项来自 OAuth App，邮箱两项由管理员确定，automation 两项和 APP token 由本地密码学安全随机源生成。

| 名称 | 来源 | 是否敏感 | 作用 |
|---|---|---:|---|
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App 页面 | 否 | 标识 Memory Garden OAuth App；构造 GitHub 授权请求 |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App 页面生成 | 是 | Worker 在 callback 中向 GitHub 交换 access token 时认证 OAuth App |
| `BOOTSTRAP_ADMIN_EMAIL` | 人工选定 | 是 | 第一个匹配该邮箱且在 allowlist 中的 GitHub 用户成为唯一 bootstrap admin |
| `ALLOWED_MEMBER_EMAILS` | 人工维护 | 是 | GitHub 登录准入白名单；不在列表中的用户拒绝登录 |
| `AUTOMATION_CLIENT_ID` | 本地生成的随机标识 | 否 | 标识 signed-smoke 或受信自动化客户端；参与签名规范串和重放防护 |
| `AUTOMATION_SECRET` | 本地密码学安全随机生成 | 是 | 对自动化请求的 method、path、时间戳、nonce 和 body 计算 HMAC-SHA256 |
| `APP_TOKEN` | 本地密码学安全随机生成 | 是 | 自动化请求的 Bearer 第二因子，也保留 legacy API token 校验；本次必须轮换 |

### 6.1 `GITHUB_OAUTH_CLIENT_ID` 和 `GITHUB_OAUTH_CLIENT_SECRET`

这两项不能用 `openssl` 代替生成，必须由 GitHub 为 OAuth App 签发：

1. 打开 GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**；
2. 使用第 5 节的固定 Application name、Homepage URL 和 callback URL；
3. 创建后复制页面显示的 **Client ID**，作为 `GITHUB_OAUTH_CLIENT_ID`；
4. 点击 **Generate a new client secret**，把结果立即存入批准的密码管理器，作为 `GITHUB_OAUTH_CLIENT_SECRET`；
5. client secret 通常只完整显示一次。遗失时生成新的 secret，并在新版本验证完成后撤销旧 secret。

安全录入 shell 变量时使用隐藏输入，不把值写进命令行：

```bash
set +x
read -r GITHUB_OAUTH_CLIENT_ID
read -rs GITHUB_OAUTH_CLIENT_SECRET
printf '\n'
```

Client ID 不是 secret，但 client secret 是。不要使用 GitHub Personal Access Token、GitHub App private key 或用户 access token 替代 OAuth client secret。

### 6.2 `BOOTSTRAP_ADMIN_EMAIL` 和 `ALLOWED_MEMBER_EMAILS`

这两项不随机生成，由运维人员根据允许登录的 GitHub 账号确定：

- `BOOTSTRAP_ADMIN_EMAIL`：预定管理员 GitHub 账号的 primary、verified 邮箱；
- `ALLOWED_MEMBER_EMAILS`：所有允许成员的邮箱，以英文逗号分隔；必须包含 bootstrap 邮箱；
- 所有邮箱先 trim，再转换为 lowercase；规范化后不能重复；
- 每项只能有一个 `@`，local part 为 1–64 个字符，完整邮箱最多 254 个可见 ASCII 字符；
- domain 至少两个非空 label，不允许连续点；
- 不要填写 GitHub username，也不要填写未验证或非 primary 邮箱。

示例只使用保留测试域名，不可直接用于生产：

```text
BOOTSTRAP_ADMIN_EMAIL=admin@example.test
ALLOWED_MEMBER_EMAILS=admin@example.test,contributor@example.test
```

生产值使用隐藏输入：

```bash
set +x
read -rs BOOTSTRAP_ADMIN_EMAIL
printf '\n'
read -rs ALLOWED_MEMBER_EMAILS
printf '\n'
```

应用会再次规范化并验证这些值。若 bootstrap 邮箱不在 allowlist、存在空项/重复项或格式错误，OAuth 配置会 fail closed。

### 6.3 `AUTOMATION_CLIENT_ID`

这是标识符，不是密码。每个生产自动化调用方应使用独立 ID；本项目当前 smoke 可以生成一个带环境前缀的随机 ID：

```bash
set +x
AUTOMATION_CLIENT_ID="memory-garden-prod-$(openssl rand -hex 16)"
```

不要使用管理员邮箱、GitHub Client ID 或固定的 `admin`/`production` 作为 automation client ID。随机后缀可避免不同环境或调用方发生标识冲突。

### 6.4 `AUTOMATION_SECRET`

使用系统 CSPRNG 生成 48 个随机字节并进行 Base64 编码。下面的命令直接写入隐藏 shell 变量，不把 secret 打印到终端：

```bash
set +x
IFS= read -r -s AUTOMATION_SECRET < <(openssl rand -base64 48)
```

它用于 HMAC-SHA256 请求签名，不能与 `APP_TOKEN` 相同，也不能在多个环境或客户端之间复用。生成后应立即保存到批准的密码管理器，并保持同一份值用于 Worker 配置和生产 smoke 客户端。

### 6.5 `APP_TOKEN`

同样生成独立的 48 字节随机值：

```bash
set +x
IFS= read -r -s APP_TOKEN < <(openssl rand -base64 48)
```

`APP_TOKEN` 通过 `Authorization: Bearer ...` 提供第二层校验。它不能复用 `AUTOMATION_SECRET`，也不能复用此前已公开的旧 token。本次发布后，旧 APP token 必须失效。

### 6.6 生成、保存并在发布时读取

先在私密本地 shell 中生成三项 automation 凭据：

```bash
set +x
AUTOMATION_CLIENT_ID="memory-garden-prod-$(openssl rand -hex 16)"
IFS= read -r -s AUTOMATION_SECRET < <(openssl rand -base64 48)
IFS= read -r -s APP_TOKEN < <(openssl rand -base64 48)
```

立即通过密码管理器的安全新增/导入功能分别保存这三项值。具体写入命令取决于获批的密码管理器，不在通用手册中假定某个供应商；不得通过聊天、邮件、剪贴板历史或普通文本文件中转。保存完成后，用只读/隐藏方式从密码管理器取回一次并确认能匹配，随后清除当前 shell 变量。

不要用 `env`、`printenv`、`set`、`echo "$AUTOMATION_SECRET"` 或 `echo "$APP_TOKEN"` 检查结果。下面的检查只确认变量非空且两个 secret 不相同，不输出实际值：

```bash
test -n "$AUTOMATION_CLIENT_ID"
test -n "$AUTOMATION_SECRET"
test -n "$APP_TOKEN"
test "$AUTOMATION_SECRET" != "$APP_TOKEN"
printf 'all required production settings are present\n'
```

发布时，从 GitHub/密码管理器通过隐藏输入读取已经保存的同一组值。不要在发布脚本中再次随机生成，否则生产 Worker 和后续 smoke 可能使用不同凭据：

```bash
set +x
read -r GITHUB_OAUTH_CLIENT_ID
read -rs GITHUB_OAUTH_CLIENT_SECRET
printf '\n'
read -rs BOOTSTRAP_ADMIN_EMAIL
printf '\n'
read -rs ALLOWED_MEMBER_EMAILS
printf '\n'
read -r AUTOMATION_CLIENT_ID
read -rs AUTOMATION_SECRET
printf '\n'
read -rs APP_TOKEN
printf '\n'
```

随后必须继续使用 [GitHub OAuth 部署手册](./github-oauth-setup.md#authorized-remote-rollout) 中的受限 JSON bundle 和 `versions upload --secrets-file ... --strict` 流程。不要逐项执行 `wrangler secret put`。上传结束后执行：

```bash
unset GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
```

登录用户的 GitHub 邮箱必须同时是 `primary` 和 `verified`，并且位于 `ALLOWED_MEMBER_EMAILS` 中。首个匹配 `BOOTSTRAP_ADMIN_EMAIL` 的成员成为管理员，其他允许成员默认是 contributor。

## 7. 标准生产发布流程

### 7.1 备份与远程 migration 检查

在授权后，先导出 D1 备份并保存到受限目录。不要提交备份文件：

```bash
set +x
BACKUP_DIR="$(mktemp -d -t memory-garden-d1.XXXXXX)"
chmod 700 "$BACKUP_DIR"
rtk npx wrangler d1 export memory-garden-control-plane --remote --output "$BACKUP_DIR/pre-github-oauth.sql"
chmod 600 "$BACKUP_DIR/pre-github-oauth.sql"
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

确认目标是现有 `memory-garden-control-plane`，不是新数据库。

### 7.2 应用 D1 migrations

此命令会修改远程 D1，必须单独授权：

```bash
rtk npm run db:migrate:remote
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

期望结果：`0001_phase1_control_plane.sql` 和 `0002_github_auth.sql` 均不再处于 pending 状态。保存脱敏输出作为发布证据。

### 7.3 构建完整 secret bundle 并上传候选版本

严格执行 [GitHub OAuth 部署手册的 Authorized remote rollout 第 3 步](./github-oauth-setup.md#authorized-remote-rollout)。该步骤会：

1. 在仓库外创建权限为 `700` 的临时目录和权限为 `600` 的 JSON 文件；
2. 以隐藏输入读取 GitHub 和成员配置；
3. 分别生成新的 `AUTOMATION_SECRET` 和 `APP_TOKEN`；
4. 用 `JSON.stringify` 安全生成完整 bundle；
5. 执行唯一允许的上传命令：

   ```bash
   rtk npx wrangler versions upload --secrets-file "$SECRETS_FILE" --strict --message "GitHub OAuth release candidate"
   ```

6. 清除 shell 变量和临时文件。

记录命令返回的精确 `<VERSION_ID>`。`versions upload` 只创建候选版本，不会切换生产流量。

### 7.4 检查候选版本

```bash
rtk npx wrangler versions view <VERSION_ID>
rtk npx wrangler versions list
rtk npx wrangler deployments status
```

检查：

- commit 与本地已评审 SHA 对应；
- `DB`、`KNOWLEDGE`、`AI`、`ASSETS` bindings 存在；
- `workers_dev: false`、`preview_urls: false`；
- 候选版本尚未承载生产流量；
- 证据中只出现 secret 名称，不出现 secret 值。

### 7.5 部署精确候选版本

检查通过并再次获得部署授权后，只部署刚才记录的精确版本：

```bash
rtk npx wrangler versions deploy <VERSION_ID>@100% --yes
rtk npx wrangler deployments status
```

禁止把 `<VERSION_ID>` 替换为“最新版本”的猜测，也不要在这里运行普通 `wrangler deploy`。

## 8. 生产验收

### 8.1 基础与 OAuth 启动

```bash
curl -sS -D - -o /dev/null https://memory.crgmhrc.asia/
curl -sS -D - -o /dev/null https://memory.crgmhrc.asia/auth/github
```

期望：

- 首页返回成功响应并加载新 workspace shell；
- `/auth/github` 返回 `302`，`Location` 指向 `github.com`；
- 不再返回 `OAUTH_CONFIG_INVALID`；
- 响应包含 `x-request-id` 和安全响应头；
- 不把 OAuth code、cookie 或完整 Location query 写入发布证据。

### 8.2 浏览器登录

依次验证：

1. 未登录用户只从 `/auth/github` 发起登录；
2. bootstrap allowlist 邮箱首次登录后成为唯一 active admin；
3. 第二个 allowlist 邮箱登录后成为 contributor；
4. 非 allowlist 邮箱得到 `MEMBER_NOT_ALLOWED`；
5. disabled contributor 得到 `MEMBER_DISABLED`；
6. callback 设置 Secure、HttpOnly 的 `__Host-memory-session` cookie；
7. `/api/session` 返回当前成员和正确角色；
8. `POST /auth/logout` 清除 session，刷新后回到匿名状态；
9. admin 页面只对 admin 可用，contributor 在服务端得到 `403`。

### 8.3 自动化 smoke

浏览器验收通过后，按 [生产 smoke 手册](./smoke-test.md) 交互式输入 `AUTOMATION_CLIENT_ID`、`AUTOMATION_SECRET` 和新 `APP_TOKEN`，再运行：

```bash
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

smoke 只检查 automation 被允许的 legacy health、notes、search 和 chat，不代表 admin API 验收。成功运行会保留一个 `smoke-<uuid>` 笔记；当前版本没有删除 API。

## 9. 常见故障排查

| 现象/错误码 | 常见原因 | 处理 |
|---|---|---|
| `OAUTH_CONFIG_INVALID` 出现在 `/auth/github` | GitHub client ID/secret 缺失或为空 | 检查 secret 名称；重新走完整候选版本上传，不单独 `secret put` |
| `OAUTH_CONFIG_INVALID` 出现在更后阶段 | bootstrap/allowlist 格式错误 | 校验邮箱规范化、重复项及 bootstrap 是否在 allowlist |
| `OAUTH_CALLBACK_INVALID` | state、PKCE verifier、code 或 callback 不匹配/过期 | 重新从 `/auth/github` 开始；核对固定 callback；不要复用 callback URL |
| `OAUTH_UPSTREAM_UNAVAILABLE` | GitHub token/user/email API 超时、重定向或失败 | 记录 request ID；检查 GitHub 状态和 Worker 日志，不记录响应中的凭据 |
| `MEMBER_NOT_ALLOWED` | primary verified email 不在 allowlist | 在批准后更新完整 secret bundle 并重新发布版本 |
| `MEMBER_DISABLED` | D1 成员状态为 disabled | 由 admin 按审计流程恢复，禁止直接改生产 SQL |
| `no such table: auth_sessions` 或 `automation_nonces` | `0002_github_auth.sql` 未应用 | 停止发布，检查并授权执行远程 migration |
| 首页仍是旧页面 | 自定义域名仍指向旧 version 或缓存/静态资产未更新 | 检查 `deployments status`、精确 version 和资产清单 |
| OAuth App 返回 callback mismatch | GitHub callback 配置错误 | 必须精确为 `https://memory.crgmhrc.asia/auth/github/callback` |
| automation smoke 为 `401` | client ID/secret/APP token 不一致、签名时间或 nonce 问题 | 用本次候选版本保存的三项配置重新输入；不要打印它们 |
| chat 失败但 CRUD 正常 | Workers AI provider/binding 异常 | 检查 `AI` binding 和脱敏 Worker 日志；不要把它误判为 OAuth 故障 |

需要日志时使用：

```bash
rtk npx wrangler tail memory-garden-agent --format json
```

只按 request ID、状态码和固定错误码检索。不得记录 Authorization、cookie、OAuth code、邮箱、GitHub ID、笔记正文或 Agent 完整回答。

## 10. 回滚与故障恢复

如果 OAuth 或 smoke 验收失败，先停止继续发布。不要逆向 D1 migration，也不要直接重新部署旧 Access 版本。

只要 D1 中已经存在 `github:<id>` subject（新建或 identity link），旧 Access Worker 就不能正确认证这些成员。恢复方案必须是能读取当前 D1 schema、GitHub identities、`KnowledgeBase` DO v1 和 VFS 数据的向前兼容 emergency build。

标准恢复流程：

```bash
rtk npm run check
rtk npx wrangler versions upload --strict --message "Forward-compatible emergency rollback"
rtk npx wrangler versions view <EMERGENCY_VERSION_ID>
```

检查后单独获得授权，再执行：

```bash
rtk npx wrangler versions deploy <EMERGENCY_VERSION_ID>@100% --yes
```

随后重新执行浏览器 OAuth 验收和 signed automation smoke。完整限制见 [回滚手册](./rollback.md)。

## 11. 发布证据模板

```text
环境: production / memory.crgmhrc.asia
操作人:
时间:
本地 commit SHA:
候选 Worker version ID:
最终部署 Worker version ID:
部署比例: 100%
D1 备份位置: 受限存储引用，不粘贴内容
D1 migrations: 0001=applied, 0002=applied
本地检查: npm run check=pass, npm audit --omit=dev=0
OAuth App: homepage=pass, callback=pass
浏览器验收: admin=pass, contributor=pass, disabled=pass, logout=pass
automation smoke: pass/fail
脱敏 request IDs:
异常与处置:
```

发布证据不得包含 secret、Authorization header、cookie、OAuth code、完整 callback URL query、邮箱、GitHub ID、笔记正文或完整 Agent 回答。

## 12. 本次恢复上线的最短检查单

- [ ] 创建 GitHub OAuth App，homepage/callback 精确匹配生产域名
- [ ] 轮换此前暴露的 `APP_TOKEN`
- [ ] 准备完整七项 Worker 配置
- [ ] `rtk npm run check` 与 audit 通过
- [ ] 导出远程 D1 备份
- [ ] 授权并应用 `0001`、`0002` migrations
- [ ] 用 `versions upload --secrets-file ... --strict` 上传单一候选版本
- [ ] 记录并检查精确 version ID
- [ ] 再次授权后部署该 version ID 到 `100%`
- [ ] 验证 `/auth/github` 为 GitHub `302`，不是 JSON 错误
- [ ] 完成 admin、contributor、disabled、logout 浏览器验收
- [ ] 完成 signed automation smoke
- [ ] 保存脱敏发布证据
- [ ] 验证 GitHub 登录和 smoke 后，再单独清理旧 Access secrets/CI credentials
