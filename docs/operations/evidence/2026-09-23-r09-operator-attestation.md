# R09 生产写者操作人声明清单

日期：2026-09-23（Asia/Shanghai）。本文件是 R09 的外部事实确认表，不包含任何 secret、OAuth code、Cookie、D1 私有正文或完整请求头。未完成签署前，不得将 R09 标记为完成，也不得进入 R10。

## 需要由生产操作人确认的事实

| 编号 | 责任范围 | 需要确认的事实 | 证据要求 | 状态 |
| --- | --- | --- | --- | --- |
| OP-01 | Automation | `AUTOMATION_CLIENT_ID` / `AUTOMATION_SECRET` 的实际调用者、调度平台、用途和权限范围 | 调度任务/脚本名称、责任人、允许路径；不得提供 secret 值 | 待确认 |
| OP-02 | Automation | 是否存在生产外部 smoke、监控或定时任务调用 `/api/health`、`/api/admin/*` 或其他 API | 脱敏请求时间、路径、结果和责任人 | 待确认 |
| OP-03 | 手工 Wrangler | 谁被允许执行 `wrangler deploy`、`versions upload`、`versions deploy` 或 secret 操作 | Cloudflare 操作人/审批人、回滚责任人 | 待确认 |
| OP-04 | D1 控制台/脚本 | 谁被允许执行远程 migration、D1 export/restore 或控制台 SQL | 操作者、审批人、备份/恢复隔离规则 | 待确认 |
| OP-05 | OAuth callback | 当前 GitHub callback 应用和旧 callback 应用是否仍启用 | 仅记录应用标识后缀、callback 域名和禁用动作；不得提供 client secret | 待确认 |
| OP-06 | Cron | 生产 Cron 的停写、排空、恢复责任人和执行顺序 | Dashboard trigger、维护窗口记录、恢复确认 | 待确认 |
| OP-07 | 旧版本 | 除当前 `6025488e` 外的历史版本是否仍承接流量或可被直接访问 | Dashboard 流量分配、版本退出或回滚记录 | 待确认 |

## 已由仓库/Dashboard 证明的事实

- 仓库没有 `.github/workflows`，不能将 GitHub Actions 认定为生产发布者。
- Build `#bf860b36` 成功构建 commit `4b0df2c`；构建部署阶段结束于 22:44:58.442，生产版本 `686168b3` 于 22:45:08 切换为 100% 流量。
- 部署历史的来源字段为 Wrangler，操作者显示为 `apples398@gmail.com`。
- `edgetunnel` 是独立 Worker，仅 KV、无自定义域/路由、过去 24 小时调用为 0，已排除其直接绑定本项目 D1/DO。
- Queue 和 Email trigger 未配置；Cron 已配置。
- `MAINTENANCE_CONTROL_TOKEN` 尚未配置，生产维护控制面尚未启用。
- Dashboard Observability 默认“过去 1 小时”事件查询显示 `0 Success`、`0 Errors`；这只能证明当前查询窗口无可见事件，不能替代 Automation/OAuth/Cron 的历史调用者和停写责任确认。

## R09 关闭条件

OP-01 至 OP-07 必须全部得到不含敏感值的生产事实确认；同时需要明确停写、排空、恢复和回滚顺序。仅凭代码搜索、secret 名称、Dashboard 构建成功或历史版本列表，不能替代这些确认。
