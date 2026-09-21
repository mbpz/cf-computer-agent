# R09 — 发布链与生产写者只读盘点证据

日期：2026-09-20（Asia/Shanghai）；2026-09-21 持续增加版本级只读刷新。本记录只保存仓库和 Cloudflare 只读盘点，不授权部署、迁移、停写、备份或生产 smoke。

## 已核实事实

| 范围 | 证据 | 结论 |
| --- | --- | --- |
| 仓库发布入口 | `package.json`：`deploy = wrangler deploy`；`build = ... wrangler deploy --dry-run` | 本地候选构建命令明确；未发现仓库内自动发布脚本 |
| CI 文件 | `.github` 目录无工作流文件 | 不能据仓库证明 GitHub Actions 是生产发布者 |
| Wrangler 目标 | `wrangler.jsonc`：Worker `memory-garden-agent`、自定义域 `memory.crgmhrc.asia`、`workers_dev=false`、`preview_urls=false` | workers.dev/preview 在本地配置关闭；需以 Dashboard/线上状态复核 |
| 生产绑定 | D1 `memory-garden-control-plane`、Knowledge/AgentSession DO、AI、Assets；Cron `*/5 * * * *` | 代码侧可见写入口和定时入口；不证明旧版本/旁路入口已停止 |
| Cloudflare 身份 | `wrangler whoami` 只读成功，当前 OAuth 账号具备 Workers/D1 写权限 | 权限本身不是发布来源或全写者清单 |
| 部署历史 | 最新只读刷新返回 10 个 100% `wrangler` deployment，最新部署 `2026-09-21T14:01:49Z` 指向版本 `4528d675-d026-4aa8-a8d6-8bbb6d8e9793`，均标注 `workers/triggered_by=deployment` | 已确认有新版本发布，但没有 Git SHA、构建平台、CI run 或外部写者映射 |
| 版本元数据刷新 | 最新 `wrangler versions view` 的版本 `4528d675-d026-4aa8-a8d6-8bbb6d8e9793` 为 `Source: Unknown (version_upload)`、无 tag/message；显示 `fetch`/`scheduled`、D1/DO/AI/Assets 绑定 | 新版本已出现，但仍无法映射到当前 Git 提交或 CI run |
| 密钥元数据 | `versions view` 仅列出 7 个 secret 名称，未读取值 | 只证明版本声明了 secret 名称，不证明生成来源、轮换责任或其他写者 |
| Dashboard 内置浏览器 | 访问 Worker production 页面后重定向到 Cloudflare `/login`；未输入账号、密码、OTP 或密钥 | 当前没有可复用的 Dashboard 登录会话，CI/Git 集成和部署审批链仍无法从浏览器读取 |
| GitHub 公开仓库 API | `actions/workflows` 返回 `total_count: 0`；`main` 当前 SHA 为 `35e41c284b0a0f66fcdd8166521855ce347dfefa`，提交时间 `2026-09-21T00:43:55Z` | 仓库没有 GitHub Actions 自动部署工作流 |
| Git/Cloudflare 时间对照 | Cloudflare 最新版本 `aff4bda3-6bb1-4b47-a4a0-e6ba725536bc` 创建于 `2026-09-21T00:20:26.739Z`，早于当前 `main` 提交，且 Source 仍为 Unknown | 没有证据表明当前 `main` 已自动生成或部署为 Cloudflare 版本 |

版本/部署时间以 Cloudflare API 返回的 UTC 值为准；本次刷新确认最新版本创建于 `2026-09-21T14:01:48.723Z`，最新部署创建于 `2026-09-21T14:01:49.602603Z`。时间戳本身不提供 Git source-to-version 证明。

## 尚未闭合的生产写者

- Cloudflare Dashboard 的 CI/Git 集成、构建命令、生产分支和部署审批链尚未取得只读证据。
- GitHub 仓库公开 API 已确认没有 Actions workflow；新版本的 `Source: Unknown (version_upload)` 不能区分 Cloudflare Dashboard CI、手工 Wrangler 或其他外部系统。
- 旧 Worker 版本、手工 Wrangler/控制台 D1 写入、Cron 触发、外部 automation client、其他 Worker/环境和 GitHub OAuth 回调写者尚未形成责任清单。
- 当前本地维护入口仍是 guarded harness；生产 `src/index.ts` 仍为 legacy，不能据本盘点宣布所有写路径已接入维护协调器。

因此 R09 保持未完成。关闭前至少需要：Dashboard/外部 CI source-to-version 映射、生产路由与版本对应、全部写者责任/停写顺序、外部凭证使用者和旧版本退出证据；这些信息确认后才能进入 R10。当前内置浏览器无登录会话，未代替用户输入凭据。
