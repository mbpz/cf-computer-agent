# R09 生产写者责任账本（只读版本）

日期：2026-09-23（Asia/Shanghai，刷新记录）。本记录基于当前 `main` 源码、`wrangler.jsonc` 和 Cloudflare Dashboard 只读证据整理；不读取 secret 值，不执行生产请求、迁移、停写、备份或部署。

## 1. 代码内写者

| 写者类别 | 入口/绑定 | 写入范围 | 维护控制状态 | 证据与缺口 |
| --- | --- | --- | --- | --- |
| 普通成员 HTTP | GitHub/WeChat callback、`/api/*`、知识提交、任务/项目/通知/消息等路由 | D1、Knowledge DO、AgentSession DO；可选 R2 原件 | 当前生产版本已包含安全闸门；因 token 未配置仍回退 legacy | 代码与当前生产 source-to-version 已映射；生产业务拒绝/恢复证据仍缺 |
| 管理员 HTTP | `/api/admin/*`、角色/菜单/审核/治理、维护控制 API | D1、Knowledge DO、审计表、Maintenance DO | 管理维护 API 已随 `6214a31` 部署；token 未配置时控制面返回 unavailable | 需生产 admin session、403/成功/审计证据 |
| Automation client | `/api/health` 及签名自动化入口 | 读取和兼容写入；具体业务写入由 API 路由决定 | 受同一 Worker entry 控制；外部凭证调用者未盘点 | 需核对 client 列表、脚本、定时任务和撤销责任 |
| Cron | `*/5 * * * *` → Worker `scheduled` → 资产解析/清理 sweep | D1 jobs/assets 状态；绑定存在时访问 R2 | 当前版本已部署 Cron；token 未配置时仍走 legacy scheduled | Dashboard 当前设置已确认 Cron 存在；生产排空证据仍缺 |
| Knowledge DO | `KNOWLEDGE` / `KnowledgeBase` | Durable Object SQLite/VFS 工作区和发布内容 | 仅通过 Worker 路由/DO 调用 | 需确认旧版本/其他 Worker 无旁路调用 |
| AgentSession DO | `AGENT_SESSIONS` / `AgentSession` | 会话消息、turn 和流状态 | 仅通过 Worker 路由/DO 调用 | 需确认旧版本/其他 Worker 无旁路调用 |
| Maintenance DO | `MAINTENANCE` / `MaintenanceCoordinator` | 控制状态、permit、epoch、排空证据 | `MAINTENANCE_CONTROL_TOKEN` 缺失时入口回退 legacy | 当前 Dashboard 已确认 binding；secret 未配置，控制面尚未生产启用 |

## 2. 平台与外部写者

| 写者 | 当前已知状态 | 关闭 R09 所需证据 |
| --- | --- | --- |
| Cloudflare Dashboard Git 集成 | 2026-09-23 已确认 Build `#bf860b36`、commit `4b0df2c9de51a96d2d82cf1c520e4012a1340cf4`；构建完成 22:44:58.442，部署历史 22:45:08 由 `apples398@gmail.com` 通过 Wrangler 将生产版本 `686168b3` 切换为 100% 流量；`34949fd7`、`ca60bbc3`、`43e689ac` 为前序版本 | 最新 source → build → production 已完成；仍需责任人、停写顺序和恢复顺序；不额外推断为 GitHub Actions |
| GitHub Actions | 仓库公开 API 旧记录显示无 workflow | 再次确认当前仓库仍无 Actions 写者；若新增，记录 workflow、token、环境和审批人 |
| 手工 Wrangler | `wrangler whoami` 只能证明权限，不证明无人手工发布 | 记录允许操作人、版本上传/部署责任、审计留痕和回滚责任 |
| 其他 Worker/环境 | 2026-09-23 Dashboard 只读页显示 `edgetunnel` 来自独立仓库 `mbpz/edgetunnel`；当前版本 `647b4555`，仅有 `KV` binding，仅有 `edgetunnel.apples398.workers.dev`，无自定义域/路由，过去 24 小时调用数/错误数均为 0；历史版本也均为约 8 个月前的 Dashboard 手动部署 | 已排除其直接绑定本项目 D1/DO 的证据；保留旧版本责任记录，不纳入本项目当前写者集合 |
| D1 控制台/远程脚本 | D1 可由 Wrangler 或 Dashboard 直接写入 | 生产迁移、控制台执行、备份工具的操作者和停写规则必须单独记录 |
| OAuth 上游回调 | GitHub/WeChat callback 会创建 member/session | 仅允许当前 Worker 域名回调；核对 OAuth 应用回调 URL 和禁用旧回调 |
| Queue/Email/外部 Cron | 当前 Dashboard 已确认 Queue 消费者和 Email 路由均未配置；Cron 已配置 | Queue/Email 可记录为 N/A；Cron 仍需停写/恢复责任 |

## 3. 当前判定

- 代码内写者已完成本地分类，但这不是生产写者收口。
- `850db38` 的安全闸门、`2feb021` 的维护控制 API 和 R09 账本刷新已进入生产构建链；当前 binding、Cron、Queue/Email 证据已刷新，生产 100% 版本为 `686168b3`，最新 source-to-version 已补齐；生产写者责任仍未收口。
- 生产 `MAINTENANCE_CONTROL_TOKEN` 未配置，外部 Automation/手工 Wrangler、旧版本流量及各写者责任仍是 R09 阻塞项；`edgetunnel` 已有独立 KV/无路由/零调用的排除证据。
- 在这些证据完成前，不得关闭 R09，也不得把 R10–R15 标记为生产执行完成。

## 4. 下一步只读顺序

1. 补齐 Automation client、手工 Wrangler、D1 控制台和 OAuth callback 的责任人/停写顺序/恢复顺序。
2. 核对旧版本是否仍承接流量，并保留版本退出证据。
3. 只有账本完整且所有生产写者都有责任与恢复动作后，才进入 R10 远程合成只读传输验证。

本轮责任预检见[2026-09-23 R09 responsibility preflight](2026-09-23-r09-responsibility-preflight.md)。

R09 外部事实待确认项见[2026-09-23 R09 operator attestation](2026-09-23-r09-operator-attestation.md)。
