# 阅读器 related/backlinks 独立重试与收藏服务端操作编号（本地）

日期：2026-10-11；分支 `codex/functional-checklist-completion`；基线 `a7e16c100297e9a5621f8103d5236725d6531964`。

## 范围与现状

本批只做两项本地实现：阅读器 related/backlinks 的**分节独立重试**（纯前端），以及收藏写入的**服务端唯一操作编号＋同编号安全重试＋精确查询结果**（迁移、仓库/服务/路由、前端接线）。原30父项、D08排除后本轮29、关闭5、开放24不变；**未关闭任何父项**。未 push、未部署、未做远程迁移、未更新独立VM预览，未做真实身份/原生浏览器验收。

本批起点引用（不改变原文）：

- `docs/product/2026-09-12-personal-workbench-completion-audit.md:16`：下一阅读器相关推荐/反链普通失败独立重试；收藏服务端操作精确结果及真实身份/原生验收仍开放。
- `docs/product/reader-favorite-recovery-evidence.md:24-26`：`reader-favorite-intent.ts` 的 id“不是服务端幂等键：现有 favorite API 未接收该 id，也没有按该 id 查询原操作结果的接口 … **本批不满足、也不宣称完成收藏的“服务端唯一操作编号＋同编号安全重试＋精确查询结果”**”。
- `docs/product/reader-favorite-recovery-evidence.md:41-43`：阅读器 related/backlinks 普通失败仍缺独立恢复入口；收藏服务端精确操作语义仍开放。
- `docs/product/reader-composite-read-lifecycle-evidence.md:37-42`：相关/反链普通局部失败的独立重试入口仍需继续审查；不能从既有读取用例推断其完成。

## 已实现

### G1 分节独立重试（`frontend/app.tsx`、`frontend/pages/knowledge-reader-page.tsx`、`frontend/lib/i18n.ts`）

- 阅读器 owner 由共享 `auxiliary: AbortController` 改为**每节独立**：`favorite`/`related`/`backlinks` 各持 `ReaderSection = { token, controller, settled }`；`retire()` 逐节取消，`denyRead()` 语义不变（401/403 仍整页撤权并清空面板）。
- 两个加载器抽成 `loadRelated(owner)`/`loadBacklinks(owner)`，主读取 `.then` 与重试共用；`owner[key] && !settled` 才是占用判定，所以同事件双击只发一次请求，而已经结束的分节仍可被 `retire()` 取消其传输。
- 每次尝试用自身 token/controller 判定存活（`sectionLive`）：迟到响应或被替换的 owner 都不能写回状态。重试只重新请求自己那一节，不重发正文、收藏 GET、diff，也不取消或阻塞仍在途的兄弟节。
- `KnowledgeReaderSessionPage` 新增可选 `onRetryRelated`/`onRetryBacklinks`，透传到两个面板；面板 `error` 分支渲染重试按钮（新增 `KNOWLEDGE_RELATED_RETRY`/`KNOWLEDGE_BACKLINKS_RETRY`，en/zh-CN 两份目录都有）。props 保持可选，`test/unit/frontend-a11y.test.tsx` 的静态渲染不受影响。

### G2 收藏操作编号与精确回执（迁移、`src/favorites/*`、`src/routes/library.ts`、前端）

- 新迁移 `0061_knowledge_favorite_operations.sql`：`knowledge_favorite_operation_receipts(member_id, operation_id, kind, request_hash, knowledge_item_id, claim_id, response_json, created_at)`，`PRIMARY KEY(member_id, operation_id)`，`claim_id` 唯一，`response_json` 受 `json_valid` 与 4096 字节约束；成员删除级联。
- 仓库在**同一批次**里认领操作、只在认领成功时施加效果、再读回胜出回执：同编号重试返回**原始回执**（无第二行、无第二次效果）；同编号换意图/目标（`request_hash` 不同）返回 `FAVORITE_OPERATION_CONFLICT` 409，不静默改写含义。新增 `operationResult` 不依赖存活的收藏行，也不分页。
- 路由：`PUT`/`DELETE /api/knowledge/:id/favorite` 都要求 `{operationId}`（严格键、边界校验）；`DELETE` 由 204 改为 200 携带回执（合法协议变更，见“断言更新”）。新增 `GET /api/knowledge/favorites/operations/:operationId`（成员作用域、无查询参数、非 GET 405）。
- 前端：本地意图 id 现在就是传输的操作编号（`setKnowledgeFavorite(id, desired, operationId)`）；`app.tsx` 的“未知”解析路径改走**精确操作查询**（`loadKnowledgeFavoriteOperation`），布尔 GET 只保留给初始读取。回执按精确键集合校验（编号/知识项/kind/结果/createdAt），畸形或错配一律 fail closed，保持未知并保留记录；不自动重发、重授权后不自动解锁。
- **重放不依赖存活状态**：只有真正认领编号的那次写入才要求存在存活收藏行；同一编号的重放**永不因存活状态失败**（不回 503、不臆造存活值），若存活边已被后续操作删除则响应省略 `favorite` 字段，只返回原回执。前端据此用回执的 `operation.favorited` 更新状态，并在 `favorite` 缺省时仍校验 5 键回执 fail closed。
- 领域账本同步：`shared/workbench-maturity-capabilities.ts` 的 `workbench-knowledge-reader` 记录补上精确查询路径与迁移 `0061`，`mutations` 中 PUT/DELETE 收藏文本改为“已有同编号重放回执本地证据、跨刷新/真实身份仍未证明”；`docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md` 用生成器重算（仅该行变化），`scripts/workbench-maturity-contract.test.mjs` 的 domain 症状与 `docs/product/workbench-product-maturity-gap-matrix.md` 的 remove-favorite 行症状同步更新（gap id、source、owner 结构不变）。

## 断言更新（为什么是合法替换而非削弱）

- `test/unit/frontend-reader-read-lifecycle.test.tsx`：旧用例用“布尔 GET 恰好等于意图”来落定未知写入（`keeps %s favorite results unknown until an explicit matching read`、`keeps a failed removal unknown and resolves only a false read`、`retains an unknown write …`、`a matching read retries cleanup only`）。这些用例**钉住的正是被本批判定为不成立的机制**，现改为：布尔 GET 不再被请求、也不能落定；只有精确操作回执能落定。各用例原有的不变量断言（写入次数 1、无自动重发、跨成员隔离、损坏记录 fail closed、迟到回执被忽略、401/403 撤权）**全部保留**。首次定点运行显示这些旧节点在旧机制下仍通过，改动后仍通过。
- `test/worker/favorites.test.ts`：`DELETE` 由 204 改为 200+回执（协议新增回执），`PUT`/`DELETE` 现在都必须带操作编号。原有“私有、按可读性、可移除、级联”断言保留并补齐回执形状。
- `test/worker/migrations.test.ts`：0060 用例原先用 `MIGRATIONS[MIGRATIONS.length - 1]` 与 `slice(0, -1)` 定位最后一条迁移；新增 0061 后改为**按名字定位**并以 `indexOf` 取“之前全部”迁移，断言强度不变（仍逐条执行 0060 语句两遍并核对受管字段不被覆盖）。
- `test/unit/favorites-service.test.ts`：服务签名新增操作编号；假仓库改为**同时校验 requestHash**（同编号不同 hash 抛 409），从而真实检验服务把“意图”冻结进 hash 且原样传参。
- `test/unit/frontend-reader-read-lifecycle.test.tsx` 的“每个附属读取都被 abort”断言在分节所有权下需要**保留已结束节的 controller 供撤权取消**（`settled` 标记），因此断言原样成立，未放宽。

## RED → GREEN

| 阶段 | 命令 | 观察到的结果 |
| --- | --- | --- |
| RED（先写测试，未改实现） | `npx vitest run test/unit/frontend-reader-read-lifecycle.test.tsx test/unit/frontend-knowledge-reader-data.test.ts test/unit/favorites-service.test.ts test/worker/favorites.test.ts test/worker/migrations.test.ts` | **5 文件失败，43 失败 / 86 通过（129）**，退出1；日志 `/private/tmp/red-1.txt` |
| GREEN（实现后同一命令） | 同上 | **5 文件通过，129/129**，退出0；日志 `/private/tmp/green-1.txt`（首次 10 失败后修正断言/保留 settled，最终 `/private/tmp/green-3.txt`） |
| 定点扩大（加入相邻文件） | `npx vitest run test/unit/frontend-reader-read-lifecycle.test.tsx test/unit/frontend-knowledge-reader-data.test.ts test/unit/frontend-knowledge-favorite-read.test.tsx test/unit/favorites-service.test.ts test/unit/frontend-a11y.test.tsx test/worker/favorites.test.ts test/worker/migrations.test.ts` | **7 文件通过，138/138**，退出0 |
| 新迁移字节 | `shasum -a 256 migrations/0061_knowledge_favorite_operations.sql` | `bf6d72c6558cced59e57e5dd17c01fc0c7a63a84ad705593b6056b36ee9b5b8f` |
| 复核修复轮 RED（先临时恢复旧的“存活状态缺失即 503”守卫） | `npx vitest run test/worker/favorites.test.ts test/unit/frontend-knowledge-reader-data.test.ts` | **2 失败 / 47 通过（49）**，退出1；失败项为 `replays a recorded operation number without reading live state`、`still refuses a first-claim write on an unreadable target without recording it`；日志 `/private/tmp/red-fix1.txt` |
| 复核修复轮 GREEN（恢复重放不依赖存活状态的守卫后同一命令） | 同上 | 49/49 通过 |

RED 失败项（原始输出摘要）：新迁移表不存在（`knowledge_favorite_operation_receipts` 无列/无对象）；操作查询与写回执不存在（404/未定义）；分节重试按钮不存在（`expected undefined to be defined`）；`mutationReply` 回执不含 operation 导致解析失败。

## 验证

- 新/改测试覆盖：分节重试只重发自身请求（按 pathname 计数，正文/收藏/diff 各 1 次）、兄弟仍在途时重试不被阻塞也不取消兄弟、同事件双击只发一次、重试中控件消失、被替换 owner 的迟到响应不回写（陈旧标题不出现）、分节重试 401/403 整页撤权；收藏同编号重试同一回执且仅一行、同编号换意图 409、精确查询不依赖存活收藏行且不分页、跨成员 404、畸形写入/不可读新增不落行、PUT/DELETE/GET 形状；客户端 fail-closed（204 无回执、错编号、错知识项、结果矛盾、未知 kind、多余字段、非字符串 createdAt、裸布尔、非布尔 favorite）。
- 迁移台账：`scripts/verify-m1-migrations.mjs` 与 `scripts/m1-release-contract.test.mjs` 追加 0061 哈希、`count=60`→`count=61`、未授权计数探针 `[52,59,60]`→`[52,59,60,61]`；历史 `migrations`（0001–0051）数组未动。
- 前端操作索引因新增/改动源码而重算（`node scripts/frontend-operation-inventory.mjs --write` → 271 文件 / 1188 候选；`--check` 通过）；该索引是源码账本，不是运行时验收。
- `npm run typecheck`（Worker+前端）退出0；`node scripts/verify-m1-migrations.mjs --files` 输出 `[pass] migration-files count=61`。
- 完整 `npm run check` **退出0**（复核修复后重跑），日志 `/private/tmp/check-3.txt`：`vendor:check`、`types:check`、Worker/前端/landing 类型检查、smoke 阶段 node 测试 79/13/30 全通过（含 `✔ pins the reviewed bytes of all forward migrations`、`[pass] i18n keys=434 placeholders=55 files=6`、`[pass] i18n-hardcoded-copy ast=typescript html=dom`）、unit **360 文件 5176/5176**、Worker **70 文件 1178/1178**、UI 构建 + 静态 VM 隔离、landing 验证 **97/97**、`[pass] build secret scan: frontend/dist`、`[pass] legacy UI rollback files retained`、Wrangler `--dry-run: exiting now.` 全部通过（dry-run 不是部署）；日志含既有 AI 绑定与工具更新提示，不声称零警告。注意：字面行 `[pass] migration-files count=61` 只在直接运行 `node scripts/verify-m1-migrations.mjs --files` 时输出，`npm run check` 日志中只有断言该计数的迁移字节契约测试通过，不含该字面行。
- 复核契约：`node --test scripts/workbench-maturity-contract.test.mjs` **15/15**、`node --test scripts/frontend-operation-inventory.test.mjs` **10/10**、`node scripts/workbench-domain-audit.mjs --check` 通过（`domain audit evidence is current`）；`frontend-operation-unassigned-review.md` 的 `frontend/app.tsx` 指纹随复核修复更新为 `31c198a76ae16baf6df5fcc876d6335c7353fe19ca3264f7554b563609b201da`，未归属候选仍 110/110 无增删。
- 复核修复后追加（门禁之后，只改测试文件）：`test/worker/favorites.test.ts` 的成员级联用例原先标题声称“成员删除级联”却只执行 `DELETE FROM knowledge_favorites`；现改为插入一次性成员行及其收藏边与回执行，执行 `DELETE FROM members WHERE id = …`，断言该成员的收藏边与回执行均因外键级联归零、另一成员的同两行保持不变。`npx vitest run test/worker/favorites.test.ts` **1 文件通过，11/11**；`npm run typecheck` 退出0；定点 7 文件仍 **141/141**。完整 `npm run check` 的结论以该文件改动前的 `/private/tmp/check-3.txt` 为准（该轮 unit 5176/5176、Worker 1178/1178，用例总数未变）。
- 领域账本随能力记录同步：`shared/workbench-maturity-capabilities.ts` 的 workbench-knowledge-reader 记录新增精确查询路径与迁移 `0061`，用 `node scripts/workbench-domain-audit.mjs --write docs/operations/evidence/2026-09-26-workbench-functional-domain-audit.md` 重算（diff 仅该行 1 行变化），`--check` 通过；`node --test scripts/workbench-maturity-contract.test.mjs` **15/15 通过**，gap matrix 的 remove-favorite 症状文本随之更新（结构与 id 不变）。
- 首次门禁运行（`/private/tmp/check-1.txt`）在 smoke 阶段失败，原始输出为 `AssertionError: re-review changed source: frontend/app.tsx` 与未归属候选列表错位；据此更新 `docs/product/frontend-operation-unassigned-review.md` 的 `frontend/app.tsx:814:250`→`:889:250` 行与 `frontend/app.tsx` 指纹，并重算操作索引，随后第二次完整门禁退出0（复核修复后又更新一次 `frontend/app.tsx` 指纹，见上）。未把首次失败记作通过。
- 工作树只含本批预期文件（`git status --porcelain`）：26 个已修改 + 2 个新增（新迁移与新证据文档），HEAD 仍为 `a7e16c100297e9a5621f8103d5236725d6531964`，无既有迁移被改动，无临时/探针文件；`node scripts/verify-m1-migrations.mjs --files` 通过，逐条校验 60 个既有迁移字节未变并新增 0061。

测试使用真实 App 路由/加载器/导航守卫，fetch 用 Response 夹具、markdown 用文本节点替身；**不是**原生浏览器、真实双身份、云端 D1 或生产验收。

## 未宣称完成（诚实边界）

- **未关闭任何父项**：范围仍 29、关闭 5、开放 24；本记录只是把“下一项”里的两项本地子项做成可核对的本地实现。
- 真实身份过滤→阅读→引用旅程仍待验：**D05/D06/D07/D08 全部仍开放**，A05/A06/B07 父项不关闭。
- 未 push、未部署、未做远程 D1 迁移、未更新独立 VM 验收预览；`wrangler deploy --dry-run` 不是部署。
- 收藏回执只证明**该操作编号记录的结果**，不代表当前收藏状态；未知写入仍须显式按编号查询（或初始读取）才能确定，不做自动重发。
- 本地意图记录仍是 tab 作用域，不是跨标签页锁、跨设备同步或备份。
- 原生浏览器/真实账号对分节重试与回执恢复路径的可操作性仍需验收。

## 下一项

- 收藏服务端操作的**跨刷新恢复**与离页边界的实际验收（当前仅内存 + tab 记录）。
- 阅读器 related/backlinks 之外的其余普通失败入口复核；笔记草稿保持不受本批影响。
- D05/D06/D07/D08 与真实身份/原生阅读旅程。

## 后续增量（2026-10-11，跨刷新/跨标签）

在上文“本地意图记录仍是 tab 作用域”的边界上继续本地实现：

- `frontend/lib/reader-favorite-intent.ts` 默认存储由 `window.sessionStorage` 改为 `window.localStorage`，键方案与记录形状不变，新增可选注入式存储端口并导出 `favoriteIntentKey`；**变更前的 sessionStorage-only 未决记录不迁移，故一次性不可见**，刻意不做旧格式兜底（尚无发布）。仍非跨设备备份、仍非锁。
- `frontend/app.tsx` 的 `KnowledgeReaderSession` 新增 `storage` 事件订阅（卸载移除）：仅响应本标签 localStorage、仅匹配本 member+target 记录键，另一标签预留→空闲标签采纳未决；另一标签清除记录且本标签未决→回 `idle` 并**只**重发布尔收藏 GET；写入中/退休/异成员/异目标/迟到信号一律忽略。**不**自动重发写、**不**除显式核对外的任何回执查询；布尔 GET 是读取，永不落定写入。
- 新增 `test/unit/frontend-reader-favorite-intent.test.ts`（**16 个执行用例**，9 个 `it` 声明含 2 个 `it.each`）及生命周期 **7 个执行用例**（6 个 `it` 声明，其中 `it.each(["member-b","knowledge-b"])` 展开 2 例；含“在途核对时记录被跨标签损坏不卡 blocked 且不丢未决意图”一例，用例名 `does not stick blocked or lose the unresolved intent when a cross-tab signal corrupts the record mid-check`）；首次 RED 25 失败/46 通过（`/private/tmp/red-fav-crosstab.log`），补测第 7 例后该例单独 RED 1 失败/55 跳过（`/private/tmp/red-fav-midcheck.log`），最终 GREEN 72/72（`/private/tmp/green-fav-crosstab.log`）。生命周期中原 **4 个既有 `it` 声明（5 处 `sessionStorage` 引用，含 `it.each` 展开 3 例 → 6 个执行用例）** 改为 `localStorage`（钉住被替换的介质），不变量逐条保留。
- **本地存储的隐私边界**：localStorage 不是加密，也不对同源恶意脚本、开发者工具或本机其他使用者保密；记录按 member+target 键命名，另一成员通过本应用读不到它，但**退出登录或切换成员不会清除该 key**——该 key 的唯一删除点是 `frontend/lib/reader-favorite-intent.ts` 的 `finishFavoriteIntent`，全前端无 `localStorage.clear`，无针对该 key 的登出/切换清理路径（与 `2026-09-13-member-scoped-submission-drafts-evidence.md` 同一存储边界口径）。
- 源码账本重算：`frontend-operation-inventory.{json,md}` → 271 文件/1189 候选，未归属仍 110；`frontend-operation-unassigned-review.md` 坐标 `889:250`→`923:250` 与 app.tsx 指纹同步。
- **诚实边界**：真实双标签页、真实身份/原生浏览器验收仍未证明；父项计数不变（29/5/24）。上文“下一项”的“跨刷新恢复实际验收”仍未取得原生证据，本增量只是把同源跨标签/跨刷新的本地可见性做成可核对的实现。
