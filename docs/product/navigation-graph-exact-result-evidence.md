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
