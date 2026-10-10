# 知识列表操作审查与读取恢复证据（2026-10-10）

## 范围和基线

- 基线 `c5421f8e`，分支 `codex/functional-checklist-completion`。推进 A01/A02 操作映射、A05 交互归属和 A06 失败重试/退出取消；不关闭父项。canonical checklist 仍为范围29、关闭5、开放24，D08独立排除。
- 仅 `/knowledge` 列表及其组合区块；不将阅读器、引用、笔记编辑、跨账号原生旅程或 VM 验收包含在此局部交付。API/加载器真实接线；行为测试为本地 React DOM + Response fixture，不是真实登录或线上 D1 证明。
- 当前全量索引270文件、1180候选、110未归属；知识列表路由候选如下附录。候选包含 props 转发、状态容器、option 和重复模板，不能当作同数量独立操作。

## 可见操作 -> handler -> API/状态 -> 证据

| 操作 | 入口与 handler | 数据/授权/持久化与边界 | 本地证据与未验收部分 |
| --- | --- | --- | --- |
| 首次失败重读、保留列表后的局部读错重试 | `KnowledgePage` 的 `onRetry` -> `MemberKnowledgeRoute` retryVersion | GET 主列表和组合区块；撤权后先进入loading，不自动重试，不提交任何业务写入 | `frontend-knowledge-read-lifecycle.test.tsx`：401/403清屏、显式恢复、普通500保留ready行 |
| 页大小、桌面前后/数字页、移动前后页 | `DataPagination` / `Pagination` -> navigate -> writeWorkspaceHistory -> page/pageSize | `loadKnowledgePage` GET `/api/knowledge`；保留URL过滤条件；编号请求代次和快照核对。不是无限滚动；列表没有新加独立过滤表单 | `frontend-reader-pagination-routes.test.tsx`、`frontend-knowledge-list-identity.test.tsx`；本轮撤权与迟到主列表测试 |
| 知识卡片标题、待阅读、近期访问、复习项目、私有笔记入口 | 各 panel 的同源 `/knowledge/{id}` 链接 | 列表此处只导航，阅读器自己 GET detail/revision 并重新授权；detail路由会记录最近访问，不能宣称目标旅程完全无写入 | 链接源码可达性；阅读器完整旅程仍属B07，不由此表关闭 |
| 研究报告打开 | `RecentResearchPanel` 链接 | 规范化报告条目提供 `/knowledge/{knowledgeItemId}?researchRunId={id}` 入口并显示状态/进度。研究生成不在该列表触发 | `frontend-knowledge-section-read.test.tsx`加载响应契约；原生链接旅程待验收 |
| 卡片系统分享 | `KnowledgeCard.share` -> `shareKnowledgeItem` | 先确认，再 `navigator.share` 分享同源阅读地址和标题；不创建公开分享授权、不调用服务端写API、不绕过接收者权限；取消不成功，无接口显示不可用 | `system-share.test.ts`为系统分享适配器测试；实际系统面板、重复点击与组件pending归属仍需单独补齐，不能宣称A05完成 |
| 近期/收藏/研究/笔记/活动区块失败重试 | `SectionUnread.onRetry` -> sectionRetry | 重读五个区块，共享AbortController；普通错误仅对应区块不可用，不把失败假装为空；重读时中止旧活动追加 | lifecycle测试：区块401/403、迟到兄弟、旧append取消；section-read测试规范化 |
| 日/周复习选择 | `ReviewPanel` select -> setReviewPeriod | `loadKnowledgeReview` GET `/api/knowledge/review?period=`；按请求period核对响应；改变period中止旧请求 | `frontend-knowledge-review-read.test.tsx`、`frontend-review-period*.test.*`；原生select/键盘待验收 |
| 复习同周期重试（本轮新增） | `ReviewPanel.onRetry` -> reviewRetry | GET原period，不切换选择器、不修改默认周期；普通错误有role=alert；401/403走整页撤权 | lifecycle同周期500恢复和review-read契约 |
| 损坏复习偏好丢弃 | `discardPeriod` -> discardBlockedReviewPeriod | 成员作用域sessionStorage，损坏记录显式丢弃才重新保存；存储失败可见；不是服务端重置业务数据 | `frontend-review-period-refresh.test.tsx`与period适配器测试；原生刷新验收仍开放 |
| 活动加载更多/失败后重试 | `ActivityPanel` -> loadMoreActivity | GET `/api/activity?limit=...&cursor=...`；同步ref锁防同事件双击；成功追加，普通失败保留行和原cursor并显示alert；重试只用原cursor | lifecycle：双击只有一个请求、500重试同cursor、401/403清空组合页、切成员/重读/退出取消及迟到隔离 |
| 活动项目导航 | `ActivityPanel` a | knowledge->阅读器；task->任务列表；discussion_thread->消息详情；其他->我的提交。不是每条都能跳到独立资源详情 | 源码映射；目标页面继续独立授权，原生跨路由旅程未由此测试覆盖 |
| 成员切换和浏览器历史 | `KnowledgeRoute` keyed wrapper；subscribeWorkspaceLocation | memberId改变卸载整个旧实例并取消七路初始读/活动append，避免旧成员行继续显示。history更新主查询，非服务器写入 | lifecycle直接成员切换；既有workspace-location和分页路由测试。fixture身份不等于D05真实身份 |

## 服务端信任边界与存储

1. `src/routes/library.ts#routeLibraryApi` 对全部 `/api/knowledge*` 先 `requireCapability(principal,"knowledge:read")`，再 `memberScope(principal)`。主列表 -> `LibraryService.list` -> `LibraryRepository.list` 使用可见性scope；recent/favorites/review/research-runs/notes分别调用 RecentVisitsService、FavoritesService、ReviewService、ResearchReportService、PrivateNotesService，不接受前端指定memberId绕过权限。
2. `src/routes/member.ts` 的 `/api/activity` 同样要求 `knowledge:read`，`requireMember` 后调用 `AuditRepository.listMemberActivity(memberId,role,query)`，读取现存审计活动。成员与角色来自principal，不来自cursor或URL的member参数。
3. 本轮修改没有创建业务写接口、数据库schema或依赖。周期偏好是本地成员sessionStorage；卡片分享是外部系统UI，不是服务器公开链接功能。
4. 页内七路初始GET共用“撤权”边界：任一401/403立即标记denied、取消其他请求并清空所有私人区块。普通500不按撤权处理。之后只有显式重读恢复；已取消旧代次即使在恢复后返回，也不能覆盖新数据。

## 测试驱动过程与实际结果

- 修正先前未提交的分页fixture：20条/页总40条不能用1条作为完整第一页。修正测试输入后、生产知识页未修改时21项得到20失败/1通过；失败覆盖撤权、取消、去重和同周期恢复，而非无效分页导致的级联假失败。日志 `/private/tmp/graph-gate-knowledge-red.log`。
- 实现共享撤权、AbortController所有者、成员key卸载、活动同步占位和错误反馈、复习显式重试后：知识页定向5文件42/42通过。另加活动追加401/403、区块撤权后迟到主列表、显式恢复后旧代次回包5项回归；lifecycle现26项。
- 同时修复本次审查发现的图谱首次读取泄露：持久化意图不是当前授权；初始loading/普通错误不展示私人标签/编号/按钮，授权读取成功后恢复同编号。后续已授权刷新仍保留恢复控件，真正撤权再清屏。原3项先RED、修复后GREEN，既有4项迟到图谱测试改为先授权成功再发起挂起刷新，没有删除晚回包撤权验证。日志 `/private/tmp/graph-initial-gate-red.log`。
- 最终扩大知识页/图谱/阅读器分页/周期回归：**27文件335/335**，包含新增5项，日志 `/private/tmp/knowledge-lifecycle-expanded.log`。未调用真实AI或系统分享。
- 源码指纹门禁曾真实失败：`frontend/app.tsx`不匹配。已比较新旧110个未归属ID完全相同、KnowledgeRoute前代码逐字节相同，检查App挂载/SettingsPage/NotFoundPage及新包装器可达性后才更新指纹。生成索引不是人工完成率。

### 最终门禁

- `npm run check` **退出0**：vendor校验、Wrangler类型校验、Worker/完整前端/landing类型、smoke/i18n/delivery、**unit 357文件5089/5089**、**Worker 69文件1161/1161**、UI/静态VM隔离、landing验证97/97、构建密钥扫描、legacy审计以及 `wrangler deploy --dry-run` 全部执行完成。日志 `/private/tmp/knowledge-lifecycle-full-check.log`。dry-run没有发布；测试中的预期异常输出及既有大chunk提示不是线上故障证明，也未被当作零警告。
- 新增TSX测试另用继承严格前端配置的临时tsconfig验证。先发现happy-dom与原生Node的测试挂载类型不兼容，改为先append原生happy-dom元素再作测试容器类型转换；补验通过。随后 `npx vitest run test/unit/frontend-knowledge-read-lifecycle.test.tsx test/unit/system-share.test.ts` **2文件28/28**（26生命周期+2系统分享适配器）；日志 `/private/tmp/knowledge-lifecycle-final-focused.log`。此补验未改变产品源码。
- `node --test scripts/frontend-operation-inventory.test.mjs scripts/frontend-app-contract.test.mjs scripts/functional-checklist-audit.test.mjs scripts/delivery-status-contract.test.mjs scripts/workbench-maturity-contract.test.mjs` **72/72**，日志 `/private/tmp/knowledge-lifecycle-contracts.log`。
- `npm run audit:frontend-operations`、`npm run audit:workbench-domain`、`npm run audit:functional-checklist` 与 `git diff --check` 通过；父项仍29/5/24。此为当前局部候选完整本地门禁，不替代D07要求的整个功能候选最终对账/原生验证。

## 当前边界和下一步

- 分享组件的pending/重复点击/迟到系统回执尚未由适配器测试证明，下一允许继续这一实际可见操作；不是额外引入业务功能。
- 本地控制流覆盖不能替代原生浏览器、真实双身份、键盘/触控、D04 VM验收；不关闭A01/A02/A05/A06/B07/D05/D06/D07父项。
- 没有push、部署、迁移、密钥读取/上传；独立验收预览不随本地代码变更而更新。

## 路由源码候选逐组核对

以下固定为本次源码快照。每个候选列出一次；组合容器/基础UI/状态提示/事件订阅不重复算用户业务操作。源码坐标变化时应重新生成和审查，不把下表当作运行时验收。

当前 `/knowledge` 路由 **67 个源码候选**。

### `frontend/app.tsx` / `KnowledgeRoute`（1）

- `frontend/app.tsx:743:10`

### `frontend/app.tsx` / `MemberKnowledgeRoute`（1）

- `frontend/app.tsx:855:10`

### `frontend/components/data-pagination.tsx` / `DataPagination`（5）

- `frontend/components/data-pagination.tsx:39:10`
- `frontend/components/data-pagination.tsx:42:144`
- `frontend/components/data-pagination.tsx:43:70`
- `frontend/components/data-pagination.tsx:45:9`
- `frontend/components/data-pagination.tsx:47:9`

### `frontend/components/knowledge/knowledge-card.tsx` / `KnowledgeCard`（4）

- `frontend/components/knowledge/knowledge-card.tsx:19:39`
- `frontend/components/knowledge/knowledge-card.tsx:19:534`
- `frontend/components/knowledge/knowledge-card.tsx:19:731`
- `frontend/components/knowledge/knowledge-card.tsx:19:880`

### `frontend/components/ui/alert.tsx` / `Alert`（1）

- `frontend/components/ui/alert.tsx:11:72`

### `frontend/components/ui/alert.tsx` / `AlertTitle`（1）

- `frontend/components/ui/alert.tsx:12:98`

### `frontend/components/ui/alert.tsx` / `AlertDescription`（1）

- `frontend/components/ui/alert.tsx:13:106`

### `frontend/components/ui/badge.tsx` / `Badge`（1）

- `frontend/components/ui/badge.tsx:20:72`

### `frontend/components/ui/button.tsx` / `Button`（1）

- `frontend/components/ui/button.tsx:33:5`

### `frontend/components/ui/card.tsx` / `Card`（1）

- `frontend/components/ui/card.tsx:5:37`

### `frontend/components/ui/card.tsx` / `CardHeader`（1）

- `frontend/components/ui/card.tsx:9:85`

### `frontend/components/ui/card.tsx` / `CardTitle`（1）

- `frontend/components/ui/card.tsx:10:83`

### `frontend/components/ui/card.tsx` / `CardContent`（1）

- `frontend/components/ui/card.tsx:12:86`

### `frontend/components/ui/page-state.tsx` / `PageState`（1）

- `frontend/components/ui/page-state.tsx:12:10`

### `frontend/components/ui/pagination.tsx` / `PaginationContent`（1）

- `frontend/components/ui/pagination.tsx:35:145`

### `frontend/components/ui/pagination.tsx` / `PaginationItem`（1）

- `frontend/components/ui/pagination.tsx:38:118`

### `frontend/components/ui/pagination.tsx` / `PaginationLink`（1）

- `frontend/components/ui/pagination.tsx:42:187`

### `frontend/components/ui/pagination.tsx` / `PaginationEllipsis`（1）

- `frontend/components/ui/pagination.tsx:45:103`

### `frontend/components/ui/pagination.tsx` / `PaginationPrevious`（1）

- `frontend/components/ui/pagination.tsx:47:151`

### `frontend/components/ui/pagination.tsx` / `PaginationNext`（1）

- `frontend/components/ui/pagination.tsx:50:147`

### `frontend/components/ui/pagination.tsx` / `Pagination`（4）

- `frontend/components/ui/pagination.tsx:60:10`
- `frontend/components/ui/pagination.tsx:61:5`
- `frontend/components/ui/pagination.tsx:64:37`
- `frontend/components/ui/pagination.tsx:65:5`

### `frontend/components/ui/select.tsx` / `Select`（1）

- `frontend/components/ui/select.tsx:5:135`

### `frontend/components/ui/select.tsx` / `SelectOption`（1）

- `frontend/components/ui/select.tsx:8:113`

### `frontend/components/ui/skeleton.tsx` / `Skeleton`（1）

- `frontend/components/ui/skeleton.tsx:4:92`

### `frontend/lib/workspace-browser-history.ts` / `createWorkspaceBrowserHistory`（3）

- `frontend/lib/workspace-browser-history.ts:122:3`
- `frontend/lib/workspace-browser-history.ts:123:3`
- `frontend/lib/workspace-browser-history.ts:124:3`

### `frontend/lib/workspace-location.ts` / `subscribeWorkspaceLocation`（1）

- `frontend/lib/workspace-location.ts:112:3`

### `frontend/pages/knowledge-page.tsx` / `KnowledgePage`（11）

- `frontend/pages/knowledge-page.tsx:16:139`
- `frontend/pages/knowledge-page.tsx:17:253`
- `frontend/pages/knowledge-page.tsx:17:357`
- `frontend/pages/knowledge-page.tsx:17:490`
- `frontend/pages/knowledge-page.tsx:17:731`
- `frontend/pages/knowledge-page.tsx:17:902`
- `frontend/pages/knowledge-page.tsx:17:1075`
- `frontend/pages/knowledge-page.tsx:17:1262`
- `frontend/pages/knowledge-page.tsx:17:1429`
- `frontend/pages/knowledge-page.tsx:17:1533`
- `frontend/pages/knowledge-page.tsx:17:1915`

### `frontend/pages/knowledge-page.tsx` / `SectionUnread`（2）

- `frontend/pages/knowledge-page.tsx:21:10`
- `frontend/pages/knowledge-page.tsx:21:257`

### `frontend/pages/knowledge-page.tsx` / `ToReadPanel`（1）

- `frontend/pages/knowledge-page.tsx:25:346`

### `frontend/pages/knowledge-page.tsx` / `ReviewPanel`（9）

- `frontend/pages/knowledge-page.tsx:29:506`
- `frontend/pages/knowledge-page.tsx:29:675`
- `frontend/pages/knowledge-page.tsx:29:754`
- `frontend/pages/knowledge-page.tsx:29:876`
- `frontend/pages/knowledge-page.tsx:29:1034`
- `frontend/pages/knowledge-page.tsx:29:1197`
- `frontend/pages/knowledge-page.tsx:29:1467`
- `frontend/pages/knowledge-page.tsx:29:1584`
- `frontend/pages/knowledge-page.tsx:29:1841`

### `frontend/pages/knowledge-page.tsx` / `ActivityPanel`（3）

- `frontend/pages/knowledge-page.tsx:33:222`
- `frontend/pages/knowledge-page.tsx:33:802`
- `frontend/pages/knowledge-page.tsx:33:930`

### `frontend/pages/knowledge-page.tsx` / `RecentKnowledgePanel`（1）

- `frontend/pages/knowledge-page.tsx:37:234`

### `frontend/pages/knowledge-page.tsx` / `RecentResearchPanel`（1）

- `frontend/pages/knowledge-page.tsx:41:964`

### `frontend/pages/knowledge-page.tsx` / `PrivateNotesPanel`（1）

- `frontend/pages/knowledge-page.tsx:45:433`

