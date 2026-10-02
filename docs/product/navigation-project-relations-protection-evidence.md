# A05 项目关联确认与未决写入离页保护（本地）

日期：2026-10-02。基线`5776cf0`，分支`codex/functional-checklist-completion`。

## 已实现

- 目标/任务的关联、解除关联均先打开共享ConfirmAction。显示项目、目标类型、目标标题、关联前后状态和准确影响：仅改变关联，不删除目标、不改目标状态或进度；解除后可重新关联。
- 默认聚焦取消；取消/Escape零写入、零恢复标记并恢复触发按钮焦点。确认绑定关系页对象、读取epoch和单次决定，旧确认/取消、旧行按钮及卸载后回调不能作用到新界面。
- 确认期间同步阻止关闭、切换类型/分页、重复操作与普通离页；实际写入及读回延续现有CAS/成员隔离标记。纯读取仍可离页，迟到读取不重建私有界面。
- ProjectsRoute自身持有未决写入导航及beforeunload守卫；关闭失败的关联编辑器不能绕过标记。该守卫同时覆盖同模块原有状态写入。显式GET核对成功后才释放，绝不自动重放POST/DELETE。
- 保留400明确拒绝、401/403/404清理边界、409冲突、超时/5xx未知状态、版本回退、摘要失败及标记存储失败的既有测试。

## RED → GREEN

首轮新增8项行为测试：8失败、17旧用例通过。实现后修复触发按钮焦点捕获；旧测试改为显式确认，未决写入导航预期改为blocked。补充Escape/旧取消、旧行跨类别、关闭同事件旧行回调、纯读取离页4项，新增合计12项。

旧恢复测试先断言正式导航被阻止，再显式使用forceRemountAppAt卸载/重挂载App，保留sessionStorage及迟到回调、GET-only恢复断言。这是强制组件生命周期夹具，不是允许生产绕行，也不是原生刷新/强制离开验收。GOALS原有导航行为未在本切片改变。

## 验证结果

- 定向6文件165/165；补充边界后最终合并回归 **43文件1110/1110通过**，不等于全仓测试。
- ProjectRelationsEditor独立严格DOM类型检查通过；初次发现useRef缺少显式undefined类型及初值，修复后重新通过。
- 项目typecheck、build:ui（含VM隔离）通过；双语13/13及静态检查通过。
- 清单契约9/9、审计29范围内/5完成/24未关闭，git diff --check通过。
- 项目typecheck不等于全App严格DOM检查；既有全App35条基线诊断不在本切片中解决，不声称全前端严格类型无错。
- Vitest沙箱首次回环监听EPERM，按授权执行同一测试命令；环境错误和初次测试语法错误均不计行为RED。AI绑定启动警告不代表调用AI服务。

### 复现

```sh
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/components/project-relations-editor.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy npx vitest run \
  test/unit/frontend-admin-analytics-route.test.tsx \
  test/unit/frontend-admin-pagination-routes.test.tsx \
  test/unit/frontend-agent-cancellation-route.test.tsx \
  test/unit/frontend-boards-route.test.tsx \
  test/unit/frontend-calendar-cancel-confirmation.test.tsx \
  test/unit/frontend-calendar-numbered-pages.test.tsx \
  test/unit/frontend-calendar-write-journeys.test.tsx \
  test/unit/frontend-create-form-navigation.test.tsx \
  test/unit/frontend-cutover-contract.test.ts \
  test/unit/frontend-discussion-route.test.tsx \
  test/unit/frontend-focus-task-selection.test.tsx \
  test/unit/frontend-goal-tasks.test.tsx \
  test/unit/frontend-home-route.test.tsx \
  test/unit/frontend-inbox-action-confirmation.test.tsx \
  test/unit/frontend-inbox-create.test.tsx \
  test/unit/frontend-inbox-numbered-pages.test.tsx \
  test/unit/frontend-inbox-promotion-recovery.test.tsx \
  test/unit/frontend-inbox-status-recovery.test.tsx \
  test/unit/frontend-logout.test.ts \
  test/unit/frontend-moderation-pagination-routes.test.tsx \
  test/unit/frontend-notifications-route.test.tsx \
  test/unit/frontend-planning-conflicts.test.tsx \
  test/unit/frontend-planning-create-recovery.test.tsx \
  test/unit/frontend-planning-create-reload.test.tsx \
  test/unit/frontend-planning-numbered-pages.test.tsx \
  test/unit/frontend-planning-status-confirmation.test.tsx \
  test/unit/frontend-planning-write-recovery.test.tsx \
  test/unit/frontend-project-relations-reload.test.tsx \
  test/unit/frontend-project-timeline-conflicts.test.tsx \
  test/unit/frontend-project-timeline-recovery.test.tsx \
  test/unit/frontend-reader-pagination-routes.test.tsx \
  test/unit/frontend-shell.test.tsx \
  test/unit/frontend-task-editor-route.test.tsx \
  test/unit/frontend-tasks-data.test.ts \
  test/unit/frontend-tasks-route.test.tsx \
  test/unit/frontend-timeline-edit.test.tsx \
  test/unit/frontend-timeline-numbered-pages.test.tsx \
  test/unit/frontend-timeline-reload.test.tsx \
  test/unit/frontend-workspace-history-traversal.test.ts \
  test/unit/frontend-workspace-location.test.tsx \
  test/unit/frontend-workspace-navigation-gate.test.ts \
  test/unit/frontend-project-relations.test.tsx \
  test/unit/frontend-project-relations-data.test.ts
```

日志`/tmp/a05-relations-confirm-{red,green,targeted2,final,types,project-types,build,i18n,i18n-static,checklist-tests,checklist}.log`仅本地临时证据，不纳入版本库。

## 仍开放

A05/R2-008和导航Task 4父项不关闭。下一继续目标任务关联及其余逐页dirty/pending/异步边界。本地可继续，无外部阻塞。真实身份、完整浏览器版本、原生键盘/触控等验收门禁未被本切片替代；未push、部署、远端迁移或付费AI调用，独立预览和生产不变。
