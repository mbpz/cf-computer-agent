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

- [ ] FE-010 安装 React/ReactDOM。
- [ ] FE-011 安装 Vite React TypeScript 构建链。
- [ ] FE-012 安装 Tailwind CSS v4 构建插件。
- [ ] FE-013 安装 `clsx`、`tailwind-merge`、`class-variance-authority`。
- [ ] FE-014 初始化 shadcn/ui 配置，锁定源码目录和 alias。
- [ ] FE-015 安装并锁定单一图标族。
- [ ] FE-016 建立 `frontend/` 目录和入口。
- [ ] FE-017 建立 `npm run build:ui`。
- [ ] FE-018 将静态构建产物接入 Wrangler Assets。
- [ ] FE-019 增加构建产物 Secret/Token 扫描。

## 设计 Token 与基础组件

- [ ] FE-020 定义 neutral、accent、状态色和 dark mode token。
- [ ] FE-021 定义字体、字号、行高、圆角、阴影和断点 token。
- [ ] FE-022 接入现有 locale runtime 与浏览器语言选择。
- [ ] FE-023 接入 `prefers-reduced-motion`。
- [ ] FE-024 生成 Button。
- [ ] FE-025 生成 Input/Textarea/Label。
- [ ] FE-026 生成 Card/Badge/Alert。
- [ ] FE-027 生成 Dialog/Sheet。
- [ ] FE-028 生成 Dropdown Menu/Tabs/Tooltip。
- [ ] FE-029 生成 Skeleton/Toast，并覆盖 disabled/loading/error 状态。

## Shell 与数据层

- [ ] FE-030 实现桌面 Sidebar。
- [ ] FE-031 实现移动 Sheet 导航。
- [ ] FE-032 实现 Topbar、面包屑和页面操作区。
- [ ] FE-033 实现右上角 User Menu、语言和退出。
- [ ] FE-034 实现统一 loading/empty/error/forbidden/degraded 状态。
- [ ] FE-035 实现 `apiFetch`、错误码和 request-id 显示。
- [ ] FE-036 实现 cursor 分页和 request cancellation。
- [ ] FE-037 实现 stale mutation owner guard。
- [ ] FE-038 实现未知路由 404 和已知 SPA fallback contract。

## 用户页面

- [ ] FE-040 重构首页 Dashboard。
- [ ] FE-041 重构知识库列表。
- [ ] FE-042 重构知识阅读页和安全 Markdown 展示。
- [ ] FE-043 重构搜索页、过滤器、分页和无结果状态。
- [ ] FE-044 重构 Agent 问答页、scope、引用和 confidence。
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
