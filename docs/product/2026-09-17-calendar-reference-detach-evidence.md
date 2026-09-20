# 2026-09-17 日历关联删除修复：本地证据

范围：`codex/admin-audit-recovery`，生产 D1 catch-up 计划 Task 2。仅使用本地 Workerd/D1 与合成数据；未查询或写入生产、未导出备份、未部署、未提交或推送。不将此前通知/消息 500 判为已恢复，不提升交付总账 release/acceptance。

## 根因与修复

0042 的 `(task_id, member_id)` 和 `(project_id, member_id)` 复合外键使用 `ON DELETE SET NULL`，但 `member_id` 为 NOT NULL。删除存在日历引用的任务/项目时，外键动作尝试清空 owner，导致失败。

只追加 `migrations/0051_calendar_reference_detach.sql`，不修改 0001–0050：两个 BEFORE DELETE trigger 按 parent id + member_id 清空日历的可选 task/project 引用，保留日历本身与 owner、内容及另一关联。`updated_at` 取原值与当前数据库时间的最大值，不倒退；迁移安装本身不回填任何业务行。既有复合外键、NOT NULL 和授权规则保持。

0051 SHA-256：`30b4c77fc4e3198a1c6937adc0d95ba0c8bf142e707d670f0b12a233db47058d`。文件校验器验证全部 51 个 SQL，前 50 个仍匹配原先锁定的摘要。

## RED → GREEN

- 改成功断言并补回归后、追加迁移前：calendar/tasks/catch-up 3 文件 **7 失败、18 通过**。直接删除出现 `NOT NULL constraint failed: calendar_events.member_id`，任务 HTTP DELETE 返回 500 而不是 204。
- 追加 0051 后同组 **25 通过**；没有通过放宽 owner 约束或修改 API 预期掩盖问题。
- 新 catch-up 正向校验在脚本新增模式前失败，新增模式后正负测均通过。

## 覆盖范围

- 删除 task 或 project 只解绑当前成员日历对应字段；另一关联、所有其他字段及另一成员记录保留，时间戳不倒退，外键检查为空。
- 跨成员 task DELETE 返回 404；本人 DELETE 返回 204，同时保留日历和 VM，VM 原有解绑版本只递增一次。重放 DELETE 按现有合同返回 404，不二次变更 VM。
- 跨成员 project 引用与 NULL owner 仍被数据库拒绝。
- D1 batch 删除后续 CHECK 约束失败时，parent、日历 detach 和 VM detach 整体回滚。此项验证本地 batch 原子性，不声称完成生产恢复演练。
- 合成 0032 数据升级到 0051 保留 member/task/tag/role，并验证通知意图及讨论授权投影；菜单冲突仍中止，修正合成夹具后才续跑。
- 已有 0050 日历记录安装 0051 后逐字段不变，追踪账本重复调用不重复应用；之后删除引用成功。此 helper 不等于实际 Wrangler remote apply。
- 校验器新增 `--ledger-catchup-before <json-file>`（恰好 32 条）及 `--ledger-catchup-after <json-file>`（恰好 51 条）。缺行、超出范围、断号、错名、重复、重排、无时间、额外字段、错误 success、额外结果集均拒绝。错误输出不带输入内容。
- 旧 M1 before 仍只接受 3 条；after 保留历史 4/5/6/44–50，并支持当前 51 条，32 条不会被视为旧 M1 合法状态。

## 最终验证

| 命令 / 范围 | 实际结果 |
| --- | --- |
| `npx vitest run`：production-catchup-migration、review-notifications-migration、migrations、calendar、tasks、environments、notifications、discussions | 8 文件，168 项通过 |
| `npm run test:smoke` 主测试 | 51 项通过 |
| smoke 内的 i18n 测试与静态校验 | 13 项通过；434 keys / 55 placeholders / 6 files |
| `npm run verify:delivery-status` | 28 项通过，文档最终同步后重新运行 |
| `npm run verify:m1:migrations -- --files` | 51 个文件 hash 匹配 |
| `npm run typecheck` | 通过 |
| `git diff --check` | 通过 |

所有实际 shell 命令均通过 `rtk` 执行。Workerd 与 smoke 初次 sandbox 执行遇到 localhost listen EPERM；授权本地监听后重跑通过。测试没有改成 remote bindings，也没有调用 AI provider。

## 下一授权门

按上轮只读生产 32 条快照，本地完整升级候选为 0033–0051 共 19 个；本轮没有刷新线上状态，执行前须重查。下一步是独立授权的生产窗口与受限备份导出，随后另行批准迁移。备份正文不进入仓库、日志或对话；恢复整库不包含在备份/迁移授权中。

生产通知/消息 HTTP、真实双账号、完整用户旅程、代码版本对应关系仍待验收。保持[原生产验收报告](./2026-09-17-production-browser-acceptance.md)的阻塞结论，按[分步计划](../superpowers/plans/2026-09-17-production-d1-catchup.md)继续。
