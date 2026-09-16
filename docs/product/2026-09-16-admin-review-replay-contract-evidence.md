# D02-R2-A 审核重放契约本地证据

日期：2026-09-16；工作分支：`codex/admin-audit-recovery`；起点：`5ee8123`。

范围：[已批准设计 A](../superpowers/specs/2026-09-16-admin-review-write-recovery-design.md)与[实施计划](../superpowers/plans/2026-09-16-admin-review-replay-contract.md)。仅本地实现与自动化，不是部署、真实登录或 R2 整体完成证据。

## 修复与契约

- `PublicationRepository.decide` 首次结果的 visibility 从硬编码 `admin_only` 改为 `preview.requestedVisibility`，与同一事务保存的审核记录一致。字段只是请求可见性，未改变授权或发布状态。
- 复用现有决定唯一记录、事务、精确载荷匹配和冲突错误；补齐 findReview 与 getPreview 之间发生另一笔决定提交时的权威记录重读，相同载荷重放、不同载荷仍冲突。无新接口字段、依赖、服务、迁移或生产配置。
- 新增 24 个真实 D1 Worker 回归：首次/服务重建重放 4 项，同载荷规范化并发 2 项，确定性交错读窗口的同载荷/改说明 4 项，真实提交后底层返回丢失 2 项，变更决定/原因/说明/审核人 7 项，不同决定竞争 1 项，普通成员/禁用管理员在首次及重放时鉴权 4 项。
- 返回值比较全部八个字段（含 createdAt）；断言唯一 review、唯一对应 audit、终态一致，且驳回/退回没有 publication intent 或 revision。冲突后审计原文不变。
- 仓库只允许一个活动管理员。审核人变更用例先由原管理员完成审核，再禁用旧管理员、启用继任者；不伪造两个同时有效的管理员。

## TDD 与验证记录

1. 先添加首次/重放 2×2 用例。初次测试辅助查询误以为 revisions 有 submission_id；按真实 schema 改为经 source_versions 关联后，重复运行得到 **2 失败、2 通过**，失败均为 shared 首次结果返回 admin_only；业务代码尚未修改。
2. 最小修复后增加边界回归。首次整组测试中 7 项因测试夹具违反 one_active_admin 唯一约束失败；调整为真实管理员交接夹具，未修改生产权限或 schema。
3. `rtk proxy npx --no-install vitest run test/unit/publication-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-api.test.ts`：**3 文件、162 项通过**，exit 0；原发布并发、发布/驳回互斥、目标验证与索引恢复用例保留。
4. `rtk proxy npm run typecheck`：通过，exit 0。
5. `rtk proxy npm run verify:delivery-status`：28 项通过，exit 0；`rtk proxy git diff --check` 无错误。

复核追加：只读代码复核发现初次 findReview 为空、并发决定随后提交、getPreview 读取终态的窗口未进入 batch catch。新增四项确定性交错测试，修复前同载荷两项失败（REVIEW_STATE_CONFLICT），改说明两项通过；补齐权威重读后上述 162 项全部通过。测试子类只调度真实竞争请求，预览读取仍调用原实现、事务仍写入真实 D1，不用假返回值掩盖状态。

追加只读复核已确认该 P2 解决，未发现新的 A 批代码阻塞项；复核者未重跑测试，最终测试和文档检查由主控执行。复核不覆盖 B/C/D，也不是生产验收。

测试输出保留已有 AI binding 远程访问警告，以及 purge 回归中缺失已删除文件的 WorkspaceFsError 日志；上述测试进程仍以 0 退出。未为消除日志而更改生产配置或旧用例；本次只运行本地 D1/Worker 回归，未执行部署、远程迁移或主动 AI 请求。

## 交付边界与下一批

- A 的服务端响应一致性与重放/冲突契约已本地验证。
- B 待实现：前端消费类型化权威结果、发布与索引状态分离、真实审核说明、原载荷手动重试与迟到响应隔离。
- C/D 待实现/验收：事务一致审核通知、通知授权、迁移兼容、完整故障矩阵、真实交互与上线验收。
- D02、R6-003、ADM-002 的发布/验收状态不提升；不改写旧版本部署证据。
