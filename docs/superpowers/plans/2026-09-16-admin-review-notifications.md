# D02-R2-C 审核结果通知实施计划

> Implementation: execute this approved-design follow-up using TDD, in the existing isolated worktree.

日期：2026-09-16。分支：`codex/admin-audit-recovery`。起点：`e4666d2`。

目标：审核终态与通知原子落库，提交者收到一次脱敏通知；列表读取和点击重新检查当前权限。沿用现有 D1 和站内通知，不新增外部服务，不执行远程迁移或部署。

设计依据：`../specs/2026-09-16-admin-review-write-recovery-design.md` 的 C 批。D 批和真实登录/发布验收仍单独开放。

## C1 存储及原子写入

- [x] 先写真实 D1 测试：三种终态、重放去重、通知写失败回滚、发布恢复。
- [x] 新增 `0050_admin_review_notifications.sql`，扩展事件/目标白名单，保留旧通知和已读状态，不修改历史迁移。
- [x] publication repository 在最终决定 batch 内插入通知：收件人 SQL 读取 submitter_id；稳定去重键；空 payload，不复制正文、标题或私密说明。
- [x] 旧数据迁移、唯一键、外键、索引回归；同步迁移 hash 和 release contract。

## C2 当前权限及用户交互

- [x] 扩展前后端通知类型、事件筛选、中英文文案。
- [x] submission 目标重新检查当前活动成员、归属或管理员权限；无权时清除目标。
- [x] 点击先通过已有已读 API 获取重新鉴权的目标，再导航；失败不导航，迟到响应不得跨页面导航。
- [x] 审核通知落到现有提交页面（普通成员“我的提交”，管理员审核详情），不直接链接知识正文。
- [x] 增补目标失效、隔离、点击授权失效及前端类型/展示测试；401/403 清缓存与取消旧列表请求，普通迟到错误不污染新视图。

## C3 本地交付

- [x] 运行定向 Worker/前端回归（10 文件 244 项）、默认及通知模块类型检查、迁移/release/smoke 契约、最终前端构建与资产验证。完整 build 在最后 UI 修复前通过；全前端严格检查仍有 28 项诊断。
- [x] 最终组合产物 Worker dry-run 重跑：2026-09-17 完整 `npm run build` 退出 0，包含 landing 96 项与 Worker dry-run；再次联合回归 244 项、默认 typecheck 通过。此前两次权限审核超时保留在证据中。
- [x] 根据实际结果更新设计 checklist、roadmap、产品 checklist 和交付总账；不得把自动化等同生产验收。
- [x] 记录剩余 D 批和真实交互验收缺口。本轮不推送、不部署、不操作生产数据。见[本地证据](../../product/2026-09-16-admin-review-notifications-evidence.md)。
