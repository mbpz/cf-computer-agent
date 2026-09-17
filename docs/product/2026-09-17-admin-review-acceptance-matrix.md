# D02-R2-D 审核故障与权限验收矩阵

日期：2026-09-17。范围：`codex/admin-audit-recovery` 工作区，基于 `e4666d2` 加未提交的 C/D 改动。本文仅记录本地自动化与验收条件，不是部署或真实登录验收证明。

计划：`docs/superpowers/plans/2026-09-17-admin-review-acceptance-matrix.md`。设计：`docs/superpowers/specs/2026-09-16-admin-review-write-recovery-design.md`。

## 本批变化

- `test/worker/m1-publication.test.ts`：发布并发、发布/驳回竞争、DO 回执丢失和最终事务条件失败补通知数量断言；新增最终 D1 batch 成功但响应丢失的恢复测试，重建服务、重放、索引恢复均不替换或重复通知。
- `test/worker/m1-api.test.ts`：新增三种决定的参数化 HTTP 全流程。真实测试会话分别代表管理员、提交者、第二成员；检查决定重放、通知 type 分页、收件人隔离、已读幂等、提交列表/管理员详情授权，以及禁用成员后的四个入口拒绝。
- D 批无生产逻辑、依赖或 schema 变更；C 已有的 0050 迁移不因本次测试而视为远程完成。

## 故障及隔离映射

以下名称均可作为 Vitest `-t` 的定位片段。`publication` 为 `test/worker/m1-publication.test.ts`，`HTTP` 为 `test/worker/m1-api.test.ts`。

| 设计要求 | 可复跑证据 | 本地结果与边界 |
| --- | --- | --- |
| 同载荷并发和服务重建 | publication: `converges concurrent publishers`、`deduplicates concurrent normalized`、`emits exactly one private submission notification` | 决定/审计/通知各一次；C 覆盖三种结果，D 补发布并发通知断言 |
| 不同载荷和不同决定竞争 | publication: `stores the exact normalized patch`、`preserves the original`、`allows only one winner when different review decisions race`、`lets an in-flight publication finish` | 冲突不覆盖原回执，不产生第二条通知 |
| 不同审核人 | publication: `preserves the original` 的 reviewer 分支 | 先禁用旧管理员，再创建新管理员，验证交接后的冲突重放；不是两个同时活动管理员竞争，现有 schema 只允许一个活动管理员 |
| DO 已写入但回执丢失 | publication: `recovers an actual DO write whose response was lost` | D1 pending_content 时无 review/audit/notice；DO 重建后恢复为各一次，读取原始内容一致 |
| D1 决定成功但响应丢失 | publication: `recovers %s after a real D1 commit loses its response`、`recovers a committed finalize batch whose response is lost` | 覆盖驳回、要求修改及发布；发布真实 batch 完成后抛错，权威重读并返回同 revision；重建服务后通知整行不变 |
| 最终事务失败 | publication: `rolls back every finalization row`、`conditional collection guard changes zero rows`、`rolls back %s when notification insertion fails` | 依赖审计、目标条件、通知写入失败均回滚；修复依赖后可恢复，失败时不留下决定/通知半成品 |
| 索引暂时失败后恢复 | publication: `keeps the revision readable when FTS fails`、`recreates services to recover pending-content, pending-index, and running-index` | 发布与索引状态分离；索引恢复不创建新决定，FTS 故障恢复的通知整行保持不变 |
| 三种决定、三种身份、撤权 | HTTP: `isolates the complete`（publish/reject/request-revision 三例） | 收件人 total=1，payload={}；第二成员/管理员 inbox=0、跨收件人 read=404；管理员详情 200，普通身份 403；成员禁用后 list/summary/read/mine 均 403 MEMBER_DISABLED |
| 点击时重新校验目标 | `test/worker/notifications.test.ts` 的当前目标授权测试；`test/unit/frontend-notifications-route.test.tsx`: `revalidates the target on open` | 所有者变更、目标删除/撤权后不允许凭历史通知跳转；历史通知可脱敏显示 |
| 导航后的迟到响应与权限丢失 | `frontend-notifications-route.test.tsx`: `does not navigate after an in-flight open`、`clears protected state`、`ignores late ordinary open failures`；`frontend-review-detail-route.test.tsx`: `does not apply an old decision`、`removes private content` | 旧页面请求不得覆盖/导航新页面，401/403 清受限状态；均为路由 DOM 自动化，不等于浏览器手工验收 |
| 明确的手动重试、说明和语言 | `frontend-review-detail-route.test.tsx`: `keeps the exact note payload`、`preserves unknown-operation replay while the existing locale runtime switches language`、`reloads a conflict`；`frontend-notifications-page.test.tsx`: `both locales` | 未知结果只允许原载荷显式重试；冲突只重读；自动化覆盖双语文案，不替代键盘/主题/真实设备 |

## 新鲜验证记录

1. 基线：publication / notifications / HTTP 三文件 **143 passed**。
2. 新增用例后：publication / HTTP 两文件 **132 passed**，本批新增四个测试实例。
3. Mutation：临时移除发布事务的通知 INSERT，定向三个测试 **3 failed / 129 skipped**，均明确因期望通知 1、实际 0 而失败。随后恢复原生产行；这是对已有行为的测试敏感性验证，不是声称修复了生产缺陷。
4. 恢复后联合回归：以下命令 **15 files / 341 passed**。

```sh
npx --no-install vitest run \
  test/worker/m1-publication.test.ts test/worker/notifications.test.ts \
  test/worker/review-notifications-migration.test.ts test/worker/migrations.test.ts test/worker/m1-api.test.ts \
  test/unit/frontend-notifications-page.test.tsx test/unit/frontend-notifications-route.test.tsx \
  test/unit/frontend-notifications-data.test.ts test/unit/notifications-service.test.ts test/unit/publication-service.test.ts \
  test/unit/frontend-review-detail.test.tsx test/unit/frontend-review-detail-route.test.tsx \
  test/unit/frontend-review-detail-data.test.ts test/unit/frontend-admin-review-data.test.ts \
  test/unit/frontend-moderation-pagination-routes.test.tsx
```

5. `npm run typecheck`：初次发现本批 `scalarCount` 测试 helper 表名 union 未包含 notifications，补齐后通过。该命令不等于整个 frontend 严格类型检查；历史 frontend strict 诊断不在此声明清零。
6. 文档同步后：`npm run test:smoke` 退出 0（smoke 49、i18n 13、delivery 28 全通过，i18n 静态校验通过）；`npm run verify:workbench-maturity` 13 passed；`git diff --check` 通过。

Workerd 有 AI binding 的通用警告，HTTP 测试使用已有 fake AI，不调用生产 AI。publication 清理测试仍输出其既有的 missing-file 异常日志，测试进程退出 0；不能把该日志描述为本批没有任何运行日志。

## 未完成的真实交互与发布门槛

本次浏览器 inventory 返回：Mac 锁屏且不能自动解锁，in-app browser 没有标签页。未绕过锁屏、未读取凭据、未伪造真实登录。以下均保持开放：

- [ ] 解锁 Mac 后，在明确对应此候选版本的本地/预发布页面完成真实管理员及成员登录。
- [ ] 管理员实际处理三种决定，提交者收到通知、打开正确目标并已读；第二成员无访问权限。
- [ ] 中英文分别检查失败恢复、审核说明、通知文案和完整数字分页。
- [ ] 键盘 Tab/Enter/Escape、弹窗焦点恢复、深浅主题、桌面和移动宽度实际验收。
- [ ] 发布前确认远程迁移状态、0050 兼容性和部署候选；取得独立授权后才可远程迁移/部署。
- [ ] 同版本上线后重复真实登录及跨身份旅程，追加发布/验收证据。

结论：D1 故障矩阵和 D2 本地 HTTP/DOM 隔离证据已补齐；D3 真实交互、D4 发布后验收未完成。D02-R2-D、D02、R6-003 仍开放；ADM-002 的历史发布/验收状态不提升。本地提交不代表已经合并或上线。
