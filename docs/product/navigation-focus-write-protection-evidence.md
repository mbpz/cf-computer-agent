# A05 专注未决写入离页保护（本地）

日期：2026-10-02。基线 `507e594`；分支 `codex/functional-checklist-completion`。

## 实现与边界

FocusRoute 独立的开始/状态转换恢复记录此前未接离页准入。现注册路由级守卫与 beforeunload，使用同步意图引用和当前成员的持久记录判断未决状态，不以异步 React pending 状态替代写入事实。

- 开始 POST、转换 POST、回执确认后的 current GET 期间阻止普通导航；未知结果、损坏记录、存储无法读取、401/403 隐藏私有 UI 后仍保留保护。
- 记录意外消失时内存引用仍阻止误放行；只在原有回执/当前状态验证及记录清理完成后解除。
- 正常运行/暂停的已确认会话不锁导航；初始 GET、未产生写入意图的任务预检 GET 允许离开并中止请求；其他成员记录不锁当前成员。
- 注销/强制卸载不冒充普通导航。旧迟到响应/重挂载测试先断言正式导航被阻止，再显式 forceRemountAppAt；保留原有 GET-only 恢复、不自动重放、单次写入和迟到响应隔离断言。
- 不改变服务端授权、CAS、幂等、恢复重试或存储格式，不自动重试不确定写入。

## 验证过程

首次4项新增测试复现离页缺口。接守卫后发现旧测试使用 raw pushState+合成 popstate，不是应用正式导航命令；将 helper 改为 writeWorkspaceHistory，强制卸载独立表达。为避免测试修正造成伪绿，临时恢复 HEAD 的 app.tsx、对最终正式导航测试再次 RED：**6失败、55跳过**，均检出未注册守卫；随后恢复实现。

新增7项测试（6项缺陷回归、1项成员分区正向控制），同时增强现有拒绝访问、预检、未知响应、读取失败和迟到响应测试。

- 专注7文件 **156/156通过**。
- 扩大回归 **50文件1246/1246通过**（非全仓）；清单契约9/9、清单审计29/5/24、git diff --check通过。
- 项目 typecheck、build:ui/VM隔离、双语13/13与静态434keys/55placeholders/6files通过。
- 不声称全仓或全App独立严格DOM类型检查通过。合成 beforeunload 不是原生浏览器刷新/关闭验收。

## 复现

```sh
rtk proxy npx vitest run test/unit/frontend-focus-task-selection.test.tsx test/unit/frontend-focus-action-confirmation.test.tsx test/unit/frontend-focus-create-intent.test.ts test/unit/frontend-focus-data.test.ts test/unit/frontend-focus-page.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/frontend-focus-transition-intent.test.ts
rtk proxy npx vitest run test/unit/frontend-admin-analytics-route.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-agent-cancellation-route.test.tsx test/unit/frontend-boards-route.test.tsx test/unit/frontend-calendar-cancel-confirmation.test.tsx test/unit/frontend-calendar-numbered-pages.test.tsx test/unit/frontend-calendar-write-journeys.test.tsx test/unit/frontend-create-form-navigation.test.tsx test/unit/frontend-cutover-contract.test.ts test/unit/frontend-discussion-route.test.tsx test/unit/frontend-focus-task-selection.test.tsx test/unit/frontend-goal-tasks.test.tsx test/unit/frontend-home-route.test.tsx test/unit/frontend-inbox-action-confirmation.test.tsx test/unit/frontend-inbox-create.test.tsx test/unit/frontend-inbox-numbered-pages.test.tsx test/unit/frontend-inbox-promotion-recovery.test.tsx test/unit/frontend-inbox-status-recovery.test.tsx test/unit/frontend-logout.test.ts test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-notifications-route.test.tsx test/unit/frontend-planning-conflicts.test.tsx test/unit/frontend-planning-create-recovery.test.tsx test/unit/frontend-planning-create-reload.test.tsx test/unit/frontend-planning-numbered-pages.test.tsx test/unit/frontend-planning-status-confirmation.test.tsx test/unit/frontend-planning-write-recovery.test.tsx test/unit/frontend-project-relations-reload.test.tsx test/unit/frontend-project-timeline-conflicts.test.tsx test/unit/frontend-project-timeline-recovery.test.tsx test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-task-editor-route.test.tsx test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-route.test.tsx test/unit/frontend-timeline-edit.test.tsx test/unit/frontend-timeline-numbered-pages.test.tsx test/unit/frontend-timeline-reload.test.tsx test/unit/frontend-workspace-history-traversal.test.ts test/unit/frontend-workspace-location.test.tsx test/unit/frontend-workspace-navigation-gate.test.ts test/unit/frontend-project-relations.test.tsx test/unit/frontend-project-relations-data.test.ts test/unit/frontend-goal-tasks-data.test.ts test/unit/frontend-focus-action-confirmation.test.tsx test/unit/frontend-focus-create-intent.test.ts test/unit/frontend-focus-data.test.ts test/unit/frontend-focus-page.test.tsx test/unit/frontend-focus-scope.test.tsx test/unit/frontend-focus-transition-intent.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run test:i18n
rtk proxy npm run verify:i18n
rtk proxy node --test scripts/functional-checklist-audit.test.mjs
rtk proxy npm run audit:functional-checklist
```

## Checklist 与下一步

有效29项 / 已完成5项 / 剩余24项。此处仅完成 A05/R2-008 的专注未决写入子项，父项与计划 Task 4 保持开放。

逐页检查另发现 FocusPage 未提交标题/任务选择尚无草稿离页确认；下一步继续本地补齐此边界，不把未决写入守卫当成全表单保护。其他逐页与完整原生/身份验收也仍开放。没有外部阻塞，不需要为本地下一步重新确认；未 push、部署、远程迁移或调用付费AI。
