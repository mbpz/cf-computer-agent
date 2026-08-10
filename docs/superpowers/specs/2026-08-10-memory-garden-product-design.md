# Memory Garden 产品设计规格

状态：已确认设计，等待最终文档审阅

日期：2026-08-10

目标版本：个人知识操作系统 1.0

## 1. 产品定义

Memory Garden 是面向一个管理员和少量受邀用户的私有知识操作系统。它统一采集文件与文本，由系统解析、管理员审核后进入正式知识库；授权用户可以浏览、搜索并通过 Agent 基于已发布知识获得带来源引用的回答。

产品必须完全运行在 Cloudflare 服务上，并在 Workers Free 可用额度内设置硬性断路器。达到任一免费额度时，系统降级或停止对应写入，不自动产生付费。

### 1.1 核心闭环

```text
采集 → 原件持久化 → 解析 → AI 增强 → 管理员审核
    → 发布 → 关键词/语义索引 → 浏览/搜索/Agent → 修订与治理
```

### 1.2 目标规模

- 5–20 名受邀用户。
- 最多 10,000 条知识。
- R2 原件在线容量硬限制为 9 GB；8 GB 开始预警。
- 知识元数据、审计和检索字段必须适应 D1 Free 的每日行读取与写入上限。
- Vectorize 采用分层向量策略，在 5 百万存储向量维度内运行。

### 1.3 非目标

- 不支持公开注册和匿名知识写入。
- 不建设多租户 SaaS、计费、套餐或组织层级。
- 不使用 Cloudflare Containers。
- 不依赖 AI Search 作为核心索引；开放测试服务只能作为将来的实验性适配器。
- 不允许 Agent 绕过管理员审核直接发布正式知识。
- 不承诺平台永远免费，只承诺产品自身在已知免费额度内硬降级且不主动购买超额用量。

## 2. 用户与权限

### 2.1 身份来源

Cloudflare Access 是唯一登录入口。Worker 验证 Access JWT，使用稳定身份标识映射应用成员记录。浏览器提交的角色、邮箱或用户 ID 不可信。

应用维护两种角色：

- `admin`：一个管理员，拥有知识治理和系统管理权限。
- `contributor`：少量受邀用户，拥有录入与知识消费权限。

### 2.2 权限矩阵

| 能力 | 管理员 | 用户 |
| --- | --- | --- |
| 创建文本、富文本、代码和文件提交 | 是 | 是 |
| 编辑自己的未发布提交 | 是 | 是 |
| 查看自己的处理与审核状态 | 是 | 是 |
| 浏览、搜索、问答共享已发布知识 | 是 | 是 |
| 查看仅管理员知识 | 是 | 否 |
| 审核、驳回、发布和回滚 | 是 | 否 |
| 管理空间、集合、标签和成员 | 是 | 否 |
| 重试任务、重建索引、导入和恢复 | 是 | 否 |
| 查看配额、失败任务和审计 | 是 | 否 |

待审核、被驳回、回收站、审计和任务内部数据默认仅管理员可见。用户只能看见自己的提交状态和管理员提供的驳回原因。

### 2.3 知识可见性

已发布知识只有两种可见性：

- `shared`：所有启用状态的受邀用户可见。
- `admin_only`：仅管理员可见。

权限必须在列表查询、全文检索、向量检索、原件下载、引用回读和 Agent 工具调用中分别执行，不能只依赖前端隐藏。

## 3. 信息架构

### 3.1 知识组织

主层级为：

```text
KnowledgeBase → Space → Collection → KnowledgeItem → Revision
```

- Space：稳定的大领域，如工作与项目、学习与研究、生活与家庭。
- Collection：Space 内的人工目录，一个知识条目有一个主集合。
- Tag：跨 Space/Collection 的多对多标签。
- Link：知识条目之间的显式链接、反向链接和未链接提及。
- SavedView：用户保存的筛选、排序与搜索条件。

### 3.2 用户端页面

1. 首页：快速录入、处理状态、最近发布、最近访问、收藏和 Agent 快捷问题。
2. 统一采集器：文件拖放、富文本粘贴、Markdown、纯文本和代码。
3. 知识库：空间、集合、标签、时间线和保存视图。
4. 搜索中心：全文与自然语言查询、多条件筛选、结果内问答。
5. 知识阅读器：目录、正文/原件预览、来源位置、版本、反向链接和相关知识。
6. Agent：持久化会话、引用展开、来源比较、答案保存为草稿。
7. 我的提交：草稿、处理中、待审核、已发布、驳回和修订历史。

### 3.3 管理员页面

1. 概览：待审核数、失败任务、R2 容量和各产品用量。
2. 审核队列：原件与解析结果对照、元数据修正、发布和驳回。
3. 知识治理：重复、无分类、失效链接、过期、孤立知识和标签合并。
4. 空间与集合：层级、排序、说明和默认采集目标。
5. 成员：Access 身份映射、角色、启用和封禁。
6. 任务与索引：解析、摘要、Embedding、重试和重建。
7. 配额与备份：断路器、导出、导入和恢复演练。
8. 审计：登录、上传、审核、发布、下载、删除和 Agent 草稿写入。

## 4. 数据架构

### 4.1 权威边界

| 产品 | 职责 | 权威性 |
| --- | --- | --- |
| D1 | 成员、空间、集合、元数据、提交、审核、任务、审计、配额账本、FTS5 | 控制面权威 |
| R2 Standard | 不可变原文件、预览、缩略图和导出包 | 原件权威 |
| Computer VFS | 每个 Space 的已发布 Markdown、版本 manifest 和链接图快照 | 规范化内容权威 |
| Durable Objects | Space 发布协调、版本序列和任务状态协调；Agent 会话 | 协调状态权威 |
| Vectorize | 文档摘要和高价值段落 Embedding | 可重建派生数据 |
| Queues | 异步任务唤醒 | 非权威、可丢失后重建 |

### 4.2 分片

- 每个 Space 对应一个 `SpaceCoordinator` Durable Object。
- 每个 Agent 会话对应一个会话型 Agent/Durable Object。
- 不使用单个全局 Durable Object 承载所有知识请求。
- 跨空间列表、成员、审核队列和治理查询由 D1 提供。

### 4.3 核心实体

- `members`：Access subject、email、role、status、created_at、last_seen_at。
- `spaces`：id、name、slug、description、position、status。
- `collections`：id、space_id、parent_id、name、position、status。
- `submissions`：id、submitter_id、kind、status、visibility_request、content_hash、created_at。
- `assets`：id、submission_id、r2_key、media_type、bytes、sha256、original_name、status。
- `parse_jobs`：id、submission_id、stage、status、attempt、not_before、error_code、updated_at。
- `knowledge_items`：id、space_id、collection_id、current_revision_id、visibility、status、created_by。
- `revisions`：id、knowledge_item_id、version、title、summary、content_path、source_manifest、created_by、reviewed_by。
- `chunks`：id、revision_id、ordinal、heading_path、source_location、content、token_count、fts_state、vector_state。
- `tags`、`knowledge_tags`、`knowledge_links`：标签和链接图。
- `reviews`：submission_id、reviewer_id、decision、reason、metadata_patch、created_at。
- `conversations`、`messages`、`source_references`：Agent 会话和引用。
- `audit_events`：actor_id、action、resource_type、resource_id、metadata、created_at。
- `quota_ledger`：product、period、usage、soft_limit、hard_limit、updated_at。

所有外部对象键使用内部随机 ID，不包含用户邮箱、原始文件名或敏感路径。

### 4.4 版本与删除

- 原件不可变，内容修改生成新 Revision。
- 每个 KnowledgeItem 同一时刻只能有一个 current Revision。
- 发布由 SpaceCoordinator 串行化：验证审核 → 写规范 Markdown → 写 D1 Revision → 原子切换 current Revision → 发出索引任务。
- 索引失败不会回滚已发布内容，但条目标记为 `search_degraded` 并进入可重试队列。
- 删除先进入 30 天回收站。最终清理顺序为 Vectorize、派生产物、R2 原件、Computer 内容和 D1 正文；最后保留不含内容的审计墓碑。

## 5. 统一采集与解析

### 5.1 支持输入

- 图片：JPEG、PNG、WebP、SVG、GIF、BMP。
- 文档：PDF、DOCX、ODT、TXT、Markdown、HTML、XML、RTF（仅纯文本降级）。
- 表格：XLSX、XLS、XLSM、XLSB、ODS、CSV、Apple Numbers。
- 演示：PPTX；首期采用浏览器解析文本和幻灯片结构，不保证视觉版式还原。
- 直接输入：富文本、纯文本、Markdown 和代码。

上传支持矩阵必须由服务端 MIME、文件魔数和扩展名共同判断。未知格式保留原件但不自动发布，管理员可要求补充文本。

### 5.2 上传协议

1. 客户端提交文件名、大小、MIME 和 SHA-256。
2. Worker 检查成员、R2 预算、文件类型、单文件上限和重复候选。
3. Worker 返回限定对象键、大小、类型和短期有效期的上传授权。
4. 浏览器直传 R2 暂存前缀，Worker 不缓冲大文件。
5. 客户端调用完成接口；服务端 HEAD 校验对象属性后创建 Submission、Asset 和 ParseJob。
6. 超时未完成的暂存对象由清理任务删除。

### 5.3 解析适配器

统一接口：

```ts
interface DocumentParser {
  supports(input: AssetDescriptor): boolean;
  parse(input: ParseInput): Promise<ParsedDocument>;
}
```

`ParsedDocument` 包含规范 Markdown、结构化段落、页码/工作表/幻灯片位置、提取警告和解析器版本。

- 文本、Markdown 和代码使用确定性解析器。
- 富文本先执行严格 HTML 清洗，内嵌图片单独写入 R2，再转 Markdown。
- PDF、图片、HTML、XML、Word、Excel 和 OpenDocument 优先使用 Workers AI `toMarkdown`。
- PPTX 使用浏览器侧 OOXML 解析适配器，结果连同原件一起提交；服务端重新验证结构和大小。
- 任何解析失败都保留原件、错误代码和重试入口，并允许提交者添加替代文本。

### 5.4 异步状态机

```text
draft → uploading → submitted → parsing → enrichment_pending
      → review_pending → published
                         ↘ rejected → revised → review_pending

任一自动阶段可进入 failed_retryable / failed_terminal / deferred_quota
```

每个任务使用稳定幂等键 `submission_id:stage:parser_version`。Queue 只承载小型 ID 消息，任务权威状态保存在 D1/DO。超过 Queue 24 小时保留期后，定时扫描仍能重新投递未完成任务。

### 5.5 AI 增强

解析完成后依次生成：

1. 分块与来源定位。
2. 摘要。
3. 标签和 Space/Collection 建议。
4. 敏感信息提示；只提示，不自动改变可见性。
5. 文档摘要 Embedding；高价值段落按容量策略选择性 Embedding。

AI 结果是建议。管理员发布前可以修改标题、摘要、标签、分类和可见性。

## 6. 审核与发布

管理员审核页同时展示：

- 原件预览和具体来源位置。
- 规范 Markdown 与解析警告。
- 用户提供的标题、说明和分类申请。
- AI 摘要、标签、分类建议与敏感信息提示。
- 完全重复和相似内容候选。

管理员操作：

- 发布为共享知识。
- 发布为仅管理员知识。
- 修改元数据后发布。
- 退回提交者并填写原因。
- 标记重复并关联既有知识。
- 重新解析或要求补充文本。

发布必须记录审核者、决策、解析器版本、模型版本和元数据补丁。

## 7. 搜索与引用

### 7.1 混合检索

检索顺序：

1. 验证成员和可见空间。
2. 应用 Space、Collection、类型、标签、提交者、时间和可见性过滤。
3. D1 FTS5/BM25 召回标题、摘要、标签、正文段落和代码。
4. Workers AI 生成查询 Embedding，Vectorize 按 namespace/metadata 过滤后召回。
5. 使用 Reciprocal Rank Fusion 融合并按 revision 去重。
6. 从 D1 回读命中 chunk，二次校验权限和当前 Revision。
7. 返回摘要、命中高亮、来源位置和稳定 citation_id。

### 7.2 向量容量

- 选用 384 维 Embedding。
- 每条已发布知识保存一个标题+摘要向量；10,000 条约占 3.84 百万存储维度。
- 剩余容量用于管理员固定、高访问频率或高引用价值段落。
- 4 百万维度（80%）触发预警并停止普通段落向量化。
- 文档摘要向量接近硬上限时，按最近访问和管理员固定规则淘汰段落向量，不删除文档摘要向量。
- Vectorize 不可用时只关闭语义召回，FTS5 完整可用。

### 7.3 引用模型

`citation_id` 指向 revision_id、chunk_id 和 source_location。source_location 根据格式保存页码、章节路径、工作表与单元格范围、幻灯片序号或文本行范围。

引用展示必须支持：

- 打开规范正文并定位命中段落。
- 打开原件预览并定位到可支持的位置。
- 展示来源标题、版本、发布日期和可见范围。
- 引用失效或权限变化时拒绝回读，不展示缓存内容。

## 8. 知识 Agent

Agent 使用 Cloudflare Agents SDK 的持久化会话与可恢复流。每个会话绑定成员身份，服务端每次工具调用重新加载成员状态。

### 8.1 工具

- `searchKnowledge(query, filters)`：检索当前用户可见的已发布知识。
- `readSource(citationIds)`：回读指定来源段落并再次鉴权。
- `compareSources(citationIds, question)`：整理多个来源的异同。
- `createDraft(title, content, sourceReferences)`：创建当前用户草稿，不能发布。

### 8.2 回答规则

- 只能基于工具返回内容陈述知识库事实。
- 事实后使用稳定引用编号。
- 回答发送前验证所有引用存在、可访问并支持所述内容。
- 召回不足时明确说明，不以常识补齐知识库事实。
- 文档中的指令视为不可信数据，不能改变系统提示或工具权限。
- Agent 生成的写入永远进入草稿或待审核状态。

### 8.3 降级

- Workers AI 配额耗尽：关闭新 Agent 回答并说明恢复时间；保留搜索和原文浏览。
- Vectorize 配额耗尽：仅使用 FTS5。
- 流式连接中断：客户端重连并恢复已持久化输出。
- 模型返回异常引用：丢弃未验证引用；若答案失去主要依据则返回安全失败。

## 9. 知识治理

管理员治理视图包括：

- 完全重复和高相似候选。
- 无 Space、无 Collection、无标签知识。
- 失效内部链接与未链接提及。
- 长期未访问或超过管理员设定复核周期的过期候选。
- 解析警告、缺少来源定位和索引失败。
- 孤立知识和可合并标签。

治理动作只生成建议或待审核变更，不静默改写正式知识。

系统支持每日/每周回顾：最近发布、待阅读、近期高频主题和待复核知识。定时任务必须在免费额度内执行；额度不足时跳过 AI 摘要，只生成确定性列表。

## 10. 免费额度断路器

### 10.1 R2

- 8 GB：管理员预警，首页提示清理或导出。
- 9 GB：拒绝新文件和内嵌图片上传；纯文本/代码录入继续。
- 只使用 Standard storage；不使用 Infrequent Access。

### 10.2 Workers AI

- 每次 AI 调用记录用途和估算/返回用量。
- 优先级：在线用户问答 > 待审核解析 > 摘要/标签 > 段落 Embedding > 周期性回顾。
- 接近当日预算时停止低优先级任务；达到硬限制后进入 `deferred_quota`。

### 10.3 Vectorize

- 80% 存储维度预警并停止普通段落向量。
- 查询预算接近月限时减少语义召回，只对明确自然语言问题启用。
- 达到限制时自动切换 FTS5-only。

### 10.4 D1、Durable Objects 和 Queues

- 查询必须使用有界分页和索引，禁止无界全表扫描。
- 日配额错误转为明确的只读/延迟状态，不循环重试。
- Queue 消息只包含内部 ID，批量处理并控制重试次数。
- 配额账本用于应用内预警；Cloudflare Dashboard 是最终用量证据。

## 11. 安全

- 验证 Cloudflare Access JWT 的签名、issuer、audience 和有效期。
- 角色只从 D1 成员表读取。
- APP_TOKEN 仅保留为受控运维/迁移兼容路径，并使用恒定时间比较。
- R2 Bucket 不公开；下载通过鉴权 Worker 或短期授权。
- 上传检查扩展名、MIME、文件魔数、声明大小和实际大小。
- 压缩格式设置解压文件数、单文件和总展开大小限制，防止压缩炸弹。
- 富文本执行 allowlist HTML 清洗；响应设置严格 CSP、nosniff 和 frame 策略。
- 文件名只作显示字段；对象键和工作区路径使用随机内部 ID。
- 结构化日志不记录正文、原文件、Access JWT、APP_TOKEN 或完整 Agent prompt。
- 所有管理动作、原件下载和 Agent 草稿写入进入审计。
- Prompt injection 内容不能调用未授权工具或改变权限检查。

## 12. 错误处理与可观测性

统一错误响应包含 request_id、稳定 error_code、用户可读消息和 retryable，不向客户端返回内部堆栈。

关键 error_code：

- `AUTH_REQUIRED`、`MEMBER_DISABLED`、`FORBIDDEN`。
- `UPLOAD_TYPE_UNSUPPORTED`、`UPLOAD_TOO_LARGE`、`R2_QUOTA_GUARD`。
- `PARSE_RETRYABLE`、`PARSE_UNSUPPORTED`、`AI_QUOTA_DEFERRED`。
- `REVIEW_CONFLICT`、`REVISION_CONFLICT`。
- `SEARCH_DEGRADED`、`CITATION_INVALID`。
- `PLATFORM_DAILY_LIMIT`。

结构化日志至少包含 request_id、actor_id 的不可逆标识、route、operation、resource_id、duration_ms、outcome 和 error_code。管理员系统页显示任务积压、失败率、配额水位、索引漂移和最后成功备份时间。

## 13. 测试与验证

### 13.1 自动测试

- 纯函数：状态机、权限、分块、来源位置、RRF、配额决策。
- D1：migration、外键、索引、FTS5、分页和并发版本切换。
- Durable Objects：空间隔离、发布协调、重复投递和 alarm/queue 重试。
- R2：中断上传、HEAD 校验、孤儿清理、下载鉴权和回收站。
- 解析 fixture：每个支持格式至少一个成功、损坏、空内容和超限样本。
- Agent：工具权限、引用校验、提示注入、额度降级和断线恢复。
- UI：用户与管理员关键旅程、键盘操作、移动端和无障碍。

### 13.2 远程验证

本地模拟不能替代以下远程证据：

- Cloudflare Access 登录和 JWT 校验。
- 浏览器直传 R2 与私有下载。
- Workers AI 真实文件解析、Embedding 和回答。
- Vectorize metadata 过滤与配额指标。
- Durable Object 重启后的持久性和并发发布。
- Queue 重试和超出消息保留期后的任务重建。
- 实际免费额度错误的用户体验。
- 生产域名上的安全响应头与端到端流程。

## 14. 成功指标

- 上传完成率：受支持且未损坏文件 ≥ 99%。
- 审核前解析可用率：支持格式 ≥ 95%，失败均可下载原件并人工补充。
- 权限泄露：自动测试和验证环境中为 0。
- 错误引用率：固定 Agent 评测集中为 0。
- Recall@5：在人工标注检索集达到 85% 后才宣布混合检索成熟。
- 恢复：全量导出能够在新环境恢复全部已发布知识、版本和来源映射。
- 零账单：每个 Cloudflare 产品达到保护阈值时均按设计降级，无自动超额消费。

## 15. 技术风险

- `@cloudflare/computer` 仍为 Preview：通过 `WorkspaceRepository` 适配器隔离，维护契约测试和导出恢复路径。
- Workers AI Markdown Conversion 不支持 PPTX：首期浏览器解析并允许人工文本；服务端支持以后再替换适配器。
- AI Search 开放测试未来计费：不纳入核心架构。
- 10,000 条知识超过全量段落向量的免费容量：使用文档摘要向量 + FTS5 段落检索。
- 单一 Durable Object 会形成瓶颈：按 Space 分片，跨空间查询进入 D1。
- 多产品配额难以精确预测：应用账本用于断路器，Dashboard 用量用于校准，不把估算值描述为账单事实。

## 16. 已确认决策

1. 产品方向为个人知识操作系统。
2. 一个管理员和少量受邀用户，Cloudflare Access 登录。
3. 用户可以录入、浏览、搜索和问答；管理员负责治理。
4. 所有用户提交先审核后发布。
5. 长期保留原件、解析文本和预览。
6. 已发布知识默认共享，可设为仅管理员。
7. 目标规模为 5–20 人、10,000 条知识；R2 采用 9 GB 零账单硬上限。
8. 知识结构使用 Space + Collection + Tag + Link。
9. 采用自主可控架构，不依赖 AI Search。
10. 搜索采用文档级语义向量 + FTS5 段落检索。
