# R09 生产写者操作人声明清单

日期：2026-09-24（Asia/Shanghai）。本文件是 R09 的外部事实确认表，不包含任何 secret、OAuth code、Cookie、D1 私有正文或完整请求头。未完成签署前，不得将 R09 标记为完成，也不得进入 R10。

## 需要由生产操作人确认的事实

| 编号 | 责任范围 | 需要确认的事实 | 证据要求 | 状态 |
| --- | --- | --- | --- | --- |
| OP-01 | Automation | `AUTOMATION_CLIENT_ID` / `AUTOMATION_SECRET` 的实际调用者、调度平台、用途和权限范围 | 调度任务/脚本名称、责任人、允许路径；不得提供 secret 值 | 用户声明确认 |
| OP-02 | Automation | 是否存在生产外部 smoke、监控或定时任务调用 `/api/health`、`/api/admin/*` 或其他 API | 脱敏请求时间、路径、结果和责任人 | 用户声明确认 |
| OP-03 | 手工 Wrangler | 谁被允许执行 `wrangler deploy`、`versions upload`、`versions deploy` 或 secret 操作 | Cloudflare 操作人/审批人、回滚责任人 | 用户声明确认 |
| OP-04 | D1 控制台/脚本 | 谁被允许执行远程 migration、D1 export/restore 或控制台 SQL | 操作者、审批人、备份/恢复隔离规则 | 用户声明确认 |
| OP-05 | OAuth callback | 当前 GitHub callback 应用和旧 callback 应用是否仍启用 | 仅记录应用标识后缀、callback 域名和禁用动作；不得提供 client secret | 用户声明确认 |
| OP-06 | Cron | 生产 Cron 的停写、排空、恢复责任人和执行顺序 | Dashboard trigger、维护窗口记录、恢复确认 | 用户声明确认 |
| OP-07 | 旧版本 | 除当前 `1f613a4f` 外的历史版本是否仍承接流量或可被直接访问 | Dashboard 流量分配、版本退出或回滚记录 | 用户声明确认 |

## 已由仓库/Dashboard 证明的事实

- 仓库没有 `.github/workflows`，不能将 GitHub Actions 认定为生产发布者。
- 2026-09-24 Build `#738458bc` 成功构建 commit `96ea03d`；Dashboard 随后显示生产版本 `1f613a4f` 为 100% 流量。
- 部署历史的来源字段为 Wrangler，操作者显示为 `apples398@gmail.com`。
- `edgetunnel` 是独立 Worker，仅 KV、无自定义域/路由、过去 24 小时调用为 0，已排除其直接绑定本项目 D1/DO。
- Queue 和 Email trigger 未配置；Cron 已配置。
- `MAINTENANCE_CONTROL_TOKEN` 尚未配置，生产维护控制面尚未启用。
- 2026-09-24 通过 Cloudflare Dashboard Observability“过去 1 小时”查询观察到 `24 Success`、`0 Errors`；事件均为生产 Cron `*/5 * * * *`，消息为 `asset parse sweep skipped: binary storage is not configured`。这证明 Cron 触发链路正在运行，但也证明二进制存储未配置、资产解析 sweep 当前按设计跳过；不能将其扩大解释为完整资产解析能力，也不能替代 Automation/OAuth/Cron 的责任人与停写确认。
- 2026-09-24 通过 Cloudflare Dashboard Production Settings 只读确认：当前登录账户显示为 `Apples398@gmail.com`；生产分支为 `main`；构建命令为 `npm run build`，部署命令为 `npx wrangler deploy`，版本命令为 `npx wrangler versions upload`；Cron 触发器为 `*/5 * * * *`；Queue 消费者和 Email 路由均未配置；生产绑定包括 `DB`、`AGENT_SESSIONS`、`KNOWLEDGE`、`MAINTENANCE`、`AI`；仅记录 secret 名称，不读取值。

## R09 关闭条件

OP-01 至 OP-07 已于 2026-09-24 由用户以操作人声明确认，且已明确停写、排空、恢复和回滚顺序。该声明是生产责任边界的操作人确认，不等同于 Cloudflare 独立审计；R09 关闭后，R14 仍单独负责 guarded maintenance token 和生产控制面激活。

## 用户操作人确认

2026-09-24，用户明确指示“R09 快确认完结”，本文件据此将上一轮列出的 Automation、手工 Wrangler/D1、OAuth callback、Cron、旧版本和其他 Worker 责任边界作为用户操作人声明确认并关闭 R09。未记录任何 secret 值、OAuth code、Cookie 或私有业务正文。
