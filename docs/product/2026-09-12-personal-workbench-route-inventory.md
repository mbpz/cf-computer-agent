# 个人工作台：当前路由与功能入口对账

基线：`main e46c512` 加工作区未提交的 Shell/品牌修复。此表是源码入口清点，不是全部操作验收；不提升交付总账的 release / acceptance。

## 范围与判定

权威入口：`shared/workspace-route-capabilities.ts` 的 28 个静态路由，及 `frontend/app-routes.ts` 的 4 个参数化路由，共 32 个登录后页面模式。实际接线在 `frontend/app.tsx`。未登录 `/` 是公共展示页，其他受保护路径由登录/授权控制；not-found、forbidden 和通用 coming-soon 是状态，不另算业务模块。

- **存在**：找到入口与实现，不代表所有按钮、权限、分页、持久化和恢复流程均验收。
- **部分**：已定位影响用户流程的缺口；必须保留未完成标记。
- 下表测试列是后续执行入口，除文末明确列出的测试外，本轮未逐一重跑。
- `frontend/lib/` 简写为 `lib/`；`test/unit/` 简写为 `unit/`；`test/worker/` 简写为 `worker/`。它们都指仓库路径。

## 知识与账户（9 个）

| 页面 | 可见主要操作 / 数据接线 | 当前判定与下一验证 | 测试入口 |
| --- | --- | --- | --- |
| `/` | 最近知识、任务摘要、活动；`lib/workbench-data.ts` | 存在；核对部分请求失败是否被空数据掩盖 | `unit/workbench-data.test.ts` |
| `/submit` | 模式切换、编辑、草稿恢复、提交、附件选择；`lib/submission-data.ts`、`lib/offline-submission-draft.ts` → `src/routes/member.ts` | 部分；共用草稿键、重试新幂等键、附件未接线 | `unit/offline-submission-draft.test.ts`、`unit/frontend-submission-data.test.ts`、`worker/submissions.test.ts` |
| `/knowledge` | 列表、过滤、分页、打开知识；`lib/knowledge-data.ts` → `src/routes/library.ts` | 存在；再验分页与权限撤销 | `unit/frontend-knowledge-data.test.ts` |
| `/knowledge/:id` | 阅读、来源、引用；`lib/knowledge-reader-data.ts` → `src/routes/library.ts` | 存在；缺失版本显示错误不应机械改成空态；验精确引用与权限 | `unit/frontend-knowledge-reader-data.test.ts` |
| `/search` | 搜索、结果跳转；`lib/search-data.ts` → `src/routes/library.ts` | 存在；再验中文、无结果、过滤与降级 | `unit/frontend-search-data.test.ts` |
| `/agent` | 提问、取消、重试、引用；`lib/agent-data.ts` → `src/routes/library.ts` | 部分；无历史恢复入口与可操作范围选择；不能将另一套 agent sessions API 当作知识问答会话历史 | `unit/frontend-agent-data.test.ts` |
| `/my-submissions` | 自己的提交、审核意见、修订；`lib/my-submissions-data.ts` → `src/routes/member.ts` | 存在；再验驳回到重提及可见性不扩大 | `unit/frontend-my-submissions-data.test.ts`、`worker/submissions.test.ts` |
| `/settings` | 账户只读信息、主题、语言；`frontend/pages/settings-page.tsx` | 基础设置存在；会话管理不是已实现能力；账户菜单交互另见 Shell 修复证据 | `unit/settings-page.test.tsx` |
| `/admin/submissions/:id` | 预览、审核、评论；`frontend/components/review/review-detail-data.ts` → `src/routes/admin-review.ts` | 部分；初次加载错误无页面级重试；验发布回放与撤权 | `unit/frontend-review-detail.test.tsx`、`worker/review.test.ts` |

## 执行与协作（13 个）

| 页面 | 可见主要操作 / 数据接线 | 当前判定与下一验证 | 测试入口 |
| --- | --- | --- | --- |
| `/tasks` | 创建、编辑、状态、筛选、分页；`lib/tasks-data.ts` → `src/routes/tasks.ts` | 存在；重跑独立成员与并发写旅程 | `unit/frontend-tasks-route.test.tsx`、`worker/tasks.test.ts` |
| `/boards` | 任务分列、移动、查看；同一 tasks 数据源 | 存在；验键盘移动、回滚和分页后计数，不建平行任务存储 | `unit/frontend-boards-route.test.tsx` |
| `/goals` | 目标与任务归属；`lib/goals-data.ts` → `src/routes/goals.ts` | 存在；核对写入重试身份及进度回读 | `unit/frontend-goals-page.test.tsx`、`worker/goals.test.ts` |
| `/projects` | 项目及任务归属；`lib/projects-data.ts` → `src/routes/projects.ts` | 存在；核对分页与创建重试 | `unit/frontend-projects-page.test.tsx`、`worker/projects.test.ts` |
| `/projects/:id/timeline` | 时间线操作；`lib/projects-data.ts` → `src/routes/project-timeline.ts` | 存在；核对并发、删除、跨成员直达 | `unit/frontend-project-timeline-page.test.tsx`、`worker/project-timeline.test.ts` |
| `/calendar` | 日期查看、任务跳转；`lib/calendar-data.ts` → `src/routes/calendar.ts` | 存在；验时区、跨日、无截止日期任务 | `unit/frontend-calendar-page.test.tsx`、`worker/calendar.test.ts` |
| `/today` | 今日计划与任务；`lib/today-data.ts` → `src/routes/today.ts` | 存在；验刷新与状态同步 | `unit/frontend-today-page.test.tsx`、`worker/today.test.ts` |
| `/focus` | 专注周期；`lib/focus-data.ts` → `src/routes/focus.ts` | 存在；验重复开始、取消、恢复与账户切换 | `unit/frontend-focus-page.test.tsx`、`worker/focus.test.ts` |
| `/review` | 工作复盘；`lib/workbench-review-data.ts` → `src/routes/workbench-review.ts` | 存在；不与管理端知识审核混为一项 | `unit/frontend-workbench-review-page.test.tsx`、`worker/workbench-review.test.ts` |
| `/inbox` | 收集与处理；`lib/inbox-data.ts` → `src/routes/inbox.ts` | 存在；验转任务/知识后的回读与幂等 | `unit/frontend-inbox-page.test.tsx`、`worker/inbox.test.ts` |
| `/notifications` | 列表、摘要、已读、批量已读；`lib/notifications-data.ts` → `src/routes/notifications.ts` | 部分；页面存在，顶部尚未消费已有 summary API | `unit/frontend-notifications-route.test.tsx`、`worker/notifications.test.ts` |
| `/messages` | 上下文讨论列表；`lib/discussions-data.ts` → `src/routes/discussions.ts` | 存在；验目标失效、未读同步、分页；不扩展为通用私聊 | `unit/frontend-discussions-data.test.ts`、`worker/discussions.test.ts` |
| `/messages/:id` | 讨论阅读、发送、加载更多；同上 | 存在；已有撤权清理断言，仍需真实双成员旅程 | `unit/frontend-discussion-route.test.tsx`、`worker/discussions.test.ts` |

## 管理（10 个）

| 页面 | 可见主要操作 / 数据接线 | 当前判定与下一验证 | 测试入口 |
| --- | --- | --- | --- |
| `/admin` | 待审核/资产/成员概览 | 部分；`renderPage` 将三个 metrics 全部写死为 0，没有真实数据 controller | `unit/frontend-workbench-maturity-routes.test.tsx` |
| `/admin/submissions` | 审核队列、分页、详情；`lib/admin-review-data.ts` | 部分；初始错误无页面级重试 | `unit/frontend-admin-pagination-routes.test.tsx` |
| `/admin/duplicates` | 重复队列与处理；`lib/admin-duplicates-data.ts` | 部分；初始错误无页面级重试 | `unit/frontend-admin-duplicates.test.ts` |
| `/admin/assets` | 资产列表、状态筛选、解析重试；`lib/admin-assets-data.ts` | 部分；解析任务重试不等于初次列表失败重试 | `unit/frontend-admin-assets-data.test.ts`、`worker/assets.test.ts` |
| `/admin/members` | 成员管理；`lib/admin-members-data.ts` | 部分；初始错误无页面级重试；验管理员自锁保护 | `unit/frontend-admin-pagination-routes.test.tsx` |
| `/admin/roles` | 角色与权限；`lib/admin-roles-data.ts` → `src/routes/admin-roles.ts` | 部分；初始错误无页面级重试；验撤权后缓存失效 | `unit/admin-roles-page.test.tsx`、`worker/admin-roles.test.ts` |
| `/admin/menus` | 菜单配置；`lib/admin-menus-data.ts` → `src/routes/admin-menus.ts` | 部分；初始错误无页面级重试；菜单隐藏不替代 API 授权 | `unit/admin-menus-page.test.tsx`、`worker/admin-menus.test.ts` |
| `/admin/spaces` | 空间管理；`lib/admin-spaces-data.ts` | 部分；初始错误无页面级重试；验知识归属/撤权 | `unit/frontend-admin-pagination-routes.test.tsx` |
| `/admin/audit` | 审计过滤、数字分页；`lib/admin-audit-data.ts` | 阻断；controller 的 promise 返回裸 page，却被解构为 generation/page，成功结果不能进入 ready | `unit/frontend-workbench-maturity-routes.test.tsx`、`worker/admin-audit.test.ts` |
| `/admin/analytics` | 站点统计、时间范围与分页；`lib/admin-analytics-data.ts` | 部分；初始错误无页面级重试；需核对统计含义/范围/实际数据 | `unit/frontend-admin-analytics-route.test.tsx` |

其余管理接线位于 `src/routes/admin.ts` / `src/routes/admin-review.ts`；逐个 mutation 的授权、存储表、冲突、删除限制仍属 A02，未在本表宣告完成。

## VM 历史追溯结果

- `840ed53` 引入浏览器 Linux 探针与环境元数据；`f426d01` 已将基础能力合入 main。后续 `7f2efeb`、`387ee77`、`3469ae4` 等保留 connector / 下载 / 诊断演进记录。
- 现有 `tools/browser-vm/README.md` 将工具明确定位为 G0 验证 harness，不是正式工作台环境功能。Linux 镜像需要显式配置，不应为对账自动下载或启动。
- `src/routes/environments.ts` 提供成员授权元数据与操作/删除协议；`frontend/features/environments/deletion-reconciler.ts` 处理删除协调。这不等价于正式页面可启动、维护浏览器内 Linux。
- 当前 32 个页面没有 VM 路由。D04 必须复用已有 runtime / 协议接入产品页，补齐浏览器存储、账户切换、跨标签互斥、生命周期与网络验收；不能重新搭一个服务器付费 VM 来替代用户需求。

## 本轮验证与已知局限

两组 Vitest 均 exit 0：

```bash
rtk proxy npx vitest run test/unit/frontend-app-routes.test.ts test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-submission-data.test.ts test/unit/offline-submission-draft.test.ts test/unit/frontend-submit-pages.test.tsx test/unit/frontend-agent-data.test.ts test/unit/frontend-knowledge-data.test.ts test/unit/frontend-knowledge-reader-data.test.ts test/unit/frontend-review-data.test.ts test/unit/frontend-my-submissions-data.test.ts test/unit/environment-deletion-reconciler.test.ts
# 11 files, 177 tests passed
rtk proxy npx vitest run test/worker/submissions.test.ts test/worker/assets.test.ts test/worker/environments.test.ts
# 3 files, 152 tests passed
```

重要：`frontend-workbench-maturity-routes.test.tsx` 的 `ROUTE_STATE_MATRIX` 以 supported / gap 区分断言；gap 测试通过恰好确认缺口，不代表成熟度通过。修复时须同时将对应 gap 转为真实成功/重试行为断言，不得只删测试。

本轮未执行完整 check、真实登录浏览器验收、真实 Linux 启动或联网测试；没有提交、推送、迁移、部署。测试中的二进制响应 `.text()` 警告未造成失败，仍应作为测试清洁度后续项处理。

## 优先顺序调整

1. B02 草稿按成员隔离（隐私）与 A02 写入契约核对；随后 B01 稳定提交重试身份。
2. D02 审计页成功分支阻断与管理页初始错误重试；D01 移除虚假零统计，接真实授权数据。
3. B03–B09 知识输入、审核、检索/阅读、AI 来源与任务关联；保留免费层不可用状态。
4. C01–C07 对现有执行/协作能力逐条验收修补，接入全局未读。
5. D04 复用现有 VM 基础实现产品页；D05–D08 执行角色、设备、完整门禁与授权后发布验收。

该顺序细化已批准方向，不改变历史 R 阶段 atom ownership 或总账完成数。A01 的路由枚举和 VM 追溯已完成；**可见操作全集、逐按钮契约仍未完成**，因此 A01 整项暂不勾选。
