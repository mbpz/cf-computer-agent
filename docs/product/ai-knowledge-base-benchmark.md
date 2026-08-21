# 国外 AI 知识库标杆与能力映射

更新时间：2026-08-21

用途：为 Memory Garden 的产品取舍提供可追溯证据。标杆不表示整体照搬；每项能力必须经过 5–20 人私有场景、当前 GitHub OAuth 和 Cloudflare 免费层约束裁剪。

## 1. 评估维度

| 维度 | 判断问题 |
|---|---|
| Capture | 是否能低摩擦导入文件、文本、网页和既有知识？ |
| Understanding | 是否恢复标题、页码、表格、图片、幻灯片和代码结构？ |
| Retrieval | 是否有关键词、语义、混合、过滤、重排和检索测试？ |
| Grounding | 是否提供可回读引用、冲突来源和可靠拒答？ |
| Research | 是否支持持久项目、多步研究、Notes 和派生产物？ |
| Governance | 是否有权限、审核、版本、审计、删除和恢复？ |
| Agent | 是否有受控工具、恢复、评测和安全边界？ |
| Operations | 是否可观察、可重试、可降级、可导入导出？ |
| Fit | 是否适合 Cloudflare 免费层和 5–20 人？ |

## 2. 商业产品

### 2.1 Google NotebookLM

官方证据：

- [NotebookLM Help](https://support.google.com/notebooklm/?hl=en)
- [Add or discover sources](https://support.google.com/notebooklm/answer/16215270)
- [Audio Overview](https://support.google.com/notebooklm/answer/16212820)

强项：

- Notebook/Project 作为持续上下文。
- Sources panel 和显式来源选择。
- 基于来源的 Chat、引用、Notes 和探索。
- Mind Map、FAQ、学习材料、音频、视频、幻灯片等 Studio 产物。
- 音频播放时仍可探索引用和询问来源。

Memory Garden 取舍：

| 能力 | 决策 | 原因 |
|---|---|---|
| Sources panel | 复刻 | 核心交互 |
| 句级引用和定位 | 复刻并加强 | 必须支持权限回读和历史 Revision |
| Notes | 复刻 | 低成本、高价值 |
| FAQ/时间线/Brief/学习卡 | Cloudflare 适配 | 异步生成、可重建 |
| Audio/Video/Slide Deck | P3 延期 | Workers AI 免费额度和模型能力不足以作为核心 |
| 公共 Notebook | 拒绝 | 私有产品边界 |

### 2.2 Glean

官方证据：

- [Knowledge Graph](https://docs.glean.com/security/knowledge-graph)
- [Enterprise Search](https://www.glean.com/enterprise-search)
- [AI Agent Builder](https://www.glean.com/ai-agent-builder)

强项：

- 跨内容、人员和活动的知识图谱。
- 权限感知、实时更新和统一企业搜索。
- 连接器、搜索、Chat、Agent 使用同一上下文和治理层。
- 搜索个性化、专家识别、上下文和新鲜度。

Memory Garden 取舍：

| 能力 | 决策 | 原因 |
|---|---|---|
| 内容关系图 | 轻量复刻 | 双向链接、作者、主题、引用 |
| 查询时权限校验 | 复刻 | 核心安全边界 |
| 新鲜度/过期治理 | 复刻 | 小团队同样需要 |
| 专家/作者入口 | P2 | 只用显式作者和审核数据 |
| 数百连接器 | 拒绝 | 不符合免费层和团队规模 |
| 行为画像排名 | 拒绝 | 隐私和复杂度不合适 |

### 2.3 Notion AI Enterprise Search

官方证据：

- [Enterprise Search](https://www.notion.com/help/enterprise-search)
- [AI Connectors](https://www.notion.com/help/notion-ai-connectors)

强项：

- Workspace、连接应用和 Web 的统一搜索。
- `Add context`、页面/人物 @mention 和来源范围选择。
- 搜索答案固定引用来源。
- Agent 在用户现有权限范围内搜索和行动。

Memory Garden 取舍：

| 能力 | 决策 |
|---|---|
| Add context | 复刻为来源/Space/Collection 选择器 |
| 搜索范围切换 | 复刻 |
| 页面和成员引用 | P2 |
| 商业 SaaS 连接器 | 拒绝 |
| 对外行动 | 拒绝；只允许创建内部草稿 |

### 2.4 Perplexity Projects

官方证据：[What are Projects?](https://www.perplexity.ai/help-center/en/articles/10352961-what-are-spaces)

强项：

- 持久 Project 聚合会话、文件、指令、工具和上下文。
- Restricted 默认、owner/edit/view 协作权限。
- 从会话转为 Project，持续积累研究。

Memory Garden 取舍：

- Space 承担持久研究边界。
- 每个 Research Workspace 保存来源集合、指令、会话、Notes 和产物。
- 角色仍保持 admin/contributor，不扩张为复杂项目角色。
- 不开放匿名链接分享。

## 3. 开源项目

### 3.1 Onyx

官方证据：

- [Onyx GitHub](https://github.com/onyx-dot-app/onyx)
- [Connectors](https://docs.onyx.app/admins/connectors/overview)
- [RAG and Search](https://docs.onyx.app/overview/core_features/internal_search)

强项：

- 开源 Search、Chat、Agent、Deep Research 统一平台。
- 混合索引与 Agentic RAG。
- Search 和 Chat 明确分离。
- 文档、metadata、权限和连接器刷新。
- 自定义 Agent、Actions、Web 搜索和研究。

Memory Garden 取舍：

| 能力 | 决策 |
|---|---|
| Search/Chat 双入口 | 复刻 |
| 权限二次过滤 | 复刻 |
| Deep Research | M6 适配 |
| Connector 抽象 | 只保留接口和少量按需入口 |
| Web 搜索 | P3，默认关闭且与私有来源区分 |
| Code execution / arbitrary actions | 拒绝 |

### 3.2 RAGFlow

官方证据：

- [RAGFlow Docs](https://ragflow.net/docs)
- [Knowledge Base Configuration](https://github.com/infiniflow/ragflow/blob/main/docs/guides/dataset/configure_knowledge_base.md)
- [Citation Prompt](https://github.com/infiniflow/ragflow/blob/main/rag/prompts/citation_prompt.md)

强项：

- 深度文档理解和复杂格式解析。
- Chunk 可视化、关键词/问题/标签人工修正。
- 全文和向量多路召回。
- similarity threshold、vector weight 和 retrieval testing。
- 强调 grounded citations。

Memory Garden 取舍：

- 解析预览、Chunk 预览和人工重解析是 M2 核心。
- 建立管理员检索测试台，不暴露复杂参数给普通成员。
- 采用确定性 RRF，而不是无限参数组合。
- 引用约束升级为稳定 Revision/Chunk/Location 映射和权限回读。

### 3.3 Dify

官方证据：

- [Knowledge Pipeline](https://dify.ai/rag)
- [Knowledge Retrieval Node](https://github.com/langgenius/dify-docs/blob/main/en/cloud/use-dify/nodes/knowledge-retrieval.mdx)

强项：

- 数据源、提取、清洗、Chunk、存储、索引和检索可视化。
- Pipeline template、DSL、测试运行和中间变量检查。
- Parent-child、Q&A、image extraction 和 multimodal retrieval。
- 同一知识库可服务 Workflow、Chatflow 和 Agent。

Memory Garden 取舍：

- 复刻“可观察、可重试、可测试”的固定 Pipeline。
- 每个阶段有输入摘要、输出摘要、版本、错误和重试。
- 不开发通用拖拽节点编辑器或插件市场。
- Pipeline 配置由代码和版本化策略控制，管理员只选模板和少量安全参数。

### 3.4 AnythingLLM

官方证据：[AnythingLLM GitHub](https://github.com/Just-AJ-8/anythingllm)

强项：

- 低门槛 Drag & Drop 和“Chat with docs”。
- Workspace 隔离文档和聊天上下文。
- 清晰引用、多用户、Agent、MCP 和多模型/provider。
- Desktop 与 Docker 兼顾个人和内部团队。

Memory Garden 取舍：

- 复刻快速采集、Workspace/Space 隔离和上下文可见性。
- 保持单一 Workers AI provider 抽象，不建设 provider 配置中心。
- 不开放任意 MCP、宿主文件系统、代码执行或自动批准工具。
- 参考其安全历史，在每个资源 ID、workspace scope 和前端 Markdown 渲染处增加攻击测试。

### 3.5 Khoj

官方证据：

- [Khoj GitHub](https://github.com/khoj-ai/khoj)
- [Search](https://github.com/khoj-ai/khoj/blob/master/documentation/docs/features/search.md)

强项：

- Personal Second Brain 和跨终端入口。
- 本地/云模型、自然语言搜索、bi-encoder + cross-encoder rerank。
- 持久 Chat、自定义 Agent、定期研究和通知。

Memory Garden 取舍：

- 复刻最近访问、收藏、每周回顾、持续会话和受控研究。
- Hybrid 搜索使用 D1 FTS5 + Vectorize + 可选 rerank，而不是引入外部模型服务。
- 定时任务只能生成草稿/通知，不自动修改正式知识。

## 4. 能力所有权

| 能力域 | 主标杆 | 辅助标杆 |
|---|---|---|
| 来源与研究体验 | NotebookLM | Perplexity Projects |
| 文件理解与 Chunk | RAGFlow | Dify |
| 搜索与权限 | Onyx | Glean / Notion AI |
| Workspace 与快速使用 | AnythingLLM | Khoj |
| Deep Research | Onyx | NotebookLM / Perplexity |
| Agent 治理 | Glean | Dify |
| 知识图谱与治理 | Glean | Notion |
| 个人回顾 | Khoj | NotebookLM |

## 5. 复刻优先级

### P0：可信闭环

- 来源、版本、Chunk、位置、审核、FTS5、阅读器、句级引用、权限回读、拒答和恢复。

### P1：成熟产品核心体验

- Sources panel、Add context、Search/Chat 双入口、Notes、FAQ/时间线/Brief、混合检索、检索测试和治理队列。

### P2：效率增强

- 思维导图、学习卡、测验、相关知识、每周回顾、受限 URL 快照、研究报告。

### P3：实验能力

- 音频、视频、幻灯片、Web research 和高级 rerank；不得成为 1.0 必需条件。

## 6. 明确拒绝

- 多租户 SaaS、公开注册、计费和组织树。
- 数百持续同步连接器和源系统 ACL 镜像。
- 员工行为监控和隐式画像。
- 任意 MCP/OpenAPI、Shell、代码执行、文件系统或浏览器工具。
- Agent 直接发布、永久删除或修改权限。
- 以高成本音视频生成作为核心价值。
- 没有检索、引用和权限评测的 RAG Demo。

## 7. 证据维护规则

- 标杆功能发生变化时优先更新官方链接和事实，再调整 Roadmap。
- 商业营销页只用于确认公开功能，不作为质量指标证明。
- GitHub stars 只表示关注度，不作为产品“最好”的单一依据。
- 任何“复刻”必须转换为 Memory Garden 原子 ID、验收和免费层降级。
- 规格书与 Checklist 冲突时，以已确认规格书和最新安全约束为准。
