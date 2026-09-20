# R03 — 后台与原始 D1 生命周期证据

日期：2026-09-20（Asia/Shanghai）。候选提交：`95bd921`（`feat: track guarded d1 lifecycle failures`）。

## 范围与边界

本证据只关闭恢复主线 R03 的本地实现与验证，不代表生产启用维护入口，也不代表 R04 流/取消/跨存储尾部工作完成。`src/index.ts` 仍使用 `createWorkerEntry({ mode: "legacy" })`；本轮没有生产迁移、部署、业务写入、备份或 `SECRETS_FILE` 读取/上传。

## 实现证据

- `WorkScope` 增加 `assertOpen`、固定不确定原因码、`markUncertain` 和按 scope 缓存的 D1 facade。sealed 后拒绝新的工作、原生调用和 facade 创建，不允许 scope 复活。
- `src/maintenance/d1.ts` 提供惰性 `prepare`/`bind`、`first`/`run`/`all`/`raw`、同 facade 归属校验的 `batch`；`exec`、`withSession`、`dump` 明确拒绝。原生执行失败由 scope 观察并保留不确定状态，成功的 null/空 rows/0 changes 不误报。
- guarded fetch/Cron 用实际 `DB` 与 `sessionDatabase` 包装；同一请求复用 facade，不同请求不复用。业务响应先返回原有状态，D1 失败或后台失败再由 scope 标记不确定。
- 成员 `last_seen`、session 清理和 automation nonce 清理在自身业务 catch 前登记原始 Promise；兼容既有 waitUntil 语义，同时把真实失败通知维护 scope。迟到失败不会在 sealed 后重新打开 scope。

## 红绿验证

以下命令均在本地执行，退出码为 0：

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 4 个文件，55/55 通过；包含 facade 惰性/归属/拒绝、scope sealing、真实 guarded entry 失败保留许可 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `npm run typecheck` | 通过 |
| `npx vitest run test/unit/members-service.test.ts test/unit/session.test.ts test/unit/automation.test.ts` | 3 个文件，76/76 通过 |
| `npm test` | 完整 smoke/unit/worker 回归通过；smoke 51/51，Worker 41 文件 636/636 |
| `npm run build` | Vite/Wrangler dry-run 通过；landing/build 97/97 通过 |
| `npm run verify:delivery-status` | 28/28 通过 |
| `git diff --check` | 通过 |

专项还覆盖了本地 D1 原生 `run`/`batch` 拒绝、同步 prepare 失败、嵌套 `waitUntil`、正常 400/403/404 业务响应，以及 late failure 的不确定完成结果。没有使用 source-only 断言替代真实 guarded entry 行为测试。

## 未覆盖与下一步

R04 仍未开始：流生产者、取消链、超时 race、R2/DO/VFS 跨存储尾部工作需要独立设计、测试和证据。生产维护入口仍保持 legacy，需另行授权后才能改变。
