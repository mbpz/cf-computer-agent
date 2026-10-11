# 发布后只读核验（生产）

- 日期：2026-10-11
- 目标：`https://memory.crgmhrc.asia/`（Cloudflare 托管；用户已将本轮工作并入 `main`，由其流水线自动发布）
- 性质：**只读**核验。未使用任何登录会话；未对生产数据做任何写入/删除；未执行远程迁移或部署。

## 产物一致性（关键）
线上首屏引用的产物与我在本分支 `HEAD` 本地构建的 `frontend/dist` **逐字节一致**：

| 产物 | 线上 sha256(前 12) | 本地构建 sha256(前 12) |
| --- | --- | --- |
| `assets/index-BpYetGvB.js` | `b75c48e58b8f` | `b75c48e58b8f` |
| `assets/index-BsQmnhdo.css` | `f6b14b39028c` | `f6b14b39028c` |

即：**已发布前端 = 当前源码的构建**，非旧版本或缓存残留。

## 未认证边界

| 端点 | 状态 |
| --- | --- |
| `/api/navigation` | `401` |
| `/api/tasks` | `401` |
| `/api/admin/menus` | `401` |
| `/api/session` | `401` |

`/api/navigation` 的 401 响应体为结构化错误，无数据泄露：
`{"error":{"code":"AUTH_REQUIRED","message":"Authentication required","retryable":false,"requestId":"…"}}`

## 传输与响应头
- `http://memory.crgmhrc.asia/` → `301`，`Location: https://memory.crgmhrc.asia/`。
- 首屏 200 头：`content-security-policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`；`x-frame-options: DENY`；`x-content-type-options: nosniff`；`referrer-policy: no-referrer`；`cache-control: no-store`；`server: cloudflare`。
- API 响应：`cache-control: no-store`，且未见 `cf-cache-status`（未被缓存）。
- SPA 外壳：`<html lang="en">`、`<meta name="color-scheme" content="light dark">`、`<meta name="theme-color" content="#0f172a">`、`<link rel="manifest" href="/manifest.webmanifest">`、`<title>个人工作台 · …`。

## 观察（未改任何配置，待用户决定）
- **响应中无 `strict-transport-security`（HSTS）**。生产是否需要 HSTS 属策略决定：可由 Cloudflare 仪表盘开关，或由应用在响应头中下发。此处仅登记事实。

## 明确非声明
- **不是 D08 验收**：部署由用户流水线执行，我未获授权也未执行迁移/部署；回滚点应为已合并的 `main` 提交与其前一个已发布版本，本轮未记录。
- **未核验远程 D1 迁移状态**：`0060` 的菜单行是否已在生产库应用，需要已登录会话读取 `/api/navigation` 才能判定——本轮无会话，故不声称。
- 未做任何真实身份旅程（D05）与写入类验收。

## 生产真实身份只读验收与库龄落差（2026-10-11，用户已登录管理员会话）

方法：经 omp relay 附加用户已登录的 Chrome 标签页（`https://memory.crgmhrc.asia/`），在原标签页内只读调用生产 API；未做任何写入，未导航该标签页。

### 已证实
- 管理端 `/api/navigation` 返回 `200`（5188 字节、23 条 path：工作区 13 + admin 10）。`/graph` 出现（客户端 `mergeRequiredWorkspaceNavigation` 强制补齐），而 `/calendar`、`/today`、`/focus`、`/review`、`/environments` **都不在**载荷与侧栏中。
- 管理端 `/api/admin/menus` 返回 26 行；`0060` 注册的 6 个 id（`menu-graph`、`menu-calendar`、`menu-today`、`menu-focus`、`menu-workbench-review`、`menu-environments`）**全部缺失**。同时可见 `0060` 本要修的旧症状：`menu-admin` 根仍为 `requiredBits=0x200`（应为 `0x0`）；`menu-boards`/`menu-inbox`/`menu-notifications`/`menu-messages` 仍为 `0x0`（boards/inbox 应为 `0x100000`）；position 冲突 `menu-boards` 与 `menu-goals` 同为 `7`、`menu-projects` 与 `menu-notifications` 同为 `8`。
- 本地已迁移库对照：工作区 17 行、position `0`–`18` 唯一、`menu-boards`/`menu-inbox` 为 `0x100000`、`menu-environments` 为 `0x200000`、两个组根均为 `0x0`。
- `wrangler d1 migrations list memory-garden-control-plane --remote`（只读）：**待应用 `0051`–`0061` 共 11 个**。即远程库停在 `0050`，而线上代码已是最新构建。
- 只读端点健康（无 5xx）：`/api/goals`、`/api/inbox`、`/api/projects`、`/api/notifications`、`/api/discussions`、`/api/environments`、`/api/graph` 均 `200`；`/api/knowledge/<id>/favorite` `200 {"favorite":false}`；`/api/calendar/events` 缺区间参数按设计 `400 CALENDAR_RANGE_INVALID`；`/api/focus` GET 按设计 `405`。

### 结论与影响
- **线上代码 = 当前源码构建；远程库停在 `0050`**：发布流水线只发布代码，未应用 D1 迁移。
- 已证实的可见影响：侧栏缺 5 条工作区入口（`/calendar`、`/today`、`/focus`、`/review`、`/environments`）；`0060` 的三项修复（admin 组根掩码、boards/inbox 掩码收紧、工作区 position 唯一化）在生产**未生效**。
- 写路径影响**未验证**：依赖 `0051`–`0061` 新表的写操作（目标↔任务关联 `0053`、聊天轮次 `0052`、收藏操作 `0061`、连接器 `0057/0058`）在生产是否可用需要写入才能判定——未经授权未做任何写入。

### 明确非声明
- 未执行任何远程迁移或部署；未做任何生产写入；未记录回滚点。
- 不构成 D08 验收：迁移/部署与真实登录验收的完整证据需在授权后单独记录（回滚点建议：D1 Time Travel bookmark 或导出快照 + 已合并的 `main` 提交）。

## 授权执行：远程迁移 0051–0061 与迁移后复验（2026-10-11）

用户在确认"生产库落后 11 个迁移"后**明确授权立即执行**（并选择不推送本地 docs 提交）。

### 回滚点
- **D1 Time Travel bookmark（迁移前）**：`0000015a-00000000-00005101-602a6f5e08b1fbb7233d7e2fafa8d39e`（取自 `wrangler d1 time-travel info memory-garden-control-plane --json`）。恢复命令：`wrangler d1 time-travel restore memory-garden-control-plane --bookmark 0000015a-00000000-00005101-602a6f5e08b1fbb7233d7e2fafa8d39e --remote`。
- `wrangler d1 export --remote` **不可用**：报 `D1 Export error: cannot export databases with virtual tables (like FTS5)`。故 SQL 快照不可得，回滚依赖 Time Travel；另将变更前的 `menus`（26 行）与 `roles`（2 行）逐行读入本地临时文件作对照（未入库）。

### 台账
| 时点 | `d1_migrations` 行数 | 末条 |
| --- | --- | --- |
| 迁移前 | 50 | `0050_admin_review_notifications.sql` |
| 迁移后 | **61** | `0061_knowledge_favorite_operations.sql` |

应用命令：`wrangler d1 migrations apply memory-garden-control-plane --remote`；`0051`–`0061` 共 11 条全部 ✅（`0051_calendar_reference_detach`、`0052_chat_turn_requests`、`0053_goal_tasks`、`0054_focus_start_payload`、`0055_focus_calendar_terminal_repair`、`0056_admin_collection_creation_requests`、`0057_connector_authorizations`、`0058_connector_leases`、`0059_admin_workbench_permissions`、`0060_workbench_route_menu_registration`、`0061_knowledge_favorite_operations`）。

### 迁移后复验（真实管理员会话）
- `/api/admin/menus`：**32 行**（迁移前 26），6 个新 id 全部存在；两个组根均 `0x0`；工作区 `position` `0`–`18` 唯一；`menu-boards`/`menu-inbox` = `0x100000`；`menu-environments` = `0x200000`，与本地已迁移库逐行一致。
- `/api/navigation`：**29 条 path**（迁移前 23），包含 `/graph`、`/calendar`、`/today`、`/focus`、`/review`、`/environments`。
- 真实侧栏（页面 reload 后）出现 `/calendar`、`/today`、`/focus`、`/review`、`/environments` 与 admin 子树；`/today` 页面在真实标签页正常渲染。
- 只读回归全部 `200`：`/api/tasks`、`/api/goals`、`/api/projects`、`/api/inbox`、`/api/notifications`、`/api/discussions`、`/api/environments`、`/api/graph`、`/api/admin/menus`、`/api/knowledge/<id>/favorite`、`/api/calendar/events?from=&to=`。`/api/boards` 的 `404` 属预期：代码中不存在该服务端路由（看板由 `/api/tasks` 提供）。

### 观察到一处数据状态分歧（未处理，待决策）
- 生产 `role-contributor.allow_bits = 0x600c3`（**无** bit20 `workspace.tasks`），而迁移重建的意图与本地库均为 `0x1600c3`。`0032_workspace_tasks.sql` 的补挂语句是条件更新（`WHERE allow_bits='0x600c3'`）且早已记录为已应用，故在生产**无法再次生效**。
- 影响（由掩码推断，未取得 contributor 会话）：`0060` 将 `menu-boards`/`menu-inbox` 收紧为 `0x100000`，叠加既有 `0x100000` 的 `tasks/goals/projects/graph/calendar/today/focus/review`，生产 contributor 侧栏将**不显示**这些入口，而本地 contributor（`0x1600c3`）仍显示。
- 处置需用户决策：新增前向迁移（如 `0062`）把 `role-contributor` 由 `0x600c3` 对齐到 `0x1600c3`，或确认生产上有意不给 contributor `workspace.tasks`。

### 非声明
- 回滚点已记录但**未演练**；本轮只应用远程 D1 迁移，未做任何部署。
- 不构成 D05 双身份验收（无第二个真实身份）与 D06 完整矩阵；contributor 侧效果为掩码推断而非实测。

## 迁移后复验：流水线已按新命令发布（2026-10-11）

用户把 Workers Builds 的**部署命令**改为 `npm run release` 后，发布链在**我手动执行之前**就已完成应用与部署：本轮手动 `npm run db:migrate:remote` 返回 `✅ No migrations to apply!`，属空操作（无重复应用）。

### 生产证据
- 台账第 62 行：`0062_contributor_workspace_tasks_alignment.sql`，`applied_at = 2026-10-11 12:06:05`（由新命令的迁移步写入）。
- 真实管理员会话 `GET /api/admin/roles` → `role-contributor.allowBits = 0x1600c3`（迁移前生产为 `0x600c3`）；`role-admin = 0x37ffff` 未变。
- `GET /api/admin/menus` → 32 行；`GET /api/navigation` → 29 条 path 且含 `/review`（`0062` 只改掩码、不改菜单，符合预期）。
- 线上产物 `assets/index-BpYetGvB.js` = `b75c48e58b8f`、`assets/index-BsQmnhdo.css` = `f6b14b39028c`，与本分支本地构建仍逐字节一致（本轮提交不涉及前端代码）。
- `0062` 应用后远程无待应用迁移。

### 回滚点登记的诚实边界
- 本轮开始时抓到的 bookmark `0000015d-0000003a-00005101-b22451fabf11fb3d87173e1d0519be96` 已是 **`0062` 之后**的状态，**不构成 `0062` 的回滚点**；`0051`–`0061` 批量之前那枚 `0000015a-00000000-00005101-602a6f5e08b1fbb7233d7e2fafa8d39e` 同样早于本批。
- `0062` 的语义是单条确定性掩码更新；如需回退，正确做法是前向修正（或 Time Travel 回到流水线发布之前的时点），而非依赖上述 bookmark。

### 非声明
- 未执行部署（发布由用户流水线完成）；本轮手动迁移为空操作。
- contributor 侧栏效果仍为**掩码与菜单规则推断**（无 contributor 会话，未实测真实身份）。
