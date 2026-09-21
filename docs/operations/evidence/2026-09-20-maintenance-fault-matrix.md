# R07 — 真实应用接线合成故障矩阵证据

日期：2026-09-20（Asia/Shanghai）。本记录关闭本地 guarded Worker 接线的合成故障矩阵，不代表生产所有版本、旧部署或外部写者已接入维护协调器。

## 矩阵覆盖

| 故障/时序 | 本地真实入口证据 |
| --- | --- |
| 关闭时零写入、静态/auth/API/Cron 全路径拒绝 | `tools/maintenance/entry.test.ts`：`denies static, auth and API requests...`、`rejects all HTTP paths and Cron before reading any business binding` |
| 慢请求、响应返回后仍有后台工作 | `tools/maintenance/lifecycle.test.ts`：`keeps a returned response active...`、`tracks run factories and holds Cron...` |
| 已开始 Cron、R2/D1 尾部排空 | `tools/maintenance/entry.test.ts`：`holds an already started real Cron chain...`、`runs the real bounded Cron sweep...` |
| 迟到/嵌套写入和封闭后禁止新 factory | `tools/maintenance/lifecycle.test.ts`：`tracks a late child...`、`refuses a late factory...`、真实合成 D1 drain 用例 |
| 原始失败被业务 catch、D1/R2/VFS/DO 失败保留不确定 | `lifecycle.test.ts`、`d1.test.ts`、`storage.test.ts` 负向矩阵 |
| 流断连、未消费、取消、上游错误、cancel 失败 | `tools/maintenance/stream.test.ts` 5 项流生命周期测试 |
| 协调器重启、活动孤儿许可和失联回复 | `coordinator.test.ts` 重启后 active 保留；`lifecycle.test.ts` 覆盖 acquire/completion reply 丢失 |
| 重复控制、旧 epoch/窗口和跨边界命令 | `coordinator.test.ts` 精确重试、`STALE_CONTROL`、`WINDOW_CONFLICT`、旧 completion 与隔离实例用例 |
| 未确认结果不放行 | `lifecycle.test.ts` 的 timeout、scope uncertainty、root/stream failure 和 lost completion reply 用例 |

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance -- --reporter=dot` | 6 个文件，63/63 通过 |
| `npm run typecheck` | 通过 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `npm run verify:delivery-status` | 30/30 通过 |
| `git diff --check` | 通过 |

合成测试中的 `ACTIVE_WORK`、`STALE_CONTROL`、`WINDOW_CONFLICT`、`PERMIT_MISMATCH` 等输出均为预期负向断言；测试退出码为 0。故障处理遵循“不确定就不放行”，没有 TTL、强制释放或自动恢复路径。

## 边界

矩阵运行在 `remoteBindings: false` 的本地 Workerd/Vitest harness，覆盖当前共享入口和合成 D1/R2/DO；生产 legacy 入口、其他 Worker 版本、手工 D1 API、控制台写入和外部凭证写者仍需 R09/R14/R16 单独核实。
