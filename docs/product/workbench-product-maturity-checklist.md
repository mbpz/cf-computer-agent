# Workbench Product Maturity Checklist

更新时间：2026-09-01

本清单是工作台成熟化计划的原子任务索引。当前勾选状态只在 R0 审计后更新；已有页面、测试或 `ready` 路由不能自动把 atom 标记为完成。

状态规则：

- `[ ]`：尚未证明本地实现与验证完整。
- `[-]`：本地实现或验证仍为 `partial`，但已有可复核的局部证据。
- `[x]`：本地实现和验证完整。
- 每个 atom 另行记录 `release` 与 `acceptance`，不得由 `[x]` 推断生产完成。

R0 与全局标记语义一致：checkbox 只表达本地 implementation/verification；release 与 signed-browser acceptance 始终由各 atom 的独立字段和交付总账表达。

完成判定必须覆盖入口、核心流程、真实 API、成员隔离、分页/幂等、完整异步状态、键盘/触控/响应式、本地验证和独立交付证据。

## R0 — 现状审计与权威总账

- [x] `R0-001` 固化所有共享路由、参数化路由、菜单入口和权限映射。
  - `implementation`: `done` — `shared/workspace-route-capabilities.ts`、`frontend/app-routes.ts`、`shared/workbench-maturity-capabilities.ts`。
  - `verification`: `done` — `scripts/workbench-maturity-contract.test.mjs`、`test/unit/frontend-workbench-maturity-routes.test.tsx`。
  - `release`: `pending` — R0 未执行部署；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — R0 未执行 signed-browser 验收；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 精确覆盖 21 个菜单路由与 3 个参数化深链接。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 必须等于上述 capability records 的 `ledgerIds` 并集。
  - `required`: `entry=proven` — 每个映射 capability 的入口维度均须与 manifest 一致。
  - `evidence`: `manifest,route` — 只接受 manifest/route 审计证据类别。
- [-] `R0-002` 固化所有页面主操作、次操作、表单、列表、详情和深链接清单。
  - `implementation`: `partial` — `shared/workbench-maturity-capabilities.ts`、`docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md` 已覆盖路由、详情和 source-visible mutation；非 mutation 次操作仍未穷举。
  - `verification`: `partial` — `test/unit/frontend-workbench-maturity-routes.test.tsx`、`scripts/workbench-domain-audit.test.mjs` 未证明每个非 mutation 控件。
  - `release`: `pending` — R0 未执行部署；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — R0 未执行 signed-browser 验收；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 精确覆盖所有可见页面与深链接。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 必须等于映射 capability ledger 并集。
  - `required`: `journey=gap` — 当前 journey 缺口必须在每个映射 record 中显式保留。
  - `evidence`: `manifest,route,domain` — 操作清单只能由三类审计证据共同支持。
- [x] `R0-003` 逐路由验证 admin、contributor、匿名和撤权后的可见性。
  - `implementation`: `done` — `shared/workbench-maturity-capabilities.ts`、`test/helpers/workbench-maturity-route-fixtures.ts`、`test/helpers/authenticated-app-harness.tsx` 固化角色与撤权投影。
  - `verification`: `done` — `test/unit/frontend-workbench-maturity-routes.test.tsx` 覆盖入口、直达、权限收缩与参数化路由。
  - `release`: `pending` — 本地 fixture 不构成发布；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — backend-generated signed session 与真实浏览器角色旅程未执行；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 角色矩阵覆盖全部 24 项。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 精确映射角色投影涉及的 ledger rows。
  - `required`: `entry=proven,isolation=gap` — 已证明入口，隔离/撤权仍保守保留 gap。
  - `evidence`: `manifest,route` — 角色结论只接受 manifest 与运行时 route 审计。
- [x] `R0-004` 逐页面验证 loading、empty、error、retry、ready、pending。
  - `implementation`: `done` — `shared/workbench-maturity-capabilities.ts`、`test/helpers/workbench-maturity-route-fixtures.ts` 为 24 个 capability 固化四态输入或命名的 unsupported gap。
  - `verification`: `done` — `test/unit/frontend-workbench-maturity-routes.test.tsx` 的 24×4 运行时矩阵验证现状而不补写业务行为。
  - `release`: `pending` — 状态矩阵仅为本地证据；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — 真实浏览器错误、焦点和恢复旅程未执行；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 状态矩阵覆盖全部 24 项。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 精确映射状态审计涉及的 ledger rows。
  - `required`: `states=gap` — manifest 必须如实保留不完整状态维度。
  - `evidence`: `manifest,route` — 状态结论只接受 manifest 与 route fixture/test。
- [-] `R0-005` 逐列表验证真实 API、服务端分页、筛选、排序、URL 恢复和 stale guard。
  - `implementation`: `partial` — `shared/workbench-maturity-capabilities.ts`、`docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md` 已按 API 记录 numbered/cursor/not-applicable，但不把 API shape 当作完整 UI continuation。
  - `verification`: `partial` — `scripts/workbench-domain-audit.test.mjs` 验证真实 API 与分页来源；筛选、排序、URL 恢复和 stale guard 尚未逐列表穷举。
  - `release`: `pending` — R0 未执行部署或远程 migration；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — 真实浏览器翻页与历史恢复未执行；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-knowledge,workbench-search,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-message-thread` — 精确覆盖当前列表/流式列表表面。
  - `ledger`: `ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-002,KB-005,KB-006,KB-007,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002` — 只映射上述列表 capabilities。
  - `required`: `api=gap,query_or_idempotency=gap` — API 与查询完整性仍按 manifest gap 记录。
  - `evidence`: `manifest,domain` — 分页/查询结论只接受 manifest 与 domain audit。
- [-] `R0-006` 逐 mutation 验证幂等键、重复提交、并发冲突、精确回滚和审计。
  - `implementation`: `partial` — `shared/workbench-maturity-capabilities.ts`、`docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md` 已来源绑定 visible mutation 与 safety strategy，但保留未保护端点。
  - `verification`: `partial` — `scripts/workbench-domain-audit.test.mjs` 能失败关闭遗漏或动态 request options；精确回滚与审计结果未逐 mutation 完整验证。
  - `release`: `pending` — R0 未执行部署；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — 重放、并发与 uncertain outcome 浏览器旅程未执行；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-submit,workbench-search,workbench-agent,workbench-tasks,workbench-boards,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 精确覆盖 source-visible mutation 所属 capability。
  - `ledger`: `ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,BRD-001,BRD-002,KB-001,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002` — 只映射 mutation scope。
  - `required`: `query_or_idempotency=gap` — mutation safety 缺口必须与 manifest 一致。
  - `evidence`: `manifest,domain` — mutation 结论只接受 manifest 与 source-derived domain audit。
- [-] `R0-007` 逐私有实体验证 member scope、二级对象授权和撤权收缩。
  - `implementation`: `partial` — `shared/workbench-maturity-capabilities.ts`、`docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md` 只认可运行时 authenticated principal predicate；管理域全局对象保持 `ownerPredicate: null`。
  - `verification`: `partial` — `scripts/workbench-domain-audit.test.mjs`、`test/unit/frontend-workbench-maturity-routes.test.tsx` 覆盖 owner binding 与消息撤权探针，但未逐二级对象完成 signed authority 验证。
  - `release`: `pending` — R0 未执行远程隔离 smoke；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — 跨成员与撤权后的真实角色旅程未执行；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread` — 只覆盖私有 member/context surfaces。
  - `ledger`: `BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002` — 精确映射私有 capability ledger rows。
  - `required`: `isolation=gap` — 未完成的二级对象授权必须保留 gap。
  - `evidence`: `manifest,route,domain` — owner/撤权结论要求三类证据。
- [-] `R0-008` 对照 D1 migration、本地 schema、Repository、Service、Route 和 DTO。
  - `implementation`: `partial` — `shared/workbench-maturity-capabilities.ts`、`docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md` 已绑定 API、persistence 与 owner source path，尚未为每项独立列出 DTO/Service 链。
  - `verification`: `partial` — `scripts/workbench-domain-audit.test.mjs` 验证路径、AST route branch 与 symbol/token 绑定，但不能替代逐 DTO 语义审查。
  - `release`: `pending` — 本地 migration/source 审计不证明远程 schema；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — 远程 schema 与真实角色读写未验收；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — domain chain 审计覆盖全部 24 项。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 精确映射全部 domain records。
  - `required`: `api=gap,persistence=gap,isolation=gap` — 三个 domain 维度必须与 manifest 保守状态一致。
  - `evidence`: `manifest,domain` — domain chain 只接受 manifest 与 source-bound audit。
- [x] `R0-009` 对照单元测试、Worker 测试、浏览器证据、发布版本和验收范围。
  - `implementation`: `done` — `shared/workbench-maturity-capabilities.ts` 分列 frontend/backend/test evidence，`test/unit/frontend-workbench-maturity-routes.test.tsx` 固化 route 证据，`docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md` 固化 domain 证据，`docs/product/delivery-status-ledger.md` 分列交付维度。
  - `verification`: `done` — `scripts/workbench-maturity-contract.test.mjs`、`scripts/workbench-domain-audit.test.mjs`、`scripts/delivery-status-contract.test.mjs` 验证四类 evidence、dated scope 与语言边界。
  - `release`: `pending` — 仅保留总账中的日期化历史候选范围，不推断 current-main；权威为 `docs/product/delivery-status-ledger.md`。
  - `acceptance`: `pending` — 历史匿名/signed automation 证据不替代 current-main signed browser；权威为 `docs/product/delivery-status-ledger.md`。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 证据对账覆盖全部 24 项。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 精确映射全部 evidence records。
  - `required`: `evidence=gap` — 产品证据维度仍保留 release/browser gap。
  - `evidence`: `manifest,route,domain,delivery` — 四类证据必须分别出现。
- [x] `R0-010` 将每项分类为 usable、partial、unusable、pseudo-entry 或 unreachable。
  - `implementation`: `done` — `shared/workbench-maturity-capabilities.ts` 为 24 个当前可见/参数化 capability 明确记录 classification；当前均为 `partial`。
  - `verification`: `done` — `scripts/workbench-maturity-contract.test.mjs`、`scripts/workbench-domain-audit.test.mjs` 验证记录完整性、来源绑定与保守 gap。
  - `release`: `pending` — classification 只描述本地审计；发布状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `acceptance`: `pending` — classification 不代表 signed-browser acceptance；验收状态仅以 `docs/product/delivery-status-ledger.md` 为准。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — classification 覆盖全部 24 项。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 精确映射全部 classified records。
  - `required`: `evidence=gap` — classification 不得抹去证据缺口。
  - `evidence`: `manifest,domain` — classification 由 manifest 与 domain audit 支持。
- [x] `R0-011` 下调没有完整证据的 `ready`、`done` 和 README/ROADMAP 完成声明。
  - `implementation`: `done` — `shared/workbench-maturity-capabilities.ts`、`docs/product/workbench-product-maturity-checklist.md`、`docs/product/delivery-status-ledger.md` 明确本地、发布与验收边界。
  - `verification`: `done` — `scripts/workbench-maturity-contract.test.mjs`、`scripts/delivery-status-contract.test.mjs` 对 checklist marker 与四份权威文档的维度语言失败关闭。
  - `release`: `pending` — Task 4 不部署且不提升总账生产列；权威为 `docs/product/delivery-status-ledger.md`。
  - `acceptance`: `pending` — Task 4 不执行 signed-browser acceptance；权威为 `docs/product/delivery-status-ledger.md`。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — 文档语言边界覆盖全部 24 项。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — 全部 capability claims 解析到精确 ledger rows。
  - `required`: `evidence=gap` — 文档守卫不得把本地证据提升为产品完成。
  - `evidence`: `manifest,delivery` — 只接受 manifest 和交付合同证据。
- [x] `R0-012` 生成 R1–R8 的缺口矩阵、依赖图、优先级和验收顺序。
  - `implementation`: `done` — `docs/product/workbench-product-maturity-gap-matrix.md` 与 `ROADMAP.md` 已建立 56 项 source gap 的唯一主责、前置依赖和验收顺序。
  - `verification`: `done` — `scripts/workbench-maturity-contract.test.mjs` 独立核对 manifest/domain source、稳定 ID、唯一 owner、阶段依赖和 R1–R8 映射。
  - `release`: `pending` — 尚无可发布产物；权威为 `docs/product/delivery-status-ledger.md`。
  - `acceptance`: `pending` — 尚无可验收产物；权威为 `docs/product/delivery-status-ledger.md`。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — Task 5 精确消费全部 24 项 manifest 记录及对应 domain gaps。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — gap matrix 的精确 ledger 输入；各交付维度状态不变。
  - `required`: `evidence=gap` — 矩阵产物不抹去 24 项 capability 的 release/signed-browser 证据缺口。
  - `evidence`: `manifest,delivery` — manifest、gap matrix、Roadmap 与交付合同共同构成规划证据，不构成 R1–R8 实现证据。

### Task 5：R1–R8 阶段映射

以下映射只声明后续 gap 的执行边界；所有 R1–R8 原子仍为未实现。`Owned gaps` 由缺口矩阵唯一 owner 派生，下一阶段计划文件在进入对应阶段时创建。

<!-- task5-stage-map:start -->
| Phase | Owned gaps | Entry criteria | Exit criteria | Next detailed plan |
| --- | ---: | --- | --- | --- |
| R1 | 1 | R1 入口门槛：R0 缺口账、身份边界、当前 Shell 基线。 | R1 退出门槛：设置、全局 Shell、键盘、overlay、主题、窄屏验收。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r1-design-system.md |
| R2 | 1 | R2 入口门槛：R1 overlay、焦点、token、响应式 Shell 合同。 | R2 退出门槛：共享 DataTable、分页、AsyncBoundary、表单、URL 恢复。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r2-shared-patterns.md |
| R3 | 13 | R3 入口门槛：R2 数据、表单、确认、异步模式。 | R3 退出门槛：提交、知识、搜索、阅读器、Agent 域内验收。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r3-knowledge-loop.md |
| R4 | 8 | R4 入口门槛：R3 知识目标授权、共享实体模式。 | R4 退出门槛：任务与看板 CRUD、关联、并发、重放、撤权、恢复。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r4-tasks-boards.md |
| R5 | 6 | R5 入口门槛：R4 任务事件、知识上下文、条件写入合同。 | R5 退出门槛：通知与上下文消息未读、分页、重试、撤权、深链。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r5-notifications-messages.md |
| R6 | 25 | R6 入口门槛：R3–R5 业务权威数据、共享治理模式。 | R6 退出门槛：管理摘要、审核、资产、成员、角色、菜单、Space、审计、统计。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r6-administration.md |
| R7 | 1 | R7 入口门槛：R3–R6 域内旅程、授权收敛合同。 | R7 退出门槛：首页与跨模块计数、链接、事件、权限、缓存权威结果。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r7-cross-module.md |
| R8 | 1 | R8 入口门槛：R1–R7 本地实现、完整 gate、精确候选树。 | R8 退出门槛：发布、迁移、免费层、smoke、signed acceptance、账本证据。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r8-delivery-acceptance.md |
<!-- task5-stage-map:end -->

## R1 — 设计系统与全局 Shell

- [ ] `R1-001` 建立官方 shadcn/ui 安装、来源、版本和许可证清单。
- [ ] `R1-002` 统一 light/dark token、冷灰表面、单蓝色强调色和对比度。
- [ ] `R1-003` 统一 4/8/12/16/24/32 间距、圆角、密度和触控尺寸。
- [ ] `R1-004` 用成熟原语替换缩减版 Button/Input/Select/Checkbox/Textarea。
- [ ] `R1-005` 接入 Dialog、AlertDialog、Sheet、Drawer 和 FocusScope 合同。
- [ ] `R1-006` 接入 DropdownMenu、Popover、ContextMenu、Tooltip 和 HoverCard。
- [ ] `R1-007` 接入 Command、Combobox、Calendar、DatePicker 和 DateRangePicker。
- [ ] `R1-008` 接入 Toast/Sonner、Progress、Breadcrumb、Separator 和 ScrollArea。
- [ ] `R1-009` 重构固定 Sidebar、移动 Drawer、独立滚动和紧凑内容区。
- [ ] `R1-010` 重构 Topbar：Command Palette、协作入口、语言和账户。
- [ ] `R1-011` Command Palette 按权限搜索页面、知识、任务和操作。
- [ ] `R1-012` 账户菜单完成身份、设置、主题、语言、会话和退出反馈。
- [ ] `R1-013` 所有 overlay 互斥、外部关闭、Escape、焦点恢复和路由关闭。
- [ ] `R1-014` 建立 320/375/768/1280 真实浏览器 Shell 验收基线。

## R2 — 通用数据、表单与页面模式

- [ ] `R2-001` 建立统一 `PageHeader` 和 Breadcrumb/操作布局。
- [ ] `R2-002` 建立服务端 `DataTable` 排序、筛选、列显隐和行选择。
- [ ] `R2-003` 建立 `FilterBar` 搜索、Select、Combobox、日期和清空行为。
- [ ] `R2-004` 统一完整数字分页、pageSize、总数、本地化和页码校正。
- [ ] `R2-005` 建立 `AsyncBoundary` 的 skeleton/empty/error/retry/forbidden/not-found。
- [ ] `R2-006` 建立 `EntityForm` 字段校验、dirty、pending 和离开确认。
- [ ] `R2-007` 建立 `EntitySheet` 查看、编辑、保存和并发错误反馈。
- [ ] `R2-008` 建立危险操作 `ConfirmAction` 和不可逆影响说明。
- [ ] `R2-009` 建立 `StatCard`、`ChartCard`、`StatusBadge` 和 `ActivityTimeline`。
- [ ] `R2-010` 将知识、提交、任务、通知和管理列表迁移至共享模式。
- [ ] `R2-011` 验证所有列表 URL 恢复、刷新、后退/前进和 stale response 防护。
- [ ] `R2-012` 验证中英文、暗色、键盘、触控和窄屏表格横向可达。

## R3 — AI 知识库闭环

- [ ] `R3-001` 提交页支持草稿恢复、格式选择、附件和稳定幂等键。
- [ ] `R3-002` 上传队列支持进度、取消、失败、重试和重复内容反馈。
- [ ] `R3-003` 解析任务支持状态、最近错误、预览、重试和恢复。
- [ ] `R3-004` 审核队列支持过滤、分页、预览和权限正确的决策操作。
- [ ] `R3-005` 发布创建不可变 Revision 并保证重放不重复发布。
- [ ] `R3-006` 知识列表支持服务端过滤、排序、完整数字分页和 Saved View。
- [ ] `R3-007` 阅读器支持原件、Chunk 定位、历史 Revision 和引用回读。
- [ ] `R3-008` Revision diff 展示结构化变化和精确来源定位。
- [ ] `R3-009` Revision rollback 原子切换 current 并记录审计和失败恢复。
- [ ] `R3-010` 回收站支持 member 隔离、恢复、保留期和最终清理。
- [ ] `R3-011` 收藏、私有笔记和最近访问在列表与阅读器中闭环。
- [ ] `R3-012` 相关知识和反向链接在每次读取时重新授权。
- [ ] `R3-013` 搜索支持 Space/Collection/Tag/type/author/time 过滤和高亮。
- [ ] `R3-014` 搜索无结果、FTS5 降级、错误恢复和 Saved View 闭环。
- [ ] `R3-015` Agent 支持会话历史、范围选择、严格引用和证据不足拒答。
- [ ] `R3-016` Agent 反馈、失败重试、会话恢复和配额降级不丢状态。

## R4 — 任务与看板闭环

- [ ] `R4-001` 任务列表支持真实 CRUD、筛选、排序、数字分页和 URL 恢复。
- [ ] `R4-002` 创建任务使用稳定幂等键并在重试后收敛为一条记录。
- [ ] `R4-003` 任务详情 Sheet 支持编辑标题、说明、优先级和截止时间。
- [ ] `R4-004` 状态机、进度、完成时间和取消语义保持一致。
- [ ] `R4-005` 标签增删和任务知识关联执行 member/target 双重授权。
- [ ] `R4-006` 活动记录展示状态、进度、标签、关联和讨论事件。
- [ ] `R4-007` 看板四列共享任务权威数据和每列独立分页。
- [ ] `R4-008` 看板移动使用条件更新、乐观反馈和精确回滚。
- [ ] `R4-009` 看板支持键盘移动和窄屏横向触控到达。
- [ ] `R4-010` 任务删除改为软删除、恢复、保留期和最终清理。
- [ ] `R4-011` 每个逻辑任务事件最多产生一条通知和一条审计结果。
- [ ] `R4-012` 任务和看板在并发、重复请求和撤权后保持收敛。

## R5 — 通知与上下文消息闭环

- [ ] `R5-001` Topbar 未读数来自服务端摘要并与页面操作收敛。
- [ ] `R5-002` 通知中心展示最近事件并可进入完整收件箱。
- [ ] `R5-003` 收件箱支持 read/type 筛选、数字分页和 URL 恢复。
- [ ] `R5-004` 单条与有界批量已读操作幂等且失败可重试。
- [ ] `R5-005` 通知目标跳转重新授权并明确展示删除/撤权状态。
- [ ] `R5-006` 消息入口只展示任务/知识上下文 thread，不提供通用私聊。
- [ ] `R5-007` thread 列表支持稳定游标、上下文摘要和撤权收缩。
- [ ] `R5-008` thread 详情支持消息分页、刷新、后退和 stale guard。
- [ ] `R5-009` composer 支持回复、提及、键盘发送、pending 和焦点公告。
- [ ] `R5-010` 发送、重试和 uncertain outcome 使用稳定客户端幂等键。
- [ ] `R5-011` 重复消息、失败消息和已撤权 thread 有明确可恢复状态。
- [ ] `R5-012` 通知、消息、任务和知识之间的深链接完整闭环。

## R6 — 管理后台闭环

- [ ] `R6-001` 管理 Dashboard 使用真实摘要、趋势、排行和活动数据。
- [ ] `R6-002` 统计支持日期范围、趋势、来源、页面和访客数字分页。
- [ ] `R6-003` 审核列表/详情支持发布、退回、拒绝和冲突恢复。
- [ ] `R6-004` 资产列表支持解析状态、预览、隔离、重试和失败说明。
- [ ] `R6-005` 成员列表支持状态、角色、最近活动、分页和审计定位。
- [ ] `R6-006` 角色页支持权限矩阵、成员分配和系统角色只读。
- [ ] `R6-007` 菜单页支持层级、权限、启停、排序、预览和原子保存。
- [ ] `R6-008` Space/Collection 支持创建、编辑、归档和内容影响确认。
- [ ] `R6-009` 审计支持 actor/action/entity/time 筛选、分页和实体跳转。
- [ ] `R6-010` 批量治理返回逐项成功/失败、支持重放和并发冲突。
- [ ] `R6-011` contributor 所有管理入口和直达路径均稳定返回 403 体验。
- [ ] `R6-012` 管理修改在用户工作台产生可解释且可验证的结果。

## R7 — 跨模块产品自洽

- [ ] `R7-001` 知识详情可创建已关联的任务且重试不重复。
- [ ] `R7-002` 任务详情可打开关联知识并在撤权后安全降级。
- [ ] `R7-003` 任务变更生成一次通知且通知返回正确任务状态。
- [ ] `R7-004` 任务/知识讨论只能由当前可见上下文访问。
- [ ] `R7-005` 成员禁用或权限撤销立即收缩菜单、Command 和深链接。
- [ ] `R7-006` Space/Collection 归档同步影响搜索、阅读器、链接和通知。
- [ ] `R7-007` Command Palette 只返回当前成员可访问的页面和实体。
- [ ] `R7-008` 所有跨模块 mutation 记录脱敏、可定位的审计事件。
- [ ] `R7-009` 缓存、乐观状态和后退页面不会重新暴露已撤权数据。
- [ ] `R7-010` Dashboard 摘要与各业务模块的权威计数一致。

## R8 — 交付与验收

- [ ] `R8-001` 完整本地 gate 在精确候选提交树通过。
- [ ] `R8-002` 320/375/768/1280px 浏览器矩阵通过。
- [ ] `R8-003` admin 与 contributor 正向、拒绝、退出和撤权旅程通过。
- [ ] `R8-004` 分页、筛选、排序、刷新和后退/前进旅程通过。
- [ ] `R8-005` 重复提交、网络重试、并发冲突和 uncertain outcome 通过。
- [ ] `R8-006` D1 migration 顺序、远程状态和回滚兼容性有独立证据。
- [ ] `R8-007` 当前 Cloudflare 免费层、bindings 和降级开关重新核验。
- [ ] `R8-008` Worker 候选版本、静态资产、secrets 和流量目标独立记录。
- [ ] `R8-009` 匿名 smoke、signed automation 和 signed browser 分开验收。
- [ ] `R8-010` 交付总账、README、ROADMAP 和 checklist 与证据同步。
