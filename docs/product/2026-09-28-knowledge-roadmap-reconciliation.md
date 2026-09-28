# D03 — 知识版本、回收、导出恢复与研究产物对账

日期：2026-09-28 UTC（本地 Asia/Shanghai 为 2026-09-29）。核对基线：`codex/functional-checklist-completion` / `e7ab6a3`。

## 交付边界与结论

D03 的原文是“按原 roadmap 对账，确定未完成子项”。本次交付的是下述源码、入口、测试、归属与剩余条件矩阵，不是把四个业务模块宣布完成。原 30 父项排除发布 D08 后为 **29 范围内 / 5 已关闭（A03、A04、B03、C07、D03）/ 24 未关闭**。下一项为 D04；D02、D05/D06 及本文列出的业务缺口继续开放。

只读取本地代码并运行本地测试，没有备份、生产导出、远程恢复、远程迁移、部署、真实 AI 调用或手动读取 Secret。用户“不备份、不加密”的决定继续有效；备份豁免不等于恢复功能完成，也不成为功能工作的前置阻塞。

## 原 roadmap 与现有代码逐项映射

| 范围 / 原 owner | 现有实现与入口 | 当前证据和不能推导的结论 |
| --- | --- | --- |
| 版本读取、diff / R3，KB-004、KB-011 | `src/library/service.ts` 的 revision/diff 在相同知识条目范围内分别授权两个版本；`src/library/revision-diff.ts` 比较内容及元数据；`src/routes/library.ts` 提供版本与 diff API。`frontend/app.tsx` 的 KnowledgeReaderRoute 已调用 `loadKnowledgeRevisionDiff`，阅读器有与 previousRevision 对比入口，并非“完全没有 diff” | 本轮 library、revision-diff、reader-data 测试通过；现有对比入口不等于完整版本历史选择器、任意版本对比及原生多身份旅程完成 |
| 回滚 / R3，KB-011，消费 ADM-009 | `src/routes/admin-review.ts` 的管理员 POST `/api/admin/knowledge/:id/rollback`；`PublicationService.rollback`、`PublicationRepository.rollback` 条件更新 current、同 D1 batch 写审计与索引任务；不可变 revision 保留 | Worker 覆盖 current 指针切换、保留历史、重索引、审计失败事务回滚；前端未接管理 rollback，未证明多次返回同一目标、并发与未知结果的完整重放协议。总账从 pending/pending 校正为 partial/partial，不提升 release/acceptance |
| 回收、恢复、最终清理 / R3，KB-012，消费 ADM-009、TSK-009 | 同一管理员路由提供 trash list、trash/restore/purge；service 有 30 天保留检查、已清理审计重放，repository 管理状态/派生索引。`PublicationService.purge` 仍先 remove 内容、后 finalizePurge | 本轮本地生命周期/HTTP测试通过；知识回收管理 UI 未接线，成员自助边界未定义；跨存储清理与并发恢复不能由 D1 事务单独保证。沿用 C07 独立设计，不重建另一套回收系统，不关闭 KB-012 |
| 知识导出、dry-run、恢复计划 / R6，OPS-008（旧 OPS-017–022） | `src/ops/export-package.ts` 接收调用方传入记录，构造排序清单、hash、Revision/Chunk 引用及可选原件内联数据；export-cursor 绑定快照/类别；import-dry-run、restore-plan、index-rebuild-plan、restore-drill 输出检查与计划 | 六组工具本轮测试通过；恢复计划明确 `writes: none`，不是新环境写入执行器。包固定 categories 为 members/spaces/collections/submissions/reviews/sources/sourceVersions/knowledgeItems/revisions/researchRuns/researchReports/privateNotes/assets；没有 Tasks/Goals/讨论等当前全工作台实体，不可称 current schema 全量恢复 |
| 运维 D1 逻辑恢复工具 / OPS-008 消费 OPS-001；独立维护链 | `tools/d1-backup/README.md` 与既有工具描述受控 D1 capture、typed records、FTS、schema/hash/ledger 校验及 disposable local restore-check；后者实际在一次性本地 D1 执行恢复，不是上行只读计划器 | 本次仅源码/工具边界核对，不重跑 capture/真实 archive 恢复。该工具不是产品导出 UI，也不包含完整 R2/DO 业务数据恢复；用户明确不备份，不能拿历史合成库测试替代本轮当前数据恢复证据 |
| 私人笔记与生成产物 / R4/R5，KB-010；R5 消费 KB-007、IDN-005 | Note 已有阅读器与 owner-scoped 持久化。summary/faq/timeline/brief/comparison/mindmap/flashcards/quiz 的服务及 POST 路由存在，逐条授权所选引用并校验模型输出；ART-014 媒体实验只是默认关闭的策略门禁 | 本轮对应服务、笔记及 HTTP 测试通过，使用 fake AI；除 Note 外，当前 React 阅读器未提供这些完整生成/编辑/保存入口，不可把后端 API 或实验 gate 当成已交付产品 UI |
| ResearchRun/报告 / 原 R5，KB-009 有界 Agent 邻接范围；旧 RES 与 ART-007/011–013 | `src/ai/research-report-service.ts`、`src/research/repository.ts`、`src/routes/library.ts` 已有 owner-scoped run、计划审批、暂停/取消、查询记录、quota/checkpoint、报告版本/provenance、转 Submission draft；前端 `loadRecentResearch` 仅首页 recent 列表读取 | 本轮 report-service 与 m1-api 覆盖受限生成、所有者隔离、版本/转草稿等。recent 列表不是研究工作台；KB-009 的现有 done 只覆盖其有界只读 Agent/会话行，不能扩张为全部 ART 完成。新增研究实施 atom 须按原 R5 先入总账再实施 |

## 剩余子项与关闭条件（仍开放，不新建平行父清单）

| 原归属 | 尚待实施/验证 | 关闭所需证据 |
| --- | --- | --- |
| KB-011 / R3 | 版本历史/目标选择、管理回滚确认与 pending/dirty 状态；稳定请求身份、同目标反复回滚、条件冲突与未知结果回读边界 | 用户入口→授权→条件写→审计→索引回读；跨成员/撤权拒绝；丢响应、同目标循环、并发及失败后恢复的独立测试与原生验收。固定 `rollback-{item}-{revision}` 审计 ID 的多轮语义需专项验证，不因一次回放测试推断安全 |
| KB-012 / R3 / C07 | 知识回收 UI、明确管理员/成员作用域；按既有独立设计补删除意图/跨存储协调及恢复冲突保护 | 不可恢复操作显式确认；保留期、并发恢复、内容失败、D1 finalize 失败、墓碑/重试、派生索引一致性及成员隔离。见 `docs/superpowers/specs/2026-09-28-lifecycle-gaps-design.md`；本文不批准生产删除 |
| OPS-008 / R6 | 区分知识包与全工作台 current-schema 包；补受控读适配、跨 D1/DO/R2 的一致性范围、权限/身份映射覆盖、真正的恢复执行/重新索引对账 | 先用脱敏合成数据在全新本地环境证明字节/hash/Revision/Citation/权限一致及可恢复失败；远程/真实内容另行授权。当前豁免备份不妨碍本地工具继续实现；无需现在读取生产数据 |
| R5 研究产物，消费 KB-009/010/007、IDN-005 | 根据旧 ART/RES 明确新增 atom 与入口：来源选择→计划审批→生成→暂停/取消/恢复→版本阅读→转草稿；完整分页、稳定幂等与撤权后清屏 | 先登记 bounded owner/实施范围，不在 KB-009 既有 done 中隐藏新增功能；本地 fake AI 回归、owner/来源二次授权、断线/重复/额度延期/跨刷新，再做真实身份与原生旅程。真实 AI 使用需独立资源授权 |
| D05/D06（共用验收，不重复实现） | 上述 UI 的真实 admin/contributor/第二成员，双语/主题/视口/键盘/触控 | 原生功能验收，fixture/happy-dom 不替代；D08 发布保持独立，不让发布或备份反向阻塞本地功能 |

## 本轮验证

以下命令均使用现有安装依赖；Worker 配置 `remoteBindings: false`，HTTP 生成测试使用 fakeAi，而非调用实际模型。终端 AI binding 的通用警告不是实际调用证据。

```sh
rtk proxy npx vitest run test/unit/export-package.test.ts test/unit/export-cursor.test.ts test/unit/import-dry-run.test.ts test/unit/restore-plan.test.ts test/unit/index-rebuild-plan.test.ts test/unit/restore-drill.test.ts test/unit/research-report-service.test.ts test/unit/source-summary-service.test.ts test/unit/faq-service.test.ts test/unit/timeline-service.test.ts test/unit/brief-service.test.ts test/unit/comparison-service.test.ts test/unit/flashcard-service.test.ts test/unit/quiz-service.test.ts test/unit/publication-service.test.ts test/unit/library-service.test.ts test/worker/m1-publication.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts test/worker/private-notes.test.ts
rtk proxy npx vitest run test/unit/mindmap-service.test.ts test/unit/revision-diff.test.ts test/unit/experimental-media-policy.test.ts test/unit/private-notes-service.test.ts test/unit/frontend-knowledge-note.test.ts test/unit/frontend-knowledge-reader-data.test.ts
```

结果分别 **20 文件 326/326**、**6 文件 35/35**，合计 **26 文件 361/361**。这不是全仓门禁、真实 AI 质量评测、原生验收或生产恢复成功证明。此次未修改业务代码，无新增 migration。

文档更新后运行：

```sh
rtk proxy node --test scripts/functional-checklist-audit.test.mjs scripts/delivery-status-contract.test.mjs scripts/workbench-maturity-contract.test.mjs
rtk proxy npm run audit:functional-checklist
rtk git diff --check
```

三组文档合同 **50/50** 通过，审计实算 **29/5/24**。第一次合同检查发现 ROADMAP 总账统计尚未反映 KB-011 的 partial 校正；已同步为 implementation done75/partial7/pending13、verification done79/partial2/pending14（95 atoms），未放宽测试。发布/验收汇总不变。
