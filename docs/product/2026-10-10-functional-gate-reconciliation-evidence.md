# 功能分支全量门禁与审计清点对账（本地）

2026-10-10；基线 `267d600f`；分支 `codex/functional-checklist-completion`。这是 D07 的本地门禁修复，不是完整功能验收或生产发布。图谱未知写恢复的先前审查修复见 [独立证据](./navigation-graph-exact-result-evidence.md)。

## 审核发现与修复

1. **本地迁移清单漂移。** 工作区已有 59 个迁移，文件校验仍固定为 51，导致 `npm test` 在 smoke 阶段停止。0052–0059 采用逐文件固定 SHA-256 纳入本地校验；历史 `--manifest-json` 与各 ledger 模式仍保持原 51/旧阶段边界，拒绝 52/59 条伪历史回执。没有更改、执行 SQL 或扩大远程授权。回归在临时副本验证额外文件、缺失文件、旧文件及每个新增文件字节变化均被拒绝，避免测试修改真实迁移目录。
2. **领域审计无法解析局部 options 别名。** 任务链接 DELETE 将条件参数直接传入请求；语义保持不变，不扩张分析器为猜测式解析。定向回归验证原 ID 编码、无版本/有版本请求、404 收敛及 409 不吞错。恢复扫描后发现共享编辑器漏登记的 11 个入口操作（Inbox 6、Tasks 5），均明确登记为 `gap`，而非自动提升为 `proven`。
3. **文档/契约漏算。** 现有 `/environments` 路由及 `WB-ENVIRONMENTS` atom 补入路由预期和 Roadmap R2 归属；总账仍原 96 atoms，未更改 implementation/verification/release/acceptance 状态。缺口表补齐 11 条证据归属，按 P0/P1/P2 排序，当前 116 行（manifest 34/domain 82；P0 65/P1 50/P2 1），R4 owned gap 从 44 对账到 55。这些不是新增 11 个漏洞，也不是新增 11 个功能父项。
4. **两条确认框测试过时。** 全量单测初跑 355 文件中 353 通过、2 失败（4852/4854）；两例 `onCreate` 未调用断言均已通过，失败点是仍要求 sessionStorage 为空。独立三文件复现 58 通过/2 失败。组件已有按成员保存未提交草稿的行为，现改为同时检查草稿原值保留、提交意图为空、未触发写入、只有草稿存储项；不是删除断言或修改业务逻辑。

5. **Worker 夹具与时间/权限基准漂移。** 后续全量单测 355 文件/4854 项全通过，但 Worker 为 1109/1112，图谱建议两例和环境权限一例失败。图谱 session 签发时钟固定在 2026-09-20，而 API 校验用真实当前时间，现使用统一测试时钟并在测试后恢复。环境测试原先要求 admin 另行授予 VM，但已有 `752e4353`（含0059和角色 fallback）把 VM 纳入管理员内置基准；仅修改 roles 表不是该基准的撤销方式。测试现在明确验证普通成员403→提升管理员200→降级回普通成员同会话403，以及自定义 VM 角色停用后403。没有修改鉴权代码、降低会话过期要求或对普通成员放行。

## 已执行验证

- 迁移契约 28/28；领域审计契约 31/31；交付对账 30/30；成熟度与父 checklist 契约 24/24。五文件联合运行 **113/113**。
- 两个确认框与任务数据层定向回归 **3 文件 60/60**，包含新增三个 DELETE 载荷/冲突回归。图谱建议、环境元数据与管理员角色 Worker 定向回归 **3 文件 111/111**。
- `types:check` 使用 `config/types.env` 通过；Wrangler 生成类型与已提交文件一致。首次沙箱日志目录写入受限，随后原命令获准重跑通过。
- Worker 与全前端严格类型、前端操作索引检查（270 文件/1168 候选）、领域快照检查、WCAG 静态检查通过。静态索引不是原生浏览器操作穷尽。
- 最终完整 `npm test` **退出码0**：smoke Node **79/79**、i18n **13/13**、交付契约 **30/30**，unit **355 文件/4854 项全部通过**，Worker **66 文件/1112 项全部通过**；`pretest:worker` 的 UI 构建与 VM 静态隔离检查通过。最终日志 `/private/tmp/cf-d07-full-test-verified.log`。测试源码在此最终运行前固定；之后只补齐本文及父 checklist 的结果记录。
- 日志仍有 `ReferenceError: window is not defined` 的后台 React 调度异常，以及 Worker 运行中的 missing-file/pending-journal 异常输出；本轮未逐条归因，不能将退出码0等同于无后台异常。UI 构建既有大 chunk 警告亦保留。这些是后续验证注意项，未删除错误输出、禁用检查或将真实浏览器验收替换为测试结果。
- 最终文档更新后的交付/成熟度/父清单契约 **54/54** 通过；不修改总账已有发布和验收状态。

## 重放命令

```sh
rtk proxy node --test scripts/m1-release-contract.test.mjs scripts/workbench-domain-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/functional-checklist-audit.test.mjs scripts/delivery-status-contract.test.mjs
rtk proxy npx vitest run test/unit/frontend-calendar-cancel-confirmation.test.tsx test/unit/frontend-inbox-action-confirmation.test.tsx test/unit/frontend-tasks-data.test.ts
rtk proxy npx vitest run test/worker/graph-suggestions.test.ts test/worker/environments.test.ts test/worker/admin-roles.test.ts
rtk proxy npm run types:check
rtk proxy npm run typecheck
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
rtk proxy npm test
```

## 关闭边界

原 30 父项、范围内 **29 / 已关闭 5 / 未关闭 24**；D08 排除。D07 保持开放，不把 smoke/单测或文档同步等同精确候选完整门禁。尚需完整门禁及正式验收证据；D05 真实 admin/contributor/第二成员旅程、D06 原生尺寸/语言/主题/输入矩阵、D04 正式 VM 生命周期 LC-011–015 均不由本次测试替代。LC-010 的 GitHub 网络限制是用户跳过，不标为通过。

未 push、merge、部署、远程迁移或操作生产数据；未读取/上传 SECRETS_FILE。测试运行器自动加载开发变量，AI 绑定提示不是线上执行证明。未运行含 secrets 生成的整个 `npm run check`/`npm run build`，因此不宣称这些聚合门禁通过。下一允许继续 D07 本地门禁和剩余功能验收；不以备份或加密增加阻塞。
