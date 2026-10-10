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
