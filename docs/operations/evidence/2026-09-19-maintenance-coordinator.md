# 本地维护协调器与生命周期验证

执行日期：2026-09-19（Asia/Shanghai）。分支：`codex/admin-audit-recovery`。
范围：用户确认的本地持久化准入/排空及合成生命周期测试子阶段。

## 结果与边界

- `src/maintenance/coordinator.ts`：SQLite Durable Object 持久化许可、维护窗口和 epoch；同步事务内关闭准入与登记工作，重启后保持状态。
- `src/maintenance/lifecycle.ts`：HTTP/Cron 先准入后调用处理器，跟踪根任务、已登记的后台/嵌套工作和响应体，全部成功才完成许可。
- `tools/maintenance`：独立配置，仅本地合成 DO/D1；不读取生产 Wrangler 配置，无公开控制 HTTP 路由。应用入口和生产 binding 未改动。
- `DRAINED` 仅代表该实例的登记工作为零，不证明真实数据库停写、全部署受控或跨存储一致性，不能作为生产备份窗口许可。
- 未执行生产查询、真实内容导出、迁移、恢复、部署、提交或推送。未读取/上传凭据文件。保留原工作树和既有改动。

## 红绿测试与问题修复

先用缺失行为/占位实现运行准入和生命周期用例，断言失败后实施。最初 Workerd 不支持测试配置的 `2026-09-01` compatibility date，改为已安装运行时支持的 `2026-08-08`；这是测试环境修正，不计作行为 RED，也没有升级依赖或生产配置。

首轮协调器行为通过后，直接把 RPC thenable 交给拒绝断言产生 Vitest 未处理错误；经原生 async Promise 归一化后消除。预期拒绝 RPC 仍会打印 `ACTIVE_WORK`、`STALE_CONTROL`、`PERMIT_REUSED` 等运行时 stderr，最终测试进程退出 0，且无 Vitest 未处理错误汇总；不将预期拒绝日志隐藏或说成没有日志。

自查新增畸形准入回复用例，实际观察到 `expected 503, received 200`。已修复为校验请求 ID 一致及 epoch 为非负安全整数后才运行 handler，并覆盖不同 ID、负数、小数、溢出和空对象。测试绑定类型放在独立 harness 中，不扩大生产 Env。

## 验证矩阵

| 层面 | 本地证据 |
| --- | --- |
| 准入与排空 | 关闭后拒绝新工作；已准入工作仍被计数；并发申请/关闭不丢许可 |
| 控制幂等与隔离 | 精确完成/恢复重试安全；旧 epoch/窗口不能打开新窗口；不同 DO 实例独立 |
| 持久化与资源边界 | abort/restart 后活动许可及关闭状态保留；10,000 条记录上限失败关闭；旧许可不能完成新 epoch 的工作 |
| HTTP/Cron | 维护中不调用 handler；背景注册失败不调用 handler；Cron 等待已登记子任务 |
| 后台/迟到工作 | Response 返回后仍计数；未完成子任务可登记后代；封闭后 run 不调用工厂 |
| 流 | 响应创建不算结束；EOF 不提前释放尚有工作的 producer；取消/错误保留不确定许可 |
| 故障 | 处理器异常、被调用者捕获的子任务失败、超时、准入回复丢失、完成请求失败均不误放行/抹除活动许可 |
| 完成回复丢失 | 服务端已完成时可为 DRAINED，客户端仍报告未确认；准入仍关闭，不自动恢复 |
| 合成 D1 | 在途延迟写在 drain 中完成后才清零；此后 HTTP/Cron 删除回调均被拒绝，记录保持不变 |

## 本轮实际命令

| 命令 | 结果 |
| --- | --- |
| `rtk proxy npm run test:ops:maintenance` | exit 0；2 文件、28 项通过 |
| `rtk proxy npm run typecheck` | exit 0 |
| `rtk proxy npm exec tsc -- --project tools/maintenance/tsconfig.json` | exit 0 |
| `rtk proxy npm run test:ops:d1-backup` | exit 0；21 项通过，仅合成归档/临时本地 D1 |
| `rtk proxy npm test` | exit 0；smoke 51 项、delivery contract 28 项；Worker 41 文件、636 项通过，包含 unit/i18n/UI 构建步骤 |
| `rtk proxy npm run verify:delivery-status` | 文档更新后重跑 exit 0；28 项通过，发布/验收维度未提升 |
| `rtk proxy git diff --check` | exit 0 |

完整回归沿用现有 `remoteBindings: false` 测试配置；配置加载仍打印 AI binding 通用警告，未据此修改生产绑定或调用远程 AI。没有执行完整 `npm run build`、生产 dry-run/deploy 或浏览器生产验收，不能从本地测试推断这些结果。

## 保持未完成的门禁

1. 真实 `src/index.ts` fetch/scheduled 入口接入，以及 auth、last_seen、session/automation 清理、stream/Agent DO/跨存储回调的完整写者审查。当前 wrapper 的子任务登记契约不会自动拦截裸计时器或脱离跟踪的任务。
2. 控制接口独立鉴权、数据库 binding 到唯一协调实例的映射、旧部署/外部写者与手工写凭据控制。当前许可 epoch 不是 D1 强制的写屏障。
3. 生产容量、可用性、成本/免费产品限制和安全压缩设计。10,000 条记录是保守本地上限，不是吞吐/平台配额承诺。完成记录不自动删，异常孤儿不 TTL 释放，当前不具备线上持续运行条件。
4. 实际运行时终止/客户端取消后的证据化恢复流程；现在未知工作继续阻塞。WebSocket 不支持。合成测试不等于真实部署终止或全网故障演练。
5. 受控远程只读传输验证、真实备份窗口及保管策略、真实恢复演练；全部另行明确授权。无独立生产备份，不解锁迁移。

后续按[维护设计](../d1-backup-maintenance-design.md)推进真实入口接入与写者审查；本证据不提升产品总账发布/验收状态。
