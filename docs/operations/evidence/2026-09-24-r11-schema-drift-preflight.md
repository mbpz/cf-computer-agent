# R11 schema 防漂移预检证据

日期：2026-09-24（Asia/Shanghai）。本记录覆盖本地候选、配置门禁与 Dashboard 生产只读发布核对，不执行生产迁移、写入、导出、恢复或部署，不读取或上传 `SECRETS_FILE`。

## 本地候选校验

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| forward migration 文件与批准 hash | `npm run verify:m1:migrations -- --files` | `[pass] migration-files count=51` |
| 维护发布合同、migration ledger 负测、异常新增 | `npm run test:ops:m1` | **34 passed，0 failed，0 skipped** |
| Worker 配置与生产/preview URL、binding、签名 smoke 合同 | `node --test scripts/smoke.test.mjs` | **8 passed，0 failed，0 skipped** |

`test:ops:m1` 已覆盖缺 migration、重命名/额外/重排 ledger、错误或未成功 ledger、旧 hash 变化以及 legacy pending 非零等失败闭合；smoke 合同核对 `wrangler.jsonc` 的生产域名、workers.dev/preview 关闭、D1 binding、Durable Object binding、Assets 和 Cron 约束。

第一次在默认沙箱运行时因本地 listener 被拒绝（`listen EPERM`）而中断；随后在允许绑定 `127.0.0.1` 的本地测试权限下按原命令重跑，以上结果才计入证据。该权限只用于本机 mock server，不代表生产网络访问。

## 当前候选配置摘要

- Worker：`memory-garden-agent`；源码入口 `src/index.ts`；候选当前提交由 Git 记录；
- D1 binding：`DB` → `memory-garden-control-plane`；database id 为仓库配置中的固定目标；迁移目录为 `migrations`；
- Durable Objects：`KNOWLEDGE`、`AGENT_SESSIONS`、`MAINTENANCE`；
- Assets：`ASSETS`，目录 `frontend/dist`；
- 生产路由：`memory.crgmhrc.asia` 自定义域名；`workers_dev=false`、`preview_urls=false`；
- Cron：`*/5 * * * *`；
- 本轮未执行 Wrangler 远程命令。

## R11 当前判定

## Dashboard 生产 migration ledger 核对

用户于 2026-09-24 在已登录 Cloudflare Dashboard → D1 `memory-garden-control-plane` Console 执行：

```sql
SELECT id, name, applied_at FROM d1_migrations ORDER BY id;
```

结果为连续 `id=1..50`，最后一项为 `0050_admin_review_notifications.sql`；未出现 `0051_calendar_reference_detach.sql`。Dashboard Console URL 中的 database id 为 `653c9e43-c7ad-45b8-a109-bc144843bee7`，与当前 `wrangler.jsonc` 的 D1 binding 目标一致。该查询只读取 migration 元数据，不读取业务正文。

本地候选迁移为 51 条，`0051_calendar_reference_detach.sql` 的 SHA-256 为：

```text
30b4c77fc4e3198a1c6937adc0d95ba0c8bf142e707d670f0b12a233db47058d
```

因此当前准确差异是：**生产已应用 0001–0050，本地候选存在 0051，生产 pending=1**。不得把该差异视为失败重试，也不得在没有单独生产迁移批准、新鲜备份和停写前置条件的情况下执行 `d1 migrations apply`。

R11 **已关闭（2026-09-24 用户确认分阶段关闭边界后）**：本地 schema 防漂移和配置门禁已通过；生产 migration ledger 前缀和唯一 pending migration 已有本日先前的 Dashboard 只读证据；本轮已补齐下面的当前候选版本/binding 同版本证据。生产 ledger 本轮未重新查询，执行前仍须刷新。0051 的新鲜备份、冻结和准确批次批准未满足，不能执行迁移。

## 本轮追加：100% 发布链与同版本 binding

用户确认“流量100%  继续完结所有”后，于 2026-09-24 使用现有已登录 Dashboard 标签页进行只读核对：

| 项目 | 本轮观察 |
| --- | --- |
| 本地候选 | `main`，`1df36d4c2508c8dcc3c9b3f88576759cdd85a4e3`；核对前工作树干净 |
| Cloudflare Build | `40614a07-aa1d-464f-be44-9dd40c6216b7`，对应同一完整 Git commit；成功 |
| 构建 / 部署命令 | `npm run build` / `npx wrangler deploy` |
| 生产版本 | `122fa777-2c51-4975-afa6-a589807e4498` |
| 生产流量 | Deployments 的可用部署和版本历史显示 `122fa777` 为 **100%** |
| 同次实际部署日志 | `KNOWLEDGE (KnowledgeBase)`、`AGENT_SESSIONS (AgentSession)`、`MAINTENANCE (MaintenanceCoordinator)`、`DB (memory-garden-control-plane)`、`AI`、`ASSETS`，`ALLOW_INSECURE_LOCAL=false` |
| 触发器 | 同次实际部署日志显示自定义域 `memory.crgmhrc.asia`、Cron `*/5 * * * *` |
| 生产 Settings DB | `DB` 链接目标为 `653c9e43-c7ad-45b8-a109-bc144843bee7`，与候选配置一致 |
| 维护激活 | 生产 Runtime variables and secrets 列表未配置 `MAINTENANCE_CONTROL_TOKEN`；仅查看名称和加密占位，未读取值 |

来源页面：

- `https://dash.cloudflare.com/e22882c8790f764e3545d1b778e550c8/workers/services/view/memory-garden-agent/production/deployments`
- `https://dash.cloudflare.com/e22882c8790f764e3545d1b778e550c8/workers/services/view/memory-garden-agent/production/builds/40614a07-aa1d-464f-be44-9dd40c6216b7`
- `https://dash.cloudflare.com/e22882c8790f764e3545d1b778e550c8/workers/services/view/memory-garden-agent/production/settings`

构建日志同时包含 dry-run 和实际部署输出；上表采用实际 `Executing user deploy command` 之后的 binding、`Current Version ID` 与成功结果，不把 dry-run 当成部署证据。日志显示的时分秒未单独确认时区，不转换成绝对发布时间。

### 本轮重新执行的本地验证

```sh
rtk proxy sh -c 'npm run verify:m1:migrations -- --files && npm run test:ops:m1 && node --test scripts/smoke.test.mjs'
```

- 默认沙箱第一次运行：migration-files 51 通过；发布合同 27 通过、7 个因 `listen EPERM 127.0.0.1` 失败，退出 1；后续 smoke 未执行。此轮不计为通过。
- 经本机 listener 权限批准后，原命令重跑：migration-files **51**，发布合同 **34/34**、smoke **8/8**，总退出码 **0**。
- 本轮 `shasum -a 256 migrations/0051_calendar_reference_detach.sql` 与前述批准 hash 一致。
- 全部为本地合成/合同验证；不等于生产 API、完整应用回归或用户验收。

## 已批准的顺序依赖修正与 R11 关闭

原 R11 文字要求等待新鲜备份和独立迁移批准，但主线将真实备份安排在 R17、隔离恢复安排在 R18、准确迁移批次批准安排在 R19，同时要求严格按顺序执行，形成循环依赖。

2026-09-24，向用户明确提出“将 R11 按防漂移检查及发布对齐证据齐备关闭，不代表 0051 已迁移；备份、停写、迁移批准仍保留在后续步骤，生产操作逐项授权”，用户回复 **“同意”**。

因此 R11 的获准关闭边界为：

- [x] 本地 migration hash、失败闭合合同和配置 smoke 有执行通过证据。
- [x] 最近生产 migration ledger 差异已明确记录为 `0001–0050`、唯一 pending `0051`，执行前必须刷新。
- [x] Git candidate → Cloudflare build → production version → 100% 流量链路和同版本 binding 证据齐备。
- [x] 用户确认将真实备份、隔离恢复和准确迁移批准保留在 R17–R20，不以此循环阻塞 R11。

R11 已关闭，主线为 **11/25 完成，14 项剩余，当前 R12**。进入 [R12 备份保管与隔离恢复预检](2026-09-24-r12-backup-custody-preflight.md)。

本次同意只覆盖以上关闭边界及进入 R12，不授权 commit、push、部署、配置 secret、停写、真实内容导出、迁移或恢复。`pending=1` 不变；没有声称 schema 已对齐、维护已激活、已生成生产备份或整体验收完成。
