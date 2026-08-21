# Memory Garden AI 知识操作系统设计规格

状态：已确认，作为后续 Roadmap、Checklist 和实现计划的产品权威

日期：2026-08-21

目标版本：Memory Garden 1.0

## 1. 产品定位

Memory Garden 是面向个人和 5–20 人受邀小团队的私有 AI 知识操作系统。它以 NotebookLM 式“来源优先、引用可回读、研究产物可复用”的体验为核心，吸收 RAGFlow 的文档理解与检索测试、Onyx/Glean 的权限和治理、Dify 的可观察知识流水线，以及 Khoj/AnythingLLM 的 Workspace 和持久 Agent 体验。

产品不是通用 RAG 开发平台，也不是大型企业连接器平台。功能选择以可信知识闭环、Cloudflare 免费层可运行性和小团队易用性为最高约束。

### 1.1 核心闭环

```text
采集来源
  → 保存原件
  → 解析与结构恢复
  → Chunk 与来源定位
  → 管理员审核与版本发布
  → 阅读、搜索与权限过滤
  → 带引用问答与深度研究
  → 生成 Note/Brief/FAQ/时间线等草稿
  → 反馈、评测、治理和持续修正
```

### 1.2 固定规模

- 1 个受保护管理员。
- 5–20 名受邀成员。
- 最多 10,000 个 KnowledgeItem。
- R2 Standard 原件硬限制 9 GB，8 GB 开始预警。
- 单组织、单生产域名，不做多租户。
- Cloudflare 免费额度耗尽时停止或降级对应能力，不自动进入付费用量。

## 2. 不可突破约束

### 2.1 平台约束

- 正式运行时只使用 Cloudflare Workers、Static Assets、D1、R2 Standard、SQLite Durable Objects、Queues、Workers AI 和 Vectorize。
- FTS5、浏览、审核和导出必须不依赖 Workers AI 或 Vectorize。
- Queues 只负责唤醒；D1 中的 Job 是任务权威。
- Vectorize、摘要、Embedding、研究产物和 Agent 输出均为可重建派生数据。
- 每项托管能力都必须有免费额度断路器和明确错误状态。

### 2.2 身份与登录约束

当前登录体系必须保持兼容：

- GitHub OAuth `state + PKCE S256`。
- 固定 callback：`https://memory.crgmhrc.asia/auth/github/callback`。
- 只接受 GitHub primary 且 verified 邮箱。
- `BOOTSTRAP_ADMIN_EMAIL` 必须属于 `ALLOWED_MEMBER_EMAILS`。
- D1 `members`、`auth_sessions` 和 `github:<id>` subject 向前兼容。
- 浏览器仅使用 `__Host-memory-session`，不接触 OAuth Secret、APP_TOKEN 或 automation secret。
- 角色保持 `admin` 与 `contributor`；成员状态保持 active/disabled。
- 自动化继续使用 `AUTOMATION_CLIENT_ID + AUTOMATION_SECRET HMAC + APP_TOKEN`。
- automation 只能访问明确列出的 legacy API，不能成为管理员。
- 不重新引入 Cloudflare Access/Zero Trust，不新增公开注册。

### 2.3 数据兼容约束

- 保持 `KnowledgeBase` Durable Object 类名和 migration tag `v1`。
- 已发布 migration 只追加，不修改历史 SQL。
- 已有个人工作区笔记必须可读取和渐进迁移。
- 不通过删除 D1 表、D1 行、DO namespace、Computer VFS 或 R2 原件回滚。
- Agent、普通成员和自动任务不能直接发布或永久删除正式知识。

## 3. 标杆组合

| 标杆 | 采用能力 | 不采用能力 |
|---|---|---|
| NotebookLM | Sources panel、来源选择、句级引用、Notes、FAQ、时间线、学习材料、研究工作台 | 把高成本音视频生成放入核心链路 |
| RAGFlow | 复杂文档理解、Chunk 预览与修正、混合检索、检索测试、引用调试 | 重型自托管模型基础设施 |
| Dify | 可观察 Pipeline、逐节点状态、重试、检索测试 | 通用无代码 AI 应用平台 |
| Onyx | Search/Chat 双入口、权限感知检索、连接器抽象、Deep Research | 数十个持续同步连接器和企业权限同步 |
| Glean | 内容/人物/关系模型、新鲜度、权限二次校验、治理 | 员工行为画像和大型企业组织图 |
| AnythingLLM | Workspace、拖放、上下文隔离、清晰引用、Agent 入口 | 任意 MCP、文件系统和代码执行工具 |
| Khoj | Second Brain、持久对话、自然语言检索、定期研究 | 无审核的自主写入或外部行动 |
| Notion AI | 搜索范围、Add context、统一搜索体验 | 商业 SaaS 连接器生态 |
| Perplexity Projects | 持久项目、文件、会话、指令和协作上下文 | 公共分享和大规模组织权限 |

完整证据与功能映射见 [AI 知识库标杆矩阵](../../product/ai-knowledge-base-benchmark.md)。

## 4. 产品原则

1. **来源先于答案**：AI 断言必须回到原始来源或明确拒答。
2. **搜索先于 Agent**：没有稳定检索评测，不实现复杂 Agent。
3. **审核先于发布**：AI 和 contributor 只能产生 Submission 或 Draft。
4. **权限逐层执行**：列表、搜索、Chunk 回读、引用、下载和 Agent 工具分别授权。
5. **权威与派生分离**：任何派生索引和产物都可由权威数据重建。
6. **失败可见**：解析、索引、生成和同步都必须显示阶段、错误和重试入口。
7. **免费层优先**：AI 能力延期不能阻止录入、审核、浏览和 FTS 搜索。
8. **纵向交付**：每个 Milestone 必须形成可部署的端到端用户闭环。
9. **证据驱动**：checkbox、截图和代码存在不等于生产完成。
10. **安全默认**：不可信文档永远是数据，不能成为 Agent 指令。

## 5. 用户和权限

### 5.1 Admin

- 录入和查看自己的 Submission。
- 审核、驳回、发布、回滚和恢复。
- 管理 Space、Collection、Tag 和成员状态。
- 查看失败任务、检索评测、额度、导出和审计。
- 查看 `shared` 和 `admin_only` 知识。
- 不能绕过不可变 Revision 和审计边界直接改写当前正文。

### 5.2 Contributor

- 创建文本、代码、富文本和文件 Submission。
- 查看自己的处理、审核和驳回状态。
- 浏览、搜索和询问 `shared` 正式知识。
- 保存私人 Note、收藏和研究草稿。
- 不能查看其他人的未发布 Submission、管理数据或 `admin_only` 内容。

### 5.3 Automation

- 使用签名的 legacy health、notes、search 和 chat API。
- 没有浏览器会话、成员角色或管理能力。
- 不得调用 Submission 审核、成员、Space、Collection、审计或永久删除 API。

## 6. 信息架构

```text
Home
├─ Quick Capture
├─ Recent Knowledge
├─ Continue Research
├─ My Submissions
└─ Quota/Degraded Notices

Library
├─ Spaces
├─ Collections
├─ Tags
├─ Saved Views
└─ Knowledge Reader

Search
├─ Keyword / Natural language
├─ Scope and filters
├─ Search results
└─ Ask from results

Research
├─ Sources panel
├─ Chat / Deep Research
├─ Notes
└─ Generated artifacts

Admin
├─ Review Queue
├─ Knowledge Governance
├─ Spaces / Collections / Tags
├─ Members
├─ Jobs / Indexes / Evaluations
├─ Quotas / Backups
└─ Audit
```

## 7. 系统架构与权威边界

| Cloudflare 组件 | 职责 | 权威性 |
|---|---|---|
| Worker + Assets | HTTP、OAuth、授权、API、SPA、安全响应头 | 无持久权威 |
| D1 | 身份、控制面、Submission、Job、KnowledgeItem、Revision、Chunk、FTS5、审计、反馈 | 关系与状态权威 |
| R2 Standard | 原件、预览、缩略图、研究产物、导出、回收区 | 原件权威 |
| Computer VFS | 已发布规范 Markdown、manifest、链接快照 | 内容权威，可由 Revision/R2 校验 |
| SpaceCoordinator DO | 发布串行化、Revision 切换、恢复协调 | 协调权威 |
| AgentSession DO | 对话流、研究执行、断线恢复 | 活跃会话权威 |
| Queues | 解析、索引和生成任务唤醒 | 非权威 |
| Workers AI | toMarkdown、Embedding、摘要、问答和研究 | 非权威 provider |
| Vectorize | 语义召回 | 可重建派生索引 |

### 7.1 数据实体

- `sources`：用户可识别的来源对象。
- `source_versions`：不可变原件版本及哈希。
- `submissions`：用户请求和审核入口。
- `assets`：R2 object、媒体类型、大小、哈希和状态。
- `jobs`：解析、Chunk、Embedding、索引和生成任务权威状态。
- `knowledge_items`：稳定知识标识和当前 Revision。
- `revisions`：不可变正式版本。
- `chunks`：结构化检索单元与来源定位。
- `source_locations`：页码、表格、幻灯片、标题路径或代码行。
- `reviews`：审核决策和元数据补丁。
- `notes`：成员私有或共享研究笔记。
- `artifacts`：FAQ、时间线、Brief、学习卡、报告等派生产物。
- `conversations`、`messages`、`research_runs`：问答与研究状态。
- `citations`：答案断言到 Revision/Chunk/Location 的映射。
- `feedback`、`evaluation_cases`、`evaluation_runs`：质量闭环。
- `audit_events`：安全且 allowlisted 的操作审计。
- `quota_ledger`：产品维度的软/硬限制和用量快照。

### 7.2 发布顺序

```text
验证 Submission 和 Review
→ 写入或确认不可变原件
→ 写规范 Markdown
→ 创建 Revision
→ 原子切换 KnowledgeItem.current_revision_id
→ 写发布审计
→ 创建可重投索引 Job
```

索引失败只标记 `search_degraded`，不能产生半发布 Revision。并发发布由单 SpaceCoordinator 串行化。

## 8. 采集和知识 Pipeline

### 8.1 输入

- Markdown、纯文本、代码和清洗后的富文本。
- PDF、图片、DOCX、Excel、CSV、HTML/XML、ODT/ODS 和 Numbers。
- PPTX 采用受限 OOXML 解析和人工替代文本，不承诺视觉还原。
- URL 快照作为后续受限采集入口；不做全网爬虫。

### 8.2 任务阶段

```text
draft
→ upload_pending
→ uploaded
→ parsing
→ chunking
→ enrichment_pending
→ review_pending
→ published

自动阶段可进入：failed_retryable / failed_terminal / deferred_quota
审核可进入：rejected / duplicate / revision_requested
```

每个 Job 使用稳定幂等键。Queue 消息只包含 Job ID；24 小时外由定时扫描从 D1 重新投递。

### 8.3 Chunk 与位置

- Markdown：heading path + line range。
- PDF/图片：page + bounding reference（可用时）。
- Spreadsheet：sheet + cell range。
- PPTX：slide number + element order。
- Code：language + file label + line range。
- HTML：heading path + element order。

Chunk 修改生成新的 source/parse version，不静默改变已发布 Revision。

## 9. 搜索、阅读与引用

### 9.1 搜索

1. D1 FTS5 召回标题、摘要、标签、正文和代码。
2. Vectorize 只索引文档摘要和选择性高价值 Chunk。
3. 应用 Space、Collection、Tag、类型、作者、时间和可见性过滤。
4. 使用 RRF 融合并按当前 Revision 去重。
5. 从 D1 回读 Chunk，再次校验成员状态、可见性和 current Revision。
6. 返回命中高亮、来源位置、稳定 citation ID 和降级状态。

Vectorize 不可用时完整退回 FTS5；Workers AI 不可用时自然语言查询不改写，直接使用关键词检索。

### 9.2 阅读器

- 三栏：导航/目录、正文、来源与上下文。
- 点击引用定位到页码、表格、幻灯片、标题或代码行。
- 显示 Revision、来源版本、解析警告和历史状态。
- 提供反向链接、相关知识、收藏和“从此处提问”。

### 9.3 引用

- citation ID 绑定 `revision_id + chunk_id + source_location_id`。
- 答案句子只能引用实际进入上下文的 Chunk。
- 回读引用时重新授权，不能信任聊天历史中的权限。
- Revision 更新后旧引用显示历史版本，不悄悄指向新文本。
- 无支持来源时删除断言、提出澄清问题或拒答。

## 10. Agent 和研究产物

### 10.1 允许工具

- `searchKnowledge`
- `readSource`
- `compareSources`
- `listSourceConflicts`
- `createNoteDraft`
- `createArtifactDraft`
- `saveResearchDraft`

工具调用前重新加载成员状态和权限。工具只能读取用户可见正式知识，写入只能进入私人 Note 或待审核草稿。

### 10.2 禁止工具

- 直接发布、覆盖 Revision 或改变 current Revision。
- 永久删除知识、原件、成员或审计。
- 任意 Shell、代码执行、文件系统和浏览器控制。
- 任意 MCP/OpenAPI 动态工具。
- 使用文档中的指令改变系统提示或调用权限外工具。

### 10.3 研究产物

P0/P1：Note、摘要、FAQ、时间线、Brief、来源比较、研究报告。

P2：思维导图、学习卡、测验。
P3：音频、视频、幻灯片等高成本产物，仅在免费额度和平台能力明确允许时实验。

所有产物记录来源 Revision、模型、Prompt 版本、生成时间和状态；产物可删除重建，不成为正式知识，除非重新提交并审核。

## 11. 质量评测

### 11.1 固定数据集

- 解析 fixture：每种格式的正常、损坏、空内容、超限和恶意内容。
- 检索 query set：关键词、语义、同义词、跨语言、代码和表格查询。
- 引用 set：支持、部分支持、冲突、无来源和历史 Revision。
- 权限 set：shared、admin_only、disabled、其他人 Submission 和删除内容。
- Prompt injection set：伪系统指令、工具调用诱导、数据外泄和引用伪造。

### 11.2 指标

- Recall@5 ≥ 85%。
- 权限泄露为 0。
- 错误引用率为 0；无法证明时必须拒答。
- 解析位置可回读率 100%。
- Queue 重复投递不产生重复 Revision。
- Vectorize/AI/Queue 关闭后的必需功能通过降级测试。

## 12. 免费层保护

| 产品 | 保护策略 |
|---|---|
| R2 | Standard only；8 GB 预警；9 GB 停止文件写入；文本录入继续 |
| D1 | 索引、keyset pagination、查询 rows_read 证据；超限时只读降级或明确失败 |
| Durable Objects | 按 Space/AgentSession 分片；避免无休眠长连接和高频 RPC |
| Queues | 小消息、有限重试、D1 重投扫描；接近额度时批处理/延期 |
| Workers AI | 在线引用问答优先；解析/Embedding/产物分级；耗尽进入 deferred_quota |
| Vectorize | 384 维；摘要优先；80% 预算后停止普通 Chunk；FTS5-only |
| Workers | 有界请求体、分页、流式响应和有限工具步数 |

额度数值必须以实现时的 Cloudflare 官方文档重新校准，不能把本规格中的历史快照当成永久承诺。

## 13. 里程碑

- M0：当前生产基线和远程证据。
- M1：Markdown/纯文本单一来源完整闭环。
- M2：多格式来源和可观察 Pipeline。
- M3：可信审核、不可变 Revision 和治理。
- M4：成熟搜索、阅读器和检索评测。
- M5：NotebookLM 式来源与引用工作台。
- M6：Deep Research 和受限持久 Agent。
- M7：长期治理、导出和恢复。
- M8：成熟体验、故障演练和 1.0。

Roadmap 见 [ROADMAP.md](../../../ROADMAP.md)，原子验收见 [AI 知识库 Checklist](../../product/ai-knowledge-base-checklist.md)。

## 14. 完成定义

原子功能只有在 checklist 指定的代码、单元、Workerd、安全、降级和远程证据全部满足时才可勾选。每个 Milestone 必须：

- 保持现有 GitHub OAuth 和 automation 回归测试通过。
- 形成可部署、可回滚的端到端用户闭环。
- 使用 append-only migration。
- 不泄露权限外正文、引用、原件或 metadata。
- 记录免费额度和故障降级证据。
- 更新 README、Roadmap、Checklist 和运维手册。
- 在远程验证完成前明确标注“仅本地验证”。

## 15. 明确非目标

- 大型企业连接器生态和源系统 ACL 同步。
- 多租户、公开注册、计费、套餐和组织树。
- 员工活动画像和搜索监控。
- 任意工具、任意 MCP、Shell、代码执行或浏览器控制。
- Agent 自动发布或永久删除。
- 把昂贵的音视频生成作为核心验收。
- 没有检索/引用评测的功能演示。
