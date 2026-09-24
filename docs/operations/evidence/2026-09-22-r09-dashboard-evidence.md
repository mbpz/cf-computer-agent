# R09 Cloudflare Dashboard 发布链证据

日期：2026-09-24（Asia/Shanghai，刷新记录）。本记录来自已登录的 Codex 自带浏览器 → Cloudflare Dashboard 只读检查；未打开、复制或修改任何 secret 值，未执行部署、回滚、迁移或其他生产写入。

## 发布链与当前生产版本

| 项目 | 证据 |
| --- | --- |
| Git 仓库 | `mbpz/cf-computer-agent` |
| 生产分支 | `main` |
| 最近成功构建 | Build `#a1d02240` |
| 构建 commit | `525bdfb945fd6d892bf48928dd75dea995bc9237` |
| 构建提交 | `docs: record cron observability evidence` |
| 构建命令 | `npm run build` |
| 部署命令 | `npx wrangler deploy` |
| 根目录 | `/` |
| 当前 100% 生产版本 | `ff4e0667`（Dashboard 展示短版本标识；前序版本 `686168b3`、`34949fd7`、`ca60bbc3`） |
| 当前生产 Worker | `memory-garden-agent` |

Dashboard 的构建详情明确显示仓库、`main` 分支、`525bdfb` commit 链接、成功构建、构建命令和部署命令；Build `#a1d02240` 的阶段时间为初始化 `08:35:31.109`、克隆 `08:35:35.310`、安装 `08:35:37.646`、构建 `08:36:24.811`、部署 `08:36:39.954`。部署页随后显示当前生产版本 `ff4e0667` 为 100% 流量。当前最新 source → build → production version 已可追溯；历史版本 `686168b3`、`34949fd7`、`ca60bbc3` 保留为旧版本责任记录。部署历史的来源字段是 Wrangler，不能额外推断为 GitHub Actions。

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
- `MAINTENANCE` → Durable Object `memory-garden-agent_MaintenanceCoordinator`

### 当前触发器

- Cron：已配置并启用；Dashboard 显示下一次运行时间
- Queues：未配置队列消费者
- Email triggers：未配置邮件路由
- 构建触发：Git 仓库 `mbpz/cf-computer-agent` 的 `main` 分支构建；API token 名称显示为 `edgetunnel build token`
- 构建变量/构建密钥：未配置

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
- `MAINTENANCE_CONTROL_TOKEN`：未配置

## R09 当前判定

已关闭的 R09 子项：

- 当前 100% 生产版本可映射到 Git commit、构建记录和 `main` 分支
- 构建命令、部署命令、仓库和根目录已确认
- 自定义域名、workers.dev、Preview URL、D1、Durable Objects（含 `MAINTENANCE`）、Assets、AI 和 Cron 已盘点
- 当前构建未配置额外构建变量或队列/邮件触发器

仍开放的 R09 子项：

- 需要将 Worker fetch、Cron、Automation client、Dashboard/控制台、旧版本/其他 Worker 的责任人、停写动作和恢复动作写入生产写者账本
- 需要确认外部 Automation client、Dashboard 手工写入和旧版本流量不存在未登记的生产写入路径
- `MAINTENANCE_CONTROL_TOKEN` 尚未配置，因此当前版本的安全闸门会选择 legacy entry；`guardFetch`/`guardScheduled` 尚未在生产启用，不能声称生产写者已被维护控制面统一围栏

## 生产接线阻塞

当前生产已部署安全闸门和管理员维护控制 API，但因 `MAINTENANCE_CONTROL_TOKEN` 未配置，生产仍保持 legacy 业务入口。因而本记录证明的是“当前 source-to-version 与平台配置可追溯”，不证明“生产停写/排空/恢复控制已可执行”。R14 仍需单独批准 secret 和控制验证；在此之前不得执行 R16–R21 的生产停写、备份、迁移或恢复。

当前 `main` 已包含 `850db38` 安全闸门、`2feb021` 管理员维护控制 API 和 R09 账本刷新；Dashboard 已确认 `525bdfb` / Build `#a1d02240` / production `ff4e0667` 100%。最新 source-to-version 补证完成；代码内写者、DO、Cron、Automation、手工 Wrangler 与旧版本责任拆分见[2026-09-22 R09 writer ledger](2026-09-22-r09-writer-ledger.md)。

因此本证据将 R09 从“发布链未知”推进为“source-to-version 与平台配置已证实、生产写者责任账本待收口”，不直接勾选 R09 完成。
