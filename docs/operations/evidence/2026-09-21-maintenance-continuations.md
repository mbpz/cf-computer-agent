# R03 第 4 项：原始后台任务与完整并行分支

日期：2026-09-21（Asia/Shanghai）。在 `codex/admin-audit-recovery` 的既有隔离工作区原地执行；前三项基线已提交 `b408633`（`fix(maintenance): track request-scoped D1 operations`）。该基线提交前，本轮重新执行 93 项 maintenance、类型检查及 diff 检查通过。

## 范围与实现

- 成员 last_seen、session 清理、nonce 清理在业务 catch 之前登记原始任务 factory；保留原响应、warning 和 waitUntil 行为。没有 scope 时保持 legacy 行为。
- guarded 入口在准入后注入本次请求的 scope，覆盖外部依赖中可能残留的 scope；app 显式传递给相关服务和路由，不使用全局请求状态。
- `parallelWork` 在执行之前登记每个完整异步分支，覆盖 await 后的 continuation。已知 `AppError` 4xx 不单独标记不确定；未知错误和 5xx 保留许可。原始 D1 facade 独立观察底层失败，不能由业务错误转换抹掉。
- guarded 聚合失败后等待其余分支结束，再向调用方抛出最早错误，避免 app 的 finally 在兄弟分支仍运行时释放共享请求资源。不增加超时或强制释放；无 scope 的 legacy 路径保留原 fail-fast。
- 覆盖 Library 两组并行读取及 9 处引用路由、Today、Review、publication 目标检查与 pending intents、Graph 聚合与 relations/timeline。纯摘要计算的并行不在本次范围内。

## RED → GREEN

1. 08:05:15：三项成员/session/nonce 故障测试均失败；业务 200 断言通过，但许可被错误释放。测试直接使用本地原生 D1，隔离服务登记逻辑与已有 D1 facade，故障来自真实 SQL trigger。
2. 08:06:22：原始任务登记后，上述三项通过。
3. 08:08:05：Today 四项并行测试均失败；兄弟分支未完成时预期 active=1，实际 active=0，不是导入或启动失败。
4. 08:13:41：实现后上述七项组合通过；随后扩展正常/legacy、Review、Graph、Library、4xx/5xx、资源收尾以及连续请求 scope 隔离测试。

## 当前验证

| 命令 | 结果 |
| --- | --- |
| `npm run test:ops:maintenance` | 08:20:43 开始，7 files / 118 passed，7.81s，exit 0 |
| `npm run test:unit` | 08:19:44 开始，229 files / 2113 passed，112.56s，exit 0 |
| `npm run test:worker` | 08:22:14 开始，47 files / 656 passed，20.45s，exit 0；含 UI build |
| `npm run typecheck` | 最终代码检查 exit 0 |
| `npx --no-install tsc --noEmit --project tools/maintenance/tsconfig.json` | 最终专项测试类型检查 exit 0 |
| `npm run verify:delivery-status` | 文档更新后 30/30 passed，exit 0 |
| `git diff --check` | exit 0 |

首次受限环境中的 unit 命令因本地监听/日志权限 EPERM 失败，获得本地测试权限后原命令重跑成功。故障注入用例中的预期 Coordinator stderr、既有 AI binding 提示和 UI chunk-size 提示不代表生产异常，也不能用作远程验收证明。maintenance harness 禁用 remote bindings，AI 为合成端口并拒绝意外出站请求。

## Checklist 边界

- [x] 前三项已验证并提交 `b408633`。
- [x] R03 第 4 项完成本地实现与验证；本证据随代码提交，提交编号以 git 记录为准。
- [ ] 第 5 项仍须完成真实 app 入口的未知错误分类、正常 400/403/404、嵌套 waitUntil 与迟到调用的集成核验。现有服务层覆盖不能代替完整入口证明。
- [ ] R03 父项保持开放：恢复清单仍为 25 项、2 关闭、23 剩余。
- [ ] R04 未开始；流、取消、超时和跨存储仍为独立步骤。

本轮未 push、未合入 main、未 deploy；生产入口仍为 legacy。未改生产配置、生成 Env 或迁移，未读取 secrets 或操作生产资源。按已批准计划不委派，代码由执行者自行核对，不声称独立代码审查。产品四维状态计数保持原值。
