# R04 — 流、取消、超时与跨存储生命周期证据

日期：2026-09-20（Asia/Shanghai）。候选仍为本地维护入口；本记录关闭 R04 的本地实现与验证范围，不代表生产维护入口启用。

## 已完成切片

- Agent 流 pump 在启动前通过 `WorkScope.run` 登记；正常 EOF、生产者错误、消费者取消、完全不消费和 `reader.cancel` 失败均不会把后台生产者变成 detached `void`。取消会等待 `reader.cancel`，并先将 scope 标记为不确定；迟到的 Durable Object 终止/完成调用仍在同一 producer 链中。
- guarded 本地入口新增真实 stream harness：正常 EOF 后 permit 释放；取消、上游错误、未消费和取消链失败均保持 `active=1`。
- Asset sweep 对每项意外 D1/R2 处理失败登记 `onFailure`；创建/取消/解析失败时的补偿删除也会登记失败，即使 `processDue` 为了继续处理剩余作业而捕获异常，外层维护 scope 仍保守保持不确定。
- 纯 AI/解析 timeout 只结束业务等待，不启动 success continuation；可控迟到解析完成后不会产生 `parsed/*` 成功写入。
- typed VFS/Durable Object 入口在 transport/RPC 异常被映射前调用 failure observer；明确的领域拒绝仍保持原有 AppError 语义，不使用通用 Env proxy，也不宣称跨存储原子性。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 6 个文件，62/62 通过（流/取消/迟到/存储故障矩阵） |
| `npm run typecheck` | 通过 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `npm test` | 完整 smoke/unit/worker 回归通过 |
| `npm run build` | Vite、97/97 landing/build、secret scan、legacy audit、Wrangler dry-run 全部通过 |
| `git diff --check` | 通过 |

## 边界

R04 关闭的是本地 guarded 入口和合成资源生命周期证据。生产入口仍为 legacy；没有生产维护入口启用、生产迁移、部署或真实资源操作。R05 维护控制面授权与重放防护仍未开始。
