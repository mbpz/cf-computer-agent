# Memory Garden Roadmap

更新时间：2026-08-31

产品定位：面向 **5–20 名受邀成员**、运行在 **Cloudflare 免费层**、保留现有 **GitHub OAuth + D1 Session + HMAC Automation** 登录体系的私有 AI 知识操作系统。

当前交付事实以 [交付状态总账](./docs/product/delivery-status-ledger.md) 为唯一权威来源；本 Roadmap 只安排可部署、可回滚的纵向用户旅程。历史计划和旧 gate 是执行档案，不能替代 current-main 的发布或验收证据。

总账成熟度：`atoms=84`; `implementation=done:64,partial:5,pending:15,n/a:0`; `verification=done:68,partial:0,pending:16,n/a:0`; `release=done:0,partial:28,pending:56,n/a:0`; `acceptance=done:0,partial:8,pending:76,n/a:0`

**范围归属规则。** 每个非 legacy 总账原子恰好由一个 R 阶段的“范围”拥有；后续阶段只能在“前置依赖”和退出标准的 `consumed` 映射中消费更早阶段的原子，不重复拥有它们。`GATE-M0`、`GATE-M1`、`WS-001` 与 `WS-008` 是兼容历史 Roadmap/Checklist 的 legacy 映射，不纳入当前阶段。

明确排除：`IDN-002` 是可选 WeChat OAuth，当前 GitHub allowlist 已满足私有成员入口；在出现明确产品需求和独立发布/验收计划前，它可选且不在 R0–R6 范围内。

**产品与安全边界。** 不做公开注册、多租户 SaaS、计费、套餐或企业目录同步；不替换 GitHub OAuth 的 state、PKCE S256、primary verified email、allowlist、D1 哈希 Session 与 admin/contributor 分工。Automation 继续要求 HMAC + `APP_TOKEN`、只访问 legacy API、没有管理员权限。保留 `KnowledgeBase` Durable Object 类名和 migration tag `v1`；所有 D1 migration 只追加且必须可恢复。Agent 只能读取正式知识并产出草稿，不得发布、删除、改权限或调用任意网络、Shell、代码或浏览器工具。

**证据规则。** 本地 fixture 仅证明确定性逻辑，workerd 仅证明本地 Cloudflare runtime 合同；发布必须记录日期、版本和 migration 范围，验收必须记录真实角色旅程与脱敏证据。页面、README、历史勾选框、匿名 smoke 和口头确认均不能替代这些证据。所有审计仅保留 allowlist metadata，不记录正文、凭据或敏感输入。

### Workbench 产品成熟度 R1–R8 执行映射

此映射消费 [Workbench 产品成熟度缺口矩阵](./docs/product/workbench-product-maturity-gap-matrix.md)，是 2026-08-31 R0 审计之后的新执行顺序。下方原有 R0–R6 Roadmap 继续作为历史范围、交付证据与 ledger ownership 档案保留，不因新映射而删除、改写或被解释为 current-main 完成。

<!-- maturity-stage-map:start -->
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
<!-- maturity-stage-map:end -->

执行约束：每个 source gap 只有一个主责 atom；跨阶段工作只通过前置依赖消费，不重复 ownership。P0 授权、隐私、用户阻断和写入收敛先于 P1 产品闭环及 P2 交付证据。进入某阶段前创建表中指定详细计划，并重新核对当时的 Cloudflare 免费层、当前分支和总账状态。

## R0 — 状态收口、身份与工作台基础

状态：active

目标：建立 current-main 可复核的生产基线，并先交付身份、Shell、管理、脱敏审计、分页、可访问性和免费层保护等后续旅程共享基础。

范围：`IDN-001`、`IDN-003`、`IDN-004`、`IDN-005`、`IDN-006`、`WB-001`、`WB-002`、`WB-PAGE`、`WB-SCROLL`、`WB-SETTINGS`、`WB-A11Y`、`ADM-001`、`ADM-005`、`ADM-006`、`ADM-007`、`ADM-009`、`ADM-010`、`ADM-011`、`OPS-001`、`OPS-002`、`OPS-003`、`OPS-004`、`OPS-005`、`OPS-006`、`OPS-007`、`OPS-009`。

前置依赖：当前阶段没有更早的 R 阶段原子；只使用追加式 migration 和现有身份边界。

退出标准：

- [ ] current-main gate、远程 migration、100% Worker 版本与回滚点均有日期化证据（owned: `OPS-002`、`OPS-003`、`OPS-004`、`OPS-007`; consumed: -）
- [ ] admin/contributor 登录、拒绝、退出后 session 与 signed automation 旅程均完成（owned: `IDN-001`、`IDN-003`、`IDN-004`、`IDN-006`、`OPS-005`、`OPS-006`; consumed: -）
- [ ] Shell、成员/角色/菜单、统计、审计分页和可访问性在真实角色旅程中验证（owned: `WB-001`、`WB-002`、`WB-PAGE`、`WB-SCROLL`、`WB-SETTINGS`、`WB-A11Y`、`ADM-001`、`ADM-005`、`ADM-006`、`ADM-007`、`ADM-009`、`ADM-010`、`ADM-011`; consumed: -）
- [ ] 免费层边界、降级和 Computer Preview 约束在发布前复核（owned: `OPS-009`; consumed: -）

## R1 — AI 知识库核心与受控摄取

状态：planned

目标：完成从录入、解析、审核、发布到搜索、阅读和严格引用问答的知识闭环；以免费文本模式为默认可用路径，以私有 R2 为显式可选增强而非隐式前提。

范围：`KB-001`、`KB-002`、`KB-003`、`KB-004`、`KB-005`、`KB-006`、`KB-007`、`KB-008`、`ADM-002`、`ADM-003`、`ADM-004`。

前置依赖：消费 `IDN-004`、`IDN-005`、`WB-PAGE`、`OPS-009` 的成员隔离、正式分页和免费层边界。

退出标准：

- [ ] 免费文本模式完成提交、解析、审核、发布、搜索、阅读和引用问答；无 R2 时二进制上传 fail-closed（owned: `KB-001`、`KB-002`、`KB-003`、`KB-004`、`KB-005`、`KB-006`、`KB-007`、`KB-008`、`ADM-002`; consumed: `IDN-004`、`IDN-005`、`WB-PAGE`）
- [ ] 启用私有 R2 后，真实文件、资产队列、预览、下载、重试和安全回收有范围匹配的生产证据（owned: `KB-003`、`ADM-004`; consumed: `OPS-009`）
- [ ] AI、R2 或 Queue 故障不产生可见半成品，任务可有限重试/扫描恢复并受容量断路器保护（owned: `KB-003`、`KB-004`、`ADM-004`; consumed: `OPS-009`）
- [ ] contributor 提交到可见知识、管理员审核到发布、两者搜索到精确引用回读均完成（owned: `ADM-003`; consumed: `IDN-004`、`IDN-005`）

## R2 — 任务、通知、看板与上下文消息

状态：active

目标：按“任务 → 通知 → 看板 → 上下文消息”的顺序建立个人执行与协作闭环；看板和消息消费任务/知识对象，不创建第二套权威数据或开放式私信系统。

当前证据：Tasks、四列 task-backed Boards、recipient-owned Notifications、任务/知识 contextual Messages 以及对应分页、隔离、重放和前端状态已在当前分支实现并通过本地自动化验证。R2 尚未退出：任务/通知/消息保留与清理策略、main 集成、远程 0035–0037 migration、生产发布、production smoke 和 admin/contributor signed browser acceptance 均未完成。

范围：`TSK-001`、`TSK-002`、`TSK-003`、`TSK-004`、`TSK-005`、`TSK-006`、`TSK-007`、`TSK-008`、`TSK-009`、`TSK-010`、`NTF-001`、`NTF-002`、`NTF-003`、`NTF-004`、`NTF-005`、`NTF-006`、`BRD-001`、`BRD-002`、`BRD-003`、`BRD-004`、`BRD-005`、`BRD-006`、`BRD-007`、`MSG-001`、`MSG-002`、`MSG-003`、`MSG-004`、`MSG-005`、`MSG-006`。

前置依赖：消费 `IDN-004`、`IDN-005`、`WB-PAGE`、`WB-A11Y`、`ADM-009`、`KB-006` 的隔离、分页、可访问性、审计与知识上下文。

退出标准：

- [ ] 任务覆盖创建、关联、筛选、分页、幂等、空/错态、审计、保留/恢复和跨成员拒绝（owned: `TSK-001`、`TSK-002`、`TSK-003`、`TSK-004`、`TSK-005`、`TSK-006`、`TSK-007`、`TSK-008`、`TSK-009`、`TSK-010`; consumed: `IDN-004`、`IDN-005`、`WB-PAGE`、`WB-A11Y`、`ADM-009`）
- [ ] 通知在重复事件、未读重试、目标失效和保留清理下保持隔离与可审计（owned: `NTF-001`、`NTF-002`、`NTF-003`、`NTF-004`、`NTF-005`、`NTF-006`; consumed: `IDN-004`、`WB-PAGE`、`WB-A11Y`、`ADM-009`）
- [ ] 看板和上下文消息覆盖键盘排序、并发回滚、撤权、分页、重放和 signed browser 验收（owned: `TSK-001`、`BRD-001`、`BRD-002`、`BRD-003`、`BRD-004`、`BRD-005`、`BRD-006`、`BRD-007`、`MSG-001`、`MSG-002`、`MSG-003`、`MSG-004`、`MSG-005`、`MSG-006`; consumed: `KB-006`、`WB-PAGE`、`WB-A11Y`、`ADM-009`）

## R3 — 治理、版本、回收与审计

状态：planned

目标：补齐批量治理、Revision diff/rollback、回收站、恢复、最终清理、审计和失败恢复，所有写操作保持成员隔离、可审阅且不依赖人工修改数据库。

范围：`ADM-008`、`GOV-001`、`KB-011`、`KB-012`。

前置依赖：消费 `ADM-006`、`ADM-009`、`KB-004`、`TSK-009` 的角色治理、脱敏审计、不可变发布和任务保留边界。

退出标准：

- [ ] 批量治理提供逐项结果、幂等重放、并发失败恢复和脱敏审计（owned: `ADM-008`、`GOV-001`; consumed: `ADM-006`、`ADM-009`）
- [ ] Revision diff/rollback 仅切换 current 原子并保留不可变历史与审计（owned: `KB-011`; consumed: `KB-004`、`ADM-009`）
- [ ] 回收站、恢复与最终清理保持成员隔离、tombstone 审计和派生索引一致性（owned: `KB-012`; consumed: `ADM-009`、`TSK-009`）

## R4 — 成熟检索、阅读器与评测

状态：planned

目标：完成成熟过滤、来源定位、相关知识、反向链接、混合检索降级和量化评测，并在阅读器与引用旅程中持续执行权限重校验。

范围：`KB-010`、`RET-001`、`RET-002`、`RET-003`、`EVAL-001`。

前置依赖：消费 `IDN-005`、`KB-005`、`KB-006`、`KB-007`、`OPS-009` 的成员隔离、核心检索/阅读、引用回读和免费层降级边界。

退出标准：

- [ ] 过滤与来源定位覆盖 Space/Collection/Tag/type/author/time、精确位置和可见性重校验（owned: `KB-010`、`RET-001`; consumed: `IDN-005`、`KB-005`、`KB-006`）
- [ ] 相关知识与反向链接可解释、可撤权且不从静态链接推断授权（owned: `RET-002`; consumed: `KB-006`）
- [ ] 混合检索与量化评测在 Vectorize/AI 不可用时回退 FTS5-only，并检验 Recall、MRR、引用支持和权限泄露（owned: `RET-003`、`EVAL-001`; consumed: `KB-007`、`OPS-009`）

## R5 — 来源工作台、研究产物与有界 Agent

状态：planned

目标：围绕已授权来源支持多轮研究与可追溯产物，同时把 Agent 限定在预算、审批、恢复和最小工具权限内。

范围：`KB-009`。

前置依赖：消费 `IDN-005`、`KB-007`、`KB-010` 的引用回读、可见性重校验和私人来源工作流；新增研究产物原子必须先写入总账。

退出标准：

- [ ] 选中来源、会话与产物保留来源 Revision、权限与审计关联，并在撤权后不可读取（owned: `KB-009`; consumed: `IDN-005`、`KB-010`）
- [ ] Agent 仅使用批准的只读知识工具并产出 draft/可审核产物，越权操作被拒绝（owned: `KB-009`; consumed: `KB-007`）
- [ ] 计划确认、额度耗尽、断线、取消和恢复不重复副作用，并显示 deferred 或证据缺口（owned: `KB-009`; consumed: `OPS-009`）

## R6 — 导出、恢复、容量保护与 1.0

状态：planned

目标：完成导出包、全新环境恢复演练、R2/D1 容量保护、运行手册和完整生产验收后，再声明 1.0。

范围：`OPS-008`、`OPS-010`、`OPS-011`。

前置依赖：消费 `OPS-001`、`OPS-005`、`OPS-009`、`ADM-004`、`ADM-011`、`EVAL-001` 的升级、角色验收、免费层、资产摄取、可访问性和评测证据；所有演练使用受控脱敏数据，不导出生产原始数据到本地。

退出标准：

- [ ] 导出与恢复覆盖全量/增量包、导入 dry-run、全新环境、hash/Revision/Citation/权限对账与索引重建（owned: `OPS-008`; consumed: `OPS-001`）
- [ ] R2/D1 容量保护覆盖真实阈值、预警、写入断路器、有限重试和恢复重投（owned: `OPS-010`; consumed: `ADM-004`、`OPS-009`）
- [ ] 完整生产验收、运行手册、角色浏览器旅程、可访问性、恢复和质量证据齐备后才可声明 1.0（owned: `OPS-011`; consumed: `OPS-005`、`ADM-011`、`EVAL-001`）
