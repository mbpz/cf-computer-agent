# R13 维护发布候选预检与生产只读核对

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

生产 `0001–0050` / pending `0051` 为本日先前账本记录，本次续办未刷新 ledger；生产配置与发布链已在第 5 节刷新。执行迁移前仍须重新核对账本。

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


## 5. 2026-09-24 续办：生产发布链已刷新

用户“进入下一步”后，仅通过现有 Cloudflare Dashboard 标签页只读核对，未点击重新构建、部署、添加或编辑配置。

| 环节 | 本次实际观察 |
| --- | --- |
| 生产 Git | `cc715304a6c30af82ae9878d838ff5234015f31c`，main |
| Cloudflare build | `9e25da19-e303-49db-a420-2e423cb48d20`，成功 |
| 真实部署命令 | `npx wrangler deploy`；日志明确 `Success: Deploy command completed`，不是前面的 dry-run |
| Worker version | `da1a0382-8cd8-4250-93c1-dccc4d15c1cf` |
| 当前部署流量 | `100%` |
| 实际部署 binding | `KNOWLEDGE`、`AGENT_SESSIONS`、`MAINTENANCE`、`DB`、`AI`、`ASSETS`；`ALLOW_INSECURE_LOCAL=false` |
| 实际部署 trigger | `memory.crgmhrc.asia`、`*/5 * * * *` |
| Settings 交叉核对 | DB ID 与第 2 节一致，3 个 DO binding 齐备；兼容日期 `2026-07-26`、`nodejs_compat` |
| 维护激活配置 | 生产变量/密钥名称列表中没有 `MAINTENANCE_CONTROL_TOKEN`；未展开或读取任何密钥值 |

来源：Dashboard → memory-garden-agent → Deployments → Build #9e25da19，以及 Production Settings。实际部署日志区间 `22:45:05.504–22:45:16.520` 仅保留页面原始时间文本，不据此推断其时区。

本地开始于 `4906e933bed22233ab61a94f47316fa16748fef9`，main 工作区干净、相对本地 origin/main ahead 1。`git diff --name-only cc71530..4906e93` 仅 4 个 Markdown 文件，运行时代码、迁移及 Wrangler 配置不变；这说明已部署代码可作为维护激活基线，不表示本地文档提交已推送或发布，也不证明构建产物逐字节相同。本次无需为核对重复发布既有代码。

下一项待明确的范围：采用上述已部署基线，生成新的维护内部控制随机密钥并仅保存到此 Worker 的生产 Secret，启用 guarded fetch/Cron 后验证管理员 status/capacity。源码 `src/index.ts` 在 token 长度至少 16 时切换入口；`src/maintenance/coordinator.ts` 首次初始化会创建内部控制表/许可表，guarded 请求会登记工作，故不能称为纯配置保管或完全无写入。已有控制状态异常、容量耗尽或协调器故障可能拒绝请求；未验证前不能保证无服务影响。

此项仍待具体生产变更批准，不因“进入下一步”推定已授权新持久密钥。拟议范围不含 push、重复代码部署、begin-drain/resume、D1 迁移、业务测试写入或备份；不读取本地 SECRETS_FILE，不在聊天或 Git 中保存密钥值。R13 保持当前、R14 未执行；25 项中仍为 12 关闭（11 完成、1 豁免）、13 剩余。

本次文档更新验证：`npm run verify:delivery-status` 30/30，`node --test scripts/maintenance-production-entry-contract.test.mjs scripts/maintenance-admin-api-contract.test.mjs` 6/6，组合命令退出 0。均为本地合同检查，不是生产控制接口验收。
