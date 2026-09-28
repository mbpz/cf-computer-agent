# D02 去重决策：并发提交、未知结果与只读恢复

日期：2026-09-28 UTC（本地 2026-09-29）。基于 `ec21e6a`，分支 `codex/functional-checklist-completion`。

## 实际范围与行为

- 三种决策 associate / keep_separate / reject 使用同步在途锁，同批点击多个按钮或不同条目只发一次 POST；读请求进行中禁止新决策。
- 列表回执严格匹配页码、页大小，拒绝非 pending 项和重复 ID。写回执必须匹配投稿 ID、决策和原 canonical submission/source/version 三个关联 ID，错误回执按未知结果处理。
- 网络失败、500、无效回执不自动重发 POST。当前挂载内保留目标读前锁；显式恢复只发当前查询 GET，并合并同批恢复点击。只有 fresh GET 显示该 pending 行，且该行在 GET 开始和结束时均无在途写，才释放未知写锁。
- 未知结果的行缺失于分页结果，不等于确认上次决策。恢复提示仍保留；不从队列缺失推断具体终态。已收到有效终态回执则不会被迟到 pending 数据解锁；正常确认并从队列移除后不显示误导性的未知结果提示。
- POST 或 GET 当前请求的 401/403 清除数据和入口、失效 controller/scope；显式 GET 可恢复。旧 GET 即使无视 abort，也不能在拒绝后恢复私有行。
- 历史/分页导航同步清除旧查询数据并失效 scope。离开再返回相同数值查询后，旧 POST 的成功/拒绝都不能刷新或撤权新页面。导航后开始于旧写完成前的 GET 不能解除目标锁。
- 确认决策后的回读失败仍保留页收缩意图；手动 GET 得到空页时 replace 到有效页，不重发决策。

## D1 并发缺陷与修复

旧实现先读取 pending，再在 batch 中 UPDATE 与无条件 INSERT 审计。两个独立服务并发时，败者 UPDATE 为 0，但继续 INSERT 相同确定性审计 ID，抛出 SQLite UNIQUE 错误，而非既有契约要求的幂等回执或 409。

本批复用 `AuditRepository.prepareResourceWriteAudit` 的 `changes() = 1` 门禁，允许固定表枚举中的 submissions；仅成功的 pending→terminal 更新插入审计。败者读取持久化终态：相同 reviewer + decision 返回原回执，不同 reviewer 或 decision 返回 `DUPLICATE_DECISION_CONFLICT`（409）。不捕获/吞掉真实审计错误；人为确定性审计 ID 碰撞仍使 batch 回滚，pending 与 decided_by/at 保持原值。

真实本地 D1/HTTP 测试确认：三种决策多请求并发共享一个终态回执和一条审计；不同决策/管理员竞争只有一个胜者；普通成员、已禁用成员、缺失登录、已撤权管理员及非法载荷/不存在目标不得写入。未新增迁移，不引入通用幂等键，也不声称全系统 exactly-once。

## 测试过程与最终证据

1. 新增 22 路由测试：首次 **19 failed / 3 passed**，真实复现重复 POST、未知结果重发风险、撤权残留、scope 失效及列表/回执不匹配。修复后与既有审核分页合计 **81/81**。
2. 新增 6 个真实 D1 测试：首次 **5 failed / 25 passed**，并发败者实际报 `UNIQUE constraint failed: audit_events.id`；条件审计修复后 **30/30**。审计碰撞回滚用例原本已通过，是既有契约补证。
3. 增加 4 个路由边界（恢复去重、GET 开始时仍有写入、未知缺失行、撤权后旧 GET）与 4 个真实 HTTP 测试。七文件首次 **1 failed / 335 passed**：成熟度网络夹具 page=2 却返回 page=1。修正夹具按请求页码/大小生成响应，不放宽生产校验。
4. 三种成功决策补断言：已确认回执且队列移除后不应保留未知结果提示，观察到 **3 failed / 23 passed**，随后修复提示条件。
5. 最终十文件 **400/400，exit 0**；本批共新增 **26 路由 + 6 D1 + 4 HTTP = 36 测试**。最终命令：

```sh
rtk proxy npx vitest run test/unit/frontend-admin-duplicate-recovery.test.tsx test/worker/m1-api.test.ts test/worker/submissions.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-admin-pages.test.tsx test/unit/frontend-workbench-maturity-routes.test.tsx test/worker/admin-audit.test.ts test/unit/frontend-admin-pagination-routes.test.tsx test/worker/members.test.ts test/worker/spaces.test.ts
```

- `rtk proxy npm run typecheck`、`rtk proxy npm run build:ui`、`rtk proxy npm run verify:i18n` 通过。typecheck 沿用既有范围，不声称完整前端 TSX 检查；i18n 脚本范围 434 keys / 55 placeholders / 6 files。既有大于 500 kB chunk 警告保留。
- 六个 Node 合同脚本 **92/92，0 failed / cancelled**：workbench-domain-audit、functional-checklist-audit、workbench-maturity-contract、delivery-status-contract、i18n-contract、calendar-query。
- Vitest 经授权使用本地监听端口，自动加载既有 `.dev.vars`；没有手工读取或上传 Secret，binding 警告不是实际 AI 调用。M1 API 测试使用其既有 fake AI 实现。

## 未覆盖与 checklist

恢复锁只在当前挂载内，不承诺跨刷新持久化、终态精确 GET 查询、原生双身份/键盘/触控验收。有效 POST 回执和 pending 队列 GET 是不同证据，后者不能证明未确认 POST 的具体结果。未 push、merge、部署、远程迁移、生产写入、备份或加密操作。

Canonical 原始 30；D08 独立排除；本轮 **29 范围内 / 已关闭 4 / 未关闭 25**。只勾选 D02 去重决策本地子项，D02 父项不关闭。下一允许继续 D02 角色写入/权限掩码/成员分配/恢复矩阵，随后菜单和空间；已有初始 GET 重试不重复实施。本地开发无新 blocker，原生验收继续独立保留。
