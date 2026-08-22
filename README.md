# Memory Garden Agent

一个使用 GitHub OAuth 登录、部署在 Cloudflare 免费层上的个人知识库 Agent。Phase 1 的成员、空间、投稿和审计控制面使用 D1；已发布的旧版笔记仍保存在 `@cloudflare/computer` 的 SQLite-backed Durable Object 虚拟文件系统中。

M1 的 23 个本地/Workerd 产品原子已全部通过固定、无 Provider 的验收门禁。生产 `0004` migration、精确版本部署、双语浏览器旅程和 D1 成本证据尚未执行；`OPS-015` 与 `GATE-M1` 保持未勾选。当前精确状态是 **M1 实现完成；远程验证待完成**，不是生产验收。

## 产品演进文档

- [AI 知识操作系统设计规格](./docs/superpowers/specs/2026-08-21-ai-knowledge-system-design.md)：当前产品、权限、架构、免费层和里程碑权威定义。
- [国外 AI 知识库标杆矩阵](./docs/product/ai-knowledge-base-benchmark.md)：NotebookLM、Glean、Notion、Perplexity、Onyx、RAGFlow、Dify、AnythingLLM、Khoj 的取舍证据。
- [原子级交付 Checklist](./docs/product/ai-knowledge-base-checklist.md)：按来源、解析、治理、检索、引用、Agent、评测和运维拆解的实现与验收项。
- [Roadmap](./ROADMAP.md)：M0–M8 纵向交付顺序和退出标准。

## 架构

```text
Browser UI → GitHub OAuth → Worker API → D1 control plane
                                      └─ personal Durable Object
                                         ├─ Computer VFS: /workspace/notes/*.md
                                         ├─ Computer VFS: /workspace/.memory/index.json
                                         └─ keyword retrieval → Workers AI → cited answer
```

为什么不在 Phase 1 引入更多产品：D1 只保存成员、空间、投稿和审计控制面；已发布笔记仍由 Durable Object 保存，避免把旧版内容迁移为双写。R2、Vectorize 与执行后端不属于本阶段。

> `@cloudflare/computer` 官方目前标注为 Preview，不适合承诺生产稳定性。本项目是可部署 MVP，并通过适配边界把未来迁移限制在存储层。

## 功能

- Markdown 笔记写入、更新、标签与列表索引
- 中英文关键词检索，标题/标签加权
- RAG 问答，只将命中的笔记片段交给 Workers AI
- `[1]` 形式引用与原始来源卡片
- 浏览器身份只来自验证后的 GitHub OAuth 回调与 D1 会话；角色、状态和能力由 D1 决定
- 自动化同时需要 HMAC 签名和 `APP_TOKEN`，且只能访问兼容 smoke 路径，绝不是管理员
- 单 Worker 静态界面，无 Pages、外部数据库或第三方模型费用

## 本地运行

```bash
npm install
rtk npm run test:m1
rtk npm run check
rtk npm run dev
```

`rtk npm run test:m1` 是固定的 parser/chunker/publication/library/citation/API/UI/evaluation 门禁；其中 24 条评测语料使用确定性本地 fake，不请求 Provider。`rtk npm run check` 继续包含全部 smoke、unit、Workerd 测试、生成类型、TypeScript 和 Wrangler dry build，不会被 M1 子门禁替代。两者都不会验证已部署 Durable Object 的持久性、生产域名或 Provider 成熟度。

本地 Workers AI 调用通常需要远程绑定和 Cloudflare 登录；纯检索单元测试不需要账户。生产 OAuth、七项配置、密钥生成、D1、版本上传、部署和故障复盘统一见 [生产核心运维手册](./docs/operations/production-environment-handbook.md)。不要把 `GITHUB_OAUTH_CLIENT_SECRET`、`BOOTSTRAP_ADMIN_EMAIL`、`ALLOWED_MEMBER_EMAILS`、`AUTOMATION_SECRET` 或 `APP_TOKEN` 写进 `wrangler.jsonc`、`.dev.vars`、命令行参数或日志。

静态浏览器文件位于 `public/`，由 Worker 的 `ASSETS` binding 提供；`/api/*` 仍由 Worker 路由、认证和安全响应头处理。

## 部署

首次部署前必须完整执行 [生产核心运维手册](./docs/operations/production-environment-handbook.md)。M1 发布还必须使用 [M1 精确发布手册](./docs/operations/m1-release.md) 和其 [生产证据模板](./docs/operations/evidence/m1-release-template.md)：D1 导出、完整本地门禁、检查并前向应用 `0003`、上传包含完整七项 Secret 的候选版本、检查精确版本后再部署，最后完成 OAuth/session、M1 浏览器旅程、权限拒绝、signed automation、跨激活读取和 D1 成本证据。不要使用或公开 workers.dev/preview URL，也不要从 README 绕过该顺序直接运行部署命令。

## API

- `GET /api/session`（GitHub OAuth 会话成员）
- `GET /api/spaces`、`POST /api/submissions`、`GET /api/submissions/mine`（GitHub OAuth 会话成员）
- `GET /api/knowledge`、`GET /api/knowledge/search`、`GET /api/knowledge/:id`、`GET /api/knowledge/citations/:id`、`POST /api/knowledge/chat`（active member，服务端权限范围）
- `/api/admin/*`（仅 active admin）
- `GET /api/health`、`GET /api/notes`、`POST /api/notes`、`GET /api/search?q=...`、`POST /api/chat`（legacy；自动化只可使用这些路径）

浏览器不提交或保存 APP token、OAuth client secret 或自动化 secret。自动化以 `Authorization: Bearer <APP_TOKEN>` 和每请求 HMAC-SHA256 签名通过 Worker 验证。单条 legacy 笔记限制 128 KiB；这是应用保护阈值，不是平台上限。

## 远程 smoke 验证

仅在 GitHub OAuth 部署授权后运行 automation smoke。它交互式读取 `AUTOMATION_CLIENT_ID`、`AUTOMATION_SECRET` 与 `APP_TOKEN`；脚本不会打印三者、请求头、笔记正文或完整 Agent 回答。远程 URL 必须为 HTTPS；仅本地 contract 测试可通过 `MEMORY_GARDEN_ALLOW_HTTP_LOCAL=true` 使用 `localhost`、`127.0.0.0/8` 或 `::1` 的 HTTP 地址，其他 HTTP 地址一律拒绝。

```bash
read -rs AUTOMATION_CLIENT_ID
export AUTOMATION_CLIENT_ID
read -rs AUTOMATION_SECRET
export AUTOMATION_SECRET
read -rs APP_TOKEN
export APP_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory.crgmhrc.asia
rtk npm run smoke
unset AUTOMATION_CLIENT_ID AUTOMATION_SECRET APP_TOKEN MEMORY_GARDEN_BASE_URL
```

Smoke 只验证 automation 可用的 health、创建、列表、检索和带来源的问答；它不发送无认证请求，也不会调用管理员 API。每次会写入一条 `smoke-<uuid>` 笔记；Phase 3 的回收站/删除能力完成前，它会保留。正式入口仅为自定义域：配置意图为 production 与 preview workers.dev URL 都关闭，授权部署后仍需在控制台验证。详见 [smoke-test.md](./docs/operations/smoke-test.md)。

## 免费层边界

平台不会保证“永远免费”。当前设计只依赖 Workers、SQLite-backed Durable Objects 和 Workers AI 的免费额度；超过每日额度时请求会失败而不会自动扩展成本。Smoke 的问答请求会消耗 Workers AI 配额，故只能在明确授权的已部署环境执行。仓库没有绑卡、预算或账户级设置能力，也无法强制账户零计费；部署者仍应在 Cloudflare 控制台确认计划、预算保护和用量。详见 [ROADMAP.md](./ROADMAP.md)。

## 数据与隐私

这是单组织、5–20 人私有知识库设计。不要在未配置 GitHub OAuth、D1 成员控制面和 automation APP token 的情况下公开地址。操作者已于 2026-08-21 确认自定义域 GitHub OAuth 登录成功，但成功 callback 的正式脱敏证据、signed automation、disabled contributor、workers.dev 关闭状态、Durable Object 跨激活恢复以及完整 M1 生产旅程仍需归档；不要据此宣称生产成熟度。M1 审核发布链路目前只有本地/Workerd 证据；完整附件管线、批量导出和新环境恢复仍未实现，正式导入不可替代的重要资料前应等待 Roadmap M7。
