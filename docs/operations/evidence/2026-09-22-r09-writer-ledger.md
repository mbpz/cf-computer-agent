# R09 生产写者责任账本（只读版本）

日期：2026-09-22（Asia/Shanghai）。本记录基于当前 `main` 源码、`wrangler.jsonc` 和已保存的 Cloudflare Dashboard 只读证据整理；不读取 secret 值，不执行生产请求、迁移、停写、备份或部署。

## 1. 代码内写者

| 写者类别 | 入口/绑定 | 写入范围 | 维护控制状态 | 证据与缺口 |
| --- | --- | --- | --- | --- |
| 普通成员 HTTP | GitHub/WeChat callback、`/api/*`、知识提交、任务/项目/通知/消息等路由 | D1、Knowledge DO、AgentSession DO；可选 R2 原件 | 本地已有共用 guarded entry；生产是否运行 guarded 取决于 `MAINTENANCE_CONTROL_TOKEN` | 代码可定位，生产版本/路由仍需 Dashboard 复核 |
| 管理员 HTTP | `/api/admin/*`、角色/菜单/审核/治理、维护控制 API | D1、Knowledge DO、审计表、Maintenance DO | 管理维护 API 已在 `2feb021` 本地实现；生产尚未证明部署并配置 token | 需生产 admin session、403/成功/审计证据 |
| Automation client | `/api/health` 及签名自动化入口 | 读取和兼容写入；具体业务写入由 API 路由决定 | 受同一 Worker entry 控制；外部凭证调用者未盘点 | 需核对 client 列表、脚本、定时任务和撤销责任 |
| Cron | `*/5 * * * *` → Worker `scheduled` → 资产解析/清理 sweep | D1 jobs/assets 状态；绑定存在时访问 R2 | 本地 guarded entry 已接入；生产是否启用 guarded 未证实 | Dashboard 触发器已在旧只读记录中确认，需刷新到当前版本 |
| Knowledge DO | `KNOWLEDGE` / `KnowledgeBase` | Durable Object SQLite/VFS 工作区和发布内容 | 仅通过 Worker 路由/DO 调用 | 需确认旧版本/其他 Worker 无旁路调用 |
| AgentSession DO | `AGENT_SESSIONS` / `AgentSession` | 会话消息、turn 和流状态 | 仅通过 Worker 路由/DO 调用 | 需确认旧版本/其他 Worker 无旁路调用 |
| Maintenance DO | `MAINTENANCE` / `MaintenanceCoordinator` | 控制状态、permit、epoch、排空证据 | `MAINTENANCE_CONTROL_TOKEN` 缺失时本地入口回退 legacy | 生产 binding 已有旧部署证据；当前提交 source-to-version 尚待刷新 |

## 2. 平台与外部写者

| 写者 | 当前已知状态 | 关闭 R09 所需证据 |
| --- | --- | --- |
| Cloudflare Dashboard Git 集成 | 2026-09-22 已保存证据：仓库 `mbpz/cf-computer-agent`、分支 `main`、`npm run build`、`npx wrangler deploy` | 在当前提交之后刷新 build/run/version 映射，确认 100% 流量版本和 commit 一致 |
| GitHub Actions | 仓库公开 API 旧记录显示无 workflow | 再次确认当前仓库仍无 Actions 写者；若新增，记录 workflow、token、环境和审批人 |
| 手工 Wrangler | `wrangler whoami` 只能证明权限，不证明无人手工发布 | 记录允许操作人、版本上传/部署责任、审计留痕和回滚责任 |
| 其他 Worker/环境 | 旧记录未发现可证明的旁路 Worker | Dashboard Workers 清单、域名路由、服务绑定和旧版本流量逐项核对 |
| D1 控制台/远程脚本 | D1 可由 Wrangler 或 Dashboard 直接写入 | 生产迁移、控制台执行、备份工具的操作者和停写规则必须单独记录 |
| OAuth 上游回调 | GitHub/WeChat callback 会创建 member/session | 仅允许当前 Worker 域名回调；核对 OAuth 应用回调 URL 和禁用旧回调 |
| Queue/Email/外部 Cron | 已保存 Dashboard 证据显示 Queue/Email 未配置 | 刷新当前 Dashboard；若仍无配置，记录为明确 N/A，而不是“未检查” |

## 3. 当前判定

- 代码内写者已完成本地分类，但这不是生产写者收口。
- `850db38` 的安全闸门和 `2feb021` 的维护控制 API 已进入当前 `main`，生产 source-to-version 与版本级 binding 证据尚未刷新。
- 生产 `MAINTENANCE_CONTROL_TOKEN` 是否配置、旧生产版本是否仍承接流量、外部 Automation/手工 Wrangler 是否仍可写，仍是 R09 阻塞项。
- 在这些证据完成前，不得关闭 R09，也不得把 R10–R15 标记为生产执行完成。

## 4. 下一步只读顺序

1. 从 Cloudflare Dashboard 读取当前 `main` 最新成功 build、commit、生产 version、100% 流量和 bindings。
2. 读取 Worker routes、其他 Worker、旧版本、Cron、Queue/Email、环境变量/secret 名称清单；不读取 secret 值。
3. 将 Automation client、手工 Wrangler、D1 控制台、OAuth callback 和旧版本写者填入责任人/停写顺序/恢复顺序。
4. 只有账本完整且版本映射无歧义后，才进入 R10 远程合成只读传输验证。
