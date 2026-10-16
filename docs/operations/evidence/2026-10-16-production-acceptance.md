# 2026-10-16 生产浏览器验收（管理员会话，部分）

范围：`https://memory.crgmhrc.asia/`（用户已部署并在 Chrome 中登录管理员账号；本次经 omp relay 驱动该真实标签页）。这是**部分验收**：只覆盖管理员角色与只读/私有可回收写入，不覆盖 contributor 角色旅程（该环境取不到第二个签名会话）。

本记录补充交付总账，不提升任何行的发布或验收状态，也不替代 contributor 侧验收。

## 1. 全菜单只读巡检

31 个入口逐个**冷加载**（真实 `goto`，非 SPA 跳转），等待"外壳就绪 + 页面 loading 消失"后读取：每个入口都渲染出正确标题、存在真实内容或**明确空态**（`data-page-state="empty"`），无假数据泄漏（`undefined`/`NaN`/`[object Object]`）、无原始 i18n 键泄漏、无 `role="alert"` 错误面。

| 模板 | 入口 | 观察 |
| --- | --- | --- |
| 个人概览 | `/`、`/today`、`/focus`、`/review` | 标题"你的工作台/今日/专注/复盘"；focus 为空选择态 |
| 工作对象 | `/inbox`、`/tasks`、`/boards`、`/goals`、`/projects`、`/calendar` | 空态正确（`data-page-state="empty"`）；筛选为共享 beUI listbox |
| 知识 | `/knowledge`、`/search`、`/agent`、`/submit`、`/my-submissions` | 标题正确；`/search` 空态；`/agent` 显示提问区 |
| 图谱/环境 | `/graph`、`/environments` | 图谱渲染；环境页见 §3 |
| 协作 | `/notifications`、`/messages` | 标题与内容正常 |
| 账号 | `/settings` | 正常 |
| 管理 | `/admin` 及 10 个子页 | 见 §2；`/admin/analytics` **可打开**（此前声明的能力与服务端不一致） |
| 新增 | `/admin/knowledge/trash` | 标题"知识回收站"，空态正确（本批新增页可达） |

## 2. 管理端要点

- `/admin/audit`：20 行真实审计数据；四态可达；**只读"相关实体"按设计分流**——`discussion_thread` 渲染为指向 `/messages/<id>` 的真实链接，无目的地类型（如 `task`）渲染为无 `href` 的 `<span>`。本批删除测试任务的 `task.deleted` 事件出现在首行，端到端确认墓碑与审计。
- `/admin/analytics`：正常加载并显示真实访客数据（含国家分布）——本轮修正的 `audit:read` 能力声明与导航门禁在生产一致。
- `/admin/menus` 等其余子页正常渲染。

## 3. 环境页（本批交付的诚实状态）

`data-environments-runtime="ready"`，文案为："本地 VM 运行时已准备。本版本有意不发布 VM 引擎与镜像，因此没有任何环境在运行，启动保持禁用；上方元数据管理是真实的。" 元数据行可用、行内"Files"入口存在；启动控件位于文件面内且为 disabled（禁用原因经 `aria-describedby` 指向"本版本有意不发布 VM 引擎与镜像"）。本地 harness 中已同样验证。**没有任何只能失败的控件。**

## 4. 写入回归（私有且可回收，已清理）

对 `/tasks` 走完整旅程，网络记录与结果：

| 步骤 | 请求 | 结果 |
| --- | --- | --- |
| 新建 | `POST /api/tasks` | **201**，行出现 |
| 改状态（本批强制 `expectedStatus`） | `POST /api/tasks/<id>/status` | **200**，状态 `待办 → 已完成`，行操作变为"重新打开" |
| 删除（本批墓碑回执） | `DELETE /api/tasks/<id>` | **200**（回执体），行从列表消失 |
| 权威回读 | `GET /api/tasks?page=1&pageSize=20` | 每次写入后各一次，均 200 |

无错误面、无写入恢复面残留；测试任务已删除，列表只剩用户自有任务。删除确认文案为"永久删除…此操作无法撤销"。

## 5. 发现的缺陷（已修，待部署）

`/admin/roles/new` 与 `/admin/roles/<id>` 的**冷加载返回裸 404（0 字节，Chrome 报 `ERR_INVALID_RESPONSE`）**：前端 `app-routes.ts`/`router.ts` 早已认识这两个路径，但 Worker 外壳路由表（`src/app.ts` 的 `knownWorkspaceRoute`）没有它们，因此直接访问、刷新或深链会失败，而应用内跳转正常。已修复并补 worker 测试（两条路径服务 React 外壳；超过 128 字符的 id 仍 404）。**属既有缺口，不是本批引入**；修复提交 `db4df5d8`，需下一次部署生效。

## 6. 待决的语义分歧（不是缺陷）

任务删除的确认文案写"永久删除…无法撤销"，而缺口账中该行的验收旅程写"可在保留期内恢复"。实现保留的是**操作回执**（`0066_task_delete_tombstones`，30 天），不是可恢复的任务快照——因此"恢复"目前只能理解为"重试读到已记录结果"。若产品要的是"保留期内可还原任务"，那是独立功能（trash/restore），需要先定生命周期语义。

## 7. 未覆盖（本次边界）

- **contributor 角色旅程**：403/403 撤权态、成员隔离、`/my-submissions` 重提、提交闭环、成员侧评论等均需第二个签名会话，本环境无法取得。
- **不可逆/跨账号写入**：审核决策、成员状态、菜单编辑、purge、存储回收、维护 drain 一律未在生产触发（只读检查其入口与门禁）。
- **AI 生成**：仅确认衍生面入口存在且挂载时不发请求；未触发真实生成（避免计费与配额消耗）。
- 未做视口矩阵（320/375/768/1280）、深色主题与中英文切换的系统性遍历；发现的问题与结论均来自管理员会话、浅色、中文。

## 8. contributor 会话验收（2026-10-16，后续追加）

用户以 `app***@163.com` 登录（`role: contributor`，能力 `knowledge:read`、`submission:create`、`submission:read-own`、`tasks:use`、`legacy:read`，掩码 `0x1600c3`）。同一浏览器配置文件中该登录替换了管理员会话，故本次只能逐一侧执行。

**禁止访问面与导航（本批安全修复）**

- contributor 冷加载 `/admin/members` 与 `/admin/roles/new`：均渲染 `data-page-state="forbidden"` 与「403：访问被拒绝当前服务器会话没有访问此路由所需的能力。」，无崩溃、无私有内容。
- 导航中**不出现管理组**（可见项为工作区首页/AI 知识库/提交/我的提交/收集箱/目标/项目/日历/今日/专注/复盘/工作图），与 `GET /api/admin/*` 返回 403 一致。

**成员隔离**

- 用管理员先前留下的一条真实任务 id 以 contributor 身份读取 `/api/tasks/bb4dcfa0-55d7-4ed2-a129-ac938656b440` → **404**。
- `/api/admin/submissions`、`/api/admin/members`、`/api/environments` → **403**；自家 `/api/tasks`、`/api/inbox`、`/api/goals`、`/api/submissions/mine`、`/api/notifications`、`/api/spaces` → **200**。

**提交闭环（B3 交付）**

- `/submit` 渲染正确；**目标选择器来自服务端**（空间 `Default`、集合「不指定集合」、「该空间没有集合。」）。
- 服务端草稿：输入标题与正文后自动保存，网络记录 `POST /api/submissions/drafts` → **201**，界面显示「草稿已保存到服务端 2026-10-16T14:33:47.308Z」；整页刷新后标题与正文**完整恢复**且仍显示同一服务端时间戳。
- **发现（P2，未修）**：草稿**无法被放弃**——`/submit` 没有清除/丢弃入口，且用空值或最小字段体 `PATCH /api/submissions/drafts/:id` 均返回 400 `SUBMISSION_REQUEST_INVALID`（该接口要求完整字段体）。因此本次验收留下一条私有草稿 `2fb75639-9cf3-4d7d-82f9-90c18f914249`（标题 `omp-acceptance-draft-1016`），需在后续版本提供放弃草稿的入口后由用户清理。

**知识阅读（B3 交付）**

- `/knowledge/f64ca1f3-…` 在 contributor 侧：恰一个 `h1`（条目标题）、`data-reader-outline` 存在、正文 4778 字符；页内出现**衍生面控件**（摘要、时间线、简报、对比、研究报告、读取该条目的研究运行、开始研究运行），且**挂载时不发任何生成请求**（网络记录中相关路径计数为 0），与"生成由用户触发"的设计一致。

**部署核对**

- 修复提交 `db4df5d8` 已在本次会话期间部署生效：`/admin/roles/new` 与 `/admin/roles/role-1` 冷加载由裸 404 变为 **200**（外壳），并在 contributor 侧正确落到禁止访问面。

**本节新增边界**：仍未覆盖管理员侧在同一会话中的再次核对（该配置文件已是 contributor 登录）、不可逆写入、视口与主题矩阵、以及真实 AI 生成（避免计费与配额）。

## 9. 撤权旅程（真实双角色，2026-10-16 追加）

流程：contributor 先在条目 `f64ca1f3-48ad-4ab7-8d90-c1ff81c724d2` 上建立两件私有对象（`PUT …/note` → 201、`PUT …/favorite` → 201）；管理员以**回收**（可逆动作；管理端没有"改可见性"入口，条目治理页只有 trash/rollback）使其不可读；contributor 侧验证；管理员**恢复**；再次验证。

**撤权期间（全部正确）**

- `/knowledge` 列表不再包含该条目。`GET /api/knowledge/<id>` → **404 `KNOWLEDGE_NOT_FOUND`**；`GET /api/knowledge/favorites` → `{items:[]}`；`GET …/note` → `{note:null}`（行仍在，但按可读性重新授权后不再返回）。
- 阅读器：`data-page-state="error"`、提示「无法加载这条知识。重试」，文章/目录/笔记面板/衍生面**全部不渲染**，标题与笔记内容**零泄漏**，仍恰好一个 h1（回退标题）。
- 给出的是通用「无法加载」而非「此条目已被回收」——这是**正确**的：服务端刻意不区分"不存在"与"无权访问"，区分开反而会泄露该条目的存在。

**恢复后（发现两个真实缺陷）**

- 原文恢复 ✓：detail 200、正文 4785 字符、目录与衍生面回到页面。
- **缺陷 1（P1，成员数据丢失）**：**二级对象没有回来** —— `favorites` 仍不含该条目、`…/note` 仍为 `{note:null}`，而两者在回收前都被服务端以 201 确认过。即：**回收→恢复会丢失该条目上的成员私有笔记与收藏**。已派专职切片查根因（候选机制：回收被实现为硬删除并级联，或恢复以新身份重建）并修复，要求恢复保留全部成员作用域关系、purge 保持破坏性。**更正**：本记录 §4/§8 先前所述"trash/restore 可逆"只对**条目本身**成立，对其依赖的成员数据不成立。
- **缺陷 2（P2，可访问性）**：当条目正文自带一级标题时，阅读器出现**两个相同 h1**（`<header>` 内的页面标题 + `.markdown-content` 内的正文标题）。夹具正文没有 h1，因此本地与生产巡检都未察觉。已派切片做正文标题层级规范化（保证页面恰一个 h1），并补一条正文含 h1 的用例。

**清理**：本次使用的两件测试对象（笔记、收藏）已被缺陷 1 吞掉，无需另行清理。

## 10. 缺陷 1 的更正与三项修复（2026-10-16 追加）

**更正：§9 的"回收→恢复丢失成员数据"在构建证据上不可复现。** 针对该观察做了端到端取证（workerd/D1，逐表行数 + 读源码）：`trash` 并非删除，而是 `UPDATE knowledge_items SET status = ?`（`src/publication/repository.ts:839-914`），因此**不会触发任何外键**；实测回收前→回收后→恢复后为 `private_notes 1→1→1`、`private_note_shares 1→1→1`、`knowledge_favorites 1→1→1`、`knowledge_visits 1→1→1`、`task_links 1→1→1`、`research_runs 1→1→1`，且恢复返回**同一行**（`id`/`updatedAt` 一致）。所以 §9 记录的两次 201 写入在恢复后读回为空，**不能归因于回收/恢复**；可能的解释是验收脚本自身的操作（收藏按钮在被点两次时构成"加入→取消"的切换）与客户端对不可读条目的读回映射。**待下次部署后按同一路径重测**，结论以重测为准；本条保留为"未解释的观察"。

**但这次取证顺带查出并修好了三个真实缺陷：**

1. **收藏删除缺少可读性门禁（P1）**：`FavoritesService.remove` 没有像 `add`/`get` 那样校验条目可读性，于是在回收窗口内，成员侧的 `DELETE /api/knowledge/:id/favorite` 会被接受、带回收据删除边，而恢复永远带不回来。现在在领取任何回执**之前**即以 404 `FAVORITE_NOT_FOUND` 拒绝。
2. **笔记读取缺少条目状态谓词**：`PrivateNotesRepository.findVisible` / `listVisible` 未按条目状态过滤，已回收条目的笔记仍可被读出；现在应用与写入路径一致的可读性判断（回收期间隐藏，恢复后原样返回）。
3. **purge 会中止（不可逆路径形同虚设）**：`finalizePurge` 的条目删除会因 `private_notes` / `task_links` / `research_runs` 没有外键动作而整体失败（409 `KNOWLEDGE_PURGE_CONFLICT`）——即只要条目被成员标注过，文档所称"不可逆彻底删除"**什么也删不掉**。现在它在同一受守卫批次里显式删除这些无级联的成员关系，使不可逆性由 purge 自己承担；收藏/访问记录仍走既有级联；生命周期回执与收藏操作回执**刻意保留**作为 purge 重放日志；讨论线程按既有设计存活。

**读内容标题层级（P2，已修）**：`renderSafeMarkdown` 现在带一条 markdown-it 核心规则——仅当源文**最浅标题是 h1** 时，把该源文内所有标题整体降一级（`h6` 处截断），否则保持作者层级；相对层级、所有 id/属性/文本不变，因此目录与锚点不受影响。同时发现原 a11y"恰好一个 h1"用例是**空转的**（夹具用 `renderMarkdown={(m) => m}` 把 Markdown 当纯文本渲染），已改为真实渲染器 + 含 `#` 标题的正文，并新增 `test/unit/frontend-reader-content-headings.test.tsx`。

**草稿放弃入口（P2，已修）**：新增 `DELETE /api/submissions/drafts/:id`（owner + 草稿状态作用域、`204`、幂等：重复→204，他人/未知/非草稿→404）与迁移 `0073_submission_draft_discard_receipts.sql`（回执使"已提交的删除"永不被报为不存在）；`/submit` 增加"丢弃草稿"及其确认，状态机覆盖保存中/丢弃中/已丢弃/被拒（保留文本）/结果未知（复查同一次丢弃）；确认后同时清空草稿记录、日志、离线镜像与编辑器文本，刷新无法复活。PATCH 的严格全字段契约未被削弱——空体或不完整体仍然 400 `SUBMISSION_REQUEST_INVALID`（新增回归测试）。**部署后**，生产里那条遗留草稿 `2fb75639-…` 即可由你从界面丢弃。

**待办**：你部署本次提交（0073 会由流水线应用）后，我按 §9 的同一路径重测"回收→恢复"往返，以确认更正后的结论或找出真正的机制。
