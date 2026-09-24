# R11 schema 防漂移预检证据

日期：2026-09-24（Asia/Shanghai）。本记录只覆盖本地候选和配置门禁，不执行生产迁移、写入、导出、恢复或部署，不读取或上传 `SECRETS_FILE`。

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

R11 **部分完成**：本地 schema 防漂移和配置门禁已通过，生产 migration ledger 前缀和唯一 pending migration 已获得 Dashboard 只读证据；仍缺当前候选 Worker 版本与生产 binding 的同版本验收，以及单独批准的 0051 迁移前置条件。下一步只允许补齐版本/binding 只读证据和迁移审批预检；未经单独批准不得执行 `d1 migrations apply`、部署、迁移或修改生产配置。
