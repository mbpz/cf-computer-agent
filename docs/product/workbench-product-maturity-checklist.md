# Workbench Product Maturity Checklist

更新时间：2026-09-16

本清单是工作台成熟化计划的原子任务索引。当前勾选状态只在 R0 审计后更新；已有页面、测试或 `ready` 路由不能自动把 atom 标记为完成。

状态规则：

- `[ ]`：尚未证明本地实现与验证完整。
- `[-]`：本地实现或验证仍为 `partial`，但已有可复核的局部证据。
- `[x]`：本地实现和验证完整。
- 每个 atom 另行记录 `release` 与 `acceptance`，不得由 `[x]` 推断生产完成。

R0 与全局标记语义一致：checkbox 只表达本地 implementation/verification；release 与 signed-browser acceptance 始终由各 atom 的独立字段和交付总账表达。

完成判定必须覆盖入口、核心流程、真实 API、成员隔离、分页/幂等、完整异步状态、键盘/触控/响应式、本地验证和独立交付证据。

## R0 — 现状审计与权威总账

历史 R0 快照（24 项能力，以下 R0 atom 保留当时范围）：Task 6 与最终修正闭环证据见 `docs/operations/evidence/2026-08-31-workbench-r0-completion.md`。结构化 operation roots、capability-owned strategy bindings 与 GET side-effect binding 已使全部声明双向失败关闭；状态按 atom 证据恢复为 7 个 `[x]`、5 个 `[-]`。当时 24 个 capability 均为 `partial`，57 项缺口由 R1–R8 负责，98 个 R1–R8 implementation atoms 均保持 `[ ]`；本地 gate 不提升 release 或 acceptance。

2026-09-14 M02 当前增量：补入七个扩展工作区及项目时间线，当前 32 项 capability 均保留 `partial`；83 项缺口（43 P0 / 39 P1 / 1 P2）分派到 R1–R8，新增 R4-013 至 R4-038 共 26 个待实施原子，当前 R1–R8 共 124 个 `[ ]`。本次只补齐审计与回归证据，不将这些原子标为业务完成。M02 历史快照见 `docs/operations/evidence/2026-09-14-workbench-m02-domain-audit.md`；D01-A 快照 `docs/operations/evidence/2026-09-14-workbench-d01a-domain-audit.md` 亦保留。D01-B1 快照 `docs/operations/evidence/2026-09-15-workbench-d01b1-domain-audit.md` 保留；D01-B2 历史快照 `docs/operations/evidence/2026-09-15-workbench-d01b2-domain-audit.md` 保留；D02-R1 审核读取恢复后的当前快照为 `docs/operations/evidence/2026-09-16-workbench-d02r1-domain-audit.md`，发布与真实登录浏览器验收仍待办。历史 R0/M02 的范围和发布/验收状态不回填。

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
  - `implementation`: `done` — `docs/product/workbench-product-maturity-gap-matrix.md` 与 `ROADMAP.md` 精确归集 57 项未实现缺口，并建立唯一 owner、前置依赖、优先级和阶段出入口。
  - `verification`: `done` — `scripts/workbench-domain-audit.test.mjs` 与 `scripts/workbench-maturity-contract.test.mjs` 验证 all-record operation accounting、canonical identity/owner、独立 priority policy、完整有向无环图及 R1–R8 映射。
  - `release`: `pending` — 尚无可发布产物；权威为 `docs/product/delivery-status-ledger.md`。
  - `acceptance`: `pending` — 尚无可验收产物；权威为 `docs/product/delivery-status-ledger.md`。
  - `capabilities`: `workbench-home,workbench-submit,workbench-knowledge,workbench-search,workbench-agent,workbench-my-submissions,workbench-tasks,workbench-boards,workbench-settings,workbench-admin,workbench-admin-submissions,workbench-admin-duplicates,workbench-admin-assets,workbench-admin-members,workbench-admin-roles,workbench-admin-menus,workbench-admin-spaces,workbench-admin-audit,workbench-admin-analytics,workbench-notifications,workbench-messages,workbench-knowledge-reader,workbench-message-thread,workbench-admin-submission-detail` — Task 5 精确消费全部 24 项 manifest 记录及对应 domain gaps。
  - `ledger`: `ADM-001,ADM-002,ADM-003,ADM-004,ADM-005,ADM-006,ADM-007,ADM-008,ADM-009,ADM-010,BRD-001,BRD-002,KB-001,KB-002,KB-005,KB-006,KB-007,KB-009,MSG-001,MSG-002,MSG-004,NTF-001,NTF-003,NTF-004,TSK-001,TSK-002,WB-001,WB-002,WB-SETTINGS` — gap matrix 的精确 ledger 输入；各交付维度状态不变。
  - `required`: `evidence=gap` — 矩阵产物不抹去 24 项 capability 的 release/signed-browser 证据缺口。
  - `evidence`: `manifest,domain,delivery` — manifest、source-derived domain audit、gap matrix、Roadmap 与交付合同共同构成规划证据，不构成 R1–R8 实现证据。

### Task 5：R1–R8 阶段映射

以下映射只声明后续 gap 的执行边界；所有 R1–R8 原子仍为未实现。`Owned gaps` 由缺口矩阵唯一 owner 派生，下一阶段计划文件在进入对应阶段时创建。

<!-- task5-stage-map:start -->
| Phase | Owned gaps | Entry criteria | Exit criteria | Next detailed plan |
| --- | ---: | --- | --- | --- |
| R1 | 1 | R1 入口门槛：R0 缺口账、身份边界、当前 Shell 基线。 | R1 退出门槛：设置、全局 Shell、键盘、overlay、主题、窄屏验收。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r1-design-system.md |
| R2 | 1 | R2 入口门槛：R1 overlay、焦点、token、响应式 Shell 合同。 | R2 退出门槛：共享 DataTable、分页、AsyncBoundary、表单、URL 恢复。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r2-shared-patterns.md |
| R3 | 14 | R3 入口门槛：R2 数据、表单、确认、异步模式。 | R3 退出门槛：提交、知识、搜索、阅读器、Agent 域内验收。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r3-knowledge-loop.md |
| R4 | 44 | R4 入口门槛：R3 知识目标授权、共享实体模式。 | R4 退出门槛：任务、看板、七个扩展工作区及项目时间线的分页旅程、关联、并发、重放、撤权、恢复。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r4-tasks-boards.md |
| R5 | 4 | R5 入口门槛：R4 任务事件、知识上下文、条件写入合同。 | R5 退出门槛：通知与上下文消息未读、分页、重试、撤权、深链。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r5-notifications-messages.md |
| R6 | 31 | R6 入口门槛：R3–R5 业务权威数据、共享治理模式。 | R6 退出门槛：管理摘要、审核、资产、成员、角色、菜单、Space、审计、统计。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r6-administration.md |
| R7 | 1 | R7 入口门槛：R3–R6 域内旅程、授权收敛合同。 | R7 退出门槛：首页与跨模块计数、链接、事件、权限、缓存权威结果。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r7-cross-module.md |
| R8 | 9 | R8 入口门槛：R1–R7 本地实现、完整 gate、精确候选树。 | R8 退出门槛：发布、迁移、免费层、smoke、signed acceptance、账本证据。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r8-delivery-acceptance.md |
<!-- task5-stage-map:end -->

## R1 — 设计系统与全局 Shell

2026-09-28 A04 已完成账户/导航/品牌修复的[原 R1 映射对账](./2026-09-28-functional-closure-reconciliation.md)：当前 Shell 11 文件 95 项本地回归通过，局部证据映射到 R1-005/006/007/009–014。以下 R1 原子整体仍开放，尤其完整 overlay、会话管理、实体搜索与原生尺寸矩阵；不把“映射完成”当作这些原子业务完成。

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
  - 2026-10-02 未决写入离页守卫统一归属共享恢复记录，补齐收件箱状态/转任务及日程取消，保留目标/项目/时间线原有保护并去重。9项行为RED→GREEN，44文件1144/1144及受影响类型/UI/双语通过。见[共享保护证据](./navigation-shared-write-protection-evidence.md)。父项开放，下一专注独立恢复记录与其余逐页边界。
  - 2026-10-02 专注路由独立开始/转换恢复记录接同步导航与beforeunload保护；未决/未知/损坏/拒绝访问及读回期间锁定，确认会话和纯GET不误锁。正式导航6项RED→GREEN，专注7文件156/156、扩大50文件1246/1246、项目类型/UI/双语通过。见[专注写入保护证据](./navigation-focus-write-protection-evidence.md)。父项开放，下一补齐专注未提交标题/任务选择的草稿离页确认及其余逐页/原生门禁。
  - 2026-10-02 目标任务关联/解除新增精确影响确认、默认取消/焦点恢复、同步单次消费与旧回调失效；GoalsRoute 未决写入保护覆盖编辑器关闭。新增9项，44文件1135/1135及受影响类型/UI/双语通过。见[目标关联证据](./navigation-goal-tasks-protection-evidence.md)。父项开放，继续其余逐页边界；非原生或生产验收。
  - 2026-10-02 项目目标/任务关联及解除接入精确影响确认、取消焦点恢复、同步锁与旧决定隔离；项目未决写入阻止离页直到GET恢复。新增12项，43文件1110/1110与类型/UI/双语通过。见[项目关联证据](./navigation-project-relations-protection-evidence.md)。其他逐页及原生门禁仍开放，父项不关闭。
  - [x] 2026-10-02 时间线已有内容编辑接入取消/Escape/离页草稿确认、同步最新输入及防重；路由级未决写保护在错误卸载后仍有效，GET恢复不重放写入。新增16项、最终41文件1069/1069及受影响类型/UI/双语通过。见[时间线编辑证据](./navigation-timeline-editor-protection-evidence.md)。强制组件重挂载不算原生验收；父项开放，下一核查关联操作与其余逐页边界。
  - [x] 2026-10-02 收件箱/目标/项目/日程/项目时间线创建表单接入同步草稿离页确认，未决创建与读回拦截；新增60项、联合41文件1053/1053及受影响类型/UI/双语验证通过。旧测试使用正式导航入口，强制卸载恢复与原生验收明确区分。见[创建表单证据](./navigation-create-form-protection-evidence.md)。父项保持开放，下一核查已有内容编辑与其余逐页边界。
  - 2026-10-02 注销同步防重与本地合成身份历史验收：23文件549/549；根入口不重种历史、Forward条目保留。额外严格App类型检查仍有35条基线诊断，真实身份与其余页面未验收，父项不关闭。[本地证据](./navigation-logout-identity-evidence.md)。
  - 2026-10-02 document边界续行：刷新不重种历史；dirty/pending/unknown各自刷新与跨文档Back捕获原生beforeunload取消事件且草稿保留，刷新后再次Back与精确重放有证据。5文件179/179、夹具5/5通过。[边界证据](./navigation-history-document-evidence.md)。不是强制离开或全浏览器验收，父项保持开放。
  - 2026-10-02 Task 4运行时接入：accepted订阅及history恢复/准入/重放、双语故障UI、注销迟到命令隔离；23文件545/545与类型/UI/双语通过，内置浏览器Back/Forward及pending/unknown保留有局部证据。[运行时证据](./navigation-history-runtime-evidence.md)。刷新/跨document/键盘触控门禁和父项保持开放。
  - 续行Task 3：TaskEditor两个实际入口及侧栏显式导航已有dirty/写入锁保护，22文件490/490与类型/UI/双语/清单通过。[本地证据](./navigation-task-editor-bridge-evidence.md)。history与原生验收尚未完成，R2-008不关闭。
  - 2026-10-02 已确认的共享导航方案进入实现：独立准入核心24/24、联合3文件87/87及类型/UI构建通过；尚未接入页面或history，R2-008不关闭。见[核心证据](./2026-10-02-navigation-gate-core-evidence.md)。
  - 续行：共享导航已接入每window准入与25处获准回调，真实任务/收件箱取消无查询漂移、确认注销清私有状态；20文件437/437及位置追加异常测试15/15通过。[本地证据](./navigation-atomic-route-commits-evidence.md)。TaskEditor与history尚未接入；R2-008不关闭。
  - [x] 2026-10-02 任务编辑器关闭/Escape 的 dirty 确认和 beforeunload 提醒；覆盖八类输入、旧决定单次消费、pending/unknown 保持锁定，并修复子表单读回覆盖其他草稿。新增16项，联合167/167及类型/UI构建/双语检查通过。见[本地证据](./2026-10-02-task-editor-dirty-evidence.md)。父项仍开放；全局导航/后退前进保护及原生验收未完成。
  - [x] 2026-10-02 专注完成/放弃确认：精确会话及关联日程影响、默认取消、同步单次消费、旧决定失效、暂停/恢复互斥；新增27项，联合211/211及类型/UI构建/双语检查通过。见[本地证据](./2026-10-02-focus-action-confirmation-evidence.md)。父项仍开放；下一任务编辑器未保存草稿保护。
  - 2026-10-02：日程取消的共享确认、默认保留焦点、旧决定失效、同批次创建/范围门禁已本地验证；新增24项，联合14文件163/163。见[日程取消本地证据](./2026-10-02-calendar-cancel-confirmation-evidence.md)。保留CAS/未知写恢复，专注页、全站dirty及原生验收继续开放，父项不关闭。
  - 2026-10-02：收件箱归档/恢复/转任务接入共享确认、前后状态与实际影响，原始CAS/只读恢复、取消零写入与同批次新建保护有本地证据；见[收件箱操作确认](./2026-10-02-inbox-action-confirmation-evidence.md)。下一核查日程取消，其余页面及原生验收仍开放，父项不关闭。
  - 2026-10-02：目标/项目状态变更显示精确目标、前后状态与非级联影响；取消零写入、旧确认失效、原CAS/未知写保护及创建竞态有本地证据；见[目标项目状态确认](./2026-10-02-planning-status-confirmation-evidence.md)。其他页面和原生验收仍开放，父项不关闭。
  - 2026-10-01：任务删除接入目标/不可逆影响确认，取消零写入、单次确认及旧列表/过滤失效、失败回读锁有本地证据；见[任务删除确认](./2026-10-01-task-delete-confirmation-evidence.md)。其他页面及原生验收未闭合，父项不关闭。
  - 2026-10-01：审核队列/详情三种决定接入目标及影响确认，取消零写入、多行互斥、过期确认失效和备注草稿保护有本地证据；见[审核确认](./2026-10-01-admin-review-confirmation-evidence.md)。全站离开保护与原生验收仍开放，父项不关闭。
  - 2026-10-01：附件重试接入共享确认，解释重新排队不等于解析成功；取消零写入、单次消费、读取/过滤/权限失效及未知结果先读有本地证据。见[附件确认](./2026-10-01-admin-asset-confirmation-evidence.md)。其余页面与原生验收未完成，父项保持开放。
  - 2026-10-01：空间/集合编辑确认显示目标及字段前后值，四类创建/编辑表单页内取消保护 dirty，保留原始 CAS 和未知结果先读；见[空间集合证据](./2026-10-01-admin-space-confirmation-evidence.md)。其他页面、全站离开保护和原生验收仍开放，父项不关闭。
  - 2026-10-01：重复候选三种决策接入共享确认，显示精确目标和实际“只记录决策/审计”影响；取消、单次提交、旧确认失效及只读恢复有本地证据。见[重复候选证据](./2026-10-01-admin-duplicate-confirmation-evidence.md)，其他页面及原生验收未完成，父项不关闭。
  - 2026-10-01：菜单行操作及编辑保存接入共享确认、字段前后值和导航影响说明，创建/编辑表单取消前保护 dirty；原确认失效和冲突/未知写恢复保留。见[菜单证据](./2026-10-01-admin-menu-confirmation-evidence.md)。仍不代表全部页面与原生验收完成。
  - 2026-10-01：角色权限保存及成员归属接入共享确认与影响说明；编辑器内 dirty 切换确认、待定写锁和旧确认隔离有本地测试。见[角色证据](./2026-10-01-admin-role-confirmation-evidence.md)，其他页面及原生验收仍缺，父项不关闭。
  - 2026-10-01：共享 ConfirmAction 已在成员访问启用/禁用中本地接线，目标/影响、取消、单次确认及失效保护见[证据](./2026-10-01-admin-member-confirmation-evidence.md)。仅一个管理页的交付，全部危险操作迁移与原生验收仍缺，父项不关闭。
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

## R4 — 任务、看板与扩展工作区闭环

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

- [ ] `R4-013` 收集箱缺少数字分页、完整归档转任务旅程和过期响应保护。验收：完成采集、分页、归档及转任务后刷新恢复；失败可重试且不显示旧请求结果。 发布与真实浏览器证据单独记录。
- [ ] `R4-014` 目标缺少数字分页、编辑关联和进度状态完整闭环。验收：创建并编辑目标、关联任务、更新进度后分页返回，状态与服务端一致且撤权不泄露。 发布与真实浏览器证据单独记录。
- [ ] `R4-015` 项目缺少数字分页、关联编辑、独立摘要恢复和过期响应保护。验收：编辑项目关联后分页返回；单个摘要失败可独立重试，其他项目不丢失且不串用户。 发布与真实浏览器证据单独记录。
- [ ] `R4-016` 日历固定十四天范围缺少日期导航、数字分页、编辑及时区边界闭环。验收：跨日期与时区浏览分页事件，编辑后恢复原范围，空态和错误可恢复且不漏重复事件。 发布与真实浏览器证据单独记录。
- [ ] `R4-017` 今日摘要缺少截断后的继续入口、业务下钻、深层校验及时区和双成员聚合证明。验收：摘要超过上限时可进入对应列表继续查看；畸形数据可恢复且两成员跨日摘要互不泄露。 发布与真实浏览器证据单独记录。
- [ ] `R4-018` 专注缺少任务选择、可靠耗时展示和旧响应保护的完整会话旅程。验收：选择有权限的任务开始专注，暂停恢复刷新后耗时准确；旧响应不能覆盖新会话。 发布与真实浏览器证据单独记录。
- [ ] `R4-019` 复盘周期标签可能领先旧内容，聚合未按周期完整过滤且缺少刷新、深层校验和双成员证明。验收：切换日/周周期时内容与标签一致，统计仅含该范围；刷新可恢复且不同成员数据隔离。 发布与真实浏览器证据单独记录。
- [ ] `R4-020` 收集创建的前端逻辑意图没有稳定客户端键，响应丢失重试可能重复写入。验收：重复提交及响应丢失后重试只创建一条采集记录；不同成员的相同键互不影响。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-021` 采集归档缺少条件更新、重放和并发收敛证明。验收：并发归档与旧版本编辑产生明确冲突；重复归档收敛且不能修改其他成员记录。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-022` 采集转任务缺少跨实体原子转换及响应丢失后的稳定重试证明。验收：并发转换和断线重试只产生一个关联任务，采集状态与任务一致且跨成员请求被拒绝。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-023` 目标创建的前端逻辑意图缺少稳定客户端键与重复写入抑制证明。验收：连续点击与响应丢失后重试仅创建一个目标；复用键修改内容被明确拒绝且成员隔离。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-024` 目标状态变更缺少预期状态约束和并发重放收敛证明。验收：两个会话同时变更目标状态时只接受合法版本，冲突可恢复且重试不覆盖新状态。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-025` 目标进度更新缺少版本条件和旧请求覆盖防护证明。验收：新旧进度请求逆序到达时旧版本不能覆盖新值；响应丢失后重试保持同一结果。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-026` 项目创建缺少前端稳定意图键和端到端重试去重证明。验收：重复创建及断线重试只有一个项目，键冲突可见且其他成员无法读取该项目。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-027` 项目状态变更缺少条件更新和重试冲突恢复证明。验收：并发归档与激活出现明确冲突，刷新取得权威状态且重复请求不覆盖更新结果。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-028` 日历事件创建缺少前端稳定客户端键和断线重试去重证明。验收：重复点击与断线重试只生成一个相同时间事件，修改意图使用新键且跨成员隔离。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-029` 日历事件取消缺少与编辑并发时的条件约束及重放证明。验收：取消与编辑并发时结果明确，重复取消收敛，另一个成员无法取消或读到事件。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-030` 专注启动缺少稳定意图键及并发启动的单会话约束证明。验收：双窗口同时启动与断线重试最多保留一个活动会话，相同意图不重复记时且成员隔离。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-031` 专注暂停缺少预期状态约束和并发耗时累加防护证明。验收：两个暂停请求并发只累计一次耗时，旧会话请求不能影响新会话且重试收敛。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-032` 专注恢复缺少条件状态迁移和并发重放证明。验收：重复恢复只设置一次开始时间，已完成会话不能重新启动且跨成员请求被拒绝。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-033` 专注完成缺少终态竞争约束和重复耗时统计抑制证明。验收：完成与暂停并发时仅一次合法终态写入，重复完成不累加耗时并保留准确结果。 补充前端到 Worker 的重试及双成员回归。
- [ ] `R4-034` 专注放弃缺少与完成竞争的条件写入和重试终态收敛证明。验收：完成与放弃竞争时仅接受一次合法迁移，重试不改变终态且其他成员不可操作。 补充前端到 Worker 的重试及双成员回归。
- [x] `R4-035` 复盘周期快照收敛（2026-09-28 UTC 本地）：同成员/周期唯一键，单 SQL 聚合与 UPSERT、单调观察时间及版本、每次 GET 刷新；并发只保留一行、失败整体回滚、显式重试与双成员隔离已验证。幂等指身份收敛而非冻结响应字节，源数据改变后重读得到新内容。App 刷新失败/重试及真实 Worker/D1 证据见 EXT-REV-03；真实身份原生与发布验收仍归独立旅程，不提升父项 C04。

- [ ] `R4-036` 项目时间线缺少数字分页、跨项目旧响应保护及完整编辑旅程。验收：进入项目时间线后分页和编辑，切换项目时旧响应不覆盖新内容；失败可重试且撤权不泄露。
- [ ] `R4-037` 时间线创建缺少前端稳定意图键和断线重试去重证明。验收：双击创建与断线重试只产生一个条目，跨项目复用键被拒绝且不同成员隔离。 补充前端到 Worker 的双成员与重试回归。
- [ ] `R4-038` 时间线状态变更缺少预期版本条件及并发重放收敛证明。验收：两个会话同时更新条目时旧版本不能覆盖新状态，重试收敛且其他成员无法修改。 补充前端到 Worker 的双成员与重试回归。

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
  - D01-A（2026-09-14）已本地接入待审核、解析队列和成员三个授权列表的权威总数，并覆盖加载/零值/错误重试/权限与过期响应；见 `docs/product/2026-09-14-admin-dashboard-authoritative-counts-evidence.md`。趋势、排行、活动与跨页对账未据此完成，父项保持未勾选。
- [ ] `R6-002` 统计支持日期范围、趋势、来源、页面和访客数字分页。
- [ ] `R6-003` 审核列表/详情支持发布、退回、拒绝和冲突恢复。
  - D02-R1 读取恢复、权限清理、对象匹配、导航隔离与队列/详情往返已本地验证，见 `docs/product/2026-09-16-admin-review-read-recovery-evidence.md`。前端同步互斥不等于服务端幂等；发布/索引/通知闭环、D02-R2、发布和真实浏览器验收仍待完成，因此父项保持开放。
  - D02-R2 依 `docs/superpowers/specs/2026-09-16-admin-review-write-recovery-design.md` 分四批执行。A 已修复首次/重放可见性一致，新增 24 项真实 D1 并发/响应丢失/冲突/鉴权回归，见 `docs/product/2026-09-16-admin-review-replay-contract-evidence.md`。B 已本地补齐权威回执、四种索引状态、真实说明和原载荷恢复，见 `docs/product/2026-09-16-admin-review-write-ui-evidence.md`。C 已本地补齐审核通知事务、去重、当前目标权限和旧通知迁移，见 `docs/product/2026-09-16-admin-review-notifications-evidence.md`。D1/D2 本地故障矩阵及三身份 HTTP/DOM 回归已补齐，15 文件 341 项通过，见 `docs/product/2026-09-17-admin-review-acceptance-matrix.md`；D3/D4 真实交互与发布验收仍未完成，不改变 R6-003 完成状态。
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

2026-09-27 C03 关联编辑本地增量：当前缺口矩阵为 87 项（47 P0 / 39 P1 / 1 P2）；新增四个关联写操作的并发及持久恢复 gap 归属已有 R4-015，R4 当前负责 38 gap，实施原子仍为 124 个。保留历史 M02 的 83 项快照，不提升父项、发布或真实浏览器验收。

2026-09-28 UTC D02 空间表单增量：三个新增可达写接口已登记；同编辑器键重放和编辑版本冲突有本地证据，但刷新/卸载意图恢复与旧客户端兼容边界仍列 gap。当前矩阵实算 100 项（53 P0 / 46 P1 / 1 P2），R6 负责 30 gap，统一沿用 R6-008；父项和实施原子数不因此增加，发布/原生验收不变。

2026-09-28 UTC D02 菜单创建与层级编辑已补齐本地入口及条件写回归；新增创建 gap 归 R6-007，当前矩阵 101 项（54 P0 / 46 P1 / 1 P2），R6 负责 31 gap。保留跨刷新重放、真实身份投影及原生验收边界，不新增父任务。


## 2026-10-02 专注草稿离页保护续行

基线 `fff9a75`：FocusPage 标题/任务选择纳入 useCreateDraft，取消与最终准入拒绝保留草稿；同事件最新标题提交、确认/启动后迟到编辑隔离，预检转写入后旧确认不能放行。4项RED→GREEN，共8项新增测试；定向8文件224/224、扩大50文件1254/1254、严格组件DOM类型/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-focus-draft-protection-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放，下一允许继续其他页面草稿/未决写入核查，无外部阻塞。合成DOM不是原生验收；未push/发布/远程迁移。


## 2026-10-02 问答未决请求离页保护续行

基线 `14fd10f`：AgentConversationRoute 同步pending/内存意图/当前成员恢复记录接导航与beforeunload守卫；未知或损坏记录不误放行，正常回执清理或显式停止/放弃才释放，只读恢复不误锁。7项行为RED→GREEN，共12项新增，定向6文件135/135、扩大50文件1266/1266、项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-write-protection-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许继续未提交问题/来源草稿与反馈写入核查，无外部阻塞；未push/发布/远程迁移。不是原生或真实身份验收。


## 2026-10-02 未提交问题离页保护续行

基线 `e278d78`：问答问题文本接共享草稿保护，同事件最新值提交，取消/最终准入拒绝保留输入；已提交显示值独立基线，重试旧问题不覆盖新草稿，存储错误页保留确认。10项行为RED→GREEN；定向2文件98/98、扩大50文件1276/1276、严格组件DOM类型/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-question-draft-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许来源选择草稿与反馈写入核查，无外部阻塞。未push/发布/远程迁移，不是原生或真实身份验收。


## 2026-10-02 来源选择草稿离页保护续行

基线 `d6811f8`：来源草稿归属路由，普通离页确认、取消/拒绝保留；应用精确快照只在真实提交时更新基线，单次收尾释放预约，仍尊重其他守卫；补齐同事件最新范围、交叉确认锁、错误卸载及旧成员回调隔离。两轮行为RED（9项、3项），最终新增17项，定向8文件234/234、扩大50文件1293/1293、受影响严格DOM/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-source-draft-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许反馈未决写入与剩余逐页核查，无外部阻塞；未push/发布/远程迁移，不是原生/身份验收。


## 2026-10-02 Agent反馈未决写入保护续行

基线 `d2f4520`：反馈同步锁归属Agent路由，发送中/未知阻止普通离页及问题/来源替换，严格回执才释放；保留原反馈显式重试，确认期间、保存/卸载后和同事件来源重启后的旧回调均隔离。两轮行为RED（12项、1项），最终新增16项，定向8文件250/250、扩大50文件1309/1309、受影响组件严格DOM/项目类型/UI/VM隔离/双语通过。证据：`docs/product/navigation-agent-feedback-protection-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。未新增反馈刷新恢复日志，未冒充原生/真实身份或生产验收；下一允许继续其余逐页及剩余门禁，无本地外部阻塞。未push/发布/远程迁移。


## 2026-10-02 知识投稿离页保护续行

基线 `ed897a3`：成员投稿草稿接共享离页确认，pending/未知/损坏意图保留锁；字段增量合并、确认期间写入拒绝、原身份重试及旧成员回调隔离，成功清理记录才解锁，实际App导航同步清理已丢弃草稿。七轮单项行为RED→GREEN，共新增14项；投稿32/32、扩大58文件1408/1408、项目类型/UI/VM隔离/双语/清单通过。附加严格DOM检查仍有既有资产组件收窄错误，全App34条旧诊断无新增，未声称严格检查全绿。见 `docs/product/navigation-submission-protection-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许搜索页已保存视图草稿与写入生命周期核查，无本地外部阻塞；未push/发布/远程迁移，不是原生/真实身份验收。


## 2026-10-02 搜索已保存视图离页保护续行

基线 `c7890bd`：修复 POST/PATCH 误传 filters.v 的真实服务契约错误；名称草稿、同步写入锁、严格回执、精确删除确认及成员隔离接入共享保护。未知创建仅分页只读核对目标当前状态，不重发无幂等键的 POST；删除仅接受明确目标不存在证明。保存/应用补齐空间、集合、标签和模式。20项新增，定向4文件34/34、扩大61文件1434/1434、项目类型/受影响组件严格DOM/UI/VM隔离/双语通过。见 `docs/product/navigation-saved-view-protection-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许搜索词输入草稿及剩余逐页门禁，无本地外部阻塞。未新增跨刷新意图日志或可见列表分页；未push/发布/远程迁移，不是原生/真实身份验收。


## 2026-10-02 搜索词草稿离页保护续行

基线 `b371c23`：搜索输入不再被旧结果query覆盖，提交取同步最新值，通过精确草稿预约和其他守卫共同准入；取消/最终拒绝保留，实际提交才更新基线。同目标重复提交不增加历史条目；与已保存视图写入/决策互斥，旧成员回调隔离。初始8项RED、追加重复历史1项RED，最终新增14项；定向4文件37/37、扩大63文件1450/1450、项目类型/受影响组件严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断、身份无新增，不记全绿。见 `docs/product/navigation-search-query-draft-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许知识阅读页私人笔记的草稿/加载/保存/共享核查，无本地外部阻塞；未push/发布/远程迁移，不是原生/真实身份验收。


## 2026-10-02 知识阅读页笔记草稿与保存保护续行

基线 `b5cb58b`：成员/知识项生命周期隔离、权限读取前禁写、私人标题/正文 dirty 离页保护、同步保存意图及严格回执、unknown 仅只读核对，拒绝草稿缓存按成员隔离；成功缓存清理失败不解锁。初始12项行为RED、缓存2项追加RED后修复，新增22项通过；定向4文件47/47、扩大67文件1497/1497、项目类型/新hook严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断、身份无新增，不记全绿。见 `docs/product/navigation-reader-note-protection-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许笔记共享/撤销的精确确认、同步锁与未知结果核对；跨刷新未知意图恢复、存储不可删除时的丢弃持久性及原生/双身份验收仍待完成。无本地外部阻塞；未push/发布/远程迁移，不是生产验收。


## 2026-10-02 知识阅读页笔记共享与撤销保护续行

基线 `800f139`：共享/撤销精确影响确认、同步去重、与笔记草稿/保存互斥、严格状态码和内容回执、unknown 仅权限及完整列表只读核对，旧成员/旧行回调隔离。初始10项行为RED后修复，新增26项；定向3文件55/55、扩大68文件1523/1523、项目类型/新hook严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断，身份无新增，不记全绿。见 `docs/product/navigation-reader-note-sharing-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许私人笔记缓存丢弃失败及跨刷新未决意图恢复；原生/双身份验收仍待完成。无本地外部阻塞；未push/发布/远程迁移，不是生产验收。


## 2026-10-02 私人笔记缓存丢弃失败保护续行

基线 `e506441`：缓存清理由已提交事件移至最终导航准入；删除及读回失败阻止离页并保留内存草稿/提示，历史permit仅实际重放到达才清理，失败恢复原条目。取消、其他守卫拒绝及过期permit不提前删缓存。4项行为RED后修复，共新增12项；定向5文件126/126、扩大68文件1535/1535、项目类型/受影响hook严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断、身份无新增，不记全绿。见 `docs/product/navigation-reader-note-cache-discard-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008及Task 4整体开放。下一允许成员隔离的笔记保存/共享未决意图持久恢复；原生/双身份验收仍待完成。无本地外部阻塞；未push/发布/远程迁移。


## 2026-10-02 私人笔记未决意图恢复续行

基线 `0f3857e`：保存/共享/撤销共用 tab/member/item 隔离的未决意图日志，发送前持久化及读回；重挂载先验权限、恢复草稿/unknown且不重发，终态持久化后清理，存储异常只读恢复与旧回调隔离。追加修复恢复权限读取期间的离页警告和缓存读取失败后的旧草稿复活。三轮行为RED（7/2/2）后新增41项；最终扩大69文件1576/1576、项目类型/受影响严格DOM/UI/VM隔离/双语通过。全App严格检查仍有34条既有诊断，不记全绿。见 `docs/product/navigation-reader-note-intent-recovery-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许管理员角色页草稿/未决写入接共享离页保护，无本地外部阻塞；原生/双身份验收仍待完成。未push/发布/远程迁移；tab存储与DOM重挂载证据不等同原生刷新、备份或跨标签页幂等。


## 2026-10-02 管理员角色页共享离页保护续行

基线 `f90ebf4`：权限、成员输入及角色创建字段接入共享草稿守卫；取消/最终拒绝不丢输入，实际离页提交才重置。未决写入锁由路由持有，编辑器因403等拒绝卸载也不能绕过；只读核对成功后按现有恢复协议解锁，不自动重发。角色创建同步取值去重、迟到回执不清新输入，列表刷新不覆盖独立权限草稿。首轮12项行为RED、追加刷新1项RED后修复，新增16项，最终扩大74文件1656/1656；项目类型、角色页严格DOM、UI/VM隔离、双语通过。全App严格DOM诊断34降至32（修正角色页2条类型收窄，无新增），仍不记全绿。见 `docs/product/navigation-admin-role-leave-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与Task 4整体开放。下一允许管理员菜单页草稿/未决写入保护，无本地外部阻塞；管理员写入跨刷新意图恢复及原生/双身份验收仍待完成。未push/发布/远程迁移。


## 2026-10-02 管理员菜单页共享离页保护续行

基线 `6cbc633`：创建/编辑/排序草稿接共享离页确认，取消或最终拒绝保留输入；动作确认与离页互斥。路由持有pending/unknown锁，403卸载编辑器也无法绕过，仅显式只读恢复，不自动重发。排序恢复区分已提交尝试与独立草稿，保留既有冻结CAS及确认协议。首轮13项行为RED后修复，并修正一项已有排序恢复回归，新增15项；最终扩大79文件1774/1774、项目类型、菜单组件严格DOM、UI/VM隔离与双语通过。全App严格DOM32降至31条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-menu-leave-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许管理员空间页共享离页保护，无阻止本地工作的外部条件；跨刷新管理员意图恢复及原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员空间与集合页共享离页保护续行

基线 `71728f8`：新建/编辑空间与集合四类草稿接共享离页守卫，取消/最终拒绝保留输入，动作确认与离页决策互斥。路由持有创建/修改未决写入锁，403卸载编辑器仍阻止离页，显式只读恢复且不重发。额外区分只读失败与未知写入，避免无写入用户被困；保留冻结版本、集合请求键和既有恢复协议。首轮19项行为RED、追加只读边界3项RED后修复，共新增24项；两文件98/98、扩大82文件1877/1877、项目类型、空间组件严格DOM、UI/VM隔离和双语通过。全App严格DOM仍31条旧诊断、身份无新增，不记全绿。见 `docs/product/navigation-admin-space-leave-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008与Task 4整体开放。下一允许管理员成员状态操作确认及未决写入共享离页核查，无本地外部阻塞；管理员跨刷新意图恢复与原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员成员状态共享离页保护续行

基线 `8251d8b`：成员启用/停用确认接共享离页守卫，同事件点击与离页互斥；路由持有实际PATCH/未知结果锁，401/403隐藏列表不再清掉并发写入记录。区分有效PATCH回执与行操作回读锁，已确认写入不会因筛选缺行被困；未知结果只允许本路由只读筛选/分页恢复，不重发，不绕过其他守卫，缺行或失败不解锁。首轮10项行为RED后修复，共新增15项；两目标67/67，扩大84文件1928/1928，项目类型、成员组件严格DOM、UI/VM隔离、双语及清单通过。全App严格DOM仍31条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-member-leave-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与导航Task 4整体开放。下一允许管理员去重队列动作确认及未知决定共享离页核查，本地无外部阻塞；管理员跨刷新意图恢复及原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员去重队列共享离页与单项只读恢复

基线 `282628f`：去重决定确认接共享离页守卫，路由持有实际POST及未知结果锁，401/403隐藏列表不清掉未结束写入。新增受现有管理员权限保护的单项只读GET，核对pending页缺失项的当前状态及canonical三元组，不从缺行推断成功、不重发决定；有效POST回执与行按钮刷新锁分离。语言切换回读拒绝时保留实际POST，迟到回执不能覆盖新作用域。四轮行为RED（3/3/5/1）后新增33项；最终扩大89文件2094/2094，项目类型、去重组件严格DOM、UI/VM隔离、双语与清单通过。修正去重页既有类型收窄，全App严格DOM31降至28条旧诊断，无新增，不记全绿。见 `docs/product/navigation-admin-duplicate-leave-evidence.md`。29范围内/5完成/24未关闭；A05/R2-008与导航Task 4整体开放。下一允许管理员审核队列确认、草稿及未决决定共享离页核查，本地无外部阻塞；管理员跨刷新意图恢复及原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员审核队列共享离页与未知结果保护

基线 `bcdb716`：共享审核控件的决定/丢弃弹窗与离页互斥，拒绝/退回备注接共享草稿确认；同一对象回读保留未提交备注，但旧决定确认失效。队列路由持有实际预览/POST与未知意图锁，语言刷新及401/403清屏不清掉在途操作。新增未知结果只读核对入口，缺行读受权详情；终态才解除未知锁，pending、失败或不匹配均保留；保留既有显式原样重试，不自动重发。匹配回执与读取失败分离，空页修正在提交后的React渲染完成后进行，强制卸载的迟到操作不污染重挂载。首轮14项行为RED、4项原有安全对照通过；共新增22项，最终扩大97文件2206/2206。项目类型、审核控件/队列/详情组件严格DOM、UI/VM静态隔离、双语通过；全App严格DOM仍28条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-review-queue-leave-evidence.md`。29范围内/5完成/24未关闭，A05/R2-008及导航Task 4整体开放。下一允许审核详情路由级未决操作保护，并核对队列回读移除行时的独立未提交草稿；当前无阻止本地工作的外部条件。跨刷新意图恢复、原生/真实身份验收仍开放。未push/发布/远程迁移。


## 2026-10-02 管理员审核详情路由级未决操作保护

基线 `5256748`：详情路由而非可卸载编辑器持有实际POST/未知意图离页锁；401/403清屏、404及读取失败不误清未决操作。读取依赖与写入挂载生命周期分离，更换语言对象不遗忘在途POST；强制身份卸载仍使迟到回执失效。未知结果允许受权单项GET核对，精确ID终态才解除；pending、缺失、拒绝及畸形均保留，404未知页保留读取重试入口。保留冻结原样显式重试，不自动重发；同对象背景刷新保留备注。首轮8失败/25通过后修复，新增12项；目标3文件69/69、扩大97文件2218/2218。项目类型、详情路由/详情页严格DOM、UI/VM静态隔离和双语通过；全App附加严格DOM仍28条既有诊断，无新增，不记全绿。见 `docs/product/navigation-admin-review-detail-leave-evidence.md`。主清单29范围内/5完成/24未关闭，A05/R2-008及导航Task 4整体开放。下一允许审核队列回读移除行的独立未提交草稿保护及详情错误清屏的独立草稿生命周期核对。本地无外部阻塞；跨刷新意图恢复、原生/真实身份验收等仍开放。未push/发布/远程迁移。


## 2026-10-02 审核独立备注草稿生命周期保护

基线 `c1b65e2`：备注所有者提升至审核路由，会话内按对象保存非默认输入；队列缺行/权限清屏及详情403/404/500不丢草稿，重新授权读取原对象后恢复。通用离页确认不泄露隐藏备注，取消/最终准入拒绝保留，真正导航才放弃；未知提交不可借此解锁。自己的匹配回执/未知操作终态核对仅清理对应草稿，其他对象或他人终态引起的独立备注不静默清空。7项行为RED后修复，共新增13项，扩大97文件2231/2231。项目类型、草稿/审核组件严格DOM、UI/VM静态隔离及双语通过；全App仍28条既有诊断，不记全绿。见 `docs/product/navigation-review-draft-lifetime-evidence.md`。29范围内/5关闭/24开放；A05/R2-008及导航Task 4保持开放。下一允许审核评论面板独立草稿、同步提交去重、迟到回执与未知写入保护；无本地外部阻塞。跨刷新持久恢复与原生/真实身份等仍开放。未push/部署/远程迁移。


## 2026-10-02 审核评论草稿与未决写入归属

基线 `acd295a`：审核评论草稿/实际POST所有者提升至详情路由，错误和权限清屏不卸载未决保护；同事件同步去重、冻结输入、精确目标/正文/非编辑回执才释放，旧对象写入及旧GET迟到无效。普通dirty离页取消/最终拒绝保留，真正导航才清除；评论读取失败隐藏列表/正文，同对象重新获准后恢复。服务端当前每次POST生成新ID、无幂等键，列表最多100条，不能用相同正文或空列表推断某次POST结果。因此网络/通用HTTP错误及畸形回执均保留未知锁，不自动或手动重发；明确pre-write业务拒绝可纠正重提。首轮16行为失败/4通过后修复，另4项畸形列表RED→GREEN；新增32项，扩大100文件2267/2267。项目类型、评论所有者/面板/详情路由严格DOM、UI/VM静态隔离与双语通过；全App严格DOM仍28条既有诊断无新增，不记全绿。见 `docs/product/navigation-review-comment-owner-evidence.md`。29范围内/5关闭/24开放，A05/R2-008及导航Task 4保持开放。下一允许本地实现评论幂等与精确未知结果恢复协议、补服务与Worker证据；不把未知锁当成完整恢复功能。跨刷新持久恢复、原生/真实身份门禁仍开放。无本地外部阻塞；未push/部署/远程迁移。


## 2026-10-02 审核评论唯一操作编号与精确恢复

基线 `3c64a8e`，用户确认“唯一操作编号＋同编号安全重试＋精确查询结果”。新增专用PUT/GET操作协议；会话成员/目标/UUID派生稳定主键，D1原子冲突保留原回执，同编号改正文409，独立精确查询不受100条列表限制，编辑不改变原回执。前端冻结编号和正文，未知结果允许显式同编号重试/精确核对；空结果、畸形回执和重试拒绝均不误清原未知操作，不回退旧POST或自动重发。服务/Worker首轮3项RED、客户端14项RED、所有者首轮18失败后修复；最终定向5文件119/119、扩大101文件2291/2291。项目类型、组件严格DOM、UI/VM隔离及双语通过，清单审计9/9。全App严格DOM仍28条既有诊断，与上轮日志一致；成熟度契约仍13/14（environments缺记录），不记全绿。证据见 `docs/product/navigation-review-comment-operation-evidence.md`。主清单29范围内/5关闭/24开放，A05/R2-008及导航Task 4不整体关闭。操作编号/正文仍仅内存保存，跨刷新持久恢复、原生/真实身份验收等仍开放。无阻止后续本地工作的外部条件；下一步允许继续导航保护剩余子项，但不能将会话内恢复宣称为跨刷新恢复。无push/部署/远程迁移，未扩展备份或加密范围。


### 2026-10-02：环境入口成熟度漏项修复（本地）

基线 `b4592a0`。补登记可见 `/environments` 的能力、领域来源、操作根与交付账本，保持 partial，并将真实 VM、离页/跨刷新恢复及发布验收缺口归属现有 R8-009。成熟度契约由13/14修复为15/15，页面矩阵151/151、环境页/实际本地Worker-D1专用16/16、项目类型与差异检查通过。通知摘要公共夹具补齐，原有权限和重试断言未放宽。矩阵102（54 P0/47 P1/1 P2），领域审计动态请求封装仍fail-closed失败，未伪造快照或宣称全绿。详见 `docs/product/2026-10-02-environments-maturity-inventory-evidence.md`。主功能29范围内/5关闭/24开放不变；D07、A05/R2-008及导航Task 4仍开放。下一允许本地修复审计封装识别、随后讨论页未知写/离页保护，无外部阻塞。未push/部署/远程迁移。


### 唯一操作编号与精确查询：复验和领域审计对账（本地）

基线 `a068950`。审核评论协议定向119/119复验通过；请求扫描新增有限条件方法/静态展开解析，未知调用仍fail-closed。环境请求四个显式传输点保留冻结意图与取消语义，专用18/18通过。领域30/30及源码快照check、成熟度15/15、项目类型/UI与静态VM入口隔离通过。领域能力34，矩阵105（34 manifest/71 domain，54 P0/50 P1/1 P2）；环境3条漏登记写操作归现有R8-005，评论旧POST源更正为PUT requests，无新增功能父项。详见 `docs/product/navigation-operation-audit-evidence.md`。主清单原30/范围内29/关闭5/开放24，A05、D07、R2-008及导航Task 4仍开放；内存编号不等于跨刷新恢复。下一允许继续讨论页未知写/离页保护，无本地外部阻塞。未push、部署或远程迁移。


### 讨论页未决操作所有权与离页保护（本地）

基线 `d408419`。讨论发送冻结唯一编号、正文、回复及提及对象，未知结果仅允许显式同编号重试；同步去重、陈旧处理器防护及既定草稿离页门禁生效。读取失败/权限撤销隐藏私人内容但不遗忘未决操作，恢复授权后仍核对原操作；跨epoch迟到回执不能清除它。创建与重放均严格校验精确回执，成功释放锁后才更新分页。首次路由11项RED、精确重放1项RED后修复；定向5文件65/65，既有审核评论精确PUT/GET协议复验119/119。扩大179文件3180项为3168通过/12失败；独立原始HEAD四文件复现同样12项，未隐藏、未跳过，也不记全绿。项目类型、组件strict DOM、UI/静态VM隔离、双语、成熟度15/15及领域快照通过。详见 `docs/product/navigation-discussion-operation-owner-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task 4与D07继续开放。讨论目前只有精确回执校验，尚无独立精确查询端点；编号仅内存保存，不代表跨刷新恢复或真实浏览器/VM验收。下一允许核对四文件既有回归失败，再补讨论精确查询与剩余导航子项，无本地外部阻塞。未push、部署或远程迁移。


### 导航扩大回归12项对账与无草稿离页修复（本地）

基线 `6a25d88`。修复阅读器加载/错误占位无缓存草稿时因尚无笔记所有者而错误阻止离页；未知写入、恢复与其他动作锁仍优先拦截。引用夹具补成员和正式导航，项目/权限夹具补独立壳层摘要及状态写确认，最近访问保持畸形响应整体拒绝。生产修复前引用/草稿44项42通过2失败，最终定向95/95；扩大179文件3185/3185通过，原12项失败已消除，增加5项回归而非删除/跳过。项目类型、hook严格DOM、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。证据见 `docs/product/navigation-regression-reconciliation-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除，A05/R2-008、导航Task 4及D07仍开放。下一允许讨论独立精确查询及剩余导航子项，无本地外部阻塞；未push/部署/远程迁移，未将本地测试升级为真实验收。


### 讨论消息独立精确查询（本地三件套）

基线 `f9891d8`。本地补齐“唯一操作编号＋同编号安全重试＋精确查询结果”：显示冻结UUID，新增会话成员/目标/编号精确GET，不依赖分页；GET无写入/通知副作用。客户端严格匹配原正文、回复及提及，复制输入以隔离异步突变，查询与重试互斥；空结果、错误、拒权和跨epoch迟到回执不换号、不遗忘操作。服务/客户端/Worker3项RED、交互6项RED及输入快照2项RED后修复。最终讨论5文件78/78、扩大179文件3198/3198、审核评论既有协议119/119；项目类型、组件strict DOM、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。详见 `docs/product/navigation-discussion-exact-result-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task 4和D07仍开放。编号仍内存保存，下一允许补跨刷新恢复与剩余所有者，无本地外部阻塞；未push/部署/远程迁移，预览页面未更新。


### 讨论未决操作同标签页刷新恢复（本地）

基线 `70b5510`。按会话成员和讨论隔离 sessionStorage，冻结唯一编号、正文、回复与提及；发送前保存并回读校验，恢复后只允许显式精确查询或同编号重试，不自动发送或查询。记录损坏、配额、静默丢写、冲突和清理失败均保留未知状态；授权失败隐藏私人恢复内容，成员/讨论切换及迟到回执不能误清旧记录。定向6文件101/101、扩大180文件3221/3221通过；项目类型、目标文件strict DOM、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。额外全App strict DOM仍有28项既有诊断，在真实基线复跑一致，未声称该额外门禁通过。详见 `docs/product/navigation-discussion-refresh-recovery-evidence.md`。仅同标签页会话恢复，不承诺关闭标签页/重启恢复，不包含普通未提交草稿持久化或原生浏览器验收。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task 4和D07仍开放。无本地外部阻塞，下一允许继续剩余导航边界和既有类型门禁对账；未push/部署/远程迁移，独立预览未更新。


### 全前端严格类型门禁与导航组件修复（本地）

基线 `bba363a`。原项目检查未覆盖全部前端TSX；新增独立DOM/Vite严格配置覆盖全部229个第一方前端TS/TSX，默认typecheck同时保留原Worker/项目检查，smoke纳入门禁合约。真实完整配置先27项类型RED，修复后全绿；ContextRail遗漏onNavigate解构的实际点击错误先1失败/1通过再修复。修复会话守卫、过滤器字面值推断、React清理/ref、状态联合收窄、看板取消状态及图谱工厂/容器校验，不降低类型要求。定向4文件51/51、扩大181文件3227/3227、门禁合约3/3、i18n13/13、App合约8/8、Worker与全前端类型、landing类型、UI/静态VM隔离、双语、成熟度15/15、领域快照及清单9/9通过。详见 `docs/product/navigation-frontend-type-gate-evidence.md`。旧28项App类型诊断仅属历史记录，当前正式前端门禁已通过。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task4与D07仍开放，不能以类型门禁替代原生浏览器/真实身份/VM验收。无本地外部阻塞，允许继续剩余导航所有者与恢复边界核对；未push/部署/远程迁移，独立预览不变。


### A01 源码操作清点与 D04 未接线核对（本地）

基线 `fc5a30e`。新增 AST 源码候选索引及独立漂移门禁，覆盖 237 个前端源文件、34 个业务入口、1024 个控件/回调/role/转发/监听器候选；110 个尚未归入入口，保留未解析/动态边界而不虚报可见覆盖。源码确认正式环境页仍是元数据流程，FilesPanel 只在独立 VM 工具接线，不能用工具验收代替 D04 工作台实现。详见 [证据](./frontend-operation-inventory-evidence.md)。A01 仅新增源码清点已完成子项，全部可见状态人工核对仍开放；原30/范围内29/关闭5/开放24，D08排除。不新增外部阻塞；允许继续人工状态核对及 D04 正式接线设计，未push/部署/远程迁移。


### 环境元数据操作三件套（本地）

基线 `0216778`。创建、改名、删除显示唯一编号；原编号/完整请求安全重试；新增会话成员限定的精确只读 GET。查询删除后的不可变回执，不以当前列表替代操作结果；未找到/错误/不匹配保留意图，查询与重试互斥，撤权清屏。已确认摘要展示编号、目标与版本，明确是历史回执。Worker93/93、页面/真实D1 35/35、共享fixture连接器50/50；类型、UI/静态VM隔离、双语与领域证据通过。失败运行与修正详见 [证据](./environment-exact-operation-result-evidence.md)。主清单原30/范围29/关闭5/开放24，D08排除；仅完成D04元数据子项，不关闭D04/G0。内存意图不等于跨刷新恢复；下一允许推进该恢复和离页边界，无新增本地外部阻塞。未push/部署/远程迁移，独立预览不变。


### 环境元数据未决操作同标签页刷新恢复（本地）

基线 `c4120d8`。为环境创建、改名、删除补齐原编号/原请求的跨刷新恢复；来源与成员隔离 sessionStorage，先保存并回读校验再发送。恢复不自动查询、不自动重试；完整冻结意图校验、存储失败/损坏/冲突/清理失败均阻止替换，显式重新检查不发送请求。恢复删除继续关闭目标网络，旧账户迟到回执不能清理记录。控制器及实际App重挂载两次RED后修复；页面/真实Worker/D1最终52/52，先前联合页面44+连接器50共94/94；四组契约45/45，类型/UI/静态VM隔离/双语/领域/源码索引通过。索引238文件、1028候选，不等于运行验收。详见 `docs/product/environment-operation-refresh-recovery-evidence.md`。主清单原30/范围29/关闭5/开放24，D08排除；仅关闭D04元数据恢复子项，D04/G0仍开放。没有新增加密、备份、迁移；未push/部署，独立预览未更新。下一允许继续本地离页边界及其余操作所有者对账，无新增本地外部阻塞；正式VM挂载仍受G0约束。


### 环境元数据离页与草稿结算保护（本地）

基线 `cc25c71`。创建及重命名草稿接入离页确认；删除确认和未知操作阻止普通离页，同步消费确认避免重复写入。创建按唯一编号结算，精确查询/重试成功清除原提交草稿，迟到列表刷新保留新输入。重命名保留原目标/版本，非法输入和取消不隐式提交。新增七例先 RED 后 GREEN，另加两例边界回归。环境页61/61与合约45/45（联合106/106）、Worker/全前端类型、UI构建/静态VM隔离、双语及领域快照通过；操作枚举239文件1031候选并通过校验。详见 `docs/product/environment-navigation-draft-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、导航Task4、D04继续开放。正式VM UI仍受G0约束；本地下一步允许继续剩余导航所有者核对。未push、部署、远程迁移，独立预览未更新。


### 看板移动未决写入离页保护与未知结果核对（本地）

基线 `2385f04`。看板在途/未知移动阻止普通离页及 beforeunload，仅放行本列只读分页；明确 4xx 拒绝回滚，传输失败/5xx/408/429/畸形回执保留冻结记录，仅显式只读核对或同目标原样重试后解锁，撤权清空、卸载迟到隔离。11 项 RED→GREEN，扩大 318 文件 4500/4500 及类型/UI/双语/清单/领域/成熟度通过。详见 `docs/product/navigation-board-move-protection-evidence.md`。主清单原30/范围内29/关闭5/开放24；C02、A05/R2-008、导航 Task 4 仍开放，未决记录不跨刷新。未push/部署/远程迁移。


### 通知更新进行中与未知结果的离页保护（本地）

基线 `8571747`。通知更新进行中和未知结果阻止普通离页及 beforeunload，本页只读查询变更仍放行；授权失败解除锁定，其余失败直到列表和摘要读回才解除。详见 `docs/product/navigation-notification-update-leave-evidence.md`。主清单原30/范围内29/关闭5/开放24；C05 与导航 Task 4 仍开放。未push/部署/远程迁移。


### 图谱动作进行中与未确认结果的离页保护（本地）

基线 `2e5448b`。图谱检查器动作原先随选中节点重置状态和 clientKey，进行中可离开、可切换节点重复发起，未确认后换节点即丢失原身份，明确拒绝与未知结果不分。现在进行中/未确认动作归页面所有，锁定期间阻止普通离页和 beforeunload，未确认提示可在节点被筛掉后同身份重试；明确 4xx（除 408/429）拒绝解锁换新身份，deferred 不加锁，401/403 进入 forbidden 清屏。新增 6 项先失败后通过，图谱 4 文件 25/25、全量 318 文件 4510/4510，类型、UI 构建、双语、操作清点与清单审计通过。详见 `docs/product/navigation-graph-action-leave-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；A05/R2-008、A02 与导航 Task 4 不关闭。未确认身份不跨刷新保留。未push/部署/远程迁移。


### 看板未知移动的跨刷新恢复（本地）

基线 `ef7e933`。看板未知移动原先只在同挂载内保留，刷新后锁与核对入口消失。现在发出前按标签页/成员写入移动记录并读回，写不进去则不发请求；匹配回执或明确 4xx（含 401/403）后清除，未知结果在刷新/重新挂载后恢复锁、核对与同目标重试；清除失败保持锁定，损坏或他人记录禁止移动且仅可显式丢弃。新增 16 项（路由 7 项先失败后通过），看板 52/52、全量 319 文件 4526/4526，类型、UI 构建、双语、操作清点与清单审计通过。详见 `docs/product/navigation-board-move-refresh-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；C02 不关闭，跨标签并发与原生验收仍开放。未push/部署/远程迁移。


### 任务编辑器未知写入的只读核对与跨刷新恢复（本地）

基线 `e98035b`。任务编辑器未知写入原先只能原样重试，重试遇 4xx（如别处改动后的 422）永久锁定；刷新后锁与入口消失；再次创建会换新 ID。现在七类写入改为可序列化意图，新增仅 GET 的核对（一致即已保存，不一致解锁并保留草稿），创建确认前复用同一 ID；发出前按标签页/成员记录，匹配回执、明确 4xx 或核对结论后清除，刷新后重新打开编辑器恢复锁；清除失败保持锁定，损坏或他人记录仅可丢弃。新增 31 项（路由 9 项先失败后通过），任务 4 文件 126/126、全量 320 文件 4557/4557，类型、UI 构建、双语、操作清点与清单审计通过。详见 `docs/product/navigation-task-write-recovery-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；C01 不关闭，列表行快捷操作未知结果、跨标签并发与原生验收仍开放。未push/部署/远程迁移。


### 任务列表快捷状态/删除的未知结果分流（本地）

基线 `c9b5abc`。任务列表行“完成/重新打开/删除”原先把网络失败、5xx、畸形回执都当“无法更新”，删除可能已生效却允许再次确认。现在复用可序列化意图（新增 delete，404 即已删除），发出前按标签页/成员记录；明确 4xx 清除并提示失败，未知结果进入列表级锁定提示（行操作与新建锁定，阻止离页，本页筛选分页放行），仅 GET 核对或同意图重试；刷新后草稿类操作回编辑器、其余在列表核对。新增 7 项（6 项先失败后通过），任务 5 文件 154/154、全量 320 文件 4564/4564，类型、UI 构建、双语、操作清点与清单审计通过。详见 `docs/product/navigation-task-list-write-recovery-evidence.md`。主清单原30/范围内29/关闭5/开放24，D08排除；C01 不关闭。未push/部署/远程迁移。


### 任务跨标签并发冲突：版本条件写入（本地）

基线 `fd97d49`。两个标签页同改一任务时后写静默覆盖。现在 PATCH 可带 expectedUpdatedAt、状态写入可带 expectedStatus（向后兼容）：已一致按无操作成功以保持未知重发幂等，过期返回 409，字段更新用条件 SQL 且版本严格递增。编辑器带读到的版本/状态，409 时重新读取并保留草稿；列表快捷状态和看板移动带行/源列状态，409 时提示并刷新。服务端 2 项、worker 1 项、前端 4 项先失败后通过；全量单元 320 文件 4570/4570，worker 1085/1087（graph-suggestions 2 项基线即失败、与本次无关），类型、UI 构建、双语、清点与清单审计通过。详见 `docs/product/navigation-task-cross-tab-conflict-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；C01/C02 不关闭。未push/部署/远程迁移。


### 任务进度、标签、关联的版本条件写入（本地）

基线 `752e435`。进度、标签替换和关联增删原先不看任务版本，后写覆盖。现在这三类请求可带 `expectedUpdatedAt`：已一致则无操作成功，过期返回 409，成功写入严格递增 `updated_at`；空正文的删除关联保持原样，已不存在的关联仍是 404。编辑器带上读到的版本，409 时重新读取并保留该子表单草稿。服务单测先失败后通过；任务相关 131/131，全量单元 320 文件 4572/4572，类型、双语、清点与清单审计通过。详见 `docs/product/navigation-task-side-write-conflict-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；C01 不关闭。子任务和依赖仍是后写生效。未push/部署/远程迁移。


### 子任务与依赖的版本条件写入（本地）

基线 `604e64e`。子任务修改和依赖增删原先不看版本。现在子任务 PATCH/删除可带子任务自己的 `expectedUpdatedAt`，依赖增删可带父任务版本：已一致则无操作成功，过期返回 409，已不存在仍是 404。服务单测先失败后通过；任务与结构用例 45/45，Worker 类型、清点与清单审计通过。详见 `docs/product/navigation-task-structure-conflict-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；C01 不关闭。页面仍无这两类控件。未push/部署/远程迁移。


### 任务状态、进度、标签和关联进入活动记录（本地）

基线 `1007e4a`。这四类操作已有审计，活动流却只返回投稿和知识。现在调用者自己的状态、进度、标签、关联和解除关联会出现在首页和知识页，他人的任务事件不出现；字段修改和删除不进入。活动用例先失败后通过，4/4，类型、文案、清点与清单审计通过。详见 `docs/product/navigation-task-activity-evidence.md`。讨论事件仍无审计行。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；R4-006 与 C01 不关闭。未push/部署/远程迁移。


### 自己发送的讨论消息进入活动记录（本地）

基线 `5cc659f`。发送讨论成功后没有审计，活动流看不到讨论。现在首次发送记一条不含正文的 `discussion.message_sent`，重放不记第二条；只有发送者的活动流返回它，并链到该线程。讨论用例先失败后通过；讨论与活动 16/16，类型、文案、清点与清单审计通过。详见 `docs/product/navigation-discussion-activity-evidence.md`。回复和提及仍只在通知里。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；R4-006 与 C01 不关闭。未push/部署/远程迁移。


### 看板方向键移动与窄屏横向到达（本地）

基线 `62781af`。看板改状态只能用下拉框，窄屏要滚完整列才看到下一列。现在焦点在卡片上时，左右方向键只把任务移到相邻且合法的列，并带上当前状态；选择框上的方向键不移动卡片；完成不能左移到阻塞。四列可横向滑动，宽屏仍四列并排。路由用例先失败后通过；看板 54/54，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-board-keyboard-evidence.md`。取消仍只在选择框。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；R4-009 与 C02 不关闭。未做真实触控验收。未push/部署/远程迁移。


### 通知未知更新跨刷新保留（本地）

基线 `fc6c6f7`。通知更新结果丢失后，锁只在当前挂载里，刷新就消失。现在已登录成员发出前先写入标签页记录，记不进去就不发送；刷新后离开仍被挡住，直到列表和未读数读回。坏记录禁止更新但允许离开，只能显式丢弃。三条用例先失败后通过；通知 38/38、壳层 13/13，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-notification-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；C05 不关闭。未push/部署/远程迁移。


### 图谱未确认操作跨刷新保留（本地）

基线 `4f0292c`。图谱操作结果丢失后，编号和离开锁只在当前挂载里，刷新后再次操作会换新编号。现在已登录成员发出前先记下节点和编号，记不进去就不发送；刷新后仍提示未确认，重试沿用原编号。坏记录禁止新操作但允许离开，只能显式丢弃。三条用例先失败后通过；图谱页面 16/16，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-graph-action-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A02 不关闭。未push/部署/远程迁移。


### 已保存视图未知写入跨刷新保留（本地）

基线 `d50d731`。保存或删除视图的结果丢失后，核对信息只在当前挂载里，刷新后再次保存可能重复创建。现在已登录成员发出前先记下创建内容或删除编号，记不进去就不发送；刷新后仍提示未确认，离开被挡住，核对只读服务端、不重发。坏记录禁止再写但允许离开，只能显式丢弃。三条用例先失败后通过；已保存视图路由 16/16，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-saved-view-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 审核评论未知写入跨刷新保留（本地）

基线 `dd7d96b`。评论结果丢失后，幂等编号只在当前挂载里，刷新后再次提交会换新编号。现在已登录成员发出前先记下编号和冻结正文，记不进去就不发送；刷新后仍提示未知，离开被挡住，重试沿用原编号。坏记录禁止再写但允许离开，只能显式丢弃。三条用例先失败后通过；评论所有者 32/32，相关审核前端 82/82，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-review-comment-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；R6-003 与 A05 不关闭。未push/部署/远程迁移。


### 审核决定未知结果跨刷新保留（本地）

基线 `78eb204`。发布、退回或拒绝的结果丢失后，原决定只在当前挂载里，刷新后可以再发一次。现在已登录成员发出前先记下动作和原载荷，记不进去就不发送；刷新后仍提示未知，离开被挡住，重试发送同一载荷。坏记录禁止再决定但允许离开，只能显式丢弃。三条用例先失败后通过；审核详情路由 45/45，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-review-decision-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；R6-003 与 A05 不关闭。未push/部署/远程迁移。


### 问答反馈未知评分跨刷新保留（本地）

基线 `d4664ed`。反馈没送达时，原评分只在当前挂载里，刷新后可以改评一次。现在已登录成员发出前先记下会话和评分，记不进去就不发送；刷新后仍提示未确认，离开被挡住，重试发送同一评分。坏记录禁止再评分但允许离开，只能显式丢弃。三条用例先失败后通过；问答路由 69/69，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-agent-feedback-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 审核队列未知决定跨刷新保留（本地）

基线 `712b82b`。队列上的决定结果丢失后只在当前挂载里，刷新后可以对同一投稿再决定一次。现在已登录成员发出前先记下原载荷，并记住当前正在核对的投稿；记不进去就不发送。刷新后仍提示未知，离开被挡住，重试发送同一载荷。坏记录禁止再决定但允许离开，只能显式丢弃。三条用例先失败后通过；审核队列 26/26，与详情合计 71/71，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-review-queue-decision-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；R6-003 与 A05 不关闭。未push/部署/远程迁移。


### 去重未知决定跨刷新保留（本地）

基线 `bd1dff0`。重复候选的决定结果丢失后只在当前挂载里，刷新后可以对同一条再决定一次。现在已登录成员发出前先记下候选、决定和规范三元组；记不进去就不发送。刷新后在只读核对完成前离开被挡住，读回后清记录且不重发。坏记录禁止再决定但允许离开，只能显式丢弃。三条用例先失败后通过；去重恢复 53/53，与确认合计 69/69，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-duplicate-decision-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 成员状态未知更新跨刷新保留（本地）

基线 `15db63f`。启用或停用如果结果丢失，只留在当前挂载里，刷新后可以对同一成员再改一次。现在已登录成员发出前先记下目标成员和目标状态；记不进去就不发送。刷新后在读到该行之前离开被挡住，读到后清记录且不重发。坏记录禁止再改状态但允许离开，只能显式丢弃。三条用例先失败后通过；成员刷新 3/3，与分页、确认合计 70/70，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-member-status-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 空间未知更改跨刷新保留（本地）

基线 `f77673e`。创建空间或修改空间与集合如果结果丢失，只留在当前挂载里，刷新后可以在重新读取前再提交一次。现在已登录成员发出前先记下创建内容或管理命令；记不进去就不发送。刷新后在只读结果回来前离开被挡住，读回后清记录且不重发。坏记录禁止再改但允许离开，只能显式丢弃。三条用例先失败后通过；空间刷新 3/3，与既有恢复合计 64/64，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-space-write-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 角色未知更改跨刷新保留（本地）

基线 `acf6059`。保存权限、创建角色或调整成员如果结果丢失，只留在当前挂载里，刷新后可以在重新读取前再提交一次。现在已登录成员发出前先记下这次更改；记不进去就不发送。刷新后在只读结果回来前离开被挡住，读回后清记录且不重发。坏记录禁止再改但允许离开，只能显式丢弃。三条用例先失败后通过；角色刷新 3/3，与恢复、确认合计 66/66，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-role-write-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 菜单未知更改跨刷新保留（本地）

基线 `03c28d5`。停用、显示、保存或删除菜单如果结果丢失，只留在当前挂载里，刷新后可以在重新读取前再提交一次。现在已登录成员发出前先记下这次更改；记不进去就不发送。刷新后在只读结果回来前离开被挡住，读回后清记录且不重发。坏记录禁止再改但允许离开，只能显式丢弃。三条用例先失败后通过；菜单刷新 3/3，与恢复、确认合计 100/100，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-menu-write-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。


### 资产重试未知结果跨刷新保留（本地）

基线 `5a600a7`。解析失败后的重试如果回执丢失，只留在当前挂载里，刷新后可以在重新读取前再提交一次。现在已登录成员发出前先记下这次重试；记不进去就不发送。刷新后在队列读回该行前离开被挡住，读回后清记录且不重发。坏记录禁止再重试但允许离开，只能显式丢弃。三条用例先失败后通过；资产刷新 3/3，与确认、分页路由合计 85/85，前端类型、文案、清点与清单审计通过。详见 `docs/product/navigation-asset-retry-refresh-evidence.md`。无迁移；主清单原30/范围内29/关闭5/开放24，D08排除；A05 不关闭。未push/部署/远程迁移。
