# 图谱容量拒绝与收件箱任务恢复：review 修复证据

日期：2026-10-10。基线 `04d88786`；分支 `codex/functional-checklist-completion`。
范围：本地代码、DOM 路由和回归验证。无 push、merge、实际部署、远程迁移或原生浏览器验收。

## 复现与修复

1. 图谱首次创建任务收到精确 `409 TASK_LIMIT_REACHED`，后端未插入任务，前端却保存未知操作并拦截去任务页释放容量。原 ID 查询 404 无法解锁。现在首次明确拒绝可解除；未知操作的重试即使收到同一 409，仍保留原编号与锁，不能把后一次拒绝作为第一次未写入的证明。同名 500 也不解锁。
2. InboxRoute 打开的任务编辑器在子任务请求 503 后保存了原操作，但刷新未读取或传入 restored，导致记录仍在、恢复入口消失。现在读取当前成员的记录，通过 Inbox 读取授权后恢复原目标和冻结意图，无自动 POST。目标不在当前筛选列表也能恢复。等待授权期间保留离开保护；401/403 清除私有入口、取消迟到列表读取，记录留待重新授权后显式核对。
3. 补测发现共享 TaskEditor 在原操作未知、显式重试返回 401/403 时未清除私有界面。现在无论是否首次请求都执行撤权清理；未知原意图不会被重试拒绝清除。该修复同时适用于 Tasks 入口。
4. 收件箱只打开已有任务，不新增创建任务分支。若同标签页有 Tasks 创建记录，只显示返回 Tasks 的恢复入口；不在收件箱挂载新建编辑器。损坏记录显示明确丢弃控件；有效记录不能以该路径丢弃。

## TDD 和覆盖

新增 19 项测试（图谱 3，收件箱 App 路由 16），沿用实际 App/TaskEditor、成员会话与 sessionStorage；网络是测试夹具，不是生产行为证据。

- 正式 RED：两文件 6 失败 / 64 通过；沙箱日志/端口 EPERM 不计为行为失败。
- 重试撤权 RED：2 失败 / 28 通过。
- 创建入口边界 RED：3 失败 / 30 通过（含上述两个尚未修复用例）。
- 首次容量拒绝、未知同请求重试、同名 500；原操作编号与冻结参数不变。
- 实际子任务写入 503 后强制重挂载、无自动 POST、409 重试保留原 body。
- 当前筛选外目标恢复；GET 核对原先的子任务 ID 的当前状态，成功后无重复 POST。
- 跨成员记录不读取；Inbox 首读 401/403 不打开任务详情；核对或重试 401/403 清除私有内容但保留原记录。
- 损坏记录显式丢弃；存储清理失败保留未知锁；首次读取 401/403/503 后显式重试恢复。
- 创建记录只转交 Tasks 入口，不开放 Inbox 的新建分支。

扩大回归 **49 文件 / 826 项通过**；Worker 和前端类型检查通过。生成操作索引更新为 **270 文件 / 1171 候选 / 110 未归属**，领域审计通过。App 外层未归属候选逐项复核未改变，已更新人工审阅指纹。

全量 `npm run check` 实际执行结束，退出码 **0**：单元测试 **355 文件 / 4891 项通过**，Worker 测试 **69 文件 / 1161 项通过**，类型检查、构建及检查链通过。Wrangler 仅执行 `--dry-run`，没有实际部署。

文档契约 `functional-checklist-audit`、`workbench-maturity-contract`、`delivery-status-contract`、`frontend-operation-inventory` 合计 **64/64 通过**；`git diff --check` 通过。父 checklist 重新审计仍为 29 / 5 / 24，不能以全量检查通过代替尚未完成的功能验收。

日志：`/private/tmp/review-fixes-red.log`、`/private/tmp/review-fixes-permission-red.log`、`/private/tmp/review-fixes-boundaries-red.log`、`/private/tmp/review-fixes-green.log`、`/private/tmp/review-fixes-expanded.log`、`/private/tmp/review-fixes-types.log`、`/private/tmp/review-fixes-contracts.log`、`/private/tmp/review-fixes-full-check.log`。

## 不关闭的范围

- 父 checklist 仍为纳入 29 / 完成 5 / 剩余 24；D08 用户排除。
- 本次关闭 review 的两个局部缺陷及补测撤权缺陷，不代表 A02/C01/C04 或 11 个共享编辑器 gap 整体完成。
- 状态核对沿用原 ID 的当前资源，不是永久历史操作账本；不声称覆盖后续任意修改后的历史精确结果。
- 收件箱所有任务子操作的完整授权、并发、二级对象及恢复矩阵仍需逐路径证据；原生浏览器、真实双账号、发布/生产不由 DOM 或本地 D1 回归替代。
