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
- 已部署 API 必须配置 `APP_TOKEN`；无令牌仅限显式本地兼容模式，正式使用建议再配置 Cloudflare Access
- 单 Worker 静态界面，无 Pages、外部数据库或第三方模型费用

## 本地运行

```bash
npm install
rtk npm run check
rtk npm run dev
```

`rtk npm run check` 只验证生成类型、TypeScript、单元测试、workerd 集成测试和 Wrangler dry build。它不会请求远程 Workers AI、不会验证已部署 Durable Object 的持久性，也不构成生产域名或 Provider 成熟度证据。

本地 Workers AI 调用通常需要远程绑定和 Cloudflare 登录；纯检索单元测试不需要账户。部署环境必须设置共享令牌：

```bash
rtk npx wrangler secret put APP_TOKEN
```

未设置 `APP_TOKEN` 的部署会以 `503 AUTH_MISCONFIGURED` 拒绝 API 请求。只有显式设置 `ALLOW_INSECURE_LOCAL=true` 的本地兼容环境才允许无令牌访问；不要把它部署到远程环境。然后在页面右上角“设置令牌”。不要把令牌写进 `wrangler.jsonc`、`.dev.vars` 或命令行参数。

静态浏览器文件位于 `public/`，由 Worker 的 `ASSETS` binding 提供；`/api/*` 仍由 Worker 路由、认证和安全响应头处理。

## 部署

```bash
rtk npx wrangler login
rtk npm run deploy
```

部署后建议在 Cloudflare Zero Trust 中为该 Worker 自定义域配置 Access 自托管应用，仅允许自己的邮箱。Cloudflare Access 免费层政策与额度可能变化，部署时应以控制台显示为准。

## API

- `GET /api/health`
- `GET /api/notes`
- `POST /api/notes` — `{ title, tags, content, id? }`
- `GET /api/search?q=...`
- `POST /api/chat` — `{ question }`

配置了 `APP_TOKEN` 后，所有 API 请求须带 `Authorization: Bearer <token>`。单条笔记限制 128 KiB；这是应用保护阈值，不是平台上限。

## 远程 smoke 验证

部署授权后，使用交互式输入设置令牌，再运行 smoke。令牌只从 `MEMORY_GARDEN_TOKEN` 读取，脚本不会打印令牌、请求头、笔记正文或完整 Agent 回答。远程 URL 必须为 HTTPS；仅本地 contract 测试可通过 `MEMORY_GARDEN_ALLOW_HTTP_LOCAL=true` 使用 `localhost`、`127.0.0.0/8` 或 `::1` 的 HTTP 地址，其他 HTTP 地址一律拒绝。

```bash
read -s MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_TOKEN
export MEMORY_GARDEN_BASE_URL=https://memory-garden-agent.apples398.workers.dev
rtk npm run smoke
unset MEMORY_GARDEN_TOKEN MEMORY_GARDEN_BASE_URL
```

Smoke 依次验证未授权与授权 health、创建、列表、检索和带来源的问答；每次会写入一条 `smoke-<uuid>` 笔记。当前没有删除 API，因此不会自动清理；Phase 3 的回收站/删除能力完成前，这条可识别笔记会保留。仅在 workers.dev 与自定义域都成功执行后，才是远程 API 与 Provider 的一次运行证据；它仍不能单独证明长期 Durable Object 重启恢复或 `@cloudflare/computer` Preview 的生产成熟度。

## 免费层边界

平台不会保证“永远免费”。当前设计只依赖 Workers、SQLite-backed Durable Objects 和 Workers AI 的免费额度；超过每日额度时请求会失败而不会自动扩展成本。Smoke 的问答请求会消耗 Workers AI 配额，故只能在明确授权的已部署环境执行。仓库没有绑卡、预算或账户级设置能力，也无法强制账户零计费；部署者仍应在 Cloudflare 控制台确认计划、预算保护和用量。详见 [ROADMAP.md](./ROADMAP.md)。

## 数据与隐私

这是单租户设计，固定使用名为 `personal` 的 Durable Object。不要在未配置 Access 或 `APP_TOKEN` 时把地址公开。当前版本没有附件、批量导出和删除 API；正式导入重要资料前应等待 roadmap 中的备份/恢复里程碑。
