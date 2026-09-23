# 剩余任务统计与顺序执行清单

统计日期：2026-09-19。核对工作树：`codex/admin-audit-recovery`。

本文是执行索引，不替代[交付状态总账](../product/delivery-status-ledger.md)，不授权生产操作，也不是后续各子系统的已批准实现设计。既有未提交改动保留。

## 1. 统计口径

总账有 94 行能力记录；排除 `GATE-M0`、`GATE-M1`、`WS-001`、`WS-008` 四个旧版兼容映射，统计 90 个能力条目：

| 交付维度 | done | partial | pending | 尚未完成 |
| --- | ---: | ---: | ---: | ---: |
| 实现 | 70 | 5 | 15 | 20 |
| 验证 | 74 | 0 | 16 | 16 |
| 发布 | 0 | 24 | 66 | 90 |
| 验收 | 0 | 6 | 84 | 90 |

这是当前文件中的证据状态，不是本轮重新完成的生产验证。没有 `done` 发布/验收不等于从未部署，而是旧版本或有限范围的证据不能证明当前候选完整交付。四个维度有重叠，禁止相加为“剩余任务总数”；局部能力 `done` 也不代表完整页面没有缺口。

实现维度尚未完成的 20 项如下。若条目本身定义的是生产证据/验收，`pending` 表示该交付物欠缺，不能据此推断对应业务代码不存在。

| 能力条目 | 剩余范围 | 总账实现状态 |
| --- | --- | --- |
| KB-011、KB-012 | Revision diff/回滚/current 切换；知识回收站/恢复/最终清理 | 2 pending |
| RET-001、RET-002、RET-003、EVAL-001 | 多维过滤/授权定位、相关知识/反向链接、混合检索/降级、检索引用与权限泄露评测 | 4 pending |
| TSK-009、TSK-010 | 任务保留/软删除/恢复/清理；真实角色生产端到端证据 | 2 pending |
| NTF-005、NTF-006 | 通知目标失效/保留/删除/审计；生产隔离和幂等验收 | 1 partial + 1 pending |
| BRD-007 | 看板生产隔离/并发/登录态浏览器验收 | 1 pending |
| MSG-005、MSG-006 | 消息撤权收缩/保留/删除/审计；生产隔离和幂等验收 | 1 partial + 1 pending |
| ADM-011、GOV-001 | 管理域可访问性/空错态/浏览器验收；批量治理逐项结果与失败恢复 | 1 partial + 1 pending |
| OPS-005、OPS-007、OPS-009、OPS-010、OPS-011 | 角色登录旅程、回滚点/域名状态、免费层边界/发布额度、容量保护/恢复、1.0 手册与完整生产验收 | 2 partial + 3 pending |

[产品增量清单](../product/2026-09-12-personal-workbench-completion-audit.md)还有 **30 个未关闭父项**：A 6、B 9、C 7、D 8。它们含已完成子项，且与下列恢复主线重叠。不能称为 30 个全新功能，也不能将 30 与 25 相加。

当前优先恢复主线共 **25 个检查点，8 个关闭，17 个剩余；下一项 R09**。R01–R08 于 2026-09-20 关闭，见[真实入口本地证据](evidence/2026-09-20-maintenance-entry.md)、[D1 生命周期证据](evidence/2026-09-20-maintenance-d1-lifecycle.md)、[流/存储生命周期证据](evidence/2026-09-20-maintenance-stream-storage.md)、[控制面授权证据](evidence/2026-09-20-maintenance-control-auth.md)、[容量/人工退出证据](evidence/2026-09-20-maintenance-capacity-exit.md)、[合成故障矩阵证据](evidence/2026-09-20-maintenance-fault-matrix.md)和[候选完整回归证据](evidence/2026-09-20-maintenance-release-candidate.md)。前序 0051、备份可行性及备份工具不重复计入；旧测试记录见[迁移证据](../product/2026-09-17-calendar-reference-detach-evidence.md)、[备份工具证据](evidence/2026-09-18-d1-backup-tooling.md)、[协调器证据](evidence/2026-09-19-maintenance-coordinator.md)。本轮维护专项 63/63、完整应用回归和构建均已完成；未执行生产操作。

## 2. 执行规则

- 严格按 R01 → R25 推进；前项未满足完成标准，后项不标为执行或完成。一个检查点内有多个动作时仍须逐个留证。
- 每次完成记录：精确代码版本/候选、变更范围、命令和退出结果、证据路径、授权范围，再勾选。发现新阻塞先更新清单，不悄悄跳步。
- 本地实现、验证、commit、merge、push、部署、生产迁移、真实数据导出和验收分别记录；本次请求不合并这些授权。
- 本地阶段使用合成数据；不读取本地 `SECRETS_FILE`，不输出凭证或备份正文。生产停写、迁移、恢复、测试业务写入各有独立授权。
- `DRAINED` 仅表示已登记工作清零。全部署、Cron、旧版本、外部凭证写者均受控并有证据，才可记录生产 `FROZEN`。异常、失联、孤儿工作不得按超时直接清零。
- R16–R20 默认是同一个获批的停写窗口。恢复演练不能在批准窗口内完成时停止迁移，并按批准的退出方案恢复服务；后续重新冻结并重新备份，不把旧备份称为新鲜备份。不得为完成清单无限延长停机。
- 故障恢复是条件分支，不是必须执行的日常任务。迁移失败立即停止并检查账本/结构；禁止自动重跑、删除账本、改旧 SQL 或自动 Time Travel restore。是否恢复另行审批。

## 3. 当前恢复主线：25 项，严格顺序

### A. 本地接入与安全验证（R01–R08，共 8 项）

- [x] **R01 — 完成真实入口/写入生命周期审计并确认接入设计。** 2026-09-20 用户确认进入 R02；[源码审计](evidence/2026-09-19-maintenance-entry-audit.md)、[获准规格](../superpowers/specs/2026-09-19-maintenance-entry-integration-design.md)及[实施计划](../superpowers/plans/2026-09-20-maintenance-entry-integration.md)已具备。静态审计不等于 R07 动态覆盖或 R09 生产全写者证明。
- [x] **R02 — 接入真实 fetch/Cron 的本地测试路径。** 2026-09-20 完成本地共用入口及独立合成资源 harness。关闭时 HTTP 503、Cron 不进入业务；45 项专项和完整应用回归通过，见[候选及验证证据](evidence/2026-09-20-maintenance-entry.md)。index 明确 legacy，未新增生产 binding/启用生产维护；R04 后续单独进入。
- [x] **R03 — 接管后台与隐式写生命周期。** 2026-09-20 完成本地 D1 facade、scope sealing/不确定状态、成员 last_seen/session/nonces 原始 Promise 观察及真实 guarded entry 回归；业务响应语义保留，失败或结果不明不会安全释放。见[D1 生命周期证据](evidence/2026-09-20-maintenance-d1-lifecycle.md)。生产入口仍为 legacy；R04 已另行关闭。
- [x] **R04 — 处理流、取消、超时和跨存储尾部工作。** 2026-09-20 完成 Agent 流正常 EOF/未消费/取消/上游错误/取消失败矩阵、解析 timeout 迟到写入负向测试、R2 补偿失败观察和 VFS/DO typed failure observer；62/62 维护专项及完整应用回归通过。见[流/存储生命周期证据](evidence/2026-09-20-maintenance-stream-storage.md)。生产入口仍为 legacy，不承诺跨存储原子性。
- [x] **R05 — 完成维护控制面的授权与重放防护。** 2026-09-20 为 `beginDrain`/`resume` 增加显式合成控制能力校验；错误/缺失能力在状态变更前返回 `CONTROL_UNAUTHORIZED`，普通成员/session/permit/epoch 不具备控制权限。窗口、epoch、重复命令、旧命令和重放墓碑负向矩阵保持通过。见[控制面授权证据](evidence/2026-09-20-maintenance-control-auth.md)。生产入口仍为 legacy，未配置生产控制密钥。
- [x] **R06 — 完成容量、孤儿许可及人工退出规则。** 2026-09-20 新增 `capacity()` 只读快照和 8,000/9,500/10,000 分级保护；重启后的活动许可必须人工核实，无法证明时保持阻塞，无 TTL/强制释放/自动开闸。见[容量/人工退出证据](evidence/2026-09-20-maintenance-capacity-exit.md)。生产容量和安全压缩仍未批准。
- [x] **R07 — 跑真实应用接线的合成故障矩阵。** 2026-09-20 通过本地真实 Worker entry、合成 D1/R2/DO 和维护专项 63/63 覆盖关闭零写入、慢请求、已开始 Cron、迟到/嵌套写入、catch 后原始失败、流断连、重启/失联、重复/跨窗口控制及不确定不放行。见[合成故障矩阵证据](evidence/2026-09-20-maintenance-fault-matrix.md)。生产 legacy/外部写者仍不在本地矩阵范围。
- [x] **R08 — 完成精确候选的回归与评审。** 2026-09-20 以本地 `HEAD 6e1934a` 完成维护专项 63/63、备份回归 21/21、应用/专项类型检查、完整 `npm test`、构建/landing 97/97、secret/legacy audit、Wrangler dry-run、交付合同 30/30 和 `git diff --check`；工作树干净，未 push/部署/生产 smoke。见[候选完整回归证据](evidence/2026-09-20-maintenance-release-candidate.md)。

### B. 发布与备份前置条件（R09–R15，共 7 项）

- [ ] **R09 — 核实实际发布链和全部生产写者。** 2026-09-23 已通过自带浏览器的 Cloudflare Dashboard 刷新确认 `mbpz/cf-computer-agent` 的 `main` 分支构建：Build `#d11574fa`、commit `ea9f9c58c03e489f2a342788ea700a052aa5ee5c`、构建命令 `npm run build`、部署命令 `npx wrangler deploy`，部署历史记录显示生产版本 `6025488e` 于 08:45:16 由 Wrangler 切换为 100% 流量；同时确认 `memory.crgmhrc.asia` 为自定义生产域名，workers.dev/Preview URL 关闭，D1/DO（含 MAINTENANCE）/Assets/AI/Cron 配置已盘点，Queue/Email 未配置；另有独立 `mbpz/edgetunnel` Worker 仅绑定 KV、无自定义域/路由且近 24 小时调用为 0，已排除其直接写入本项目 D1/DO。Automation、手工 Wrangler/D1、OAuth callback、Cron 和旧版本入口已完成责任预检，但实际生产调用者、审批、停写和恢复证据仍缺；见[Dashboard 发布链证据](evidence/2026-09-22-r09-dashboard-evidence.md)、[写者责任账本](evidence/2026-09-22-r09-writer-ledger.md)和[责任预检](evidence/2026-09-23-r09-responsibility-preflight.md)。
- [ ] **R10 — 完成远程合成只读传输验证。** 单独批准测试库/fixture 及权限；验证正式工具的权限、PRAGMA、数值/二进制编码、响应封装、请求/大小限制。离线 fixture 不能替代真实接口验证；不访问生产私有内容。
- [ ] **R11 — 补发布/schema 防漂移门禁。** 基于 R09 的实际平台，验证批准候选 hash、现有迁移前缀、待迁移清单、目标 binding 和同版本验收；本地负向测试覆盖缺迁移、错库、旧 SQL hash 变化及意外新增。实际平台配置变更须批准，不自动每次 push 执行迁移。
- [ ] **R12 — 确认备份保管与隔离恢复条件。** 明确加密、访问限制、独立摘要、保留/清理、恢复隔离及真实内容处置；核对数据规模与工具资源预算。0700/0600 不是加密，临时目录不是长期备份；不将私有正文放进仓库/聊天/附件。
- [ ] **R13 — 批准并形成可追溯维护发布候选。** 分别明确提交、合并、推送及维护代码部署的允许范围；获准后执行相应步骤，记录精确候选、所需 binding/配置和回滚/退出策略。未经授权不操作远程仓库或发布。
- [ ] **R14 — 授权部署维护能力并核实写者覆盖。** 当前 `6214a31` 已由 Cloudflare CI 成功部署，当前 100% 版本为 `d73ffe49`，`MAINTENANCE` Durable Object binding 和管理员维护控制 API 已出现；但生产 secrets 仍未配置 `MAINTENANCE_CONTROL_TOKEN`，因此 guarded fetch/Cron 未启用，不能验证生产 `status/capacity/beginDrain/resume`。见[guarded 部署证据](evidence/2026-09-22-r14-guarded-deployment.md)和[R14 生产激活预检](evidence/2026-09-22-r14-production-activation-preflight.md)。仍需确认所有可写入口使用该控制机制、旧版本/其他写者按方案停止或隔离，并验证控制鉴权。仅部署代码并不等于已经冻结数据；验证过程仍在批准范围内。
- [ ] **R15 — 批准实际停写/导出窗口并刷新预检。** 确认最长停机、终止条件、操作人、准确归档路径及保管策略；工具独占创建最终目录，禁止预建/覆盖。刷新 Worker/Git/binding、账本、migration hash 和容量；2026-09-17 的 32 条账本/19 个 pending 仅是历史快照。

### C. 停写、备份、迁移与恢复服务（R16–R21，共 6 项）

- [ ] **R16 — 实际冻结并排空所有写者。** 执行获批窗口，记录全写者拒绝新工作、在途/后台/Cron 排空及外部写入控制证据。存在孤儿、未确认错误或旧写者时停止，不能声明 `FROZEN`。
- [ ] **R17 — 生成并校验真实独立备份。** 保持冻结，使用经验证工具导出；检查成功状态、非空字节数、摘要、schema/identity、UTC 时间和新鲜恢复 bookmark。两次扫描相等只是检查，不代替冻结；不能删 FTS 表绕过导出限制。
- [ ] **R18 — 验证真实备份的受控隔离恢复。** 在批准的隔离环境恢复真实备份，核对表/索引/触发器/FTS 重建、类型/数据摘要、序列和完整性；不向生产恢复、不泄露正文。合成测试或“导出成功”不能替代此项。
- [ ] **R19 — 单独批准准确生产迁移批次。** 复核备份新鲜度、冻结状态、pending、hash、失败停止和退出流程。只有新鲜账本仍匹配时才使用历史预期 0033–0051 共 19 个；差异必须停下重新审查，不假造 `--to` 或绕过迁移账本。
- [ ] **R20 — 执行获批迁移并保存结果。** 执行前再次列出 pending；执行后记录每项结果。一旦失败停止，核对已成功前缀和结构；后续续跑/恢复重新批准，不自动抹除历史或重试。
- [ ] **R21 — 结构/只读健康验收后按方案恢复服务。** 核对批准的完整账本、notifications 约束/索引、discussion 结构、tasks.status_version、calendar detach、FK 检查及通知/消息读取；证明运行的是批准候选。检查成功后按窗口规则恢复准入并核实健康；失败按已批准退出方案处理，不盲目开闸。

### D. 真实用户验收和交付收口（R22–R25，共 4 项）

- [ ] **R22 — 授权后跑合成业务的生产闭环。** 在明确测试数据/清理范围内验证任务→日历→删除保留、三种审核决定→提交者通知→已读重放→目标当前权限；记录实际请求和结果，不使用真实业务数据试错。
- [ ] **R23 — 完成真实第二成员和角色隔离。** 使用独立受邀身份验证 admin/contributor/第二成员、草稿退出切换、提交重试、通知/消息隔离与越权拒绝；不把管理员模拟身份当双账号证据。
- [ ] **R24 — 补界面缺口及交互矩阵。** 中文任务筛选枚举、OAuth 展示名称分别确认范围后修复；覆盖多页数字分页/每页数量、失败恢复、中英文、深浅主题、键盘焦点及 320/375/768/1280 尺寸。需真实设备的部分保留真实设备证据要求，浏览器缩放不冒充。
- [ ] **R25 — 按精确范围收口并转入产品队列。** 将候选、发布、结构及各旅程证据写回总账、Roadmap 和原子清单；仅关闭真正通过的 D02/R6-003/D3/D4 子项。未覆盖范围保留开放，不能由本主线完成推断 1.0 或 30 个产品父项全部完成。

## 4. R01 审计进展与已确认方向

入口要点（完整本地记录见 R01 链接；不是生产全写者证明）：

| 位置 | 观察 | 对接入的要求 |
| --- | --- | --- |
| `src/index.ts` 的默认 fetch/scheduled | HTTP 直接转 app；Cron 直接创建 AssetService/AssetsRepository | 准入必须在真实 HTTP/Cron 工作之前；只包测试替身不够 |
| `src/app.ts` 的 fetch/createRequestServices | /auth、API 都会构建请求服务；异常可在 app 内转换为响应 | 不能仅拦 POST 或把 HTTP 响应完成当作底层写入安全结束 |
| `src/members/service.ts`、`src/identity/session.ts`、`src/identity/automation.ts` | last_seen、过期会话/nonce 清理在 waitUntil 前 catch | 必须观察原始失败，不能只登记已吞错的 Promise |
| `src/routes/agent.ts` 的 withPersistedAssistant | 独立流生产者及未等待的 reader.cancel | 流生命周期和取消链不能只靠响应 body EOF 推断 |
| `src/assets/service.ts` 的 processDue/withAssetParseTimeout | 逐项捕获错误；Promise.race 超时不证明原任务停止 | 区分纯解析/外部请求与具有后续写入能力的工作，逐个验证 |

用户已确认先做“共用真实入口 + 显式注入本地维护控制器”的接线：生产默认路径暂不启用维护；独立 harness 显式启用并使用合成 D1。启用模式下缺失/失联必须拒绝工作，不能静默降级放行。原始后台失败和流生产者在各自发生处登记，避免外层只看到已吞错的结果。

备选是直接新增生产 binding/控制入口，优点是早做端到端、代价是提前引入部署和控制面风险，超出当前批准边界；逐路由拦截侵入较小，但容易遗漏鉴权隐式写和 Cron，不采用作为完整冻结方案。

审计后具体化的设计包括：请求级 D1 facade 观察被业务 catch 掩盖的原始失败、sessionDatabase 覆盖隔离、并行分支完整登记，以及纯 provider 超时与可写 continuation 的区分。知识库读取也可能创建目录/恢复工作区。以上已写入获准规格，属于 R03/R04，不视为随 R02 已实现。

R01 内部进度（不是新增恢复主线检查点）：

- [x] R01.a — 确认本地共用入口方向和生产不启用边界。
- [x] R01.b — 保存源码审计、候选输入摘要、异步分类与未覆盖范围。
- [x] R01.c — 写入接入规格并完成一致性、范围和歧义自检。
- [x] R01.d — 2026-09-20 用户确认进入 R02，书面规格获准，包括原始存储失败保守保留许可的取舍。
- [x] R01.e — 形成[实施计划](../superpowers/plans/2026-09-20-maintenance-entry-integration.md)，关闭 R01、进入 R02 本地实施。

## 5. 后续产品父项：30 项，不与恢复清单相加

恢复主线优先。结束后先更新映射，再按下列队列进入各批；已经在 R22–R25 验证的子项只引用证据，不重复建设。B02 → B01 保留隐私优先顺序，D02/D01 的当前恢复工作已经前置。

| 队列 | 原父项 | 仍需关闭的范围 |
| --- | --- | --- |
| 1 | A01–A06（6 项） | 全可见操作/二级弹层清点；handler/API/授权/持久化/测试映射；状态分类；R1 对账；pending/dirty/危险操作；摘要/未读/退出清理 |
| 2 | B02、B01（2 项） | 已有本地隔离/幂等实现的真实双账号、刷新恢复和发布验收；不重做已合入代码 |
| 3 | B03–B05（3 项） | 附件 bindings/免费层与容量契约、选择校验、真实上传/进度/取消/重试/解析回读 |
| 4 | B06–B09（4 项） | 审核发布重放、检索阅读精确引用、AI 范围/会话/取消、任务和讨论跨模块权限 |
| 5 | C01–C07（7 项） | 任务、看板、目标项目、收集箱/今日/日历/专注/复盘、通知、消息、删除恢复与保留策略 |
| 6 | D01–D04（4 项） | 管理统计与各页剩余操作；知识版本/回收/导出恢复/研究产物；复用 VM 历史实现补正式流程 |
| 7 | D05–D08（4 项） | 角色与越权旅程、设备/语言/主题矩阵、精确候选完整门禁与文档、授权发布和真实验收 |

上述父项不是穷尽的工程原子估时。R3 治理/版本回收、R4 检索评测、R5 来源工作台/Agent、R6 完整恢复/容量/1.0 仍须沿 Roadmap 和总账逐批细化；D1-only 恢复不能代替 R2/DO 等完整灾备。

## 6. 本轮执行记录

- [x] **S00 — 清点与去重。** 读取当前工作树的总账、Roadmap、产品增量清单、生产 catchup 计划及备份/维护证据；程序统计 94 行、排除 4 个兼容映射得到 90 能力，30 个产品父项。生成 R01–R25 顺序清单；不改交付状态、不连接生产。
- R01：2026-09-20 用户确认进入 R02，书面规格获准、实施计划形成，前置条件齐全后关闭。
- R02：2026-09-20 本地实现和验证完成；45/45 专项、完整 npm test（Worker 636/636）、应用/专项类型检查通过。见[本轮证据](evidence/2026-09-20-maintenance-entry.md)。恢复主线 2 关闭/23 剩余。
- 2026-09-20 R03 收尾校验：维护专项 55/55、应用/专项类型检查、完整 `npm test`、构建、交付合同 28/28 和 `git diff --check` 通过；候选提交 `95bd921`。
- 2026-09-20 R04 收尾校验：维护专项 62/62、应用/专项类型检查、完整 `npm test`、构建、交付合同、VFS/资产回归和 `git diff --check` 通过；生产 Wrangler/生成 Env 未变，未执行生产变更。见[流/存储生命周期证据](evidence/2026-09-20-maintenance-stream-storage.md)。
- R05：2026-09-20 本地授权与重放防护完成；维护专项 63/63、应用/专项类型检查和 `git diff --check` 通过。见[控制面授权证据](evidence/2026-09-20-maintenance-control-auth.md)。
- R06：2026-09-20 本地容量快照、告警阈值和人工退出规则完成；维护专项 63/63、应用/专项类型检查、交付合同和 `git diff --check` 通过。见[容量/人工退出证据](evidence/2026-09-20-maintenance-capacity-exit.md)。
- R07：2026-09-20 本地真实入口合成故障矩阵完成；维护专项 63/63、应用/专项类型检查、交付合同和 `git diff --check` 通过。见[合成故障矩阵证据](evidence/2026-09-20-maintenance-fault-matrix.md)。
- R08：2026-09-20 本地候选 `6e1934a` 完成全量回归、构建和评审；备份 21/21、维护 63/63、交付合同 30/30 均通过。见[候选完整回归证据](evidence/2026-09-20-maintenance-release-candidate.md)。
- R09：source-to-version、Dashboard CI、当前 Worker 绑定/触发器和 `edgetunnel` 排除证据已补齐；2026-09-23 再次确认 `edgetunnel` 仅绑定 KV、无自定义域/路由、过去 24 小时调用为 0；仍缺 Automation、Dashboard/控制台、旧版本/其他环境及 OAuth callback 的生产写者责任、停写顺序和恢复顺序，保持开放。见[Dashboard 发布链证据](evidence/2026-09-22-r09-dashboard-evidence.md)和[写者责任账本](evidence/2026-09-22-r09-writer-ledger.md)。
- 后续游标：R09（补齐剩余生产写者责任证据），本轮不执行生产变更。
- 初始清点文档校验：`npm run verify:delivery-status` 28/28 通过、退出 0；`git diff --check` 退出 0。当次只读 Node 核对了 R01–R25 连续且未勾选、90 项能力四维计数、30 个产品父项和 8 个相对链接。该记录不代替新增审计/规格后的校验；本次未重跑应用测试，未修改运行时代码。
- 2026-09-19 接入规格文档校验：重新运行 `npm run verify:delivery-status`，28/28、退出 0；`git diff --check` 退出 0。只读 Node 断言检查本清单/审计/规格三个文件的 15 个相对链接、无占位、25 项主线仍开放、R01 三个子步骤完成/两个待办，以及审计源码摘要未变化。上述仅为文档及范围校验，不是接入实现或运行时验收。

原始依据：[生产 catchup 计划](../superpowers/plans/2026-09-17-production-d1-catchup.md)、[维护设计](d1-backup-maintenance-design.md)、[真实浏览器阻塞记录](../product/2026-09-17-production-browser-acceptance.md)。旧标准 export 命令因 FTS 限制保留为历史记录，不列为待执行动作；应急 restore 只属于另行批准的条件分支。
