# Memory Garden Agent

一个部署在 Cloudflare 免费层上的个人知识库 Agent。笔记以 Markdown 保存在 `@cloudflare/computer` 的 SQLite-backed Durable Object 虚拟文件系统中；检索在边缘端完成，回答由 Workers AI 生成并返回可核对的来源。

## 架构

```text
Browser UI → Worker API → personal Durable Object
                         ├─ Computer VFS: /workspace/notes/*.md
                         ├─ Computer VFS: /workspace/.memory/index.json
                         └─ keyword retrieval → Workers AI → cited answer
```

为什么不使用更多产品：个人规模下，Computer 已把权威文件状态放在 Durable Object SQLite；再引入 D1、R2 或 Vectorize 会制造双写和额外配额。Cloudflare Container 也不是免费层方案，因此本项目仅使用 Computer 的 filesystem surface，不配置 execution backend。

> `@cloudflare/computer` 官方目前标注为 Preview，不适合承诺生产稳定性。本项目是可部署 MVP，并通过适配边界把未来迁移限制在存储层。

## 功能

- Markdown 笔记写入、更新、标签与列表索引
- 中英文关键词检索，标题/标签加权
- RAG 问答，只将命中的笔记片段交给 Workers AI
- `[1]` 形式引用与原始来源卡片
- 可选 `APP_TOKEN` 保护 API；正式使用建议再配置 Cloudflare Access
- 单 Worker 静态界面，无 Pages、外部数据库或第三方模型费用

## 本地运行

```bash
npm install
npm run check
npm run dev
```

本地 Workers AI 调用通常需要远程绑定和 Cloudflare 登录；纯检索单元测试不需要账户。若要启用共享令牌：

```bash
npx wrangler secret put APP_TOKEN
```

然后在页面右上角“设置令牌”。不要把令牌写进 `wrangler.jsonc` 或提交 `.dev.vars`。

## 部署

```bash
npx wrangler login
npm run deploy
```

部署后建议在 Cloudflare Zero Trust 中为该 Worker 自定义域配置 Access 自托管应用，仅允许自己的邮箱。Cloudflare Access 免费层政策与额度可能变化，部署时应以控制台显示为准。

## API

- `GET /api/health`
- `GET /api/notes`
- `POST /api/notes` — `{ title, tags, content, id? }`
- `GET /api/search?q=...`
- `POST /api/chat` — `{ question }`

配置了 `APP_TOKEN` 后，所有 API 请求须带 `Authorization: Bearer <token>`。单条笔记限制 128 KiB；这是应用保护阈值，不是平台上限。

## 免费层边界

平台不会保证“永远免费”。当前设计只依赖 Workers、SQLite-backed Durable Objects 和 Workers AI 的免费额度；超过每日额度时请求会失败而不会自动扩展成本。仓库没有绑卡、预算或账户级设置能力，因此部署者仍应在 Cloudflare 控制台检查计划与用量。详见 [ROADMAP.md](./ROADMAP.md)。

## 数据与隐私

这是单租户设计，固定使用名为 `personal` 的 Durable Object。不要在未配置 Access 或 `APP_TOKEN` 时把地址公开。当前版本没有附件、批量导出和删除 API；正式导入重要资料前应等待 roadmap 中的备份/恢复里程碑。
