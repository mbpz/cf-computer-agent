# Memory Garden Roadmap

更新时间：2026-08-10

产品规格：[Memory Garden 产品设计规格](./docs/superpowers/specs/2026-08-10-memory-garden-product-design.md)

## 目标

把已上线的单用户知识问答 MVP 演进为双角色、多格式录入、审核发布、混合检索和可信 Agent 的个人知识操作系统。所有正式能力必须使用 Cloudflare 服务，并在 Workers Free 已知额度内设置硬性降级路径。

## 交付规则

- 每个 Phase 都必须产生可部署、可回滚的软件，不允许长期功能分支。
- 先写失败测试，再实现最小能力，再运行完整验证。
- 本地 fixture 只证明确定性逻辑；Cloudflare 托管能力必须单独记录远程证据。
- 数据迁移只追加 migration，不修改已部署 migration。
- AI、Vectorize 和 Queue 都是可降级能力；录入、审核、浏览和 FTS5 搜索是生存底座。
- README、roadmap 勾选或页面截图不构成生产稳定性证据。

## Phase 0 — MVP 基线加固

目标：在扩展产品前建立可测试、可维护、可验证的 Worker 基线。

范围：

- [x] 将 `src/index.ts` 拆分为认证、路由、知识服务、Computer 存储、检索和 AI provider。（本地 `rtk npm run check`）
- [x] 将内嵌 HTML 拆为独立前端构建入口。（本地 `rtk npm run check`）
- [x] 使用 `wrangler types` 生成 Env，消除手写 Env 漂移。（本地 `rtk npm run check`）
- [x] APP_TOKEN 改为恒定时间比较，并降级为运维兼容鉴权。（本地 `rtk npm run check`）
- [x] 消除 Computer RPC 边界的双重类型断言，封装 `WorkspaceRepository`。（本地 `rtk npm run check`）
- [x] 引入 `@cloudflare/vitest-pool-workers`，覆盖 Worker 路由与 Durable Object 持久性。（本地 `rtk npm run check`）
- [x] 增加结构化错误、request_id、安全响应头和日志脱敏。（本地 `rtk npm run check`）
- [x] 补全 automation smoke 合同：HMAC 签名 + APP_TOKEN、health、新增、列表、检索与问答；不调用 admin API。（本地 mock 验证；尚未调用远程环境）

退出标准：

- [x] `rtk npm run check` 覆盖类型、单元、Worker 集成和构建。（2026-08-11：38 个单元测试、19 个 Worker 测试与 dry build 通过）
- [ ] 远程新增、检索、问答成功；错误 Token 返回 401。
- [ ] Durable Object 重启后能读回笔记。
- [ ] 当前生产域名验证完成且不记录密钥。

## Phase 1 — 身份、角色与 D1 控制面

目标：建立一个管理员、少量受邀用户和空间化知识模型。D1 仅作 Phase 1 控制面权威，已发布的旧版知识保持在兼容 Durable Object 中。

范围：

- [x] 接入 GitHub OAuth、D1 会话与成员映射。（本地 GitHub HTTP fake、单元与 workerd 验证；未验证远程 OAuth registration）
- [x] 建立 D1 migrations：members、spaces、collections、submissions、audit_events。（本地 D1 fixture；远程 migration 未获授权执行）
- 管理员/用户权限中间件与服务端权限策略。
- Space、Collection、Tag 的管理 API。
- 用户首页、管理员外壳和角色化导航。
- 成员启用、封禁和管理员保护规则。
- 审计登录、成员变更和管理操作。

退出标准：

- [x] 完整权限矩阵自动测试通过。（本地 workerd）
- [x] 普通用户无法调用管理 API。（本地 workerd）
- [x] automation 无法调用管理 API，且 smoke 只走 legacy 路径。（本地 contract/workerd）
- [x] D1 查询使用索引和有界分页。（本地 migration/service 测试；未记录远程 rows_read/rows_written）
- [ ] 远程 D1 migration 与 seed 已在目标数据库核验。
- [ ] GitHub OAuth callback、allowlist 与 bootstrap admin 在自定义域核验。
- [ ] HMAC + APP_TOKEN signed smoke 在自定义域通过且不泄露凭证。
- [ ] disabled contributor 在真实 GitHub OAuth 会话下被应用拒绝。
- [ ] production 与 preview workers.dev URL 在已部署账户中保持关闭。
- [ ] 旧版 Durable Object 跨远程激活后仍可读取。

## Phase 2 — 统一采集与 R2 原件

目标：稳定录入图片、PDF、Office、文本、富文本和代码。

范围：

- R2 Standard 私有 Bucket、暂存区、正式区和回收区。
- 浏览器直传协议、上传完成校验和中断清理。
- SHA-256 幂等、完全重复检测和相似候选入口。
- 文本、Markdown、代码与富文本清洗解析器。
- Workers AI `toMarkdown`：PDF、图片、Word、Excel、HTML/XML 和 OpenDocument。
- PPTX 浏览器 OOXML 文本/结构解析与人工补充文本降级。
- ParseJob 状态机、Queue 唤醒、D1 权威任务和重投扫描。
- 8 GB 预警、9 GB 文件写入硬断路器。
- “我的提交”页面与逐文件状态、错误和重试信息。

退出标准：

- 支持矩阵每种格式包含成功、损坏、空内容和超限 fixture。
- 中断上传不会产生可见知识，孤儿对象可被回收。
- 解析失败仍可下载原件并提交替代文本。
- 9 GB 保护能拒绝文件但允许纯文本录入。

## Phase 3 — 审核、发布、版本与回收站

目标：建立从用户提交到正式知识的可信治理流程。

范围：

- 管理员审核队列、筛选、排序和批量操作。
- 原件预览与规范 Markdown 对照。
- 摘要、标签、Space/Collection 和敏感信息建议。
- 发布共享、发布仅管理员、驳回、重复关联和重新解析。
- 每 Space 一个 SpaceCoordinator Durable Object。
- Computer VFS 的 Space 工作区、Revision manifest 和内容路径规范。
- 不可变 Revision、并发控制、当前版本切换和回滚。
- 30 天回收站、恢复和最终清理顺序。
- 发布与下载审计。

退出标准：

- 并发审核只产生一个当前 Revision。
- 重复 Queue 消息不会产生重复 Revision。
- 索引失败只产生 `search_degraded`，不产生半发布内容。
- 删除、恢复、回滚和最终清理演练通过。

## Phase 4 — 知识阅读器与混合检索

目标：实现可过滤、可定位、可评测的知识检索。

范围：

- D1 FTS5 chunk 表、触发器/同步策略和 BM25 查询。
- Markdown 分块、标题路径与页码/工作表/幻灯片/行号位置。
- Vectorize 384 维索引、namespace 和 visibility metadata index。
- 文档摘要向量和选择性高价值段落向量。
- RRF 融合、revision 去重、权限二次校验和稳定 citation_id。
- 搜索筛选器、保存视图、命中高亮和结果内问答入口。
- 三栏知识阅读器、原件定位、反向链接和相关知识。
- 人工标注查询集、Recall@5 和排序回归测试。

退出标准：

- Recall@5 ≥ 85%。
- 所有返回引用都能定位并回读到当前用户可见内容。
- 权限过滤和引用回读泄露测试为 0。
- 禁用 Vectorize 后 FTS5 搜索完整可用。

## Phase 5 — 持久化可信 Agent

目标：提供多轮、可恢复、严格引用的知识问答。

范围：

- Cloudflare Agents SDK 会话路由、消息持久化和恢复流。
- `searchKnowledge`、`readSource`、`compareSources`、`createDraft` 工具。
- 工具级角色校验和成员状态重新加载。
- 引用生成、引用支持性验证和权限回读。
- Prompt injection 防护与不可信文档边界。
- 答案保存为用户草稿并进入正常审核流程。
- AI 日预算优先级、`deferred_quota` 和无 AI 模式。
- Agent 固定问答集、错误引用评测和断线恢复测试。

退出标准：

- 固定评测集错误引用率为 0。
- 无来源或来源不足时可靠拒答。
- Agent 不能读取 admin_only 内容或直接发布知识。
- 断线重连能恢复回答；显式停止能终止本次生成。

## Phase 6 — 知识网络、治理与复盘

目标：让知识库长期保持可发现、可维护和可迁移。

范围：

- 双向链接、未链接提及和知识关系图。
- 重复、无分类、孤立、过期、失效链接和低质量解析候选。
- 标签合并和分类调整的待审核变更。
- 收藏、待读、最近访问和保存视图。
- 确定性每日/每周回顾；额度允许时附加 AI 摘要。
- Markdown + manifest + 原件的全量/增量导出。
- 导入 dry-run、冲突报告和新环境恢复工具。
- 定期恢复演练和索引重建。

退出标准：

- 治理任务不静默修改正式知识。
- 全量导出可在新 Cloudflare 环境恢复条目、版本、原件和引用映射。
- 从权威数据重建 FTS5 与 Vectorize 后结果一致。
- 恢复演练步骤和真实输出被记录。

## Phase 7 — 成熟体验与运营

目标：完善移动体验、可访问性、观测和故障处理。

范围：

- PWA、移动快速录入、相机图片和系统分享入口。
- 桌面快捷键、⌘K、审核快捷操作和批量选择。
- WCAG 目标、键盘导航、焦点管理和屏幕阅读器验证。
- 结构化日志、任务积压、失败率、索引漂移和配额仪表盘。
- R2、D1、DO、Workers AI、Vectorize 和 Queue 故障手册。
- 配额耗尽、解析服务异常、索引漂移和上游 Computer Preview 变更演练。
- Computer 适配器契约测试、版本升级策略和迁移器。
- 发布 checklist、变更日志和回滚说明。

退出标准：

- 上传 → 审核 → 发布 → 搜索 → Agent → 修订的端到端旅程通过。
- 移动端核心旅程和管理员桌面旅程通过无障碍检查。
- 所有配额与主要依赖故障均有可重复演练。
- 托管 CI、真实 Provider 和生产域验证证据齐全后才声明 1.0。

## 全局免费额度保护

| 产品 | 保护策略 |
| --- | --- |
| R2 | 8 GB 预警；9 GB 停止文件写入；只用 Standard |
| Workers AI | 在线问答优先；低优先级任务延迟；耗尽后关闭 AI 能力 |
| Vectorize | 80% 停止普通段落向量；超限切换 FTS5-only |
| D1 | 索引、有界分页、配额错误只读降级，不循环重试 |
| Durable Objects | 按 Space/会话分片；超限返回明确平台限制 |
| Queues | 小消息、批处理、有限重试；权威任务可从 D1 重投 |
| Workflows | 核心流程不依赖；引入前单独验证免费额度和保留需求 |

## 里程碑依赖

```text
Phase 0
  └─ Phase 1
       └─ Phase 2
            └─ Phase 3
                 ├─ Phase 4 ── Phase 5
                 └─ Phase 6
                      └─ Phase 7
```

Phase 4 依赖正式 Revision 和来源定位；Phase 5 依赖稳定检索与引用；Phase 6 的导出恢复可在 Phase 4 后并行推进，但必须在 1.0 前完成。
