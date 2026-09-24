# R04 第 2 子项：响应与 Agent 取消链独立登记

日期：2026-09-22。分支：`codex/admin-audit-recovery`。
基线：`57cca2e`（`fix(maintenance): track agent producers through final persistence`），开工时工作树干净，没有待补提交的改动。精确候选为包含本文的 Git 提交。

## 授权与范围

用户要求“有需要提交的提交下，然后进入下一个任务”。依照[顺序清单](../2026-09-19-remaining-work-checklist.md)和[获准实施计划](../../superpowers/plans/2026-09-20-maintenance-entry-integration.md)，继续 R04.2。本轮限本地合成资源实现与验证，不委派、不推送、不合并 main、不部署、不读 secrets；不改生产配置、生成 Env、依赖或迁移。

## 修复与边界

- 响应 wrapper 在拒绝响应 lifetime 之前，用 `scope.run` 登记整个取消 factory，再返回该 Promise。这样响应已经取消也不会使 scope 先于底层取消链封闭，取消中的嵌套 continuation 仍被追踪。
- Agent 同步标记断连并捕获当前 reader，独立登记取消 factory，等待并返回 `reader.cancel(reason)`；移除 detached `void`。取消链不等待 producer，producer 也不等待取消链，两个 lifetime 分别追踪。
- 慢取消、取消失败均不等同于完成证据：宿主等待尾部完成，消费者取消的许可仍保留为不确定。原始错误在响应和 Agent 两个边界分别被观察，不因消费者 catch 变成成功。
- legacy 路径不接入维护协调器，但同样返回可等待的取消 Promise，并传递取消失败；没有声称 legacy 具有 guarded 生命周期保证。
- 不承诺回滚取消前已启动的持久化；不通过超时清零许可；不把生命周期登记当作无限后台运行或持久任务保障。

Workers API 核对：只读确认最新 `@cloudflare/workers-types@5.20260921.1`，使用临时归档中的 `UnderlyingSource.cancel` / `ReadableStreamDefaultReader.cancel` 签名，并获取 Cloudflare 官方 Workers 最佳实践。不更新项目依赖、compatibility date 或 Wrangler 配置。

## 测试证据

测试使用真实本地 Worker 入口、认证 D1、Agent 路由、SQLite AgentSession 与维护协调器。合成 AI 流只在取消/RPC 边界加可控 gate 和故障；没有 sleep 或生产网络调用。scope spy 仅观察真实登记结果，不替换实现。

1. 基线：maintenance 9 files / 142 tests passed。
2. RED：新增 5 项全部按预期失败，原有 29 项通过。两个 response 尾部用例在 cancel gate 尚未放行时 scope 已结束；两个 Agent 用例在底层取消未完成时 consumer cancel 已返回；取消失败用例同样提前结束，并暴露原有 detached cancel 的 1 个 unhandled rejection。
3. 最小修复后，相关 2 files / 34 tests 全部通过，无该 unhandled rejection。
4. 扩展到本轮新增 8 项：response 取消的成功/失败尾部及嵌套 continuation（2）；Agent 未消费、已消费一块、pending read 时取消（3）；legacy 延迟取消成功/失败（2）；两个取消边界同时观察原始拒绝（1）。
5. Agent 慢取消用例回读真实 turn 已 terminated、无 assistant 消息，而 cancel 与宿主仍未结束；原有迟到 complete/terminate 用例覆盖相反顺序：cancel 可以先完成，producer 继续持有生命周期，避免互等。最终被取消的 guarded 请求仍 active=1/DRAINING。

已执行命令（均经 `rtk proxy`）：

| 命令 | 结果 |
| --- | --- |
| 基线 `npm run test:ops:maintenance` | exit 0，9 files / 142 tests |
| RED `npm run test:ops:maintenance -- tools/maintenance/lifecycle.test.ts tools/maintenance/stream.test.ts` | exit 1，5 failed / 29 passed，1 个原有 detached 取消拒绝 |
| GREEN 同命令 | exit 0，2 files / 34 tests |
| 扩展后的 `npm run test:ops:maintenance` | exit 0，9 files / 150 tests |
| `npm run typecheck` | exit 0 |
| `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` | exit 0 |
| `npm test` | exit 0；smoke 56 / i18n 13 / delivery 30；unit 229 files / 2113 tests；worker 47 files / 656 tests；包括 pretest:worker UI 构建 |
| 更新文档后 `npm run verify:delivery-status` | exit 0，30 passed |
| `git diff --check` 与清单/相对链接检查 | exit 0；5 份文档 91 个相对链接有效，R01–R25 连续，3 关闭 / 22 剩余，R04 为 2/5 |

完整回归日志：`/tmp/cf-r04-cancel-regression-20260922.log`（本地临时文件）。维护协调器负向测试已有拒绝异常日志；完整应用测试有既有 AI binding 提示。本轮新增测试明确使用独立合成资源 harness，不以这些提示证明访问或验证过生产。

## 收口游标

- [x] R04.1：生产者及最终持久化，已提交 `57cca2e`。
- [x] R04.2：取消链独立登记、等待与失败观察；专项、类型及完整回归通过。
- [ ] R04.3：分类 timeout/race，验证迟到结果不启动 success 写入。
- [ ] R04.4：typed R2/DO/VFS 原始失败边界。
- [ ] R04.5：完整故障矩阵与 R04 父项收口。

R04 父项未关闭；恢复主线仍为 25 项、3 关闭、22 剩余。R05 及后续未启动，生产仍 legacy，交付总账四维状态不提升。
