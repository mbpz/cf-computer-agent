# R09 生产写者责任预检（只读）

日期：2026-09-23（Asia/Shanghai）。本记录只整理仓库和 Cloudflare Dashboard 已观察到的责任入口；不读取 secret 值，不执行生产请求、迁移、停写、备份或部署。

## 1. 已确认的入口

| 责任类别 | 本地/平台证据 | 当前结论 |
| --- | --- | --- |
| GitHub Actions | `.github/workflows` 不存在 | 不能把 GitHub Actions 认定为生产发布者 |
| Cloudflare Git 构建 | Dashboard Build `#d11574fa`，commit `ea9f9c5`，构建成功；命令为 `npm run build` | `main → build` 已确认 |
| 生产部署 | Dashboard 部署历史：2026-09-23 08:45:16，作者 `apples398@gmail.com`，来源 `Wrangler`，版本 `6025488e`，100% 流量 | `build → production` 已确认；来源字段是 Wrangler，不额外推断为 Actions |
| 手工 Wrangler | `package.json` 暴露 `deploy: wrangler deploy`；Dashboard 部署历史持续显示 Wrangler | 存在可发布入口；具体操作者、审批和回滚责任仍待登记 |
| Automation client | `src/identity/automation.ts` 校验 `AUTOMATION_CLIENT_ID`、`AUTOMATION_SECRET`、时间戳、nonce、HMAC；本地脚本为 `probe:automation*` 和 `smoke` | 代码协议已确认；生产调用者、调度器和撤销责任未确认 |
| OAuth callback | `/auth/github/callback`、`/auth/wechat/callback` 创建 member/session | 生产 callback 成功证据和旧 OAuth 应用/回调禁用责任需单独登记 |
| Cron | Dashboard 已配置 Cron；Worker `scheduled` 入口会执行资产解析/清理 | 生产定时写者存在；排空、暂停和恢复责任未确认 |
| D1 控制台/远程脚本 | 仓库文档包含 `d1 migrations`、`d1 export`、`versions upload/deploy` 流程 | 具备旁路写入能力；操作者、审批、停写和审计责任未确认 |
| 其他 Worker | `edgetunnel` 独立仓库，仅 KV、无自定义域/路由、过去 24 小时调用为 0 | 已排除其直接绑定本项目 D1/DO 的证据 |

## 2. 仍缺的生产证据

1. Automation client 的实际调用者、调度平台、权限范围、轮换和撤销责任。
2. Wrangler/D1 控制台手工操作人的允许名单、审批人、审计记录和回滚责任。
3. OAuth 应用 callback URL 的当前配置、旧 callback 禁用证据和 OAuth 写入责任。
4. 旧版本是否仍承接流量，以及版本退出、回滚和恢复顺序。
5. Cron 在维护窗口中的停写、排空、恢复证据。

## 3. R09 判定

当前可确认“发布链已可追溯、代码入口已分类、`edgetunnel` 已排除”；不能确认“全部生产写者已登记并具备停写/恢复动作”。因此 R09 保持开放，R10 不提前开始。

