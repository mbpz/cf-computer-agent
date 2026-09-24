# R13 维护发布候选预检（本地）

日期：2026-09-24（Asia/Shanghai）。R12 按用户“无需备份 暂无重要数据”的最新决定豁免关闭。主线 **12/25 关闭（11 个完成、1 个豁免），13 项剩余，当前 R13**。本文件不授权生产变更，也不把本地验证视为生产验收。

## 1. 精确基线与差异

- 本轮开始时 `main` / `cc715304a6c30af82ae9878d838ff5234015f31c`，工作区干净；本地 `origin/main` 同指该提交，不代表生产发布已验证。
- 与最近已记录生产证据的 Git 基线 `1df36d4c2508c8dcc3c9b3f88576759cdd85a4e3` 比较，`git diff --name-only 1df36d4..HEAD` 仅列出主清单、R11/R12 证据和 `tools/d1-backup/README.md` 四个 Markdown 文件。运行代码、迁移和 Wrangler 配置没有变化。
- 本轮新增/修改仍仅为操作文档：备份豁免、依赖调整及本 R13 预检。最终文档提交标识以 Git 日志为准；不自动推送。

## 2. 本地配置与迁移身份

只读取跟踪的 `wrangler.jsonc` 和 migration SQL，不读取 `.env`、`SECRETS_FILE` 或运行时 secret 值：

| 项目 | 本地声明 |
| --- | --- |
| Worker / 域名 | `memory-garden-agent` / `memory.crgmhrc.asia` |
| DB | `memory-garden-control-plane` / `653c9e43-c7ad-45b8-a109-bc144843bee7` |
| DO | `KNOWLEDGE` → `KnowledgeBase`；`AGENT_SESSIONS` → `AgentSession`；`MAINTENANCE` → `MaintenanceCoordinator` |
| DO migration | `v1` / `v2` / `v3`，均为配置声明，不是本轮远程应用证明 |
| 其他 binding / trigger | `AI`、`ASSETS`；Cron `*/5 * * * *` |
| 入口限制 | workers.dev / Preview URL 均关闭；`ALLOW_INSECURE_LOCAL=false` |
| Wrangler 文件 SHA-256 | `e55427ad513f68e4cb72e0e816f68831c568d34b6403a0024836be5a9a59dd69` |
| 0051 SHA-256 | `30b4c77fc4e3198a1c6937adc0d95ba0c8bf142e707d670f0b12a233db47058d` |

生产 `0001–0050` / pending `0051` 及 `MAINTENANCE_CONTROL_TOKEN` 尚未配置，均仅为本日先前记录；本轮没有重新读取 Dashboard、生产 API 或 ledger。执行任何生产动作前须刷新，不视为保证当前状态。

## 3. 本轮候选本地验证

经本机 listener 权限批准执行：

```sh
rtk proxy sh -c 'npm run verify:m1:migrations -- --files && npm run test:ops:m1 && node --test scripts/smoke.test.mjs'
```

结果：migration-files **51**；发布合同 **34/34**；smoke **8/8**；组合命令退出 **0**。这些是本地文件、合同及合成请求检查，不包含完整应用回归、实时生产 binding 或迁移执行证明。

## 4. 授权及退出边界

| 动作 | 当前允许范围 |
| --- | --- |
| 本地文档提交 | 用户此前反复要求提交并继续，可提交本轮证据；不扩大为发布授权 |
| 合并 | 当前已在 main，无新运行时代码分支需合并；不操作其他工作树 |
| Push / Worker 部署 | 本助手本轮不执行；须明确生产发布允许范围后执行并获取实际结果 |
| Secret 配置与维护激活 | 不读取本地 secret；配置 `MAINTENANCE_CONTROL_TOKEN` 与生产控制验证仍需单独授权 |
| 冻结、迁移、真实业务测试 | 分别保留 R15/R16、R19/R20、R22 的具体授权，不因豁免备份而提前 |

本轮没有备份恢复点：不能承诺迁移后回滚数据。Worker 版本回滚也不能被当作数据库结构或数据回滚。失败时保留错误状态，核对准确已应用前缀与结构，停止自动重试、清库或回滚；退出/恢复服务须按随后批准的窗口方案，不能盲目解除维护。若需数据重置或平台恢复，另行批准。

R13 已完成上述本地候选准备，仍未关闭：下一步明确生产发布和维护激活允许范围，并刷新候选对应生产证据，再按序进入 R14。R17/R18 本轮已获豁免，按序登记即可，不重新要求备份或独立存储位置。
