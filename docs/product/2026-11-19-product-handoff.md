# Memory Garden 产品现状审查与交接

审查日期：2026-11-19（上海）。本地分支 `main`，基线 `1795685fd7e2425278f0e694dbc256305df3da22`。开始时与本地 `origin/main` 引用比较为 `0/0`。交接期间本地 `main` 新增 `debc145c`，与基线相比只增加交接材料。收尾核对时 `main` 和本地 `origin/main` 引用均为 `debc145c`，收尾修订尚未提交；未向远端查询实时状态。审查覆盖当前入口、功能与交付账本，以及近期批量审核、资产与成员页、邀请/密码、角色与菜单的重点代码路径；不是全仓安全认证。本轮未改业务代码、未代为提交或推送，未执行迁移或部署。

## 接手结论

**交接可以接收，产品不能标记全部完结。** 功能清单 30 个原始父项，D08（迁移、发布和发布后验收）另计；29 个范围内父项中 **12 已关闭、17 未关闭**。开放父项包括已有实现待验收、证据待对账、局部缺陷及独立 VM 缺口，不等于 17 个功能未开发。历史“28 项”与正文中旧的“24 项”均不能当现状；[原清单当前计数](./2026-09-12-personal-workbench-completion-audit.md#当前计数与关闭条件2026-09-28)与本轮 `audit:functional-checklist` 相符，原文较早段落仍将 `5/24` 写成当前值。

**先处理账户恢复的信任边界，再修管理员导航及审核/资产操作的状态边界。** 邀请码与找回凭据职责重叠是发布前阻断项。管理员反馈“菜单看不到”至少涉及三个独立事实：服务端菜单记录、会话有效权限、Shell 是否刷新了导航。当前代码已确认后两处有不一致；没有证据证明任一条就是特定线上账号的唯一根因。不要以给管理员扩大所有权限来修复显示问题。

## 代码审查发现

下表均由固定 SHA 的代码路径确认。未对线上发起测试，未复现账户安全问题。P1 优先于发布，P2 排入下一修复批，P3 随同一模块收口。

| ID | 优先级 | 发现与代码锚点 | 接受标准 |
| --- | --- | --- | --- |
| H01 | P1 | **邀请码与账户恢复没有隔离。** [恢复服务](../../src/password/service.ts#L159)把账户绑定邀请当作身份凭据；[邀请 DTO](../../src/invitations/service.ts#L207)的可见性不满足恢复凭据应只由账户本人控制的前提。受影响的设计包含已发放邀请与[旧账号回填邀请](../../migrations/0080_backfill_password_invitations.sql#L1)。 | 解耦注册与恢复。采用独立、短期、单次、与账户绑定的恢复凭据，或先关闭不安全的恢复方式；明确老账号及 OAuth 首次设密后的恢复路径，保留[重置时撤销会话](../../src/password/repository.ts#L201)的现有保障。不把码值写入交接、日志或证据。 |
| H02 | P2 | **菜单写入成功，侧栏仍可使用旧树。** [写入成功路径](../../frontend/app.tsx#L590)读回菜单管理表，[Shell](../../frontend/components/shell/app-shell.tsx#L70)只有成员 ID、角色、有效权限掩码变化才重新取导航。同一会话编辑可变菜单后不会主动重新投影。 | 成功写入后刷新权威导航；无须登出或刷新整页。验证普通可配置菜单、强制常驻入口、不可见和无权入口各自符合政策。 |
| H03 | P2 | **管理员角色编辑混淆存储授权和实际权限。** [页内授权确认](../../frontend/pages/admin/role-detail-page.tsx#L140)显示存储掩码差量，而[服务端权限合并](../../src/authorization/roles-repository.ts#L145)与[内建角色兜底](../../src/authorization/roles-repository.ts#L219)可在保存之前已授予对应权限。勾选保存不是新权限生效的证明。 | 展示并区分实际权限与持久化角色记录；将只修复记录的动作明确标注，或移除冗余动作。对照保存前后两个掩码、导航、路由和 API。 |
| H04 | P2 | **批量审核只能处理第一页 20 条。** [专页读取](../../frontend/pages/admin/review-batch-page.tsx#L39)固定第一页且没有分页；[队列跳转](../../frontend/app.tsx#L3910)不传当前页。搬迁前队列当前页可批量操作。 | 从队列第 2 页进入后仍能处理该页，批量页可正常翻页，选择只作用于当前页。 |
| H05 | P2 | **批量审核的迟到回执可把已离页的用户拉回队列。** [完成回调](../../frontend/components/review/review-batch-owner.tsx#L164)及[失败子集重试完成](../../frontend/components/review/review-batch-owner.tsx#L184)未验证当前所有权；[路由回调](../../frontend/app.tsx#L3745)无条件压栈。 | 第一请求或重试完成时，仅当前路由/账号/尝试仍匹配才可自动导航；离页不抹掉待决意图或结果。 |
| H06 | P2 | **整批回执丢失时没有可靠的同编号恢复。** [首次提交失败分支](../../frontend/components/review/review-batch-owner.tsx#L163)丢弃冻结尝试，响应解析在 [POST 之后](../../frontend/lib/admin-batch-review-data.ts#L88)却可能被[归类为未发送的验证错误](../../frontend/components/review/review-batch-owner.tsx#L80)。同挂载内的 [ID 缓存](../../frontend/lib/review-batch-plan.ts#L90)按条目保存编号而非完整原意图，不能替代跨刷新恢复。 | 落盘冻结的逐条意图与编号；区分发送前拒绝和发送后结果未知。刷新/离页后可以精确查询或者按原编号和原负载重试，不重发已成功项、不混淆不同意图。 |
| H07 | P2 | **资产页签切换可以丢失回收回执。** [TabsContent](../../frontend/components/motion/tabs.tsx#L372)激活和不可见分支使用不同 React key，导致子树重挂；[回收处理](../../frontend/components/assets/asset-hygiene-panel.tsx#L117)只在组件上保存成功结果并清除本地待决记录。 | 页签切换不销毁操作所有者。在结果返回前后往返，仍可看见原结果或按原编号对账。若修共享组件，验所有使用方。 |
| H08 | P2 | **被拒绝的注册可能消耗新账户额度。** [迁移说明](../../migrations/0078_password_auth.sql#L18)写的是新账户限制；[注册事务](../../src/password/repository.ts#L114)在守卫未新增成员时也记额度，后置判断才拒绝注册。 | 明确区分成功账户配额和失败尝试限流；保留防滥用能力。覆盖被拒邀请、合法注册与配额互不污染。 |
| H09 | P3 | **委托成员管理员看得见用不了的邀请页签。** [成员页](../../frontend/pages/admin/members-page.tsx#L124)无条件渲染两个页签；[成员列表](../../src/routes/admin.ts#L352)仅需成员管理能力，[邀请路由](../../src/routes/admin-invitations.ts#L26)还需内建管理员角色。 | 委托者可以管理成员，但不展示或加载无权页签；保留两层服务端校验。 |
| H10 | P3 | **成员页签切换可以丢失生成邀请的回执。** [成员页](../../frontend/pages/admin/members-page.tsx#L166)离开页签即卸载面板，[生成状态](../../frontend/components/admin/invitation-admin-panel.tsx#L95)随面板销毁。 | 生成中的状态和返回结果由页级所有者保留；回切能看见结果，不默默重复生成。 |
| H11 | P3 | **内建 Contributor 角色的成员列表少计新注册成员。** [注册](../../src/password/repository.ts#L114)写成员内建角色而不写关联表；[角色详情](../../src/authorization/roles-repository.ts#L131)只读 `role_members`，权限兜底仍使 Contributor 生效。 | 内建成员归属使用同一权威来源或在全部开户路径事务化同步；核对新成员的权限、列表和计数。 |

另记两条未观察到真实故障的交接问题：注册成功但建会话失败时应保留“已开户，可以登录”的明确恢复路径；三个队列读取的 Hook 依赖豁免需在修改相邻所有者时收敛（`frontend/app.tsx` 的审核/成员/资产 effect），本轮未证实另一个 stale-closure 缺陷，没有机械删注释。

## 产品地图与证据边界

| 领域 | 当前仓库 | 接手时不要推断 |
| --- | --- | --- |
| 入口与工作台 | React/Vite；[Shell](../../frontend/components/shell/app-shell.tsx)和[共享路由权限注册表](../../shared/workspace-route-capabilities.ts)联系路由、可见性与能力；任务、看板、日程、目标、通知和讨论已分区。beUI 已接入，非只有方案。 | [beUI 原生页面记录](../operations/evidence/2026-10-18-beui-page-adoption.md)是历史版本证据，不覆盖本次页签、审核专页和新认证。 |
| 知识核心 | [Worker 入口](../../src/index.ts)、[HTTP 分发](../../src/app.ts)；D1 管理业务/权限，Durable Objects 管知识、会话、维护，另有 Assets、AI 与 Cron 配置。[Studio 历史验收](../operations/evidence/2026-10-18-studio-artifact-production-acceptance.md)记录特定线上版本。 | 假附件绑定、规则测试、Studio 历史验收不能替代这个候选的真实附件/AI 流程。默认部署配置没有声明 R2，按目标环境单独验可用能力。 |
| 认证与管理 | 密码、邀请和旧账号设密；审核、资产、成员、角色、菜单、空间、审计。代码上已能区分受邀注册、内建角色和委托授权，但当前有 H01–H11 所列缺口。 | 历史管理员/贡献者验收不代表当前密码与邀请流程已验，也不能从 `main` 或迁移文件数量推断生产授权状态。 |
| VM | 工作台环境元数据与独立 [Browser VM 工具](../../tools/browser-vm)分开；见 [VM 续行记录](./2026-09-28-vm-resumption-evidence.md)及 D04。 | 用户提供的握手、APK 验收或单次 `Failed to fetch` 都不是正式产品 VM 的生命周期、账户存储与联网通过。GitHub 超时按用户指示排除，不改 VPN 或浏览器安全配置寻求通过。 |
| 发布 | [历史生产验收](../operations/evidence/2026-10-16-production-acceptance.md)及[独立回滚记录](../operations/evidence/2026-10-18-kb011-production-rollback-acceptance.md)是记录所列版本/路径的证据。 | 未查本轮 Worker 版本、流量、远程 D1 台账或远端 CI。不能把历史 100% 或 `--dry-run` 当成本交付版本已上线。未读或上传 `SECRETS_FILE`。 |

## 清单如何收口

已关闭：`A03 A04 B03 B06 B07 C01 C03 C04 C07 D03 D05 D06`。D05/D06 不在本轮改勾；触及认证、权限和交互的后续候选仍应做增量回归。

| 顺序 | 保持开放的父项 | 关闭证据 |
| --- | --- | --- |
| 1. 认证与管理回归 | `D01 D02` | 先处置 H01，再对照真实管理员、被委托成员与普通成员的会话、路由、侧栏和 API；通过 D01 统计/范围/分页对账。D02 恢复审核及资产/成员写入所有权并验收角色、菜单、空间、审计主操作。 |
| 2. 操作覆盖与状态 | `A01 A02 A05 A06` | 对账路由/可见动作与 handler、API、权限、持久化、验证；业务台账补齐二级动作、确认、dirty、pending、全局摘要/未读、失败重试、离页清理。操作检测器候选数不是操作完成数。 |
| 3. 知识与协作 | `B01 B02 B04 B05 B08 B09 C02 C05 C06` | 复用已实现能力；核投稿、跨账户草稿隔离、附件到解析、AI 证据与取消恢复、跨模块撤权；验看板版本冲突/键盘、通知回写、讨论上下文与精确重试。每个完成项引用自身业务证据，不用大门禁代替。 |
| 4. VM 独立验收 | `D04` | 按 G0/LC 原清单续跑，保留 LC-010 的跳过且未通过状态，继续 LC-011 起的生命周期验收，保留后续独立门禁。此轮不新增备份或加密门槛。 |
| 5. 最终候选 | `D07` | 功能完成后固定 SHA 跑完整门禁；同步 README、ROADMAP、交付总账与原清单。D08 单列；需另行明确授权和候选到实际部署的证据。 |

## 本轮本地验证

从仓库根目录运行。验证日志在本地 `.audit/product-handoff-2026-11-19.logs/`（Git 忽略，不随交接提交传递）；规范检查通过代表断言成立，不代表所有人工旅程或全部功能关闭。

| 命令 | 本轮结果 |
| --- | --- |
| `npm ci` | 会话工具记录退出 0；npm 报告部分依赖安装脚本尚未获允许。未改锁文件，未另存安装全文。 |
| `npm run audit:functional-checklist` | 退出 0；30 原始，29 范围，12 已关闭，17 未关闭；D08 排除。 |
| `npm run verify:m1:migrations -- --files` | 退出 0；80 个本地迁移文件通过台账校验，非远程 D1 证据。 |
| `npm run verify:delivery-status` / `npm run verify:workbench-maturity` | 分别退出 0，30/30、15/15。 |
| `npm run verify:m1:docs` | 退出 0，核对到 14 个证据段与 76/76 原子项；不是独立的当前上线验证。 |
| `npm run audit:workbench-domain` / `npm run audit:frontend-operations` | 分别退出 0；后者扫 480 文件，识别 1807 个源代码操作候选。 |
| `npm run check` | 首轮生成 Wrangler 类型并通过 Worker、前端与落地页类型检查；smoke 本机监听 `127.0.0.1` 报 `EPERM`。完整门禁仍未验证，见下方。 |
| `npm run build:ui`、`verify:landing`、`build:secrets`、`build:legacy-audit` | 独立链式运行退出 0。UI 构建、VM 静态隔离、落地页 100/100、公开产物凭据扫描、legacy/beUI 检查通过。未执行 Wrangler dry-run。 |

**重跑未验证完整门禁。** 获准使用本机监听后，smoke 88/88、i18n 14/14、交付 30/30。完整门禁和独立测试的重跑一度重叠；unit 出现失败与 `act` 警告，三个重跑随即中止（退出 130），没有完整测试汇总，也未完成 Worker 测试或 Wrangler dry-run。不能据此归因于产品回归或资源争用。定向串行复验未取得结果。接手时只启动一套 `npm run check` 并保留退出码与第一个失败，再单独复验失败用例。

下一位接手：从 H01 拆一个独立修复批，之后并行拆分菜单/RBAC 与写入恢复；每批固定基线记录验收证据。代码审查与账本已完成，不能据此关闭仍开放的父项。决策轨迹见 `.audit/product-handoff-2026-11-19.tsv`。

## 2026-11-23 本地修复批

H01–H11 已按上表逐项本地实现并加回归测试，证据见[handoff fix batch](../operations/evidence/2026-11-23-handoff-fixes-local.md)：注册邀请码与独立一次性恢复码（`0081`）解耦；菜单写入后 Shell 重读导航；角色区分实际权限/存储掩码并从 `members.role` 派生内建角色成员；批量审核页按队列当前页进入、可翻页、迟到完成不导航、冻结意图跨刷新恢复；页签切换不再重挂操作所有者；被拒注册不消耗新账户配额；委托成员管理员隐藏邀请页签；成员页签保留邀请生成状态。全量 `npm run check` 通过（unit 414/5635、worker 81/1327）。本轮未应用迁移、未部署、未做 signed-browser 验收，父项关闭状态仍以交付账本和原清单为准。
