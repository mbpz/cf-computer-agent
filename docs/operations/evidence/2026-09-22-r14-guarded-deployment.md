# R14 guarded production deployment evidence

日期：2026-09-22（Asia/Shanghai）。证据来自已登录 Codex 自带浏览器的 Cloudflare Dashboard 只读检查；未读取或复制任何 secret 值，未执行控制操作。

## 已部署事实

| 项目 | 结果 |
| --- | --- |
| 成功构建 | Build `#b2621d18`，commit `6214a31 docs: record r09 writer responsibility ledger` |
| 当前 100% 版本 | `d73ffe49`（Dashboard 展示短版本标识） |
| 生产 Worker | `memory-garden-agent` |
| Git 仓库/分支 | `mbpz/cf-computer-agent` / `main` |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |
| 生产域名 | `memory.crgmhrc.asia` |
| MAINTENANCE binding | 已显示 `memory-garden-agent_MaintenanceCoordinator` |
| 现有触发器 | Cron 已配置；Queue/Email 未配置 |
| workers.dev/Preview URL | 均已关闭；仅保留 `memory.crgmhrc.asia` |

## 当前缺口与安全闸门

Dashboard 的 Production secrets 列表仍只有既有密钥，未出现 `MAINTENANCE_CONTROL_TOKEN`。当前候选已包含安全闸门：没有有效 token 时自动使用 legacy entry。因此：

- `MAINTENANCE` binding 已部署，但 guarded fetch/Cron 尚未启用；
- 生产不会在未配置 token 时累积 maintenance permits；
- 生产尚未具备可执行停写/恢复的完整条件；
- 管理员维护控制 API 已部署，但生产未配置 `MAINTENANCE_CONTROL_TOKEN`，因此不能启用 guarded fetch/Cron 或验证生产 `status/capacity/beginDrain/resume`；
- 不得据此关闭 R14，也不得进入 R15–R21 的生产停写、备份、迁移或恢复。

下一步必须先完成并审查管理员维护控制接口，再单独批准配置 `MAINTENANCE_CONTROL_TOKEN`；secret 值不得进入仓库、聊天、附件或 `SECRETS_FILE`。
