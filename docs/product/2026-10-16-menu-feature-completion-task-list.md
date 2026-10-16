# 每个菜单的功能深打磨任务清单

日期：2026-10-16。状态：**任务清单（未实施）**。这是"把每个菜单功能深入打磨、强化功能完善"的分派草案，等待选序后逐批实施。

## 0. 口径与事实来源

本清单不发明需求，全部任务来自仓库既有账目，逐条可回溯：

| 来源 | 内容 | 用途 |
| --- | --- | --- |
| `docs/product/workbench-product-maturity-gap-matrix.md` | **116 条机器校验缺口账**（34 manifest 聚合 + 82 domain 写安全），每条带唯一 owner 原子 R1–R8、前置、受影响文件、focused test、**验收旅程**、优先级（P0 65 / P1 50 / P2 1） | 任务本体与完成标准 |
| `shared/workbench-maturity-capabilities.ts` | 34 个能力（全部 `classification: "partial"`；`entry` 已证，其余 8 维皆 gap）+ 每个能力/每条写入的 proven/gap 判定与 API 路径 | 现状判定 |
| `docs/product/frontend-operation-unassigned-review.md` | 161 处人工对账坐标，其中 **84 `vm-not-mounted` + 17 `unmounted-ui`** 属"已建未接线" | 清单未覆盖的功能接线 |
| `src/routes/*` × `frontend/**` 交叉核对 | 后端 ≈130 个 method+path，前端调用 ≈85；**无前端请求落到未注册路由** | "API 已有、界面未用"清单 |
| `ROADMAP.md` R1–R8 | 仓库自身阶段与退出门槛（R1 设计系统 1 / R2 共享模式 1 / R3 知识闭环 14 / **R4 任务与扩展工作区 55** / R5 通知消息 4 / R6 管理端 31 / R7 跨模块 1 / R8 发布验收 9） | 依赖顺序 |

**四类任务必须分清**，混在一起会误导排期：

1. **写入收敛**（真实缺陷，代码工作）：响应丢失后重试会重复写入、并发旧请求覆盖新状态、重复操作返回 409/404 而非收敛。
2. **功能接线**（代码已写、界面未挂）：环境页 VM/文件/导入面、被登记遗漏的角色路由。
3. **功能补建**（API 已实现、界面不存在）：知识 AI 衍生面、后台知识生命周期、成员侧草稿/重提。
4. **状态真实与验收**（不改数据形态）：把 pending/error 伪装成 ready/empty 的地方改回真实状态；以及部署、迁移、signed-browser 验收。

对 82 条 domain 写入缺口的机器聚类（本次统计）：**缺稳定幂等键 18**、**缺乐观并发前置 12**、重复操作不收敛 5、重放凭据未跨刷新持久化 4、读后重置非原子 1、有界面入口但缺域级恢复证据 14、纯验收类 11、其余为共享编辑器与顺序性细分。

## 1. 工作台外壳 / 全局

| # | 任务 | 类别 | 依据 | 完成标准 |
| --- | --- | --- | --- | --- |
| 1.1 | 首页指标改为各模块权威计数；recent 的 pending/error 不得伪装成 ready/empty；游标列表补"继续"入口 | 状态真实 | `workbench-home:api:authoritative-summary-and-recent-recovery`（R7-010，P1）；`frontend/pages/home-page.tsx`、`src/recent-visits/repository.ts` | 首页指标与模块权威计数一致；recent 失败可重试且能继续翻页 |
| 1.2 | 设置页补路由级异步边界：主题/语言的 pending、失败恢复、持久化结果 | 状态真实 | `workbench-settings:states:persisted-settings-boundary`（R1-012，P1）；`frontend/pages/settings-page.tsx`、`src/identity/session.ts` | 修改主题或语言时可见 pending 与失败恢复，退出后 session 正确关闭 |
| 1.3 | 登记 `admin-role-new` / `admin-role-detail` 两个 pageKind 为能力根 | 功能接线 | 未归属对账 `:331-334,360-361`：两页已可达且已接真实控制器，37 处坐标未归属只因未登记，"不是界面缺失" | 两条路由出现在能力表中，未归属坐标回落为 app-boundary |
| 1.4 | 对待接线外壳原语做一次显式决策（保留或删除） | 决策 | 对账 `:27,58,74`：`context-rail`、`ui/tabs`、`CardFooter`、`center-morph-modal` 属"无当前正式消费者，**不得直接认定缺失业务**" | 产出：每项保留理由或删除记录；本轮不接线（见 §8 排除项） |

## 2. 知识

| # | 任务 | 类别 | 依据 | 完成标准 |
| --- | --- | --- | --- | --- |
| 2.1 | 阅读器二级对象撤权：笔记、分享、收藏、访问记录在知识撤权后重新授权并安全降级 | 撤权隐私 | `workbench-knowledge-reader:isolation:secondary-object-reauthorization`（R3-012，**P0**） | 撤权后原文、笔记、分享、收藏与相关链接都重新授权 |
| 2.2 | 私有笔记更新加并发条件；笔记分享创建幂等、撤销收敛 | 写入收敛 | `…reader:query_or_idempotency:{update-private-note,create-note-share,remove-note-share}`（R3-011，P0/P1） | 双标签页编辑冲突明确、只留最后成功版本；重复分享/撤销只留一个授权结果 |
| 2.3 | 阅读访问计数语义（成功 GET 即 +1，重试不去重）显式定义为幂等或"一次访问" | 写入收敛 | `…reader:query_or_idempotency:record-reader-visit`（R3-011，P0） | 响应丢失重试不重复计数，刷新后统计可解释且成员隔离 |
| 2.4 | 收藏撤销跨刷新未知结果恢复 | 写入收敛 | `…reader:query_or_idempotency:remove-favorite`（R3-011，P1） | 重复取消后列表与阅读器都显示未收藏，他人收藏不受影响 |
| 2.5 | 知识列表辅助数据（recent/favorite/note/activity/review）失败互不牵连，各自独立重试 | 状态真实 | `workbench-knowledge:states:auxiliary-data-recovery`（R2-010，P1） | 主列表成功而任一辅助请求失败时保留已加载内容并提供独立重试 |
| 2.6 | 搜索：筛选恢复、FTS5 降级、打开结果与高亮一致的完整旅程；saved view 创建/删除幂等 | 写入收敛 + 状态真实 | `workbench-search:journey:filter-restore-and-result-open`、`…:{create,delete}-saved-view`（R3-014，P1） | 过滤后刷新/后退/降级/打开结果条件一致；同筛选重放只生成一个视图 |
| 2.7 | 发送已支持但从未发送的检索筛选：`kind / authorId / publishedFrom / publishedTo`（URL 状态与 saved-view schema 同步） | 功能补建 | `src/routes/library.ts:743` 接受；`frontend/lib/search-data.ts:15-16` 声明；`frontend/app.tsx:1019-1020` 只读 5 个参数 | 四个筛选可在界面设置、随 URL 恢复、可存入 saved view |
| 2.8 | Agent：范围更新条件写、提问端到端幂等、取消终态收敛、空答案/引用回读/配额降级状态 | 写入收敛 + 状态真实 | `workbench-agent:query_or_idempotency:{update-conversation-scope,submit-chat-turn,cancel-conversation}`、`…:states:cited-completion-and-cancel-recovery`（R3-016，P1） | 重试只生成一个 turn 与一组引用；重复取消同一终态；无证据时明确拒答 |
| 2.9 | 提交侧补建：草稿端点（`/api/submissions/drafts`）、重提（`/api/submissions/:id/resubmit`）、成员侧评论；`/my-submissions` 重提与状态恢复旅程 | 功能补建 | 端点无调用者（`member.ts:363,372,392,310`）；`workbench-my-submissions:journey:resubmission-and-status-recovery`（R3-001，P1） | contributor 从退回项进入编辑、重提并看到权威状态，重复提交不新增记录 |
| 2.10 | 附件链路补建：`assets/from-url`、`/assets/:id/alternative`、`original/parsed` 预览；`/submit` 目标选择器改用成员侧 `spaces/collections/tags` | 功能补建 | 端点无调用者（`member.ts:91,182,218,242,248,259`）；`asset-upload-data.ts` 只覆盖上传/续传/解析/取消/提交 | 从 URL 取件与替代文件可选；目标空间/集合来自服务端而非硬编码 |
| 2.11 | **AI 衍生面接线（15 个端点全部无界面）**：`summary / faq / timeline / brief / comparison / mindmap / report / flashcards / quiz` + `research-runs` 生命周期（`approve/pause/cancel/queries`，`draft` 走 `submission:create` 生成提交草稿） | 功能补建 | `src/routes/library.ts:359-582` 已实现且受能力门禁；阅读器只渲染 revision/diff/related/backlinks/favorite/note/shares | 阅读器可对当前条目生成上述产物并回读；研究运行可开始/暂停/取消并把草稿转成提交。**已落地：15 条端点全部接线，见下「2.11 落地状态」** |
| 2.12 | Agent 会话端点（`/api/agent/sessions*`，5 条）与界面所用 `/api/knowledge/chat/stream` 的关系收口 | 决策 | 5 条端点无调用者（`agent.ts:26,39,51,71,106`），`/agent` 走 chat stream | 产出：接线或标注为已弃用并删除，不留两套语义 |

### 2.11 落地状态（2026-10-16，B3）

阅读器新增「AI 衍生内容」与「研究运行」两张卡片（`frontend/components/knowledge/knowledge-derivatives-panel.tsx`、`knowledge-research-panel.tsx`），数据层 `frontend/lib/knowledge-derivatives-data.ts`，状态钩子 `frontend/lib/use-knowledge-derivatives.ts`，恢复记录 `frontend/lib/knowledge-derivative-draft-intent.ts`。请求按修订的「可引用分块」（选中分块优先，1–8 条）发起；面板只在点击时发请求，打开阅读器不发任何衍生/研究请求。

已接线（客户端可达，均为 POST，逐条字面路径便于路由对账）：

| 端点 | 界面状态 |
| --- | --- |
| `/api/knowledge/:id/summary` | 已接线（正文走阅读器的安全 markdown 面，引用回链到 `#citationId`） |
| `/api/knowledge/:id/faq` | 已接线（问题/答案 + `gap` 空答态） |
| `/api/knowledge/:id/timeline` | 已接线（`sorted/unsorted` 可见） |
| `/api/knowledge/:id/brief` | 已接线 |
| `/api/knowledge/:id/comparison` | 已接线（单元格 + 共识/冲突） |
| `/api/knowledge/:id/mindmap` | 已接线（节点/连线） |
| `/api/knowledge/:id/report` | 已接线，但需先选中一条 `running` 研究运行；否则显示 `missing-run` 态并指向研究运行卡片 |
| `/api/knowledge/:id/flashcards` | 已接线 |
| `/api/knowledge/:id/quiz` | 已接线（无唯一答案的题显示 `answerIndex=null` 态） |
| `POST /api/knowledge/:id/research-runs` | 已接线（范围固定为「本条目」，不猜空间/集合；表单收集目标/完成判据/步骤/子问题） |
| `POST /api/knowledge/:id/research-runs/:runId/approve` `/pause` `/cancel` | 已接线，按服务端允许的状态出现 |
| `POST /api/knowledge/:id/research-runs/:runId/queries` | 已接线 |
| `POST /api/knowledge/:id/research-runs/:runId/draft` | 已接线，受 `submission:create` 门禁；结果正文经 `frontend/lib/submission-intent.ts` 写入提交编辑器 |
| `GET /api/knowledge/research-runs?limit=50` | 复用 `knowledge-data.ts:127`（新增可选 `limit`，默认仍是 8）；面板显式说明只列返回页，不把有界页当成全集 |

逐产物状态：未生成 / 生成中 / 就绪 / 服务端失败（带错误码、可就地重试）/ 配额延后与后端降级（各自独立文案与角色）/ 无依据（`KNOWLEDGE_EVIDENCE_INSUFFICIENT`）/ 客户端前置未满足（无可引用分块、缺研究运行）。失败与无依据都不渲染任何占位正文。

本轮刻意未接线：无。唯一限制写清楚而非假装支持——研究运行的列表端点不支持按条目过滤，因此列表是「工作区最新一页」并在界面注明；`report` 必须先有 `running` 运行；`draft` 端点没有幂等键且没有可回读的草稿列表接口，因此未知结果只保留本地精确请求记录、由人决定重发或丢弃，不自动重放。

## 3. 工作

| # | 任务 | 类别 | 依据 | 完成标准 |
| --- | --- | --- | --- | --- |
| 3.1 | 任务写入收敛：详情更新条件写、删除幂等（单 tombstone 且可恢复）、知识关联增删、进度追加去重、标签替换条件、子树/依赖 6 条 | 写入收敛 | `workbench-tasks:query_or_idempotency:{update-task,delete-task,create-knowledge-link,delete-knowledge-link,append-progress,replace-tags}`、`…:{create,delete}-{subtask,dependency}`、`…{update}-subtask`（R4-003/004/005/010/012，**P0**） | 两会话并发编辑冲突可见、重试不覆盖较新修改；重复删除只留一个 tombstone；重放同一进度只追加一次并只产生一次通知与审计 |
| 3.2 | 收集箱：创建稳定客户端键、归档条件更新、转任务跨实体原子 | 写入收敛 | `workbench-inbox:query_or_idempotency:{create-inbox,archive-inbox,promote-inbox-task}`（R4-020/021/022，**P0**） | 重复提交与响应丢失重试只创建一条采集；并发归档冲突明确；并发转任务与断线重试只产生一个关联任务 |
| 3.3 | 收集箱→共享任务编辑器的 11 条入口绑定（并发、撤权、未知结果恢复） | 写入收敛 | 同上 `target-*` 系列（R4-002/003/004/005/010/012）+ `inbox-task-operation-matrix-evidence.md` | 每条操作在该入口完成"当前权限 + 重复动作 + 失败恢复 + 权威回读"验证；创建分支只证不可达 |
| 3.4 | 收集箱旅程：数字分页、归档、转任务后刷新恢复、过期响应保护 | 功能补建 | `workbench-inbox:journey:capture-to-task-journey`（R4-013，P1） | 采集→分页→归档→转任务后刷新仍一致；失败可重试且不显示旧请求结果 |
| 3.5 | 目标：创建稳定键、状态变更预期状态、进度版本条件 | 写入收敛 | `workbench-goals:query_or_idempotency:{create-goal,transition-goal-status,update-goal-progress}`（R4-023/024/025，**P0**） | 连点与断线重试只创建一个目标；并发状态/进度逆序到达时旧版本不覆盖新值 |
| 3.6 | 目标旅程：数字分页、编辑关联、进度闭环 | 功能补建 | `workbench-goals:journey:goal-edit-and-progress-journey`（R4-014，P1） | 创建/编辑/关联任务/更新进度后分页返回，状态与服务端一致且撤权不泄露 |
| 3.7 | 项目：创建稳定键、状态条件；4 条关联的逆序与跨刷新未知结果 | 写入收敛 | `workbench-projects:query_or_idempotency:{create-project,transition-project-status,link/unlink-project-goal,link/unlink-project-task}`（R4-026/027/015，**P0**） | 关联与解除逆序到达时拒绝旧意图；响应丢失刷新后只读核对、不重放覆盖新状态；跨成员仍 404 |
| 3.8 | 项目旅程：数字分页、关联编辑、单摘要独立恢复、旧响应保护 | 功能补建 | `workbench-projects:journey:project-relationship-and-summary-recovery`（R4-015，P1） | 编辑关联后分页返回；单个摘要失败可独立重试，其他项目不丢失 |
| 3.9 | 时间线：创建稳定意图键、状态预期版本；分页与跨项目旧响应 | 写入收敛 + 功能补建 | `workbench-project-timeline:query_or_idempotency:{create-timeline-item,transition-timeline-status}`、`…:journey:timeline-edit-and-project-switch`（R4-037/038/036，P0/P1） | 双击与断线重试只产生一个条目；切换项目时旧响应不覆盖新内容 |
| 3.10 | 日历：事件创建稳定键、取消与编辑并发的条件约束；补齐编辑 UI 与跨模块写入 | 写入收敛 + 功能补建 | `workbench-calendar:query_or_idempotency:{create-calendar-event,cancel-calendar-event}`、`…:journey:date-navigation-and-timezone-journey`（R4-028/029/016） | 重复点击与断线重试只生成一个事件；取消与编辑并发结果明确；跨日期与时区浏览不漏重复事件 |
| 3.11 | 专注：启动/暂停/恢复/完成/放弃五条跨标签与关标签页收口 | 写入收敛 | `workbench-focus:query_or_idempotency:{start,pause,resume,complete,abandon}-focus`（R4-030…034，**P0**）；`…:journey:session-selection-and-elapsed-time`（R4-018） | 双窗口同时启动最多保留一个活动会话；两暂停请求只累计一次耗时；完成/放弃竞争只接受一次合法迁移 |
| 3.12 | 今天：跨日聚合与有界摘要下钻 | 功能补建 | `workbench-today:journey:bounded-summary-drilldown`（R4-017，P1） | 摘要超上限可进入对应列表继续查看；畸形数据可恢复且两成员跨日摘要互不泄露 |
| 3.13 | 复盘：周期切换与刷新语义的产品旅程 | 功能补建 | `workbench-review:journey:period-filter-and-refresh-semantics`（R4-019，P1） | 切换日/周周期时内容与标签一致、统计只含该范围；刷新可恢复且成员隔离 |
| 3.14 | 看板：拖拽/键盘移动、并发冲突与精确乐观回滚 | 功能补建 + 写入收敛 | `workbench-boards:query_or_idempotency:move-concurrency-and-rollback`（R4-012，**P0**） | 两会话并发移动同一任务时一个成功、一个回滚，四列状态保持权威一致 |
| 3.15 | 图谱：游标继续（`rootId`/`cursor` 已支持但从未发送）、交叉引用边界、动作重放 | 功能补建 + 写入收敛 | `workbench-graph:journey:graph-bounded-projection-and-action-recovery`、`…:query_or_idempotency:{create-task,start-focus,create-timeline-item}`（R8-005/R4-002，P1）；`frontend/pages/graph-page.tsx:329-337` | 截断可见、可继续展开；引用重新授权；断线重放只产生一次业务写入 |

## 4. 协作

| # | 任务 | 类别 | 依据 | 完成标准 |
| --- | --- | --- | --- | --- |
| 4.1 | 通知目标撤权后的跳转与顶部未读收敛 | 撤权隐私 | `workbench-notifications:isolation:revoked-target-navigation`（R5-005，**P0**） | 打开已撤权通知看到明确失效状态，未读数收敛且目标内容不泄露 |
| 4.2 | 消息：上下文 thread 发现、stale/revoked 目标的明确呈现 | 撤权隐私 | `workbench-messages:isolation:context-revocation-presentation`（R5-011，**P0**） | 撤销知识或任务访问后 thread 从列表收缩，直达只展示可恢复的撤权态 |
| 4.3 | 线程详情：403 从"通用可重试错误"改为明确撤权状态，含深链发现证据 | 撤权隐私 | `workbench-message-thread:isolation:thread-context-revocation`（R5-011，**P0**） | 打开期间失去上下文权限，刷新与后退都不再渲染私有消息 |
| 4.4 | 上下文 thread 创建幂等与目标再授权 | 写入收敛 | `workbench-messages:query_or_idempotency:create-context-thread`（R5-006，**P0**） | 对同一可见目标重复建 thread 只返回一个上下文，撤权目标始终拒绝 |

## 5. 管理

| # | 任务 | 类别 | 依据 | 完成标准 |
| --- | --- | --- | --- | --- |
| 5.1 | 角色：畸形/失效提权 session 的拒绝证据；创建/更新/分配/移除四条写入收敛 | 撤权隐私 + 写入收敛 | `workbench-admin-roles:isolation:role-projection-and-session-hardening`、`…:query_or_idempotency:{create-role,update-role,assign-role-member,remove-role-member}`（R6-006，**P0**） | 伪造角色后菜单/Command/直达都稳定拒绝；重复分配稳定、重复移除收敛为未分配并只留一条授权审计 |
| 5.2 | 菜单：创建跨刷新回执、更新并发树 CAS、删除影响与跨 session 投影 | 写入收敛 + 功能补建 | `workbench-admin-menus:query_or_idempotency:{create-menu,update-menu,delete-menu}`、`…:journey:projection-invalidation`（R6-007，P0/P1） | 同一创建请求跨刷新读回原回执；并发排序只有一个版本生效；删除父菜单前展示影响且所有会话投影同步 |
| 5.3 | 成员：禁用成员的状态收敛、session 收缩与缓存失效，并能进入对应审计事件 | 写入收敛 + 功能补建 | `workbench-admin-members:query_or_idempotency:change-member-status`、`…:journey:member-status-and-audit-navigation`（R6-005，P0/P1） | 重复禁用只产生一次结果，被禁用成员的菜单与深链立即失效 |
| 5.4 | 审核决策（队列与详情两处）：发布/退回/拒绝的幂等与并发冲突；发布→索引→通知的闭环 | 写入收敛 + 功能补建 | `workbench-admin-submissions:journey:queue-to-decision-recovery`、`workbench-admin-submission-detail:journal:*`、`…:query_or_idempotency:{publish,reject,request-revision}-submission`（R6-003，P1） | 重复发布只产生一个 Revision，冲突返回当前权威版本；重复退回只改一次状态并只发一条通知 |
| 5.5 | 审核评论：跨刷新精确恢复 | 写入收敛 | `…detail:query_or_idempotency:add-review-comment`（R6-003，P1） | 评论响应丢失时保留编号与冻结正文，同编号重试仅一条 |
| 5.6 | 资产：重试改为原子条件写；解析进度与完整恢复 | 写入收敛 + 状态真实 | `workbench-admin-assets:query_or_idempotency:retry-asset`（R6-004，P1，现"读后重置非原子"）、`…:states:parse-progress-and-recovery`（R6-004，P1） | 连点或重试只排入一个解析任务；失败展示最近错误、进度与安全重试 |
| 5.7 | 重复候选决策收敛；初始错误补重试入口 | 写入收敛 + 状态真实 | `workbench-admin-duplicates:journey:duplicate-decision-recovery`（R6-010，P1）；能力表注明"initial error has no retry action" | 处理候选后刷新与重放保持同一决策，失败项可单独恢复 |
| 5.8 | 空间/集合：创建幂等键、编辑与集合的跨卸载意图恢复、归档内容影响确认 | 写入收敛 + 功能补建 | `workbench-admin-spaces:query_or_idempotency:{create-space,update-space,create-collection,update-collection}`、`…:journey:archive-content-impact`（R6-008，P1） | 刷新或重进后精确恢复未知写入，不重复新增、不用新快照覆盖他人修改；归档前看到搜索/阅读/链接影响 |
| 5.9 | **审计页缺陷**：raw page 与 `{generation,page}` 解构不兼容导致 ready/empty 不可达，且错误无重试 | 状态真实 | `workbench-admin-audit:states:raw-page-shape-and-retry`（R6-009，P1）；`frontend/pages/admin/audit-page.tsx`、`src/audit/repository.ts` | 审计列表在 loading/empty/ready/error+retry 间全部可达，并能从事件打开相关实体 |
| 5.10 | 概览：跨页写后对账、站点统计日期口径一致 | 功能补建 | `workbench-admin:api:real-dashboard-summary`（R6-001，P1） | 摘要/趋势/活动与业务表一致；失败可重试且不伪造零值 |
| 5.11 | 统计：日期范围、来源与页码切换后刷新一致 | 功能补建 | `workbench-admin-analytics:journey:date-range-and-pagination`（R6-002，P1） | 切换后刷新趋势与总数一致且错误可恢复 |
| 5.12 | 后台知识生命周期面（约 20 个端点无界面）：trash/restore/purge/rollback、batch-review（批量发布/拒绝）、publications/recover、reparse 候选提升、maintenance drain、tags 管理、orphans 回收与 capacity、chunks 重建报告 | 功能补建 | `src/routes/admin-review.ts:77,94,104,118-145`、`src/routes/admin.ts:49,59,132-152,211-256,420-483` 全无调用者 | 每项先定产品形态（是否要做），再做：批量审核有逐项结果与失败恢复；回收/容量有真实阈值与二次确认 |
| 5.13 | `GET /api/admin/submissions` 硬限 `status=review_pending`，若要"全部提交"视图需后端改动 | 决策 | `src/routes/admin.ts:207`；前端目前与之匹配（`admin-review-data.ts:9`） | 产出：要么明确"只做待审队列"，要么先扩后端再承诺筛选视图 |

## 6. 环境 / VM（`/environments`）

这是**唯一"已建未接线"的大块**：管理页只做私有元数据，VM 与文件面从未挂载（`FilesPanel` 目前只被 `tools/browser-vm/runtime-owner-browser.mjs` 导入）。

**2026-10-16 决定（用户选型）：本轮不发布 VM 引擎与镜像。** 事实依据：六个 pin 产物合计约 **66 MiB**，其中 `alpine-virt-3.24.1-x86.iso` 单个 **49 MiB**（超过静态资源 25 MiB/文件上限）；仓库已有完整交付管线（离线导出 `build:browser-vm:images`、分块镜像 `/image-chunks/<sha256>/…` 明确"不再输出完整 ISO"、独立校验 `verify:browser-vm:images`），但 `tools/browser-vm/alpine-iso.mjs` 的 pin 注释明确写着这些 pin **不授予再分发许可**，也不替代许可证清单、可复现构建与签名发布清单。因此本轮只做：

- §6.5 的**诚实状态**：环境页保留真实的元数据管理，并明确区分"元数据"与"运行中的 VM"，运行环境显示为"本版本未发布运行时"，不出现只能失败的启动控件，不宣称 VM 正在运行。
- `authenticated-vm-runtime` 的 G0 门与 owner 已接线，作为将来启用时的既有基础。
- §6.1–6.4、6.6 与 §6.5 的运行时验收 **明确不在本轮范围**（不是未完成）：待确认许可证清单与签名发布清单后再启用；相关模块保留在树上但保持未挂载。

| # | 任务 | 类别 | 依据 | 完成标准 |
| --- | --- | --- | --- | --- |
| 6.1 | 接线文件浏览器 `files-panel.tsx`（34 坐标）：面包屑上移、多文件上传逐项结果、≤1 MiB 文本编辑/另存、≤20 MiB 有界下载与流式保存、分页 20/50/100、mkdir/rename/remove 确认、批量取消不回滚已发送写入 | 功能接线 | 对账 `:182-211`；`frontend/features/environments/files/files-panel.tsx:24,73-113` | 在 `/environments` 内完成上传→浏览→编辑→下载→删除，逐项结果与恢复可见 |
| 6.2 | 接线二进制资产导入 `asset-import-panel.tsx`（23 坐标）：冻结文件、无密声明后才上传、服务端任务状态、启动/重试解析、预览已解析 Markdown、选目标空间与可见性、提交审核、取消释放本地意图（**不是发布**） | 功能接线 | 对账 `:212-252`；`asset-import-panel.tsx:16-58` | 从环境文件走到"已提交待审"，并在 `/my-submissions`、`/admin/assets` 看到同一记录 |
| 6.3 | 接线知识导入 `knowledge-import-panel.tsx`（14 坐标）：文本快照提交审核（标题/空间/可见性/无密声明），未知结果按原幂等键重试 | 功能接线 | 对账 `:253-273`；`knowledge-import-panel.tsx:14-32` | 未知结果重试不产生第二条提交 |
| 6.4 | 接线流式保存、网络连接器与本地检查点：`stream-download.mjs`、`account-network.mjs`、`connector-session.mjs`、`network-lifecycle.mjs`、`storage/checkpoints.mjs`、`reconcile-checkpoints.ts`；G0 门 `authenticated-vm-runtime.ts`（`/api/session` + 元数据通过前不读本地字节，401/403 撤销 owner） | 功能接线 | 对账 `:244-260,296-298,92-114` | 下载可中断可续、离线/pagehide 正确清理；只有命中服务端 tombstone 才删本地检查点 |
| 6.5 | 运行时验收：真实身份启动 VM、离页草稿保护、跨刷新未知写恢复 | 验收 | `workbench-environments:journey:metadata-to-vm-acceptance`（R8-009，P1）+ 三条 `query_or_idempotency` 缺口（R8-005，P1） | 保留"元数据"与"运行中 VM"的区分；真实身份完成运行时接入与前后台恢复后才关闭 |
| 6.6 | 环境操作历史端点 `/api/environments/:id/operations`（GET/POST）未用 | 功能补建 | `src/routes/environments.ts:51` 无调用者（管理器只轮询 `/operations/:id`） | 环境详情可看操作历史并从中恢复 |

### 6.0 决策：本轮不发布 VM 引擎与镜像，B2 已接线、B2-b 明确排除

`/environments` 现已完成 B2 的界面接线：

- owner 作用域运行时：`environment-vm-provider.tsx` / `environment-vm-composition.ts` 经 G0 门 `authenticated-vm-runtime.ts` 构造**唯一**一个 `AccountVmRuntime`（`/api/session` 与元数据校验通过前不读本地字节，401/403 撤销 owner；`AccountNetworkBoundary` 提供 owner，成员变更即重建）。
- 本地检查点：`createCheckpointStore`（身份来自 `storage/checkpoint-identity.mjs` → `tools/browser-vm/alpine-iso.mjs` 的固定 pin，避免第二份摘要来源）与挂载时的 `reconcileAccountCheckpoints` 对账（只有服务端 tombstone 才删本地副本；scope 必须与 owner 同一账户生命周期）。
- 文件面：选中环境后挂载 `files-panel.tsx`（`React.lazy` 动态 import，保持在延迟 chunk），并传入 `submission.memberId`，使知识与资产导入两个面板可用；`requester` 使用默认 `fetch`（`apiFetch` 才是把非 2xx 转成 `ApiRequestError` 的包装器，直接把它当 `Requester` 会二次解析）。

**但 VM 引擎与镜像本轮不发布**（用户决定）。页面因此只展示诚实状态：`data-environments-runtime="ready"` 的说明为"本版本有意不发布 VM 引擎与镜像……没有任何环境在运行"，文件面里的 `data-vm-start` 始终 `disabled` + 原因说明，绝不出现"运行中"的假状态。

排除依据：六件固定启动产物合计 ≈66 MiB（其中 Alpine ISO 约 49 MiB）；`tools/browser-vm/alpine-iso.mjs` 的 pin 注释明确"不授权再分发、不证明许可证清单、也不替代签名发布清单"；每文件体积限制可由既有的 chunked-image 打包（`createChunkedImageReader`/`image-bundle.mjs`）+ 独立校验器绕开，但许可与发布清单要求未获批准。

因此 §6.5 的运行时验收与 B2-b 均记为本轮**明确排除**，不是待办：生产 `VmSession` worker 入口、六件镜像的发布路径（`export-images.mjs` 保持离线 CLI，不写入 `frontend/public`）、worker↔main 网络 attach（`account-network.mjs` 的 `attach(machine)`）都不做。相关模块（`tools/browser-vm/*`、`account-network*.mjs`、`connector-session.mjs`、`network-lifecycle.mjs`、`storage/checkpoints.mjs`）保留在仓库中、不再挂载。

## 7. 真实缺陷清单（跨菜单，建议优先）

| # | 缺陷 | 证据 | 处置 |
| --- | --- | --- | --- |
| 7.1 | `POST /api/inbox/:id/promote/knowledge` 生产必然 503：`InboxService` 需要注入 `promoteKnowledge`，`createRequestServices` 只传了 `promoteTask` | `src/inbox/service.ts:13,82`、`src/app.ts:414-416`、`src/routes/inbox.ts:50` | 要么接线该能力，要么从能力表与文案中移除，不允许在清单里承诺可用 |
| 7.2 | 审计页 ready/empty 状态不可达（解构不兼容） | 见 5.9 | 修 5.9 |
| 7.3 | 首页硬编码零指标、pending/error 伪装成 ready/empty | 见 1.1 | 修 1.1 |
| 7.4 | 管理端资产重试为"读后重置"非原子 | 见 5.6 | 改为条件写 |
| 7.5 | 收集箱捕获分类端点 `POST /api/capture/:id/{classify,dismiss}` 无界面 | `src/routes/capture.ts:6` | 接入收集箱行操作或删除端点 |

## 8. 明确排除（本轮不做，避免返工）

- **刻意不接线的外壳原语**：`context-rail`（对账 `:74`："无需将已有 AppShell 导航再造一套"）、`ui/tabs`、`CardFooter`、`center-morph-modal`（`:27,58`：无正式消费者，按需求决定）。
- **依赖不匹配的 beUI 组件**：`code-block`（需 shiki + React 挂载点，阅读器正文是已净化 HTML）、`streaming-response`（需真实 token 流）、`table/table-async`（需 tanstack 依赖并重写管理端列表语义）、`heat-calendar`、`expandable-tabs`（`:349,357`）。
- **通用 404 的 browse CTA**（`not-found/shared.tsx:65`）：仅缺调用点，非功能缺失。
- 不改公开落地页、登录页、后端授权模型与数据模型。

## 9. 建议批次与顺序

依赖关系来自仓库自身的 R1→R8（前置只能依赖同阶段或更早阶段）。

| 批次 | 范围 | 对应阶段 | 规模 | 产出证据 |
| --- | --- | --- | --- | --- |
| **B1 写入收敛与撤权**（P0 主体） | §3.1–3.3、3.5、3.7、3.9–3.11、3.14；§2.1–2.3；§4.1–4.4；§5.1–5.3 | R4 + R3 + R5 + R6 | ~50 条 P0 | 每条一条 worker/unit 测试：响应丢失重试只写一次、并发旧版本不覆盖、撤权即收缩 |
| **B2 已建未接线** | §1.3 角色路由登记（本轮做）+ §6.5 诚实状态（本轮做）；§6.1–6.4、6.6 与运行时验收**明确不做**（见 §6 决定） | R8-009 + 登记 | 登记 2 个 pageKind + 环境页状态诚实化 | 环境页区分元数据与运行中 VM，无只能失败的控件；101 处 VM/文件/导入模块保留未挂载 |
| **B3 API 已有、界面未用** | §2.7、2.9–2.11、§5.12、§6.6、§3.15 游标、§2.6 saved view | R3/R6 | ~35 端点 | 每个新面有独立状态与恢复；不改后端承诺 |
| **B4 状态真实与产品闭环** | §1.1、1.2、§2.5、2.8、2.12、§3.4、3.6、3.8、3.12、3.13、§5.4–5.11、5.13 | R2/R3/R6/R7 | ~25 条 P1 | 每页 loading/empty/error/ready 四态可达且互不牵连 |
| **B5 发布与验收** | §6.5 与全部 R8 项 | R8 | 9 条 | 部署、迁移、免费层、smoke、signed acceptance、账本证据 |

**建议先做 B1**：它是隐私与写入收敛风险（65 条 P0 的主体），且不改变任何界面形态，不会与后续功能补建冲突；B2 体量最大但完全自包含（环境页），可以在 B1 之后单独成批推进。

### 本轮执行状态（2026-10-16）

- **B1 写入收敛与撤权：已落地。** 台账中 **59 条 domain 操作由 `gap` 翻为 `proven`**（每条带新的 `WORKBENCH_MUTATION_STRATEGY_BINDINGS` 绑定：源码符号 + token + 测试文件，由域审计校验），11 条改为"已有本地证据 / 仍开放"（其中 `target-delete-task` 因共享任务编辑器**没有删除入口**而保持开放，`R4-010` 不可勾选）。台账 **116 → 74 gap**（36 manifest / 38 domain；P0 23 / P1 50 / P2 1）。
  - 证据工作顺带查出并修好 **三个真实缺陷**：`POST /api/tasks/:id/status` 省略 `expectedStatus` 时跳过前置检查与 CAS 谓词（可被无条件覆盖）、同一 `TASK_STATUS_CONFLICT` 的 `retryable` 在两处不一致、状态通知去重键内嵌 `status_version` 导致版本回滚后下一次状态写入因唯一约束失败。
  - 另修 **两个真实安全缺陷**：`GET /api/admin/roles` 缺少管理员校验（提权贡献者角色可读取角色列表与已分配成员 id）、`/api/navigation` 把 `admin` 菜单组泄露给提权掩码。
  - 拒绝清理的机制差异见 §6 之前记录的说明（`/calendar` 显式清草稿；`/goals`、`/projects` 以 ready 为门）。
- **B2：按决策收窄后已落地。** 环境页接线运行时提供者 + 文件面（延迟导入）并显示"本版本未发布运行时"、启动控件禁用有因；运行时与镜像按 §6 决策**不发布**。角色路由登记完成：路由能力 34 → 36，未归属候选 161 → 121，并新增类别 `vm-runtime-unshipped`（77 行，表达"已挂载但因不发布运行时全部禁用"，`vm-not-mounted` 降至 6 行）。
- **B3：已全部落地。** 知识 **AI 衍生面 15 个端点**、成员侧**提交闭环**、搜索四项筛选（贯通 URL 与收藏视图 schema）、图谱下钻与游标续载（新增服务端游标支持）、知识侧栏三处续载；**后台知识面**：回收站（trash/restore，游标分页）、条目管理（trash + 回滚到服务端指名的上一修订）、purge（不可逆，需键入资源自身 id，一次审计，回放返回**记录中的计数**）、批量审核（范围=当前页选择、逐项结果、只重试失败项且沿用原操作号）、存储回收（孤儿扫描需显式触发、回收需键入数量确认且逐项结果、容量按服务端原值显示、`storageEnabled:false` 显示"不可用"而不估算）、标签管理（仅创建+列表；slug 冲突如实呈现为冲突并提供重读入口）、重解析纵切（候选/提升/发布，区分"未发布候选"）、分块维护（只读报告与唯一变更分离）。四项生命周期写入原本**没有操作身份**（重试会以非法迁移失败、purge 重放结果不同、回滚来源不同），现已补上。drain/resume **刻意不挂 UI**（生产无 `MAINTENANCE_CONTROL_TOKEN`，控件只会 503），只提供只读状态面并把两个运维端点写进 runbook。
- **B4：状态类已落地。** 首页权威指标与游标续载（并移除一处把 recent 列表长度当"已发布知识数"的伪造数字）、审计四态可达 + 只读"相关实体"链接（4 类有真实目的地、其余 `type · id` 文本）、重复候选初始错误重试、资产解析进度（只显示服务端真实 `attempts`，不合成百分比）、设置持久化边界、Agent 无证据拒答与配额/降级分类（诚实标注配额分支服务端当前不会产生）、搜索筛选恢复。
- **B5：发布材料已备。** 见 `docs/product/2026-10-16-release-preparation.md`（迁移 0064–0072、门禁命令、实测体积与免费层核算、**破坏性变更逐条说明**、按菜单的 signed-browser 验收清单、回滚）；部署由用户执行，本轮不 push、不 deploy。

### 明确不做（记录在案，不是遗漏）

- **VM 引擎与镜像**（约 66 MiB）按 2026-10-16 决策不发布；`/environments` 只做元数据 + 诚实未发布状态，审计类别 `vm-runtime-unshipped` 表达该状态。
- **维护 drain/resume 的 UI 控件**：生产无控制令牌，控件只会失败；服务端仍是最受守卫的写入（键入窗口确认 + 稳定操作身份 + 一次审计 + 回执重放）并有测试，仅未挂 UI。
- **标签的重命名/停用/删除**：API 不存在，界面如实说明而非画禁用控件。
- **成员侧标签选择器**：提交/草稿/重提载荷不接受 `tagIds`（标签在发布时附加），做了就是渲染一个写路径会丢弃的字段。
- **成员侧评论写入**：成员路由没有操作回执端点（回执仅在 `/api/admin`），重试可能重复评论，因此只读。
- **外壳原语**（`context-rail`、`ui/tabs`、`CardFooter`、`center-morph-modal`）：按对账文档保持不接线。
