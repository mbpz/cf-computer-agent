# 发布前材料（2026-10-16 批）——由用户执行部署

日期：2026-10-16。状态：**发布准备材料**。本文件由本地门禁产出，供用户在部署时逐项执行与核对；它不声称部署完成，也不替代 signed-browser 验收。

## 0.1 2026-10-17 部署记录（本批）

- 本地门禁：`npm test` 全绿（78 文件 / 1304 测试），`npm run build` 通过（dry-run 上传 1687.03 KiB / gzip 320.20 KiB）。
- 迁移：`wrangler d1 migrations apply DB --remote` 应用 **`0074_knowledge_family_menu_nesting.sql`**（执行前 `migrations list --remote` 显示待应用仅此一条；执行 3 条命令）。
- Worker：`wrangler deploy` 上线，版本 **`9a4da2ea-a179-43ee-bb9e-345517ef4632`**，自定义域 `memory.crgmhrc.asia`。
- 生产核验（contributor 会话，真实冷加载与真实点击）：`/api/navigation` 已是 `workspace → knowledge → [search, agent, submit, my-submissions]`；桌面侧栏展开「AI 知识库」得四个二级项；首页指向 `/submit` 的入口收敛为 1 个；`/knowledge` 分享按钮 24×32；移动抽屉「打开导航」→「工作区导航」焦点进入面板、Escape 关闭并把焦点归还触发器。逐项证据见 `docs/product/2026-10-16-beui-interaction-acceptance.md` §5。
- 仍未覆盖（见同文档 §6）：移动抽屉为**既有平铺**设计（未体现知识族嵌套）；320/768/1280 视口与英文；不可逆管理写入。

## 0. 2026-10-16 第二轮（首次部署后的追加）

首次部署完成并做了真实双角色验收（记录见 `docs/operations/evidence/2026-10-16-production-acceptance.md`）。验收找出并已修复三项：**purge 在条目被成员标注过时会整体中止**（现在显式删除无级联的成员关系，不可逆性归 purge）；**收藏删除缺少可读性门禁**（回收窗口内曾被接受并无法恢复）；**阅读器在正文自带一级标题时出现两个 h1**（现在仅在源文最浅标题是 h1 时整体降一级）。此外补上**草稿放弃**（`DELETE /api/submissions/drafts/:id`，迁移 0073，界面带确认与"结果未知→复查"状态）。

**部署注意**：本轮带来迁移 **0073**（其余 0064–0072 已应用，`wrangler d1 migrations list --remote` 已核对）；此外 **0074** 为纯导航结构调整（知识族归入一个一级菜单，见 §1.1）；服务端行为有三处变化——purge 现在真的会删除成员标注数据（此前是中止）、收藏删除在不可读时返回 404、已回收条目的笔记不再可读。前端方面阅读器正文标题层级会整体下移一级。

**实测体积（本轮构建）**：Worker 上传 **1686.61 KiB / gzip 320.03 KiB**；前端静态资源仍约 4.8 MB（最大单文件 2.2 MB 主包，均远低于 25 MiB/文件上限）；VM 引擎与镜像仍不发布。

**验收状态**：管理员与 contributor 两个会话均已完成并记录（31 个入口冷加载、写入旅程、禁止访问面与隔离、撤权往返）。**待办**：部署本轮后重测"回收→恢复"往返（验收记录 §9 的观察在构建证据上不可复现，需重测定论），并确认 0073 已应用。

## 1. 待部署内容

### 1.1 迁移（增量，全部为新增表/新增列/替换触发器，无破坏性 schema 变更）

| 迁移 | 用途 | 风险 |
| --- | --- | --- |
| `0064_role_operation_receipts.sql` | 角色创建的操作回执（单一写者：管理端角色） | 新表 |
| `0065_workbench_write_convergence.sql` | `knowledge_visits.visit_identity`（阅读访问去重）、`saved_views.client_key` + 部分唯一索引、`saved_view_delete_receipts` | 新增可空列 + 新表；索引为部分索引 |
| `0066_task_delete_tombstones.sql` | 任务删除墓碑（`(member_id, task_id)` 主键，30 天保留，与 `TRASH_RETENTION_MS` 同尺度） | 新表；不改变 `tasks` 的删除语义 |
| `0067_menu_operation_receipts.sql` | 菜单创建/删除回执（全局命名空间，`actor_id` 无外键以便回执存活） | 新表 |
| `0068_task_status_intent_dedup.sql` | 重建 `trg_tasks_status_notification_intent` 为 `INSERT OR IGNORE` | **替换触发器**；修复"修复流程回滚 `status_version` 后下一次状态写入因唯一约束失败"的缺陷；去重语义不变 |
| `0069_review_decision_receipts.sql` | 审核决策回执（publish/reject/request_revision 三类，队列与详情共用同一 `operation_id`） | 新表 |
| `0070_knowledge_lifecycle_operation_receipts.sql` | 知识生命周期回执（trash/restore/purge/rollback 四类，回执令"已提交的操作"重放而非二次执行） | 新表 |
| `0071_admin_operation_receipts.sql` | 管理操作回执（孤儿资产回收等管理端操作；purge 重放亦依赖此日志） | 新表 |
| `0072_knowledge_recycle_bin_menu.sql` | 回收站菜单行 seed（`menu-recycle-bin`，`required_bits` 与 `knowledge:review` 同掩码，`WHERE NOT EXISTS` 守卫） | 新增菜单行 |
| `0073_submission_draft_discard_receipts.sql` | 草稿放弃回执（成员作用域，使"已提交的删除"不会被报为不存在） | 新表 |
| `0074_knowledge_family_menu_nesting.sql` | 把 `menu-submit`/`menu-my-submissions` 归入 `menu-knowledge`（与 0031 已归入的 `/search`、`/agent` 合成一个一级菜单"AI 知识库"） | 纯导航结构；URL、标签、掩码、可见性均不变；仅移动系统行并保留管理员自建行的归属 |

迁移字节已 pin 在 `scripts/verify-m1-migrations.mjs` 与 `scripts/m1-release-contract.test.mjs`；发布前请以 `npm run verify:m1:migrations -- --files` 与 `node --test scripts/m1-release-contract.test.mjs` 复核（本地均为 pass，`count=74`）。

### 1.2 代码面（按菜单）

- 工作台/知识/工作/协作：头部与筛选统一为共享组合、壳常驻；写入收敛（稳定客户端键/条件写）与撤权呈现；阅读器二级对象重新授权与访问去重；首页改为权威指标 + 游标续载；图谱新增下钻与续载（含服务端游标支持）。
- 管理端：角色/菜单/成员/审核决策的写入收敛与回执；**两项真实安全修复**——`GET /api/admin/roles` 之前缺少管理员校验（提权贡献者角色可读取角色列表与已分配成员），`/api/navigation` 之前会把 `admin` 菜单组泄露给提权掩码；审核列表四态可达与只读"相关实体"链接。
- 新增能力面：阅读器的 AI 衍生面（9 个生成器 + 研究运行生命周期）、成员侧提交闭环（服务端草稿/重提/评论/目标选择/资产扩展）。
- 环境页：接线运行时提供者与文件面，但因下述决策不发布运行时，页面显示"本版本未发布运行时"，启动控件禁用且给出原因。

### 1.3 明确不部署

**VM 引擎与镜像（v86 wasm、BIOS、内核/initrd、49 MiB Alpine ISO，合计约 66 MiB）不在本次范围**（2026-10-16 决策）：`tools/browser-vm/alpine-iso.mjs` 的 pin 明确不授予再分发许可，也不替代许可证清单、可复现构建与签名发布清单。相关模块保留在树上并保持未挂载（审计分类 `vm-runtime-unshipped`）。

## 2. 发布前必须通过的本地门禁

| 命令 | 覆盖 |
| --- | --- |
| `npm run typecheck` | worker + frontend 类型 |
| `npm test` | smoke（脚本合同、WCAG、App 合同、操作清单、i18n、台账校验）→ i18n → 单元 → worker |
| `npm run build:ui` | 前端构建（含 `deferredVmChunks` 校验） |
| `npm run verify:m1:migrations -- --files` | 迁移字节与清单 |
| `node --test scripts/m1-release-contract.test.mjs` | 发布合同与台账前缀 |
| `npm run audit:workbench-domain` | 域证据与操作声明一对一 |
| `node --test scripts/frontend-operation-inventory.test.mjs` | 未归属候选与指纹 |

## 3. 体积与免费层核算（本地实测）

- 前端静态资源合计 **4.8 MB**；最大文件为 eager 主包 `index-*.js` **2.0 MB**，其余按需：`workbench-jKGxDzq4.glb` 636K、`agent-highlighter` 584K、`workbench-scene-runtime` 580K、`cytoscape.esm` 424K、`index-*.css` 80K。**所有单文件均远低于静态资源 25 MiB/文件上限**。
- **未发布 VM 引擎/镜像，避免约 66 MiB**（其中 ISO 单文件 49 MiB 已超上限，仓库的分块镜像机制本可绕开，但许可与发布清单未批）。
- VM 运行时保持延迟分块（构建报告 `deferredVmChunks: ["assets/authenticated-vm-runtime-*.js"]`），未回压主包。
- 未测项：本批相对上一发布候选的主包体积**增量**未在本地测量（需要在新工作树构建上一提交才能对比）。静态资源在 Workers 上不按请求计费，故此项不影响免费层结论，但若你要做发布说明请补测。

## 4. 兼容性与破坏性变更（发布前需知）

| 变更 | 对已部署旧前端的影响 |
| --- | --- |
| `PATCH /api/tasks/:id` 与 `POST /api/tasks/:id/status` 现在**强制**要求 `expectedUpdatedAt` / `expectedStatus`，缺失返回 400 `TASK_INVALID` | **破坏性**：旧包在任务详情尚未加载时保存、或状态操作未带前置条件时会失败。这是刻意的 fail-closed 选择（此前会无条件写入并可能覆盖较新的修改）。本次前端已保证在版本未知前不提供提交路径。 |
| 审核决策接受 `operationId` / `expectedUpdatedAt`（均可选） | 兼容：旧包不传时行为与今天一致（自然身份收敛）。 |
| 菜单 `PATCH` 的 `expected` 快照仍为可选（未改为必填，未引入 428） | 兼容：旧包不传时仍由服务端读取整树 CAS 保证串行。 |
| 角色成员分配/移除不再返回 409 `ROLE_MEMBER_EXISTS` / 404 `ROLE_MEMBER_NOT_FOUND`，改为收敛成功并返回稳定授权集合 | 旧包若按这两个错误码分支，会落入通用错误路径（不产生错误数据）；本次前端已不再引用这两个码。 |
| 成员状态修改改为 409 `MEMBER_STATUS_CONFLICT` 并接受 `expectedStatus`；`ADMIN_PROTECTED` 403 仅保留给真实管理员目标 | 旧包不传前置条件时仍按"当前读取值"作条件（服务端读取），并发时可能出现新的 409。 |
| `DELETE /api/tasks/:id` 由 204 改为 **200 + `{tombstone:{taskId,deletedAt}}`** | 旧包若只判断 2xx 则无影响；若严格断言 204 需注意。 |
| 新增 `error.details` 通道（409 回带权威版本） | 兼容：可选字段。 |

## 5. 部署后验收清单（signed-browser，按菜单）

每条对应仓库缺口账中的 acceptance journey；两份角色都要走（admin 与 contributor），并单独验证撤权旅程。

1. **工作台外壳**：`/` 指标与各模块权威计数一致；recent 失败可重试并可继续翻页。
2. **知识**：`/knowledge` 主列表成功、辅助面（recent/favorite/note/activity/review）单独失败时各自可重试；`/knowledge/:id` 撤权后原文/笔记/分享/收藏/相关链接全部重新授权并安全降级；生成摘要等衍生面失败可原地重试且不渲染占位正文；重试同一次阅读不重复增加访问次数。
3. **搜索**：四个筛选（kind/作者/发布起止）在刷新与后退后保持，并可存入收藏视图；FTS 降级与打开结果的高亮一致。
4. **Agent**：无证据时明确拒答（不渲染空答案）；取消、断线、重试不丢会话；引用可回读。
5. **工作**：任务并发编辑冲突可见且重试不覆盖较新修改；删除重复只留一个墓碑；收集箱→任务入口的 11 条操作在权限/重复/失败恢复/权威回读上逐条通过；看板并发移动一个成功一个回滚；专注关标签页与跨标签边界；日历取消与编辑并发；图谱下钻与续载。
6. **协作**：已撤权通知显示明确失效态且未读数收敛；撤销上下文后 thread 从列表收缩、直达只显示可恢复撤权态、刷新与后退不再渲染私有消息。
7. **管理**：审核决策重复提交只产生一个 Revision/一条审计；跨会话菜单投影立即生效；禁用成员后其菜单与深链立即收缩；审计列表四态可达且只读链接可打开相关实体；统计日期范围与页码切换后刷新一致。
8. **提交闭环**：草稿跨刷新恢复并如实显示是否已存服务端；退回项重提后看到权威状态且重复提交不新增记录。
9. **环境页**：元数据管理与"运行中 VM"的区分保持不变，显示"本版本未发布运行时"且启动控件禁用有因。

## 6. 回滚

新增表与列为增量，替换触发器（0068）不破坏既有数据，因此回滚 = 重新部署上一版本代码；迁移无需回退即可保持（新表为空不影响旧代码）。若必须回退迁移，注意 0065 的 `knowledge_visits.visit_identity` 被阅读路径写入、0068 的触发器为去重保障——回退会同时失去这两处的收敛保证。
