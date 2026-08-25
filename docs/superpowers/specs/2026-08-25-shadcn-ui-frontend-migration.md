# shadcn/ui 前端迁移规格书

## 状态

- 状态：已获方向批准，规格书与迁移清单已提交；按原子切片持续验收
- 日期：2026-08-25
- 当前基线：`0fd5290 feat: add asset parse previews`
- 暂停任务：PAR-020 重新解析；前端迁移完成后重新排期

## 目标

将当前 Worker 静态资源中的 vanilla JavaScript 工作台渐进式迁移为 React + Vite + shadcn/ui 源码组件体系，改善布局、交互、可访问性和状态反馈，同时保持现有 Cloudflare 免费层、5–20 人私有知识库边界、API、GitHub OAuth、Session Cookie、D1、Durable Object、R2 可选能力和 Markdown 安全渲染不变。

## 设计判断

Reading this as: 面向已认证知识工作者的私有 B2B 工作台重构，使用克制、清晰、偏 Cloudflare/GitHub 的工具型语言，采用 shadcn/ui 开源源码组件、Tailwind CSS token 和 React/Vite 静态构建。

- DESIGN_VARIANCE：5
- MOTION_INTENSITY：3
- VISUAL_DENSITY：5
- 主色：zinc/neutral 基础色 + 单一品牌 accent
- 字体：现有本地字体策略；不通过 Google Fonts 外链
- 图标：单一图标族，优先 Phosphor；禁止手绘 SVG

## 技术边界

1. React 只负责静态资源 UI，不创建 Node 服务端。
2. Vite 输出必须由 Wrangler Assets 提供。
3. API 路由和 JSON 响应不改名、不改变权限语义。
4. GitHub 登录、Session Cookie、退出和 same-origin 防护保持现状。
5. i18n 复用现有 locale key 与插值协议；新增文案必须同时进入中英文 locale。
6. Markdown 必须继续通过现有安全渲染入口，不允许直接 `innerHTML`。
7. 不引入 R2、Vectorize、Queues、付费 AI 或新的 Cloudflare 付费能力。
8. 迁移期间保留旧 UI 可回滚路径；完成验收后才删除旧 vanilla 文件。

## 目标目录

```text
frontend/
  components/ui/       # shadcn 源码组件
  components/shell/    # AppShell、Sidebar、Topbar、UserMenu
  features/            # knowledge、search、agent、submissions、admin
  lib/                 # apiFetch、i18n、routes、formatters、guards
  pages/               # 页面组合层
  styles/              # Tailwind/token 入口
  main.tsx
```

构建产物进入 Wrangler Assets 目录；现有 `public/` 在迁移完成前不得被清空。切换时必须保留可回滚提交。

## 数据与状态

- `apiFetch` 统一处理 JSON、错误码、request id、401、403、404、409、422、503。
- 页面级状态使用 React state；跨页面只保存 session snapshot、locale 和路由状态。
- 不在 localStorage 保存 Token、Session 或密钥。
- 每个异步 mutation 保存 `{generation, pathname}` owner；过期响应不得更新 DOM。
- 分页 cursor 必须保持 API 返回值，不在客户端重编码。

## 页面范围

用户侧：首页、知识库、知识阅读、搜索、Agent、知识录入、我的提交。

管理员侧：Dashboard、审核队列、审核详情、资产解析队列、解析预览、成员、Space/Collection、审计日志。

通用状态：loading、empty、error、forbidden、degraded、pending、success、confirm dialog、toast。

## 验收门槛

- 旧 UI 全部路由有新 UI 对应实现。
- API、权限、Session、OAuth、Markdown 安全测试不回归。
- 中英文 key/placeholder 完全一致。
- 键盘可完成导航、Dialog、Sheet、表单提交和错误恢复。
- 320px、768px、1280px 三档布局可用。
- `npm run check`、`npm run build:ui`、Wrangler dry-run 全部通过。
- 构建产物不包含 Secret、Cookie、Token、OAuth code 或原始异常消息。
- 旧 UI 仅在新 UI 完成同等路由验收后删除。

## 明确不做

- 不迁移后端 API 到 React Server Components。
- 不切换 Next.js、Remix 或需要 Node runtime 的框架。
- 不改变知识库数据模型、D1 migration、Durable Object migration tag。
- 不在本阶段实现 PAR-020 重新解析。
- 不添加商业 UI 组件库或第二套设计系统。
