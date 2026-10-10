# 图谱操作编号、同编号恢复与精确只读查询（本地）

2026-10-10；基线 `6c45b6b4`；分支 `codex/functional-checklist-completion`。归属 A02/A05、B09/C01、C04 的局部动作链路，不关闭父项。

## 交付行为

- 未决操作显示原操作编号；显式重试沿用原编号、原来源、原载荷。刷新当前标签页后恢复，不自动重发。
- 新增“查询精确结果”入口，只发 GET，不创建新编号、不扫描列表、不用“当前专注”推断旧操作成功。查询期间重复查询/重试互斥。
- 知识→任务：`GET /api/tasks/:id` 验证任务 ID、同任务/同知识关联、关联 ID 以及当前可见知识投影。没有关联或知识标题被授权投影为空，不宣称完成。
- 任务→专注：`GET /api/focus/:id` 验证 ID/clientKey/taskId。
- 项目→时间线、决策→行动项：`GET /api/projects/:projectId/timeline/:id` 验证 ID/clientKey/projectId。缺少项目上下文不猜测，不发请求。
- ID/项目路径编码；请求 no-store、same-origin credentials；页面卸载 abort 并忽略迟到响应。查询入口在图谱加载/错误/空态也可恢复已有操作。
- 查询 404、5xx、非法/异目标回执及持久记录清理失败均保留编号/记录和离开限制；仅完整匹配回执且持久清理成功才解锁。401/403 按既有撤权策略清屏，不把私有状态留在当前页面。

## 本轮审查缺陷与修复

旧页面把非 408/429 的 4xx 一律视作“没有保存”。知识任务的新原子创建虽正确返回 404（知识已不可见）或 409（任务已存在但初始关联缺失），这些状态仍可能发生在原请求已经落库之后。未决重试因此错误删除原操作记录，允许后续新编号创建。

现在只有首次明确校验拒绝可进入“没有保存”；首次 404/409 也不做该推断。未决重试的 400/404/409/422 保留原编号，可跨重挂载按原 ID 只读核对。安全退出/401/403 清屏边界保留，不能把清屏等同原写入失败。

## 新鲜验证

- 本轮新增六条页面 RED：6 失败 / 原30通过；均为操作记录被错误清空，不是导入/fixture错误。修复后图谱客户端、真实 React/happy-dom 页面、真实 Worker/D1 四文件 **92/92**。
- 扩展任务/图谱/时间线回归 **33 文件 540/540**。覆盖查询无 POST、同编号重试、查询错误保留、跨重挂载、撤权、存储异常、卸载中止与迟到响应。
- 四种动作的真实 dispatcher→Worker/D1 精确 GET 覆盖请求路径/身份、跨成员404；知识撤权后的 GET 不被当成完整成功。服务端原子性与同键并发/回滚既有回归保持通过。
- Worker/前端类型检查通过；i18n 合约 **13/13**、静态文案检查通过；UI 构建与 VM 静态模块图隔离检查通过（既有大 chunk 警告仍在）。
- 清单/成熟度/前端操作清点契约 **34/34** 通过，父项审计仍为29/5/24，diff检查通过。
- 前端操作索引重新生成并校验：270 源文件 / 1168 候选。静态清点不是运行时可见操作穷尽。

```sh
rtk proxy npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-graph-actions.test.ts test/worker/graph-actions.test.ts test/worker/tasks-create-atomicity.test.ts
rtk proxy npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/worker/*task*.test.ts test/worker/graph-actions.test.ts test/unit/project-timeline-service.test.ts
rtk proxy npm run typecheck
rtk proxy npm run verify:i18n
rtk proxy npm run test:i18n
rtk proxy npm run build:ui
rtk proxy npm run inventory:frontend-operations
rtk proxy npm run audit:frontend-operations
```

## 尚未证明的范围

这是一条可操作的本地恢复链，不是不可变历史操作账本。查询核对当前存活且有权读取的资源；已删除/隐藏或旧缺链任务无法据此证明原操作从未执行，也不会自动修复关联。sessionStorage 只保证当前标签页恢复，不承诺关闭浏览器后恢复。

未执行原生浏览器/双真实身份/移动键盘验收，未 push、部署、迁移或读取上传 SECRETS_FILE。测试使用本地 Worker/D1；配置的开发变量自动加载与 AI 绑定警告不作为线上运行证据。原30 / 范围29 / 关闭5 / 开放24，D08排除。


## 2026-10-10 后续审查：首次明确拒绝不能锁死导航

基线 `87ac81c8`。审查复现：另有 active/paused 专注时，图谱首次启动收到 `409 FOCUS_ALREADY_OPEN`。此前统一保留 409，导致精确查询返回404、同编号重试继续409，用户又无法导航到 `/focus` 结束已有会话。

- 仅为**首次请求**的精确 `409 + FOCUS_ALREADY_OPEN` 增加“未写入”例外。`FocusService.start` 在插入前返回此错误；本地 Worker/D1 两种 open 状态回归核对现有专注/日历行完全不变，新操作精确 GET 为404。
- React 路由回归验证删除持久未决记录、解除 beforeunload 与工作区导航锁、实际进入 `/focus`，重挂载不恢复旧操作或自动重发。
- 原请求结果已经未知时，即使同编号重试返回这个错误，也不推断原请求未落库。回归覆盖原载荷/编号与持久记录保留、重挂载无自动写、原 ID 精确 GET 匹配后才解锁。
- 状态为500而仅携带同名错误码仍保留未决状态；其他首次404/409与已有不确定重试仍遵循先前的保守规则。本次没有把所有409重新解释成失败，也没有变更服务端语义。
- 新增5项回归（页面3、真实Worker/D1 2）。修复前两文件 **1失败/47通过**，失败是首次明确拒绝仍显示未决操作；修复后 **48/48**。任务/图谱/专注/时间线扩大 **41文件673/673**，Worker及完整前端类型检查、前端操作清点与领域审计通过；清单/成熟度/交付/源码操作契约 **64/64**，UI构建和VM静态隔离检查通过。仍有运行器既有AI绑定及构建chunk警告；没有据此调用线上AI。

复跑：

```sh
rtk proxy npx vitest run test/unit/frontend-graph-page.test.tsx test/worker/graph-actions.test.ts
rtk proxy npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/unit/*focus*.test.ts test/unit/*focus*.test.tsx test/worker/*task*.test.ts test/worker/graph-actions.test.ts test/worker/focus.test.ts test/unit/project-timeline-service.test.ts
```

诊断日志为 `/private/tmp/cf-graph-first-rejection-red.log`、`/private/tmp/cf-graph-first-rejection-green.log`、`/private/tmp/cf-graph-first-rejection-expanded.log`。这次是 A05/C04 局部回归修复，父项仍29/5/24；不复用此前完整check为本次全量通过证明，不代替真实身份与原生验收。无push/部署/远程迁移。


## 2026-10-10 后续审查：撤权不丢未决编号、旧响应不能恢复私有图谱

基线 `9587036f`。本轮沿用现有恢复要求，修复代码审查已复现的两项 P2，不新增 API、迁移或永久操作账本。

- **未决查询/重试的 401/403**：只撤销私有页面状态并解除离页锁，原成员的 sessionStorage 意图逐字保留。此前 `releaseAction` 会连同编号一起删除；原写入可能已成功，后一次撤权不是其失败证明。
- **首次明确拒绝**仍清理该次未写入记录。记录清理失败也不阻止撤权清屏，不将它误报为写入完成。
- **重新授权后在同一组件恢复**：只有显式重试图谱且读取成功，才恢复原编号和操作锁；不自动 POST。随后只读核对仍使用原精确 ID。
- **旧图谱响应**：动作撤权时推进读取代次并 abort 当前请求。迟到成功或失败均不能覆盖 forbidden；测试使用不主动响应 abort 的延迟 loader，仍验证旧结果被丢弃。
- **图谱读取本身撤权**：追加两项反例发现恢复操作会留下不可解除的离页锁。现在 forbidden 同步清除内存中的动作/选择/回执、中止结果查询并释放锁，但不删除未决记录；重新读取授权通过后仍可恢复。

测试与结果：

1. 将上轮审查反例变为正式回归，纠正原有两条“撤权应删除未决记录”的错误断言。初轮 **6失败 / 42通过**；仅修复意图清理与重新授权恢复后 **2失败 / 46通过**，余下恰为迟到图谱响应；隔离读取后 **48/48**。
2. 追加图谱读取本身撤权：**2失败 / 48筛选跳过**，实际失败为导航仍 blocked；修复后扩大验证。另覆盖旧请求迟到失败分支，并验证请求 AbortSignal。
3. 最终页面 **52 项**（新增10项、修正既有2项）。图谱/收件箱/真实Worker任务原子性扩大 **19文件365/365**，Worker与前端类型检查通过；扩大日志没有 uncaught、Unhandled、window is not defined 或 act 警告。
4. 前端操作清点因源码位置/handler变化出现预期漂移，已明确重新生成并复查：**270源码 / 1171候选**，未增加API操作；领域审计与diff检查通过。静态清点不冒充运行时穷尽验收。
5. 本次完整 `npm run check` **exit 0**：单元 **356文件5011/5011**，Worker **69文件1161/1161**，类型、smoke/i18n/delivery、落地页校验、前端构建、产物秘密扫描及 Wrangler **dry-run** 均通过。Worker日志含3条负例异常，分别对应 publication purge 后不存在文件、损坏 pending note journal（两条）；相关测试通过，不能称日志零异常。此命令没有真实部署。
6. 清单/成熟度/交付状态/操作清点契约 **64/64**。完整门禁日志 `/private/tmp/graph-denial-full-check.log`，契约日志 `/private/tmp/graph-denial-contracts.log`。

复跑：

```sh
rtk proxy npx vitest run test/unit/frontend-graph-page.test.tsx
rtk proxy sh -c 'npx vitest run test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/unit/frontend-inbox-task-operation-matrix.test.tsx test/unit/frontend-inbox-promotion-recovery.test.tsx test/worker/graph-actions.test.ts test/worker/tasks-create-atomicity.test.ts test/worker/task-dependency-atomicity.test.ts test/worker/task-related-writes-atomicity.test.ts test/worker/task-subtask-ordering.test.ts'
rtk proxy npm run typecheck
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
```

本地诊断日志：`/private/tmp/graph-denial-red.log`、`/private/tmp/graph-denial-identity-step.log`、`/private/tmp/graph-denial-read-red.log`、`/private/tmp/graph-denial-regression.log`、`/private/tmp/graph-denial-types.log`。长期证据以此说明和可复跑测试为准。

父清单仍为原30、排除D08、范围29 / 完成5 / 剩余24；A02/A05/C04不因此整体关闭。真实身份原生旅程、其他领域功能和最终候选验收仍需完成。不推送、合并、部署或执行远程迁移；未读取/上传 SECRETS_FILE。
