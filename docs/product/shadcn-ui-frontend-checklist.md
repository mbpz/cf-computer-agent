# shadcn/ui 前端交付 Checklist

> 范围：Cloudflare 免费层、5–20 人私有知识库。每个条目必须独立完成 RED → GREEN → `git diff --check` → commit。

本清单只拥有：组件、路由、交互状态、响应式行为、可访问性与前端发布接线。不拥有后端实现、数据模型、migration、生产发布或 signed browser 验收状态。复选框仅表示“前端实现 + 本地/UI 合同验证”完成；对应后端与路由是否 ready 必须同时由[交付状态总账](./delivery-status-ledger.md)和共享 route registry 证明。实现、验证、发布、验收四维状态只以总账为准。

## 当前前端交付映射

以下结论只同步已由源码和本地 UI contract 验证的 frontend slice；即使某项前端工作已验证，对应总账行的后端、发布或验收仍可为 `partial`/`pending`。

- **shadcn Shell 与组件原语：已验证。** Sidebar、Sheet、Topbar、菜单、PageState、Tooltip portal 和键盘/焦点合同映射 `WB-001`、`WB-002`、`WB-A11Y`；证据：`frontend/components/shell/app-shell.tsx`、`frontend/components/ui/tooltip.tsx`；命令：`rtk npx vitest run test/unit/frontend-shell.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-menu-keyboard.test.tsx` 与 `rtk npm run verify:wcag`。
- **独立滚动与紧凑响应式布局：已验证。** 桌面 sidebar/content 独立滚动、移动导航 viewport 和 320/768/1280 布局映射 `WB-SCROLL`、`WB-A11Y`；证据：`frontend/components/shell/app-shell.tsx`；命令：`rtk npx vitest run test/unit/frontend-shell.test.tsx test/unit/frontend-responsive.test.tsx test/unit/frontend-a11y.test.tsx`。
- **本地化完整数字分页与 URL/history：已验证。** Knowledge、Search、My Submissions、任务、看板、通知、审核、重复候选、资产、成员、审计、统计均使用 locale-backed shared pagination；numbered surfaces 使用 `page`/`pageSize`、`total`/`totalPages`，Messages 使用服务端稳定 cursor，并保持 URL/popstate、页长重置与 stale cancellation。映射 `WB-PAGE`、`TSK-006`、`BRD-004`、`NTF-003`、`MSG-002`、`ADM-002`、`ADM-003`、`ADM-004`、`ADM-005`、`ADM-009`、`ADM-010`。
- **私有任务页面与 mutation 恢复：已验证 frontend slice。** 任务筛选、分页、创建/状态/进度/标签/关联、删除、过期响应保护和失败重试映射 `TSK-002`、`TSK-005`、`TSK-006`、`TSK-007`，并依赖后端 `TSK-001`；命令：`rtk npx vitest run test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-page.test.tsx test/unit/frontend-tasks-route.test.tsx`。当前总账记录本地实现/验证 done，但任何任务发布或验收状态均未因此改变。
- **协作 route capability registry：已验证。** `shared/workspace-route-capabilities.ts` 将 `/tasks`、`/boards`、`/notifications`、`/messages` 统一为本地 `ready`，stale server tree 不能移除必需入口，`workspace.tasks` 继续保护 Tasks/Boards；ready 只证明可执行 API/UI vertical，不证明 main 集成、发布或验收。
- **管理员页面：已验证 frontend slice。** Dashboard/拒绝页、审核、重复候选、资产、成员、角色、菜单、Space/Collection、审计和 analytics 页面分别映射 `ADM-001`、`ADM-002`、`ADM-003`、`ADM-004`、`ADM-005`、`ADM-006`、`ADM-007`、`ADM-008`、`ADM-009`、`ADM-010`、`ADM-011`；命令：`rtk npx vitest run test/unit/frontend-admin-pages.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-admin-analytics-route.test.tsx`。analytics 为 `ADM-010`；signed browser 仍由 `ADM-011` 和总账验收维度收口。

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
- [x] FE-028 生成 Dropdown Menu；证据：`frontend/components/ui/dropdown-menu.tsx`，Shell 顶栏集成。
- [x] FE-028a 接入真实 Tooltip portal、hover/focus 打开、Escape 关闭和可访问角色；证据：`frontend/components/ui/tooltip.tsx`、`frontend/components/shell/app-shell.tsx`、`test/unit/frontend-menu-keyboard.test.tsx`；总账映射：`WB-A11Y`。
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
- [x] FE-036 实现统一完整数字分页和 request cancellation；证据：知识库、搜索、我的提交、任务、审核队列、重复候选、资产、成员、审计与统计均使用 bounded `page`/`pageSize`、`total`/`totalPages`、URL/history 恢复和 AbortController；总账映射：`WB-PAGE`。
- [x] FE-036a 知识库列表接入完整数字分页、AbortController 取消旧请求、generation stale-response 防护和同页重复加载禁用；证据：`frontend/lib/knowledge-data.ts`、`frontend/app.tsx`、`test/unit/frontend-knowledge-data.test.ts`、`test/unit/frontend-reader-pagination-routes.test.tsx`。
- [x] FE-037 实现 stale mutation owner guard；证据：`createAsyncOwner` 已覆盖读取分页、搜索、Agent、提交列表和管理员列表请求，mutation 保留单项 pending 与过期响应保护。
- [x] FE-037a 抽出 `createAsyncOwner` token 原语并接入审核详情 mutation、知识库分页请求；证据：`frontend/lib/async-owner.ts`、`review-detail-route.tsx`、`knowledge-data.ts`、`frontend-async-owner.test.ts` 2/2，相关数据/审核 focused 回归 8/8。
- [x] FE-038 实现共享 route capability registry、ready/coming-soon 分流、未知路由 404 和参数路由 contract；证据：`shared/workspace-route-capabilities.ts`、`frontend/lib/router.ts`、`test/unit/frontend-app-routes.test.ts`、`scripts/delivery-status-contract.test.mjs`；总账映射：`WB-002`、`ADM-007`。`/tasks`、`/boards`、`/notifications`、`/messages` 已具备本地可执行页面；该 `ready` 结论不代表 main 集成、发布或验收完成。

## 用户页面

- [x] FE-040 重构首页 Dashboard；证据：`frontend/pages/home-page.tsx`，loading/ready/error 三态。
- [x] FE-041 重构知识库列表；证据：`frontend/pages/knowledge-page.tsx`、`knowledge-card.tsx`，覆盖空态与完整数字分页。
- [x] FE-042 重构知识阅读页和安全 Markdown 展示；证据：`knowledge-reader-page.tsx` 接入真实 `/api/knowledge/:id` 当前修订、loading/error/retry/历史修订状态；`knowledge-reader-data.ts` 归一化授权 revision/chunk；`markdown-renderer.ts` 使用 `markdown-it + DOMPurify`，XSS 回归通过。
- [x] FE-043 重构搜索页、过滤器、完整数字分页和无结果状态；证据：`frontend/pages/search-page.tsx`、`frontend/app.tsx` 的 SearchRoute 与 bounded result list/degraded 状态。
- [x] FE-043a 封装真实 `/api/knowledge/search` 数据边界：query/page/pageSize bounded、citation href、matchedFields allowlist、完整 pagination metadata、degraded 与取消/过期响应保护；证据：`frontend/lib/search-data.ts`、`test/unit/frontend-search-data.test.ts`。
- [x] FE-043b 接入搜索页面真实请求：URL query/page/pageSize 同步、popstate 恢复、请求取消/过期保护、加载/错误/重试状态；证据：`SearchRoute`、`test/unit/frontend-user-read-pages.test.tsx`、`test/unit/frontend-reader-pagination-routes.test.tsx`。
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
- [x] FE-049a 接入 `/api/submissions/mine`：owner-scoped 完整数字分页、malformed row 过滤、URL/history 恢复与取消/过期响应保护；证据：`frontend/lib/my-submissions-data.ts`、`MySubmissionsRoute`、`test/unit/frontend-my-submissions-data.test.ts`、`test/unit/frontend-reader-pagination-routes.test.tsx`。

## 管理员页面

- [x] FE-050 重构管理员 Dashboard；证据：`frontend/pages/admin/admin-dashboard-page.tsx`。
- [x] FE-051 重构审核队列和筛选；证据：`review-queue-page.tsx` 的 bounded queue 状态与完整数字分页。
- [x] FE-051a 接入 `/api/admin/submissions` 与审核动作：服务端 `review_pending` 筛选、page/pageSize、malformed row 过滤、URL/history 恢复与取消保护；publish/request_changes/reject 均调用真实 API，单项 pending 与错误反馈；证据：`frontend/lib/admin-review-data.ts`、`review-detail-data.ts`、`ReviewQueueRoute`、`test/unit/frontend-moderation-pagination-routes.test.tsx`。
- [x] FE-052 重构审核详情、发布、驳回、要求修改；证据：`review-detail-route.tsx` 已接通真实预览与三类审核 mutation，数据边界 7/7、全量门禁通过。
- [x] FE-052a 建立参数化审核详情页与动作边界；证据：`review-detail-model.ts`、`review-detail-page.tsx`、`/admin/submissions/:id` 路由测试 21/21；覆盖 loading/error/preview/publish/request_changes/reject，真实 API mutation 接线待后续数据层切片。
- [x] FE-052b 接通审核详情真实 GET 与审核 mutation；证据：`review-detail-data.ts`、`review-detail-route.tsx`、审核数据边界测试 7/7；覆盖预览归一化、发布、要求修改、驳回、失败提示与 terminal 状态禁用。
- [x] FE-053 重构资产解析队列和 retry；证据：`asset-queue-page.tsx`。
- [x] FE-053a 接入 `/api/admin/assets` 与 retry：资产/任务字段归一化、加载状态、重试后刷新；证据：`frontend/lib/admin-assets-data.ts`、`AdminAssetsRoute`。
- [x] FE-054 重构解析预览、warnings、位置元数据；证据：资产页面 Preview/warnings 展示与 38 个管理员/API/资产测试。
- [x] FE-055 重构成员管理和 disabled 状态；证据：`members-page.tsx` 的 active/disabled 切换。
- [x] FE-055a 接入 `/api/admin/members` 与 PATCH status：服务端脱敏 DTO、完整数字分页、URL/history 恢复、单成员 pending 和状态更新；证据：`frontend/lib/admin-members-data.ts`、`AdminMembersRoute`、`test/unit/frontend-admin-pagination-routes.test.tsx`。
- [x] FE-056 重构 Space/Collection 管理；证据：`spaces-page.tsx`。
- [x] FE-056a 补齐管理员空间/集合 API 并接入真实列表与创建：`GET /api/admin/spaces`、`GET /api/admin/spaces/:id/collections`、`POST /api/admin/spaces`，保留 `space:manage` 授权、slug/name 边界和错误状态；证据：`frontend/lib/admin-spaces-data.ts`、`SpacesPage`、`AdminSpacesRoute`。
- [x] FE-057 重构审计日志和完整数字分页；证据：`audit-page.tsx`、`test/unit/frontend-admin-pages.test.tsx`。
- [x] FE-057a 接入 `/api/admin/audit-events`：脱敏 actor、action/createdAt allowlist、page/pageSize、URL/history 恢复与取消保护；证据：`frontend/lib/admin-audit-data.ts`、`AdminAuditRoute`、`test/unit/frontend-admin-pagination-routes.test.tsx`。
- [x] FE-058 覆盖 contributor 访问 admin 的 403 状态页；证据：`admin-forbidden-page.tsx` 与页面测试。

## 国际化、可访问性与响应式

- [x] FE-060 所有新文案使用 locale key；证据：管理员 Dashboard、审核队列/详情、资产、成员、空间、审计页面均通过 `frontendText`，管理员中英文渲染测试 8/8、i18n 静态验证通过。
- [x] FE-060a 用户主流程文案接入 React locale runtime；证据：`frontend/lib/i18n.ts`、首页/知识库/搜索/Agent/提交/我的提交页面与 `frontend-locale-pages.test.tsx`，中英文渲染测试 2/2；管理员页面文案仍由 FE-060 收尾。
- [x] FE-061 中英文 key/placeholder 静态验证；证据：`npm run test:i18n` 13/13、`npm run verify:i18n` 通过。
- [x] FE-062 统一 button/link/input accessible name；证据：`frontend-a11y.test.tsx` 2/2 覆盖 skip link、landmarks、language、form label。
- [x] FE-063 Dialog/Sheet 焦点捕获、Escape、恢复焦点；证据：`focus-scope.tsx` 为两类 modal 提供首焦点、Tab 循环、Escape 回调和卸载恢复，Dialog/Sheet 关闭时不输出 `aria-modal`，`frontend-focus-scope.test.tsx` 15/15（含 closed-state 回归）。
- [x] FE-063a 增加可复用 focus scope：打开时聚焦首个可聚焦元素、Tab/Shift+Tab 循环、Escape 回调关闭、卸载恢复触发点；证据：`frontend/components/ui/focus-scope.tsx`、Dialog/Sheet data-focus-scope 标记与 `test/unit/frontend-focus-scope.test.tsx` 6/6。移动 Shell 的原生 details 打开状态接线仍由 FE-063 主项收口。
- [x] FE-063b 接通移动导航的 controlled open、Sheet focus scope、Escape/关闭按钮与路由切换关闭；关闭时不输出 `role=dialog`/`aria-modal`，并新增 Sheet closed-state 回归。
- [x] FE-064 键盘完成导航、菜单、Tabs、表单和分页；证据：Shell 原生导航与移动 Sheet focus scope、Dropdown、Tabs、Submit form/a11y 与完整数字分页 focused contract 通过。
- [x] FE-064a 顶栏 Dropdown 接入 menu/menuitem 语义与 Escape、Home/End、Arrow 上下键盘动作；证据：`frontend/lib/menu-keyboard.ts`、`frontend/components/ui/dropdown-menu.tsx`、`test/unit/frontend-menu-keyboard.test.tsx` 6/6，Shell 回归 6/6；Tabs、表单和分页的全局矩阵仍由 FE-064 主项收口。
- [x] FE-064b 新增 Tabs 原语：`tablist/tab/tabpanel` 语义、受控/非受控值、roving tabindex、方向键与 Home/End；证据：`frontend/components/ui/tabs.tsx`、`frontend/lib/tabs-keyboard.ts`、`test/unit/frontend-tabs.test.tsx`。
- [x] FE-064c 新增 bounded Pagination/DataPagination 原语，提供 `aria-current=page`、Previous/Next disabled 边界、紧凑页码窗口、移动端摘要和 page-count 上限；证据：`frontend/components/ui/pagination.tsx`、`frontend/components/data-pagination.tsx`、`test/unit/frontend-pagination.test.tsx`；总账映射：`WB-PAGE`、`WB-A11Y`。
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

- [x] FE-080 GitHub 重新授权前端旅程：重新授权入口传递 `prompt=select_account`，退出 UI 清除本地登录态并复核 `/api/session` 401；证据：前端 OAuth/logout tests；总账映射：`WB-SETTINGS`。D1 Session 删除、Cookie 合同和生产旅程归总账 `IDN-003`，不由本勾选框证明。
- [x] FE-081 细粒度站点统计前端 slice：管理员接口 DTO 的趋势、页面/地区排行与最近访客均有安全 fallback；证据：`frontend/lib/admin-analytics-data.ts`、`test/unit/frontend-admin-analytics-data.test.ts`；总账映射：`ADM-010`。`0030_site_analytics_dimensions.sql` 与后端去重状态不由本勾选框证明。
- [x] FE-082 统计工作台 UI：使用 shadcn Card/Button 与原生可访问表格渲染趋势柱图、排行条和访客明细；匿名/登录用户区分，所有字段有安全 fallback。
- [x] FE-083 菜单层级 frontend rendering：搜索/助手归入知识库，成员/角色/菜单/空间/审计/统计归入治理节点，最多四层均可渲染；证据：`frontend/components/shell/app-shell.tsx`、Shell tests；总账映射：`WB-002`、`ADM-007`。`0031_workspace_menu_hierarchy.sql` 与服务端约束归总账。
- [x] FE-084 工作区导航：AI 知识库作为一级节点、检索/助手为二级节点，管理为独立一级节点并支持展开/收起、权限过滤和移动端平铺导航；frontend 消费 `/api/navigation`，失败才回退静态 registry；总账映射：`WB-002`、`ADM-007`。server-owned availability 是否已发布以总账为准。
- [x] FE-085 账户区：桌面 Sidebar 底部与移动 Sheet 展示身份/邮箱/角色，提供设置、退出和 light/dark/system 主题切换及 pending/error feedback；顶栏只保留语言，主题偏好写入本地存储。
- [x] FE-085a 角色成员分配 frontend slice：角色页展示已分配成员 ID，并通过 shadcn Input/Button 调用管理员分配/移除接口；系统角色保持只读，失败状态有本地化提示；总账映射：`ADM-006`。后端 mutation、审计与生产角色验收不由本勾选框证明。
- [ ] FE-086 current-main frontend Assets release wiring 与 analytics/menu signed browser smoke；前置总账：`WB-002`、`ADM-007`、`ADM-010`、`ADM-011`。远程 D1 migration、Worker deploy、流量切换与后端 smoke 不属于本清单，状态回到[交付状态总账](./delivery-status-ledger.md)。
- [x] FE-087 私有任务页面 frontend slice：筛选与完整数字分页同步 URL/history，创建使用客户端幂等键，删除 404 视为已完成，mutation 后刷新不会覆盖新查询，失败保留当前列表并可重试；证据：`frontend/pages/tasks/tasks-page.tsx`、`frontend/lib/tasks-data.ts`、`test/unit/frontend-tasks-data.test.ts`、`test/unit/frontend-tasks-page.test.tsx`、`test/unit/frontend-tasks-route.test.tsx`；总账映射：`TSK-002`、`TSK-005`、`TSK-006`、`TSK-007`，后端依赖 `TSK-001`。本勾选框不改变任何发布/验收状态。

## 工作台协作前端（R2）

前六个 atom 已完成前端实现与本地/UI 合同验证；`FE-ACC-001` 仍 pending。每行的“后端总账依赖”用于对账，不代表本清单拥有后端、migration、发布或验收状态。

- [x] `FE-NTF-001` 通知收件箱、未读过滤/计数、完整数字分页以及 empty/error/loading 状态；前端映射：`NTF-003`、`NTF-004`、`WB-PAGE`、`WB-A11Y`；后端总账依赖：[NTF-001、NTF-002、NTF-003](./delivery-status-ledger.md)。
- [x] `FE-NTF-002` 通知目标导航、目标失效反馈以及可重试且幂等的 read-state UI；前端映射：`NTF-004`；后端总账依赖：[NTF-002、NTF-003、NTF-005](./delivery-status-ledger.md)。
- [x] `FE-BRD-001` task-backed board columns、filters 与紧凑响应式布局，不复制第二套任务权威数据；前端映射：`BRD-005`、`WB-A11Y`；后端总账依赖：[TSK-001、BRD-001、BRD-003、BRD-004](./delivery-status-ledger.md)。
- [x] `FE-BRD-002` 键盘可访问的状态移动、optimistic feedback、并发失败提示与精确 rollback；拖拽不是正确性前提；前端映射：`BRD-005`、`WB-A11Y`；后端总账依赖：[BRD-002、BRD-004、BRD-006](./delivery-status-ledger.md)。
- [x] `FE-MSG-001` 任务/知识 contextual thread list、稳定有界 conversation/message pagination 和目标撤权后的不可读状态；前端映射：`MSG-004`、`WB-PAGE`；后端总账依赖：[MSG-001、MSG-002、MSG-005](./delivery-status-ledger.md)。
- [x] `FE-MSG-002` composer client idempotency、retry、failed/duplicate state、键盘发送与焦点公告；撤权 authority 与 thread 不可读状态由 `FE-MSG-001` 消费 `MSG-005`；前端映射：`MSG-004`、`WB-A11Y`；后端总账依赖：[MSG-003](./delivery-status-ledger.md)。
- [ ] `FE-ACC-001` admin/contributor signed browser acceptance matrix，覆盖任务、通知、看板、消息、管理页、拒绝路径、分页、键盘和失败恢复；前端映射：`ADM-011`；后端总账依赖：[TSK-010、NTF-006、BRD-007、MSG-006、ADM-011](./delivery-status-ledger.md)。

已勾选 frontend atom 只证明前端实现与本地/UI 合同；不能单独把后端、migration、发布或验收提升为完成。只有[交付状态总账](./delivery-status-ledger.md)中的对应实现、验证、发布、验收证据可以改变交付结论。
