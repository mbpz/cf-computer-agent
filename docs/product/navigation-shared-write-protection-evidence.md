# A05 共享未决写入离页保护（本地）

日期：2026-10-02。基线 `126fd7a`；分支 `codex/functional-checklist-completion`。

## 缺口与实现

收件箱状态修改/转任务、日程取消已有持久恢复记录，但其路由尚未注册离页守卫；写入未决或读回失败时仍能提交导航。现将保护归属移至 usePlanningWriteRecovery，以同步记录引用判断是否阻止导航和 beforeunload，并在卸载时移除监听。

- 覆盖 INBOX、CALENDAR、GOALS、PROJECTS、TIMELINE；删除后三者重复的路由注册，保留原有保护。
- 同事件提交与离页被阻止；恢复记录损坏、保存失败、未知响应或失败 GET 都保持保护，空记录/已完成读回不阻塞正常离页。
- 新增9项真实App/happy-dom行为测试：收件箱5项、日程4项，覆盖同步锁、读回释放、失败恢复、恢复记录损坏及写前存储失败。存储失败零 PATCH/DELETE。
- 既有转任务及分页迟到写入用例改为先验证正式导航 blocked，再 forceRemountAppAt 强制重挂载，保留单次写入、迟到结果无刷新和 GET-only 恢复断言。未决操作不再被旧测试要求正常离页。
- 不更改确认框取消/纯读取离页策略，不改后端接口、版本 CAS、成员隔离、幂等或恢复重试语义。

## 验证过程

新增测试首次行为 RED：9失败、39旧测试通过。沙箱 EPERM 不是行为 RED，使用授权回环监听后得到上述结果。

定向绿色：5文件133/133。初轮日程恢复测试在恢复按钮仍禁用时发起第二次点击；修正为等待明确失败文案及按钮启用，再进行下一次显式 GET，最终无 React act 警告。

扩大回归初轮：43文件通过，1个旧收件箱分页用例仍要求未决写入时导航 committed。该用例改为先验证 blocked，再明确强制组件卸载，未削弱新守卫。

最终扩大回归：**44文件1144/1144通过**（非全仓）。清单契约9/9、审计29/5/24、git diff --check通过。

共享恢复组件独立严格 DOM 类型、项目 typecheck、build:ui/VM隔离、双语13/13与静态检查通过。不声称全仓测试或全App严格DOM类型无误。

## 复现

```sh
rtk proxy npx tsc --ignoreConfig --noEmit --strict --skipLibCheck --jsx react-jsx --module ESNext --moduleResolution bundler --target ES2022 --lib ES2023,DOM,DOM.Iterable --esModuleInterop --allowSyntheticDefaultImports frontend/components/planning-write-recovery.tsx
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
rtk proxy npx vitest run test/unit/frontend-admin-analytics-route.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-boards-route.test.tsx test/unit/frontend-calendar-cancel-confirmation.test.tsx test/unit/frontend-calendar-numbered-pages.test.tsx test/unit/frontend-calendar-write-journeys.test.tsx test/unit/frontend-create-form-navigation.test.tsx test/unit/frontend-cutover-contract.test.ts test/unit/frontend-discussion-route.test.tsx test/unit/frontend-focus-task-selection.test.tsx test/unit/frontend-goal-tasks.test.tsx test/unit/frontend-home-route.test.tsx test/unit/frontend-inbox-action-confirmation.test.tsx test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-promotion-recovery.test.tsx test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-logout.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-notifications-route.test.tsx test/unit/frontend-planning-conflicts.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-planning-create-reload.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-planning-status-confirmation.test.tsx test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-project-relations-reload.test.tsx test/unit/frontend-project-timeline-conflicts.test.tsx test/unit/frontend-project-timeline-recovery.test.tsx test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-route.test.tsx test/unit/frontend-timeline-edit.test.tsx test/unit/frontend-timeline-numbered-pages.test.tsx test/unit/frontend-timeline-reload.test.tsx test/unit/frontend-workspace-history-traversal.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-project-relations.test.tsx test/unit/frontend-project-relations-data.test.ts test/unit/frontend-goal-tasks-data.test.ts
```

## 完成边界与下一项

只关闭A05下共享记录保护的本地子项；A05/R2-008/Task 4整体仍开放。30原始、D08排除、29范围内、5完成、24未关闭。强制组件重挂载/合成 beforeunload 不是原生刷新或真实账号验收。未 push、发布、迁移或调用付费AI。

下一已定位：FocusRoute使用独立创建/状态变更恢复记录，尚未接入共享离页准入。应继续用开始/暂停/恢复/完成/放弃的pending、unknown、存储异常、强制卸载与纯GET边界测试推进；不把运行中的已确认专注会话等同未决写入，不无故阻止正常离开。
