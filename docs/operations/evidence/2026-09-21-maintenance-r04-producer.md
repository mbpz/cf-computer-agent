# R04 第 1 子项：真实 Agent 流生产者与最终持久化

日期：2026-09-21。分支：`codex/admin-audit-recovery`。
基线：`7ea7bee0c787bd5e1c2d7188f48cbdd973081ef8`，开工时工作树干净，无遗漏的待提交内容。本证据随实现提交，精确候选为包含本文的 Git 提交。

## 授权与范围

用户要求“有需要提交的提交下，然后进入下一个checklist”。依照[顺序清单](../2026-09-19-remaining-work-checklist.md)和[获准实施计划](../../superpowers/plans/2026-09-20-maintenance-entry-integration.md)，R03 已提交并关闭后进入 R04 第 1 子项。不委派、不推送、不合并 main、不部署、不读 secrets，不改生产配置、生成 Env 或迁移。

本轮只关闭生产者登记/最终落库子项。R04 的独立 cancel 链、超时分类、typed R2/DO/VFS 原始失败观察和完整故障矩阵仍开放，R05 及后续没有启动。恢复主线仍为 25 项、3 关闭、22 剩余。

## 修复与真实边界

- `src/app.ts` 将请求专用 `workScope` 传给 `src/routes/agent.ts`；原计划中的 `src/agent/service.ts` 不存在，已校正路径。
- 流的完整生产者 factory 在启动前由 `scope.run` 登记，覆盖读取、解析、`completeTurn` / `terminateTurn` RPC 和最后清理。无 scope 的 legacy 入口不接入维护协调器。
- 原始 Promise 的拒绝由 scope 先观察，再通过 `controller.error` 通知消费者；原始异常对象不被替换为成功。取消后不再次 close 已取消的流；终止 RPC 的非成功结果也不冒充成功。
- 响应消费与生产者是独立完成条件。取消使许可保持不确定，但不能让宿主的 scope 完成等待先于生产者的最后持久化。若 completeTurn 已在取消前启动，等待已开始的写入结束，不声称取消会回滚它。

Workers 最佳实践核对使用官方 `@cloudflare/workers-types@5.20260921.1` 的 `UnderlyingSource.start`、reader.cancel 和 ExecutionContext 签名；仅下载到临时目录，不更换项目依赖或 compatibility date。生命周期登记不意味着无限后台执行或持久任务保障。

## 测试证据

新增 `tools/maintenance/stream.test.ts` 使用真实 Worker 入口、D1 成员/session、Agent 路由、SQLite AgentSession DO 和协调器；AI 输出为合成流，仅在选定 RPC 边界注入可控 gate/故障。scope spy 仅观察原始调用结果，不替换登记/结算实现，无 sleep 或生产网络调用。

1. RED：两个迟到持久化用例均失败，`completeTurn` / `terminateTurn` 尚待 gate 时，`waitOnExecutionContext` 已结束（预期 false，实际 true）；真实 turn 仍 active。这不是 HTTP 或环境失败。
2. GREEN：登记整个 factory 后两个用例通过。
3. 扩展共 7 项：取消时 complete/terminate 迟到（2）、正常 EOF 的立即消费/暂不消费（2）、complete/terminate 原始失败（2）、上游读取失败（1）。成功路径回读真实 assistant 消息；取消/失败保留许可；原始拒绝身份被断言。补充测试编写时修正了 listMessages 必需分页参数及倒序结果预期，没有因此改业务行为。

已执行命令（均经 `rtk proxy`）：

| 命令 | 结果 |
| --- | --- |
| 基线 `npm run test:ops:maintenance` | exit 0，8 files / 135 tests |
| RED `npm run test:ops:maintenance -- tools/maintenance/stream.test.ts` | exit 1，2 failed，均为过早完成 |
| GREEN 同命令 | exit 0，2 passed |
| 完整 `npm run test:ops:maintenance` | exit 0，9 files / 142 tests |
| `npm run typecheck` | exit 0 |
| `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` | exit 0 |
| `npm test` | exit 0；smoke / i18n / delivery、unit 229 files / 2113 tests、worker 47 files / 656 tests；包括 pretest:worker UI 构建 |
| 更新文档后 `npm run verify:delivery-status` | exit 0，30 passed |
| 提交前再次 `npm run test:ops:maintenance` | exit 0，9 files / 142 tests |
| `git diff --check` 与只读清单/相对链接断言 | exit 0；85 个相对链接存在、25 项连续、3 关闭 / 22 剩余、R04 仅 1/5 子项关闭 |

完整应用回归日志：`/tmp/cf-r04-agent-regression-20260921.log`（本地临时证据，不依赖它才能理解本文件）。维护测试中协调器拒绝的异常日志是已有负向用例。应用回归打印已有 AI binding 提示；本轮新增测试明确使用独立本地 harness 与合成 AI，不以日志提示当作生产验证。

## 下一步与未完成边界

- [x] R04.1：真实生产者启动前登记，等待最终持久化并观察原始失败。
- [ ] R04.2：分别登记响应/生产者 cancel 链，等待 reader.cancel，不 detached、不互等；覆盖慢 cancel 与取消拒绝。
- [ ] R04.3：逐项分类超时 race 与迟到可写 continuation。
- [ ] R04.4：typed 跨存储边界及原始失败观察。
- [ ] R04.5：完整真实合成资源故障矩阵与父项收口。

特别是现有 producer cancel 中 `void activeReader?.cancel(reason)` 和 response wrapper cancel 的独立登记尚未改动，不能据此声称取消链已安全闭合。生产入口仍 legacy，未新增或启用维护 binding；没有生产冻结、备份、迁移或真实用户验收证据。
