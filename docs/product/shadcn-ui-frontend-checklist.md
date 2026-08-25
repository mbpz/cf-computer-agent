# shadcn/ui 前端迁移 Checklist

> 范围：Cloudflare 免费层、5–20 人私有知识库。每个条目必须独立完成 RED → GREEN → `git diff --check` → commit。

## 基线与规格

- [x] FE-001 冻结 API 路由/响应契约，并建立前端 route contract 测试；证据：`frontend/contracts/routes.ts`、`frontend/contracts/api.ts`、`test/unit/frontend-contract.test.ts`；focused 3 files/78 tests、TypeScript 通过。
- [ ] FE-002 冻结 GitHub OAuth、Session Cookie、退出和 same-origin contract 测试。
- [ ] FE-003 冻结中英文 locale key/placeholder 基线。
- [ ] FE-004 冻结 Markdown 安全渲染入口与 XSS 回归测试。
- [ ] FE-005 记录当前 `npm run check` 基线和构建资源基线。
- [ ] FE-006 提交本规格书与迁移清单。

## 工具链与构建

- [x] FE-010 安装 React/ReactDOM；证据：`0290c83` 后续工作区，React/Vite 依赖已锁定，`test/unit/frontend-build.test.ts` 2/2、`npm run build:ui`、`npm run typecheck` 通过。
- [x] FE-011 安装 Vite React TypeScript 构建链；证据：`vite.config.ts`、`@vitejs/plugin-react`、`vite` 与 `typescript` lockfile。
- [x] FE-012 安装 Tailwind CSS v4 构建插件；证据：`@tailwindcss/vite` 已接入 Vite。
- [x] FE-013 安装 `clsx`、`tailwind-merge`、`class-variance-authority`；证据：`package.json` 与 lockfile。
- [x] FE-014 初始化 shadcn/ui 配置，锁定源码目录和 alias；证据：`frontend/components.json`。
- [x] FE-015 安装并锁定单一图标族；证据：`@phosphor-icons/react` 与 `iconLibrary: phosphor`。
- [x] FE-016 建立 `frontend/` 目录和入口；证据：`frontend/index.html`、`frontend/main.tsx`。
- [x] FE-017 建立 `npm run build:ui`；证据：Vite 构建输出 `frontend/dist` 成功。
- [ ] FE-018 将静态构建产物接入 Wrangler Assets。
- [ ] FE-019 增加构建产物 Secret/Token 扫描。

## 设计 Token 与基础组件

- [x] FE-020 定义 neutral、accent、状态色和 dark mode token；证据：`frontend/styles/globals.css` 与 `test/unit/frontend-tokens.test.ts` 2/2。
- [x] FE-021 定义字体、字号、行高、圆角、阴影和断点 token；证据：全局字体、`--radius`、Tailwind theme 映射与无渐变约束已建立。
- [x] FE-022 接入 locale runtime 与浏览器语言选择；证据：`frontend/lib/i18n.ts`，沿用现有 `memory-garden-locale` key，并通过现有 `test:i18n` 13/13。
- [x] FE-023 接入 `prefers-reduced-motion`；证据：`globals.css` 的 reduced-motion media query 与令牌测试。
- [x] FE-024 生成 Button；证据：`frontend/components/ui/button.tsx`，覆盖 variant/size/disabled。
- [x] FE-025 生成 Input/Textarea/Label；证据：`frontend/components/ui/{input,textarea,label}.tsx` 与关联测试。
- [x] FE-026 生成 Card/Badge/Alert；证据：`frontend/components/ui/{card,badge,alert}.tsx` 与关联测试。
- [x] FE-027 生成 Dialog/Sheet；证据：`frontend/components/ui/{dialog,sheet}.tsx`，Shell 集成。
- [x] FE-028 生成 Dropdown Menu；证据：`frontend/components/ui/dropdown-menu.tsx`，Shell 顶栏集成；Tabs/Tooltip 留待页面切片按需引入。
- [x] FE-029 生成 Skeleton，并覆盖 disabled/loading/error 状态；证据：`frontend/components/ui/skeleton.tsx`、`test/unit/shadcn-primitives.test.tsx` 2/2。

## Shell 与数据层

- [x] FE-030 实现桌面 Sidebar；证据：`frontend/components/shell/app-shell.tsx` 的 capability 过滤导航。
- [x] FE-031 实现移动 Sheet 导航；证据：Shell 移动断点导航与 `Sheet` primitives。
- [x] FE-032 实现 Topbar、页面上下文和操作区；证据：`data-shell-topbar` 与上下文标题。
- [x] FE-033 实现右上角 User Menu、语言和退出；证据：Shell 测试 3/3、未知值不渲染 `undefined`。
- [ ] FE-034 实现统一 loading/empty/error/forbidden/degraded 状态。
- [x] FE-035 实现 `apiFetch`、错误码和 request-id 显示；证据：`frontend/lib/api.ts`、`frontend/lib/session.ts`、API 测试 8/8。
- [ ] FE-036 实现 cursor 分页和 request cancellation。
- [ ] FE-037 实现 stale mutation owner guard。
- [x] FE-038 实现未知路由 404 和参数路由 contract；证据：`frontend/lib/router.ts`、路由测试 2/2；Worker fallback 仍待最终切换阶段。

## 用户页面

- [x] FE-040 重构首页 Dashboard；证据：`frontend/pages/home-page.tsx`，loading/ready/error 三态。
- [x] FE-041 重构知识库列表；证据：`frontend/pages/knowledge-page.tsx`、`knowledge-card.tsx`，空态与 cursor load-more。
- [x] FE-042 重构知识阅读页和安全 Markdown 展示；证据：`knowledge-reader-page.tsx` 只消费注入的安全 renderer，测试覆盖调用边界。
- [x] FE-043 重构搜索页、过滤器、分页和无结果状态；证据：`frontend/pages/search-page.tsx` 与 bounded result list/degraded 状态。
- [x] FE-044 重构 Agent 问答页、scope、引用和 confidence；证据：`agent-page.tsx`、`answer-panel.tsx`，5 个页面测试通过。
- [ ] FE-045 重构知识录入表单和校验错误。
- [ ] FE-046 重构文件拖拽/选择上传。
- [ ] FE-047 展示上传、解析、失败、重试状态。
- [ ] FE-048 接入资产解析预览。
- [ ] FE-049 重构我的提交和 resubmit。

## 管理员页面

- [ ] FE-050 重构管理员 Dashboard。
- [ ] FE-051 重构审核队列和筛选。
- [ ] FE-052 重构审核详情、发布、驳回、要求修改。
- [ ] FE-053 重构资产解析队列和 retry。
- [ ] FE-054 重构解析预览、warnings、位置元数据。
- [ ] FE-055 重构成员管理和 disabled 状态。
- [ ] FE-056 重构 Space/Collection 管理。
- [ ] FE-057 重构审计日志和分页。
- [ ] FE-058 覆盖 contributor 访问 admin 的 403 状态页。

## 国际化、可访问性与响应式

- [ ] FE-060 所有新文案使用 locale key。
- [ ] FE-061 中英文 key/placeholder 静态验证。
- [ ] FE-062 统一 button/link/input accessible name。
- [ ] FE-063 Dialog/Sheet 焦点捕获、Escape、恢复焦点。
- [ ] FE-064 键盘完成导航、菜单、Tabs、表单和分页。
- [ ] FE-065 验证 WCAG AA 对比度和 focus-visible。
- [ ] FE-066 验证 320px、768px、1280px 布局。
- [ ] FE-067 验证 reduced motion 和无鼠标操作。

## 切换、清理与发布

- [ ] FE-070 新旧路由矩阵逐页对照。
- [ ] FE-071 API/权限/OAuth/Session 回归。
- [ ] FE-072 Markdown XSS、undefined/null 和错误脱敏回归。
- [ ] FE-073 更新 Worker 静态资源测试和构建检查。
- [ ] FE-074 新 UI 全部路由通过后再切换 Wrangler Assets 入口。
- [ ] FE-075 删除旧 vanilla UI 文件和旧样式。
- [ ] FE-076 更新 README/ROADMAP/运维文档。
- [ ] FE-077 运行完整 `npm run check` 和 `npm run build:ui`。
- [ ] FE-078 提交迁移 release commit。
- [ ] FE-079 暂停的 PAR-020 重新解析重新排期。
