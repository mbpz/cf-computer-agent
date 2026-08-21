# Memory Garden 生产核心运维手册

> 生产域名：`https://memory.crgmhrc.asia`  
> Worker：`memory-garden-agent`  
> D1：`memory-garden-control-plane`  
> 适用 shell：macOS `zsh`

本文是生产配置和部署的唯一核心入口。详细 smoke 与应急恢复分别见 [smoke-test.md](./smoke-test.md) 和 [rollback.md](./rollback.md)。

## 1. 核心逻辑

```text
浏览器
  → GET /auth/github
  → GitHub OAuth（state + PKCE S256）
  → GET /auth/github/callback
  → Worker 用 Client ID/Secret 换取短期 GitHub token
  → Worker 读取 GitHub primary + verified 邮箱
  → 邮箱 allowlist + D1 成员/角色校验
  → D1 保存哈希后的会话
  → 浏览器只得到 __Host-memory-session Cookie

自动化客户端
  → AUTOMATION_CLIENT_ID + AUTOMATION_SECRET 做 HMAC-SHA256 签名
  → APP_TOKEN 作为独立 Bearer 因子
  → 只能访问 legacy health/notes/search/chat，不能成为管理员
```

D1 保存成员、会话、空间、投稿、审计和防重放 nonce；`KnowledgeBase` Durable Object 保存已发布笔记和索引。D1 migration 与 Durable Object `v1` 都只能向前兼容，不能靠删表、删数据或重置 DO 回滚。

## 2. 七项生产配置

建议七项都作为 Cloudflare Worker **Secret** 保存。

| 名称 | 来源或生成方式 | 作用 |
|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App 自动生成 | 标识 OAuth App；本身不是密码 |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App 页面生成 | callback 换取 GitHub access token |
| `BOOTSTRAP_ADMIN_EMAIL` | 人工填写 GitHub primary、verified 邮箱 | 第一个管理员账号；必须包含在 allowlist 中 |
| `ALLOWED_MEMBER_EMAILS` | 人工填写英文逗号分隔的小写邮箱 | 允许登录的成员白名单 |
| `AUTOMATION_CLIENT_ID` | 本地随机生成 | 标识自动化客户端；本身不是密码 |
| `AUTOMATION_SECRET` | 本地 CSPRNG 独立生成 | HMAC-SHA256 请求签名 |
| `APP_TOKEN` | 本地 CSPRNG 独立生成 | 自动化 Bearer 第二因子及 legacy API 校验 |

禁止把这些值写入仓库、`wrangler.jsonc`、`.dev.vars`、命令参数、URL、日志、截图或聊天。已经公开过的值必须轮换。

## 3. GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App：

| 字段 | 精确值 |
|---|---|
| Application name | `Memory Garden` |
| Homepage URL | `https://memory.crgmhrc.asia` |
| Authorization callback URL | `https://memory.crgmhrc.asia/auth/github/callback` |

创建后保存 Client ID；点击 **Generate a new client secret**，立即把 Secret 保存到密码管理器。不要用 Personal Access Token 或 GitHub App private key 替代。

管理员邮箱必须是 GitHub 当前账号的 primary 且 verified 邮箱，并使用 trim 后的小写形式：

```text
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
ALLOWED_MEMBER_EMAILS=admin@example.com,member@example.com
```

## 4. 生成自动化密钥

在私密终端执行；命令不打印密钥：

```bash
set +x
AUTOMATION_CLIENT_ID="memory-garden-prod-$(openssl rand -hex 16)"
IFS= read -r -s AUTOMATION_SECRET < <(openssl rand -base64 48)
IFS= read -r -s APP_TOKEN < <(openssl rand -base64 48)

test -n "$AUTOMATION_CLIENT_ID"
test -n "$AUTOMATION_SECRET"
test -n "$APP_TOKEN"
test "$AUTOMATION_SECRET" != "$APP_TOKEN"
printf 'automation credentials generated\n'
```

立即把三项保存到密码管理器。`AUTOMATION_SECRET` 与 `APP_TOKEN` 必须独立生成，不能相同，也不能与其他环境复用。

## 5. 发布前检查与 D1 migration

```bash
rtk npx wrangler whoami
rtk git status --short
rtk git rev-parse HEAD
rtk npm run check
rtk npm audit --omit=dev
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

远程变更前备份 D1：

```bash
set +x
BACKUP_DIR="$(mktemp -d -t memory-garden-d1.XXXXXX)"
chmod 700 "$BACKUP_DIR"
rtk npx wrangler d1 export memory-garden-control-plane --remote --output "$BACKUP_DIR/pre-release.sql"
chmod 600 "$BACKUP_DIR/pre-release.sql"
```

应用 append-only migration 并复核：

```bash
rtk npm run db:migrate:remote
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

生产必须至少包含 `0001_phase1_control_plane.sql` 和 `0002_github_auth.sql`。

## 6. 构造完整 Secret bundle

先从密码管理器准备七项值，再交互输入。敏感输入不会回显：

```bash
set +x
read -r "GITHUB_OAUTH_CLIENT_ID?GITHUB_OAUTH_CLIENT_ID: "
read -rs "GITHUB_OAUTH_CLIENT_SECRET?GITHUB_OAUTH_CLIENT_SECRET: "; printf '\n'
read -rs "BOOTSTRAP_ADMIN_EMAIL?BOOTSTRAP_ADMIN_EMAIL: "; printf '\n'
read -rs "ALLOWED_MEMBER_EMAILS?ALLOWED_MEMBER_EMAILS: "; printf '\n'
read -r "AUTOMATION_CLIENT_ID?AUTOMATION_CLIENT_ID: "
read -rs "AUTOMATION_SECRET?AUTOMATION_SECRET: "; printf '\n'
read -rs "APP_TOKEN?APP_TOKEN: "; printf '\n'
```

在仓库外生成权限受限的 JSON：

```bash
SECRETS_DIR="$(mktemp -d -t memory-garden-oauth.XXXXXX)"
chmod 700 "$SECRETS_DIR"
SECRETS_FILE="$SECRETS_DIR/worker-secrets.json"
touch "$SECRETS_FILE"
chmod 600 "$SECRETS_FILE"

cleanup_secret_bundle() {
  unset GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
  rm -f "$SECRETS_FILE"
  rmdir "$SECRETS_DIR"
}
trap cleanup_secret_bundle EXIT HUP INT TERM

GITHUB_OAUTH_CLIENT_ID="$GITHUB_OAUTH_CLIENT_ID" \
GITHUB_OAUTH_CLIENT_SECRET="$GITHUB_OAUTH_CLIENT_SECRET" \
BOOTSTRAP_ADMIN_EMAIL="$BOOTSTRAP_ADMIN_EMAIL" \
ALLOWED_MEMBER_EMAILS="$ALLOWED_MEMBER_EMAILS" \
AUTOMATION_CLIENT_ID="$AUTOMATION_CLIENT_ID" \
AUTOMATION_SECRET="$AUTOMATION_SECRET" \
APP_TOKEN="$APP_TOKEN" \
node -e '
  const keys = ["GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "BOOTSTRAP_ADMIN_EMAIL", "ALLOWED_MEMBER_EMAILS", "AUTOMATION_CLIENT_ID", "AUTOMATION_SECRET", "APP_TOKEN"];
  const bundle = Object.fromEntries(keys.map((key) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing ${key}`);
    return [key, value];
  }));
  if (bundle.AUTOMATION_SECRET === bundle.APP_TOKEN) throw new Error("Automation secrets must differ");
  process.stdout.write(`${JSON.stringify(bundle)}\n`);
' > "$SECRETS_FILE"
```

## 7. 上传、检查并部署精确版本

上传完整候选版本：

```bash
rtk npx wrangler versions upload \
  --secrets-file "$SECRETS_FILE" \
  --strict \
  --message "Memory Garden production release candidate"
```

`versions upload` 会把当前代码、bindings、assets 和完整 Secret bundle 写入一个**未承载流量**的新版本。它不会自动部署。记录输出的 `<VERSION_ID>`，随后立即清理本地变量和临时文件：

```bash
cleanup_secret_bundle
trap - EXIT HUP INT TERM
```

检查精确版本：

```bash
rtk npx wrangler versions view <VERSION_ID>
rtk npx wrangler versions list
rtk npx wrangler deployments status
```

确认代码 commit、D1 `DB`、Durable Object `KNOWLEDGE`、AI、Assets、自定义域名和 Secret 名称正确后，才部署该版本：

```bash
rtk npx wrangler versions deploy <VERSION_ID>@100% --yes
rtk npx wrangler deployments status
```

如果 `--strict` 报本地与远端配置冲突，先把 `wrangler.jsonc` 与已批准的远端 routes、D1、DO 和 assets 配置对齐；不要通过删除 `--strict` 绕过审查。禁止用普通 `wrangler deploy`、逐项 `wrangler secret put` 或 `versions secret bulk` 代替这条发布链路。

## 8. 最小验收

OAuth 启动：

```bash
curl -sS -D - -o /dev/null https://memory.crgmhrc.asia/auth/github
```

期望 `302` 且 `Location` 指向 GitHub。随后用浏览器从 `/auth/github` 发起一次全新授权；不要复用 callback URL。成功时 callback 返回 `302`、跳回首页并设置 `__Host-memory-session`。

登录后确认：

- bootstrap 邮箱首次创建唯一 active admin；
- allowlist 其他邮箱创建 contributor；
- 非 allowlist 邮箱被拒绝；
- `/api/session` 返回正确角色；
- `POST /auth/logout` 清除会话。

最后按 [smoke-test.md](./smoke-test.md) 运行 signed automation smoke。

## 9. 本次 GitHub OAuth 故障复盘

### 9.1 `OAUTH_CONFIG_INVALID`

原因：运行版本缺少 `GITHUB_OAUTH_CLIENT_ID` 或 `GITHUB_OAUTH_CLIENT_SECRET`，或者七项配置没有作为同一候选版本发布。处理方式是重新构造完整 Secret bundle，上传、检查并部署精确版本。

### 9.2 `OAUTH_UPSTREAM_UNAVAILABLE`

Cloudflare Invocation 日志只显示 callback 返回 `503`；真正诊断需要在 Observability 的 **Events** 中搜索：

```text
"github oauth upstream failed"
```

本次诊断为：

```text
stage=token_exchange
reason=network
```

根因不是邮箱或 Client Secret，而是 Worker 把原生 `globalThis.fetch` 保存为依赖属性后，以对象方法调用，改变了原生 fetch 的 receiver，运行时同步抛出网络类错误。修复提交 `f55611e` 使用正确的全局 receiver 调用 fetch，并增加回归测试。此前的空 `Response.url` 兼容修复为 `690942a`。

排障时只记录 `stage`、`reason`、`httpStatus` 和脱敏 request ID。完整 callback URL 含一次性 OAuth code，不能贴入聊天、issue 或发布证据。

## 10. 回滚原则

- Worker 版本可切换，D1 migration 和 DO 数据不可逆向删除。
- 旧 Access 版本无法识别已写入的 `github:<id>` 身份，不能直接回滚到旧 Access build。
- 必须制作兼容当前 D1 schema 和 GitHub identity 的前向修复版本。
- 每次紧急版本也必须执行：本地检查 → `versions upload --strict` → `versions view` → 精确 `versions deploy` → OAuth 与 smoke 复验。

完整约束见 [rollback.md](./rollback.md)。
