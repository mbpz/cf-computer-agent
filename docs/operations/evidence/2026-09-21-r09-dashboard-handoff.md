# R09 Dashboard 只读核查交接清单

日期：2026-09-21（Asia/Shanghai）。这是用户登录 Cloudflare Dashboard 后的只读取证清单；不包含部署、回滚、迁移、密钥查看或配置修改动作。

## 入口与记录字段

进入 Cloudflare Dashboard → Workers & Pages → `memory-garden-agent` → Production，逐项记录截图或导出文本中的以下字段：

1. **Deployments**：当前 100% 版本 ID、部署时间、部署来源、commit/tag/message、操作者、历史版本是否仍有流量。
2. **Builds & deployments / CI**：Git 仓库、生产分支、触发事件、构建命令、部署命令、构建日志链接、最近一次成功构建的 commit SHA。
3. **Domains & routes**：`memory.crgmhrc.asia` 是否唯一生产路由；workers.dev、preview URL、其他 route/custom domain 是否关闭或仍可达。
4. **Triggers**：Cron `*/5 * * * *`、其他 Cron/Queue/Workflow/服务绑定触发器及责任人。
5. **Settings → Variables and Secrets**：只记录 secret 名称和配置环境，不打开或复制 secret 值；核对生产版本是否声明 7 个已知 secret 名称。
6. **Bindings**：D1、Durable Objects、Assets、AI 绑定名称与目标资源；记录是否存在额外环境或同库 Worker。

## 生产写者清单

对每个可能写入 D1、Durable Object、R2/Assets 或 session/telemetry 的入口记录：

| 写者 | 资源 | 版本/环境 | 责任人 | 停写动作 | 已有证据 |
| --- | --- | --- | --- | --- | --- |
| Worker fetch | D1/DO/session | 生产 100% 版本 | 待填 | 维护协调器/路由切换 | 待填 |
| Cron | D1/R2/解析任务 | `*/5 * * * *` | 待填 | 暂停触发器或纳入协调器 | 待填 |
| Automation client | D1/API | client ID 所属环境 | 待填 | 撤销/暂停调用 | 待填 |
| Dashboard/控制台 | D1/Worker | 管理员入口 | 待填 | 操作窗口内禁止手工写入 | 待填 |
| 旧版本/其他 Worker | 共享 D1/DO | 其他 route/environment | 待填 | 删除流量或停用写者 | 待填 |

## R09 关闭标准

- 当前 100% 版本能映射到 Git commit SHA、构建记录和批准分支。
- 所有 route、Cron、绑定资源和可写 Worker 已列出，无未知写者。
- 每个写者都有责任人、停写动作和恢复动作。
- 旧版本、Preview、workers.dev、控制台和外部 automation 的写入边界已确认。
- 时间戳、版本 ID、生产域名和 D1 binding 与同一候选一致。

只读证据不足时保持 R09 开放；不得用“最新版本存在”替代 source-to-version 或全写者证明。
