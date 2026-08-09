# Memory Garden Roadmap

更新时间：2026-08-05

## 产品原则

1. 零账单优先：只采用明确可在 Workers Free 使用的能力，达到配额后明确失败。
2. 文件是知识源：Markdown 是可迁移的权威数据，索引可重建。
3. 回答必须可追溯：无命中不回答，每次回答展示来源。
4. 个人默认私密：认证、导出和恢复优先于公开分享。
5. 隔离预览依赖：`@cloudflare/computer` 只通过 workspace adapter 使用，避免业务逻辑依赖执行后端。

## M0 — 可运行 MVP（已实现）

- [x] 单 Worker Web UI 与 JSON API
- [x] Computer VFS 持久化 Markdown
- [x] 可重建 JSON 元数据索引
- [x] 标题、标签、正文关键词检索
- [x] Workers AI 引用式问答与无依据拒答
- [x] 可选 Bearer token
- [x] 检索与 ID 正规化单元测试
- [ ] 真实 Cloudflare 账户远程部署验证
- [ ] 远程 Workers AI、DO 重启后持久性和免费配额验证

退出标准：`npm run check` 通过；远程 smoke test 能新增、检索、问答，并在 DO 重启后读回笔记。

## M1 — 数据安全与可维护性

- 导出/导入 ZIP（Markdown + manifest），导入前 dry-run
- 笔记删除、软删除和 30 天回收站
- 乐观并发控制（ETag/version），避免多标签页覆盖
- 索引损坏检测和从 `/workspace/notes` 重建
- Cloudflare Access 配置指南与认证集成测试
- API 限流、请求 ID、结构化错误和配额错误提示

退出标准：完成一次新命名空间的全量恢复演练；未授权、冲突写、超限均有自动测试。

## M2 — 检索质量

- Markdown 分段与段落级引用，而非整篇摘要截断
- 中文分词、短语匹配、BM25 风格排序
- Workers AI embeddings 的可选语义索引（先验证免费额度和 Vectorize 当前免费可用性）
- 增量索引版本、评测集和检索 Recall@k 基线
- 回答中的引用编号与来源片段强一致性校验

退出标准：固定个人问答集上达到约定 Recall@5；错误引用率为 0。

## M3 — 采集与整理

- Markdown/文本批量上传和幂等导入
- URL 保存：正文提取、来源 URL、抓取时间与内容哈希
- 每日笔记、收件箱、双向链接与未链接提及
- 标签建议和重复内容检测（只建议，不静默修改）
- 附件方案评审；仅在确有需求时引入 R2

退出标准：1000 篇笔记导入可恢复、可去重，失败项目有清晰报告。

## M4 — Agent 工作流

- 基于知识库生成周报、学习复盘和项目 brief
- 计划任务前先核对 Workflows/Agents SDK 的免费层约束
- 工具权限分级：只读默认，写操作逐次确认并留审计记录
- Computer API 变动的兼容性测试与迁移器

退出标准：任何 Agent 写操作均可预览、审计、撤销；上游 Preview 升级有回归套件。

## 暂不做

- Cloudflare Containers：不满足“全部免费产品”的约束。
- 多租户 SaaS：认证、隔离、滥用和成本模型与个人产品不同。
- 自动购买超额用量：免费额度耗尽时宁可降级/失败。
- 把 README 或本地模拟测试当成生产稳定性证据。
