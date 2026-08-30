# Memory Garden Roadmap

更新时间：2026-08-30

产品定位：面向 **5–20 名受邀成员**、运行在 **Cloudflare 免费层**、保留现有 **GitHub OAuth + D1 Session + HMAC Automation** 登录体系的私有 AI 知识操作系统。

当前交付事实以 [交付状态总账](./docs/product/delivery-status-ledger.md) 为唯一权威来源；本 Roadmap 只安排可部署、可回滚的纵向用户旅程。历史计划和旧 gate 是执行档案，不能替代 current-main 的发布或验收证据。

总账成熟度：`atoms=75`; `implementation=done:48,partial:4,pending:23,n/a:0`; `verification=done:51,partial:0,pending:24,n/a:0`; `release=done:0,partial:28,pending:47,n/a:0`; `acceptance=done:0,partial:8,pending:67,n/a:0`

**范围归属规则。** 每个非 legacy 总账原子恰好由一个 R 阶段的“范围”拥有；后续阶段只消费已归属能力，不重复拥有其原子。`GATE-M0`、`GATE-M1`、`WS-001` 与 `WS-008` 是兼容历史 Roadmap/Checklist 的 legacy 映射，不纳入当前阶段。

明确排除：`IDN-002` 是可选 WeChat OAuth，当前 GitHub allowlist 已满足私有成员入口；在出现明确产品需求和独立发布/验收计划前，它可选且不在 R0–R6 范围内。

**产品与安全边界。** 不做公开注册、多租户 SaaS、计费、套餐或企业目录同步；不替换 GitHub OAuth 的 state、PKCE S256、primary verified email、allowlist、D1 哈希 Session 与 admin/contributor 分工。Automation 继续要求 HMAC + `APP_TOKEN`、只访问 legacy API、没有管理员权限。保留 `KnowledgeBase` Durable Object 类名和 migration tag `v1`；所有 D1 migration 只追加且必须可恢复。Agent 只能读取正式知识并产出草稿，不得发布、删除、改权限或调用任意网络、Shell、代码或浏览器工具。

**证据规则。** 本地 fixture 仅证明确定性逻辑，workerd 仅证明本地 Cloudflare runtime 合同；发布必须记录日期、版本和 migration 范围，验收必须记录真实角色旅程与脱敏证据。页面、README、历史勾选框、匿名 smoke 和口头确认均不能替代这些证据。所有审计仅保留 allowlist metadata，不记录正文、凭据或敏感输入。

## R0 — 状态收口、身份与工作台基础

状态：active

目标：建立 current-main 可复核的生产基线，并先交付身份、Shell、管理、脱敏审计、分页、可访问性和免费层保护等后续旅程共享基础。

范围：`IDN-001`、`IDN-003`、`IDN-004`、`IDN-005`、`IDN-006`、`WB-001`、`WB-002`、`WB-PAGE`、`WB-SCROLL`、`WB-SETTINGS`、`WB-A11Y`、`ADM-001`、`ADM-005`、`ADM-006`、`ADM-007`、`ADM-009`、`ADM-010`、`ADM-011`、`OPS-001`、`OPS-002`、`OPS-003`、`OPS-004`、`OPS-005`、`OPS-006`、`OPS-007`、`OPS-009`。

前置依赖：只使用追加式 migration 和现有身份边界；先确认远程 0033/0034 状态，再记录与分页、任务、Shell、菜单相符的 Worker 版本。脱敏审计、正式数字分页和可访问性基础在协作、治理和管理域消费它们前先完成归属与证据收口。

退出标准：

- [ ] current-main 完整 gate、远程 migration 状态、100% Worker 版本、bindings 与可前向兼容回滚点都有日期化证据。
- [ ] admin 与 contributor 分别完成登录、拒绝路径和退出后 session 旅程；signed automation 同时覆盖有效签名与拒绝路径。
- [ ] Shell、成员/角色/菜单、站点统计、审计分页和可访问性在真实角色旅程中验证，且不从匿名 smoke、旧候选或本地 PASS 推断发布/验收。
- [ ] Workers、D1、Durable Objects、Workers AI、Vectorize 与 Queues 的免费层边界和降级已在发布前复核；`@cloudflare/computer` 仍按 Preview 对待。

## R1 — AI 知识库核心与受控摄取

状态：planned

目标：完成从录入、解析、审核、发布到搜索、阅读和严格引用问答的知识闭环；以免费文本模式为默认可用路径，以私有 R2 为显式可选增强而非隐式前提。

范围：`KB-001`、`KB-002`、`KB-003`、`KB-004`、`KB-005`、`KB-006`、`KB-007`、`KB-008`、`ADM-002`、`ADM-003`、`ADM-004`。

前置依赖：R0 的成员隔离、对象可见性、正式分页、生产证据和额度保护；审核、搜索、阅读与引用回读始终重新校验 active member、visibility 与 current Revision。

退出标准：

- [ ] 不绑定 R2 时，文本、Markdown 和代码录入仍可完成提交、解析、审核、发布、搜索、阅读与引用问答；二进制上传保持 fail-closed，而不是降级为无授权存储。
- [ ] 启用私有 R2 后，真实文件样本、原件/解析资产队列、预览、下载、重试与安全回收均通过；每项远程 migration、Worker/assets 版本和成员角色旅程有范围匹配的生产证据。
- [ ] AI、R2 或 Queue 暂时故障时，录入不会产生可见半成品；任务保留可追踪状态并能有限重试/扫描恢复，容量断路器在写入前明确拒绝或降级。
- [ ] contributor 提交到可见知识、管理员审核到发布、两者搜索到精确引用回读的目标环境旅程均完成，且无证据/低相关回答明确拒答。

## R2 — 任务、通知、看板与上下文消息

状态：planned

目标：按“任务 → 通知 → 看板 → 上下文消息”的顺序建立个人执行与协作闭环；看板和消息消费任务/知识对象，不创建第二套权威数据或开放式私信系统。

范围：`TSK-001`、`TSK-002`、`TSK-003`、`TSK-004`、`TSK-005`、`TSK-006`、`TSK-007`、`TSK-008`、`TSK-009`、`TSK-010`、`NTF-001`、`NTF-002`、`NTF-003`、`NTF-004`、`NTF-005`、`NTF-006`、`BRD-001`、`BRD-002`、`BRD-003`、`BRD-004`、`BRD-005`、`BRD-006`、`BRD-007`、`MSG-001`、`MSG-002`、`MSG-003`、`MSG-004`、`MSG-005`、`MSG-006`。

前置依赖：R0 已拥有成员隔离、完整数字分页、脱敏审计与可访问性基础；任务先提供关联、幂等、状态和进度，通知以 recipient/event key 去重，看板只引用任务数据并提供键盘等价排序，消息先绑定任务或知识上下文并二次校验参与者权限。

退出标准：

- [ ] admin 与 contributor 的任务旅程覆盖创建、关联、筛选、分页、幂等重放、空/错态、审计降噪、保留/恢复和跨成员拒绝。
- [ ] 通知在重复事件、未读重试、目标失效和保留清理下保持隔离与可审计；看板并发排序可回滚且不复制任务正文。
- [ ] 上下文消息覆盖参与者撤权、分页、重复发送、故障恢复和 signed browser 验收；开放私信不在本阶段范围内。

## R3 — Space 与 Collection 治理

状态：planned

目标：在已具备角色、菜单和脱敏审计基础上，完成 Space/Collection 的显式治理与审计原子性；Revision、回收和任务保留继续消费 R1/R2 已拥有的能力，不重复声明其完成度。

范围：`ADM-008`。

前置依赖：R0 的角色权限位图、成员隔离、菜单治理和审计列表；R1 的受控发布模型与 R2 的任务/消息对象关系都只作为消费者边界，不形成反向依赖。

退出标准：

- [ ] Space/Collection 创建、授权、修改和拒绝路径具备原子审计、分页可读性和成员隔离证据。
- [ ] 批量审核、Revision diff/rollback、回收/最终清理和任务保留只在各自拥有阶段的原子完成后被组合验收，不通过重复 Roadmap 归属掩盖缺口。
- [ ] 真实管理员治理与拒绝路径在目标环境验收，历史候选的 partial 证据不被升级为完整结论。

## R4 — 成熟检索、阅读器与评测

状态：planned

目标：在 R1 核心检索/阅读闭环之上，交付 Saved View 等私人检索工作流，并把后续成熟检索与量化评测需求先记录为总账原子再实施。

范围：`KB-010`。

前置依赖：R1 的已发布知识闭环和 R0 的成员隔离、免费层降级边界；所有 Saved View、阅读器定位和引用回读都重新校验 active member、visibility 与 current Revision。

退出标准：

- [ ] 私有笔记、收藏、最近访问和 Saved View 均按成员隔离，并在撤权、空态、错误恢复和分页场景下验证。
- [ ] 过滤、来源定位、相关知识、反向链接、混合检索和评测在开始实现前均有独立总账原子、质量目标和权限泄露回归标准。
- [ ] Vectorize 或 Workers AI 不可用时，FTS5-only 的核心搜索/阅读旅程仍可用并明确降级。

## R5 — 来源工作台、研究产物与有界 Agent

状态：planned

目标：围绕已授权来源支持多轮研究与可追溯产物，同时把 Agent 限定在预算、审批、恢复和最小工具权限内。

范围：`KB-009`。

前置依赖：R1 的引用回读、可见性重校验和降级边界，以及 R4 的私人来源工作流；新增研究产物原子必须先写入总账，不能由 Roadmap 文字替代实现、发布或验收状态。

退出标准：

- [ ] 选中来源、会话与产物均保留来源 Revision、权限与审计关联，并在撤权后不可读取。
- [ ] Agent 只使用批准的只读知识工具，产生 draft/可审核产物；任何越权网络、Shell、代码、浏览器、发布、删除或改权限尝试均被拒绝并有回归测试。
- [ ] 计划确认、预算/额度耗尽、断线、取消和恢复不会重复副作用，且会明确向用户展示 deferred 或证据缺口。

## R6 — 导出、恢复与 1.0 证据

状态：planned

目标：证明权威数据可迁移、派生索引可重建，并以完整生产与角色证据作为 1.0 声明的前提。

范围：`OPS-008`。

前置依赖：R0 的 current-main 版本、回滚和免费层证据，以及 R1–R5 各自总账原子的发布/验收收口。导出、恢复和容量演练必须使用受控、脱敏数据，不把生产原始数据导出到本地。

退出标准：

- [ ] 全量/增量导出、导入 dry-run、全新环境恢复、hash/Revision/Citation/权限抽样对账和索引重建均有演练证据与回滚说明。
- [ ] 导出和恢复同时验证 R2 协作数据、R3 治理数据、R4 私人检索状态和 R5 研究产物的成员隔离与可追溯性。
- [ ] 上传→审核→发布→搜索→问答→治理→导出/恢复的关键旅程完成 admin/contributor 浏览器验收、可访问性检查和 current-main 发布证据后，才可声明 1.0。
