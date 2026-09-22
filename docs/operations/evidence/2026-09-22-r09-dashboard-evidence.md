# R09 Cloudflare Dashboard 发布链证据

日期：2026-09-22（Asia/Shanghai）。本记录来自已登录的 Google Chrome → Cloudflare Dashboard 只读检查；未打开、复制或修改任何 secret 值，未执行部署、回滚、迁移或其他生产写入。

## 发布链与当前生产版本

| 项目 | 证据 |
| --- | --- |
| Git 仓库 | `mbpz/cf-computer-agent` |
| 生产分支 | `main` |
| 最近成功构建 | Build `#e2241b76` |
| 构建 commit | `38c403bc219fdea0455896d27d73551f0b7ca11f` |
| 构建提交 | `test: remove ci python startup dependency` |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |
| 根目录 | `/` |
| 当前 100% 生产版本 | `7e902d7c` |
| 当前生产 Worker | `memory-garden-agent` |

Dashboard 的构建详情明确显示仓库、`main` 分支、commit 链接、成功构建、构建命令和部署命令；部署页显示 `7e902d7c` 获得 100% 流量。因此 source → build → production version 已可追溯。

## 路由、绑定与触发器

### 域名与路由

- 自定义生产域名：`memory.crgmhrc.asia`
- `memory-garden-agent.apples398.workers.dev`：Production Worker URL 已关闭
- `*-memory-garden-agent.apples398.workers.dev`：Preview URL 已关闭
- Dashboard 自定义域名列表仅显示 `memory.crgmhrc.asia`

### 当前绑定

- `AGENT_SESSIONS` → Durable Object `memory-garden-agent_AgentSession`
- `AI` → Workers AI
- `ASSETS` → Worker Assets
- `DB` → D1 `memory-garden-control-plane`
- `KNOWLEDGE` → Durable Object `memory-garden-agent_KnowledgeBase`

### 当前触发器

- Cron：已配置并启用；Dashboard 显示下一次运行时间
- Queues：未配置队列消费者
- Email triggers：未配置邮件路由
- 构建触发：Git 仓库 `mbpz/cf-computer-agent` 的 `main` 分支构建

## 变量与密钥配置

Dashboard 只读核对到以下名称；值均显示为加密或未展开，未读取任何值：

- `ALLOWED_MEMBER_EMAILS`
- `ALLOW_INSECURE_LOCAL=false`（普通变量）
- `APP_TOKEN`
- `AUTOMATION_CLIENT_ID`
- `AUTOMATION_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL`
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`

## R09 当前判定

已关闭的 R09 子项：

- 当前 100% 生产版本可映射到 Git commit、构建记录和 `main` 分支
- 构建命令、部署命令、仓库和根目录已确认
- 自定义域名、workers.dev、Preview URL、D1、Durable Objects、Assets、AI 和 Cron 已盘点
- 当前构建未配置额外构建变量或队列/邮件触发器

仍开放的 R09 子项：

- 需要将 Worker fetch、Cron、Automation client、Dashboard/控制台、旧版本/其他 Worker 的责任人、停写动作和恢复动作写入生产写者账本
- 需要确认外部 Automation client、Dashboard 手工写入和旧版本流量不存在未登记的生产写入路径
- 当前生产入口仍是 `src/index.ts` 的 `createWorkerEntry({ mode: "legacy" })`；`src/worker-entry.ts` 的 `guardFetch`/`guardScheduled` 仅在 guarded 模式生效，维护协调器尚未接入生产 Worker，因此不能声称生产写者已被维护控制面统一围栏

## 生产接线阻塞

当前生产构建对应的仓库源码仍明确标记：

```ts
// Maintenance is deliberately NOT enabled on the production entry.
export default createWorkerEntry({ mode: "legacy" });
```

因此本记录证明的是“发布链和平台配置可追溯”，不证明“生产停写/排空/恢复控制已可执行”。R14 必须在单独批准维护接线候选并完成部署后，才能继续验证写者覆盖；在此之前不得执行 R16–R21 的生产停写、备份、迁移或恢复。

当前 `main` 已包含 `850db38` 安全闸门和 `2feb021` 管理员维护控制 API，但本记录中的 Dashboard 版本仍是旧候选；新的 source-to-version、binding、migration 和控制 API 生产证据必须重新只读刷新。代码内写者、DO、Cron、Automation、手工 Wrangler 与旧版本责任拆分见[2026-09-22 R09 writer ledger](2026-09-22-r09-writer-ledger.md)。

因此本证据将 R09 从“发布链未知”推进为“source-to-version 与平台配置已证实、生产写者责任账本待收口”，不直接勾选 R09 完成。
