# Production D1 Catch-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复生产 schema 停在 0032 导致的通知/消息 500，同时避免把已发现的关联删除缺陷带入完整发布。

**Architecture:** 先审查不可变的 0033–0050 并在本地 Workerd 演练，再追加修复迁移。生产严格按账本顺序升级；迁移前独立备份，失败后按实际已提交前缀决定续跑，不把代码回滚当作数据库回滚。

**Tech Stack:** Cloudflare D1 / Wrangler 4.119.0 / Workerd / Vitest / TypeScript。

**Spec:** `docs/product/2026-09-17-production-browser-acceptance.md` 的生产阻塞与原子后续清单；约束继承 `docs/operations/m1-release.md`、`ROADMAP.md`。

## Global Constraints

- 全部使用 Cloudflare 免费产品；不新增付费资源，不调用 AI provider，不升级套餐。
- 每个用户数据独立；不能通过允许 `calendar_events.member_id` 为 NULL 修复删除问题。
- 已有迁移只追加、不改写。保留 OAuth、Session、角色权限、DO、R2 和用户正文。
- Task 1/2 已完成只读诊断和本地实现；本次“进入下一环节”承接 Task 3 指定外部目录的备份请求。内容导出已获范围授权，但含虚拟表的导出兼容性和停写窗口未过关，未执行导出；不授权删表、apply、restore、部署或写入生产测试业务数据。
- 备份/迁移/恢复是不同动作，须分别明确范围；恢复整库会影响书签之后的数据，不自动执行。
- 本地测试、提交、main 合并、Worker 部署、D1 升级、生产验收分别记录，不互相代替。

## 当前结论（2026-09-17）

**Task 2 本地完成；Task 3 替代方案的合成可行性验证通过，生产门禁仍未通过。** 18 个历史迁移已完成审查；追加 0051 的本地演练及回归见[本地修复证据](../../product/2026-09-17-calendar-reference-detach-evidence.md)。上轮刷新生产账本为 32，pending 为 19；两个 FTS 虚拟表触及官方标准导出限制，见[备份预检证据](../../operations/evidence/2026-09-17-production-d1-backup-preflight.md)。本轮没有连接生产，已完成不删源表的逻辑备份/空库恢复 spike：13 项本地合成检查通过，见[方案与证据](../../operations/evidence/2026-09-17-d1-logical-backup-spike.md)。仍需正式工具、远程只读传输验证、完整停写和受控内容恢复演练；未产生独立生产备份，未执行迁移或部署。恢复书签不等于独立备份，本地通过不代表线上 500 已恢复。

工作目录：`/Users/doug/ai/system/cf-computer-agent/.worktrees/admin-audit-recovery`，分支 `codex/admin-audit-recovery`。Task 3 刷新时 HEAD/origin/main 本地引用为 `cef7625`，main 已推进至 `4f3f013`（六份图谱规划文档）；未 fetch/合并，发布前须重新核对来源。

### Task 1 只读生产证据（Task 2 未重新查询生产）

- 数据库：`memory-garden-control-plane`，ID `653c9e43-c7ad-45b8-a109-bc144843bee7`。
- `SELECT id, name, applied_at FROM d1_migrations ORDER BY id`：连续 1–32，名称与本地前 32 个文件一致，末条为 `0032_workspace_tasks.sql`。账本不保存历史文件 SHA，不能据此证明远程执行字节完全相同。
- `tasks` 存在且没有 `status_version`；检查的 notifications、discussion_threads、browser_environments、environment_operation_receipts、goals、projects 均不存在。
- 聚合计数：tasks=0、assets=0、members=1；不读取成员邮箱或业务正文。D1 size_after=1212416 字节。
- `PRAGMA foreign_key_check` 返回空；六个新增菜单的 id/key/path 冲突查询返回空。
- 本轮所有 D1 SQL 返回 `changed_db=false`、`rows_written=0`。
- Time Travel info 能返回当前 bookmark；这只证明可读取恢复标记，不代表已演练恢复。实际迁移前须重新获取，不复用本次旧标记。
- Worker 版本与 Git SHA 对应关系仍未建立；沿用浏览器验收报告中的版本证据，不宣称同版本完整验收。

### 逐个迁移审查

| 迁移 | 变更/依赖 | 数据、权限与恢复关注点 |
| --- | --- | --- |
| 0033 | assets、tasks 分页索引 | 不改业务列；构建索引会消耗读写；当前两表聚合为 0 行 |
| 0034 | 看板、通知、消息菜单 | canonical 行保留；不兼容 id/key/path 冲突会失败，不允许删除生产菜单绕过 |
| 0035 | 协作菜单 position 更新 | 会覆盖系统菜单位置；不修改 visible/status/required_bits |
| 0036 | tasks.status_version、通知、通知意图和触发器 | 旧任务默认版本 0；不补发历史状态；ALTER 不可裸重放，须通过迁移账本 |
| 0037 | 讨论表、授权投影、view 和同步触发器 | 依赖 tasks/knowledge/revisions/spaces；参与记录不扩权；私有任务按 owner 投影 |
| 0038 | inbox_items 和菜单 | member/client_key 唯一；INSERT OR IGNORE 可能掩盖菜单冲突，执行前后都检查 |
| 0039 | goals 和菜单 | owner 隔离、member/client_key 唯一；菜单要求现有任务权限位，不给角色新增授权 |
| 0040 | projects、project_goals、project_tasks 和菜单 | 依赖 goals/tasks；关系所有权还依赖服务校验，建表不等于 IDOR 验收 |
| 0041 | task_subtasks/task_dependencies | tasks(id, member_id) 唯一索引及复合 FK 保持成员匹配 |
| 0042 | calendar_events | **发现缺陷**：复合 FK 的 SET NULL 包含非空 member_id；已复现关联任务删除失败，需前置修复 |
| 0043 | focus_sessions | 依赖 tasks 复合键；每成员唯一未结束 session；不启动任何真实计时任务 |
| 0044 | workbench_review_snapshots | 每成员/周期唯一，不创建历史快照 |
| 0045 | inbox_classifications | 依赖 inbox_items；仅表结构，不调用 AI、不自动分类 |
| 0046 | project_timeline_items | 依赖 projects(id,member_id)；保留 member/client_key 去重 |
| 0047 | browser_environments、create receipts | 仅元数据和幂等响应；不启动 VM，不赋予默认角色权限 |
| 0048 | create receipts → operation receipts、tombstones、task detach trigger | 复制后 DROP 旧 receipt 表；必须验证原响应/哈希/成员保留，不能逆向删表回退 |
| 0049 | 重建 operation receipts/tombstones，增加 runtime heads | 保留 receipt sequence；tombstones 按删除顺序生成序号；不把水位当 VM 实时状态 |
| 0050 | 重建 notifications 放宽事件和目标 CHECK | 显式复制全部列、已读状态与去重键、重建索引；不补发历史审核通知 |

0033–0050 不修改 roles 授权位，不更改 Session、OAuth、DO 或 R2；其中菜单导航变化不等于业务权限放宽。0048/0049/0050 的旧表删除是正向迁移内部操作，不得单独执行。

### 本地证据和边界

- `rtk npm run verify:m1:migrations -- --files`：50 个文件哈希匹配。
- `migrations.test.ts`、`review-notifications-migration.test.ts`、`notifications.test.ts`、`discussions.test.ts`、`environments.test.ts`：5 文件 143 项通过；包括 0048/0049 receipt 保留和 0050 通知保留。
- 新增 `test/worker/production-catchup-migration.test.ts`：3 项通过。其中 2 项验证 0032→0050 旧 member/task/tag/role 保留、迁移账本重复调用、通知意图/讨论授权投影、0034 冲突中止与修正合成夹具后续跑。
- 第 3 项是**已知缺陷诊断**：断言真实 D1 返回 `NOT NULL constraint failed: calendar_events.member_id`，并验证事务没有删除任务或破坏日历。它不是产品验收通过；修复后必须替换为成功删除与保留日历的断言。
- 使用合成数据，没有导入生产备份；未做真实恢复演练。测试 helper 的追踪重放不是生产 Wrangler 账本验证器。
- 旧 `verify-m1-migrations.mjs --ledger-before` 只接受历史 M1 的 3 条前缀；不能拿它验证本次 32 条账本，也不能为求通过改写生产账本。
- 文档同步后的 `rtk npm run typecheck`、`rtk npm run verify:delivery-status`（28 项）及 `rtk git diff --check` 通过；不包含生产修复或真实用户写入验收。

## Task 1：审查和升级演练

**Files:** 本计划、`test/worker/production-catchup-migration.test.ts`、生产浏览器验收记录。

**Interfaces:** consumes 不可变迁移与只读元数据；produces 上述风险表、诊断和门禁。

- [x] 校验 50 个本地文件并逐个审查待执行的 18 个迁移。
- [x] 核对生产账本、tasks 列、菜单冲突、聚合数据量和外键完整性。
- [x] 核实 Time Travel info 可用；不执行 restore。
- [x] 运行保留、重复调用、冲突中止、续跑与关联删除诊断。
- [x] 记录 apply 的失败语义：失败迁移回滚，之前成功迁移保持已应用。

## Task 2：追加修复日历关联删除（本地完成，未提交/部署）

**Files:** 新增 `migrations/0051_calendar_reference_detach.sql`（先检查编号未被他人使用）；修改 `test/worker/production-catchup-migration.test.ts`；扩充 `test/worker/calendar.test.ts`、`test/worker/tasks.test.ts`；同步 `scripts/verify-m1-migrations.mjs` 和所有迁移总数/manifest 合同。

**Interfaces:** consumes 0042 的复合外键和 tasks/projects 所有权；produces 删除 parent 前只清空可选引用的触发器，保持 member_id 与日历事件。

- [x] 将诊断用例改成删除成功、task_id=NULL、member_id/title/其他字段不变、任务确实消失；运行并确认 RED（7 项失败、18 项通过；HTTP 删除返回 500）。
- [x] 增加关联 project 删除、其他成员数据不变、task 同时被日历与 browser_environment 引用、删除批次因后续 CHECK 失败时 detach 一并回滚的测试。
- [x] 追加以下触发器，不修改 0042、不允许 member_id 为 NULL：

```sql
CREATE TRIGGER calendar_detach_task BEFORE DELETE ON tasks
BEGIN
  UPDATE calendar_events
  SET task_id = NULL,
      updated_at = MAX(updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  WHERE task_id = OLD.id AND member_id = OLD.member_id;
END;

CREATE TRIGGER calendar_detach_project BEFORE DELETE ON projects
BEGIN
  UPDATE calendar_events
  SET project_id = NULL,
      updated_at = MAX(updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  WHERE project_id = OLD.id AND member_id = OLD.member_id;
END;
```

- [x] 对 32→51、50→51 两个起点运行保留/引用/重放测试；旧 50 个文件字节不变。
- [x] 同步 manifest/hash/count 合同。增加独立 `--ledger-catchup-before`（精确 32 条）和 `--ledger-catchup-after`（精确 51 条）检查及测试，不将 32 条放宽为旧 M1 合法状态；保留历史 after 前缀并支持最新 51 条。遇缺号、额外行、重命名或错误 success 必须失败。
- [x] 运行以下本地验证：Worker 8 文件 168 项；smoke 51 项、i18n 13 项、交付合同 28 项；51 个 SQL hash、typecheck、diff whitespace 检查通过。首次 sandbox smoke 因 loopback listen EPERM 失败，授权重跑通过；未改测试绕过断言。

```bash
rtk npm run verify:m1:migrations -- --files
rtk proxy npx vitest run test/worker/production-catchup-migration.test.ts test/worker/review-notifications-migration.test.ts test/worker/migrations.test.ts test/worker/calendar.test.ts test/worker/tasks.test.ts test/worker/environments.test.ts test/worker/notifications.test.ts test/worker/discussions.test.ts
rtk npm run test:smoke
rtk npm run typecheck
rtk git diff --check
```

- [x] 交付修复 diff 和上述本地验证证据；代码保留工作区，未提交。仅按用户后续明确要求提交，push/自动部署不包含在本地修复授权内。

## Task 3：生产窗口和备份（独立授权门）

**Files:** 新建实际执行日的脱敏 operations evidence；完整 SQL 备份只能放仓库外受限目录。

**Interfaces:** consumes 已复核候选、32 条账本和修复后迁移集合；produces 已授权窗口、备份摘要、临近执行的恢复书签。

- [x] 获得指定 D1 和仓库外目录的备份范围授权；不包含迁移、恢复、删表或部署。
- [ ] 明确短暂不可用窗口与风险；生产 0033 起的完整迁移批次另行批准。
- [ ] 建立受控停写并排空在途请求，覆盖前台、其他部署、Cron/后台写者及鉴权的 last_seen 隐式写入。仓库每五分钟会执行 asset parse sweep；不能仅关闭浏览器、只拦截 POST 或凭上次 assets=0 宣称冻结。生产启用停写另行授权。
- [x] 刷新候选 Git SHA、Worker version/DB binding、51 文件 manifest 和完整 pending 清单。main 文档推进、Worker 与 Git 对应缺口见预检证据；后续执行前须再核对。
- [x] 核实生产存在 `chunks_fts`、`chunks_fts_shared`；官方文档确认含虚拟表数据库不支持标准导出。停止原导出路径，不采用删表绕行。
- [x] 先设计并本地验证不删生产表的备份恢复替代方案：32/51 两套合成结构、FTS、约束/触发器和失败场景共 13 项通过；只证明临时 spike 可行，不能假设 `--table` 绕过数据库级限制。
- [x] 候选逻辑备份已进入正式工具本地实现：完整 manifest、篡改/截断、资源上限、不支持结构、只读传输离线测试及隔离恢复共 21 项通过；见[本地工具证据](../../operations/evidence/2026-09-18-d1-backup-tooling.md)。不包含真实远程传输或真实内容恢复验证。
- [x] 已确认并实现本地持久化维护协调器与生命周期适配器，28 项合成测试通过，见[2026-09-19 证据](../../operations/evidence/2026-09-19-maintenance-coordinator.md)。仅有本地 `DRAINED`，没有真实应用入口接入、控制鉴权或生产 `FROZEN`；不勾选受控停写门禁。
- [ ] 单独批准并完成远程合成只读传输验证，确认权限、PRAGMA/编码、真实响应格式；不能把离线 HTTP fixture 当成远程兼容性证据。
- [ ] 独立批准完整停写方案、真实内容导出方式和窗口；两次扫描摘要相同不构成快照保证。全库包含会话和私有数据，需明确受限存储/保留策略，不将临时文件视为长期备份。
- [ ] 重新批准准确备份路径与保管策略；正式工具要求仓库外的父目录已存在、最终归档目录不存在，由工具独占创建 0700 目录及 0600 文件。不要沿用旧流程预先创建最终目录；若已存在，不覆盖。临时目录不是长期备份。
- [ ] 下列原标准导出步骤因虚拟表限制暂停，仅保留历史意图，**当前不可执行**；替代方案通过审查前不创建备份文件。不得读取、打印、提交、附件上传备份正文：

```bash
rtk proxy npx wrangler d1 export memory-garden-control-plane --remote --output /private/tmp/workbench-d1-catchup-20260917/pre-migration.sql
rtk chmod 600 /private/tmp/workbench-d1-catchup-20260917/pre-migration.sql
rtk shasum -a 256 /private/tmp/workbench-d1-catchup-20260917/pre-migration.sql
rtk wc -c /private/tmp/workbench-d1-catchup-20260917/pre-migration.sql
rtk proxy npx wrangler d1 time-travel info memory-garden-control-plane --json
```

- [ ] 记录导出成功、字节数、摘要、UTC 时间、bookmark；导出失败/空文件必须中止。Time Travel 不替代项目现有 runbook 要求的独立导出；临时目录不是长期备份。
- [x] 获取当前只读 Time Travel bookmark，记录于预检证据；不视为独立备份或恢复验证。
- [ ] 核对替代方案的虚拟表重建与受控恢复演练结果；未经验证不能把“导出成功”称为“恢复已验证”。官方文档本轮已通过直接获取 Markdown 核实标准导出限制。

## Task 4：授权执行与失败处理

**Files:** 只写脱敏 evidence，不编辑已应用 SQL。

**Interfaces:** consumes 新鲜备份/已批准 hash 集合/真实账本；produces 每个迁移退出状态和最终账本。

- [ ] Task 3 新鲜生产查询确认 pending 为 **19 个（0033–0051）**；执行前仍须重新核对生产账本、pending 和批准 hash，不代表已获生产迁移授权。
- [ ] 实际执行前再次列出 pending，确保没有计划外文件。CLI 没有本次核实到的 `--to` 选项，不假造分段 apply 命令，不裸执行 SQL 绕过账本。

```bash
rtk proxy npx wrangler d1 migrations list memory-garden-control-plane --remote
rtk proxy npx wrangler d1 migrations apply memory-garden-control-plane --remote
```

- [ ] apply 只有通过 Task 2/3 且获生产迁移授权后才能执行。非交互环境会跳过确认，不得把 CLI 无提示当作用户授权。
- [ ] 一旦失败立即停止；查询真实账本和必要结构。保留成功前缀，确认失败项整体回滚；不盲目重复，不更改旧 SQL，不删除 migration 记录。
- [ ] 仅在失败原因解决、结构无部分残留且 hash 未变时申请续跑。复杂结构损坏或用户数据异常时先隔离写者，另行审批恢复；不得自动 Time Travel restore。
- [ ] Worker rollback 不撤销 D1；整库恢复也不恢复 R2/DO/外部行为。书签后新增数据可能回退，必须先评估损失与保存办法。

## Task 5：同版本生产复验

**Files:** `docs/product/2026-09-17-production-browser-acceptance.md`、新的 operations evidence、`ROADMAP.md`、`docs/product/delivery-status-ledger.md`。

**Interfaces:** consumes 51 条精确账本和当前 Worker 版本；produces requestId/状态/界面证据，未覆盖范围继续开放。

- [ ] 账本精确 0001–0051；检查 notifications 的 CHECK/三个索引、discussion tables/view/triggers、tasks.status_version、calendar detach triggers；`PRAGMA foreign_key_check` 空。
- [ ] 不用生产直写探针：在已登录浏览器复测 `/api/notifications?page=1&pageSize=20`、`/api/notifications/summary`、`/api/discussions?limit=20`，必须成功且 UI 不显示失败/伪空数据。
- [ ] 用单独授权的合成业务记录验任务→日历→删除保留，三种审核决定→通知→已读重放→当前目标权限。生产清理测试记录也须限定对象，不删除真实数据。
- [ ] 使用真实第二个受邀用户验跨用户拒绝；当前只有一个成员，不伪造身份。
- [ ] 补数字多页、语言、移动视觉、键盘焦点及失败恢复。OAuth 展示名称与任务筛选枚举仍是独立待办。
- [ ] 只有准确的 version/Git 来源和真实旅程均有证据才提升发布/验收；D02、R6-003、D3/D4 不因迁移成功自动关闭。

## Task 6：防止再次“代码上线、schema 落后”

- [ ] 只读确认实际自动部署平台和构建命令；仓库没有 `.github/workflows`，不能假定 GitHub Actions 是部署源。
- [ ] 针对该平台设计“候选迁移 hash + schema 前缀 + 明确生产批准 + 同版本验收”发布门禁。不要直接把不受审批的 remote apply 接入每次 push。
- [ ] 门禁本地负测必须覆盖 missing migration、错误 DB binding、历史 hash 漂移、额外迁移；真正修改自动部署配置需单独授权。

## 自审与停点

- [x] 每个历史待执行迁移有依赖/数据/权限/恢复审查项。
- [x] 已知 0042 缺陷独立记录，没有被绿色诊断测试掩盖。
- [x] 没有将备份、迁移、整库恢复混为同一个批准动作。
- [x] 当前没有生产 mutation、内容导出或部署；Task 2 交付仅本地 SQL、校验脚本、测试和文档，未提交。
- [x] Task 2 本地修复完成；Task 3 已有正式工具、合成恢复回归和本地维护协调器，进度见[维护设计](../../operations/d1-backup-maintenance-design.md)。真实入口接入、远程传输验证、受控停写和真实备份恢复门仍开放，独立生产备份未产生；不跳到 apply。
