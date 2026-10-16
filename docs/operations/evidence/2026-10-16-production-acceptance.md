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
