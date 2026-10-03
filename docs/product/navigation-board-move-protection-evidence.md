# 看板移动未决写入离页保护与未知结果核对（本地）

基线：`2385f04`，分支 `codex/functional-checklist-completion`。
归属：C02（看板未知写结果对账子项）、A05 / R2-008、导航计划 Task 4 逐页所有者核对。

## 发现的问题

- 看板状态移动在途时没有任何离页保护，侧栏导航、history 遍历和关闭页面均可直接放行。
- 移动失败一律回滚乐观卡片并立即允许其他操作，包括网络断开、5xx 和畸形回执。服务端 `setStatus` 在 CAS 成功后才写审计和通知，5xx 不能证明移动未生效；回滚后的卡片位置因此可能与服务端不符。

## 实际变更

- 失败分为两类：明确拒绝（4xx，408/429 除外）保持原有回滚和失败提示；结果未知（传输失败、5xx、408/429、回执不匹配）同样回滚显示，但保留冻结的“任务＋源状态＋目标状态”未决记录。
- 在途和未知期间，所有移动入口禁用，普通导航和 `beforeunload` 被阻止；只有本路由的只读列分页（含越界收敛 replace）以同步 owned 标记放行，保留既有“移动期间可翻页”的对账设计。
- 未知提示提供两种显式恢复，均不自动执行：
  - 核对结果：只读 GET `/api/tasks/:id`，按当前状态报告“已保存 / 未保存（仍在源状态）/ 已在别处更改为某状态 / 任务不可用（404）”，再重读四列权威数据并解锁。
  - 原样重试：重发同一任务、同一目标状态。服务端状态写为绝对值语义，重复提交同一目标直接返回当前任务；匹配回执才解锁，明确拒绝转为普通失败，仍未知则保持锁定。
- 核对或重试本身失败时保持锁定并提示；401/403 清空全部列及未决记录；路由卸载或撤权后的迟到结果被代次隔离。
- 守卫仅在锁定期间注册、在每个锁状态转换处同步更新，空闲看板继续使用普通浏览器 history 行为，同事件“移动后立即离页”也无法绕过。

## 验证

- 行为 RED：新增 11 项（在途离页 1、未知三类 3、核对失败/未保存 1、他处更改/404 1、原样重试 1、重试明确拒绝 1、核对撤权 2、卸载迟到 1）先失败，既有 28 项通过。
- 首轮实现后 4 项失败：其中 2 项为既有 raw `pushState`+`popstate` 用例，原因是常驻守卫使 history 运行时拒收未登记条目，改为仅锁定期间注册后恢复；另 2 项为测试夹具（翻页后不足两页、重读完成前断言），已修正夹具，未放宽断言。
- 原“500 回滚”用例改为 422 明确拒绝并增加解锁断言；原“在途期间外部 push”用例改为本列分页，外部离页改由新用例证明被阻止。
- `npx vitest run test/unit/frontend-boards-route.test.tsx test/unit/frontend-boards-page.test.tsx test/unit/workspace-dashboard.test.tsx test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts`：5 文件 122/122。
- `npx vitest run test/unit`：318 文件 4500/4500。
- `npm run typecheck`（Worker＋全前端严格）、`npm run build:ui`（含静态 VM 隔离）、`npm run test:i18n` 13/13、`npm run verify:i18n`、`npm run audit:functional-checklist`、`npm run audit:workbench-domain`、`npm run verify:workbench-maturity` 15/15 通过。
- `npm run inventory:frontend-operations` / `audit:frontend-operations`：239 文件、1035 静态候选（新增核对与重试两个按钮）。静态候选不是运行时验收。

## 边界及清单

未决记录只在当前挂载内存中保留，不跨刷新持久化；因此刷新会被 `beforeunload` 提醒，但用户坚持刷新后不恢复提示。跨标签并发冲突、原生浏览器键盘/触控和真实双身份旅程仍未验收。
主清单原 30，D08 排除，范围内 29，已关闭 5，开放 24；C02、A05/R2-008 与导航 Task 4 均不关闭。未 push、部署或远程迁移。
