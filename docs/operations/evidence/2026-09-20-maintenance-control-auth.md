# R05 — 维护控制面授权与重放防护证据

日期：2026-09-20（Asia/Shanghai）。本记录只关闭合成维护 harness 的授权与重放防护，不代表生产维护入口启用或生产控制密钥已配置。

## 已完成切片

- `MaintenanceCoordinator.beginDrain` 和 `resume` 现在都要求显式的 `MAINTENANCE_CONTROL_TOKEN` 能力；缺少、错误或普通业务值会在任何窗口/epoch 校验和状态变更前返回 `CONTROL_UNAUTHORIZED`。
- 本地 harness 通过独立的合成 binding 注入控制能力，测试边界使用显式 authorized client；普通成员/session cookie、permit id、epoch 和 HTTP 请求不会自动获得维护控制权限。
- 原有窗口、epoch、重复命令、旧窗口、重启后孤儿许可、完成墓碑和容量上限逻辑保持不变；授权成功后仍要求窗口/epoch 严格匹配，旧命令不能重新打开新 epoch。
- 没有新增公开 HTTP 维护控制路由；生产 Wrangler 配置、生成 Env、迁移、Worker 入口和真实 secrets 均未修改。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance -- --reporter=dot` | 6 个文件，63/63 通过 |
| `npm run typecheck` | 通过 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `git diff --check` | 通过 |

专项输出中的 `ACTIVE_WORK`、`WINDOW_CONFLICT`、`STALE_CONTROL`、`CONTROL_UNAUTHORIZED` 等是被测试断言的预期负向 RPC 日志；测试进程退出码为 0，未产生 Vitest unhandled-error summary。

## 边界与未完成项

这是本地授权契约和重放防护证据。生产控制端仍未部署，外部写者/fleet fencing、容量回收、孤儿许可人工退出和真实停写仍属于 R06–R16，不能把本证据解释为生产 `FROZEN`。
