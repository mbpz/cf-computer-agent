# R04 进行中 — 流与存储尾部最小切片证据

日期：2026-09-20（Asia/Shanghai）。本记录不关闭 R04，仅记录已完成的本地最小纵向切片。

## 已完成切片

- Agent 流 pump 在启动前通过 `WorkScope.run` 登记；正常 EOF、生产者错误和消费者取消均不会把后台生产者变成 detached `void`。取消会等待 `reader.cancel`，并先将 scope 标记为不确定；迟到的 Durable Object 终止/完成调用仍在同一 producer 链中。
- guarded 本地入口新增真实 stream harness：客户端只读取首块后取消，维护协调器仍保持 `active=1`，证明取消完成不等于安全释放。
- Asset sweep 对每项意外 D1/R2 处理失败登记 `onFailure`，即使 `processDue` 为了继续处理剩余作业而捕获异常，外层维护 scope 仍保守保持不确定。
- 保留已有解析超时语义：纯转换尾部不进入 success 写入；既有资产单元回归继续验证超时清理和可重试恢复。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 6 个文件，57/57 通过 |
| `npm run typecheck` | 通过 |
| `npx tsc --noEmit --project tools/maintenance/tsconfig.json` | 通过 |
| `npm test` | 完整 smoke/unit/worker 回归通过 |
| `npm run build` | Vite、97/97 landing/build、secret scan、legacy audit、Wrangler dry-run 全部通过 |
| `git diff --check` | 通过 |

## 未完成

R04 仍保持开放：需要继续覆盖不消费流、上游 error、可控迟到生产者、取消链失败、typed R2/DO/VFS/RPC 边界和跨存储不确定性。当前没有生产维护入口启用、生产迁移、部署或真实资源操作。
