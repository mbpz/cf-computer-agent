# Memory Garden Roadmap

更新时间：2026-08-22

产品定位：面向 **5–20 名受邀成员**、运行在 **Cloudflare 免费层**、保留现有 **GitHub OAuth + D1 Session + HMAC Automation** 登录体系的私有 AI 知识操作系统。

权威文档：

- [AI 知识操作系统设计规格](./docs/superpowers/specs/2026-08-21-ai-knowledge-system-design.md)
- [国外 AI 知识库标杆矩阵](./docs/product/ai-knowledge-base-benchmark.md)
- [原子级交付 Checklist](./docs/product/ai-knowledge-base-checklist.md)
- [生产核心运维手册](./docs/operations/production-environment-handbook.md)

## 不可突破的边界

- 不做公开注册、多租户 SaaS、计费、套餐或企业目录同步。
- 不替换现有 GitHub OAuth：继续使用 state、PKCE S256、primary+verified email、邮箱 allowlist、D1 哈希 Session、admin/contributor 角色。
- Automation 继续要求 HMAC + `APP_TOKEN`，只允许 legacy API，不获得管理员权限。
- 不恢复 Cloudflare Access/Zero Trust 依赖。
- 保留 `KnowledgeBase` Durable Object 类名和 migration tag `v1`，任何数据迁移必须追加且可恢复。
- 核心链路必须在 Workers Free 已知额度内运行；AI、Vectorize、Queue 失效时仍能录入、审核、阅读和 FTS5 搜索。
- Agent 只读正式知识并生成草稿；不得直接发布、删除、改权限或执行任意网络、Shell、代码、浏览器工具。

## 交付与证据规则

- 每个 Milestone 必须交付一条可部署、可回滚的纵向用户旅程，不建立长期“大爆炸”分支。
- 原子状态以 [Checklist](./docs/product/ai-knowledge-base-checklist.md) 为准；Roadmap 不重复伪造完成度。
- 先写失败测试，再实现最小能力，再运行完整 gate。
- 本地 fixture 只证明确定性逻辑；workerd 只证明 Cloudflare 本地运行时合同；远程能力必须单独记录日期、version ID 和脱敏 request ID。
- README、勾选框、页面截图和“操作成功”口述都不能替代可复核证据。
- D1 migration 只追加，不修改已部署 migration；所有权威数据必须可导出、恢复并重建派生索引。

## M0 — 固化当前安全基线

目标：把当前身份、权限、控制面、兼容知识 API 和生产运维作为后续迭代的不可回归基线。

已具备：

- GitHub OAuth、D1 Session、成员 allowlist、bootstrap admin、禁用成员、角色能力矩阵。
- HMAC + APP_TOKEN automation；automation 不能调用 admin API。
- D1 members/spaces/collections/submissions/audit_events 控制面。
- Computer VFS legacy 笔记、关键词检索、Workers AI 引用问答。
- 安全错误、request ID、日志脱敏、版本化 Secret 上传与部署手册。
- 操作者已在 2026-08-21 确认生产 GitHub OAuth 登录成功；正式证据归档仍需补齐成功 callback 的 version ID/request ID。

退出标准：

- [x] 在生产自定义域归档一次成功 GitHub OAuth callback 的脱敏证据。
- [ ] signed automation smoke 在生产自定义域通过，错误签名/Token 稳定拒绝。
- [x] disabled contributor 的真实会话被应用拒绝。
- [x] Durable Object 跨远程激活后仍能读回笔记。
- [x] production/preview workers.dev URL 在账户中保持关闭。
- [ ] 当前完整 `rtk npm run check`、D1 migration 状态和回滚点被记录。

## M1 — 单来源可信知识闭环

目标：一条文本/Markdown/代码来源完成“提交 → 解析 → 分块 → 审核 → 发布 → FTS 搜索 → 阅读 → 引用问答”。

实施计划：[M1 单来源可信知识闭环实施计划](./docs/superpowers/plans/2026-08-21-m1-single-source-knowledge-loop.md)

当前状态：23 个本地/Workerd M1 产品原子已通过固定验收；生产 `0004` migration、精确版本部署、signed automation smoke、13 条 D1 成本路径，以及 OAuth callback、disabled contributor、DO 正常生命周期读取和 Dashboard URL 关闭证据均已归档。`GATE-M0`/`GATE-M1` 已接受；后续代码变更必须生成新的生产证据记录。

范围：

- Source、SourceVersion、KnowledgeItem、Revision、Chunk、Citation 的最小权威模型。
- 纯文本、Markdown、代码输入；SHA-256 幂等和大小/metadata 边界。
- 确定性解析、heading-aware/line-aware chunk、稳定来源定位。
- 管理员审核、shared/admin_only、驳回、不可变 Revision 和并发发布恢复。
- D1 FTS5、BM25、过滤、高亮、权限二次校验。
- 阅读器定位与严格引用问答；无来源/低相关时拒答。

退出标准：

- [ ] 一条来源的完整纵向旅程在 workerd 和生产环境通过。
- [x] contributor 无法读取 admin_only、他人草稿或历史不可见版本；状态：L/W，生产拒绝证据待归档。
- [x] 每个答案引用能回读到当前用户可见的精确 Chunk/位置；状态：L/W，生产 request ID 待归档。
- [x] Workers AI 不可用时录入、审核、阅读和 FTS 搜索仍可用；状态：L/W，真实 Provider/额度故障证据待归档。

## M2 — 多格式与可观测摄取

目标：安全接收常见文件并让每一步处理状态可见、可重试、可降级。

当前进度：M2-1 原件与任务状态、M2-2 提交页上传入口、M2-3 文本类原件解析状态推进、M2-4 免费 Cron 自动扫描、M2-5 可选 Workers AI Markdown Conversion、M2-6 owner-scoped 原件/解析结果下载、M2-7 “我的原件” owner-scoped 分页历史、M2-8 管理员队列查询/解析预览/失败重试 API、M2-9 管理员资产队列页面、M2-10 强类型扩展名/MIME 一致性校验、M2-11 解析失败原因本地化展示、M2-12 二进制魔数校验与代表性格式矩阵、M2-13 R2 缺失可重试与失败恢复矩阵、M2-14 管理员任务尝试次数/更新时间可观测性、M2-15 D1 跟踪容量断路器与双写补偿测试、M2-16 孤儿 R2 对象预览与二次校验安全回收 API、M2-17 DOC/ODT/ODS/Numbers 格式矩阵与解析降级验证、M2-18 全格式失败矩阵与中断上传补偿验证、M2-19 AI/R2 暂时故障后的有界 Cron/手动恢复重投验证、M2-20 PAR-020 重新解析候选/幂等任务/管理员查询/确认物化已在本地/Workerd 完成；物化 Submission 接入现有管理员发布审核、真实文件样本、生产 R2 bucket、0005/0006 migration 和部署仍需单独授权与远程证据。

前端迁移：React + Vite + shadcn/ui 已在本地/Worker dry-run 切换到 `frontend/dist`；旧 `public/` 保留为回滚源。生产 OAuth/session、权限拒绝、跨激活和自定义域 smoke 证据完成前，不删除旧 UI。操作顺序见 `docs/operations/react-frontend-cutover.md`。

范围：

- 私有 R2 Standard 原件、staging/final/quarantine、浏览器直传和孤儿回收。
- PDF、图片、DOCX、Excel、CSV、HTML/XML、ODT/ODS/Numbers 的 Workers AI `toMarkdown` 适配。
- PPTX 浏览器/Worker OOXML 文本结构解析及替代文本降级。
- ParseJob/IndexJob D1 状态机、Queue 唤醒、扫描重投和幂等。
- 页码、sheet/cell、slide/element、代码行位置。
- 用户“我的提交”和管理员解析预览、warnings、重试。

格式实现状态、固定错误码、免费层降级边界与本地证据命令见 [M2 格式支持与解析降级矩阵](./docs/product/m2-format-support-matrix.md)。

退出标准：

- [ ] 支持矩阵每种格式有成功、损坏、空内容、伪造 MIME 和超限 fixture。
- [ ] 中断上传不会产生可见知识；失败原件可下载并可补替代文本。
- [ ] Queue/AI 不可用时任务保留在 D1，恢复后可幂等重投。
- [ ] R2 8 GB 预警、9 GB 文件写入断路器通过降级测试。

## M3 — 治理、版本与回收

目标：正式知识可审核、修订、回滚、恢复和审计，不依赖人工修数据库。

范围：

- 重复关联、敏感信息建议、批量审核和逐项结果。
- 新 Revision、current 原子切换、diff、回滚。
- 30 天回收站、恢复、最终清理和墓碑审计。
- 发布/下载/回滚审计；所有 metadata allowlist 且不含正文/凭据。
- 发布 journal、索引 `search_degraded` 和恢复器。

退出标准：

- [ ] 并发审核、重复 Queue 和任意持久化边界失败不产生半发布状态。
- [ ] 历史 Revision 不可变，回滚只切换 current 并保留审计。
- [ ] 删除、恢复、到期清理和索引重建演练通过。

## M4 — 成熟搜索、阅读器与评测

目标：达到 Onyx/RAGFlow 风格的可过滤、可解释、可评测混合检索体验。

范围：

- Vectorize 摘要优先、选择性高价值 Chunk 向量和 visibility metadata。
- FTS + Vectorize + RRF；可选 query rewrite/rerank，失败时回退。
- Space/Collection/Tag/type/author/time 过滤、Saved View、Add context。
- 三栏阅读器、来源面板、反向链接、相关知识和原件定位。
- 标注 query set、Recall@5、MRR、citation precision/support、权限泄露回归。

退出标准：

- [ ] Recall@5 ≥ 85%，citation precision/support = 100%，权限泄露 = 0。
- [ ] 禁用 Vectorize 后 FTS5-only 仍满足核心搜索旅程。
- [ ] 查询和引用回读均重新校验 active member、visibility 和 current Revision。

## M5 — NotebookLM 式来源工作台与产物

目标：围绕选中来源进行多轮问答，并生成可追溯、可再次审核的知识产物。

范围：

- Source selector、来源增删、冲突展示、多轮会话和反馈。
- 私人 Note、来源摘要、FAQ、时间线、Brief、思维导图、学习卡和测验。
- 每个产物保存模型、Prompt、来源 Revision、生成时间和状态。
- 产物可转 Submission，但不能直接成为正式知识。

退出标准：

- [ ] 所有来源性断言均有可回读引用；错误引用率为 0。
- [ ] 权限变化后旧会话和旧产物不能继续读取被撤销来源。
- [ ] AI 额度耗尽时产物明确 deferred，不影响知识阅读。

## M6 — 有界 Deep Research Agent

目标：提供可暂停、恢复、审计的多步研究，而不是开放式自动执行器。

范围：

- Research Workspace、计划确认、子问题、步骤/时间/AI 配额。
- `searchKnowledge`、`readSource`、`compareSources`、`createDraft` 四类受限工具。
- 查询轨迹、来源选择理由、冲突、证据缺口、checkpoint 和取消。
- 研究报告与 Draft；Prompt injection 和工具越权回归。

退出标准：

- [ ] Agent 不能执行任意网络、Shell、代码、浏览器、发布、删除或改权限操作。
- [ ] 每个研究断言映射到允许范围内的来源；证据不足明确标注。
- [ ] 断线、取消、额度耗尽和次日恢复均不重复副作用。

## M7 — 导出、恢复与长期治理

目标：让知识可迁移、可重建、可维护，避免被单个索引或预览组件锁定。

范围：

- Markdown + manifest + 原件 + Revision/Citation 映射的全量/增量导出。
- 导入 dry-run、冲突报告、新环境恢复和权限核验。
- FTS5/Vectorize 全量重建与漂移对账。
- 重复、孤立、过期、失效链接、低质量解析和标签治理候选。
- 治理建议只进入审核，不静默修改正式知识。

退出标准：

- [ ] 新 Cloudflare 环境可恢复权威数据并重建所有派生索引。
- [ ] 抽样原件 hash、Revision、引用和权限映射一致。
- [ ] 至少一次真实备份/恢复演练有脱敏证据和回滚说明。

## M8 — 1.0 成熟度

目标：完成可访问性、移动体验、性能、观测、配额和故障演练后再声明 1.0。

范围：

- 移动快速录入、PWA、键盘导航、焦点管理、WCAG 验证。
- 配额、任务积压、失败率、索引漂移和依赖状态面板。
- R2、D1、DO、Workers AI、Vectorize、Queue 和 Computer Preview 故障手册。
- 托管 CI、发布 checklist、变更日志、版本升级和回滚演练。
- 音频/视频/自动幻灯片只作默认关闭实验，不阻断 1.0。

退出标准：

- [ ] 上传 → 审核 → 发布 → 搜索 → 问答 → 修订 → 导出/恢复端到端通过。
- [ ] 移动 contributor 与桌面 admin 核心旅程通过可访问性检查。
- [ ] 所有免费额度断路器和主要依赖故障均有可重复演练。
- [ ] 本地、workerd、托管 CI、真实 provider 和生产域证据齐全。

## 免费层保护

| Cloudflare 能力 | 核心用途 | 硬保护与降级 |
| --- | --- | --- |
| Workers | API、页面、调度 | 有界请求体/CPU/分页；超限明确失败 |
| D1 | 控制面、权威 metadata、FTS5、任务 | 索引/keyset；只读降级；禁止无界扫描/重试 |
| R2 Standard（可选） | 私有原件 | 默认不绑定；未启用时二进制上传 fail-closed，文本继续 |
| Durable Objects | legacy VFS、发布/会话协调 | 保留 `KnowledgeBase` v1；按工作区/会话分片 |
| Workers AI | 解析、回答、可选增强 | 在线回答优先；无额度时 deferred/关闭 AI |
| Vectorize | 选择性语义召回 | 80% 容量断路器；FTS5-only 完整可用 |
| Queues | 唤醒异步任务 | 小消息、有限重试；D1 状态可扫描重投 |

平台额度和产品可能变化；实施每个相关 Milestone 前必须重新核对 Cloudflare 官方免费层限制。产品不会主动购买超额用量，但账户级计划、支付方式和预算仍由部署者负责。

## 依赖关系

```text
M0 基线
  └─ M1 单来源闭环
       ├─ M2 多格式摄取 ── M3 治理版本
       └─ M4 搜索评测 ─── M5 来源产物 ── M6 Deep Research
                                  └──────────────┐
M3 + M4 ─────────────────────────────── M7 导出恢复
M0–M7 全部满足 ───────────────────────── M8 / 1.0
```

执行时按 Checklist 中 `P0/<Milestone>` 原子项生成独立实现计划；任何 Milestone 的完成声明都必须同时满足其退出标准与对应 Gate。
