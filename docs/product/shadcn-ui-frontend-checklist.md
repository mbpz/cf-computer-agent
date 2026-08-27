# shadcn/ui 前端迁移 Checklist

> 范围：Cloudflare 免费层、5–20 人私有知识库。每个条目必须独立完成 RED → GREEN → `git diff --check` → commit。

## 基线与规格

- [x] FE-001 冻结 API 路由/响应契约，并建立前端 route contract 测试；证据：`frontend/contracts/routes.ts`、`frontend/contracts/api.ts`、`test/unit/frontend-contract.test.ts`；focused 3 files/78 tests、TypeScript 通过。
- [x] FE-002 冻结 GitHub OAuth、Session Cookie、退出和 same-origin contract 测试；证据：`test/unit/github-oauth.test.ts`、`test/unit/oauth-cookies.test.ts`、`test/unit/frontend-logout.test.ts`、`test/worker/app.test.ts` 覆盖 OAuth/PKCE、Host Cookie、同源 POST、GET 退出 405 与 cookie 清除，相关 Worker/Unit 全量门禁通过。
- [x] FE-003 冻结中英文 locale key/placeholder 基线；证据：`docs/product/shadcn-ui-frontend-i18n-baseline.md` 固化 `en`/`zh-CN` 的 434 keys、55 placeholders、6 文件扫描基线，`npm run test:i18n` 13/13 与 `npm run verify:i18n` 通过。
- [x] FE-004 冻结 Markdown 安全渲染入口与 XSS 回归测试；证据：`docs/product/shadcn-ui-frontend-markdown-security-baseline.md` 固化 `renderSafeMarkdown`、allowlist、协议与降级规则，`markdown-renderer.test.ts`、`html.test.ts`、`frontend-user-read-pages.test.tsx` focused 11/11。
- [x] FE-005 记录当前 `npm run check` 基线和构建资源基线；证据：`docs/product/shadcn-ui-frontend-build-baseline.md` 固化 2026-08-27 的 44 smoke、13 i18n、1153 unit、364 Worker、类型/构建结果与 6 个 React dist 文件。
- [x] FE-006 提交本规格书与迁移清单；证据：`docs/superpowers/specs/2026-08-25-shadcn-ui-frontend-migration.md`、`docs/superpowers/plans/2026-08-25-shadcn-ui-frontend-migration.md` 与本清单均已纳入版本控制，规格书状态已更新为按原子切片持续验收。

## 工具链与构建

- [x] FE-010 安装 React/ReactDOM；证据：`0290c83` 后续工作区，React/Vite 依赖已锁定，`test/unit/frontend-build.test.ts` 2/2、`npm run build:ui`、`npm run typecheck` 通过。
- [x] FE-011 安装 Vite React TypeScript 构建链；证据：`vite.config.ts`、`@vitejs/plugin-react`、`vite` 与 `typescript` lockfile。
- [x] FE-012 安装 Tailwind CSS v4 构建插件；证据：`@tailwindcss/vite` 已接入 Vite。
- [x] FE-013 安装 `clsx`、`tailwind-merge`、`class-variance-authority`；证据：`package.json` 与 lockfile。
- [x] FE-014 初始化 shadcn/ui 配置，锁定源码目录和 alias；证据：`frontend/components.json`。
- [x] FE-015 安装并锁定单一图标族；证据：`@phosphor-icons/react` 与 `iconLibrary: phosphor`。
- [x] FE-016 建立 `frontend/` 目录和入口；证据：`frontend/index.html`、`frontend/main.tsx`。
- [x] FE-017 建立 `npm run build:ui`；证据：Vite 构建输出 `frontend/dist` 成功。
- [x] FE-018 将静态构建产物接入 Wrangler Assets；证据：`wrangler.jsonc` 的 `assets.directory=./frontend/dist`、`npm run build` dry-run 读取 React dist 资产，Worker 绑定校验通过。
- [x] FE-019 增加构建产物 Secret/Token 扫描；证据：`scripts/build-secrets.mjs`、`scripts/build-secrets.test.mjs` 2/2，`npm run build` 在 Wrangler dry-run 前执行 `build:secrets`，真实 `frontend/dist` 扫描通过。

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
- [x] FE-034 实现统一 loading/empty/error/forbidden/degraded 状态；证据：`PageState` 已覆盖管理员与用户页面，FE-034a/034b 的 loading、empty、error、forbidden、degraded 回归均通过，未知值统一降级不输出 `undefined`。
- [x] FE-034a 建立 `PageState` 原子组件并接入管理员审核、资产、审计、成员、空间列表的 empty/error 状态；证据：`frontend/components/ui/page-state.tsx`、`test/unit/frontend-page-state.test.tsx` 5/5，管理员页面回归与全量门禁通过；用户页面 loading/degraded 统一接入仍由 FE-034 主项收口。
- [x] FE-034b 用户页面接入 `PageState`：Home、Knowledge、Search、Agent、Submit、My Submissions 统一 loading/error/empty/degraded 结构；证据：对应 `frontend/pages/*` 与 `frontend-user-read-pages.test.tsx` 7/7，TypeScript 通过；分页/取消由 FE-036a 独立覆盖。
- [x] FE-035 实现 `apiFetch`、错误码和 request-id 显示；证据：`frontend/lib/api.ts`、`frontend/lib/session.ts`、API 测试 8/8。
- [x] FE-036 实现 cursor 分页和 request cancellation；证据：知识库、搜索、我的提交、审核队列、成员与管理员数据层均使用 bounded cursor + AbortController。
- [x] FE-036a 知识库列表接入 20 条 cursor 请求、AbortController 取消旧请求、generation stale-response 防护和重复加载禁用；证据：`frontend/lib/knowledge-data.ts`、`frontend/app.tsx`、`test/unit/frontend-knowledge-data.test.ts` 2/2，用户知识页回归 5/5。
- [x] FE-037 实现 stale mutation owner guard；证据：`createAsyncOwner` 已覆盖读取分页、搜索、Agent、提交列表和管理员列表请求，mutation 保留单项 pending 与过期响应保护。
- [x] FE-037a 抽出 `createAsyncOwner` token 原语并接入审核详情 mutation、知识库分页请求；证据：`frontend/lib/async-owner.ts`、`review-detail-route.tsx`、`knowledge-data.ts`、`frontend-async-owner.test.ts` 2/2，相关数据/审核 focused 回归 8/8。
- [x] FE-038 实现未知路由 404 和参数路由 contract；证据：`frontend/lib/router.ts`、路由测试 2/2；Worker fallback 仍待最终切换阶段。

## 用户页面

- [x] FE-040 重构首页 Dashboard；证据：`frontend/pages/home-page.tsx`，loading/ready/error 三态。
- [x] FE-041 重构知识库列表；证据：`frontend/pages/knowledge-page.tsx`、`knowledge-card.tsx`，空态与 cursor load-more。
- [x] FE-042 重构知识阅读页和安全 Markdown 展示；证据：`knowledge-reader-page.tsx` 接入真实 `/api/knowledge/:id` 当前修订、loading/error/retry/历史修订状态；`knowledge-reader-data.ts` 归一化授权 revision/chunk；`markdown-renderer.ts` 使用 `markdown-it + DOMPurify`，XSS 回归通过。
- [x] FE-043 重构搜索页、过滤器、分页和无结果状态；证据：`frontend/pages/search-page.tsx`、`frontend/app.tsx` 的 SearchRoute 与 bounded result list/degraded 状态。
- [x] FE-043a 封装真实 `/api/knowledge/search` 数据边界：query/cursor bounded、citation href、matchedFields allowlist、degraded 与取消/过期响应保护；证据：`frontend/lib/search-data.ts`、`test/unit/frontend-search-data.test.ts`。
- [x] FE-043b 接入搜索页面真实请求：URL query 同步、结果追加分页、请求取消/过期保护、加载/错误/重试状态；证据：`SearchRoute` 与 `test/unit/frontend-user-read-pages.test.tsx`，完整门禁通过。
- [x] FE-044 重构 Agent 问答页、scope、引用和 confidence；证据：`agent-page.tsx`、`answer-panel.tsx`，5 个页面测试通过。
- [x] FE-044a 接入 `/api/knowledge/chat`：显式 all scope、答案/置信度/引用 allowlist、请求取消与重试；证据：`frontend/lib/agent-data.ts`、`AgentRoute`、`test/unit/frontend-agent-data.test.ts`。
- [x] FE-045 重构知识录入表单和校验错误；证据：`submit-page.tsx`、`submission-form-model.ts`，UTF-8 128 KiB 边界与模式校验测试。
- [x] FE-045a 接入 `/api/submissions`：受控文本/Markdown/code 草稿、默认 `default` 空间、幂等键、成功/校验/API 错误状态；证据：`frontend/lib/submission-data.ts`、`SubmitRoute`、`test/unit/frontend-submission-data.test.ts`。
- [ ] FE-046 重构文件拖拽/选择上传。
- [x] FE-046a 在免费层无 R2 时提供可见但禁用的文件选择边界；证据：`frontend/components/assets/asset-dropzone.tsx`、`asset-upload-model.ts`，覆盖对象存储未启用、文件名和 10 MiB 大小校验；实际二进制上传待 R2 方案重新批准后接入。
- [x] FE-047 展示上传、解析、失败、重试状态；证据：`asset-state.ts` 覆盖 queued/processing/ready/retryable/terminal。
- [ ] FE-048 接入资产解析预览。
- [x] FE-048a 管理员资产队列接入安全解析预览面板；证据：`asset-preview-model.ts`、`asset-preview-panel.tsx`、`admin-assets-data.ts`，通过 `GET /api/admin/assets/:id/preview` 拉取并归一化受限文本、warnings、行数和 parser schema，AbortController/异常 payload fail-closed。
- [x] FE-049 重构我的提交和 resubmit；证据：`my-submissions-page.tsx` 覆盖 needs_revision 与 resubmit 入口。
- [x] FE-049a 接入 `/api/submissions/mine`：owner-scoped opaque cursor、malformed row 过滤、取消/过期响应保护与 load-more 状态；证据：`frontend/lib/my-submissions-data.ts`、`MySubmissionsRoute`、`test/unit/frontend-my-submissions-data.test.ts`。

## 管理员页面

- [x] FE-050 重构管理员 Dashboard；证据：`frontend/pages/admin/admin-dashboard-page.tsx`。
- [x] FE-051 重构审核队列和筛选；证据：`review-queue-page.tsx` 的 bounded queue 状态与 cursor。
- [x] FE-051a 接入 `/api/admin/submissions` 与审核动作：服务端 `review_pending` 筛选、opaque cursor、malformed row 过滤、取消/追加分页；publish/request_changes/reject 均调用真实 API，单项 pending 与错误反馈；证据：`frontend/lib/admin-review-data.ts`、`review-detail-data.ts`、`ReviewQueueRoute`。
- [x] FE-052 重构审核详情、发布、驳回、要求修改；证据：`review-detail-route.tsx` 已接通真实预览与三类审核 mutation，数据边界 7/7、全量门禁通过。
- [x] FE-052a 建立参数化审核详情页与动作边界；证据：`review-detail-model.ts`、`review-detail-page.tsx`、`/admin/submissions/:id` 路由测试 21/21；覆盖 loading/error/preview/publish/request_changes/reject，真实 API mutation 接线待后续数据层切片。
- [x] FE-052b 接通审核详情真实 GET 与审核 mutation；证据：`review-detail-data.ts`、`review-detail-route.tsx`、审核数据边界测试 7/7；覆盖预览归一化、发布、要求修改、驳回、失败提示与 terminal 状态禁用。
- [x] FE-053 重构资产解析队列和 retry；证据：`asset-queue-page.tsx`。
- [x] FE-053a 接入 `/api/admin/assets` 与 retry：资产/任务字段归一化、加载状态、重试后刷新；证据：`frontend/lib/admin-assets-data.ts`、`AdminAssetsRoute`。
- [x] FE-054 重构解析预览、warnings、位置元数据；证据：资产页面 Preview/warnings 展示与 38 个管理员/API/资产测试。
- [x] FE-055 重构成员管理和 disabled 状态；证据：`members-page.tsx` 的 active/disabled 切换。
- [x] FE-055a 接入 `/api/admin/members` 与 PATCH status：服务端脱敏 DTO、opaque cursor、单成员 pending 和状态更新；证据：`frontend/lib/admin-members-data.ts`、`AdminMembersRoute`。
- [x] FE-056 重构 Space/Collection 管理；证据：`spaces-page.tsx`。
- [x] FE-056a 补齐管理员空间/集合 API 并接入真实列表与创建：`GET /api/admin/spaces`、`GET /api/admin/spaces/:id/collections`、`POST /api/admin/spaces`，保留 `space:manage` 授权、slug/name 边界和错误状态；证据：`frontend/lib/admin-spaces-data.ts`、`SpacesPage`、`AdminSpacesRoute`。
- [x] FE-057 重构审计日志和分页；证据：`audit-page.tsx` 的 cursor load-more。
- [x] FE-057a 接入 `/api/admin/audit-events`：脱敏 actor、action/createdAt allowlist、opaque cursor 与取消/追加分页；证据：`frontend/lib/admin-audit-data.ts`、`AdminAuditRoute`。
- [x] FE-058 覆盖 contributor 访问 admin 的 403 状态页；证据：`admin-forbidden-page.tsx` 与页面测试。

## 国际化、可访问性与响应式

- [x] FE-060 所有新文案使用 locale key；证据：管理员 Dashboard、审核队列/详情、资产、成员、空间、审计页面均通过 `frontendText`，管理员中英文渲染测试 8/8、i18n 静态验证通过。
- [x] FE-060a 用户主流程文案接入 React locale runtime；证据：`frontend/lib/i18n.ts`、首页/知识库/搜索/Agent/提交/我的提交页面与 `frontend-locale-pages.test.tsx`，中英文渲染测试 2/2；管理员页面文案仍由 FE-060 收尾。
- [x] FE-061 中英文 key/placeholder 静态验证；证据：`npm run test:i18n` 13/13、`npm run verify:i18n` 通过。
- [x] FE-062 统一 button/link/input accessible name；证据：`frontend-a11y.test.tsx` 2/2 覆盖 skip link、landmarks、language、form label。
- [x] FE-063 Dialog/Sheet 焦点捕获、Escape、恢复焦点；证据：`focus-scope.tsx` 为两类 modal 提供首焦点、Tab 循环、Escape 回调和卸载恢复，Dialog/Sheet 关闭时不输出 `aria-modal`，`frontend-focus-scope.test.tsx` 15/15（含 closed-state 回归）。
- [x] FE-063a 增加可复用 focus scope：打开时聚焦首个可聚焦元素、Tab/Shift+Tab 循环、Escape 回调关闭、卸载恢复触发点；证据：`frontend/components/ui/focus-scope.tsx`、Dialog/Sheet data-focus-scope 标记与 `test/unit/frontend-focus-scope.test.tsx` 6/6。移动 Shell 的原生 details 打开状态接线仍由 FE-063 主项收口。
- [x] FE-063b 接通移动导航的 controlled open、Sheet focus scope、Escape/关闭按钮与路由切换关闭；关闭时不输出 `role=dialog`/`aria-modal`，并新增 Sheet closed-state 回归。
- [x] FE-064 键盘完成导航、菜单、Tabs、表单和分页；证据：Shell 原生导航与移动 Sheet focus scope、Dropdown menu 6/6、Tabs 8/8、Pagination 3/3、Submit form/a11y 6/6；cursor 页面保留 Load more，不把 opaque cursor 转成页码。
- [x] FE-064a 顶栏 Dropdown 接入 menu/menuitem 语义与 Escape、Home/End、Arrow 上下键盘动作；证据：`frontend/lib/menu-keyboard.ts`、`frontend/components/ui/dropdown-menu.tsx`、`test/unit/frontend-menu-keyboard.test.tsx` 6/6，Shell 回归 6/6；Tabs、表单和分页的全局矩阵仍由 FE-064 主项收口。
- [x] FE-064b 新增 Tabs 原语：`tablist/tab/tabpanel` 语义、受控/非受控值、roving tabindex、方向键与 Home/End；证据：`frontend/components/ui/tabs.tsx`、`frontend/lib/tabs-keyboard.ts`、`test/unit/frontend-tabs.test.tsx`。
- [x] FE-064c 新增 bounded Pagination 原语，提供 `aria-current=page`、Previous/Next disabled 边界和 page-count 上限；证据：`frontend/components/ui/pagination.tsx`、`test/unit/frontend-pagination.test.tsx`。opaque cursor 页面继续使用 Load more，不虚构页码。
- [x] FE-064d Submit 页面使用原生 `<form>`、`type=submit`、`aria-describedby`/`aria-busy` 和 pending 禁用边界；证据：`frontend/pages/submit-page.tsx` 与 `frontend-submit-pages.test.tsx`。
- [x] FE-065 验证 WCAG AA 对比度和 focus-visible；证据：`scripts/wcag-contract.mjs` 解析 light/dark OKLCH token 并验证正文组合 >=4.5:1，`globals.css` 的 2px `:focus-visible` ring，`scripts/wcag-contract.test.mjs` 1/1，已纳入 `npm test`；同时收紧浅色 primary/muted/destructive 与暗色 accent token。
- [x] FE-066 验证 320px、768px、1280px 布局；证据：`responsive-contract.ts` 与响应式测试 2/2。
- [x] FE-067 验证 reduced motion 和无鼠标操作；证据：`globals.css` reduced-motion 规则与 focus restoration 测试。

## 切换、清理与发布

- [x] FE-070 新旧路由矩阵逐页对照；证据：`frontend/cutover-contract.ts`、路由矩阵测试 2/2，旧 Worker Shell 回归 28/28。
- [x] FE-071 API/权限/OAuth/Session 回归；证据：`auth-boundary.ts`、API 401/403 结构化错误、Session payload 校验、contributor direct-admin 403 测试、`scripts/frontend-app-contract.test.mjs`（匿名 401 分支确保 `LoginPage` import 存在）；OAuth upstream 仍由 Worker 端到端回归负责。
- [x] FE-072 Markdown XSS、undefined/null 和错误脱敏回归；证据：Markdown 安全测试 3/3、React 页面安全回归 18/18、结构化错误不携带 body；`test/worker/assets.test.ts` 固定 Cloudflare Web Analytics beacon 的 `script-src`/`connect-src` CSP 允许列表。
- [x] FE-073 更新 Worker 静态资源测试和构建检查；证据：`frontend/asset-manifest.ts`、Vite `manifest.json` 输出、manifest 测试 2/2；当前 Worker Assets 入口保持旧 `public/` 以便回滚。
- [x] FE-074 新 UI 全部路由通过后再切换 Wrangler Assets 入口；证据：`wrangler.jsonc` 已切到 `frontend/dist`，React Assets Worker 回归 16/16，完整 Worker 回归 298/298。
- [ ] FE-075 删除旧 vanilla UI 文件和旧样式。
- [x] FE-075a 删除前置审计：构建时保留 `public/app.js`、`workspace-ui.js`、`navigation.js`、`styles.css` 作为回滚源，并拒绝 React 源码/产物引用这些入口；证据：`scripts/frontend-legacy-audit.mjs`、`scripts/frontend-legacy-audit.test.mjs`、`npm run build:legacy-audit`。
- [x] FE-076 更新 README/ROADMAP/运维文档；证据：`README.md`、`docs/operations/react-frontend-cutover.md`，明确 React Assets、回滚和旧 UI 清理边界。
- [x] FE-077 运行完整 `npm run check` 和 `npm run build:ui`；证据：完整 `npm run check` 通过，Wrangler dry-run 读取 5 个 React 资产文件。
- [x] FE-078 提交迁移 release commit；证据：`340fefe`（隐私统计、双 provider 登录与 React/shadcn 迁移后的完整 release commit），提交前已通过 `npm run check`、`npm run build:ui`、`git diff --check`。
- [x] FE-079 暂停的 PAR-020 重新解析重新排期；证据：`docs/product/par-020-replan.md` 固化前置条件、M2 原子顺序和“不覆盖已发布 Revision”的验收边界；解析实现仍保留在 M2 清单。

## 工作台二期：统计、菜单树与个人菜单

- [x] FE-080 GitHub 重新授权：授权 URL 固定 `prompt=select_account`，退出后旧 D1 会话删除、Cookie 清除并由 `/api/session` 复核 401；会话 Cookie 上限 7 天。
- [x] FE-081 细粒度站点统计：D1 `0030_site_analytics_dimensions.sql` 增加脱敏 IP、国家/地区/城市、colo、UA 和时间字段；管理员接口返回趋势、页面/地区排行与最近访客。
- [x] FE-082 统计工作台 UI：使用 shadcn Card/Button 与原生可访问表格渲染趋势柱图、排行条和访客明细；匿名/登录用户区分，所有字段有安全 fallback。
- [x] FE-083 菜单层级迁移：D1 `0031_workspace_menu_hierarchy.sql` 将搜索与 AI 助手归入知识库，并将成员/角色/菜单/空间/审计/统计归入治理节点；树深度由 Worker 限制为最多 4 层。
- [x] FE-084 工作区导航：AI 知识库作为一级节点、检索/助手为二级节点，管理为独立一级节点并支持展开/收起、权限过滤和移动端平铺导航。
- [x] FE-085 个人菜单：右上角展示 Logo/头像/邮箱/角色，提供设置入口、退出和 light/dark/system 主题切换，主题偏好写入本地存储。
- [ ] FE-086 生产应用 0030/0031：执行备份、远程 D1 migration、版本上传、部署和统计/菜单 smoke；完成后补充生产 request ID 与 migration ledger 证据。
