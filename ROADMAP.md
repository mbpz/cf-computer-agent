# 个人工作台 · Personal Workbench Roadmap

更新时间：2026-09-23

R05 设计进度：用户已确认[书面规格](./docs/superpowers/specs/2026-09-23-maintenance-control-design.md)，[五步实施计划](./docs/superpowers/plans/2026-09-23-maintenance-control.md)已编排；下一动作是 R05.1 凭证校验的运行时探针与失败测试，五步均未执行。恢复主线仍 **4/25 完成、21 项剩余**，不提升产品交付状态，不修改生产配置。

产品定位：面向 **5–20 名受邀成员**、运行在 **Cloudflare 免费层**、保留现有 **GitHub OAuth + D1 Session + HMAC Automation** 登录体系的私有 AI 知识操作系统。

当前交付事实以 [交付状态总账](./docs/product/delivery-status-ledger.md) 为唯一权威来源；本 Roadmap 只安排可部署、可回滚的纵向用户旅程。历史计划和旧 gate 是执行档案，不能替代 current-main 的发布或验收证据。

2026-09-23 顺序执行入口：[剩余任务统计与 checklist](./docs/operations/2026-09-19-remaining-work-checklist.md)。排除旧兼容映射后，总账 90 项能力中 20 项实现、16 项验证尚未完成；发布/验收仍有各自未关闭范围。恢复主线 R01–R25 中 R01–R04 已本地完成，**4 项关闭、21 项剩余**。R04 五个子项含限定范围跨存储故障矩阵已收口，新增 10 项测试，维护专项 247 项、应用 smoke/unit/worker 分项及两套类型检查通过，见[收口证据](./docs/operations/evidence/2026-09-23-maintenance-r04-completion.md)。这些是 R04 历史结果；R05 书面规格获准、实施计划已编排，尚未实施；R07 完整控制组合矩阵及 R08 候选门禁仍开放。生产入口仍明确 legacy，未启用维护；不承诺跨存储原子性或全系统一致性备份。产品增量清单另有 30 个未关闭父项，含已完成子项并与恢复主线重叠，不相加。不提升产品交付四维状态。

2026-09-17 生产验收被 schema 落后阻塞：只读快照为 0001–0032，通知/消息请求出现 500；0033–0050 共 18 个待执行迁移已审查。Task 2 已本地追加 0051 修复日历关联删除，8 文件 168 项 Worker 回归通过，旧 50 个 SQL hash 不变，见[本地证据](./docs/product/2026-09-17-calendar-reference-detach-evidence.md)。Task 3 已获备份范围授权并刷新生产账本与 0033–0051 共 19 个 pending，但两个 FTS 虚拟表触及官方标准导出限制，独立备份尚未产生，见[备份预检](./docs/operations/evidence/2026-09-17-production-d1-backup-preflight.md)。下一步按[原子计划](./docs/superpowers/plans/2026-09-17-production-d1-catchup.md)先确定不删生产表的备份恢复方案和维护窗口，迁移另行批准。详见[生产浏览器验收记录](./docs/product/2026-09-17-production-browser-acceptance.md)。当前未执行生产迁移、导出或部署，不提升 D02/R6-003 及 D3/D4 的发布/验收状态；下文历史快照保留。

2026-09-17 23:33 后续：不删源表的逻辑备份/空库恢复方案已完成 **13 项本地合成可行性检查**，覆盖 32/51 结构、FTS 和关键恢复约束，见[spike 证据及后续 checklist](./docs/operations/evidence/2026-09-17-d1-logical-backup-spike.md)。本轮未连接生产；下一步先审批并实现正式工具、验证远程只读传输及完整停写设计。真实备份和恢复演练尚未完成，不解锁迁移或提升发布/验收状态。

2026-09-18 后续：正式逻辑备份工具已本地实现，**21 项备份/恢复测试通过**，完整 `npm test` 和类型检查通过；见[工具交付证据](./docs/operations/evidence/2026-09-18-d1-backup-tooling.md)及[维护停写设计](./docs/operations/d1-backup-maintenance-design.md)。当日维护代码尚未实现，远程只读传输尚未实测，真实备份尚未产生。本轮无生产连接、导出、迁移或部署；下一步先评审并本地实施维护门禁，远程验证和真实窗口另行批准，不提升任何发布/验收状态。

2026-09-19 后续：已按确认范围本地实现持久化维护协调器和请求/后台/流生命周期适配器，**28 项维护专项测试、21 项备份回归及两套类型检查通过**，见[本地证据](./docs/operations/evidence/2026-09-19-maintenance-coordinator.md)。`DRAINED` 仅表示登记工作清零，不是生产 `FROZEN`；真实应用入口、控制鉴权、容量/孤儿处理和全写者接入仍待完成。未接入生产 binding，未执行导出、迁移、部署、提交或推送；不提升发布/验收状态。

当前增量执行入口：[功能补齐审计与 checklist](./docs/product/2026-09-12-personal-workbench-completion-audit.md)、[32 个页面对账](./docs/product/2026-09-12-personal-workbench-route-inventory.md)。优先处理成员草稿隐私、稳定提交重试、审计页加载阻断与真实管理统计，再推进知识核心、执行协作和 VM 正式页面。首批细化计划：[B02 成员作用域草稿](./docs/superpowers/plans/2026-09-12-member-scoped-submission-drafts.md)。这些是当前修复队列，不重算下方历史总账完成数，也不覆盖既有 atom ownership；仅有实现/测试证据时不得提升 release/acceptance。

B02 草稿隔离已合入 main（`6f9d325`），[实施与验收边界](./docs/product/2026-09-13-member-scoped-submission-drafts-evidence.md)保留真实双账号和生产验收待办。B01 稳定提交身份已合入 main（`6bb04ac`）：首次 POST 前保存成员快照、失败/恢复后手动原样重试、新编辑单独保留；[B01 证据与验收边界](./docs/product/2026-09-13-stable-submission-intents-evidence.md)。D02 审计页在 `codex/admin-audit-recovery` 本地修复成功响应、原查询重试和导航竞态，见 [D02 原子清单](./docs/superpowers/plans/2026-09-13-admin-audit-recovery.md)及[本地证据](./docs/product/2026-09-13-admin-audit-recovery-evidence.md)。不据此提升 release/acceptance；D01-A 的后续进展见下文，D02 其余管理页仍待补齐。

D02 已本地提交 `5ebdaa0`，M01 已提交 `e246fca`，M02 已提交 `6c1a1b9`，未合并/推送/部署。[M01 七页读取证据与原子缺口](./docs/product/2026-09-13-workbench-extended-route-audit.md)之后，2026-09-14 [M02 对账](./docs/operations/evidence/2026-09-14-workbench-m02-completion.md)补齐七页及项目时间线，覆盖 32 项能力、83 项缺口、124 个未来实施原子；能力仍全部为 partial，不升级业务完整性及发布/验收状态。

2026-09-14 D01-A 管理概览已接真实授权分页总数，三卡独立加载/零值/错误重试/权限状态，支持刷新、重复点击拦截与过期响应保护。见[原子计划](./docs/superpowers/plans/2026-09-14-admin-dashboard-authoritative-counts.md)、[本地证据](./docs/product/2026-09-14-admin-dashboard-authoritative-counts-evidence.md)和[当前域审计](./docs/operations/evidence/2026-09-14-workbench-d01a-domain-audit.md)。历史 M02 快照保留，D01/R6-001 父项仍未完成；下一环节为 D01-B 站点统计日期范围、分页、初始失败恢复及跨页对账，不新增 Cloudflare 服务。

2026-09-15 D01-B1 本地完成站点统计读取恢复：初始/翻页错误原查询重试、重复刷新拦截、切换日期清除旧结果、401/403 清除访客、UTC 范围展示及严格响应校验；D1 覆盖 7/14/30 天、跨页 total 和跨日 UV 去重。见[原子计划](./docs/superpowers/plans/2026-09-15-admin-analytics-recovery.md)、[本地证据](./docs/product/2026-09-15-admin-analytics-recovery-evidence.md)、[当前域审计](./docs/operations/evidence/2026-09-15-workbench-d01b1-domain-audit.md)。D01-A/M02 历史不改写；下一环节 D01-B2 为服务端多查询快照一致性和跨页写后对账，D01/R6-001/R6-002 保持未完成，发布与真实浏览器验收未提升。

2026-09-15 D01-B2 本地完成单事务统计快照、响应内 PV 对账和跨页写后重读，见[原子计划](./docs/superpowers/plans/2026-09-15-admin-analytics-snapshot.md)、[本地证据](./docs/product/2026-09-15-admin-analytics-snapshot-evidence.md)、[当前域审计](./docs/operations/evidence/2026-09-15-workbench-d01b2-domain-audit.md)。不同分页请求仍为实时读取，不承诺冻结快照。下一环节为 D02 审核队列与详情读取恢复，随后独立处理写操作幂等和发布闭环；D01/R6 父项、发布与真实浏览器验收状态保持开放。

2026-09-16 D02-R1 本地补齐审核队列/详情原查询重试、401/403 内容清理、真实 404、响应对象匹配、迟到请求隔离及应用内往返导航；发布预览未完成时离开原查询，不再继续旧对象 POST。见[原子计划](./docs/superpowers/plans/2026-09-15-admin-review-read-recovery.md)、[本地证据](./docs/product/2026-09-16-admin-review-read-recovery-evidence.md)、[当前域审计](./docs/operations/evidence/2026-09-16-workbench-d02r1-domain-audit.md)。D02-R2 按[书面设计及原子清单](./docs/superpowers/specs/2026-09-16-admin-review-write-recovery-design.md)四批推进：A 已本地修复审核首次/重放可见性一致，新增 24 项真实 D1 回归，服务/Worker/API 合计 162 项通过，见[本地证据](./docs/product/2026-09-16-admin-review-replay-contract-evidence.md)；B 已本地实现权威回执、发布与索引分离、真实说明、原载荷手动重试与冲突重读，见[原子计划](./docs/superpowers/plans/2026-09-16-admin-review-write-ui.md)和[本地证据](./docs/product/2026-09-16-admin-review-write-ui-evidence.md)。C 已本地补齐三种审核通知、决定事务一致性、去重、当前目标权限与旧数据迁移，见[原子计划](./docs/superpowers/plans/2026-09-16-admin-review-notifications.md)和[本地证据](./docs/product/2026-09-16-admin-review-notifications-evidence.md)。下一环节 D 故障矩阵及交付验收。前端互斥不等于幂等。D02/R6-003、发布与真实浏览器验收保持未完成，历史快照不改写。

2026-09-17 Personal Work Graph 后端合同闸门已本地完成：成员隔离、scope/root/depth/types/limit 解析、cursor 绑定、时间线投影、有界 loader 与 citation 授权均通过 focused unit/worker、TypeScript、smoke 和 delivery-status contract。`nextCursor` 延续字段与 malformed/cross-linked citation fixture 保留为 minor deferred；发布、生产与 signed browser acceptance 仍 pending，未执行远程迁移、部署或 push。

总账成熟度：`atoms=95`; `implementation=done:75,partial:5,pending:15,n/a:0`; `verification=done:79,partial:0,pending:16,n/a:0`; `release=done:0,partial:28,pending:67,n/a:0`; `acceptance=done:0,partial:8,pending:87,n/a:0`

**范围归属规则。** 每个非 legacy 总账原子恰好由一个 R 阶段的“范围”拥有；后续阶段只能在“前置依赖”和退出标准的 `consumed` 映射中消费更早阶段的原子，不重复拥有它们。`GATE-M0`、`GATE-M1`、`WS-001` 与 `WS-008` 是兼容历史 Roadmap/Checklist 的 legacy 映射，不纳入当前阶段。

明确排除：`IDN-002` 是可选 WeChat OAuth，当前 GitHub allowlist 已满足私有成员入口；在出现明确产品需求和独立发布/验收计划前，它可选且不在 R0–R6 范围内。

2026-09-17 D02-R2-D1/D2 本地完成故障矩阵与三身份 HTTP/DOM 回归：补发布最终事务响应丢失、并发/回滚通知数量，以及三种审核决定到收件箱的权限与幂等闭环；15 文件 341 项通过。见[原子计划](./docs/superpowers/plans/2026-09-17-admin-review-acceptance-matrix.md)和[验收矩阵](./docs/product/2026-09-17-admin-review-acceptance-matrix.md)。下一环节 D3 为解锁后的真实登录、双语键盘/主题/移动交互，D4 为授权发布与同版本验收；上次检查 Mac 锁屏且无可用浏览器标签。D02/R6-003 保持开放，本地完成不代表合并或上线，不提升发布状态。

**产品与安全边界。** 不做公开注册、多租户 SaaS、计费、套餐或企业目录同步；不替换 GitHub OAuth 的 state、PKCE S256、primary verified email、allowlist、D1 哈希 Session 与 admin/contributor 分工。Automation 继续要求 HMAC + `APP_TOKEN`、只访问 legacy API、没有管理员权限。保留 `KnowledgeBase` Durable Object 类名和 migration tag `v1`；所有 D1 migration 只追加且必须可恢复。Agent 只能读取正式知识并产出草稿，不得发布、删除、改权限或调用任意网络、Shell、代码或浏览器工具。

**证据规则。** 本地 fixture 仅证明确定性逻辑，workerd 仅证明本地 Cloudflare runtime 合同；发布必须记录日期、版本和 migration 范围，验收必须记录真实角色旅程与脱敏证据。页面、README、历史勾选框、匿名 smoke 和口头确认均不能替代这些证据。所有审计仅保留 allowlist metadata，不记录正文、凭据或敏感输入。

### Workbench 产品成熟度 R1–R8 执行映射

此映射消费 [Workbench 产品成熟度缺口矩阵](./docs/product/workbench-product-maturity-gap-matrix.md)，是 2026-08-31 R0 审计之后的新执行顺序。下方原有 R0–R6 Roadmap 继续作为历史范围、交付证据与 ledger ownership 档案保留，不因新映射而删除、改写或被解释为 current-main 完成。

<!-- maturity-stage-map:start -->
| Phase | Owned gaps | Entry criteria | Exit criteria | Next detailed plan |
| --- | ---: | --- | --- | --- |
| R1 | 1 | R1 入口门槛：R0 缺口账、身份边界、当前 Shell 基线。 | R1 退出门槛：设置、全局 Shell、键盘、overlay、主题、窄屏验收。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r1-design-system.md |
| R2 | 1 | R2 入口门槛：R1 overlay、焦点、token、响应式 Shell 合同。 | R2 退出门槛：共享 DataTable、分页、AsyncBoundary、表单、URL 恢复。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r2-shared-patterns.md |
| R3 | 14 | R3 入口门槛：R2 数据、表单、确认、异步模式。 | R3 退出门槛：提交、知识、搜索、阅读器、Agent 域内验收。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r3-knowledge-loop.md |
| R4 | 34 | R4 入口门槛：R3 知识目标授权、共享实体模式。 | R4 退出门槛：任务、看板、七个扩展工作区及项目时间线的分页旅程、关联、并发、重放、撤权、恢复。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r4-tasks-boards.md |
| R5 | 4 | R5 入口门槛：R4 任务事件、知识上下文、条件写入合同。 | R5 退出门槛：通知与上下文消息未读、分页、重试、撤权、深链。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r5-notifications-messages.md |
| R6 | 27 | R6 入口门槛：R3–R5 业务权威数据、共享治理模式。 | R6 退出门槛：管理摘要、审核、资产、成员、角色、菜单、Space、审计、统计。 | docs/superpowers/plans/2026-09-01-workbench-maturity-r6-administration.md |
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

范围：`INB-001`、`CAP-001`、`P4-001`、`GL-001`、`PRJ-001`、`CAL-001`、`TOD-001`、`FOC-001`、`REV-001`、`TSK-001`、`TSK-002`、`TSK-003`、`TSK-004`、`TSK-005`、`TSK-006`、`TSK-007`、`TSK-008`、`TSK-009`、`TSK-010`、`TSK-011`、`WB-GR-001`、`NTF-001`、`NTF-002`、`NTF-003`、`NTF-004`、`NTF-005`、`NTF-006`、`BRD-001`、`BRD-002`、`BRD-003`、`BRD-004`、`BRD-005`、`BRD-006`、`BRD-007`、`MSG-001`、`MSG-002`、`MSG-003`、`MSG-004`、`MSG-005`、`MSG-006`。

前置依赖：消费 `IDN-004`、`IDN-005`、`WB-PAGE`、`WB-A11Y`、`ADM-009`、`KB-006` 的隔离、分页、可访问性、审计与知识上下文。

退出标准：

- [ ] 任务覆盖创建、关联、筛选、分页、幂等、空/错态、审计、子项/依赖、保留/恢复和跨成员拒绝（owned: `TSK-001`、`TSK-002`、`TSK-003`、`TSK-004`、`TSK-005`、`TSK-006`、`TSK-007`、`TSK-008`、`TSK-009`、`TSK-010`、`TSK-011`; consumed: `IDN-004`、`IDN-005`、`WB-PAGE`、`WB-A11Y`、`ADM-009`）
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
