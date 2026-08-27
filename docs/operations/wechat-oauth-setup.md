# 微信扫码登录配置（核心手册）

> 适用生产站点：`https://memory.crgmhrc.asia`  
> Worker：`memory-garden-agent`  
> 微信登录是可选扩展；不配置时，登录页会自动隐藏可用入口，不影响 GitHub 登录。

## 1. 在微信开放平台取得 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`

1. 打开 [微信开放平台](https://open.weixin.qq.com/)，注册并完成开发者认证。
2. 进入「管理中心 → 网站应用 → 创建网站应用」。
3. 网站应用通过审核后，在应用详情页复制：
   - **AppID** → `WECHAT_APP_ID`
   - **AppSecret** → `WECHAT_APP_SECRET`
4. 在应用的「开发配置」中设置授权回调域名：
   - `memory.crgmhrc.asia`
   - 这里只填域名，不填 `https://`、路径或 query。
5. 本项目实际回调地址固定为：

   ```text
   https://memory.crgmhrc.asia/auth/wechat/callback
   ```

AppSecret 只保存到密码管理器和 Cloudflare Worker Secret，不能提交 Git、放入前端或写入工单。网站应用的扫码登录流程使用 `snsapi_login`；相关 OAuth 参数和回调要求见[微信网站应用登录指南](https://wdk-docs.github.io/wxopen-docs/website/login.html)。

## 2. 取得微信 subject

本项目不使用微信邮箱，使用稳定 subject 做白名单：

```text
wechat:<unionid>
```

优先使用 OAuth 换 token 响应中的 `unionid`；如果响应没有 `unionid`，使用 `openid`：

```text
wechat:<openid>
```

`unionid/openid` 不是本地生成值，而是微信在授权码换 token 时返回的值。若你已经拿到一次性 OAuth `code`，可在受控终端查询（不要把命令、响应或 Secret 发到聊天工具）：

```bash
read -r WECHAT_CODE
read -r WECHAT_APP_ID
read -rs WECHAT_APP_SECRET
curl --fail-with-body --silent --show-error --get \
  'https://api.weixin.qq.com/sns/oauth2/access_token' \
  --data-urlencode "appid=${WECHAT_APP_ID}" \
  --data-urlencode "secret=${WECHAT_APP_SECRET}" \
  --data-urlencode "code=${WECHAT_CODE}" \
  --data-urlencode 'grant_type=authorization_code'
```

从 JSON 响应读取 `unionid`（优先）或 `openid`，然后加上 `wechat:` 前缀。`code` 只能使用一次；若生产回调已经消费它，请重新发起一次授权，不要重复提交旧 code。

## 3. 生成两个白名单 Secret

### `ALLOWED_WECHAT_SUBJECTS`

允许登录的微信 subject，多个值使用英文逗号分隔：

```text
wechat:unionid_of_admin,wechat:unionid_of_member
```

### `BOOTSTRAP_WECHAT_SUBJECT`

首个微信管理员的 subject，只填一个，并且必须同时出现在上面的 allowlist 中：

```text
wechat:unionid_of_admin
```

它不是随机值，也不是微信昵称、手机号或微信号。只有数据库还没有 active admin 时，匹配该 subject 的首次登录才会初始化为 admin；后续修改此 Secret 不会替换已有管理员。

## 4. 写入 Cloudflare Worker Secret

在项目根目录执行，命令会交互式读取值，不把明文放入 shell 参数：

```bash
npx wrangler secret put WECHAT_APP_ID
npx wrangler secret put WECHAT_APP_SECRET
npx wrangler secret put ALLOWED_WECHAT_SUBJECTS
npx wrangler secret put BOOTSTRAP_WECHAT_SUBJECT
```

Secret 写入的是当前 Wrangler 目标 Worker；确认登录账号、账户和 Worker 名称正确。不要把四项加入 `SECRETS_FILE` 或 Git 仓库。

## 5. 验证

先确认能力探测只返回布尔值，不会返回密钥：

```bash
curl --fail --silent https://memory.crgmhrc.asia/api/auth/providers
```

期望微信已配置：

```json
{"github":true,"wechat":true}
```

然后用 allowlist 中的微信账号扫码登录。若返回 `MEMBER_NOT_ALLOWED`，检查 subject 是否使用了 `wechat:` 前缀、是否为 `unionid`/`openid` 的准确值，以及是否存在英文逗号或空格错误。若返回 `WECHAT_OAUTH_CONFIG_INVALID`，检查 AppID 和 AppSecret 是否都已作为 Worker Secret 发布。
