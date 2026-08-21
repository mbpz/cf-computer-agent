# Memory Garden 生产环境变量手动配置手册

> 生产域名：`https://memory.crgmhrc.asia`  
> Worker：`memory-garden-agent`  
> 适用 shell：macOS `zsh`  
> 本手册只处理七项 Worker 配置，不替代 D1 migration、OAuth 验收和生产 smoke。

## 1. 配置清单

建议在 Cloudflare 中把七项全部保存为 **Secret**。对 Worker 运行时而言 Secret 和文本变量的读取方式相同，但 Secret 保存后不能从 Dashboard 或 Wrangler 重新查看明文。

| 名称 | 如何获得 | 作用 | 是否随机生成 |
|---|---|---|---:|
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App 页面 | 标识 OAuth App | 否 |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth App 页面生成 | callback 换取 GitHub access token | 否 |
| `BOOTSTRAP_ADMIN_EMAIL` | 人工选择的 GitHub primary、verified 邮箱 | 初始化唯一管理员 | 否 |
| `ALLOWED_MEMBER_EMAILS` | 人工维护的逗号分隔邮箱列表 | 登录白名单 | 否 |
| `AUTOMATION_CLIENT_ID` | 本地随机生成 | 标识生产 smoke/自动化客户端 | 是，非敏感标识 |
| `AUTOMATION_SECRET` | 本地 CSPRNG 生成 | HMAC-SHA256 请求签名 | 是，敏感 |
| `APP_TOKEN` | 本地 CSPRNG 生成 | Bearer 第二因子和 legacy API 校验 | 是，敏感 |

## 2. 创建 GitHub OAuth App

进入 GitHub：

1. 右上角头像 → **Settings**；
2. **Developer settings**；
3. **OAuth Apps**；
4. **New OAuth App**；
5. 填写：

   | 字段 | 生产值 |
   |---|---|
   | Application name | `Memory Garden` |
   | Homepage URL | `https://memory.crgmhrc.asia` |
   | Authorization callback URL | `https://memory.crgmhrc.asia/auth/github/callback` |

6. 创建后复制 **Client ID**，作为 `GITHUB_OAUTH_CLIENT_ID`；
7. 点击 **Generate a new client secret**；
8. 立即把 secret 保存到密码管理器，作为 `GITHUB_OAUTH_CLIENT_SECRET`。

注意：

- Client ID 不是密码；Client Secret 是密码。
- 不要用 GitHub Personal Access Token、GitHub App private key 或用户 token 替代 Client Secret。
- callback 必须完全一致，不能多 `/`、路径或 query。
- Client Secret 遗失时重新生成；新版本验证完成后撤销旧值。

## 3. 确定管理员和 allowlist

### 3.1 `BOOTSTRAP_ADMIN_EMAIL`

填写预定管理员 GitHub 账号的 **primary 且 verified** 邮箱。必须使用 trim 后的小写形式。

示例仅用于说明，不能用于生产：

```text
admin@example.test
```

### 3.2 `ALLOWED_MEMBER_EMAILS`

填写允许登录的全部邮箱，以英文逗号分隔：

```text
admin@example.test,contributor@example.test
```

规则：

- 必须包含 `BOOTSTRAP_ADMIN_EMAIL`；
- 所有邮箱 trim 后转小写；
- 规范化后不允许重复；
- 不要用分号、中文逗号或换行分隔；
- 不要填写 GitHub username；
- GitHub 上未设为 primary、verified 的邮箱不能用于登录。

只有第一次符合 bootstrap 邮箱的成员会初始化为 admin；其他 allowlist 用户默认是 contributor。后续修改 bootstrap 邮箱不会自动替换已有管理员。

## 4. 生成 automation 配置

先关闭 shell tracing：

```bash
set +x
```

### 4.1 生成 `AUTOMATION_CLIENT_ID`

```bash
AUTOMATION_CLIENT_ID="memory-garden-prod-$(openssl rand -hex 16)"
```

这是非敏感标识，但也应保存在密码管理器的同一条生产记录中。

### 4.2 生成 `AUTOMATION_SECRET`

```bash
IFS= read -r -s AUTOMATION_SECRET < <(openssl rand -base64 48)
```

该值用于 HMAC-SHA256 签名。不要与其他环境或客户端共享。

### 4.3 生成新的 `APP_TOKEN`

```bash
IFS= read -r -s APP_TOKEN < <(openssl rand -base64 48)
```

该值必须独立于 `AUTOMATION_SECRET`。以前曾经公开过的 APP token 必须轮换，不能继续使用。

只检查变量是否存在，不打印值：

```bash
test -n "$AUTOMATION_CLIENT_ID"
test -n "$AUTOMATION_SECRET"
test -n "$APP_TOKEN"
test "$AUTOMATION_SECRET" != "$APP_TOKEN"
printf 'automation credentials generated\n'
```

立即把三项保存到批准的密码管理器。不要使用 `env`、`printenv`、`set` 或 `echo` 打印 secret。若密码管理器没有安全 CLI，可在私密终端中按单项复制，粘贴后立即清空剪贴板：

```bash
printf '%s' "$AUTOMATION_CLIENT_ID" | pbcopy
# 粘贴并保存 AUTOMATION_CLIENT_ID 后继续
printf '%s' "$AUTOMATION_SECRET" | pbcopy
# 粘贴并保存 AUTOMATION_SECRET 后继续
printf '%s' "$APP_TOKEN" | pbcopy
# 粘贴并保存 APP_TOKEN 后立即清空
printf '' | pbcopy
```

使用共享剪贴板、剪贴板管理器或远程桌面时不要采用此方法；应直接使用密码管理器的 generator/CLI。

## 5. 推荐方式：手工输入并上传完整候选版本

此方法仍然是“手动配置”：七项值由操作员逐项输入，但一次上传为完整候选版本。上传不会立即切换生产流量。

### 5.1 前置检查

```bash
rtk npx wrangler whoami
rtk git status --short
rtk git rev-parse HEAD
rtk npm run check
rtk npx wrangler d1 migrations list memory-garden-control-plane --remote
```

在 GitHub OAuth Worker 上线前，远程 D1 必须已应用 `0001_phase1_control_plane.sql` 和 `0002_github_auth.sql`。

### 5.2 交互式输入七项配置

以下命令只写当前 shell，不会写 Cloudflare。敏感值输入时不会回显：

```bash
set +x
read -r "GITHUB_OAUTH_CLIENT_ID?GITHUB_OAUTH_CLIENT_ID: "
read -rs "GITHUB_OAUTH_CLIENT_SECRET?GITHUB_OAUTH_CLIENT_SECRET: "
printf '\n'
read -rs "BOOTSTRAP_ADMIN_EMAIL?BOOTSTRAP_ADMIN_EMAIL: "
printf '\n'
read -rs "ALLOWED_MEMBER_EMAILS?ALLOWED_MEMBER_EMAILS: "
printf '\n'
read -r "AUTOMATION_CLIENT_ID?AUTOMATION_CLIENT_ID: "
read -rs "AUTOMATION_SECRET?AUTOMATION_SECRET: "
printf '\n'
read -rs "APP_TOKEN?APP_TOKEN: "
printf '\n'
```

检查完整性但不输出值：

```bash
SETTINGS_VALID=true
for name in GITHUB_OAUTH_CLIENT_ID GITHUB_OAUTH_CLIENT_SECRET BOOTSTRAP_ADMIN_EMAIL ALLOWED_MEMBER_EMAILS AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN; do
  test -n "${(P)name}" || { printf 'missing %s\n' "$name"; SETTINGS_VALID=false; }
done
test "$AUTOMATION_SECRET" != "$APP_TOKEN" || { printf 'AUTOMATION_SECRET and APP_TOKEN must differ\n'; SETTINGS_VALID=false; }
test "$SETTINGS_VALID" = true && printf 'all seven settings are present\n'
```

只有最后显示 `all seven settings are present` 才能继续；否则修正输入并重新检查。

### 5.3 生成临时 JSON 并上传

在仓库外创建临时文件，权限限制为当前用户：

```bash
SECRETS_DIR="$(mktemp -d -t memory-garden-oauth.XXXXXX)"
chmod 700 "$SECRETS_DIR"
SECRETS_FILE="$SECRETS_DIR/worker-secrets.json"
: > "$SECRETS_FILE"
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
  process.stdout.write(`${JSON.stringify(bundle)}\n`);
' > "$SECRETS_FILE"
SERIALIZE_STATUS=$?

if test "$SERIALIZE_STATUS" -eq 0; then
  rtk npx wrangler versions upload \
    --secrets-file "$SECRETS_FILE" \
    --strict \
    --message "GitHub OAuth release candidate"
  UPLOAD_STATUS=$?
else
  printf 'secret bundle serialization failed\n'
  UPLOAD_STATUS="$SERIALIZE_STATUS"
fi

cleanup_secret_bundle
trap - EXIT HUP INT TERM
test "$UPLOAD_STATUS" -eq 0
```

这一条 `versions upload` 会远程创建包含代码、配置、静态资源和七项 Secret 的新 Worker Version，但不会自动承载生产流量。JSON 中没有出现的旧 Secret 会被保留，不会自动删除。

### 5.4 检查并部署精确版本

记录上传输出中的 `<VERSION_ID>`：

```bash
rtk npx wrangler versions view <VERSION_ID>
rtk npx wrangler versions list
rtk npx wrangler deployments status
```

确认版本、bindings 和配置正确后，另行授权并部署：

```bash
rtk npx wrangler versions deploy <VERSION_ID>@100% --yes
rtk npx wrangler deployments status
```

## 6. Cloudflare Dashboard 手动录入

Dashboard 方式会在点击 **Deploy** 后立即部署新版本，不提供“先上传、检查、再部署”的同等隔离，因此不作为标准首发方式。仅当已经确认当前生产代码版本正确、现在只缺七项配置时使用。

### 6.1 进入配置页面

1. 登录 Cloudflare Dashboard；
2. 打开 **Workers & Pages**；
3. 选择 `memory-garden-agent`；
4. 打开 **Settings**；
5. 找到 **Variables and Secrets**；
6. 点击 **Add**。

### 6.2 一次添加七项 Secret

对每一项执行：

1. Type 选择 **Secret**；
2. Variable name 填写完整名称；
3. Value 从密码管理器填写；
4. 点击 **Add variable**，继续下一项。

必须在同一次编辑中加入：

```text
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
BOOTSTRAP_ADMIN_EMAIL
ALLOWED_MEMBER_EMAILS
AUTOMATION_CLIENT_ID
AUTOMATION_SECRET
APP_TOKEN
```

逐项复核名称，特别注意：

- 全部使用大写和下划线；
- 不要带首尾空格；
- 不要在值外面加引号；
- allowlist 使用英文逗号；
- `AUTOMATION_SECRET` 和 `APP_TOKEN` 必须不同。

### 6.3 部署

七项全部录入后，只点击一次 **Deploy**。此操作会立即创建并部署一个生产版本。

部署后立即执行只读检查：

```bash
rtk npx wrangler secret list
rtk npx wrangler versions list
rtk npx wrangler deployments status
```

`secret list` 只能确认名称存在，不能也不应重新显示 secret 明文。

## 7. 配置后验收

### 7.1 OAuth 启动

```bash
curl -sS -D - -o /dev/null https://memory.crgmhrc.asia/auth/github
```

期望：

- HTTP `302`；
- `Location` 指向 `github.com`；
- 不再出现 `OAUTH_CONFIG_INVALID`；
- 不把完整 Location query 保存到日志或发布证据。

### 7.2 浏览器登录

- bootstrap 邮箱首次登录成为 admin；
- allowlist 中其他邮箱成为 contributor；
- 非 allowlist 邮箱得到 `MEMBER_NOT_ALLOWED`；
- `/api/session` 返回正确成员和角色；
- `POST /auth/logout` 清除 `__Host-memory-session`。

### 7.3 signed automation smoke

必须从密码管理器读取与 Worker 完全相同的三项值：

```bash
read -rs "AUTOMATION_CLIENT_ID?AUTOMATION_CLIENT_ID: "
printf '\n'
read -rs "AUTOMATION_SECRET?AUTOMATION_SECRET: "
printf '\n'
read -rs "APP_TOKEN?APP_TOKEN: "
printf '\n'
export AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

## 8. 常见错误

| 错误 | 原因 | 处理 |
|---|---|---|
| `/auth/github` 返回 `OAUTH_CONFIG_INVALID` | GitHub client ID/secret 缺失，或邮箱配置无效 | 检查七项名称；核对 bootstrap 是否在 allowlist |
| GitHub callback mismatch | OAuth App callback 填写错误 | 改为精确的生产 callback URL |
| `MEMBER_NOT_ALLOWED` | 登录邮箱不是 primary+verified，或不在 allowlist | 核对 GitHub 邮箱状态和 allowlist |
| automation smoke `401` | 三项 automation 配置与 Worker 不一致 | 从同一密码管理器记录重新读取，不要重新生成 |
| `no such table: auth_sessions` | GitHub OAuth migration 未应用 | 停止操作，授权执行远程 D1 migration |
| Dashboard 看不到 secret 值 | 正常安全行为 | 从密码管理器获取；不要尝试从 Cloudflare 导出明文 |

## 9. 禁止事项

- 不把七项值写入 `wrangler.jsonc`、README、issue、聊天或 Git commit；
- 不把生产 secret 写入 `.dev.vars` 或 `.env`；
- 不使用 `echo SECRET_VALUE | wrangler ...`；
- 不逐项执行 `wrangler secret put`，因为每次都会创建并立即部署版本；
- 不在上传后重新生成 automation secret 或 APP token；
- 不在 OAuth 和 smoke 通过前删除旧 Access secrets；
- 不通过逆向 D1 migration、删除 D1 表或 Durable Object 数据回滚。

## 10. 相关文档

- [生产环境运维部署手册](./production-environment-handbook.md)
- [GitHub OAuth 部署手册](./github-oauth-setup.md)
- [生产 smoke 手册](./smoke-test.md)
- [回滚手册](./rollback.md)
- [Cloudflare Workers Secrets 官方文档](https://developers.cloudflare.com/workers/configuration/secrets/)
- [GitHub 创建 OAuth App 官方文档](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
