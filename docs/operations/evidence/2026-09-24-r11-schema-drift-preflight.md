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

R11 **部分完成**：本地 schema 防漂移和配置门禁已通过；生产侧仍缺 Dashboard 只读核对的准确候选版本、D1 实际 migration ledger 前缀、待迁移清单与同版本绑定验收。下一步只允许做这些只读核对；未经单独批准不得执行 `d1 migrations apply`、部署、迁移或修改生产配置。
