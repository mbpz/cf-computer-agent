# A05 项目时间线编辑保护：本地证据

日期：2026-10-02。基线：`b66f757`。范围：A05 / R2-008 的已有内容编辑子项，不关闭父项。

## 本轮实现

- 时间线标题、正文、类型、开始/截止时间的未保存修改，在取消/Escape或普通导航时需确认；默认保留草稿，确认导航只在获准提交后清理。干净或恢复原值的表单无需确认。
- 草稿同步保存在ref；同事件输入→提交使用最新值并重新校验。保存即时防重，捕获的旧取消/编辑/保存回调不能绕过提交锁。保留CAS及未更改时间戳的精确值。
- pending/未知结果由路由级恢复标记阻止普通离页并提醒beforeunload；读回错误卸载编辑器后仍保护。显式GET恢复成功才解锁，不自动重放写入。
- 弹层默认保留焦点、确认后恢复编辑按钮焦点；过期确认/卸载后回调不提交写入。局部关闭文案明确不提交、不删除已保存条目，双语齐全。

## RED / GREEN 与边界

新增12个行为用例首次运行：12失败、原13通过（`/tmp/a05-timeline-editor-red.log`）。实现后新增用例全部通过，旧4个直接离开/取消预期与新保护冲突；更新为显式确认或明确强制卸载恢复，并保留写计数、迟到响应、标记隔离、GET-only恢复断言。

首轮五文件115/115通过。再增加4项：干净/还原草稿、Escape层级、局部确认期间捕获回调、卸载后旧回调；最终编辑测试29项，相对基线新增16项。最终合并回归：**41文件1069/1069通过**，不是全仓测试。

旧恢复测试首先断言正式导航返回blocked，之后才调用测试专用`forceRemountAppAt`。此夹具明确卸载再重挂载App、保留sessionStorage；不是生产绕行、不是原生刷新或强制离开验收。本轮Escape与beforeunload仅DOM事件测试，不是原生浏览器验收。

## 验证

- 受影响编辑器/恢复组件独立严格DOM类型检查通过。
- `npm run typecheck`、`npm run build:ui`（含VM隔离）通过。
- `npm run test:i18n`：13/13；`npm run verify:i18n`通过。
- 清单契约9/9、清单审计29范围内/5完成/24未关闭；`git diff --check`通过。
- 项目typecheck不等于全App严格DOM检查；上轮35条全App基线诊断不是本轮解决范围，不声明全前端严格类型无错。
- Vitest先在沙箱内因回环监听EPERM失败，获准后执行相同命令；环境失败不记为行为RED。测试启动的AI绑定警告不等于调用AI或生产证据。

临时日志：`/tmp/a05-timeline-editor-{red,green,targeted,final,types,project-types,build,i18n,i18n-static,checklist-tests,checklist}.log`，不纳入版本库。

### 复现

```sh
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/components/timeline-item-editor.tsx frontend/components/planning-write-recovery.tsx
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
  test/unit/frontend-workspace-navigation-gate.test.ts
```

## 未完成与下一步

A05、R2-008及导航计划Task 4仍开放。下一继续项目关联操作与其余页面的dirty/pending/重复点击/异步边界核查；真实身份、完整浏览器版本、原生键盘/触控等门禁未被本轮覆盖。本地下一步已获准，无外部阻塞。未push、部署、远端迁移或付费AI调用；预览与生产未变更。
