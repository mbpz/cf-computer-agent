# 工作台菜单登记、标签注册表与权限隔离对账（0060）

日期：2026-10-11（本地 Asia/Shanghai）。核对基线：`main` / `7f6fef9247a48d5a51d77290df7b593a6a530f26`（HEAD 未移动）。工作区在本次开始前已带有另一批阅读器改动（`frontend/app.tsx`、`frontend/lib/knowledge-reader-data.ts` 等），本文只记录本次新增/修改的文件。

## 交付边界与结论

本轮补齐数据库驱动导航中缺失的就绪路由菜单行，补齐管理菜单标签注册表，统一导航行与共享路由注册表的权限掩码，并新增两个方向的注册表↔数据库完整性测试（先 RED 后 GREEN）。仅本地实现与验证：**没有远程迁移、没有部署、没有 push、没有 commit**；所有改动保留在工作区。

父清单未关闭任何条目：功能清单仍为 **29 范围内 / 5 已关闭 / 24 未关闭**。本文不修改 `docs/product/2026-09-12-personal-workbench-completion-audit.md` 的计数/复选框，也不关闭 D01/D04/D05/D06/D08。

## 缺口证据

### 方向 A：种子行的 label_key 不在规范注册表内

`shared/admin-menu-fields.ts:1-5` 的 `MENU_LABEL_KEYS` 原先只有 22 个键，而下列种子行引用了未登记的键：

| 种子行 | 位置 | label_key |
| --- | --- | --- |
| menu-tasks | `migrations/0032_workspace_tasks.sql:37` | NAV_TASKS |
| menu-boards / menu-notifications / menu-messages | `migrations/0034_workspace_coming_soon_menus.sql:8,18,28` | NAV_BOARDS / NAV_NOTIFICATIONS / NAV_MESSAGES |
| menu-inbox | `migrations/0038_workbench_inbox.sql:31` | NAV_INBOX |
| menu-goals | `migrations/0039_workbench_goals.sql:28` | NAV_GOALS |
| menu-projects | `migrations/0040_workbench_projects.sql:50` | NAV_PROJECTS |

后果：`src/authorization/menus-repository.ts:182` 对任何携带这些键的管理员 POST/PATCH 抛 400 `MENU_LABEL_KEY_INVALID`，`frontend/pages/admin/menu-editor.tsx:72` 的下拉框也无法提供这些键（下拉项直接来自 `MENU_LABEL_KEYS`）。种子行本身 `is_system=1`，因此 PATCH/DELETE 会先在 `menus-repository.ts:98` 以 `MENU_SYSTEM_IMMUTABLE` 失败，不存在线上抛错路径。

### 方向 B：就绪路由没有 menus 行

`shared/workspace-route-capabilities.ts` 中下列路由 `availability: "ready"`、有 i18n 文案、有页面与成熟度记录，但 `migrations/` 中没有任何对应行：

| 路由 | 注册表行 | 指定权限 |
| --- | --- | --- |
| /graph | `shared/workspace-route-capabilities.ts:38` | workspace.tasks |
| /calendar | 同上 `:42` | workspace.tasks |
| /today | 同上 `:43` | workspace.tasks |
| /focus | 同上 `:44` | workspace.tasks |
| /review | 同上 `:45` | workspace.tasks |
| /environments | 同上 `:48` | workspace.vm |

/graph 目前仅靠前端强制合并 `frontend/lib/navigation-data.ts:28` 的 `REQUIRED_WORKSPACE_ROUTE_IDS` 补偿；其余五个没有任何补偿。/settings（`:49`）由 `withoutSettings()` 从导航树中剥离，保持不登记。

### 权限隔离不一致

- `migrations/0034_workspace_coming_soon_menus.sql:8`（menu-boards）与 `migrations/0038_workbench_inbox.sql:32`（menu-inbox）种的是 `'0x0'`，而 `shared/workspace-route-capabilities.ts:46-47` 声明 `requiredPermission: "workspace.tasks"`（bit 20 = `0x100000`）。
- 工作区子项位置冲突：`0035` 设 boards=7 / notifications=8 / messages=9，`0039` 又种 goals=7、`0040` 种 projects=8，重复位置由 `src/authorization/menu-tree.ts:83` 的键名排序兜底。
- `migrations/0029_workspace_rbac.sql:62` 的 menu-admin（组根，`path` 为空）带 `0x200`（member:manage），其子行 `:63` menu-admin-overview（`/admin`）带 `0x100`（submission:read-all）。

## 权限判定与依据

### /inbox 与 /boards：注册表权限为准，收紧为 0x100000

- 路由守卫：`frontend/components/shell/app-shell.tsx:93` 用 `matchRoute(pathname)` 走 `frontend/lib/auth-boundary.ts` → `frontend/lib/route-access.ts`，`ROUTES`（`frontend/contracts/routes.ts:15`）即注册表本身；缺少 bit 20 时 `/inbox`、`/boards` 页面直接渲染 403 页面。
- 命令面板：`frontend/lib/command-palette.ts:16-18` 对 /tasks、/boards、/inbox 均以 `capability: "workspace.tasks"` 过滤。
- 接口：`src/routes/inbox.ts:20` 要求 `requireCapability(principal, "tasks:use")`，`src/authorization/policy.ts:94` 把 `tasks:use` 映射到 `workspace.tasks`；boards 复用任务接口（`src/routes/tasks.ts:20` 同样 `tasks:use`）。
- 测试基准：`test/unit/frontend-workbench-maturity-routes.test.tsx:69` 的 `PERMISSION_MASK_BY_ROUTE` 把 inbox/boards 都标为 `0x100000`。

结论：registry 权限是权威，只有 `0x0` 这一未经管理员覆盖的种子占位值被改为 `0x100000`（`0039:28` 的 goals、`0040:50` 的 projects 早已是 `0x100000`，可作同批先例）。`menu-notifications` / `menu-messages` 保持 `0x0`：注册表对这两条路由的 `capability` 为 `null`、无 `requiredPermission`，`0x0` 即正确值。

### menu-admin 组根：0x200 → 0x0

可证明的失败形态：`frontend/pages/admin/roles-page.tsx:22-23` 把 `submission:read-all`（bit 8）放在 SUBMISSIONS 组、`member:manage`（bit 9）放在 GOVERNANCE 组，二者可独立勾选，因此"有 bit 8 无 bit 9"的角色是产品可授权的形状。该角色：`/admin` 路由守卫通过（注册表 `admin` 行的 capability 是 `submission:read-all`），`src/authorization/policy.ts:94` 映射的读取接口也通过；但导航树在 `src/authorization/menu-tree.ts:86-89` 先判父行 `required_bits`，父行 `0x200` 不满足即整棵子树被丢弃，于是该角色在导航中**完全看不到 /admin**（且产品内没有第二个 /admin 入口）。

修正为 `0x0` 与既有约定一致（`menu-workspace`、`menu-governance` 两个组根都是 `0x0`，只要有任一子行可见就渲染组），对 role-admin（`0x37ffff`）与 role-contributor（`0x1600c3`）行为完全不变：contributor 没有任何管理子行可通过，组仍被丢弃（`test/worker/admin-menus.test.ts:63-64` 的 `["workspace"]` 断言继续通过）。导航可见性不等于接口授权，管理接口各自仍校验自身能力（既有断言 `test/worker/admin-menus.test.ts` "does not let navigation visibility grant API access"）。

### 未变更的既有不一致（记录，不在本轮范围）

`0031` 把 /search、/agent 挂到 menu-knowledge 下并把 label_key 改成 NAV_KNOWLEDGE_SEARCH / NAV_KNOWLEDGE_AGENT（与注册表 labelKey 不同），同时保留 `search:use` / `agent:use` 掩码（`0x40000` / `0x20000`）而注册表对这两条路由声明的是 `capability: "knowledge:read"`。这是有意的层级重命名与更严格的导航门，本轮不动；完整性测试因此只断言"每一行 label_key 属于注册表键集合"，不要求等于注册表 labelKey。

## 变更文件

| 文件 | 变化 |
| --- | --- |
| `shared/admin-menu-fields.ts` | +1 行：`MENU_LABEL_KEYS` 追加 12 个 NAV_* 键（纯追加，不重排/不删除） |
| `migrations/0060_workbench_route_menu_registration.sql` | 新增 123 行：6 条就绪路由种子行 + inbox/boards 掩码收紧 + menu-admin 组根掩码 + 工作区同级位置归一 |
| `test/unit/menu-registry-integrity.test.ts` | 新增 39 行（纯单元，无 D1） |
| `test/worker/menu-seed-integrity.test.ts` | 新增 132 行（真实本地 D1） |
| `test/worker/admin-menus.test.ts` | 3 行：贡献者导航键顺序期望更新为 0060 后的确定序列 |
| `test/worker/migrations.test.ts` | +57/-10：把 0034 断言里恒真的 coming_soon 半边替换为"种子↔就绪路由"关系；新增 0060 双重应用/管理字段保留测试 |
| `test/helpers/workbench-maturity-route-fixtures.ts` | +2 行注释：说明 fixture 的 `review` 键镜像注册表路由 id，而种子行键为 `workbench-review`（未重命名 fixture） |
| `scripts/verify-m1-migrations.mjs` | +1 行：`localMigrations` 追加 0060 固定哈希（0001-0051 历史清单未动） |
| `scripts/m1-release-contract.test.mjs` | 5 行：`expectedLocalMigrations` 追加 0060 哈希、`count=59`→`count=60`、未授权计数 `[52,59]`→`[52,59,60]` |

0060 的种子行（parent=`menu-workspace`，group_name=`workspace`，is_system=1，status=`active`，visible=1，created_at/updated_at=`1970-01-01T00:00:00.000Z`）：

| id | key | path | required_bits | position |
| --- | --- | --- | --- | --- |
| menu-graph | graph | /graph | 0x100000 | 13 |
| menu-calendar | calendar | /calendar | 0x100000 | 14 |
| menu-today | today | /today | 0x100000 | 15 |
| menu-focus | focus | /focus | 0x100000 | 16 |
| menu-workbench-review | workbench-review | /review | 0x100000 | 17 |
| menu-environments | environments | /environments | 0x200000 | 18 |

`menu-review`/`review` 已被 `migrations/0029_workspace_rbac.sql:64` 的管理员复核队列占用（id 与 key 均唯一），故工作区 /review 行改用与 `src/routes/workbench-review.ts`、`shared/workbench-maturity-capabilities.ts:302` 一致的 `workbench-review` 命名。每行使用 0034 式 `INSERT ... SELECT ... WHERE NOT EXISTS (...)`：重跑幂等，不兼容的 id/key/path 冲突会撞 UNIQUE 约束而中止，不静默分叉。位置归一（`UPDATE ... SET position = CASE id ... END`）只作用于 `parent_id='menu-workspace' AND group_name='workspace' AND is_system=1`，管理员自建行（is_system=0）不被覆盖；掩码修正同样只改仍为规范占位值（`0x0` / `0x200`）的行。已发布位置中 tasks=6、boards=7、notifications=8、messages=9、inbox=10 保持不变，goals/projects 从冲突的 7/8 移到 11/12。

位置归一的作用范围仅限数据库与管理编辑器确定性：前端对 graph/tasks/boards/notifications/messages 走 `REQUIRED_WORKSPACE_ROUTE_IDS` 的移除+按注册表顺序重加，因此这四/五条不会体现 0060 的位置；其余就绪行（calendar/today/focus/review/goals/projects/inbox/environments）的成员导航顺序由本次归一决定。

## 完整性测试与 RED → GREEN

新增断言（RED 阶段临时移除 0060 与 `MENU_LABEL_KEYS` 追加行，只回退本次修复）：

```sh
npx vitest run test/unit/menu-registry-integrity.test.ts test/worker/menu-seed-integrity.test.ts
```

RED 观察结果（`Test Files 2 failed (2) / Tests 6 failed | 2 passed (8)`）：

| 断言 | RED 输出（原文摘要） |
| --- | --- |
| 注册表键无重复 | 通过（RED 期也是通过：这是防回归守卫） |
| 每个路由 labelKey 均在 MENU_LABEL_KEYS（除记录在案的 /settings 例外） | `expected [ 'tasks:NAV_TASKS', …(11) ] to deeply equal []` |
| 例外表最小且已知 | `expected [ [ 'tasks', 'NAV_TASKS' ], …(12) ] to deeply equal [ [ 'settings', 'SHELL_SETTINGS' ] ]` |
| 每行 label_key ∈ MENU_LABEL_KEYS | `expected [ 'menu-tasks:NAV_TASKS', …(6) ] to deeply equal []` |
| 每个就绪路由恰有一行且掩码等于注册表权限 | `/graph must have exactly one seeded row: expected [] to have a length of 1 but got +0` |
| 每行 path 对应已知路由 | 通过（RED 期所有种子 path 都是已知路由） |
| 组根掩码不得严于其后代页面 | `menu-admin:0x200 hides menu-admin-overview:0x100`（共 9 条：overview/assets/duplicates 的 0x100、review 的 0x8、roles/menus/spaces/analytics/audit） |
| 系统同级位置唯一且工作区顺序确定 | `expected [ 'menu-workspace:7:menu-goals', …(1) ] to deeply equal []` |

GREEN 观察结果：同一命令 **8/8 通过**；含 `test/worker/admin-menus.test.ts`、`test/worker/migrations.test.ts`、`test/unit/menu-tree.test.ts`、`test/unit/frontend-navigation-data.test.ts`、`test/unit/frontend-shell.test.tsx`、`test/unit/workbench-modules.test.ts` 的定向集合为 **8 文件 76/76**。

### 追加断言一：0060 双重应用与管理字段保留（`test/worker/migrations.test.ts`）

流程：`MIGRATIONS.slice(0, -1)`（即 0001–0059）后，把系统行 menu-boards 预置为 `required_bits='0x1'`、`status='disabled'`、`visible=0`、`position=42`；随后用运行器对该文件的切分结果（9 条语句 = 6 条 INSERT + 3 条 UPDATE，`?raw`/文件字节均未被改写）连续执行两次，断言：

| 断言 | 内容 |
| --- | --- |
| 文件是最后一条迁移 | `MIGRATIONS[length-1].name === "0060_workbench_route_menu_registration.sql"`；语句数 9，其中 `INSERT INTO menus` 6 条 |
| (a) 二次应用无异常且无变化 | 首次执行后的 `menus` 全列快照与二次执行后逐行相等（`snapshot()` 比较 id/parent_id/key/label_key/path/icon/group_name/position/required_bits/status/visible/is_system） |
| (b) 管理字段不被覆盖 | menu-boards 仍为 `required_bits='0x1'`、`status='disabled'`、`visible=0`（条件 UPDATE 只命中规范 `'0x0'` 占位）；`position` 由无条件归一变 42→7 |
| (c) 新行恰 6 条 | 6 个新 id 计数 = 6（两次执行后不重复） |
| (d) 同级位置唯一 | `parent_id='menu-workspace' AND group_name='workspace' AND is_system=1` 共 17 行且 `COUNT(DISTINCT position)` = 17 |

absence-before RED：把 0060 文件移出 `migrations/` 后运行该测试，在守卫处失败 `expected '0059_admin_workbench_permissions.sql' to be '0060_workbench_route_menu_registration.sql'`（`Tests 1 failed | 28 skipped`）。另用一次性探针（已运行并删除，不留在仓库）观测到 0060 之前的前缀状态：menu-boards `position 7 / required_bits 0x0 / status active / visible 1`、menu-admin `0x200`、menu-inbox `0x0`、6 个新 id `count 0`、`path='/review'` 无行且 `key='review'` 指向 `/admin/submissions`、工作区 `count 11 / distinct_positions 9`（goals 与 projects 冲突）。因此若没有 0060：断言 (b) 会因预置的 42 未被归一而失败、(c) 得到 0≠6、(d) 得到 11/9≠17/17 —— 即该测试的断言集合在无 0060 时全部不成立（该探针文件已在运行后删除，仓库中不留临时脚手架）。

### 追加断言二：/review 命名例外被钉住（`test/worker/menu-seed-integrity.test.ts`）

读取真实行（不硬编码 id）后断言：`path='/review'` 的行的 `key` 必须为 `workbench-review`；拥有 `key='review'` 的行的 `path` 必须为 `/admin/submissions`。absence-before RED：移除 0060 时 `expected [] to deeply equal [ 'workbench-review' ]`（`Tests 1 failed | 5 skipped`）。另在 `test/helpers/workbench-maturity-route-fixtures.ts:100-101` 加了两行注释说明 fixture 键与种子行键的差异；grep 确认没有任何既有期望依赖该 fixture 的 `review` 键（`test/` 内 `"review"` 的出现都属于路由 id / 载荷 / 管理员复核队列，均不是该导航 fixture 的节点键），因此未重命名 fixture。

`coming_soon` 类型/分支保持不动：`shared/workspace-route-capabilities.ts:4` 的类型、`menuAvailability()`、`frontend/lib/navigation-data.ts:92` 的解析校验以及 `scripts/delivery-status-contract.test.mjs:295,303` 的 fixture 仍在消费它，并非死代码。

## 本轮验证

```sh
npm run typecheck                                    # typecheck:worker + typecheck:frontend
npx vitest run test/unit/menu-registry-integrity.test.ts test/worker/menu-seed-integrity.test.ts \
  test/worker/admin-menus.test.ts test/worker/migrations.test.ts test/unit/menu-tree.test.ts \
  test/unit/frontend-navigation-data.test.ts test/unit/frontend-shell.test.tsx test/unit/workbench-modules.test.ts
node scripts/verify-m1-migrations.mjs --files
node --test scripts/m1-release-contract.test.mjs
node scripts/verify-m1-docs.mjs --all
node --test scripts/delivery-status-contract.test.mjs scripts/workbench-maturity-contract.test.mjs \
  scripts/functional-checklist-audit.test.mjs scripts/i18n-contract.test.mjs
node scripts/verify-i18n.mjs
npm run check
```

观察到的结果：类型检查通过；定向测试（`test/unit/menu-registry-integrity.test.ts` + `test/worker/menu-seed-integrity.test.ts`）8/8，加入 `test/worker/migrations.test.ts` 后 3 文件 38/38；`--files` 输出 `[pass] migration-files count=60`；`m1-release-contract.test.mjs` 28/28；m1 文档合同 `[pass] m1-runbook evidence_blocks=14`、`[pass] m1-truth atoms=76 checked=76 unchecked=0`；交付状态 30/30、成熟度 15/15、功能清单 9/9、i18n 合同 13/13；`[pass] i18n keys=434 placeholders=55 files=6`、`[pass] i18n-hardcoded-copy ast=typescript html=dom`。

最终 `npm run check` **退出 0**（含追加断言后的最终变更集）：vendor:check 与 types:check 通过，typecheck（worker+frontend）与 typecheck:landing 通过；smoke 组 79/79、i18n 13/13、delivery-status 30/30；unit **360 文件 5146/5146**；worker **70 文件 1168/1168**（含本次新增的 2 条 worker 断言）；landing 97/97；`build` 阶段 `build:ui` + `verify:landing` + `build:secrets`（`[pass] build secret scan: frontend/dist`）+ `build:legacy-audit`（`[pass] legacy UI rollback files retained`）+ `wrangler deploy --dry-run`（Total Upload 1594.27 KiB / gzip 301.44 KiB，`--dry-run: exiting now.`）全部通过。构建产物落在 gitignore 的 `frontend/dist`，未污染受版本控制的文件。

## 未改动项与原因

- `docs/product/2026-09-12-personal-workbench-completion-audit.md:335`、`docs/product/2026-10-10-functional-gate-reconciliation-evidence.md:7`、`ROADMAP.md:9` 中的"迁移文件 59 项"均处于带日期的历史记录段落（如"2026-10-10 本地门禁对账"），不是当前状态总账，按"只更新声称当前状态的句子"的约定保留为历史；无任何脚本读取这些数字作为契约。功能清单计数/复选框一律不动。
- 未编辑任何既有 migration（0032/0034/0035/0038/0039/0040 等），其哈希受 `scripts/verify-m1-migrations.mjs` 与 `scripts/m1-release-contract.test.mjs` 双重固定；0060 在固定哈希后未再修改（RED 采集期间只会被临时移出/移回，每次均以 `shasum -a 256` 复核恢复为 `5e08342b4f3da3954b1d80c8014dcb96251f3bc1622b07769756d3ee60cc344a`）。
- RED 采集期使用的两个一次性探针测试（pre-0060 状态观测、执行策略探测）已在运行后删除，仓库中不留临时脚手架；`test/` 下无 `zz*` 文件。
- `frontend/lib/i18n.ts`：12 个 NAV_* 键在 en 与 zh-CN 两个目录中都已存在（各出现 2 次），无需改动；未触碰 `public/locales/*.js`。
- `worker-configuration.d.ts` 未改（由 `wrangler types` 生成，与本轮迁移无关）。
- `/settings`（SHELL_SETTINGS）继续保持不登记、不进 `MENU_LABEL_KEYS`，并在单元测试中作为唯一记录在案的例外被断言。

## 非声明

- 未关闭任何父清单条目：功能清单仍为 29 范围内 / 5 已关闭 / 24 未关闭。
- 未执行远程迁移、未部署、未 push、未 commit；未访问生产、Browser-VM 或 Secret；D1 只在本地测试夹具中应用。
- 未验证真实身份/浏览器/原生旅程；导航与权限结论来自本地 D1 迁移、共享注册表与既有前端守卫的源码与单测，不替代 D05/D06/D08 验收。
