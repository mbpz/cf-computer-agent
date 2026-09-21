# R09 — 发布链与生产写者只读盘点证据

日期：2026-09-20（Asia/Shanghai）。本记录只保存仓库和 Cloudflare 只读盘点，不授权部署、迁移、停写、备份或生产 smoke。

## 已核实事实

| 范围 | 证据 | 结论 |
| --- | --- | --- |
| 仓库发布入口 | `package.json`：`deploy = wrangler deploy`；`build = ... wrangler deploy --dry-run` | 本地候选构建命令明确；未发现仓库内自动发布脚本 |
| CI 文件 | `.github` 目录无工作流文件 | 不能据仓库证明 GitHub Actions 是生产发布者 |
| Wrangler 目标 | `wrangler.jsonc`：Worker `memory-garden-agent`、自定义域 `memory.crgmhrc.asia`、`workers_dev=false`、`preview_urls=false` | workers.dev/preview 在本地配置关闭；需以 Dashboard/线上状态复核 |
| 生产绑定 | D1 `memory-garden-control-plane`、Knowledge/AgentSession DO、AI、Assets；Cron `*/5 * * * *` | 代码侧可见写入口和定时入口；不证明旧版本/旁路入口已停止 |
| Cloudflare 身份 | `wrangler whoami` 只读成功，当前 OAuth 账号具备 Workers/D1 写权限 | 权限本身不是发布来源或全写者清单 |
| 部署历史 | `wrangler deployments list --name memory-garden-agent --json` 返回 10 个 100% `wrangler` deployment，均标注 `workers/triggered_by=deployment` | 可见部署版本历史，但没有 Git SHA、构建平台、CI run 或外部写者映射 |

Cloudflare API 返回的最后一条 `created_on` 为 `2026-09-21T00:20:27Z`，相对本记录日期是未来时间；已作为时间/数据一致性异常保留，不能把它当作当前候选或部署成功证据。

## 尚未闭合的生产写者

- Cloudflare Dashboard 的 CI/Git 集成、构建命令、生产分支和部署审批链尚未取得只读证据。
- 旧 Worker 版本、手工 Wrangler/控制台 D1 写入、Cron 触发、外部 automation client、其他 Worker/环境和 GitHub OAuth 回调写者尚未形成责任清单。
- 当前本地维护入口仍是 guarded harness；生产 `src/index.ts` 仍为 legacy，不能据本盘点宣布所有写路径已接入维护协调器。

因此 R09 保持未完成。关闭前至少需要：Dashboard/CI source-to-version 映射、生产路由与版本对应、全部写者责任/停写顺序、外部凭证使用者和时间戳异常解释；这些信息确认后才能进入 R10。
